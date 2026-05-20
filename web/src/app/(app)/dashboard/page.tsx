'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
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

type LogsMetaDto = {
  apiSlugs: Array<{ value: string; count: number }>;
  paths: Array<{ value: string; count: number }>;
  statuses: Array<{ value: number; count: number }>;
};

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
  const toast = useToast();
  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsDto>('/admin/settings'),
  });
  const tz = settingsQ.data?.timezone || 'UTC';
  const metricsRefetch = settingsQ.data?.dashboardMetricsRefetchMs ?? 5000;
  const logsRefetch = settingsQ.data?.dashboardLogsRefetchMs ?? 2000;

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
    if (!openFromUrl) return;
    const t = setTimeout(() => setOpenId(openFromUrl), 0);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => clearTimeout(t);
  }, [openFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => setPath(''), 0);
    return () => clearTimeout(t);
  }, [api]);

  const q = useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiFetch<Metrics>('/admin/metrics'),
    refetchInterval: metricsRefetch,
  });

  const metaApisQ = useQuery({
    queryKey: ['logs-meta-apis', from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      return apiFetch<LogsMetaDto>(`/admin/logs/meta?${qs.toString()}`);
    },
  });

  const metaPathsQ = useQuery({
    queryKey: ['logs-meta-paths', api, from, to, tz],
    enabled: Boolean(api),
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set('api', api);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      return apiFetch<LogsMetaDto>(`/admin/logs/meta?${qs.toString()}`);
    },
  });

  const metaStatusQ = useQuery({
    queryKey: ['logs-meta-status', api, path, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (api) qs.set('api', api);
      if (path) qs.set('path', path);
      const fromIso = from ? zonedDateTimeLocalToUtcIso(from, tz) : null;
      const toIso = to ? zonedDateTimeLocalToUtcIso(to, tz) : null;
      if (fromIso) qs.set('from', fromIso);
      if (toIso) qs.set('to', toIso);
      return apiFetch<LogsMetaDto>(`/admin/logs/meta?${qs.toString()}`);
    },
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

  const detailQ = useQuery({
    queryKey: ['log', openId],
    queryFn: () => apiFetch<LogDetailDto | null>(`/admin/logs/${openId}`),
    enabled: Boolean(openId),
  });

  const m = q.data;
  const loading = q.isPending;
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
    toast.info('Download', `openroutex-logs.${format}`);
  };

  return (
    <PageShell
      title="Dashboard"
      subtitle="Métricas de uso e status operacional (janela de 24h)."
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader title="Requests" description="Total (24h)" />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {(m?.totalRequests ?? 0).toLocaleString('pt-BR')}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">Inclui todas as rotas.</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader title="Errors" description="Status != 2xx" />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {(m?.errorRequests ?? 0).toLocaleString('pt-BR')}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">Falhas e bloqueios.</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader title="Latency" description="AVG (ms)" />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {m?.avgLatencyMs ?? '—'}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">Tempo até resposta.</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader title="Latency" description="P95 (ms)" />
          <CardBody>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold text-zinc-50">
                {m?.p95LatencyMs ?? '—'}
              </div>
            )}
            <div className="mt-2 text-sm text-white/55">Cauda de performance.</div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Top APIs"
            description="Mais chamadas (24h)"
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
          <CardHeader title="Status" description="Distribuição (filtros atuais)" />
          <CardBody>
            {(metaStatusQ.data?.statuses ?? metaApisQ.data?.statuses ?? []).length ? (
              <div className="grid gap-3">
                {(() => {
                  const items = (metaStatusQ.data?.statuses ?? metaApisQ.data?.statuses ?? []).slice(0, 8);
                  const max = Math.max(...items.map((x) => x.count), 1);
                  return items.map((s) => (
                    <div key={s.value} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Badge tone={toneForStatus(s.value)}>{s.value}</Badge>
                        <div className="text-sm text-white/70">{s.count.toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
                          style={{ width: `${Math.round((s.count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="text-sm text-white/60">{listQ.isPending ? 'Carregando…' : 'Sem dados.'}</div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Filtros"
          description="Filtre por slug, rota, status e janela de data/hora."
          right={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void downloadLogs('csv')}>
                Export CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void downloadLogs('json')}>
                Export JSON
              </Button>
              <div className="text-xs text-white/55">
                {listQ.isPending ? 'Carregando…' : `Atualiza a cada ${Math.max(1, Math.round(logsRefetch / 1000))}s`}
              </div>
            </div>
          }
        />
        <CardBody>
          <div className="grid gap-3 lg:grid-cols-5">
            <Select value={api} onChange={setApi} options={apiOptions} />
            <Select value={path} onChange={setPath} options={pathOptions} />
            <Select value={status} onChange={setStatus} options={statusOptions} />
            <TextInput value={from} onChange={setFrom} placeholder="From" type="datetime-local" />
            <TextInput value={to} onChange={setTo} placeholder="To" type="datetime-local" />
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Execuções" description="Lista em tempo real (clique para ver detalhes)." />
        <CardBody>
          <DataTable<LogRow>
            rows={rows}
            keyField={(r) => r.id}
            pageSize={20}
            columns={[
              {
                key: 'm',
                header: 'Method',
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
                header: 'Path',
                render: (r) => <div className="text-white/80">{r.publicPath ?? '—'}</div>,
                sortValue: (r) => r.publicPath ?? '',
                filterValue: (r) => r.publicPath ?? '',
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge tone={toneForStatus(r.statusCode)}>{r.statusCode ?? '—'}</Badge>,
                sortValue: (r) => r.statusCode ?? 0,
                filterValue: (r) => String(r.statusCode ?? ''),
              },
              {
                key: 'lat',
                header: 'Latency',
                render: (r) => <div className="text-white/70">{r.durationMs ?? '—'} ms</div>,
                sortValue: (r) => r.durationMs ?? 0,
                filterValue: (r) => String(r.durationMs ?? ''),
              },
              {
                key: 'reqAt',
                header: 'Request At',
                render: (r) => <div className="text-xs text-white/70">{formatDateTime(r.createdAt, tz)}</div>,
                sortValue: (r) => r.createdAt,
                filterValue: (r) => r.createdAt,
              },
              {
                key: 'resAt',
                header: 'Response At',
                render: (r) => <div className="text-xs text-white/70">{formatDateTime(r.responseAt, tz)}</div>,
                sortValue: (r) => r.responseAt ?? '',
                filterValue: (r) => r.responseAt ?? '',
              },
              {
                key: 'act',
                header: 'Actions',
                render: (r) => (
                  <Button variant="secondary" size="sm" onClick={() => setOpenId(r.id)}>
                    View
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
                  {formatDateTime(r.createdAt, tz)} • {r.durationMs ?? '—'} ms
                </div>
                <Button variant="secondary" size="sm" onClick={() => setOpenId(r.id)}>
                  View
                </Button>
              </div>
            )}
            empty="Sem logs ainda."
          />
        </CardBody>
      </Card>

      <Modal
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title="Log Detail"
        size="full"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenId(null)}>
              Close
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
                <div className="text-xs font-medium text-white/70">Original URL</div>
                <div className="mt-2 break-words text-sm text-white/80">{detail.originalUrl}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">Final URL</div>
                <div className="mt-2 break-words text-sm text-white/80">{detail.finalUrl ?? '—'}</div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">Request At</div>
                <div className="mt-2 text-sm text-white/80">{formatDateTime(detail.createdAt, tz)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">Response At</div>
                <div className="mt-2 text-sm text-white/80">{formatDateTime(detail.responseAt, tz)}</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">Request Headers</div>
                <pre className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {JSON.stringify(detail.requestHeaders ?? {}, null, 2)}
                </pre>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">Response Headers</div>
                <pre className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {JSON.stringify(detail.responseHeaders ?? {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/70">Request Body (raw)</div>
                <pre
                  className="mt-3 max-w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {detail.requestBody ?? '—'}
                </pre>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-white/70">Response Body (raw)</div>
                  <Button variant="ghost" size="sm" onClick={downloadResponseBody} disabled={!detail.responseBody}>
                    Download
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
