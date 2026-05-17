'use client';

import Link from 'next/link';

import { useI18n } from '@/components/i18n-provider';
import { env } from '@/lib/env';

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[radial-gradient(1200px_700px_at_20%_10%,rgba(124,58,237,0.18),transparent_60%),radial-gradient(1000px_650px_at_80%_20%,rgba(59,130,246,0.12),transparent_60%),linear-gradient(180deg,#050716,#0b1020)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            {t('home.badge')}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            OpenRouteX
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
            {t('home.subtitle')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: t('home.cards.passThrough.title'),
              desc: t('home.cards.passThrough.desc'),
            },
            {
              title: t('home.cards.variables.title'),
              desc: t('home.cards.variables.desc'),
            },
            {
              title: t('home.cards.observability.title'),
              desc: t('home.cards.observability.desc'),
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="text-sm font-medium text-zinc-50">{c.title}</div>
              <div className="mt-2 text-sm leading-6 text-white/60">{c.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 text-sm font-medium text-white shadow-[0_8px_20px_rgba(124,58,237,0.20)] hover:brightness-110"
          >
            {t('home.login')}
          </Link>
          <a
            href={`${env.apiBaseUrl}/health`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-4 text-sm font-medium text-white/80 hover:bg-white/8"
          >
            {t('home.health')}
          </a>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="text-base font-semibold text-zinc-50">{t('home.docs.title')}</div>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            {t('home.docs.intro')}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-medium text-zinc-50">{t('home.docs.quickStart.title')}</div>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-white/70">
                <li>{t('home.docs.quickStart.1')}</li>
                <li>{t('home.docs.quickStart.2')}</li>
                <li>{t('home.docs.quickStart.3')}</li>
                <li>{t('home.docs.quickStart.4')}</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-medium text-zinc-50">{t('home.docs.publicUrl.title')}</div>
              <div className="mt-3 rounded-xl border border-white/10 bg-[#070a18] p-3 font-mono text-xs text-white/75">
                {t('home.docs.publicUrl.example')}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/70">{t('home.docs.publicUrl.note')}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-zinc-50">{t('home.docs.features.title')}</div>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-white/70">
              <div>
                <span className="text-white/85">{t('home.docs.features.services.title')}</span>{' '}
                {t('home.docs.features.services.desc')}
              </div>
              <div>
                <span className="text-white/85">{t('home.docs.features.routes.title')}</span>{' '}
                {t('home.docs.features.routes.desc')}
              </div>
              <div>
                <span className="text-white/85">{t('home.docs.features.apiKeys.title')}</span>{' '}
                {t('home.docs.features.apiKeys.desc')}
              </div>
              <div>
                <span className="text-white/85">{t('home.docs.features.variables.title')}</span>{' '}
                {t('home.docs.features.variables.desc')}
              </div>
              <div>
                <span className="text-white/85">{t('home.docs.features.certificates.title')}</span>{' '}
                {t('home.docs.features.certificates.desc')}
              </div>
              <div>
                <span className="text-white/85">{t('home.docs.features.logs.title')}</span>{' '}
                {t('home.docs.features.logs.desc')}
              </div>
              <div>
                <span className="text-white/85">{t('home.docs.features.users.title')}</span>{' '}
                {t('home.docs.features.users.desc')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
