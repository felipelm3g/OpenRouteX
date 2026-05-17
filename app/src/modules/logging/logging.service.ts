import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'zlib';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestLogEntity } from './request-log.entity';

@Injectable()
export class LoggingService {
  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly logRepo: Repository<RequestLogEntity>,
  ) {}

  private headerValue(headers: Record<string, string | string[]> | null | undefined, key: string) {
    if (!headers) return null;
    const lk = key.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lk) continue;
      if (Array.isArray(v)) return v.join(',');
      return String(v);
    }
    return null;
  }

  private redactHeaders(
    headers: Record<string, string | string[]>,
    extraSensitiveKeys?: string[],
  ): Record<string, string | string[]> {
    const baseSensitive = [
      'authorization',
      'proxy-authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'api-key',
    ];
    const sensitive = new Set(
      [...baseSensitive, ...(extraSensitiveKeys ?? [])]
        .map((h) => String(h ?? '').trim().toLowerCase())
        .filter(Boolean),
    );

    const out: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(headers ?? {})) {
      const lk = k.toLowerCase();
      if (sensitive.has(lk)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = v as any;
    }
    return out;
  }

  private redactBody(
    body: Buffer | null,
    headers: Record<string, string | string[]> | null | undefined,
  ): Buffer | null {
    if (!body) return null;

    const maxBytesRaw = Number(process.env.ORX_LOG_BODY_MAX_BYTES ?? '262144');
    const maxBytes = Number.isFinite(maxBytesRaw) ? Math.max(0, Math.min(10 * 1024 * 1024, maxBytesRaw)) : 262144;
    const truncated = maxBytes > 0 && body.length > maxBytes ? body.subarray(0, maxBytes) : body;

    const redactBodies = String(process.env.ORX_LOG_REDACT_BODIES ?? '').trim().toLowerCase() !== 'false';
    if (!redactBodies) return truncated;

    const contentType = (this.headerValue(headers, 'content-type') ?? '').toLowerCase();
    const asText = truncated.toString('utf8');

    const shouldRedactKey = (k: string) =>
      /pass(word)?|token|secret|api[_-]?key|client_secret|authorization|refresh_token|access_token/i.test(k);

    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(asText) as any;
        const walk = (v: any): any => {
          if (!v || typeof v !== 'object') return v;
          if (Array.isArray(v)) return v.map(walk);
          const out: Record<string, any> = {};
          for (const [k, val] of Object.entries(v)) {
            out[k] = shouldRedactKey(k) ? '[redacted]' : walk(val);
          }
          return out;
        };
        const redacted = JSON.stringify(walk(json));
        return Buffer.from(redacted, 'utf8');
      } catch {
        return truncated;
      }
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const params = new URLSearchParams(asText);
        for (const k of Array.from(params.keys())) {
          if (shouldRedactKey(k)) params.set(k, '[redacted]');
        }
        return Buffer.from(params.toString(), 'utf8');
      } catch {
        return truncated;
      }
    }

    return truncated;
  }

  async createBaseLog(params: {
    requestId: string;
    apiKey: string | null;
    apiSlug: string | null;
    publicPath: string | null;
    method: string;
    originalUrl: string;
    requestHeaders: Record<string, string | string[]>;
    requestBody: Buffer | null;
    redactHeaders?: string[];
  }) {
    const requestHeaders = this.redactHeaders(params.requestHeaders, params.redactHeaders);
    const requestBody = this.redactBody(params.requestBody, requestHeaders);
    const log = this.logRepo.create({
      requestId: params.requestId,
      apiKey: params.apiKey,
      apiSlug: params.apiSlug,
      publicPath: params.publicPath,
      method: params.method,
      originalUrl: params.originalUrl,
      requestHeaders,
      requestBody,
    });
    return this.logRepo.save(log);
  }

  async finalizeLog(id: string, params: {
    finalUrl: string | null;
    responseHeaders: Record<string, string | string[]>;
    responseBody: Buffer | null;
    statusCode: number | null;
    durationMs: number | null;
    redactHeaders?: string[];
  }) {
    const responseHeaders = this.redactHeaders(params.responseHeaders, params.redactHeaders);
    const responseBody = this.redactBody(params.responseBody, responseHeaders);
    await this.logRepo.update(
      { id },
      {
        finalUrl: params.finalUrl,
        responseHeaders,
        responseBody,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
        responseAt: new Date(),
      },
    );
  }

  async list(params?: {
    apiSlug?: string;
    apiKey?: string;
    publicPath?: string;
    statusCode?: number;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const limit = Math.min(200, Math.max(1, params?.limit ?? 50));

    const qb = this.logRepo.createQueryBuilder('l').orderBy('l.createdAt', 'DESC').limit(limit);
    if (params?.apiSlug) qb.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.apiKey) qb.andWhere('l.apiKey = :apiKey', { apiKey: params.apiKey });
    if (params?.publicPath) qb.andWhere('l.publicPath = :publicPath', { publicPath: params.publicPath });
    if (params?.statusCode) qb.andWhere('l.statusCode = :statusCode', { statusCode: params.statusCode });
    if (params?.from) qb.andWhere('l.createdAt >= :from', { from: params.from });
    if (params?.to) qb.andWhere('l.createdAt <= :to', { to: params.to });

    return qb.getMany();
  }

  async exportList(params?: {
    apiSlug?: string;
    apiKey?: string;
    publicPath?: string;
    status?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const limit = Math.min(5000, Math.max(1, params?.limit ?? 1000));
    const qb = this.logRepo.createQueryBuilder('l').orderBy('l.createdAt', 'DESC').limit(limit);
    if (params?.apiSlug) qb.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.apiKey) qb.andWhere('l.apiKey = :apiKey', { apiKey: params.apiKey });
    if (params?.publicPath) qb.andWhere('l.publicPath = :publicPath', { publicPath: params.publicPath });
    if (params?.from) qb.andWhere('l.createdAt >= :from', { from: params.from });
    if (params?.to) qb.andWhere('l.createdAt <= :to', { to: params.to });
    if (params?.status) {
      const s = String(params.status).toLowerCase();
      if (s === 'success') qb.andWhere('l.statusCode >= 200 AND l.statusCode < 300');
      if (s === 'error') qb.andWhere('(l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300)');
    }
    return qb
      .select([
        'l.id',
        'l.requestId',
        'l.apiKey',
        'l.apiSlug',
        'l.publicPath',
        'l.method',
        'l.originalUrl',
        'l.finalUrl',
        'l.statusCode',
        'l.durationMs',
        'l.createdAt',
        'l.responseAt',
      ])
      .getMany();
  }

  async meta(params?: {
    apiSlug?: string;
    publicPath?: string;
    from?: Date;
    to?: Date;
  }) {
    const base = this.logRepo.createQueryBuilder('l');
    if (params?.from) base.andWhere('l.createdAt >= :from', { from: params.from });
    if (params?.to) base.andWhere('l.createdAt <= :to', { to: params.to });
    if (params?.apiSlug) base.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.publicPath) base.andWhere('l.publicPath = :publicPath', { publicPath: params.publicPath });

    const apiSlugs = await base
      .clone()
      .select('l.apiSlug', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('l.apiSlug IS NOT NULL')
      .groupBy('l.apiSlug')
      .orderBy('count', 'DESC')
      .getRawMany<{ value: string; count: string }>();

    const paths = await base
      .clone()
      .select('l.publicPath', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('l.publicPath IS NOT NULL')
      .groupBy('l.publicPath')
      .orderBy('count', 'DESC')
      .getRawMany<{ value: string; count: string }>();

    const statuses = await base
      .clone()
      .select('l.statusCode', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('l.statusCode IS NOT NULL')
      .groupBy('l.statusCode')
      .orderBy('l.statusCode', 'ASC')
      .getRawMany<{ value: number; count: string }>();

    return {
      apiSlugs: apiSlugs.map((r: { value: string; count: string }) => ({ value: r.value, count: Number(r.count) })),
      paths: paths.map((r: { value: string; count: string }) => ({ value: r.value, count: Number(r.count) })),
      statuses: statuses.map((r: { value: number; count: string }) => ({ value: Number(r.value), count: Number(r.count) })),
    };
  }

  async get(id: string) {
    const row = await this.logRepo.findOne({ where: { id } });
    if (!row) return null;

    const maybeDecompress = (b: Buffer, headers: Record<string, string | string[]> | null | undefined) => {
      const enc = (this.headerValue(headers, 'content-encoding') ?? '').toLowerCase();
      if (!enc) return b;
      try {
        if (enc.includes('gzip')) return gunzipSync(b);
        if (enc.includes('br')) return brotliDecompressSync(b);
        if (enc.includes('deflate')) {
          try {
            return inflateSync(b);
          } catch {
            return inflateRawSync(b);
          }
        }
      } catch {
        return b;
      }
      return b;
    };

    const isProbablyText = (b: Buffer) => {
      if (b.length === 0) return true;
      let bad = 0;
      for (let i = 0; i < b.length; i += 1) {
        const c = b[i]!;
        if (c === 0) return false;
        const isBad = (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127;
        if (isBad) bad += 1;
      }
      return bad / b.length < 0.02;
    };

    const toDisplayText = (
      b: Buffer | null,
      headers: Record<string, string | string[]> | null | undefined,
    ) => {
      if (!b) return null;
      if (b.length === 0) return '';
      if (b.length > 256 * 1024) return `[binary payload truncated: ${b.length} bytes]`;
      const buf = maybeDecompress(b, headers);
      const contentType = (this.headerValue(headers, 'content-type') ?? '').toLowerCase();
      const wantsText =
        contentType.includes('application/json') ||
        contentType.includes('text/') ||
        contentType.includes('application/xml') ||
        contentType.includes('application/xhtml+xml') ||
        contentType.includes('application/x-www-form-urlencoded');

      if (!wantsText && !isProbablyText(buf)) {
        const enc = this.headerValue(headers, 'content-encoding');
        return `[binary payload: ${buf.length} bytes${enc ? `, content-encoding=${enc}` : ''}]`;
      }

      const txt = buf.toString('utf8');
      return txt;
    };

    return {
      ...row,
      requestBody: toDisplayText(row.requestBody, row.requestHeaders),
      responseBody: toDisplayText(row.responseBody, row.responseHeaders),
    };
  }

  async metrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const total = await this.logRepo
      .createQueryBuilder('l')
      .where('l.createdAt >= :since', { since })
      .getCount();

    const errors = await this.logRepo
      .createQueryBuilder('l')
      .where('l.createdAt >= :since', { since })
      .andWhere(
        '(l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300)',
      )
      .getCount();

    const latencyRow = await this.logRepo
      .createQueryBuilder('l')
      .select('AVG(l.durationMs)', 'avg')
      .addSelect('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l.durationMs)', 'p95')
      .where('l.createdAt >= :since', { since })
      .andWhere('l.durationMs IS NOT NULL')
      .getRawOne<{ avg: string | null; p95: string | null }>();

    const topApis = await this.logRepo
      .createQueryBuilder('l')
      .select('l.apiSlug', 'apiSlug')
      .addSelect('COUNT(*)', 'requests')
      .where('l.createdAt >= :since', { since })
      .andWhere('l.apiSlug IS NOT NULL')
      .groupBy('l.apiSlug')
      .orderBy('requests', 'DESC')
      .limit(8)
      .getRawMany<{ apiSlug: string; requests: string }>();

    return {
      windowHours: 24,
      totalRequests: total,
      errorRequests: errors,
      avgLatencyMs: latencyRow?.avg ? Math.round(Number(latencyRow.avg)) : null,
      p95LatencyMs: latencyRow?.p95 ? Math.round(Number(latencyRow.p95)) : null,
      topApis: topApis.map((r: { apiSlug: string; requests: string }) => ({
        apiSlug: r.apiSlug,
        requests: Number(r.requests),
      })),
    };
  }
}
