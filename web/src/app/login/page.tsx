'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { Button, Card, CardBody, CardHeader, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type LoginResponse = { token: string };

function setTokenCookie(token: string) {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `orx_token=${token}; Path=/; Max-Age=604800; SameSite=Lax; Priority=High${secure}`;
}

function clearTokenCookie() {
  document.cookie = 'orx_token=; Path=/; Max-Age=0; SameSite=Lax; Priority=High';
}

export default function LoginPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  const nextUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/dashboard';
    const next = new URLSearchParams(window.location.search).get('next') ?? '';
    const value = next.trim();
    if (!value) return '/dashboard';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    return '/dashboard';
  }, []);

  useEffect(() => {
    clearTokenCookie();
  }, []);

  const login = useMutation({
    mutationFn: async () => {
      const u = username.trim();
      const p = password.trim();
      if (!u || !p) throw new Error(t('login.missingCredentials'));
      return apiFetch<LoginResponse>('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
      });
    },
    onSuccess: (r: LoginResponse) => {
      setTokenCookie(r.token);
      window.location.href = nextUrl;
    },
    onError: (e: unknown) => {
      const msg = (e as { message?: string })?.message ?? t('common.failure');
      toast.error(t('login.invalidTitle'), msg);
    },
  });

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[radial-gradient(1200px_700px_at_20%_10%,rgba(124,58,237,0.18),transparent_60%),radial-gradient(1000px_650px_at_80%_20%,rgba(59,130,246,0.12),transparent_60%),linear-gradient(180deg,#050716,#0b1020)] px-6 py-16">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader title={t('login.title')} description={t('login.subtitle')} />
          <CardBody>
            <div className="grid gap-4">
              <div>
                <div className="text-xs font-medium text-white/70">{t('login.username')}</div>
                <div className="mt-2">
                  <TextInput value={username} onChange={setUsername} placeholder="admin" />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">{t('login.password')}</div>
                <div className="mt-2">
                  <TextInput value={password} onChange={setPassword} type="password" placeholder="••••••••" />
                </div>
              </div>
              <Button onClick={() => login.mutate()} disabled={login.isPending}>
                {t('login.submit')}
              </Button>
              <div className="text-center text-xs text-white/55">
                <Link href="/" className="hover:text-white/80">
                  {t('common.back')}
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
