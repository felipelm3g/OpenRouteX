'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { ConfirmModal, Modal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type AuthType =
  | 'api_key'
  | 'oauth2_client_credentials'
  | 'bearer'
  | 'basic'
  | 'custom_header';

type Auth = {
  id: string;
  name: string;
  type: AuthType;
  config: Record<string, unknown>;
  createdAt: string;
};

function typeLabel(t: AuthType) {
  if (t === 'oauth2_client_credentials') return 'OAuth2 Client Credentials';
  if (t === 'custom_header') return 'Custom Header';
  if (t === 'api_key') return 'API Key';
  if (t === 'bearer') return 'Bearer';
  return 'Basic';
}

function defaultConfig(t: AuthType): Record<string, unknown> {
  if (t === 'api_key') return { headerName: 'X-API-KEY', value: '' };
  if (t === 'bearer') return { token: '' };
  if (t === 'basic') return { username: '', password: '' };
  if (t === 'custom_header') return { headerName: 'X-CUSTOM', value: '' };
  return {
    tokenUrl: '',
    clientId: '',
    clientSecret: '',
    scope: '',
    audience: '',
    authStyle: 'basic',
  };
}

function errorMessage(e: unknown) {
  if (!e || typeof e !== 'object') return 'Falha';
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim() ? msg : 'Falha';
}

export default function AuthenticationPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [focus, setFocus] = useState('');

  const q = useQuery({
    queryKey: ['auths'],
    queryFn: () => apiFetch<Auth[]>('/admin/auth'),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Auth | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AuthType>('bearer');
  const [config, setConfig] = useState<Record<string, unknown>>({});
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
    setType('bearer');
    setConfig(defaultConfig('bearer'));
  }, []);

  const beginCreate = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const beginEdit = useCallback((a: Auth) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setConfig(a.config ?? defaultConfig(a.type));
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
    const found = rows.find((x: Auth) => x.id === focus);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (found) t = setTimeout(() => beginEdit(found), 0);
    else toast.error('Não encontrado', 'Credencial não existe mais.');
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [beginEdit, focus, q.data, toast]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name, type, config };
      if (editing) {
        return apiFetch<Auth>(`/admin/auth/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Auth>('/admin/auth', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast.success('Auth salva', 'Configuração atualizada.');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['auths'] });
    },
    onError: (e: unknown) => toast.error('Erro ao salvar', errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/auth/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Removido', 'Auth deletada.');
      await qc.invalidateQueries({ queryKey: ['auths'] });
    },
    onError: (e: unknown) => toast.error('Erro ao remover', errorMessage(e)),
  });

  const askDelete = useCallback((a: Auth) => {
    setConfirm({
      title: 'Confirmar exclusão',
      description: 'Esta ação é irreversível. Ao confirmar, a credencial upstream será apagada permanentemente.',
      confirmText: 'Deletar',
      details: (
        <div className="grid gap-1 text-xs text-white/75">
          <div className="font-medium text-white/85">{a.name}</div>
          <div className="text-white/55">{typeLabel(a.type)}</div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(a.id);
      },
    });
  }, [del]);

  const rows = useMemo(() => q.data ?? [], [q.data]);

  return (
    <PageShell
      title="Credenciais Upstream"
      subtitle="Crie autenticações reutilizáveis para aplicar nos Paths (OAuth2, Bearer, Basic, API Key e Custom Header)."
      right={<Button onClick={beginCreate}>Criar Credencial</Button>}
    >
      <Card>
        <CardHeader title="Auths" description="Reutilizáveis entre APIs e Paths." right={
          <div className="text-xs text-white/55">
            {q.isPending ? 'Carregando…' : `${rows.length} itens`}
          </div>
        } />
        <CardBody>
          <DataTable<Auth>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (r) => <div className="font-medium text-white/90">{r.name}</div>,
                sortValue: (r) => r.name,
                filterValue: (r) => r.name,
              },
              {
                key: 'type',
                header: 'Type',
                render: (r) => <Badge tone="neutral">{typeLabel(r.type)}</Badge>,
                sortValue: (r) => typeLabel(r.type),
                filterValue: (r) => typeLabel(r.type),
              },
              {
                key: 'id',
                header: 'Actions',
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => beginEdit(r)}>
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => askDelete(r)}
                      disabled={del.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
            empty="Sem autenticações ainda."
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar Credencial' : 'Criar Credencial'}
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
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Name</div>
            <div className="mt-2">
              <TextInput value={name} onChange={setName} placeholder="Ex: UberEats OAuth" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Type</div>
            <div className="mt-2">
              <Select
                value={type}
                onChange={(v) => {
                  const t = v as AuthType;
                  setType(t);
                  setConfig(defaultConfig(t));
                }}
                options={[
                  { value: 'bearer', label: 'Bearer' },
                  { value: 'basic', label: 'Basic' },
                  { value: 'api_key', label: 'API Key (header)' },
                  { value: 'custom_header', label: 'Custom Header' },
                  { value: 'oauth2_client_credentials', label: 'OAuth2 Client Credentials' },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-white/70">Config</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {type === 'bearer' ? (
              <>
                <Field
                  label="token"
                  value={String(config.token ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, token: v }))}
                />
              </>
            ) : null}

            {type === 'basic' ? (
              <>
                <Field
                  label="username"
                  value={String(config.username ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, username: v }))}
                />
                <Field
                  label="password"
                  value={String(config.password ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, password: v }))}
                  type="password"
                />
              </>
            ) : null}

            {type === 'api_key' || type === 'custom_header' ? (
              <>
                <Field
                  label="headerName"
                  value={String(config.headerName ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, headerName: v }))}
                />
                <Field
                  label="value"
                  value={String(config.value ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, value: v }))}
                />
              </>
            ) : null}

            {type === 'oauth2_client_credentials' ? (
              <>
                <Field
                  label="tokenUrl"
                  value={String(config.tokenUrl ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, tokenUrl: v }))}
                />
                <Field
                  label="clientId"
                  value={String(config.clientId ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, clientId: v }))}
                />
                <Field
                  label="clientSecret"
                  value={String(config.clientSecret ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, clientSecret: v }))}
                  type="password"
                />
                <Field
                  label="scope"
                  value={String(config.scope ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, scope: v }))}
                />
                <Field
                  label="audience"
                  value={String(config.audience ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, audience: v }))}
                />
                <div className="sm:col-span-2">
                  <div className="text-xs text-white/55">
                    authStyle: basic (Authorization header) ou body (client_id/client_secret no body).
                  </div>
                  <div className="mt-2">
                    <Select
                      value={String(config.authStyle ?? 'basic')}
                      onChange={(v) => setConfig((p) => ({ ...p, authStyle: v }))}
                      options={[
                        { value: 'basic', label: 'basic' },
                        { value: 'body', label: 'body' },
                      ]}
                    />
                  </div>
                </div>
              </>
            ) : null}
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

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-white/70">{label}</div>
      <div className="mt-2">
        <TextInput value={value} onChange={onChange} placeholder={label} type={type} />
      </div>
    </div>
  );
}
