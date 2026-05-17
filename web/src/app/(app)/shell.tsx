'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const hasToken =
    typeof document !== 'undefined' &&
    document.cookie.split(';').some((p) => p.trim().startsWith('orx_token='));

  useEffect(() => {
    if (!hasToken) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
  }, [hasToken]);

  const session = useQuery({
    queryKey: ['session'],
    enabled: hasToken,
    retry: false,
    queryFn: () =>
      apiFetch<{
        ok: true;
        user: null | { username?: string; permissions?: string[] | null; isPrimaryAdmin?: boolean };
      }>('/admin/session'),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const user = session.data?.user;
    if (!user) return;
    if (user.isPrimaryAdmin) return;
    const perms = user.permissions;
    if (!Array.isArray(perms)) return;

    const hrefByKey: Record<string, string> = {
      dashboard: '/dashboard',
      authentication: '/authentication',
      apis: '/apis',
      paths: '/paths',
      apikeys: '/api-keys',
      certificates: '/certificates',
      users: '/users',
      settings: '/settings',
    };
    const allowed = perms.map((k) => hrefByKey[k]).filter(Boolean);
    if (!allowed.length) return;
    if (!allowed.includes(window.location.pathname)) {
      window.location.href = allowed[0]!;
    }
  }, [session.data]);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await apiFetch<{ ok: boolean }>('/health');
      return res.ok;
    },
    refetchInterval: 10_000,
  });

  const systemOk = useMemo(() => {
    if (health.isPending) return null;
    return health.data ?? false;
  }, [health.data, health.isPending]);

  return (
    <>
      <AppShell
        systemOk={systemOk}
        permissions={session.data?.user?.permissions ?? null}
        isPrimaryAdmin={Boolean(session.data?.user?.isPrimaryAdmin)}
      >
        {children}
      </AppShell>
    </>
  );
}
