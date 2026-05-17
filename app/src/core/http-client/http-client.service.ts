import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
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
