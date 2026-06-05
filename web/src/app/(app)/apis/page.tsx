'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { useI18n } from '@/components/i18n-provider';
import { ConfirmModal, Modal } from '@/components/modal';
import { ActionMenu, Badge, Button, Card, CardBody, CardHeader, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Api = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  certificateId?: string | null;
  variableBindings?: Record<string, string>;
  createdAt: string;
};

type Certificate = { id: string; name: string; format: 'pem' | 'pfx'; notAfter: string | null };
type PathRow = { id: string; name: string; publicPath: string; method: string };

function normalizeSlug(input: string) {
  return input.trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
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

export default function ApisPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const [focus, setFocus] = useState('');

  const q = useQuery({
    queryKey: ['apis'],
    queryFn: () => apiFetch<Api[]>('/admin/apis'),
  });

  const certsQ = useQuery({
    queryKey: ['certificates'],
    queryFn: () => apiFetch<Certificate[]>('/admin/certificates'),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Api | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [certificateId, setCertificateId] = useState('');
  const [variableBindingsText, setVariableBindingsText] = useState('{}');
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
    setSlug('');
    setDescription('');
    setCertificateId('');
    setVariableBindingsText('{}');
  }, []);

  const beginCreate = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const beginEdit = useCallback((a: Api) => {
    setEditing(a);
    setName(a.name);
    setSlug(a.slug);
    setDescription(a.description ?? '');
    setCertificateId(a.certificateId ?? '');
    setVariableBindingsText(JSON.stringify(a.variableBindings ?? {}, null, 2));
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
    const found = rows.find((x: Api) => x.id === focus);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (found) timer = setTimeout(() => beginEdit(found), 0);
    else toast.error(t('common.notFound'), t('apis.notFound'));
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [beginEdit, focus, q.data, t, toast]);

  const save = useMutation({
    mutationFn: async () => {
      let parsedVars: Record<string, string> = {};
      try {
        const raw: unknown = JSON.parse(variableBindingsText || '{}');
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          parsedVars = Object.fromEntries(
            Object.entries(raw as Record<string, unknown>).map(([k, v]) => [String(k), String(v)]),
          );
        }
      } catch {
        throw new Error('Variáveis do serviço inválidas. Use um JSON objeto, ex: {"URL":"https://..."}');
      }

      const payload = {
        name,
        slug,
        description: description || null,
        certificateId: certificateId || null,
        variableBindings: parsedVars,
      };
      if (editing) {
        return apiFetch<Api>(`/admin/apis/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Api>('/admin/apis', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast.success(t('common.save'), t('apis.saved'));
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['apis'] });
    },
    onError: (e: unknown) =>
      toast.error(t('apis.saveError.title'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/apis/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('apis.deleted.title'), t('apis.deleted.body'));
      await qc.invalidateQueries({ queryKey: ['apis'] });
      await qc.invalidateQueries({ queryKey: ['paths'] });
    },
    onError: (e: unknown) =>
      toast.error(t('apis.deleteError.title'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const askDelete = useCallback(async (a: Api) => {
    let paths: PathRow[] = [];
    try {
      paths = await apiFetch<PathRow[]>(
        `/admin/paths?apiId=${encodeURIComponent(a.id)}`,
      );
    } catch {
      paths = [];
    }

    const list = paths.slice(0, 12);
    const more = Math.max(0, paths.length - list.length);
    setConfirm({
      title: t('apis.deleteConfirm.title'),
      description: t('apis.deleteConfirm.body'),
      confirmText: t('apis.deleteConfirm.confirm'),
      details: (
        <div className="grid gap-2">
          <div className="text-xs font-medium text-white/80">
            {t('apis.deleteConfirm.serviceLabel')}{' '}
            <span className="font-mono">/{a.slug}</span> • {t('apis.deleteConfirm.routesFound', { n: paths.length })}
          </div>
          {paths.length ? (
            <div className="grid gap-1 text-xs text-white/70">
              {list.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="truncate">
                    <span className="font-medium text-white/80">{p.method}</span> {p.publicPath}{' '}
                    <span className="text-white/45">— {p.name}</span>
                  </div>
                </div>
              ))}
              {more ? <div className="text-white/50">{t('apis.deleteConfirm.moreRoutes', { n: more })}</div> : null}
            </div>
          ) : (
            <div className="text-xs text-white/60">{t('apis.deleteConfirm.noRoutes')}</div>
          )}
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(a.id);
      },
    });
  }, [del, setConfirm, t]);

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const certs = useMemo(() => certsQ.data ?? [], [certsQ.data]);
  const certOptions = useMemo(() => {
    return [
      { value: '', label: t('common.none') },
      ...certs.map((c: Certificate) => ({
        value: c.id,
        label: `${c.name} (${c.format.toUpperCase()})`,
      })),
    ];
  }, [certs, t]);

  return (
    <PageShell
      title={t('apis.title')}
      subtitle={t('apis.subtitle')}
      right={<Button onClick={beginCreate}>{t('apis.create')}</Button>}
    >
      <Card>
        <CardHeader
          title={t('apis.title')}
          description={t('apis.list.description')}
          right={
            <div className="text-xs text-white/55">
              {q.isPending ? t('common.loading') : t('common.items', { n: rows.length })}
            </div>
          }
        />
        <CardBody>
          <DataTable<Api>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: t('apis.table.name'),
                render: (r) => <div className="font-medium text-white/90">{r.name}</div>,
                sortValue: (r) => r.name,
                filterValue: (r) => `${r.name} ${r.slug} ${r.description ?? ''}`,
              },
              {
                key: 'slug',
                header: t('apis.table.slug'),
                render: (r) => (
                  <Badge tone="info">
                    /{r.slug}
                  </Badge>
                ),
                sortValue: (r) => r.slug,
                filterValue: (r) => r.slug,
              },
              {
                key: 'desc',
                header: t('apis.table.description'),
                render: (r) => <div className="text-white/70">{r.description ?? '—'}</div>,
                sortValue: (r) => r.description ?? '',
                filterValue: (r) => r.description ?? '',
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (r) => (
                  <div className="flex items-center justify-end">
                    <div className="hidden items-center gap-2 lg:flex">
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
                    <div className="lg:hidden">
                      <ActionMenu
                        ariaLabel={t('common.actions')}
                        items={[
                          { label: t('common.edit'), onClick: () => beginEdit(r) },
                          { label: t('common.delete'), onClick: () => askDelete(r), tone: 'danger', disabled: del.isPending },
                        ]}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
            empty={t('apis.empty')}
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('apis.editTitle') : t('apis.createTitle')}
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
          <div>
            <div className="text-xs font-medium text-white/70">{t('apis.form.name')}</div>
            <div className="mt-2">
              <TextInput value={name} onChange={setName} placeholder="Ex: Conta" />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">{t('apis.form.slug')}</div>
            <div className="mt-2">
              <TextInput value={slug} onChange={(v) => setSlug(normalizeSlug(v))} placeholder="ex: espocrm" />
            </div>
            <div className="mt-2 text-xs text-white/50">{t('apis.form.slugHelp')}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">{t('apis.form.certificate')}</div>
            <div className="mt-2">
              <Select value={certificateId} onChange={setCertificateId} options={certOptions} />
            </div>
            <div className="mt-2 text-xs text-white/55">
              {t('apis.form.certificateHelp')}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">{t('apis.form.description')}</div>
            <div className="mt-2">
              <TextInput value={description} onChange={setDescription} placeholder="Opcional" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Variáveis do serviço (JSON)</div>
            <div className="mt-2">
              <textarea
                value={variableBindingsText}
                onChange={(e) => setVariableBindingsText(e.target.value)}
                placeholder='Ex: {"URL":"https://dev.example.com"}'
                className="min-h-[120px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-zinc-50 placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-[color:var(--accent)]/30"
              />
            </div>
            <div className="mt-2 text-xs text-white/50">
              Chaves devem ser únicas e podem ser usadas nas rotas como {'{NOME_DA_VARIAVEL}'}.
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmText={confirm?.confirmText ?? t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmDisabled={del.isPending}
        onConfirm={() => confirm?.onConfirm()}
      >
        {confirm?.details ?? null}
      </ConfirmModal>
    </PageShell>
  );
}
