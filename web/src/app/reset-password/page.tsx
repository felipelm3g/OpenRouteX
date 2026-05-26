'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { Button, Card, CardBody, CardHeader, PageShell, TextInput } from '@/components/ui';
import { env } from '@/lib/env';

type ApiError = { message?: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const txt = await res.text();
  const json: unknown = txt ? JSON.parse(txt) : null;
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && !Array.isArray(json)
        ? String((json as ApiError).message ?? '')
        : '';
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }
  return (json ?? (null as unknown as T)) as T;
}

function ResetPasswordInner() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const token = useMemo(() => String(sp.get('token') ?? '').trim(), [sp]);
  const emailParam = useMemo(() => String(sp.get('email') ?? '').trim().toLowerCase(), [sp]);

  const [email, setEmail] = useState(() => emailParam);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    setError('');
    const hasToken = Boolean(token);
    const e = email.trim().toLowerCase();
    const c = code.trim();
    const p = password.trim();
    const p2 = password2.trim();

    if (!env.apiBaseUrl.trim()) {
      setError('URL do backend não configurada.');
      return;
    }
    if (!p) {
      setError('Senha obrigatória.');
      return;
    }
    if (p.length < 8) {
      setError('Senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (p !== p2) {
      setError('As senhas não conferem.');
      return;
    }
    if (!hasToken) {
      if (!e) {
        setError('Email obrigatório.');
        return;
      }
      if (!c) {
        setError('Código obrigatório.');
        return;
      }
    } else if (!token) {
      setError('Token inválido.');
      return;
    }

    setLoading(true);
    try {
      if (hasToken) {
        await postJson<{ ok: true }>(`${env.apiBaseUrl}/password-reset/confirm`, {
          token,
          password: p,
        });
      } else {
        await postJson<{ ok: true }>(`${env.apiBaseUrl}/password-reset/confirm-code`, {
          email: e,
          code: c,
          password: p,
        });
      }
      setDone(true);
      setPassword('');
      setPassword2('');
      setCode('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha';
      setError(msg || 'Falha');
    } finally {
      setLoading(false);
    }
  };

  const hasToken = Boolean(token);
  const pageTitle = t('reset.title');
  const pageSubtitle = t('reset.subtitle');
  const cardTitle = hasToken ? t('reset.title') : t('reset.codeFlow.title');

  return (
    <PageShell
      title={pageTitle}
      subtitle={pageSubtitle}
    >
      <Card className="max-w-xl">
        <CardHeader title={cardTitle} description={hasToken ? 'O link é válido por tempo limitado.' : 'Código válido por 1 hora.'} />
        <CardBody>
          {done ? (
            <div className="grid gap-3">
              <div className="text-sm text-white/80">{t('reset.success')}</div>
              <div>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2 text-sm font-medium text-white"
                >
                  {t('reset.backToLogin')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {!hasToken ? (
                <>
                  <div>
                    <div className="text-xs font-medium text-white/70">{t('forgot.email')}</div>
                    <div className="mt-2">
                      <TextInput value={email} onChange={setEmail} placeholder="seuemail@dominio.com" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white/70">{t('reset.code')}</div>
                    <div className="mt-2">
                      <TextInput value={code} onChange={setCode} placeholder="000000" />
                    </div>
                  </div>
                </>
              ) : null}
              <div>
                <div className="text-xs font-medium text-white/70">{t('reset.newPassword')}</div>
                <div className="mt-2">
                  <TextInput value={password} onChange={setPassword} type="password" placeholder="mín. 8 caracteres" />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">{t('reset.confirmPassword')}</div>
                <div className="mt-2">
                  <TextInput value={password2} onChange={setPassword2} type="password" placeholder="repita a senha" />
                </div>
              </div>
              {error ? <div className="text-sm text-rose-200">{error}</div> : null}
              <div className="flex items-center gap-2">
                <Button onClick={onSubmit} disabled={loading}>
                  {t('reset.save')}
                </Button>
                <Link href="/login" className="text-sm text-white/60 hover:text-white">
                  Voltar
                </Link>
                {!hasToken ? (
                  <Link href="/forgot-password" className="text-sm text-white/60 hover:text-white">
                    {t('reset.requestCode')}
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </PageShell>
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <PageShell title={t('reset.title')} subtitle={t('reset.subtitle')}>
          <Card className="max-w-xl">
            <CardHeader title={t('reset.title')} description="Carregando…" />
            <CardBody>
              <div className="text-sm text-white/70">Carregando…</div>
            </CardBody>
          </Card>
        </PageShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
