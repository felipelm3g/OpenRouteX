'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { ConfirmModal, Modal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, MethodBadge, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { detectVariables, detectVariablesInRecord } from '@/lib/vars';

type Api = { id: string; name: string; slug: string };
type Auth = { id: string; name: string; type: string };
type SettingsDto = { defaultForwardClientQuery: boolean; proxyTimeoutMs: number };
type Path = {
  id: string;
  apiId: string;
  name: string;
  publicPath: string;
  method: string;
  targetUrlTemplate: string;
  authId: string | null;
  enabled: boolean;
  requireClientAuth: boolean;
  addHeaders: Record<string, string>;
  addQuery: Record<string, string>;
  forwardClientQuery: boolean;
  timeoutSeconds: number | null;
  createdAt: string;
};

function errorMessage(e: unknown) {
  if (!e || typeof e !== 'object') return 'Falha';
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim() ? msg : 'Falha';
}

export default function PathsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [focus, setFocus] = useState('');

  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: () => apiFetch<SettingsDto>('/admin/settings') });
  const defaultForward = settingsQ.data?.defaultForwardClientQuery ?? true;

  const apisQ = useQuery({ queryKey: ['apis'], queryFn: () => apiFetch<Api[]>('/admin/apis') });
  const authsQ = useQuery({ queryKey: ['auths'], queryFn: () => apiFetch<Auth[]>('/admin/auth') });

  const [apiIdFilter, setApiIdFilter] = useState('all');
  const pathsQ = useQuery({
    queryKey: ['paths', apiIdFilter],
    queryFn: () =>
      apiFetch<Path[]>(
        apiIdFilter === 'all' ? '/admin/paths' : `/admin/paths?apiId=${encodeURIComponent(apiIdFilter)}`,
      ),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Path | null>(null);
  const [apiId, setApiId] = useState('');
  const [name, setName] = useState('');
  const [publicPath, setPublicPath] = useState('/dados');
  const [method, setMethod] = useState('GET');
  const [targetUrlTemplate, setTargetUrlTemplate] = useState('https://external.com/{CONTA}/dados');
  const [authId, setAuthId] = useState<string>('');
  const [enabled, setEnabled] = useState(true);
  const [requireClientAuth, setRequireClientAuth] = useState(true);
  const [forwardClientQuery, setForwardClientQuery] = useState(true);
  const [addHeadersText, setAddHeadersText] = useState('{}');
  const [addQueryText, setAddQueryText] = useState('{}');
  const [timeoutSeconds, setTimeoutSeconds] = useState('');
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    confirmText?: string;
    details?: React.ReactNode;
    onConfirm: () => void;
  }>(null);

  const apis = useMemo(() => apisQ.data ?? [], [apisQ.data]);
  const auths = useMemo(() => authsQ.data ?? [], [authsQ.data]);
  const rows = useMemo(() => pathsQ.data ?? [], [pathsQ.data]);
  const apiLabelById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of apis) out[a.id] = `${a.name} (/${a.slug})`;
    return out;
  }, [apis]);

  const parsedAdds = useMemo(() => {
    const parse = (txt: string): Record<string, string> => {
      try {
        const v: unknown = JSON.parse(txt);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
        const out: Record<string, string> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out[String(k)] = String(val);
        }
        return out;
      } catch {
        return {};
      }
    };
    return { headers: parse(addHeadersText), query: parse(addQueryText) };
  }, [addHeadersText, addQueryText]);

  const vars = useMemo(() => {
    const fromTarget = detectVariables(targetUrlTemplate);
    const fromHeaders = detectVariablesInRecord(parsedAdds.headers);
    const fromQuery = detectVariablesInRecord(parsedAdds.query);
    return Array.from(new Set([...fromTarget, ...fromHeaders, ...fromQuery])).sort();
  }, [parsedAdds.headers, parsedAdds.query, targetUrlTemplate]);

  const reset = useCallback(() => {
    setEditing(null);
    setApiId(apis[0]?.id ?? '');
    setName('');
    setPublicPath('/dados');
    setMethod('GET');
    setTargetUrlTemplate('https://external.com/{CONTA}/dados');
    setAuthId('');
    setEnabled(true);
    setRequireClientAuth(true);
    setForwardClientQuery(defaultForward);
    setAddHeadersText('{}');
    setAddQueryText('{}');
    setTimeoutSeconds('');
  }, [apis, defaultForward]);

  const beginCreate = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const beginEdit = useCallback((p: Path) => {
    setEditing(p);
    setApiId(p.apiId);
    setName(p.name);
    setPublicPath(p.publicPath);
    setMethod(p.method);
    setTargetUrlTemplate(p.targetUrlTemplate);
    setAuthId(p.authId ?? '');
    setEnabled(Boolean(p.enabled));
    setRequireClientAuth(p.requireClientAuth !== false);
    setForwardClientQuery(p.forwardClientQuery !== false);
    setAddHeadersText(JSON.stringify(p.addHeaders ?? {}, null, 2));
    setAddQueryText(JSON.stringify(p.addQuery ?? {}, null, 2));
    setTimeoutSeconds(p.timeoutSeconds ? String(p.timeoutSeconds) : '');
    setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = new URLSearchParams(window.location.search).get('focus') ?? '';
    if (!v) return;
    const t = setTimeout(() => setFocus(v), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!focus) return;
    if (!rows.length) return;
    const found = rows.find((x: Path) => x.id === focus);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (found) t = setTimeout(() => beginEdit(found), 0);
    else toast.error('Não encontrado', 'Rota não existe mais.');
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [beginEdit, focus, rows, toast]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        apiId,
        name,
        publicPath,
        method,
        targetUrlTemplate,
        authId: authId || null,
        enabled,
        requireClientAuth,
        addHeaders: parsedAdds.headers,
        addQuery: parsedAdds.query,
        forwardClientQuery,
        timeoutSeconds: timeoutSeconds.trim() ? Number(timeoutSeconds) : null,
      };
      if (editing) {
        return apiFetch<Path>(`/admin/paths/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Path>('/admin/paths', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast.success('Path salvo', 'Configuração atualizada.');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['paths'] });
    },
    onError: (e: unknown) => toast.error('Erro ao salvar', errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/paths/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Removido', 'Path deletado.');
      await qc.invalidateQueries({ queryKey: ['paths'] });
    },
    onError: (e: unknown) => toast.error('Erro ao remover', errorMessage(e)),
  });

  const askDelete = useCallback((p: Path) => {
    setConfirm({
      title: 'Confirmar exclusão da rota',
      description: 'Esta ação é irreversível. Ao confirmar, a rota será apagada permanentemente.',
      confirmText: 'Deletar rota',
      details: (
        <div className="grid gap-1 text-xs text-white/75">
          <div>
            <span className="text-white/55">Rota:</span>{' '}
            <span className="font-medium text-white/85">
              {p.method} {p.publicPath}
            </span>
          </div>
          <div className="text-white/55">{p.name}</div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(p.id);
      },
    });
  }, [del]);

  return (
    <PageShell
      title="Rotas"
      subtitle="Rotas públicas por API + method, com target URL template e auth. Variáveis {VAR} são resolvidas somente via API Key."
      right={<Button onClick={beginCreate}>Criar Rota</Button>}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <Select
            value={apiIdFilter}
            onChange={setApiIdFilter}
            options={[
              { value: 'all', label: 'All APIs' },
              ...apis.map((a: Api) => ({ value: a.id, label: `${a.name} (/${a.slug})` })),
            ]}
          />
        </div>
        <div className="text-xs text-white/55">
          {pathsQ.isPending ? 'Carregando…' : `${rows.length} paths`}
        </div>
      </div>

      <Card>
        <CardHeader title="Rotas" description="Tabela avançada (desktop) e cards (mobile)." />
        <CardBody>
          <DataTable<Path>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Nome',
                render: (r) => <div className="font-medium text-white/90">{r.name}</div>,
                sortValue: (r) => r.name,
                filterValue: (r) => r.name,
              },
              {
                key: 'api',
                header: 'API',
                render: (r) => <div className="text-white/80">{apiLabelById[r.apiId] ?? r.apiId}</div>,
                sortValue: (r) => apiLabelById[r.apiId] ?? r.apiId,
                filterValue: (r) => apiLabelById[r.apiId] ?? r.apiId,
              },
              {
                key: 'path',
                header: 'Path',
                render: (r) => <div className="font-medium text-white/90">{r.publicPath}</div>,
                sortValue: (r) => r.publicPath,
                filterValue: (r) => `${r.publicPath} ${r.name}`,
              },
              { key: 'method', header: 'Method', render: (r) => <MethodBadge method={r.method} />, sortValue: (r) => r.method, filterValue: (r) => r.method },
              {
                key: 'target',
                header: 'Target URL',
                render: (r) => (
                  <div className="max-w-[520px] truncate text-white/70">{r.targetUrlTemplate}</div>
                ),
                sortValue: (r) => r.targetUrlTemplate,
                filterValue: (r) => r.targetUrlTemplate,
              },
              {
                key: 'enabled',
                header: 'Status',
                render: (r) => (r.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="danger">Disabled</Badge>),
                sortValue: (r) => (r.enabled ? 1 : 0),
                filterValue: (r) => (r.enabled ? 'enabled' : 'disabled'),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => beginEdit(r)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => askDelete(r)} disabled={del.isPending}>
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
            mobileCard={(r) => (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <MethodBadge method={r.method} />
                  {r.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="danger">Disabled</Badge>}
                </div>
                <div className="text-sm font-medium text-white/90">{r.name}</div>
                <div className="text-xs text-white/60">{apiLabelById[r.apiId] ?? r.apiId}</div>
                <div className="text-sm font-medium text-white/90">{r.publicPath}</div>
                <div className="text-xs text-white/60 break-words">{r.targetUrlTemplate}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => beginEdit(r)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => askDelete(r)} disabled={del.isPending}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
            empty="Sem paths ainda."
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar Rota' : 'Criar Rota'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-white/70">API</div>
            <div className="mt-2">
              <Select
                value={apiId}
                onChange={setApiId}
                options={[
                  ...apis.map((a: Api) => ({ value: a.id, label: `${a.name} (/${a.slug})` })),
                ]}
              />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">Method</div>
            <div className="mt-2">
              <Select
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'PATCH', label: 'PATCH' },
                  { value: 'DELETE', label: 'DELETE' },
                ]}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Name</div>
            <div className="mt-2">
              <TextInput value={name} onChange={setName} placeholder="Ex: Dados Conta" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Public Path</div>
            <div className="mt-2">
              <TextInput value={publicPath} onChange={setPublicPath} placeholder="/dados" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Target URL Template</div>
            <div className="mt-2">
              <TextInput
                value={targetUrlTemplate}
                onChange={setTargetUrlTemplate}
                placeholder="https://external.com/{CONTA}/dados"
              />
            </div>
            <div className="mt-2 text-xs text-white/50">
              Variáveis detectadas: {vars.length ? vars.join(', ') : '—'}
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Auth</div>
            <div className="mt-2">
              <Select
                value={authId || 'none'}
                onChange={(v) => setAuthId(v === 'none' ? '' : v)}
                options={[
                  { value: 'none', label: 'None' },
                  ...auths.map((a: Auth) => ({ value: a.id, label: `${a.name} (${a.type})` })),
                ]}
              />
            </div>
          </div>

          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-white/70">Enabled</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80"
                  onClick={() => setEnabled((p: boolean) => !p)}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-white/70">Solicitar API-KEY</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80"
                  onClick={() => setRequireClientAuth((p: boolean) => !p)}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${requireClientAuth ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {requireClientAuth ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-white/70">Forward query params</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80"
                  onClick={() => setForwardClientQuery((p: boolean) => !p)}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${forwardClientQuery ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {forwardClientQuery ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="mt-2 text-xs text-white/50">
              Quando ativo, query params do cliente (ex: ?id=123) são repassados para a URL destino.
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Timeout (seconds)</div>
            <div className="mt-2">
              <TextInput
                value={timeoutSeconds}
                onChange={setTimeoutSeconds}
                type="number"
                placeholder="Ex: 30 (vazio = padrão)"
              />
            </div>
            <div className="mt-2 text-xs text-white/50">
              Se estourar o tempo, o OpenRouteX retorna 504 sem payload.
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-medium text-white/70">Add Headers (JSON)</div>
            <textarea
              value={addHeadersText}
              onChange={(e) => setAddHeadersText(e.target.value)}
              className="mt-3 h-36 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85 outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
            />
            <div className="mt-2 text-xs text-white/50">
              Variáveis: {detectVariablesInRecord(parsedAdds.headers).join(', ') || '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-medium text-white/70">Add Query (JSON)</div>
            <textarea
              value={addQueryText}
              onChange={(e) => setAddQueryText(e.target.value)}
              className="mt-3 h-36 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85 outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
            />
            <div className="mt-2 text-xs text-white/50">
              Variáveis: {detectVariablesInRecord(parsedAdds.query).join(', ') || '—'}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmText={confirm?.confirmText ?? 'Confirmar'}
        confirmDisabled={del.isPending}
        onConfirm={() => confirm?.onConfirm()}
      >
        {confirm?.details ?? null}
      </ConfirmModal>
    </PageShell>
  );
}
