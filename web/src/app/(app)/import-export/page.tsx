'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { useI18n } from '@/components/i18n-provider';
import { ConfirmModal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, MethodBadge, PageShell, TextInput, cn, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Api = { id: string; name: string; slug: string; description?: string | null };
type Path = { id: string; apiId: string; name: string; publicPath: string; method: string; enabled: boolean };

type HistoryRow = {
  id: string;
  createdAt: string;
  createdByUsername: string;
  summary: Record<string, unknown>;
  applied: Record<string, unknown>;
  undoneAt: string | null;
  undoneByUsername: string | null;
};

type AppliedImpact = {
  apis: Array<{ slug: string; action?: string }>;
  paths: Array<{ apiSlug: string; method: string; publicPath: string; action?: string }>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function parseApplied(input: unknown): AppliedImpact {
  if (!isPlainObject(input)) return { apis: [], paths: [] };
  const apisRaw = (input as Record<string, unknown>).apis;
  const pathsRaw = (input as Record<string, unknown>).paths;

  const apis = Array.isArray(apisRaw)
    ? apisRaw
        .map((x) => (isPlainObject(x) ? x : null))
        .filter(Boolean)
        .map((x) => ({
          slug: String((x as Record<string, unknown>).slug ?? '').trim(),
          action: String((x as Record<string, unknown>).action ?? '').trim() || undefined,
        }))
        .filter((x) => x.slug)
    : [];

  const paths = Array.isArray(pathsRaw)
    ? pathsRaw
        .map((x) => (isPlainObject(x) ? x : null))
        .filter(Boolean)
        .map((x) => ({
          apiSlug: String((x as Record<string, unknown>).apiSlug ?? '').trim(),
          method: String((x as Record<string, unknown>).method ?? '').trim(),
          publicPath: String((x as Record<string, unknown>).publicPath ?? '').trim(),
          action: String((x as Record<string, unknown>).action ?? '').trim() || undefined,
        }))
        .filter((x) => x.apiSlug && x.method && x.publicPath)
    : [];

  return { apis, paths };
}

function routeKey(method: string, publicPath: string) {
  return `${String(method ?? '').trim().toUpperCase()} ${String(publicPath ?? '').trim()}`;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatDateTime(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function ImportExportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  const apisQ = useQuery({
    queryKey: ['apis'],
    queryFn: () => apiFetch<Api[]>('/admin/apis'),
  });

  const pathsQ = useQuery({
    queryKey: ['paths'],
    queryFn: () => apiFetch<Path[]>('/admin/paths'),
  });

  const historyQ = useQuery({
    queryKey: ['import-export-history'],
    queryFn: () => apiFetch<HistoryRow[]>('/admin/import-export/history'),
  });

  const apis = useMemo(() => (apisQ.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [apisQ.data]);
  const paths = useMemo(() => pathsQ.data ?? [], [pathsQ.data]);

  const apiSlugById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of apis) m[a.id] = a.slug;
    return m;
  }, [apis]);

  const routesBySlug = useMemo(() => {
    const m: Record<string, Path[]> = {};
    for (const p of paths) {
      const slug = apiSlugById[p.apiId];
      if (!slug) continue;
      if (!m[slug]) m[slug] = [];
      m[slug]!.push(p);
    }
    for (const slug of Object.keys(m)) {
      m[slug] = m[slug]!.slice().sort((a, b) => {
        const mk = routeKey(a.method, a.publicPath);
        const nk = routeKey(b.method, b.publicPath);
        return mk.localeCompare(nk);
      });
    }
    return m;
  }, [apiSlugById, paths]);

  const [filter, setFilter] = useState('');
  const visibleApis = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return apis;
    return apis.filter((a) => `${a.name} ${a.slug}`.toLowerCase().includes(f));
  }, [apis, filter]);

  const [sel, setSel] = useState<Record<
    string,
    { checked: boolean; allRoutes: boolean; routes: Record<string, boolean>; expanded: boolean }
  >>({});

  const setApiChecked = (slug: string, checked: boolean) => {
    setSel((prev) => {
      const next = { ...prev };
      const current = next[slug] ?? { checked: false, allRoutes: true, routes: {}, expanded: false };
      next[slug] = { ...current, checked };
      return next;
    });
  };

  const setApiAllRoutes = (slug: string, allRoutes: boolean) => {
    setSel((prev) => {
      const next = { ...prev };
      const current = next[slug] ?? { checked: false, allRoutes: true, routes: {}, expanded: false };
      next[slug] = { ...current, allRoutes, expanded: !allRoutes };
      return next;
    });
  };

  const toggleRoute = (slug: string, rk: string) => {
    setSel((prev) => {
      const next = { ...prev };
      const current = next[slug] ?? { checked: false, allRoutes: true, routes: {}, expanded: false };
      next[slug] = {
        ...current,
        routes: { ...current.routes, [rk]: !current.routes[rk] },
      };
      return next;
    });
  };

  const selectAll = () => {
    setSel(() => {
      const out: Record<string, { checked: boolean; allRoutes: boolean; routes: Record<string, boolean>; expanded: boolean }> = {};
      for (const a of apis) out[a.slug] = { checked: true, allRoutes: true, routes: {}, expanded: false };
      return out;
    });
  };

  const clearAll = () => setSel({});

  const buildSelection = () => {
    const apisSel: Array<{ slug: string; routes?: Array<{ publicPath: string; method: string }> }> = [];
    for (const a of apis) {
      const s = sel[a.slug];
      if (!s?.checked) continue;
      if (s.allRoutes) {
        apisSel.push({ slug: a.slug });
        continue;
      }
      const selectedKeys = Object.entries(s.routes).filter(([, v]) => v).map(([k]) => k);
      const routes = selectedKeys
        .map((rk) => {
          const [method, ...rest] = rk.split(' ');
          const publicPath = rest.join(' ');
          return { method, publicPath };
        })
        .filter((r) => r.method && r.publicPath);
      apisSel.push({ slug: a.slug, routes });
    }
    return { apis: apisSel };
  };

  const exportMut = useMutation({
    mutationFn: async () => {
      const selection = buildSelection();
      return apiFetch<unknown>('/admin/import-export/export', {
        method: 'POST',
        body: JSON.stringify({ selection }),
      });
    },
    onSuccess: (file) => {
      const json = JSON.stringify(file, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replaceAll(':', '-');
      a.href = url;
      a.download = `openroutex-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('common.success'), 'Arquivo exportado.');
    },
    onError: (e: unknown) => toast.error('Falha ao exportar', (e as { message?: string })?.message ?? t('common.failure')),
  });

  const [importText, setImportText] = useState('');
  const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);

  const importJson = useMemo(() => safeJsonParse(importText), [importText]);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!importJson) throw new Error('Arquivo inválido');
      return apiFetch<unknown>('/admin/import-export/import', {
        method: 'POST',
        body: JSON.stringify({ file: importJson }),
      });
    },
    onSuccess: async () => {
      toast.success(t('common.success'), 'Importação aplicada.');
      setImportText('');
      await qc.invalidateQueries({ queryKey: ['import-export-history'] });
      await qc.invalidateQueries({ queryKey: ['apis'] });
      await qc.invalidateQueries({ queryKey: ['paths'] });
      await qc.invalidateQueries({ queryKey: ['apikeys'] });
      await qc.invalidateQueries({ queryKey: ['certificates'] });
      await qc.invalidateQueries({ queryKey: ['auths'] });
    },
    onError: (e: unknown) => toast.error('Falha ao importar', (e as { message?: string })?.message ?? t('common.failure')),
  });

  const undoMut = useMutation({
    mutationFn: (id: string) => apiFetch('/admin/import-export/history/' + encodeURIComponent(id) + '/undo', { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('common.success'), 'Importação desfeita.');
      await qc.invalidateQueries({ queryKey: ['import-export-history'] });
      await qc.invalidateQueries({ queryKey: ['apis'] });
      await qc.invalidateQueries({ queryKey: ['paths'] });
      await qc.invalidateQueries({ queryKey: ['apikeys'] });
      await qc.invalidateQueries({ queryKey: ['certificates'] });
      await qc.invalidateQueries({ queryKey: ['auths'] });
    },
    onError: (e: unknown) => toast.error('Falha ao desfazer', (e as { message?: string })?.message ?? t('common.failure')),
  });

  const historyRows = useMemo(() => historyQ.data ?? [], [historyQ.data]);

  return (
    <>
      <PageShell
        title={t('nav.importExport')}
        subtitle="Exporte configurações de serviços e rotas para mover entre DEV/QUA/PRD. Importações ficam registradas e podem ser desfeitas."
      >
        <div className="grid gap-5">
          <Card>
            <CardHeader
              title="Exportar"
              description="Escolha serviços e, se quiser, restrinja quais rotas entram no arquivo."
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={selectAll} disabled={!apis.length}>
                    Exportar tudo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll} disabled={!Object.keys(sel).length}>
                    Limpar
                  </Button>
                  <Button onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
                    Exportar JSON
                  </Button>
                </div>
              }
            />
            <CardBody>
              <div className="grid gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="w-full sm:max-w-md">
                    <TextInput value={filter} onChange={setFilter} placeholder="Filtrar serviços…" />
                  </div>
                  <div className="text-xs text-white/55">
                    {apisQ.isPending || pathsQ.isPending ? 'Carregando…' : `${visibleApis.length} serviços`}
                  </div>
                </div>

                <div className="grid gap-2">
                  {visibleApis.map((a) => {
                    const s = sel[a.slug] ?? { checked: false, allRoutes: true, routes: {}, expanded: false };
                    const routes = routesBySlug[a.slug] ?? [];
                    return (
                      <div key={a.slug} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex min-w-0 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={s.checked}
                              onChange={(e) => setApiChecked(a.slug, e.target.checked)}
                              className="h-4 w-4 rounded border-white/20 bg-white/5"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white/85">
                                {a.name} <span className="font-mono text-white/50">/{a.slug}</span>
                              </div>
                              {a.description ? <div className="truncate text-xs text-white/55">{a.description}</div> : null}
                            </div>
                          </label>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className={cn('flex items-center gap-2 text-xs', s.checked ? 'text-white/70' : 'text-white/35')}>
                              <input
                                type="checkbox"
                                checked={s.allRoutes}
                                onChange={(e) => setApiAllRoutes(a.slug, e.target.checked)}
                                disabled={!s.checked}
                                className="h-4 w-4 rounded border-white/20 bg-white/5"
                              />
                              Todas as rotas ({routes.length})
                            </label>
                          </div>
                        </div>

                        {s.checked && !s.allRoutes && s.expanded ? (
                          <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-white/55">Marque as rotas que entram no export.</div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const all: Record<string, boolean> = {};
                                  for (const r of routes) all[routeKey(r.method, r.publicPath)] = true;
                                  setSel((prev) => ({ ...prev, [a.slug]: { ...s, routes: all } }));
                                }}
                              >
                                Marcar todas
                              </Button>
                            </div>

                            <div className="grid gap-1">
                              {routes.map((r) => {
                                const rk = routeKey(r.method, r.publicPath);
                                const checked = Boolean(s.routes[rk]);
                                return (
                                  <label key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleRoute(a.slug, rk)}
                                        className="h-4 w-4 rounded border-white/20 bg-white/5"
                                      />
                                      <MethodBadge method={r.method} />
                                      <div className="min-w-0 truncate text-sm text-white/80">
                                        {r.publicPath} <span className="text-white/45">— {r.name}</span>
                                      </div>
                                    </div>
                                    {r.enabled ? <Badge tone="success">ON</Badge> : <Badge tone="danger">OFF</Badge>}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Importar" description="Envie um JSON exportado e aplique no ambiente atual." right={
              <Button
                onClick={() => {
                  setConfirm({
                    title: 'Confirmar importação',
                    description: 'Isto vai criar/atualizar serviços e rotas conforme o arquivo. Deseja continuar?',
                    onConfirm: () => {
                      setConfirm(null);
                      importMut.mutate();
                    },
                  });
                }}
                disabled={!importJson || importMut.isPending}
              >
                Importar JSON
              </Button>
            } />
            <CardBody>
              <div className="grid gap-3">
                <input
                  type="file"
                  accept="application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const txt = String(reader.result ?? '');
                      setImportText(txt);
                    };
                    reader.readAsText(f);
                    e.currentTarget.value = '';
                  }}
                  className="block w-full text-sm text-white/80 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/15"
                />

                {importText ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/70">Preview</div>
                    <div className="mt-1 text-sm text-white/85">
                      {importJson ? 'JSON válido.' : 'JSON inválido.'}
                    </div>
                    <div className="mt-2 text-xs text-white/55">
                      Este modo exporta credenciais/certificados sem segredos. Se o ambiente não tiver os segredos, a importação pode manter valores atuais ou pular criação/alterações sensíveis.
                    </div>
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Histórico de importações" description="Para ficar visível o que foi aplicado em deploys." />
            <CardBody>
              <DataTable<HistoryRow>
                rows={historyRows}
                keyField={(r) => r.id}
                filterPlaceholder="Filtrar histórico…"
                initialSort={{ key: 'createdAt', dir: 'desc' }}
                columns={[
                  {
                    key: 'createdAt',
                    header: 'Data/Hora',
                    sortValue: (r) => new Date(r.createdAt).getTime(),
                    render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
                    filterValue: (r) => `${r.createdAt}`,
                  },
                  {
                    key: 'user',
                    header: 'Usuário',
                    render: (r) => <span className="font-medium">{r.createdByUsername}</span>,
                    filterValue: (r) => r.createdByUsername,
                  },
                  {
                    key: 'impact',
                    header: 'Impacto',
                    render: (r) => {
                      const impact = parseApplied(r.applied);
                      const apisApplied = impact.apis;
                      const pathsApplied = impact.paths;
                      return (
                        <div className="grid gap-1">
                          <div className="text-xs text-white/70">
                            Serviços: <span className="text-white/85">{apisApplied.length}</span> • Rotas:{' '}
                            <span className="text-white/85">{pathsApplied.length}</span>
                          </div>
                          <div className="max-w-[520px] truncate text-xs text-white/55">
                            {pathsApplied.slice(0, 3).map((p) => `${p.method} ${p.publicPath}`).join(' • ')}
                            {pathsApplied.length > 3 ? ` • +${pathsApplied.length - 3}` : ''}
                          </div>
                        </div>
                      );
                    },
                    filterValue: (r) => {
                      const impact = parseApplied(r.applied);
                      return impact.paths.map((p) => `${p.apiSlug} ${p.method} ${p.publicPath}`).join(' ');
                    },
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) =>
                      r.undoneAt ? (
                        <div className="grid gap-1">
                          <Badge tone="warning">Desfeito</Badge>
                          <div className="text-xs text-white/55">
                            {formatDateTime(r.undoneAt)} {r.undoneByUsername ? `• ${r.undoneByUsername}` : ''}
                          </div>
                        </div>
                      ) : (
                        <Badge tone="success">Aplicado</Badge>
                      ),
                    filterValue: (r) => (r.undoneAt ? 'undone' : 'applied'),
                  },
                  {
                    key: 'actions',
                    header: 'Ações',
                    render: (r) => (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={Boolean(r.undoneAt) || undoMut.isPending}
                        onClick={() => {
                          setConfirm({
                            title: 'Desfazer importação',
                            description: 'Isto vai restaurar o snapshot anterior e pode sobrescrever alterações posteriores. Deseja continuar?',
                            onConfirm: () => {
                              setConfirm(null);
                              undoMut.mutate(r.id);
                            },
                          });
                        }}
                      >
                        Desfazer
                      </Button>
                    ),
                  },
                ]}
                mobileCard={(r) => {
                  const impact = parseApplied(r.applied);
                  const apisApplied = impact.apis;
                  const pathsApplied = impact.paths;
                  return (
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-white/85">{formatDateTime(r.createdAt)}</div>
                        {r.undoneAt ? <Badge tone="warning">Desfeito</Badge> : <Badge tone="success">Aplicado</Badge>}
                      </div>
                      <div className="text-xs text-white/70">Usuário: {r.createdByUsername}</div>
                      <div className="text-xs text-white/70">
                        Serviços: {apisApplied.length} • Rotas: {pathsApplied.length}
                      </div>
                      <div className="pt-1">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={Boolean(r.undoneAt) || undoMut.isPending}
                          onClick={() => {
                            setConfirm({
                              title: 'Desfazer importação',
                              description: 'Isto vai restaurar o snapshot anterior e pode sobrescrever alterações posteriores. Deseja continuar?',
                              onConfirm: () => {
                                setConfirm(null);
                                undoMut.mutate(r.id);
                              },
                            });
                          }}
                        >
                          Desfazer
                        </Button>
                      </div>
                    </div>
                  );
                }}
              />
            </CardBody>
          </Card>
        </div>
      </PageShell>

      {confirm ? (
        <ConfirmModal
          open
          title={confirm.title}
          description={confirm.description}
          confirmText="Confirmar"
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
