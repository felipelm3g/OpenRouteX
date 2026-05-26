'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { Button, Card, CardBody, CardHeader, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const send = useMutation({
    mutationFn: async () => {
      const e = normalizedEmail;
      if (!e) throw new Error('Email obrigatório.');
      return apiFetch<{ ok: true }>('/password-reset/request-code', {
        method: 'POST',
        body: JSON.stringify({ email: e }),
      });
    },
    onSuccess: () => {
      setSent(true);
      toast.success(t('forgot.sent.title'), t('forgot.sent.body'));
    },
    onError: (e: unknown) => {
      const msg =
        (e as { message?: string })?.message ??
        (e as { status?: number; message?: string })?.message ??
        t('common.failure');
      toast.error(t('common.error'), msg);
    },
  });

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[radial-gradient(1200px_700px_at_20%_10%,rgba(124,58,237,0.18),transparent_60%),radial-gradient(1000px_650px_at_80%_20%,rgba(59,130,246,0.12),transparent_60%),linear-gradient(180deg,#050716,#0b1020)] px-6 py-16">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader title={t('forgot.title')} description={t('forgot.subtitle')} />
          <CardBody>
            <div className="grid gap-4">
              <div>
                <div className="text-xs font-medium text-white/70">{t('forgot.email')}</div>
                <div className="mt-2">
                  <TextInput value={email} onChange={setEmail} placeholder="seuemail@dominio.com" />
                </div>
              </div>
              <Button onClick={() => send.mutate()} disabled={send.isPending}>
                {t('forgot.submit')}
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <Link
                  href={`/reset-password${normalizedEmail ? `?email=${encodeURIComponent(normalizedEmail)}` : ''}`}
                  className="text-white/65 hover:text-white/85"
                >
                  {t('forgot.haveCode')}
                </Link>
                <Link href="/login" className="text-white/55 hover:text-white/80">
                  {t('common.back')}
                </Link>
              </div>

              {sent ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                  {t('forgot.sent.body')}
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
