'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { useI18n } from '@/components/i18n-provider';
import { ConfirmModal, Modal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type AuthType =
  | 'api_key'
  | 'oauth2_client_credentials'
  | 'oidc_client_credentials'
  | 'bearer'
  | 'basic'
  | 'custom_header'
  | 'hmac'
  | 'oauth1';

type Auth = {
  id: string;
  name: string;
  type: AuthType;
  config: Record<string, unknown>;
  createdAt: string;
};

function typeLabel(type: AuthType, t: (key: string) => string) {
  if (type === 'oauth2_client_credentials') return t('authentication.type.oauth2ClientCredentials');
  if (type === 'oidc_client_credentials') return t('authentication.type.oidcClientCredentials');
  if (type === 'oauth1') return t('authentication.type.oauth1');
  if (type === 'hmac') return t('authentication.type.hmac');
  if (type === 'custom_header') return t('authentication.type.customHeader');
  if (type === 'api_key') return t('authentication.type.apiKey');
  if (type === 'bearer') return t('authentication.type.bearer');
  return t('authentication.type.basic');
}

function defaultConfig(t: AuthType): Record<string, unknown> {
  if (t === 'api_key') return { headerName: 'X-API-KEY', value: '' };
  if (t === 'bearer') return { token: '' };
  if (t === 'basic') return { username: '', password: '' };
  if (t === 'custom_header') return { headerName: 'X-CUSTOM', value: '' };
  if (t === 'oidc_client_credentials') {
    return {
      issuerUrl: '',
      tokenUrl: '',
      clientId: '',
      clientSecret: '',
      scope: '',
      audience: '',
      authStyle: 'basic',
    };
  }
  if (t === 'hmac') {
    return {
      headerName: 'Authorization',
      keyId: '',
      secret: '',
      algorithm: 'sha256',
      signatureEncoding: 'hex',
      timestampHeaderName: '',
      nonceHeaderName: '',
      stringToSignTemplate: '{method}\n{path}\n{query}\n{body_sha256}\n{timestamp}',
      headerValueTemplate: 'HMAC {keyId}:{signature}',
    };
  }
  if (t === 'oauth1') {
    return {
      consumerKey: '',
      consumerSecret: '',
      token: '',
      tokenSecret: '',
      realm: '',
    };
  }
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

export default function AuthenticationPage() {
  const { t } = useI18n();
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
          <div className="text-white/55">{typeLabel(a.type, t)}</div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(a.id);
      },
    });
  }, [del, t]);

  const rows = useMemo(() => q.data ?? [], [q.data]);

  return (
    <PageShell
      title={t('authentication.title')}
      subtitle={t('authentication.subtitle')}
      right={<Button onClick={beginCreate}>{t('authentication.create')}</Button>}
    >
      <Card>
        <CardHeader title={t('authentication.table.title')} description={t('authentication.table.description')} right={
          <div className="text-xs text-white/55">
            {q.isPending ? t('common.loading') : t('common.items', { n: rows.length })}
          </div>
        } />
        <CardBody>
          <DataTable<Auth>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: t('common.name'),
                render: (r) => <div className="font-medium text-white/90">{r.name}</div>,
                sortValue: (r) => r.name,
                filterValue: (r) => r.name,
              },
              {
                key: 'type',
                header: t('common.type'),
                render: (r) => <Badge tone="neutral">{typeLabel(r.type, t)}</Badge>,
                sortValue: (r) => typeLabel(r.type, t),
                filterValue: (r) => typeLabel(r.type, t),
              },
              {
                key: 'id',
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
            empty={t('authentication.empty')}
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('authentication.modal.editTitle') : t('authentication.modal.createTitle')}
        size="full"
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
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">{t('common.name')}</div>
            <div className="mt-2">
              <TextInput value={name} onChange={setName} placeholder="Ex: UberEats OAuth" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">{t('common.type')}</div>
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
                  { value: 'api_key', label: t('authentication.type.apiKey') },
                  { value: 'custom_header', label: t('authentication.type.customHeader') },
                  { value: 'oauth2_client_credentials', label: t('authentication.type.oauth2ClientCredentials') },
                  { value: 'oidc_client_credentials', label: t('authentication.type.oidcClientCredentials') },
                  { value: 'hmac', label: t('authentication.type.hmac') },
                  { value: 'oauth1', label: t('authentication.type.oauth1') },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-white/70">{t('authentication.form.config')}</div>
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

            {type === 'oidc_client_credentials' ? (
              <>
                <Field
                  label="issuerUrl"
                  value={String(config.issuerUrl ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, issuerUrl: v }))}
                />
                <Field
                  label="tokenUrl (opcional)"
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

            {type === 'hmac' ? (
              <>
                <Field
                  label="headerName"
                  value={String(config.headerName ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, headerName: v }))}
                />
                <Field
                  label="keyId"
                  value={String(config.keyId ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, keyId: v }))}
                />
                <Field
                  label="secret"
                  value={String(config.secret ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, secret: v }))}
                  type="password"
                />
                <div>
                  <div className="text-xs font-medium text-white/70">algorithm</div>
                  <div className="mt-2">
                    <Select
                      value={String(config.algorithm ?? 'sha256')}
                      onChange={(v) => setConfig((p) => ({ ...p, algorithm: v }))}
                      options={[
                        { value: 'sha256', label: 'sha256' },
                        { value: 'sha1', label: 'sha1' },
                        { value: 'sha512', label: 'sha512' },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-white/70">signatureEncoding</div>
                  <div className="mt-2">
                    <Select
                      value={String(config.signatureEncoding ?? 'hex')}
                      onChange={(v) => setConfig((p) => ({ ...p, signatureEncoding: v }))}
                      options={[
                        { value: 'hex', label: 'hex' },
                        { value: 'base64', label: 'base64' },
                      ]}
                    />
                  </div>
                </div>
                <Field
                  label="timestampHeaderName (opcional)"
                  value={String(config.timestampHeaderName ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, timestampHeaderName: v }))}
                />
                <Field
                  label="nonceHeaderName (opcional)"
                  value={String(config.nonceHeaderName ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, nonceHeaderName: v }))}
                />
                <Field
                  label="stringToSignTemplate"
                  value={String(config.stringToSignTemplate ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, stringToSignTemplate: v }))}
                />
                <Field
                  label="headerValueTemplate"
                  value={String(config.headerValueTemplate ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, headerValueTemplate: v }))}
                />
                <div className="sm:col-span-2 text-xs text-white/55">
                  Variáveis: {'{method} {url} {path} {query} {timestamp} {nonce} {body_sha256} {body_base64} {signature} {keyId}'}
                </div>
              </>
            ) : null}

            {type === 'oauth1' ? (
              <>
                <Field
                  label="consumerKey"
                  value={String(config.consumerKey ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, consumerKey: v }))}
                />
                <Field
                  label="consumerSecret"
                  value={String(config.consumerSecret ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, consumerSecret: v }))}
                  type="password"
                />
                <Field
                  label="token (opcional)"
                  value={String(config.token ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, token: v }))}
                />
                <Field
                  label="tokenSecret (opcional)"
                  value={String(config.tokenSecret ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, tokenSecret: v }))}
                  type="password"
                />
                <Field
                  label="realm (opcional)"
                  value={String(config.realm ?? '')}
                  onChange={(v) => setConfig((p) => ({ ...p, realm: v }))}
                />
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
