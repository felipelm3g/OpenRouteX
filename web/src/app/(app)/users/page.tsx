'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { useI18n } from '@/components/i18n-provider';
import { ConfirmModal, Modal } from '@/components/modal';
import { ActionMenu, Badge, Button, Card, CardBody, CardHeader, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type User = {
  id: string;
  username: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  permissions: string[] | null;
  isPrimaryAdmin?: boolean;
  createdAt: string;
};

const PERMISSIONS: Array<{ key: string; labelKey: string }> = [
  { key: 'dashboard', labelKey: 'nav.dashboard' },
  { key: 'authentication', labelKey: 'nav.authentication' },
  { key: 'apis', labelKey: 'nav.apis' },
  { key: 'paths', labelKey: 'nav.paths' },
  { key: 'apikeys', labelKey: 'nav.apiKeys' },
  { key: 'certificates', labelKey: 'nav.certificates' },
  { key: 'users', labelKey: 'nav.users' },
  { key: 'settings', labelKey: 'nav.settings' },
];

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

const IconPermissions = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconMail = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M6 8l6 5 6-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconBlock = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M17 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M23 11l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M17 11l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconUnblock = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M17 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M16 14l2 2 4-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconUnlock = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M7 10V8a5 5 0 0 1 9.6-2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 10h12a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export default function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const [focus, setFocus] = useState('');

  const q = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/admin/users'),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<User['status']>('ACTIVE');
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [createPermSelected, setCreatePermSelected] = useState<string[]>(() => PERMISSIONS.map((p) => p.key));
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    confirmText?: string;
    details?: React.ReactNode;
    onConfirm: () => void;
  }>(null);

  const [permOpen, setPermOpen] = useState(false);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [permSelected, setPermSelected] = useState<string[]>([]);

  const reset = useCallback(() => {
    setEditing(null);
    setUsername('');
    setEmail('');
    setPassword('');
    setStatus('ACTIVE');
    setSendWelcomeEmail(true);
    setCreatePermSelected(PERMISSIONS.map((p) => p.key));
  }, []);

  const beginCreate = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const beginEdit = useCallback((u: User) => {
    reset();
    setEditing(u);
    setUsername(u.username);
    setEmail(u.email);
    setStatus(u.status);
    setSendWelcomeEmail(false);
    setOpen(true);
  }, [reset]);

  const openPermissions = useCallback((u: User) => {
    const all = PERMISSIONS.map((p) => p.key);
    const initial = u.isPrimaryAdmin || u.permissions === null ? all : (u.permissions ?? []);
    setPermUser(u);
    setPermSelected(initial);
    setPermOpen(true);
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
    const found = rows.find((x: User) => x.id === focus);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (found) t = setTimeout(() => beginEdit(found), 0);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [beginEdit, focus, rows]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: {
        username: string;
        email: string;
        status: User['status'];
        password?: string;
      } = {
        username: username.trim(),
        email: email.trim(),
        status,
      };
      if (!payload.username) throw new Error(t('users.form.username.required'));
      if (!payload.email) throw new Error(t('users.form.email.required'));

      if (!editing) {
        const p = password.trim();
        if (!p) throw new Error(t('users.form.password.required'));
        payload.password = p;
        return apiFetch<User & { welcomeEmailSent?: boolean }>('/admin/users', {
          method: 'POST',
          body: JSON.stringify({ ...payload, sendWelcomeEmail, permissions: createPermSelected }),
        });
      }

      if (password.trim()) payload.password = password.trim();
      return apiFetch<User>(`/admin/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: async (r: User & { welcomeEmailSent?: boolean }) => {
      toast.success(t('common.save'), t('users.saved'));
      if (!editing && sendWelcomeEmail && r.welcomeEmailSent === false) {
        toast.error(t('users.welcomeEmail.notSent.title'), t('users.welcomeEmail.notSent.body'));
      }
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: unknown) =>
      toast.error(t('users.saveError.title'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('users.deleted.title'), t('users.deleted.body'));
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: unknown) =>
      toast.error(t('users.deleteError.title'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const block = useMutation({
    mutationFn: (id: string) => apiFetch<User>(`/admin/users/${id}/block`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('users.blocked.title'), t('users.blocked.body'));
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: unknown) => toast.error(t('common.error'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const unblock = useMutation({
    mutationFn: (id: string) => apiFetch<User>(`/admin/users/${id}/unblock`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('users.unblocked.title'), t('users.unblocked.body'));
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: unknown) => toast.error(t('common.error'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const clearLock = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/users/${id}/clear-login-lock`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('users.loginLockCleared.title'), t('users.loginLockCleared.body'));
    },
    onError: (e: unknown) => toast.error(t('common.error'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const sendResetEmail = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/admin/users/${id}/send-reset-email`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('common.sent'), t('users.resetPasswordSent'));
    },
    onError: (e: unknown) =>
      toast.error(t('users.resetPasswordError.title'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const askSendResetEmail = useCallback((u: User) => {
    setConfirm({
      title: t('users.resetPasswordConfirm.title'),
      description: t('users.resetPasswordConfirm.body', { email: u.email }),
      confirmText: t('users.resetPasswordConfirm.confirm'),
      details: (
        <div className="grid gap-1 text-xs text-white/75">
          <div className="font-medium text-white/85">{u.username}</div>
          <div className="text-white/55">{u.email}</div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        sendResetEmail.mutate(u.id);
      },
    });
  }, [sendResetEmail, t]);

  const savePermissions = useMutation({
    mutationFn: async () => {
      if (!permUser) throw new Error(t('users.permissions.noUser'));
      if (permUser.isPrimaryAdmin) throw new Error(t('users.permissions.primaryAdminFixed'));
      return apiFetch<User>(`/admin/users/${permUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: permSelected }),
      });
    },
    onSuccess: async () => {
      toast.success(t('common.save'), t('users.permissions.saved'));
      setPermOpen(false);
      setPermUser(null);
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: unknown) =>
      toast.error(t('users.saveError.title'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const askDelete = useCallback((u: User) => {
    setConfirm({
      title: t('users.deleteConfirm.title'),
      description: t('users.deleteConfirm.body'),
      confirmText: t('common.delete'),
      details: (
        <div className="grid gap-1 text-xs text-white/75">
          <div className="font-medium text-white/85">{u.username}</div>
          <div className="text-white/55">{u.email}</div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(u.id);
      },
    });
  }, [del, t]);

  return (
    <PageShell
      title={t('users.title')}
      subtitle={t('users.subtitle')}
      right={<Button onClick={beginCreate}>{t('users.create')}</Button>}
    >
      <Card>
        <CardHeader
          title={t('users.title')}
          description={t('users.list.description')}
          right={
            <div className="text-xs text-white/55">
              {q.isPending ? t('common.loading') : t('common.items', { n: rows.length })}
            </div>
          }
        />
        <CardBody>
          <DataTable<User>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              { key: 'username', header: t('users.table.username'), render: (r) => <div className="font-medium text-white/90">{r.username}</div>, sortValue: (r) => r.username, filterValue: (r) => `${r.username} ${r.email}` },
              { key: 'email', header: t('users.table.email'), render: (r) => <div className="text-white/80">{r.email}</div>, sortValue: (r) => r.email, filterValue: (r) => r.email },
              { key: 'status', header: t('users.table.status'), render: (r) => (r.status === 'ACTIVE' ? <Badge tone="success">{t('users.status.active')}</Badge> : <Badge tone="danger">{t('users.status.disabled')}</Badge>), sortValue: (r) => r.status, filterValue: (r) => r.status },
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
                        variant="ghost"
                        size="icon"
                        onClick={() => openPermissions(r)}
                        disabled={Boolean(r.isPrimaryAdmin)}
                        title={t('common.permissions')}
                        ariaLabel={t('common.permissions')}
                      >
                        <IconPermissions className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => askSendResetEmail(r)}
                        disabled={sendResetEmail.isPending}
                        title={t('users.resetPasswordEmail')}
                        ariaLabel={t('users.resetPasswordEmail')}
                      >
                        <IconMail className="h-4 w-4" />
                      </Button>
                      {!r.isPrimaryAdmin ? (
                        <>
                          {r.status === 'ACTIVE' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => block.mutate(r.id)}
                              disabled={block.isPending}
                              title={t('common.block')}
                              ariaLabel={t('common.block')}
                            >
                              <IconBlock className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => unblock.mutate(r.id)}
                              disabled={unblock.isPending}
                              title={t('common.unblock')}
                              ariaLabel={t('common.unblock')}
                            >
                              <IconUnblock className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => clearLock.mutate(r.id)}
                            disabled={clearLock.isPending}
                            title={t('users.clearLoginLock')}
                            ariaLabel={t('users.clearLoginLock')}
                          >
                            <IconUnlock className="h-4 w-4" />
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
                        </>
                      ) : null}
                    </div>
                    <div className="lg:hidden">
                      <ActionMenu
                        ariaLabel={t('common.actions')}
                        items={[
                          { label: t('common.edit'), onClick: () => beginEdit(r) },
                          { label: t('common.permissions'), onClick: () => openPermissions(r), disabled: Boolean(r.isPrimaryAdmin) },
                          { label: t('users.resetPasswordEmail'), onClick: () => askSendResetEmail(r), disabled: sendResetEmail.isPending },
                          {
                            label: r.status === 'ACTIVE' ? t('common.block') : t('common.unblock'),
                            onClick: () => (r.status === 'ACTIVE' ? block.mutate(r.id) : unblock.mutate(r.id)),
                            disabled: r.status === 'ACTIVE' ? block.isPending : unblock.isPending,
                            hidden: Boolean(r.isPrimaryAdmin),
                          },
                          { label: t('users.clearLoginLock'), onClick: () => clearLock.mutate(r.id), disabled: clearLock.isPending, hidden: Boolean(r.isPrimaryAdmin) },
                          { label: t('common.delete'), onClick: () => askDelete(r), tone: 'danger', disabled: del.isPending, hidden: Boolean(r.isPrimaryAdmin) },
                        ]}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
            mobileCard={(r) => (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-white/90">{r.username}</div>
                  <div className="flex items-center gap-2">
                    {r.status === 'ACTIVE' ? <Badge tone="success">{t('users.status.active')}</Badge> : <Badge tone="danger">{t('users.status.disabled')}</Badge>}
                    <ActionMenu
                      ariaLabel={t('common.actions')}
                      items={[
                        { label: t('common.edit'), onClick: () => beginEdit(r) },
                        { label: t('common.permissions'), onClick: () => openPermissions(r), disabled: Boolean(r.isPrimaryAdmin) },
                        { label: t('users.resetPasswordEmail'), onClick: () => askSendResetEmail(r), disabled: sendResetEmail.isPending },
                        {
                          label: r.status === 'ACTIVE' ? t('common.block') : t('common.unblock'),
                          onClick: () => (r.status === 'ACTIVE' ? block.mutate(r.id) : unblock.mutate(r.id)),
                          disabled: r.status === 'ACTIVE' ? block.isPending : unblock.isPending,
                          hidden: Boolean(r.isPrimaryAdmin),
                        },
                        { label: t('users.clearLoginLock'), onClick: () => clearLock.mutate(r.id), disabled: clearLock.isPending, hidden: Boolean(r.isPrimaryAdmin) },
                        { label: t('common.delete'), onClick: () => askDelete(r), tone: 'danger', disabled: del.isPending, hidden: Boolean(r.isPrimaryAdmin) },
                      ]}
                    />
                  </div>
                </div>
                <div className="text-xs text-white/60">{r.email}</div>
              </div>
            )}
            empty={t('users.empty')}
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('users.editTitle') : t('users.createTitle')}
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
            <div className="text-xs font-medium text-white/70">{t('users.form.username')}</div>
            <div className="mt-2">
              <TextInput value={username} onChange={setUsername} placeholder="ex: admin" />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">{t('users.form.email')}</div>
            <div className="mt-2">
              <TextInput value={email} onChange={setEmail} placeholder="admin@empresa.com" />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">{t('users.form.status')}</div>
            <div className="mt-2">
              <Select
                value={status}
                onChange={(v) => setStatus(v as User['status'])}
                options={[
                  { value: 'ACTIVE', label: t('users.status.active') },
                  { value: 'DISABLED', label: t('users.status.disabled') },
                ]}
              />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/70">{t('users.form.password')}</div>
            <div className="mt-2">
              <TextInput value={password} onChange={setPassword} type="password" placeholder={editing ? '(manter)' : 'mín. 8 caracteres'} />
            </div>
          </div>
          {!editing ? (
            <div className="sm:col-span-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-1">
                    <div className="text-sm font-medium text-white/85">{t('common.permissions')}</div>
                    <div className="text-xs leading-5 text-white/60">
                      {t('users.permissions.createHelp')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCreatePermSelected(PERMISSIONS.map((p) => p.key))}
                    >
                      {t('users.permissions.selectAll')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCreatePermSelected([])}
                    >
                      {t('users.permissions.clear')}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PERMISSIONS.map((p) => {
                    const checked = createPermSelected.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="text-sm text-white/85">{t(p.labelKey)}</div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCreatePermSelected((prev) =>
                              prev.includes(p.key)
                                ? prev.filter((x) => x !== p.key)
                                : [...prev, p.key],
                            )
                          }
                          className="h-4 w-4 accent-[color:var(--accent)]"
                        />
                      </label>
                    );
                  })}
                </div>

                {!createPermSelected.length ? (
                  <div className="mt-2 text-xs text-amber-200">
                    {t('users.permissions.noneWarning')}
                  </div>
                ) : null}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <input
                  type="checkbox"
                  checked={sendWelcomeEmail}
                  onChange={() => setSendWelcomeEmail((v) => !v)}
                  className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                />
                <div className="grid gap-1">
                  <div className="text-sm font-medium text-white/85">{t('users.create.sendWelcomeEmail')}</div>
                  <div className="text-xs leading-5 text-white/60">
                    {t('users.create.sendWelcomeEmail.help')}
                  </div>
                </div>
              </label>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={permOpen}
        onClose={() => {
          setPermOpen(false);
          setPermUser(null);
        }}
        title={t('common.permissions')}
        size="full"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPermOpen(false);
                setPermUser(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => savePermissions.mutate()}
              disabled={savePermissions.isPending || !permUser || Boolean(permUser?.isPrimaryAdmin)}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {permUser?.isPrimaryAdmin ? (
          <div className="text-sm leading-6 text-white/75">
            {t('users.permissions.primaryAdminFixed')}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="text-sm leading-6 text-white/75">
              {t('users.permissions.help')}
            </div>
            <div className="grid gap-2">
              {PERMISSIONS.map((p) => {
                const checked = permSelected.includes(p.key);
                return (
                  <label
                    key={p.key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="text-sm text-white/85">{t(p.labelKey)}</div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPermSelected((prev) =>
                          prev.includes(p.key)
                            ? prev.filter((x) => x !== p.key)
                            : [...prev, p.key],
                        )
                      }
                      className="h-4 w-4 accent-[color:var(--accent)]"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmText={confirm?.confirmText ?? t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmDisabled={del.isPending || sendResetEmail.isPending}
        onConfirm={() => confirm?.onConfirm()}
      >
        {confirm?.details ?? null}
      </ConfirmModal>
    </PageShell>
  );
}
