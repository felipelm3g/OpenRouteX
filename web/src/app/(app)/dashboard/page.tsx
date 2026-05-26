'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { useI18n } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, MethodBadge, PageShell, Select, Skeleton, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { env } from '@/lib/env';

type Metrics = {
  windowHours: number;
  totalRequests: number;
  errorRequests: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  topApis: Array<{ apiSlug: string; requests: number }>;
};

type SettingsDto = {
  timezone: string;
  logsRetentionDays: number;
  logsCleanupIntervalMinutes: number;
  dashboardMetricsRefetchMs: number;
  dashboardLogsRefetchMs: number;
};

type LogRow = {
  id: string;
  requestId: string;
  apiKey: string | null;
  apiSlug: string | null;
  publicPath: string | null;
  method: string;
  originalUrl: string;
  finalUrl: string | null;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: string;
  responseAt: string | null;
};

type LogDetailDto = LogRow & {
  requestHeaders: Record<string, string | string[]>;
  responseHeaders: Record<string, string | string[]>;
  requestBody: string | null;
  responseBody: string | null;
};

type EndpointReportRow = {
  apiSlug: string;
  publicPath: string;
  method: string;
  total: number;
  success: number;
  error: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

type HeatmapCell = { dow: number; hour: number; total: number; errors: number };

type LogsMetaDto = {
  apiSlugs: Array<{ value: string; count: number }>;
  paths: Array<{ value: string; count: number }>;
  statuses: Array<{ value: number; count: number }>;
};

type LatencyUnit = 'ms' | 's';

function getCookieValue(name: string): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return part.slice(idx + 1).trim();
  }
  return '';
}

function toneForStatus(code: number | null) {
  if (code === null) return 'neutral' as const;
  if (code >= 500) return 'danger' as const;
  if (code >= 400) return 'warning' as const;
  if (code >= 300) return 'info' as const;
  return 'success' as const;
}

function formatDateTime(iso: string | null | undefined, timeZone: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

function trimTrailingZeros(s: string) {
  return s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function formatLatency(ms: number | null | undefined, unit: LatencyUnit) {
  if (ms === null || ms === undefined) return '—';
  if (!Number.isFinite(ms)) return '—';
  if (unit === 'ms') return `${Math.round(ms)} ms`;
  const sec = ms / 1000;
  const s = sec >= 10 ? sec.toFixed(1) : sec.toFixed(2);
  return `${trimTrailingZeros(s)} s`;
}

function parseDateTimeLocal(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: 0,
  };
}

function getTzParts(dateUtc: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(dateUtc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function zonedDateTimeLocalToUtcIso(local: string, timeZone: string) {
  const p = parseDateTimeLocal(local);
  if (!p) return null;
  let guess = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
  for (let i = 0; i < 3; i += 1) {
    const tz = getTzParts(guess, timeZone);
    const asUtc = Date.UTC(tz.year, tz.month - 1, tz.day, tz.hour, tz.minute, tz.second);
    const desired = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = asUtc - desired;
    guess = new Date(guess.getTime() - diff);
  }
  return guess.toISOString();
}

export default function DashboardPage() {
  const { t } = useI18n();
  const toast = useToast();
  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsDto>('/admin/settings'),
  });
  const tz = settingsQ.data?.timezone || 'UTC';
  const metricsRefetch = settingsQ.data?.dashboardMetricsRefetchMs ?? 5000;
  const logsRefetch = settingsQ.data?.dashboardLogsRefetchMs ?? 2000;

  const [latencyUnit, setLatencyUnit] = useState<LatencyUnit>('ms');
  const [api, setApi] = useState('');
  const [path, setPath] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openFromUrl, setOpenFromUrl] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = new URLSearchParams(window.location.search).get('openLogId') ?? '';
    if (!v) return;
    const t = setTimeout(() => setOpenFromUrl(v), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = String(window.localStorage.getItem('orx:dashboard:latencyUnit') ?? '').trim().toLowerCase();
    if (raw === 'ms' || raw === 's') setLatencyUnit(raw as LatencyUnit);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('orx:dashboard:latencyUnit', latencyUnit);
  }, [latencyUnit]);

  useEffect(() => {
    if (!openFromUrl) return;
    const t = setTimeout(() => setOpenId(openFromUrl), 0);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => clearTimeout(t);
  }, [openFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => setPath(''), 0);
    return () => clearTimeout(t);
  }, [api]);

  const metaApisQ = useQuery({
    queryKey: ['logs-meta-apis', status, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      if (status) qs.set('status', status);
      return apiFetch<LogsMetaDto>(`/admin/logs/meta?${qs.toString()}`);
    },
  });

  const metaPathsQ = useQuery({
    queryKey: ['logs-meta-paths', api, status, from, to, tz],
    enabled: Boolean(api),
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set('api', api);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      if (status) qs.set('status', status);
      return apiFetch<LogsMetaDto>(`/admin/logs/meta?${qs.toString()}`);
    },
  });

  const metaStatusQ = useQuery({
    queryKey: ['logs-meta-status', api, path, status, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (api) qs.set('api', api);
      if (path) qs.set('path', path);
      if (status) qs.set('status', status);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      return apiFetch<LogsMetaDto>(`/admin/logs/meta?${qs.toString()}`);
    },
  });

  const metricsQ = useQuery({
    queryKey: ['metrics', api, path, status, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (api) qs.set('api', api);
      if (path) qs.set('path', path);
      if (status) qs.set('status', status);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      const suffix = qs.toString();
      return apiFetch<Metrics>(`/admin/metrics${suffix ? `?${suffix}` : ''}`);
    },
    refetchInterval: metricsRefetch,
  });

  const listQ = useQuery({
    queryKey: ['dashboard-logs', api, path, status, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (api) qs.set('api', api);
      if (path) qs.set('path', path);
      if (status) qs.set('status', status);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      qs.set('limit', '80');
      return apiFetch<LogRow[]>(`/admin/logs?${qs.toString()}`);
    },
    refetchInterval: logsRefetch,
  });

  const endpointQ = useQuery({
    queryKey: ['dashboard-endpoints', api, path, status, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (api) qs.set('api', api);
      if (path) qs.set('path', path);
      if (status) qs.set('status', status);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      qs.set('limit', '200');
      return apiFetch<EndpointReportRow[]>(`/admin/logs/endpoints?${qs.toString()}`);
    },
  });

  const heatmapQ = useQuery({
    queryKey: ['dashboard-heatmap', api, path, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (api) qs.set('api', api);
      if (path) qs.set('path', path);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      qs.set('tz', tz);
      return apiFetch<HeatmapCell[]>(`/admin/logs/heatmap?${qs.toString()}`);
    },
  });

  const detailQ = useQuery({
    queryKey: ['log', openId],
    queryFn: () => apiFetch<LogDetailDto | null>(`/admin/logs/${openId}`),
    enabled: Boolean(openId),
  });

  const m = metricsQ.data;
  const loading = metricsQ.isPending;
  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);
  const detail = detailQ.data;

  const apiOptions = useMemo(() => {
    const opts = (metaApisQ.data?.apiSlugs ?? []).map((x) => ({ value: x.value, label: `/${x.value}` }));
    return [{ value: '', label: 'Slug: todos' }, ...opts];
  }, [metaApisQ.data]);

  const pathOptions = useMemo(() => {
    if (!api) return [{ value: '', label: 'Path: selecione um slug' }];
    const opts = (metaPathsQ.data?.paths ?? []).map((x) => ({ value: x.value, label: x.value }));
    return [{ value: '', label: 'Path: todos' }, ...opts];
  }, [api, metaPathsQ.data]);

  const statusOptions = useMemo(() => {
    const raw = metaStatusQ.data?.statuses ?? metaApisQ.data?.statuses ?? [];
    const opts = raw.map((x) => ({ value: String(x.value), label: `${x.value} (${x.count})` }));
    return [{ value: '', label: 'Status: todos' }, ...opts];
  }, [metaApisQ.data, metaStatusQ.data]);

  const latencyUnitLabel = latencyUnit === 'ms' ? 'ms' : 's';
  const latencyUnitOptions = useMemo(
    () => [
      { value: 'ms', label: 'Latência: ms' },
      { value: 's', label: 'Latência: s' },
    ],
    [],
  );

  const downloadResponseBody = () => {
    if (!detail?.responseBody) return;
    const contentType = (() => {
      const h = detail.responseHeaders ?? {};
      for (const [k, v] of Object.entries(h)) {
        if (k.toLowerCase() !== 'content-type') continue;
        if (Array.isArray(v)) return v.join(',');
        return String(v);
      }
      return '';
    })().toLowerCase();

    const ext =
      contentType.includes('application/json') || contentType.includes('+json')
        ? 'json'
        : contentType.includes('xml') || contentType.includes('+xml')
          ? 'xml'
          : 'txt';

    const blob = new Blob([detail.responseBody], {
      type:
        ext === 'json'
          ? 'application/json'
          : ext === 'xml'
            ? 'application/xml'
            : 'text/plain',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payload.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.info('Download', `payload.${ext}`);
  };

  const downloadLogs = async (format: 'csv' | 'json') => {
    if (!env.apiBaseUrl.trim()) {
      toast.error('Erro', 'URL do backend não configurada (HOST/URL_BACKEND).');
      return;
    }
    const qs = new URLSearchParams();
    if (api) qs.set('api', api);
    if (path) qs.set('path', path);
    if (status) qs.set('status', status);
    const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
    const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
    if (fromIso) qs.set('from', fromIso);
    if (toIso) qs.set('to', toIso);
    qs.set('format', format);
    qs.set('limit', '5000');

    const token = getCookieValue('orx_token');
    const url = `${env.apiBaseUrl}/admin/logs/export?${qs.toString()}`;
    const res = await fetch(url, {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const txt = await res.text();
      toast.error('Erro', txt || `${res.status} ${res.statusText}`);
      return;
    }
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `openroutex-logs.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
    toast.info(t('dashboard.toast.download.title'), `openroutex-logs.${format}`);
  };

  return (
    <PageShell
      title="Dashboard"
      subtitle="Métricas de uso e status operacional (janela de 24h)."
    >
      <Card className="mt-4">
        <CardHeader
          title={t('dashboard.filters.title')}
          description={t('dashboard.filters.description')}
          right={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void downloadLogs('csv')}>
                {t('common.exportCsv')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void downloadLogs('json')}>
                {t('common.exportJson')}
              </Button>
              <div className="text-xs text-white/55">
                {listQ.isPending ? 'Carregando…' : `Atualiza a cada ${Math.max(1, Math.round(logsRefetch / 1000))}s`}
              </div>
            </div>
          }
        />
        <CardBody>
          <div className="grid gap-3 lg:grid-cols-6">
            <Select value={api} onChange={setApi} options={apiOptions} />
            <Select value={path} onChange={setPath} options={pathOptions} />
            <Select value={status} onChange={setStatus} options={statusOptions} />
            <Select value={latencyUnit} onChange={(v) => setLatencyUnit(v as LatencyUnit)} options={latencyUnitOptions} />
            <TextInput value={from} onChange={setFrom} placeholder={t('common.from')} type="datetime-local" />
            <TextInput value={to} onChange={setTo} placeholder={t('common.to')} type="datetime-local" />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader title={t('dashboard.cards.requests.title')} description={t('dashboard.cards.requests.description')} />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {(m?.totalRequests ?? 0).toLocaleString('pt-BR')}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">{t('dashboard.cards.requests.note')}</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader title={t('dashboard.cards.errors.title')} description={t('dashboard.cards.errors.description')} />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {(m?.errorRequests ?? 0).toLocaleString('pt-BR')}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">{t('dashboard.cards.errors.note')}</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader
            title={t('dashboard.cards.latencyAvg.title')}
            description={t('dashboard.cards.latencyAvg.description').replace(/\([^)]*\)/, `(${latencyUnitLabel})`)}
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {formatLatency(m?.avgLatencyMs ?? null, latencyUnit)}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">{t('dashboard.cards.latencyAvg.note')}</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader
            title={t('dashboard.cards.latencyP95.title')}
            description={t('dashboard.cards.latencyP95.description').replace(/\([^)]*\)/, `(${latencyUnitLabel})`)}
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {formatLatency(m?.p95LatencyMs ?? null, latencyUnit)}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">{t('dashboard.cards.latencyP95.note')}</div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('dashboard.topApis.title')}
            description={t('dashboard.topApis.description')}
            right={
              <div className="text-xs text-white/55">
                {loading ? 'Atualizando…' : `Atualiza a cada ${Math.max(1, Math.round(metricsRefetch / 1000))}s`}
              </div>
            }
          />
          <CardBody>
            {(m?.topApis ?? []).length ? (
              <div className="grid gap-3">
                {(() => {
                  const max = Math.max(
                    ...(m?.topApis ?? []).map((x: { apiSlug: string; requests: number }) => x.requests),
                    1,
                  );
                  return (m?.topApis ?? []).map((a: { apiSlug: string; requests: number }) => (
                    <div key={a.apiSlug} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white/85">/{a.apiSlug}</div>
                        <div className="text-sm text-white/70">{a.requests.toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
                          style={{ width: `${Math.round((a.requests / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="text-sm text-white/60">{loading ? 'Carregando…' : 'Sem dados ainda.'}</div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title={t('dashboard.status.title')} description={t('dashboard.status.description')} />
          <CardBody>
            {(metaStatusQ.data?.statuses ?? metaApisQ.data?.statuses ?? []).length ? (
              <div className="grid gap-3">
                {(() => {
                  const items = (metaStatusQ.data?.statuses ?? metaApisQ.data?.statuses ?? []).slice(0, 8);
                  const max = Math.max(...items.map((x) => x.count), 1);
                  return (
                    <div className="flex items-end gap-3">
                      {items.map((s) => {
                        const pct = Math.round((s.count / max) * 100);
                        const h = s.count > 0 ? Math.max(3, pct) : 0;
                        return (
                          <div key={s.value} className="flex flex-1 flex-col items-center gap-2">
                            <div className="text-xs text-white/70">{s.count.toLocaleString('pt-BR')}</div>
                            <div className="relative h-28 w-4 overflow-hidden rounded-full bg-white/5">
                              <div
                                className="absolute bottom-0 left-0 w-full rounded-full bg-[linear-gradient(180deg,var(--accent),var(--accent-2))]"
                                style={{ height: `${h}%` }}
                              />
                            </div>
                            <Badge tone={toneForStatus(s.value)}>{s.value}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-white/60">{listQ.isPending ? 'Carregando…' : 'Sem dados.'}</div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t('dashboard.executions.title')} description={t('dashboard.executions.description')} />
        <CardBody>
          <DataTable<LogRow>
            rows={rows}
            keyField={(r) => r.id}
            pageSize={20}
            columns={[
              {
                key: 'm',
                header: t('common.method'),
                render: (r) => <MethodBadge method={r.method} />,
                sortValue: (r) => r.method,
                filterValue: (r) => r.method,
              },
              {
                key: 'api',
                header: 'Slug',
                render: (r) => <div className="text-white/80">{r.apiSlug ? `/${r.apiSlug}` : '—'}</div>,
                sortValue: (r) => r.apiSlug ?? '',
                filterValue: (r) => r.apiSlug ?? '',
              },
              {
                key: 'path',
                header: t('common.path'),
                render: (r) => <div className="text-white/80">{r.publicPath ?? '—'}</div>,
                sortValue: (r) => r.publicPath ?? '',
                filterValue: (r) => r.publicPath ?? '',
              },
              {
                key: 'status',
                header: t('common.statusLabel'),
                render: (r) => <Badge tone={toneForStatus(r.statusCode)}>{r.statusCode ?? '—'}</Badge>,
                sortValue: (r) => r.statusCode ?? 0,
                filterValue: (r) => String(r.statusCode ?? ''),
              },
              {
                key: 'lat',
                header: t('common.latency'),
                render: (r) => <div className="text-white/70">{formatLatency(r.durationMs, latencyUnit)}</div>,
                sortValue: (r) => r.durationMs ?? 0,
                filterValue: (r) => String(r.durationMs ?? ''),
              },
              {
                key: 'reqAt',
                header: t('common.requestAt'),
                render: (r) => <div className="text-xs text-white/70">{formatDateTime(r.createdAt, tz)}</div>,
                sortValue: (r) => r.createdAt,
                filterValue: (r) => r.createdAt,
              },
              {
                key: 'resAt',
                header: t('common.responseAt'),
                render: (r) => <div className="text-xs text-white/70">{formatDateTime(r.responseAt, tz)}</div>,
                sortValue: (r) => r.responseAt ?? '',
                filterValue: (r) => r.responseAt ?? '',
              },
              {
                key: 'act',
                header: t('common.actions'),
                render: (r) => (
                  <Button variant="secondary" size="sm" onClick={() => setOpenId(r.id)}>
                    {t('common.view')}
                  </Button>
                ),
              },
            ]}
            mobileCard={(r) => (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <MethodBadge method={r.method} />
                  <Badge tone={toneForStatus(r.statusCode)}>{r.statusCode ?? '—'}</Badge>
                </div>
                <div className="text-sm text-white/80">
                  {r.apiSlug ? `/${r.apiSlug}` : '—'} {r.publicPath ?? ''}
                </div>
                <div className="text-xs text-white/55">
                  {formatDateTime(r.createdAt, tz)} • {formatLatency(r.durationMs, latencyUnit)}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setOpenId(r.id)}>
                  {t('common.view')}
                </Button>
              </div>
            )}
            empty="Sem logs ainda."
          />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={t('dashboard.endpointReport.title')}
          description={t('dashboard.endpointReport.description')}
          right={
            <div className="text-xs text-white/55">
              {endpointQ.isPending ? 'Carregando…' : `${(endpointQ.data ?? []).length} endpoints`}
            </div>
          }
        />
        <CardBody>
          <DataTable<EndpointReportRow>
            rows={endpointQ.data ?? []}
            keyField={(r) => `${r.method}:${r.apiSlug}:${r.publicPath}`}
            pageSize={15}
            columns={[
              {
                key: 'm',
                header: t('common.method'),
                render: (r) => <MethodBadge method={r.method} />,
                sortValue: (r) => r.method,
                filterValue: (r) => r.method,
              },
              {
                key: 'api',
                header: 'Slug',
                render: (r) => <div className="text-white/80">/{r.apiSlug}</div>,
                sortValue: (r) => r.apiSlug,
                filterValue: (r) => r.apiSlug,
              },
              {
                key: 'path',
                header: t('common.path'),
                render: (r) => <div className="text-white/80">{r.publicPath}</div>,
                sortValue: (r) => r.publicPath,
                filterValue: (r) => r.publicPath,
              },
              {
                key: 'total',
                header: 'Total',
                render: (r) => <div className="text-white/80">{r.total.toLocaleString('pt-BR')}</div>,
                sortValue: (r) => r.total,
                filterValue: (r) => String(r.total),
              },
              {
                key: 'success',
                header: 'Sucesso',
                render: (r) => <div className="text-white/80">{r.success.toLocaleString('pt-BR')}</div>,
                sortValue: (r) => r.success,
                filterValue: (r) => String(r.success),
              },
              {
                key: 'error',
                header: 'Erros',
                render: (r) => <div className="text-white/80">{r.error.toLocaleString('pt-BR')}</div>,
                sortValue: (r) => r.error,
                filterValue: (r) => String(r.error),
              },
              {
                key: 'avg',
                header: 'AVG',
                render: (r) => <div className="text-white/70">{formatLatency(r.avgLatencyMs, latencyUnit)}</div>,
                sortValue: (r) => r.avgLatencyMs ?? 0,
                filterValue: (r) => String(r.avgLatencyMs ?? ''),
              },
              {
                key: 'p95',
                header: 'P95',
                render: (r) => <div className="text-white/70">{formatLatency(r.p95LatencyMs, latencyUnit)}</div>,
                sortValue: (r) => r.p95LatencyMs ?? 0,
                filterValue: (r) => String(r.p95LatencyMs ?? ''),
              },
            ]}
            empty={endpointQ.isPending ? t('common.loading') : t('common.noData')}
          />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={t('dashboard.heatmap.title')}
          description={t('dashboard.heatmap.description')}
          right={
            <div className="text-xs text-white/55">
              {heatmapQ.isPending ? 'Carregando…' : 'Últimas 24h ou janela selecionada'}
            </div>
          }
        />
        <CardBody>
          {(() => {
            const cells = heatmapQ.data ?? [];
            const map = new Map<string, HeatmapCell>();
            for (const c of cells) map.set(`${c.dow}:${c.hour}`, c);

            const days: Array<{ key: number; label: string }> = [
              { key: 1, label: 'Seg' },
              { key: 2, label: 'Ter' },
              { key: 3, label: 'Qua' },
              { key: 4, label: 'Qui' },
              { key: 5, label: 'Sex' },
              { key: 6, label: 'Sáb' },
              { key: 0, label: 'Dom' },
            ];
            const hours = Array.from({ length: 24 }, (_, i) => i);

            const maxTotal = Math.max(1, ...cells.map((c) => c.total));
            const maxErrors = Math.max(1, ...cells.map((c) => c.errors));

            const cellBox = 'h-5 w-5 rounded-md border border-white/10';
            const heatColor = (v: number, max: number, base: 'accent' | 'danger') => {
              const ratio = max <= 0 ? 0 : v / max;
              const a = Math.min(0.9, Math.max(0.06, ratio * 0.9));
              if (base === 'danger') return `rgba(244,63,94,${a})`;
              return `rgba(124,58,237,${a})`;
            };

            const grid = (kind: 'total' | 'errors') => (
              <div className="overflow-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[48px_repeat(24,1fr)] gap-1">
                    <div />
                    {hours.map((h) => (
                      <div key={h} className="text-center text-[10px] text-white/45">
                        {h}
                      </div>
                    ))}
                    {days.map((d) => (
                      <>
                        <div key={`lbl-${d.key}`} className="flex items-center text-xs text-white/70">
                          {d.label}
                        </div>
                        {hours.map((h) => {
                          const c = map.get(`${d.key}:${h}`) ?? { dow: d.key, hour: h, total: 0, errors: 0 };
                          const v = kind === 'total' ? c.total : c.errors;
                          const max = kind === 'total' ? maxTotal : maxErrors;
                          const bg = heatColor(v, max, kind === 'total' ? 'accent' : 'danger');
                          const title =
                            kind === 'total'
                              ? `${d.label} ${String(h).padStart(2, '0')}:00 — ${c.total} ${t('dashboard.cards.requests.title')}`
                              : `${d.label} ${String(h).padStart(2, '0')}:00 — ${c.errors} ${t('dashboard.heatmap.errors')}`;
                          return (
                            <div
                              key={`${d.key}:${h}:${kind}`}
                              className={cellBox}
                              style={{ backgroundColor: bg }}
                              title={title}
                            />
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              </div>
            );

            return (
              <div className="grid gap-6">
                <div>
                  <div className="text-xs font-medium text-white/70">{t('dashboard.heatmap.traffic')}</div>
                  <div className="mt-3">{grid('total')}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-white/70">{t('dashboard.heatmap.errors')}</div>
                  <div className="mt-3">{grid('errors')}</div>
                </div>
                {heatmapQ.isPending ? <div className="text-sm text-white/60">Carregando…</div> : null}
              </div>
            );
          })()}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title={t('dashboard.logDetail.title')}
        size="full"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenId(null)}>
              {t('common.close')}
            </Button>
          </div>
        }
      >
        {detailQ.isPending ? (
          <div className="text-sm text-white/70">Carregando…</div>
        ) : detail ? (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('common.originalUrl')}</div>
                <div className="mt-2 break-words text-sm text-white/80">{detail.originalUrl}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('common.finalUrl')}</div>
                <div className="mt-2 break-words text-sm text-white/80">{detail.finalUrl ?? '—'}</div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('common.requestAt')}</div>
                <div className="mt-2 text-sm text-white/80">{formatDateTime(detail.createdAt, tz)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('common.responseAt')}</div>
                <div className="mt-2 text-sm text-white/80">{formatDateTime(detail.responseAt, tz)}</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('dashboard.logDetail.requestHeaders')}</div>
                <pre className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {JSON.stringify(detail.requestHeaders ?? {}, null, 2)}
                </pre>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('dashboard.logDetail.responseHeaders')}</div>
                <pre className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {JSON.stringify(detail.responseHeaders ?? {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">{t('dashboard.logDetail.requestBody')}</div>
                <pre
                  className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {detail.requestBody ?? '—'}
                </pre>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-white/70">{t('dashboard.logDetail.responseBody')}</div>
                  <Button variant="ghost" size="sm" onClick={downloadResponseBody} disabled={!detail.responseBody}>
                    {t('common.download')}
                  </Button>
                </div>
                <pre
                  className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {detail.responseBody ?? '—'}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-white/70">Sem dados.</div>
        )}
      </Modal>
    </PageShell>
  );
}
