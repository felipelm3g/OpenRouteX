import { lookup as dnsLookup } from 'dns/promises';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import * as net from 'net';
import { URL } from 'url';

import { Injectable } from '@nestjs/common';

export type HttpResponse = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
};

export class UpstreamTimeoutError extends Error {
  code = 'UPSTREAM_TIMEOUT';
  constructor() {
    super('upstream_timeout');
    this.name = 'UpstreamTimeoutError';
  }
}

@Injectable()
export class HttpClientService {
  private parseCsv(value: string | undefined): string[] {
    return String(value ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }

  private hostMatchesRule(host: string, rule: string): boolean {
    const h = host.toLowerCase();
    const r = rule.toLowerCase();
    if (!h || !r) return false;
    if (r === h) return true;
    if (r.startsWith('*.')) {
      const suffix = r.slice(1);
      return h.endsWith(suffix) && h !== r.slice(2);
    }
    return false;
  }

  private isPrivateIp(address: string): boolean {
    const a = String(address ?? '').trim().toLowerCase();
    if (!a) return true;

    if (a.startsWith('::ffff:')) {
      const mapped = a.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return this.isPrivateIp(mapped);
    }

    const ipVer = net.isIP(a);
    if (ipVer === 4) {
      const parts = a.split('.').map((x) => Number(x));
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
      const [p0, p1] = parts;
      const first = p0 ?? 0;
      const second = p1 ?? 0;

      if (first === 0) return true;
      if (first === 10) return true;
      if (first === 127) return true;
      if (first === 169 && second === 254) return true;
      if (first === 172 && second >= 16 && second <= 31) return true;
      if (first === 192 && second === 168) return true;
      if (first === 100 && second >= 64 && second <= 127) return true;
      if (first >= 224) return true;
      return false;
    }

    if (ipVer === 6) {
      if (a === '::' || a === '::1') return true;
      if (a.startsWith('fe80:')) return true;
      if (a.startsWith('fc') || a.startsWith('fd')) return true;
      return false;
    }

    return true;
  }

  private async assertSafeUrl(urlObj: URL) {
    const protocol = String(urlObj.protocol ?? '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error('blocked_upstream_protocol');
    }
    if (urlObj.username || urlObj.password) {
      throw new Error('blocked_upstream_userinfo');
    }

    const hostname = String(urlObj.hostname ?? '').trim().toLowerCase();
    if (!hostname) throw new Error('blocked_upstream_host');

    const allowPrivate =
      String(process.env.ORX_ALLOW_PRIVATE_NETWORKS ?? '').trim().toLowerCase() === 'true';

    if (!allowPrivate) {
      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error('blocked_upstream_private_host');
      }
    }

    const allowHosts = this.parseCsv(process.env.ORX_ALLOWED_UPSTREAM_HOSTS);
    if (allowHosts.length > 0) {
      const ok = allowHosts.some((rule) => this.hostMatchesRule(hostname, rule));
      if (!ok) throw new Error('blocked_upstream_not_allowed');
    }

    const blockedHosts = this.parseCsv(process.env.ORX_BLOCKED_UPSTREAM_HOSTS);
    if (blockedHosts.length > 0) {
      const isBlocked = blockedHosts.some((rule) => this.hostMatchesRule(hostname, rule));
      if (isBlocked) throw new Error('blocked_upstream_denied');
    }

    const port = urlObj.port
      ? Number(urlObj.port)
      : protocol === 'https:'
        ? 443
        : 80;
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error('blocked_upstream_port');
    }
    const allowedPorts = this.parseCsv(process.env.ORX_ALLOWED_UPSTREAM_PORTS)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535);
    if (allowedPorts.length > 0 && !allowedPorts.includes(port)) {
      throw new Error('blocked_upstream_port_not_allowed');
    }

    if (allowPrivate) return;

    if (net.isIP(hostname)) {
      if (this.isPrivateIp(hostname)) throw new Error('blocked_upstream_private_ip');
      return;
    }

    const addrs = await dnsLookup(hostname, { all: true, verbatim: true });
    if (!addrs || addrs.length === 0) throw new Error('blocked_upstream_dns');
    for (const item of addrs) {
      const addr = String((item as any)?.address ?? '').trim();
      if (this.isPrivateIp(addr)) throw new Error('blocked_upstream_private_ip');
    }
  }

  async send(params: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: Buffer | null;
    timeoutMs: number;
    tls?: {
      cert?: string;
      key?: string;
      pfx?: Buffer;
      passphrase?: string;
      ca?: string;
    } | null;
  }): Promise<HttpResponse> {
    const urlObj = new URL(params.url);
    await this.assertSafeUrl(urlObj);
    const isHttps = urlObj.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;

    return new Promise<HttpResponse>((resolve, reject) => {
      const req = reqFn(
        {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          port: urlObj.port ? Number(urlObj.port) : isHttps ? 443 : 80,
          path: `${urlObj.pathname}${urlObj.search}`,
          method: params.method,
          headers: params.headers,
          timeout: params.timeoutMs,
          ...(isHttps && params.tls ? params.tls : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 502,
              headers: (res.headers as any) ?? {},
              body: Buffer.concat(chunks),
            });
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new UpstreamTimeoutError());
      });
      req.on('error', (err) => reject(err));

      if (params.body && params.body.length > 0) req.write(params.body);
      req.end();
    });
  }
}
