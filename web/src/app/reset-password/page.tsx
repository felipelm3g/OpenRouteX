'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

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
  const sp = useSearchParams();
  const token = useMemo(() => String(sp.get('token') ?? '').trim(), [sp]);

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    setError('');
    if (!token) {
      setError('Token inválido.');
      return;
    }
    if (password.trim().length < 8) {
      setError('Senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== password2) {
      setError('As senhas não conferem.');
      return;
    }
    if (!env.apiBaseUrl.trim()) {
      setError('URL do backend não configurada.');
      return;
    }

    setLoading(true);
    try {
      await postJson<{ ok: true }>(`${env.apiBaseUrl}/password-reset/confirm`, {
        token,
        password,
      });
      setDone(true);
      setPassword('');
      setPassword2('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha';
      setError(msg || 'Falha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Redefinir senha"
      subtitle="Defina uma nova senha para sua conta."
    >
      <Card className="max-w-xl">
        <CardHeader title="Nova senha" description="O link é válido por tempo limitado." />
        <CardBody>
          {done ? (
            <div className="grid gap-3">
              <div className="text-sm text-white/80">Senha atualizada com sucesso.</div>
              <div>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2 text-sm font-medium text-white"
                >
                  Ir para o login
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <div className="text-xs font-medium text-white/70">Senha</div>
                <div className="mt-2">
                  <TextInput value={password} onChange={setPassword} type="password" placeholder="mín. 8 caracteres" />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">Confirmar senha</div>
                <div className="mt-2">
                  <TextInput value={password2} onChange={setPassword2} type="password" placeholder="repita a senha" />
                </div>
              </div>
              {error ? <div className="text-sm text-rose-200">{error}</div> : null}
              <div className="flex items-center gap-2">
                <Button onClick={onSubmit} disabled={loading}>
                  Salvar nova senha
                </Button>
                <Link href="/login" className="text-sm text-white/60 hover:text-white">
                  Voltar
                </Link>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </PageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <PageShell title="Redefinir senha" subtitle="Defina uma nova senha para sua conta.">
          <Card className="max-w-xl">
            <CardHeader title="Nova senha" description="Carregando…" />
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
