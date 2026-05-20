import { randomUUID } from 'crypto';

import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response } from 'express';

import { UpstreamTimeoutError } from '../../core/http-client/http-client.service';
import { RequestEngineService } from '../../core/request-engine/request-engine.service';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { ApisService } from '../apis/apis.service';
import { AuthService } from '../auth/auth.service';
import { CertificatesService } from '../certificates/certificates.service';
import { LoggingService } from '../logging/logging.service';
import { PathsService } from '../paths/paths.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { SettingsService } from '../settings/settings.service';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function toSingleHeaderMap(headers: Request['headers']): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    if (v === null) continue;
    out[k] = v as any;
  }
  return out;
}

function normalizeOutgoingHeaders(
  headers: Request['headers'],
  blocked: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!k) continue;
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key) || blocked.has(key)) continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) out[k] = v.join(',');
    else out[k] = String(v);
  }
  return out;
}

@Injectable()
export class ProxyService {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly apis: ApisService,
    private readonly paths: PathsService,
    private readonly auths: AuthService,
    private readonly certs: CertificatesService,
    private readonly requestEngine: RequestEngineService,
    private readonly logs: LoggingService,
    private readonly rateLimit: RateLimitService,
    private readonly settings: SettingsService,
  ) {}

  async handle(
    req: Request,
    res: Response,
    params: { apiSlug: string; publicPath: string },
  ) {
    const apiSlug = String(params.apiSlug ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
    const publicPath = String(params.publicPath ?? '/');
    if (!apiSlug) throw new BadRequestException('URL inválida. Use /{api}/{path}.');

    const requestId = randomUUID();
    const startedAt = Date.now();

    const host = String(process.env.HOST ?? '').trim();
    const backend = String(process.env.URL_BACKEND ?? '').trim();
    const base =
      backend && backend.toLowerCase() !== 'localhost'
        ? backend.replace(/\/+$/, '')
        : host
          ? `http://${host}:3994`
          : `${req.protocol}://${req.get('host')}`;
    const originalUrl = `${base}${req.originalUrl}`;

    let api: { id: string; slug: string; certificateId: string | null } | null = null;
    try {
      const found = await this.apis.getBySlug(apiSlug);
      api = { id: found.id, slug: found.slug, certificateId: (found as any).certificateId ?? null };
    } catch {
      res.status(404).json({ error: 'API não encontrada' });
      return;
    }

    const path = await this.paths.findByApiAndPublicPath(api.id, publicPath, req.method);
    if (!path || !path.enabled) {
      res.status(404).json({ error: 'Rota não encontrada' });
      return;
    }

    const cfg = await this.settings.getSettings();
    const apiKeyHeader = String(cfg.apiKeyHeaderName ?? 'API-KEY').trim() || 'API-KEY';
    const requireClientAuth = path.requireClientAuth !== false;
    const apiKeyValue = requireClientAuth ? String(req.header(apiKeyHeader) ?? '').trim() : '';
    const blocked = new Set<string>([
      ...Array.from(HOP_BY_HOP),
      apiKeyHeader.toLowerCase(),
      ...(cfg.proxyBlockedHeaders ?? []).map((h) => String(h ?? '').trim().toLowerCase()).filter(Boolean),
    ]);
    const baseLog = await this.logs.createBaseLog({
      requestId,
      apiKey: requireClientAuth && apiKeyValue ? apiKeyValue : null,
      apiSlug,
      publicPath,
      method: req.method,
      originalUrl,
      requestHeaders: toSingleHeaderMap(req.headers),
      requestBody: Buffer.isBuffer(req.body) ? req.body : null,
      redactHeaders: [apiKeyHeader],
    });

    try {
      let apiKeyBindings: Record<string, string> = {};
      if (requireClientAuth) {
        if (!apiKeyValue) {
          const hasAny = await this.apiKeys.hasAny();
          if (!hasAny) {
            throw new ServiceUnavailableException(
              'Nenhuma API Key cadastrada. Crie uma em /admin/apikeys antes de usar o gateway.',
            );
          }
          throw new ForbiddenException('API-KEY obrigatório');
        }
        const apiKey = await this.apiKeys.getByKey(apiKeyValue);

        if (apiKey.allowedApis && apiKey.allowedApis.length > 0) {
          if (!apiKey.allowedApis.includes(api.slug)) {
            throw new ForbiddenException('API não permitida para esta API Key');
          }
        }

        const rl = await this.rateLimit.hit(apiKey.key, apiKey.requestsPerMinute);
        res.setHeader('X-RateLimit-Limit', String(apiKey.requestsPerMinute));
        res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
        res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
        if (!rl.allowed) {
          res.status(429).json({ error: 'rate_limited' });
          await this.logs.finalizeLog(baseLog.id, {
            finalUrl: null,
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: Buffer.from(JSON.stringify({ error: 'rate_limited' })),
            statusCode: 429,
            durationMs: Date.now() - startedAt,
            redactHeaders: [apiKeyHeader],
          });
          return;
        }

        apiKeyBindings = apiKey.variableBindings;
      } else {
        const limit = Number(process.env.ORX_PUBLIC_RATE_LIMIT_RPM ?? '60');
        if (Number.isFinite(limit) && limit > 0) {
          const key = `public:${api.slug}:${path.id}`;
          const rl = await this.rateLimit.hit(key, limit);
          res.setHeader('X-RateLimit-Limit', String(limit));
          res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
          res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
          if (!rl.allowed) {
            res.status(429).json({ error: 'rate_limited' });
            await this.logs.finalizeLog(baseLog.id, {
              finalUrl: null,
              responseHeaders: { 'content-type': 'application/json' },
              responseBody: Buffer.from(JSON.stringify({ error: 'rate_limited' })),
              statusCode: 429,
              durationMs: Date.now() - startedAt,
              redactHeaders: [apiKeyHeader],
            });
            return;
          }
        }
      }

      const targetTemplate = path.targetUrlTemplate;
      const clientHeaders = normalizeOutgoingHeaders(req.headers, blocked);

      const clientQuery: Record<string, string> = {};
      if (path.forwardClientQuery !== false) {
        for (const [k, v] of Object.entries(req.query ?? {})) {
          if (v === undefined) continue;
          if (Array.isArray(v)) clientQuery[k] = v.map((x) => String(x)).join(',');
          else clientQuery[k] = String(v as any);
        }
      }

      const auth = path.authId ? await this.auths.get(path.authId) : null;
      const bodyBuf = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      const timeoutMs = path.timeoutSeconds ? path.timeoutSeconds * 1000 : cfg.proxyTimeoutMs;
      const tls = await this.certs.getTlsForApiCertificateId(api.certificateId);

      const exec = await this.requestEngine.execute({
        method: req.method,
        clientHeaders,
        clientQuery,
        body: bodyBuf,
        targetUrlTemplate: targetTemplate,
        addHeaders: Object.fromEntries(
          Object.entries(path.addHeaders ?? {}).map(([k, v]) => [k, String(v)]),
        ),
        addQuery: Object.fromEntries(
          Object.entries(path.addQuery ?? {}).map(([k, v]) => [k, String(v)]),
        ),
        apiKeyBindings,
        auth,
        timeoutMs,
        tls,
      });
      const finalUrl = exec.finalUrl;
      const upstream = exec.upstream;

      for (const [k, v] of Object.entries(upstream.headers)) {
        if (!k) continue;
        const key = k.toLowerCase();
        if (HOP_BY_HOP.has(key)) continue;
        if (v === undefined) continue;
        if (Array.isArray(v)) res.setHeader(k, v);
        else res.setHeader(k, String(v));
      }

      res.status(upstream.statusCode);
      res.send(upstream.body);

      await this.logs.finalizeLog(baseLog.id, {
        finalUrl,
        responseHeaders: upstream.headers,
        responseBody: upstream.body,
        statusCode: upstream.statusCode,
        durationMs: Date.now() - startedAt,
        redactHeaders: [apiKeyHeader],
      });
    } catch (err: any) {
      const isTimeout =
        err instanceof UpstreamTimeoutError ||
        err?.code === 'UPSTREAM_TIMEOUT' ||
        err?.name === 'UpstreamTimeoutError' ||
        err?.message === 'upstream_timeout';
      if (isTimeout) {
        res.status(504).end();
        await this.logs.finalizeLog(baseLog.id, {
          finalUrl: null,
          responseHeaders: {},
          responseBody: null,
          statusCode: 504,
          durationMs: Date.now() - startedAt,
          redactHeaders: [apiKeyHeader],
        });
        return;
      }
      const status = Number(err?.status ?? 500);
      const payload = { error: err?.message ?? 'internal_error' };
      const body = Buffer.from(JSON.stringify(payload));
      res.status(status).setHeader('content-type', 'application/json').send(body);

      await this.logs.finalizeLog(baseLog.id, {
        finalUrl: null,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: body,
        statusCode: status,
        durationMs: Date.now() - startedAt,
        redactHeaders: [apiKeyHeader],
      });
    }
  }
}
