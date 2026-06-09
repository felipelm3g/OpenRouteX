'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useI18n } from './i18n-provider';
import { Badge, cn } from './ui';

type NavItem = { href: string; key: string };

const NAV: NavItem[] = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/authentication', key: 'nav.authentication' },
  { href: '/apis', key: 'nav.apis' },
  { href: '/paths', key: 'nav.paths' },
  { href: '/api-keys', key: 'nav.apiKeys' },
  { href: '/certificates', key: 'nav.certificates' },
  { href: '/import-export', key: 'nav.importExport' },
  { href: '/users', key: 'nav.users' },
  { href: '/settings', key: 'nav.settings' },
];

export function AppShell({
  children,
  systemOk,
  permissions,
  isPrimaryAdmin,
}: {
  children: React.ReactNode;
  systemOk: boolean | null;
  permissions: string[] | null;
  isPrimaryAdmin: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = useMemo(() => {
    if (isPrimaryAdmin || !permissions) return NAV;
    const keyByHref: Record<string, string> = {
      '/dashboard': 'dashboard',
      '/authentication': 'authentication',
      '/apis': 'apis',
      '/paths': 'paths',
      '/api-keys': 'apikeys',
      '/certificates': 'certificates',
      '/import-export': 'import_export',
      '/users': 'users',
      '/settings': 'settings',
    };
    return NAV.filter((n) => permissions.includes(keyByHref[n.href] ?? ''));
  }, [isPrimaryAdmin, permissions]);

  const statusBadge = useMemo(() => {
    if (systemOk === null) return <Badge tone="neutral">{t('status.checking')}</Badge>;
    return systemOk ? (
      <Badge tone="success">{t('status.apiOnline')}</Badge>
    ) : (
      <Badge tone="danger">{t('status.apiOffline')}</Badge>
    );
  }, [systemOk, t]);

  const onLogout = () => {
    if (typeof document !== 'undefined') {
      document.cookie = 'orx_token=; Path=/; Max-Age=0; SameSite=Lax; Priority=High';
    }
    window.location.href = '/';
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[radial-gradient(1200px_700px_at_20%_10%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_60%),radial-gradient(1000px_650px_at_80%_20%,color-mix(in_oklab,var(--accent-2)_16%,transparent),transparent_60%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_55%,#000),var(--background))]">
      <aside className="hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-white/8 bg-white/[0.03] p-4 lg:flex">
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center">
            <img
              src="/logo_OpenRouteX.png"
              alt="OpenRouteX"
              className="h-6 w-auto"
            />
          </div>
          <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70">
            {t('app.badge')}
          </span>
        </div>
        <nav className="mt-3 flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/6 hover:text-white',
                  active && 'bg-white/8 text-white',
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-white/80">{t('status.title')}</div>
          <div className="mt-2">{statusBadge}</div>
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            <span className="grid gap-1">
              <span className="h-0.5 w-5 rounded bg-white/80" />
              <span className="h-0.5 w-5 rounded bg-white/80" />
              <span className="h-0.5 w-5 rounded bg-white/80" />
            </span>
            <span>Menu</span>
          </button>
          <img src="/logo_OpenRouteX.png" alt="OpenRouteX" className="h-6 w-auto" />
          <div className="shrink-0">{statusBadge}</div>
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(86vw,340px)] overflow-hidden border-r border-white/10 bg-[#070a18]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <img src="/logo_OpenRouteX.png" alt="OpenRouteX" className="h-6 w-auto" />
                <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70">
                  {t('app.badge')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="flex h-full flex-col overflow-y-auto p-4">
              <nav className="flex flex-col gap-1">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/6 hover:text-white',
                        active && 'bg-white/8 text-white',
                      )}
                    >
                      {t(item.key)}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-medium text-white/80">{t('status.title')}</div>
                <div className="mt-2">{statusBadge}</div>
              </div>

              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {t('nav.logout')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
