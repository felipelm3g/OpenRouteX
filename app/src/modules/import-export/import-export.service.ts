import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ApiKeysService } from '../apikeys/apikeys.service';
import { ApiKeyEntity } from '../apikeys/apikey.entity';
import { ApiEntity } from '../apis/api.entity';
import { ApisService } from '../apis/apis.service';
import { AuthEntity } from '../auth/auth.entity';
import { AuthService } from '../auth/auth.service';
import { CertificateEntity } from '../certificates/certificate.entity';
import { CertificatesService } from '../certificates/certificates.service';
import { PathEntity } from '../paths/path.entity';
import { PathsService } from '../paths/paths.service';

import { ImportExportBatchEntity } from './import-export.entity';

type ExportedCertificate = {
  name: string;
  format: 'pem' | 'pfx';
  pemCert?: string;
  pemKey?: string;
  pemPassphrase?: string;
  caPem?: string;
  pfxBase64?: string;
  pfxPassphrase?: string;
  materialRedacted?: boolean;
};

type ExportedAuth = { name: string; type: string; config: Record<string, unknown>; configRedacted?: boolean };

type ExportedApi = {
  name: string;
  slug: string;
  description?: string | null;
  certificateName?: string | null;
  variableBindings?: Record<string, string>;
};

type ExportedPath = {
  apiSlug: string;
  name: string;
  publicPath: string;
  method: string;
  targetUrlTemplate: string;
  enabled: boolean;
  requireClientAuth: boolean;
  addHeaders: Record<string, string>;
  addQuery: Record<string, string>;
  forwardClientQuery: boolean;
  forwardClientHeaders: boolean;
  savePayload: boolean;
  timeoutSeconds: number | null;
  authRef?: { type: 'saved'; name: string } | { type: 'inline'; authInlineType: string; authInlineConfig: Record<string, unknown> } | { type: 'none' };
};

type ExportedApiKey = {
  key: string;
  keyRedacted?: boolean;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  allowedApis: string[];
  variableBindings: Record<string, string>;
  requestsPerMinute: number;
};

type ExportFileV1 = {
  version: 1;
  exportedAt: string;
  exportedBy: { username: string };
  data: {
    certificates: ExportedCertificate[];
    auths: ExportedAuth[];
    apis: ExportedApi[];
    paths: ExportedPath[];
    apiKeys: ExportedApiKey[];
  };
};

type Selection = {
  apis: Array<{
    slug: string;
    routes?: Array<{ publicPath: string; method: string }>;
  }>;
};

type SnapshotV1 = {
  version: 1;
  capturedAt: string;
  auths: Record<string, ExportedAuth | null>;
  certificates: Record<string, ExportedCertificate | null>;
  apis: Record<string, ExportedApi | null>;
  paths: Record<string, Record<string, ExportedPath | null>>;
  apiKeys: Record<string, ExportedApiKey | null>;
};

function normalizeSlug(input: string) {
  return String(input ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

function normalizePublicPath(input: string) {
  const s = String(input ?? '').trim();
  if (!s) return '/';
  const withLeading = s.startsWith('/') ? s : `/${s}`;
  const noTrailing = withLeading.replace(/\/+$/, '');
  return noTrailing || '/';
}

function routeKey(method: string, publicPath: string) {
  return `${String(method ?? '').trim().toUpperCase()} ${normalizePublicPath(publicPath)}`;
}

const REDACTED = '__ORX_REDACTED__';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isSensitiveKey(key: string) {
  const k = String(key ?? '').trim().toLowerCase();
  if (!k) return false;
  if (k === 'password') return true;
  if (k === 'passphrase') return true;
  if (k === 'secret') return true;
  if (k === 'clientsecret') return true;
  if (k === 'consumersecret') return true;
  if (k === 'tokensecret') return true;
  if (k === 'token') return true;
  if (k === 'apikey') return true;
  if (k === 'api_key') return true;
  if (k === 'key') return true;
  if (k === 'privatekey') return true;
  if (k === 'pemcert') return true;
  if (k === 'pemkey') return true;
  if (k === 'capem') return true;
  if (k === 'pfxbase64') return true;
  if (k === 'pfxpassphrase') return true;
  if (k === 'pempassphrase') return true;
  return false;
}

function redactSecrets(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((v) => redactSecrets(v));
  if (!isPlainObject(input)) return input;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) {
      if (v === null || v === undefined) out[k] = v;
      else out[k] = REDACTED;
      continue;
    }
    out[k] = redactSecrets(v);
  }
  return out;
}

function stripRedacted(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === REDACTED) continue;
    if (Array.isArray(v)) out[k] = v.map((x) => (x === REDACTED ? null : x));
    else if (isPlainObject(v)) out[k] = stripRedacted(v);
    else out[k] = v;
  }
  return out;
}

function mergePreservingRedacted(prev: unknown, incoming: unknown): unknown {
  if (incoming === REDACTED) return prev;
  if (Array.isArray(incoming)) return incoming.map((v, idx) => mergePreservingRedacted((prev as any)?.[idx], v));
  if (!isPlainObject(incoming)) return incoming;
  const prevObj = isPlainObject(prev) ? prev : {};
  const out: Record<string, unknown> = { ...prevObj };
  for (const [k, v] of Object.entries(incoming)) {
    out[k] = mergePreservingRedacted((prevObj as any)[k], v);
  }
  return out;
}

function hasAnyCertificateMaterial(c: Partial<ExportedCertificate>) {
  const fields = [c.pemCert, c.pemKey, c.caPem, c.pemPassphrase, c.pfxBase64, c.pfxPassphrase].map((v) =>
    typeof v === 'string' ? v.trim() : v,
  );
  for (const v of fields) {
    if (!v) continue;
    if (v === REDACTED) continue;
    return true;
  }
  return false;
}

@Injectable()
export class ImportExportService {
  constructor(
    private readonly apis: ApisService,
    private readonly paths: PathsService,
    private readonly auths: AuthService,
    private readonly certs: CertificatesService,
    private readonly apiKeys: ApiKeysService,
    @InjectRepository(ImportExportBatchEntity)
    private readonly batches: Repository<ImportExportBatchEntity>,
    @InjectRepository(ApiEntity)
    private readonly apiRepo: Repository<ApiEntity>,
    @InjectRepository(PathEntity)
    private readonly pathRepo: Repository<PathEntity>,
    @InjectRepository(AuthEntity)
    private readonly authRepo: Repository<AuthEntity>,
    @InjectRepository(CertificateEntity)
    private readonly certRepo: Repository<CertificateEntity>,
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
  ) {}

  async history() {
    const rows = await this.batches.find({ order: { createdAt: 'DESC' } });
    return rows.map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      createdByUsername: b.createdByUsername,
      summary: b.summary ?? {},
      applied: b.applied ?? {},
      undoneAt: b.undoneAt,
      undoneByUsername: b.undoneByUsername,
    }));
  }

  private async exportCertById(id: string): Promise<ExportedCertificate> {
    const row = await this.certRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Certificado não encontrado');
    return { name: row.name, format: row.format as any, materialRedacted: true };
  }

  async export(params: { selection: Selection; username: string }): Promise<ExportFileV1> {
    const selection = params.selection;
    const selectedSlugs = Array.from(
      new Set((selection?.apis ?? []).map((a) => normalizeSlug(a.slug)).filter(Boolean)),
    );
    if (!selectedSlugs.length) throw new BadRequestException('Selecione ao menos 1 serviço para exportar.');

    const selectedApis: ApiEntity[] = [];
    for (const slug of selectedSlugs) selectedApis.push(await this.apis.getBySlug(slug));
    const apiSlugByApiId = new Map<string, string>();
    for (const a of selectedApis) apiSlugByApiId.set(a.id, a.slug);

    const selectionBySlug = new Map<string, { routes?: Array<{ publicPath: string; method: string }> }>();
    for (const a of selection.apis ?? []) {
      const slug = normalizeSlug(a.slug);
      if (!slug) continue;
      if (!selectedSlugs.includes(slug)) continue;
      selectionBySlug.set(slug, { routes: a.routes?.map((r) => ({ publicPath: r.publicPath, method: r.method })) });
    }

    const allPaths: PathEntity[] = [];
    for (const api of selectedApis) {
      const apiPaths = await this.paths.list({ apiId: api.id });
      const sel = selectionBySlug.get(api.slug);
      const wanted = sel?.routes?.length
        ? new Set(sel.routes.map((r) => routeKey(r.method, r.publicPath)))
        : null;
      for (const p of apiPaths) {
        if (wanted && !wanted.has(routeKey(p.method, p.publicPath))) continue;
        allPaths.push(p);
      }
    }

    const authIds = new Set<string>();
    for (const p of allPaths) {
      if (p.authId) authIds.add(p.authId);
    }
    const authRows: AuthEntity[] = authIds.size
      ? await this.authRepo.find({ where: { id: In(Array.from(authIds)) } })
      : [];
    const authNameById = new Map<string, string>();
    for (const a of authRows) authNameById.set(a.id, a.name);

    const certIds = new Set<string>();
    for (const api of selectedApis) if (api.certificateId) certIds.add(api.certificateId);
    const certRows: CertificateEntity[] = certIds.size
      ? await this.certRepo.find({ where: { id: In(Array.from(certIds)) } })
      : [];
    const certNameById = new Map<string, string>();
    for (const c of certRows) certNameById.set(c.id, c.name);

    const exportedCerts: ExportedCertificate[] = [];
    for (const id of Array.from(certIds)) exportedCerts.push(await this.exportCertById(id));

    const exportedAuths: ExportedAuth[] = authRows.map((a) => ({
      name: a.name,
      type: a.type,
      config: redactSecrets(a.config ?? {}) as Record<string, unknown>,
      configRedacted: true,
    }));

    const exportedApis: ExportedApi[] = selectedApis.map((a) => ({
      name: a.name,
      slug: a.slug,
      description: a.description ?? null,
      certificateName: a.certificateId ? certNameById.get(a.certificateId) ?? null : null,
      variableBindings: (a as any).variableBindings ?? {},
    }));

    const exportedPaths: ExportedPath[] = allPaths.map((p) => {
      const authRef = (() => {
        if ((p as any).authInlineType) {
          return {
            type: 'inline' as const,
            authInlineType: String((p as any).authInlineType),
            authInlineConfig: ((p as any).authInlineConfig ?? {}) as Record<string, unknown>,
          };
        }
        if (p.authId) {
          const name = authNameById.get(p.authId);
          return name ? ({ type: 'saved' as const, name } as const) : ({ type: 'none' as const } as const);
        }
        return { type: 'none' as const };
      })();

      return {
        apiSlug: apiSlugByApiId.get(p.apiId) ?? '',
        name: p.name,
        publicPath: p.publicPath,
        method: p.method,
        targetUrlTemplate: p.targetUrlTemplate,
        enabled: Boolean(p.enabled),
        requireClientAuth: p.requireClientAuth !== false,
        addHeaders: p.addHeaders ?? {},
        addQuery: p.addQuery ?? {},
        forwardClientQuery: p.forwardClientQuery !== false,
        forwardClientHeaders: p.forwardClientHeaders !== false,
        savePayload: (p as any).savePayload !== false,
        timeoutSeconds: p.timeoutSeconds ?? null,
        authRef,
      };
    });

    const apiKeyRows = await this.apiKeys.list();
    const exportedApiKeys: ExportedApiKey[] = (apiKeyRows ?? [])
      .filter((k: any) => {
        const allowed = k.allowedApis;
        if (!Array.isArray(allowed) || !allowed.length) return false;
        return allowed.some((s: any) => selectedSlugs.includes(normalizeSlug(String(s))));
      })
      .map((k: any) => ({
        key: '',
        keyRedacted: true,
        name: String(k.name),
        status: (k.status ?? 'ACTIVE') as any,
        allowedApis: (k.allowedApis ?? []).map((s: any) => normalizeSlug(String(s))).filter(Boolean),
        variableBindings: k.variableBindings ?? {},
        requestsPerMinute: Number(k.requestsPerMinute ?? 60),
      }));

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: { username: params.username },
      data: {
        certificates: exportedCerts,
        auths: exportedAuths,
        apis: exportedApis,
        paths: exportedPaths,
        apiKeys: exportedApiKeys,
      },
    };
  }

  private validateFile(obj: any): ExportFileV1 {
    if (!obj || typeof obj !== 'object') throw new BadRequestException('Arquivo inválido');
    if (obj.version !== 1) throw new BadRequestException('Versão do arquivo não suportada');
    if (!obj.data || typeof obj.data !== 'object') throw new BadRequestException('Arquivo inválido');
    return obj as ExportFileV1;
  }

  private async snapshotBefore(file: ExportFileV1): Promise<SnapshotV1> {
    const auths: Record<string, ExportedAuth | null> = {};
    for (const a of file.data.auths ?? []) {
      const name = String(a.name ?? '').trim();
      if (!name) continue;
      const existing = await this.authRepo.findOne({ where: { name } });
      auths[name] = existing ? { name: existing.name, type: existing.type, config: existing.config ?? {} } : null;
    }

    const certificates: Record<string, ExportedCertificate | null> = {};
    for (const c of file.data.certificates ?? []) {
      const name = String(c.name ?? '').trim();
      if (!name) continue;
      const existing = await this.certRepo.findOne({ where: { name } });
      certificates[name] = existing ? await this.certs.exportPlain(existing.id) : null;
    }

    const apis: Record<string, ExportedApi | null> = {};
    for (const a of file.data.apis ?? []) {
      const slug = normalizeSlug(a.slug);
      if (!slug) continue;
      const existing = await this.apiRepo.findOne({ where: { slug } });
      const certName = existing?.certificateId
        ? (await this.certRepo.findOne({ where: { id: existing.certificateId } }))?.name ?? null
        : null;
      apis[slug] = existing
        ? {
            name: existing.name,
            slug: existing.slug,
            description: existing.description ?? null,
            certificateName: certName,
            variableBindings: (existing as any).variableBindings ?? {},
          }
        : null;
    }

    const paths: Record<string, Record<string, ExportedPath | null>> = {};
    for (const p of file.data.paths ?? []) {
      const apiSlug = normalizeSlug(p.apiSlug);
      if (!apiSlug) continue;
      const key = routeKey(p.method, p.publicPath);
      if (!paths[apiSlug]) paths[apiSlug] = {};
      if (paths[apiSlug][key] !== undefined) continue;
      const api = await this.apiRepo.findOne({ where: { slug: apiSlug } });
      if (!api) {
        paths[apiSlug][key] = null;
        continue;
      }
      const existing = await this.pathRepo.findOne({
        where: { apiId: api.id, publicPath: normalizePublicPath(p.publicPath), method: p.method as any },
      });
      if (!existing) {
        paths[apiSlug][key] = null;
        continue;
      }
      const authRef = (() => {
        if ((existing as any).authInlineType) {
          return {
            type: 'inline' as const,
            authInlineType: String((existing as any).authInlineType),
            authInlineConfig: ((existing as any).authInlineConfig ?? {}) as Record<string, unknown>,
          };
        }
        if (existing.authId) {
          return this.authRepo
            .findOne({ where: { id: existing.authId } })
            .then((a) => (a ? ({ type: 'saved' as const, name: a.name } as const) : ({ type: 'none' as const } as const)));
        }
        return { type: 'none' as const };
      })();
      const resolvedAuthRef = await Promise.resolve(authRef as any);
      paths[apiSlug][key] = {
        apiSlug,
        name: existing.name,
        publicPath: existing.publicPath,
        method: existing.method,
        targetUrlTemplate: existing.targetUrlTemplate,
        enabled: Boolean(existing.enabled),
        requireClientAuth: existing.requireClientAuth !== false,
        addHeaders: existing.addHeaders ?? {},
        addQuery: existing.addQuery ?? {},
        forwardClientQuery: existing.forwardClientQuery !== false,
        forwardClientHeaders: existing.forwardClientHeaders !== false,
        savePayload: (existing as any).savePayload !== false,
        timeoutSeconds: existing.timeoutSeconds ?? null,
        authRef: resolvedAuthRef,
      };
    }

    const apiKeys: Record<string, ExportedApiKey | null> = {};
    for (const k of file.data.apiKeys ?? []) {
      const key = String(k.key ?? '').trim();
      const name = String(k.name ?? '').trim();
      const redacted = (k as any).keyRedacted === true || !key || key === REDACTED;
      if (!redacted) {
        if (!key) continue;
        const existing = await this.apiKeyRepo.findOne({ where: { key } });
        apiKeys[key] = existing
          ? {
              key: existing.key,
              name: existing.name,
              status: existing.status,
              allowedApis: (existing.allowedApis ?? []).map((s) => normalizeSlug(String(s))).filter(Boolean),
              variableBindings: existing.variableBindings ?? {},
              requestsPerMinute: Number(existing.requestsPerMinute ?? 60),
            }
          : null;
        continue;
      }

      if (!name) continue;
      const matches = await this.apiKeyRepo.find({ where: { name } });
      if (matches.length !== 1) continue;
      const existing = matches[0]!;
      apiKeys[`name:${name}`] = {
        key: existing.key,
        name: existing.name,
        status: existing.status,
        allowedApis: (existing.allowedApis ?? []).map((s) => normalizeSlug(String(s))).filter(Boolean),
        variableBindings: existing.variableBindings ?? {},
        requestsPerMinute: Number(existing.requestsPerMinute ?? 60),
      };
    }

    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      auths,
      certificates,
      apis,
      paths,
      apiKeys,
    };
  }

  async import(params: { file: unknown; userId: string | null; username: string }) {
    const file = this.validateFile(params.file);
    const username = String(params.username ?? '').trim() || 'unknown';

    const snapshot = await this.snapshotBefore(file);

    const applied: any = {
      auths: [],
      certificates: [],
      apis: [],
      paths: [],
      apiKeys: [],
    };

    const authIdByName = new Map<string, string>();
    for (const a of file.data.auths ?? []) {
      const name = String(a.name ?? '').trim();
      if (!name) continue;
      const existing = await this.authRepo.findOne({ where: { name } });
      const incomingConfig = a.config ?? {};
      if (existing) {
        const mergedConfig = mergePreservingRedacted(existing.config ?? {}, incomingConfig);
        await this.auths.update(existing.id, { name, type: a.type as any, config: mergedConfig as any });
        authIdByName.set(name, existing.id);
        applied.auths.push({ name, action: 'updated' });
      } else {
        const created = await this.auths.create({
          name,
          type: a.type as any,
          config: stripRedacted(incomingConfig),
        });
        authIdByName.set(name, created.id);
        applied.auths.push({ name, action: 'created' });
      }
    }

    const certIdByName = new Map<string, string>();
    for (const c of file.data.certificates ?? []) {
      const name = String(c.name ?? '').trim();
      if (!name) continue;
      const existing = await this.certRepo.findOne({ where: { name } });
      const hasMaterial = hasAnyCertificateMaterial(c);

      if (existing) {
        if (!hasMaterial && String(c.format ?? '').trim() && c.format !== (existing.format as any)) {
          applied.certificates.push({ name, action: 'skipped_missing_material' });
          continue;
        }
        if (hasMaterial) {
          await this.certs.update(existing.id, {
            name,
            format: c.format as any,
            pemCert: c.pemCert === REDACTED ? undefined : c.pemCert,
            pemKey: c.pemKey === REDACTED ? undefined : c.pemKey,
            pemPassphrase: c.pemPassphrase === REDACTED ? undefined : c.pemPassphrase,
            caPem: c.caPem === REDACTED ? undefined : c.caPem,
            pfxBase64: c.pfxBase64 === REDACTED ? undefined : c.pfxBase64,
            pfxPassphrase: c.pfxPassphrase === REDACTED ? undefined : c.pfxPassphrase,
          });
          certIdByName.set(name, existing.id);
          applied.certificates.push({ name, action: 'updated' });
          continue;
        }
        certIdByName.set(name, existing.id);
        applied.certificates.push({ name, action: 'skipped_redacted' });
        continue;
      }

      if (!hasMaterial) {
        applied.certificates.push({ name, action: 'skipped_missing_material' });
        continue;
      }
      const created = await this.certs.create({
        name,
        format: c.format as any,
        pemCert: c.pemCert === REDACTED ? undefined : c.pemCert,
        pemKey: c.pemKey === REDACTED ? undefined : c.pemKey,
        pemPassphrase: c.pemPassphrase === REDACTED ? undefined : c.pemPassphrase,
        caPem: c.caPem === REDACTED ? undefined : c.caPem,
        pfxBase64: c.pfxBase64 === REDACTED ? undefined : c.pfxBase64,
        pfxPassphrase: c.pfxPassphrase === REDACTED ? undefined : c.pfxPassphrase,
      });
      certIdByName.set(name, created.id);
      applied.certificates.push({ name, action: 'created' });
    }

    const apiIdBySlug = new Map<string, string>();
    for (const a of file.data.apis ?? []) {
      const slug = normalizeSlug(a.slug);
      if (!slug) continue;
      const existing = await this.apiRepo.findOne({ where: { slug } });
      const certificateId = a.certificateName ? certIdByName.get(String(a.certificateName).trim()) ?? null : null;
      if (existing) {
        const updated = await this.apis.update(existing.id, {
          name: a.name,
          slug,
          description: a.description ?? null,
          certificateId,
          variableBindings: a.variableBindings ?? {},
        });
        apiIdBySlug.set(slug, updated.id);
        applied.apis.push({ slug, action: 'updated' });
      } else {
        const created = await this.apis.create({
          name: a.name,
          slug,
          description: a.description ?? null,
          certificateId,
          variableBindings: a.variableBindings ?? {},
        });
        apiIdBySlug.set(slug, created.id);
        applied.apis.push({ slug, action: 'created' });
      }
    }

    for (const p of file.data.paths ?? []) {
      const apiSlug = normalizeSlug(p.apiSlug);
      if (!apiSlug) continue;
      const apiId = apiIdBySlug.get(apiSlug) ?? (await this.apiRepo.findOne({ where: { slug: apiSlug } }))?.id;
      if (!apiId) continue;
      const method = String(p.method ?? '').trim().toUpperCase();
      const publicPath = normalizePublicPath(p.publicPath);
      const existing = await this.pathRepo.findOne({ where: { apiId, publicPath, method: method as any } });
      const authInlineType =
        p.authRef && p.authRef.type === 'inline' ? String((p.authRef as any).authInlineType ?? '') : null;
      const authInlineConfig =
        p.authRef && p.authRef.type === 'inline'
          ? (((p.authRef as any).authInlineConfig ?? {}) as Record<string, unknown>)
          : null;
      const authId =
        p.authRef && p.authRef.type === 'saved'
          ? authIdByName.get(String((p.authRef as any).name ?? '').trim()) ??
            (await this.authRepo.findOne({ where: { name: String((p.authRef as any).name ?? '').trim() } }))?.id ??
            null
          : null;

      const payload: any = {
        apiId,
        name: p.name,
        publicPath,
        method: method as any,
        targetUrlTemplate: p.targetUrlTemplate,
        enabled: p.enabled,
        requireClientAuth: p.requireClientAuth,
        addHeaders: p.addHeaders ?? {},
        addQuery: p.addQuery ?? {},
        forwardClientQuery: p.forwardClientQuery,
        forwardClientHeaders: p.forwardClientHeaders,
        savePayload: p.savePayload,
        timeoutSeconds: p.timeoutSeconds ?? null,
        authId: authInlineType ? null : authId,
        authInlineType: authInlineType || null,
        authInlineConfig: authInlineType ? (authInlineConfig ?? {}) : null,
      };

      if (existing) {
        await this.paths.update(existing.id, payload);
        applied.paths.push({ apiSlug, method, publicPath, action: 'updated' });
      } else {
        await this.paths.create(payload);
        applied.paths.push({ apiSlug, method, publicPath, action: 'created' });
      }
    }

    for (const k of file.data.apiKeys ?? []) {
      const key = String(k.key ?? '').trim();
      const name = String(k.name ?? '').trim();
      const redacted = (k as any).keyRedacted === true || !key || key === REDACTED;
      const existing = redacted ? null : await this.apiKeyRepo.findOne({ where: { key } });
      const dto: any = {
        name: name || String(k.name ?? ''),
        status: k.status,
        allowedApis: (k.allowedApis ?? []).map((s) => normalizeSlug(String(s))).filter(Boolean),
        variableBindings: k.variableBindings ?? {},
        requestsPerMinute: Number(k.requestsPerMinute ?? 60),
      };
      if (redacted) {
        if (!name) continue;
        const candidates = await this.apiKeyRepo.find({ where: { name } });
        if (candidates.length !== 1) {
          applied.apiKeys.push({ name, action: candidates.length ? 'skipped_ambiguous' : 'skipped_missing' });
          continue;
        }
        await this.apiKeys.update(candidates[0]!.id, dto);
        applied.apiKeys.push({ name, action: 'updated_by_name' });
        continue;
      }

      if (!key) continue;
      dto.key = key;
      if (existing) {
        await this.apiKeys.update(existing.id, dto);
        applied.apiKeys.push({ key, action: 'updated' });
      } else {
        await this.apiKeys.create(dto);
        applied.apiKeys.push({ key, action: 'created' });
      }
    }

    const summary = {
      services: file.data.apis?.length ?? 0,
      routes: file.data.paths?.length ?? 0,
      credentials: file.data.auths?.length ?? 0,
      certificates: file.data.certificates?.length ?? 0,
      apiKeys: file.data.apiKeys?.length ?? 0,
    };

    const batch = await this.batches.save(
      this.batches.create({
        createdByUsername: username,
        createdByUserId: params.userId,
        summary,
        snapshotBefore: snapshot as any,
        applied,
        undoneAt: null,
        undoneByUsername: null,
        undoneByUserId: null,
      }),
    );

    return {
      id: batch.id,
      createdAt: batch.createdAt,
      createdByUsername: batch.createdByUsername,
      summary: batch.summary,
      applied: batch.applied,
    };
  }

  private async getBatchEntity(id: string) {
    const row = await this.batches.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Importação não encontrada');
    return row;
  }

  async undo(params: { id: string; userId: string | null; username: string }) {
    const batch = await this.getBatchEntity(params.id);
    if (batch.undoneAt) {
      await this.batches.delete({ id: batch.id });
      return { ok: true };
    }
    const snapshot = (batch.snapshotBefore ?? {}) as any as SnapshotV1;
    if (snapshot.version !== 1) throw new BadRequestException('Snapshot inválido.');

    const authNameToId = new Map<string, string>();
    for (const [name, prev] of Object.entries(snapshot.auths ?? {})) {
      const existing = await this.authRepo.findOne({ where: { name } });
      if (!prev) {
        if (existing) await this.auths.remove(existing.id);
        continue;
      }
      if (existing) {
        const updated = await this.auths.update(existing.id, { name: prev.name, type: prev.type as any, config: prev.config ?? {} });
        authNameToId.set(name, updated.id);
      } else {
        const created = await this.auths.create({ name: prev.name, type: prev.type as any, config: prev.config ?? {} });
        authNameToId.set(name, created.id);
      }
    }

    const certNameToId = new Map<string, string>();
    for (const [name, prev] of Object.entries(snapshot.certificates ?? {})) {
      const existing = await this.certRepo.findOne({ where: { name } });
      if (!prev) {
        if (existing) await this.certs.remove(existing.id);
        continue;
      }
      if (existing) {
        const updated = await this.certs.update(existing.id, {
          name: prev.name,
          format: prev.format as any,
          pemCert: prev.pemCert,
          pemKey: prev.pemKey,
          pemPassphrase: prev.pemPassphrase,
          caPem: prev.caPem,
          pfxBase64: prev.pfxBase64,
          pfxPassphrase: prev.pfxPassphrase,
        });
        certNameToId.set(name, updated.id);
      } else {
        const created = await this.certs.create({
          name: prev.name,
          format: prev.format as any,
          pemCert: prev.pemCert,
          pemKey: prev.pemKey,
          pemPassphrase: prev.pemPassphrase,
          caPem: prev.caPem,
          pfxBase64: prev.pfxBase64,
          pfxPassphrase: prev.pfxPassphrase,
        });
        certNameToId.set(name, created.id);
      }
    }

    for (const [slug, prev] of Object.entries(snapshot.apis ?? {})) {
      const existing = await this.apiRepo.findOne({ where: { slug } });
      if (!prev) {
        if (existing) await this.apis.remove(existing.id);
        continue;
      }
      const certificateId = prev.certificateName ? certNameToId.get(String(prev.certificateName).trim()) ?? null : null;
      if (existing) {
        await this.apis.update(existing.id, {
          name: prev.name,
          slug,
          description: prev.description ?? null,
          certificateId,
          variableBindings: prev.variableBindings ?? {},
        });
      } else {
        await this.apis.create({
          name: prev.name,
          slug,
          description: prev.description ?? null,
          certificateId,
          variableBindings: prev.variableBindings ?? {},
        });
      }
    }

    for (const [apiSlug, routes] of Object.entries(snapshot.paths ?? {})) {
      const api = await this.apiRepo.findOne({ where: { slug: apiSlug } });
      if (!api) continue;
      for (const [rk, prev] of Object.entries(routes ?? {})) {
        const [method, ...rest] = String(rk).split(' ');
        const publicPath = rest.join(' ');
        const existing = await this.pathRepo.findOne({ where: { apiId: api.id, publicPath: normalizePublicPath(publicPath), method: method as any } });
        if (!prev) {
          if (existing) await this.pathRepo.delete({ id: existing.id });
          continue;
        }
        const authInlineType =
          prev.authRef && prev.authRef.type === 'inline' ? String((prev.authRef as any).authInlineType ?? '') : null;
        const authInlineConfig =
          prev.authRef && prev.authRef.type === 'inline'
            ? (((prev.authRef as any).authInlineConfig ?? {}) as Record<string, unknown>)
            : null;
        const authId =
          prev.authRef && prev.authRef.type === 'saved'
            ? authNameToId.get(String((prev.authRef as any).name ?? '').trim()) ??
              (await this.authRepo.findOne({ where: { name: String((prev.authRef as any).name ?? '').trim() } }))?.id ??
              null
            : null;

        const payload: any = {
          apiId: api.id,
          name: prev.name,
          publicPath: normalizePublicPath(prev.publicPath),
          method: String(prev.method ?? '').trim().toUpperCase(),
          targetUrlTemplate: prev.targetUrlTemplate,
          enabled: prev.enabled,
          requireClientAuth: prev.requireClientAuth,
          addHeaders: prev.addHeaders ?? {},
          addQuery: prev.addQuery ?? {},
          forwardClientQuery: prev.forwardClientQuery,
          forwardClientHeaders: prev.forwardClientHeaders,
          savePayload: prev.savePayload,
          timeoutSeconds: prev.timeoutSeconds ?? null,
          authId: authInlineType ? null : authId,
          authInlineType: authInlineType || null,
          authInlineConfig: authInlineType ? (authInlineConfig ?? {}) : null,
        };
        if (existing) {
          await this.paths.update(existing.id, payload);
        } else {
          await this.paths.create(payload);
        }
      }
    }

    for (const [key, prev] of Object.entries(snapshot.apiKeys ?? {})) {
      let existing: ApiKeyEntity | null = null;
      if (key.startsWith('name:')) {
        const name = key.slice(5);
        if (prev && prev.key) existing = await this.apiKeyRepo.findOne({ where: { key: prev.key } });
        if (!existing && name) {
          const matches = await this.apiKeyRepo.find({ where: { name } });
          if (matches.length === 1) existing = matches[0]!;
        }
      } else {
        existing = await this.apiKeyRepo.findOne({ where: { key } });
      }
      if (!prev) {
        if (existing) await this.apiKeys.remove(existing.id);
        continue;
      }
      const dto: any = {
        key: prev.key,
        name: prev.name,
        status: prev.status,
        allowedApis: (prev.allowedApis ?? []).map((s) => normalizeSlug(String(s))).filter(Boolean),
        variableBindings: prev.variableBindings ?? {},
        requestsPerMinute: Number(prev.requestsPerMinute ?? 60),
      };
      if (existing) await this.apiKeys.update(existing.id, dto);
      else await this.apiKeys.create(dto);
    }

    await this.batches.delete({ id: batch.id });
    return { ok: true };
  }
}
