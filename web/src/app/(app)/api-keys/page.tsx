'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { useI18n } from '@/components/i18n-provider';
import { ConfirmModal, Modal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, PageShell, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Api = {
  id: string;
  name: string;
  slug: string;
};

type ApiKey = {
  id: string;
  key: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  allowedApis: string[] | null;
  variableBindings: Record<string, string>;
  requestsPerMinute: number;
  createdAt: string;
};

function maskKey(key: string) {
  if (!key) return '';
  if (key.length <= 4) return '****';
  return `****${key.slice(-4)}`;
}

function parseJsonRecord(txt: string): Record<string, string> {
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
}

function errorMessage(e: unknown) {
  if (!e || typeof e !== 'object') return 'Falha';
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim() ? msg : 'Falha';
}

const API_KEY_RE = /^[A-Za-z0-9._~-]{1,120}$/;

const IconEdit = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M4 20h4l10.5-10.5a2.828 2.828 0 0 0 0-4L18.5 4a2.828 2.828 0 0 0-4 0L4 14.5V20Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M13.5 5.5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconTrash = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export default function ApiKeysPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [focus, setFocus] = useState('');

  const q = useQuery({
    queryKey: ['apikeys'],
    queryFn: () => apiFetch<ApiKey[]>('/admin/apikeys'),
  });

  const apisQ = useQuery({
    queryKey: ['apis'],
    queryFn: () => apiFetch<Api[]>('/admin/apis'),
  });

  const rows = useMemo<ApiKey[]>(() => q.data ?? [], [q.data]);
  const apis = useMemo<Api[]>(() => apisQ.data ?? [], [apisQ.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [rpm, setRpm] = useState('60');
  const [allowedApis, setAllowedApis] = useState<string[]>([]);
  const [bindingsText, setBindingsText] = useState('{\n  "CONTA": "55555"\n}');
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    confirmText?: string;
    details?: React.ReactNode;
    onConfirm: () => void;
  }>(null);

  const reset = useCallback(() => {
    setEditing(null);
    setName('');
    setKey('');
    setStatus('ACTIVE');
    setRpm('60');
    setAllowedApis([]);
    setBindingsText('{\n  "CONTA": "55555"\n}');
  }, []);

  const beginCreate = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const beginEdit = useCallback((k: ApiKey) => {
    setEditing(k);
    setName(k.name);
    setKey(k.key);
    setStatus(k.status);
    setRpm(String(k.requestsPerMinute ?? 60));
    setAllowedApis(k.allowedApis ?? []);
    setBindingsText(JSON.stringify(k.variableBindings ?? {}, null, 2));
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
    const rows = q.data ?? [];
    if (!rows.length) return;
    const found = rows.find((x: ApiKey) => x.id === focus);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (found) t = setTimeout(() => beginEdit(found), 0);
    else toast.error('Não encontrado', 'API Key não existe mais.');
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [beginEdit, focus, q.data, toast]);

  const save = useMutation({
    mutationFn: async () => {
      const normalizedKey = key.trim();
      if (!normalizedKey) throw new Error('Chave é obrigatória.');
      if (!API_KEY_RE.test(normalizedKey)) {
        throw new Error('Chave inválida. Use apenas letras, números e . _ - ~ (sem espaços).');
      }
      if (!name.trim()) throw new Error('Nome é obrigatório.');

      const payload = {
        name: name.trim(),
        key: normalizedKey,
        status,
        requestsPerMinute: Number(rpm),
        allowedApis: allowedApis.length ? allowedApis : null,
        variableBindings: parseJsonRecord(bindingsText),
      };
      if (editing) {
        return apiFetch<ApiKey>(`/admin/apikeys/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<ApiKey>('/admin/apikeys', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast.success('API Key salva', 'Configuração atualizada.');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['apikeys'] });
    },
    onError: (e: unknown) => toast.error('Erro ao salvar', errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/apikeys/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Removido', 'API Key deletada.');
      await qc.invalidateQueries({ queryKey: ['apikeys'] });
    },
    onError: (e: unknown) => toast.error('Erro ao remover', errorMessage(e)),
  });

  const askDelete = useCallback((k: ApiKey) => {
    setConfirm({
      title: 'Confirmar exclusão',
      description: 'Esta ação é irreversível. Ao confirmar, a API Key será apagada permanentemente.',
      confirmText: 'Deletar',
      details: (
        <div className="grid gap-1 text-xs text-white/75">
          <div className="text-white/55">{k.name}</div>
          <div className="font-mono text-white/70">{maskKey(k.key)}</div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(k.id);
      },
    });
  }, [del]);

  return (
    <PageShell
      title="Autenticação do Cliente"
      subtitle="Contexto multi-tenant: cada API Key define bindings de variáveis e rate limit."
      right={<Button onClick={beginCreate}>Criar Autenticação do Cliente</Button>}
    >
      <Card>
        <CardHeader title="Autenticação do Cliente" description="Chaves ficam mascaradas na UI." right={<div className="text-xs text-white/55">{q.isPending ? t('common.loading') : t('common.items', { n: rows.length })}</div>} />
        <CardBody>
          <DataTable<ApiKey>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              { key: 'name', header: t('common.name'), render: (r) => <div className="font-medium text-white/90">{r.name}</div>, sortValue: (r) => r.name, filterValue: (r) => r.name },
              { key: 'key', header: t('common.key'), render: (r) => <div className="font-mono text-xs text-white/70">{maskKey(r.key)}</div>, sortValue: (r) => r.key, filterValue: (r) => r.key },
              { key: 'status', header: t('common.statusLabel'), render: (r) => (r.status === 'ACTIVE' ? <Badge tone="success">{t('apiKeys.status.active')}</Badge> : <Badge tone="danger">{t('apiKeys.status.disabled')}</Badge>), sortValue: (r) => r.status, filterValue: (r) => r.status },
              { key: 'rpm', header: 'RPM', render: (r) => <div className="text-white/70">{r.requestsPerMinute}</div>, sortValue: (r) => r.requestsPerMinute, filterValue: (r) => String(r.requestsPerMinute) },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => beginEdit(r)}
                      title={t('common.edit')}
                      ariaLabel={t('common.edit')}
                    >
                      <IconEdit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="icon"
                      onClick={() => askDelete(r)}
                      disabled={del.isPending}
                      title={t('common.delete')}
                      ariaLabel={t('common.delete')}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
            empty={t('apiKeys.empty')}
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('apiKeys.modal.editTitle') : t('apiKeys.modal.createTitle')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-white/70">{t('common.name')}</div>
            <div className="mt-2">
              <TextInput value={name} onChange={setName} placeholder="Ex: Cliente A" />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">{t('common.key')}</div>
            <div className="mt-2">
              <TextInput value={key} onChange={setKey} placeholder="abcdef" />
            </div>
            <div className="mt-2 text-xs text-white/55">
              Use apenas A–Z a–z 0–9 e . _ - ~ (sem espaços). Ex: ClienteA_2026-05~01
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-white/70">{t('common.statusLabel')}</div>
            <div className="mt-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ApiKey['status'])}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-[color:var(--foreground)] focus:border-white/20 focus:ring-2 focus:ring-[color:var(--accent)]/30"
              >
                <option value="ACTIVE">{t('apiKeys.status.active')}</option>
                <option value="DISABLED">{t('apiKeys.status.disabled')}</option>
              </select>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">Requisições/min</div>
            <div className="mt-2">
              <TextInput value={rpm} onChange={setRpm} type="number" placeholder="60" />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-medium text-white/70">APIs permitidas</div>
            <div className="mt-2 text-xs text-white/55">
              Selecione quais APIs este API Key pode chamar. Se não selecionar nenhuma, ele pode chamar todas.
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 text-xs font-medium text-white/80 hover:bg-white/10"
                onClick={() => setAllowedApis([])}
              >
                Permitir todas
              </button>
              <div className="text-xs text-white/55">
                {allowedApis.length ? `${allowedApis.length} selecionadas` : 'todas'}
              </div>
            </div>
            <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-2">
              {apisQ.isPending ? (
                <div className="p-2 text-xs text-white/55">Carregando APIs…</div>
              ) : apis.length ? (
                <div className="grid gap-1">
                  {apis.map((a: Api) => {
                    const checked = allowedApis.includes(a.slug);
                    return (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setAllowedApis((prev: string[]) => {
                              if (on) return Array.from(new Set([...prev, a.slug]));
                              return prev.filter((s: string) => s !== a.slug);
                            });
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm text-white/85">/{a.slug}</div>
                          <div className="truncate text-xs text-white/50">{a.name}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="p-2 text-xs text-white/55">Nenhuma API cadastrada.</div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-medium text-white/70">Variable Bindings (JSON object)</div>
            <div className="mt-2 text-xs text-white/55">
              Ex:{' '}
              <code className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono text-[11px] text-white/80">
                {'{ "CONTA": "55555" }'}
              </code>{' '}
              — resolve <code className="font-mono">{'{CONTA}'}</code> no target template.
            </div>
            <textarea
              value={bindingsText}
              onChange={(e) => setBindingsText(e.target.value)}
              className="mt-3 h-32 w-full rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-sm text-white/85 outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
            />
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
