import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'zlib';

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestLogEntity } from './request-log.entity';

@Injectable()
export class LoggingService {
  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly logRepo: Repository<RequestLogEntity>,
  ) {}

  private normalizePublicPath(input: string): string {
    const s = String(input ?? '').trim();
    if (!s) return '/';
    const withLeading = s.startsWith('/') ? s : `/${s}`;
    const noTrailing = withLeading.replace(/\/+$/, '');
    return noTrailing || '/';
  }

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private publicPathExactToRegex(path: string, opts?: { allowMissingLeadingSlash?: boolean; allowTrailingSlash?: boolean }): string {
    const normalized = this.normalizePublicPath(path);
    const allowMissingLeadingSlash = opts?.allowMissingLeadingSlash === true;
    const allowTrailingSlash = opts?.allowTrailingSlash === true;

    if (normalized === '/') return '^/?$';

    const body = normalized.startsWith('/') ? normalized.slice(1) : normalized;
    return `^${allowMissingLeadingSlash ? '/?' : '/'}${this.escapeRegex(body)}${allowTrailingSlash ? '\\/?' : ''}$`;
  }

  private publicPathTemplateToRegex(
    template: string,
    opts?: { allowMissingLeadingSlash?: boolean; allowTrailingSlash?: boolean },
  ): string {
    const normalized = this.normalizePublicPath(template);
    const allowMissingLeadingSlash = opts?.allowMissingLeadingSlash === true;
    const allowTrailingSlash = opts?.allowTrailingSlash === true;

    const hasBraces = normalized.includes('{') && normalized.includes('}');
    const hasStars = normalized.includes('*');
    if (!hasBraces && !hasStars) return this.publicPathExactToRegex(normalized, opts);

    if (normalized === '/') return '^/?$';

    let pattern = '^';
    let i = 0;
    if (allowMissingLeadingSlash) {
      if (normalized.startsWith('/')) {
        pattern += '/?';
        i = 1;
      }
    }

    while (i < normalized.length) {
      const ch = normalized[i]!;
      if (ch === '{') {
        const end = normalized.indexOf('}', i + 1);
        if (end === -1) {
          pattern += this.escapeRegex(ch);
          i += 1;
          continue;
        }
        pattern += '([^/]+)';
        i = end + 1;
        continue;
      }
      if (ch === '*') {
        pattern += '([^/]+)';
        i += 1;
        continue;
      }
      pattern += this.escapeRegex(ch);
      i += 1;
    }
    pattern += allowTrailingSlash ? '\\/?$' : '$';
    return pattern;
  }

  private applyPublicPathFilter(qb: ReturnType<Repository<RequestLogEntity>['createQueryBuilder']>, raw: string) {
    const normalized = this.normalizePublicPath(raw);
    const isTemplate = normalized.includes('{') || normalized.includes('*');
    const publicPathRe = isTemplate
      ? this.publicPathTemplateToRegex(normalized, { allowMissingLeadingSlash: true, allowTrailingSlash: true })
      : this.publicPathExactToRegex(normalized, { allowMissingLeadingSlash: true, allowTrailingSlash: true });
    qb.andWhere('l.publicPath ~ :publicPathRe', { publicPathRe });
  }

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

  async purgeAllLogs(confirm: string) {
    const c = String(confirm ?? '').trim();
    if (c !== 'DELETE') {
      throw new BadRequestException('Confirmação inválida. Digite DELETE (maiúsculo) para limpar os logs.');
    }
    await this.logRepo.query('TRUNCATE TABLE request_logs');
    return { ok: true };
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
    if (params?.publicPath) this.applyPublicPathFilter(qb, params.publicPath);
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
    if (params?.publicPath) this.applyPublicPathFilter(qb, params.publicPath);
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

  async endpointReport(params?: {
    apiSlug?: string;
    publicPath?: string;
    method?: string;
    statusCode?: number;
    status?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const limit = Math.min(500, Math.max(1, params?.limit ?? 100));

    const qb = this.logRepo.createQueryBuilder('l');
    if (params?.from) qb.andWhere('l.createdAt >= :from', { from: params.from });
    if (params?.to) qb.andWhere('l.createdAt <= :to', { to: params.to });
    if (params?.apiSlug) qb.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.publicPath) this.applyPublicPathFilter(qb, params.publicPath);
    if (params?.method) qb.andWhere('l.method = :method', { method: params.method });
    if (params?.statusCode) qb.andWhere('l.statusCode = :statusCode', { statusCode: params.statusCode });
    if (params?.status) {
      const s = String(params.status).toLowerCase();
      if (s === 'success') qb.andWhere('l.statusCode >= 200 AND l.statusCode < 300');
      if (s === 'error') qb.andWhere('(l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300)');
    }

    const rows = await qb
      .select('l.apiSlug', 'apiSlug')
      .addSelect('l.publicPath', 'publicPath')
      .addSelect('l.method', 'method')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN l.statusCode >= 200 AND l.statusCode < 300 THEN 1 ELSE 0 END)',
        'success',
      )
      .addSelect(
        'SUM(CASE WHEN l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300 THEN 1 ELSE 0 END)',
        'error',
      )
      .addSelect('AVG(l.durationMs)', 'avg')
      .addSelect('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l.durationMs)', 'p95')
      .andWhere('l.apiSlug IS NOT NULL')
      .andWhere('l.publicPath IS NOT NULL')
      .groupBy('l.apiSlug')
      .addGroupBy('l.publicPath')
      .addGroupBy('l.method')
      .orderBy('total', 'DESC')
      .limit(limit)
      .getRawMany<{
        apiSlug: string;
        publicPath: string;
        method: string;
        total: string;
        success: string;
        error: string;
        avg: string | null;
        p95: string | null;
      }>();

    return rows.map((r: {
      apiSlug: string;
      publicPath: string;
      method: string;
      total: string;
      success: string;
      error: string;
      avg: string | null;
      p95: string | null;
    }) => ({
      apiSlug: String(r.apiSlug),
      publicPath: String(r.publicPath),
      method: String(r.method),
      total: Number(r.total ?? 0),
      success: Number(r.success ?? 0),
      error: Number(r.error ?? 0),
      avgLatencyMs: r.avg === null ? null : Math.round(Number(r.avg)),
      p95LatencyMs: r.p95 === null ? null : Math.round(Number(r.p95)),
    }));
  }

  async heatmap(params?: {
    apiSlug?: string;
    publicPath?: string;
    from?: Date;
    to?: Date;
    timezone?: string;
  }) {
    const tzRaw = String(params?.timezone ?? 'UTC').trim();
    const tz = /^[A-Za-z0-9_/+-]{1,64}$/.test(tzRaw) ? tzRaw : 'UTC';

    const qb = this.logRepo.createQueryBuilder('l');
    if (params?.from) qb.andWhere('l.createdAt >= :from', { from: params.from });
    if (params?.to) qb.andWhere('l.createdAt <= :to', { to: params.to });
    if (params?.apiSlug) qb.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.publicPath) this.applyPublicPathFilter(qb, params.publicPath);

    const dowExpr = "EXTRACT(DOW FROM (l.createdAt AT TIME ZONE :tz))::int";
    const hourExpr = "EXTRACT(HOUR FROM (l.createdAt AT TIME ZONE :tz))::int";

    const rows = await qb
      .select(dowExpr, 'dow')
      .addSelect(hourExpr, 'hour')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300 THEN 1 ELSE 0 END)',
        'errors',
      )
      .andWhere('l.createdAt IS NOT NULL')
      .setParameter('tz', tz)
      .groupBy(dowExpr)
      .addGroupBy(hourExpr)
      .orderBy('dow', 'ASC')
      .addOrderBy('hour', 'ASC')
      .getRawMany<{ dow: number; hour: number; total: string; errors: string }>();

    return rows.map((r: { dow: number; hour: number; total: string; errors: string }) => ({
      dow: Number(r.dow),
      hour: Number(r.hour),
      total: Number(r.total ?? 0),
      errors: Number(r.errors ?? 0),
    }));
  }

  async meta(params?: {
    apiSlug?: string;
    publicPath?: string;
    statusCode?: number;
    status?: string;
    from?: Date;
    to?: Date;
  }) {
    const base = this.logRepo.createQueryBuilder('l');
    if (params?.from) base.andWhere('l.createdAt >= :from', { from: params.from });
    if (params?.to) base.andWhere('l.createdAt <= :to', { to: params.to });
    if (params?.apiSlug) base.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.publicPath) this.applyPublicPathFilter(base, params.publicPath);
    if (params?.statusCode) base.andWhere('l.statusCode = :statusCode', { statusCode: params.statusCode });
    if (params?.status) {
      const s = String(params.status).toLowerCase();
      if (s === 'success') base.andWhere('l.statusCode >= 200 AND l.statusCode < 300');
      if (s === 'error') base.andWhere('(l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300)');
    }

    const apiSlugs = await base
      .clone()
      .select('l.apiSlug', 'value')
      .addSelect('COUNT(*)', 'count')
      .andWhere('l.apiSlug IS NOT NULL')
      .groupBy('l.apiSlug')
      .orderBy('count', 'DESC')
      .getRawMany<{ value: string; count: string }>();

    const paths = await base
      .clone()
      .select('l.publicPath', 'value')
      .addSelect('COUNT(*)', 'count')
      .andWhere('l.publicPath IS NOT NULL')
      .groupBy('l.publicPath')
      .orderBy('count', 'DESC')
      .getRawMany<{ value: string; count: string }>();

    const statuses = await base
      .clone()
      .select('l.statusCode', 'value')
      .addSelect('COUNT(*)', 'count')
      .andWhere('l.statusCode IS NOT NULL')
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
        contentType.includes('+json') ||
        contentType.includes('text/') ||
        contentType.includes('application/xml') ||
        contentType.includes('text/xml') ||
        contentType.includes('+xml') ||
        contentType.includes('application/xhtml+xml') ||
        contentType.includes('application/x-www-form-urlencoded');

      if (!wantsText && !isProbablyText(buf)) {
        const enc = this.headerValue(headers, 'content-encoding');
        return `[binary payload: ${buf.length} bytes${enc ? `, content-encoding=${enc}` : ''}]`;
      }

      const prettyJson = (txt: string) => {
        try {
          const parsed = JSON.parse(txt) as unknown;
          return JSON.stringify(parsed, null, 2);
        } catch {
          return txt;
        }
      };

      const prettyXml = (txt: string) => {
        const raw = String(txt ?? '').trim();
        if (!raw) return raw;
        const normalized = raw.replace(/>\s*</g, '>\n<');
        const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
        let indent = 0;
        const out: string[] = [];

        for (const line of lines) {
          const isDecl = line.startsWith('<?') || line.startsWith('<!');
          const isClosing = line.startsWith('</');
          const isSelfClosing = /\/>\s*$/.test(line);
          const isOpenTag =
            !isDecl &&
            !isClosing &&
            line.startsWith('<') &&
            line.endsWith('>') &&
            !isSelfClosing &&
            !line.includes('</');

          if (isClosing) indent = Math.max(0, indent - 1);
          out.push(`${'  '.repeat(indent)}${line}`);
          if (isOpenTag) indent += 1;
        }

        return out.join('\n');
      };

      const txt = buf.toString('utf8');
      if (contentType.includes('json')) return prettyJson(txt);
      if (contentType.includes('xml')) return prettyXml(txt);
      return txt;
    };

    return {
      ...row,
      requestBody: toDisplayText(row.requestBody, row.requestHeaders),
      responseBody: toDisplayText(row.responseBody, row.responseHeaders),
    };
  }

  async metrics() {
    return this.metricsFiltered();
  }

  async metricsFiltered(params?: {
    apiSlug?: string;
    publicPath?: string;
    statusCode?: number;
    status?: string;
    from?: Date;
    to?: Date;
  }) {
    const now = Date.now();
    const from = params?.from ?? new Date(now - 24 * 60 * 60 * 1000);
    const to = params?.to ?? new Date(now);

    const base = this.logRepo.createQueryBuilder('l');
    base.where('l.createdAt >= :from', { from });
    base.andWhere('l.createdAt <= :to', { to });
    if (params?.apiSlug) base.andWhere('l.apiSlug = :apiSlug', { apiSlug: params.apiSlug });
    if (params?.publicPath) this.applyPublicPathFilter(base, params.publicPath);
    if (params?.statusCode) base.andWhere('l.statusCode = :statusCode', { statusCode: params.statusCode });
    if (params?.status) {
      const s = String(params.status).toLowerCase();
      if (s === 'success') base.andWhere('l.statusCode >= 200 AND l.statusCode < 300');
      if (s === 'error') base.andWhere('(l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300)');
    }

    const total = await base.clone().getCount();

    const errors = await base
      .clone()
      .andWhere('(l.statusCode IS NULL OR l.statusCode < 200 OR l.statusCode >= 300)')
      .getCount();

    const latencyRow = await base
      .clone()
      .select('AVG(l.durationMs)', 'avg')
      .addSelect('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l.durationMs)', 'p95')
      .andWhere('l.durationMs IS NOT NULL')
      .getRawOne<{ avg: string | null; p95: string | null }>();

    const topApis = await base
      .clone()
      .select('l.apiSlug', 'apiSlug')
      .addSelect('COUNT(*)', 'requests')
      .andWhere('l.apiSlug IS NOT NULL')
      .groupBy('l.apiSlug')
      .orderBy('requests', 'DESC')
      .limit(8)
      .getRawMany<{ apiSlug: string; requests: string }>();

    return {
      windowHours: Math.max(0, Math.round(((to.getTime() - from.getTime()) / (60 * 60 * 1000)) * 10) / 10),
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
