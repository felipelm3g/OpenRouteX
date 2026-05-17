'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { Button, Card, CardBody, CardHeader, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { env } from '@/lib/env';

type SettingsDto = {
  language: string;
  timezone: string;
  logsRetentionDays: number;
  logsRetentionDaysSuccess: number;
  logsRetentionDaysError: number;
  logsCleanupIntervalMinutes: number;
  dashboardMetricsRefetchMs: number;
  dashboardLogsRefetchMs: number;
  proxyTimeoutMs: number;
  defaultForwardClientQuery: boolean;
  apiKeyHeaderName: string;
  proxyBlockedHeaders: string[];
  loginMaxAttempts: number;
  loginLockMinutes: number;
  loginLockEmailEnabled: boolean;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordMaxAgeDays: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordSet: boolean;
  smtpFrom: string;
  smtpTlsRejectUnauthorized: boolean;
};

const ALLOWED_TIMEZONES: string[] = [
  'UTC',
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Recife',
  'America/Belem',
  'America/Cuiaba',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export default function SettingsPage() {
  const toast = useToast();
  const { t, language: currentLanguage, setLanguage: setLanguageGlobal } = useI18n();

  const q = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsDto>('/admin/settings'),
  });

  const languagesQ = useQuery({
    queryKey: ['languages'],
    queryFn: async () => {
      const res = await fetch('/api/i18n/languages', { cache: 'no-store' });
      if (!res.ok) return [] as Array<{ code: string; label: string }>;
      return (await res.json()) as Array<{ code: string; label: string }>;
    },
  });

  const [language, setLanguage] = useState(currentLanguage);
  const languageDirtyRef = useRef(false);
  const [timezone, setTimezone] = useState('UTC');
  const [logsRetentionDays, setLogsRetentionDays] = useState('30');
  const [logsCleanupIntervalMinutes, setLogsCleanupIntervalMinutes] = useState('60');
  const [logsRetentionDaysSuccess, setLogsRetentionDaysSuccess] = useState('30');
  const [logsRetentionDaysError, setLogsRetentionDaysError] = useState('90');
  const [dashboardMetricsRefetchMs, setDashboardMetricsRefetchMs] = useState('5000');
  const [dashboardLogsRefetchMs, setDashboardLogsRefetchMs] = useState('2000');
  const [proxyTimeoutMs, setProxyTimeoutMs] = useState('30000');
  const [defaultForwardClientQuery, setDefaultForwardClientQuery] = useState('true');
  const [apiKeyHeaderName, setApiKeyHeaderName] = useState('API-KEY');
  const [proxyBlockedHeadersText, setProxyBlockedHeadersText] = useState('');
  const [loginMaxAttempts, setLoginMaxAttempts] = useState('3');
  const [loginLockMinutes, setLoginLockMinutes] = useState('180');
  const [loginLockEmailEnabled, setLoginLockEmailEnabled] = useState('true');
  const [passwordMinLength, setPasswordMinLength] = useState('8');
  const [passwordRequireUppercase, setPasswordRequireUppercase] = useState('false');
  const [passwordRequireLowercase, setPasswordRequireLowercase] = useState('false');
  const [passwordRequireNumber, setPasswordRequireNumber] = useState('false');
  const [passwordRequireSymbol, setPasswordRequireSymbol] = useState('false');
  const [passwordMaxAgeDays, setPasswordMaxAgeDays] = useState('0');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState('false');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTlsRejectUnauthorized, setSmtpTlsRejectUnauthorized] = useState('true');
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (!q.data) return;
    const data = q.data;
    const t = setTimeout(() => {
      if (!languageDirtyRef.current) {
        setLanguage((prev) => data.language ?? prev);
      }
      setTimezone(data.timezone ?? 'UTC');
      setLogsRetentionDays(String(data.logsRetentionDays ?? 30));
      setLogsCleanupIntervalMinutes(String(data.logsCleanupIntervalMinutes ?? 60));
      setLogsRetentionDaysSuccess(String(data.logsRetentionDaysSuccess ?? 30));
      setLogsRetentionDaysError(String(data.logsRetentionDaysError ?? 90));
      setDashboardMetricsRefetchMs(String(data.dashboardMetricsRefetchMs ?? 5000));
      setDashboardLogsRefetchMs(String(data.dashboardLogsRefetchMs ?? 2000));
      setProxyTimeoutMs(String(data.proxyTimeoutMs ?? 30000));
      setDefaultForwardClientQuery(String(Boolean(data.defaultForwardClientQuery ?? true)));
      setApiKeyHeaderName(String(data.apiKeyHeaderName ?? 'API-KEY'));
      setProxyBlockedHeadersText((data.proxyBlockedHeaders ?? []).join('\n'));
      setLoginMaxAttempts(String(data.loginMaxAttempts ?? 3));
      setLoginLockMinutes(String(data.loginLockMinutes ?? 180));
      setLoginLockEmailEnabled(String(Boolean(data.loginLockEmailEnabled ?? true)));
      setPasswordMinLength(String(data.passwordMinLength ?? 8));
      setPasswordRequireUppercase(String(Boolean(data.passwordRequireUppercase ?? false)));
      setPasswordRequireLowercase(String(Boolean(data.passwordRequireLowercase ?? false)));
      setPasswordRequireNumber(String(Boolean(data.passwordRequireNumber ?? false)));
      setPasswordRequireSymbol(String(Boolean(data.passwordRequireSymbol ?? false)));
      setPasswordMaxAgeDays(String(data.passwordMaxAgeDays ?? 0));
      setSmtpHost(data.smtpHost ?? '');
      setSmtpPort(String(data.smtpPort ?? 587));
      setSmtpSecure(String(Boolean(data.smtpSecure)));
      setSmtpUser(data.smtpUser ?? '');
      setSmtpPasswordSet(Boolean(data.smtpPasswordSet));
      setSmtpFrom(data.smtpFrom ?? '');
      setSmtpTlsRejectUnauthorized(String(Boolean(data.smtpTlsRejectUnauthorized)));
    }, 0);
    return () => clearTimeout(t);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: {
        language: string;
        timezone: string;
        logsRetentionDays: number;
        logsCleanupIntervalMinutes: number;
        logsRetentionDaysSuccess: number;
        logsRetentionDaysError: number;
        dashboardMetricsRefetchMs: number;
        dashboardLogsRefetchMs: number;
        proxyTimeoutMs: number;
        defaultForwardClientQuery: boolean;
        apiKeyHeaderName: string;
        proxyBlockedHeaders: string[];
        loginMaxAttempts: number;
        loginLockMinutes: number;
        loginLockEmailEnabled: boolean;
        passwordMinLength: number;
        passwordRequireUppercase: boolean;
        passwordRequireLowercase: boolean;
        passwordRequireNumber: boolean;
        passwordRequireSymbol: boolean;
        passwordMaxAgeDays: number;
        smtpHost: string;
        smtpPort: number;
        smtpSecure: boolean;
        smtpUser: string;
        smtpFrom: string;
        smtpTlsRejectUnauthorized: boolean;
        smtpPassword?: string;
      } = {
        language: language.trim() || currentLanguage,
        timezone: timezone.trim() || 'UTC',
        logsRetentionDays: Number(logsRetentionDays),
        logsCleanupIntervalMinutes: Number(logsCleanupIntervalMinutes),
        logsRetentionDaysSuccess: Number(logsRetentionDaysSuccess),
        logsRetentionDaysError: Number(logsRetentionDaysError),
        dashboardMetricsRefetchMs: Number(dashboardMetricsRefetchMs),
        dashboardLogsRefetchMs: Number(dashboardLogsRefetchMs),
        proxyTimeoutMs: Number(proxyTimeoutMs),
        defaultForwardClientQuery: defaultForwardClientQuery === 'true',
        apiKeyHeaderName: apiKeyHeaderName.trim() || 'API-KEY',
        proxyBlockedHeaders: proxyBlockedHeadersText
          .split('\n')
          .map((v) => v.trim())
          .filter(Boolean),
        loginMaxAttempts: Number(loginMaxAttempts),
        loginLockMinutes: Number(loginLockMinutes),
        loginLockEmailEnabled: loginLockEmailEnabled === 'true',
        passwordMinLength: Number(passwordMinLength),
        passwordRequireUppercase: passwordRequireUppercase === 'true',
        passwordRequireLowercase: passwordRequireLowercase === 'true',
        passwordRequireNumber: passwordRequireNumber === 'true',
        passwordRequireSymbol: passwordRequireSymbol === 'true',
        passwordMaxAgeDays: Number(passwordMaxAgeDays),
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort),
        smtpSecure: smtpSecure === 'true',
        smtpUser: smtpUser.trim(),
        smtpFrom: smtpFrom.trim(),
        smtpTlsRejectUnauthorized: smtpTlsRejectUnauthorized === 'true',
      };
      if (smtpPassword.trim()) payload.smtpPassword = smtpPassword.trim();
      return apiFetch<SettingsDto>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (r: SettingsDto) => {
      setLanguageGlobal(r.language ?? currentLanguage);
      if (r.language) setLanguage(r.language);
      languageDirtyRef.current = false;
      toast.success(t('common.save'), t('settings.saved'));
      setSmtpPassword('');
      setSmtpPasswordSet(Boolean(r.smtpPasswordSet));
    },
    onError: (e: unknown) =>
      toast.error(
        t('common.error'),
        (e as { message?: string | undefined })?.message ?? t('common.failure'),
      ),
  });

  const testEmail = useMutation({
    mutationFn: async () => {
      return apiFetch<{ ok: true }>('/admin/test-email', {
        method: 'POST',
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
    },
    onSuccess: () => toast.success(t('common.sent'), t('settings.testEmail.sent')),
    onError: (e: unknown) =>
      toast.error(t('common.failure'), (e as { message?: string })?.message ?? t('common.failure')),
  });

  const tzOptions = (() => {
    const current = timezone.trim() || 'UTC';
    const base: string[] = [...ALLOWED_TIMEZONES];
    if (!base.includes(current)) base.unshift(current);
    return base.map((tz) => ({ value: tz, label: tz }));
  })();

  const retentionOptions = [
    { value: '0', label: t('settings.logsRetention.disabled') },
    { value: '1', label: t('settings.logsRetention.days', { n: 1 }) },
    { value: '3', label: t('settings.logsRetention.days', { n: 3 }) },
    { value: '7', label: t('settings.logsRetention.days', { n: 7 }) },
    { value: '30', label: t('settings.logsRetention.days', { n: 30 }) },
    { value: '90', label: t('settings.logsRetention.days', { n: 90 }) },
    { value: '180', label: t('settings.logsRetention.days', { n: 180 }) },
    { value: '365', label: t('settings.logsRetention.days', { n: 365 }) },
  ];

  return (
    <PageShell
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
    >
      <Card>
        <CardHeader title={t('settings.backend.title')} description={t('settings.backend.description')} />
        <CardBody>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/55">{t('settings.backend.composeUrl')}</div>
            <div className="mt-2 font-mono text-sm text-white/80">
              {env.apiBaseUrl}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('settings.portal.title')}
          description={t('settings.portal.description')}
          right={
            <Button onClick={() => save.mutate()} disabled={save.isPending || q.isPending}>
              {t('common.save')}
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.language.label')}</div>
              <div className="mt-2">
                <Select
                  value={language}
                  onChange={(v) => {
                    languageDirtyRef.current = true;
                    setLanguage(v);
                    setLanguageGlobal(v);
                  }}
                  options={(languagesQ.data?.length
                    ? languagesQ.data
                    : [
                        { code: 'en_us', label: 'English (US)' },
                        { code: 'pt_br', label: 'Português (Brasil)' },
                      ]
                  ).map((l) => ({ value: l.code, label: l.label }))}
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.timezone.label')}</div>
              <div className="mt-2">
                <Select value={timezone} onChange={setTimezone} options={tzOptions} />
              </div>
              <div className="mt-2 text-xs text-white/55">
                {t('settings.timezone.help')}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.logsRetention.label')}</div>
              <div className="mt-2">
                <Select
                  value={logsRetentionDays}
                  onChange={setLogsRetentionDays}
                  options={retentionOptions}
                />
              </div>
              <div className="mt-2 text-xs text-white/55">
                {t('settings.logsRetention.help')}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.logsRetention.success')}</div>
              <div className="mt-2">
                <Select value={logsRetentionDaysSuccess} onChange={setLogsRetentionDaysSuccess} options={retentionOptions} />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.logsRetention.success.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.logsRetention.error')}</div>
              <div className="mt-2">
                <Select value={logsRetentionDaysError} onChange={setLogsRetentionDaysError} options={retentionOptions} />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.logsRetention.error.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.logsCleanupInterval.label')}</div>
              <div className="mt-2">
                <TextInput value={logsCleanupIntervalMinutes} onChange={setLogsCleanupIntervalMinutes} type="number" placeholder="60" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.logsCleanupInterval.help')}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.dashboard.metricsRefetch')}</div>
              <div className="mt-2">
                <TextInput value={dashboardMetricsRefetchMs} onChange={setDashboardMetricsRefetchMs} type="number" placeholder="5000" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.dashboard.metricsRefetch.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.dashboard.logsRefetch')}</div>
              <div className="mt-2">
                <TextInput value={dashboardLogsRefetchMs} onChange={setDashboardLogsRefetchMs} type="number" placeholder="2000" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.dashboard.logsRefetch.help')}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('settings.gateway.title')}
          description={t('settings.gateway.description')}
          right={
            <Button onClick={() => save.mutate()} disabled={save.isPending || q.isPending}>
              {t('common.save')}
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.gateway.proxyTimeoutMs')}</div>
              <div className="mt-2">
                <TextInput value={proxyTimeoutMs} onChange={setProxyTimeoutMs} type="number" placeholder="30000" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.gateway.proxyTimeoutMs.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.gateway.defaultForwardQuery')}</div>
              <div className="mt-2">
                <Select
                  value={defaultForwardClientQuery}
                  onChange={setDefaultForwardClientQuery}
                  options={[
                    { value: 'true', label: t('common.yes') },
                    { value: 'false', label: t('common.no') },
                  ]}
                />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.gateway.defaultForwardQuery.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.gateway.apiKeyHeaderName')}</div>
              <div className="mt-2">
                <TextInput value={apiKeyHeaderName} onChange={setApiKeyHeaderName} placeholder="API-KEY" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.gateway.apiKeyHeaderName.help')}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs font-medium text-white/70">{t('settings.gateway.blockedHeaders')}</div>
              <div className="mt-2 text-xs text-white/55">{t('settings.gateway.blockedHeaders.help')}</div>
              <textarea
                value={proxyBlockedHeadersText}
                onChange={(e) => setProxyBlockedHeadersText(e.target.value)}
                className="mt-3 h-36 w-full rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-sm text-white/85 outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
                placeholder="authorization&#10;cookie"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('settings.security.title')}
          description={t('settings.security.description')}
          right={
            <Button onClick={() => save.mutate()} disabled={save.isPending || q.isPending}>
              {t('common.save')}
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.passwordMinLength')}</div>
              <div className="mt-2">
                <TextInput value={passwordMinLength} onChange={setPasswordMinLength} type="number" placeholder="8" />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.passwordMaxAgeDays')}</div>
              <div className="mt-2">
                <TextInput value={passwordMaxAgeDays} onChange={setPasswordMaxAgeDays} type="number" placeholder="0" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.security.passwordMaxAgeDays.help')}</div>
            </div>
            <div />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.requireUpper')}</div>
              <div className="mt-2">
                <Select value={passwordRequireUppercase} onChange={setPasswordRequireUppercase} options={[{ value: 'false', label: t('common.no') }, { value: 'true', label: t('common.yes') }]} />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.requireLower')}</div>
              <div className="mt-2">
                <Select value={passwordRequireLowercase} onChange={setPasswordRequireLowercase} options={[{ value: 'false', label: t('common.no') }, { value: 'true', label: t('common.yes') }]} />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.requireNumber')}</div>
              <div className="mt-2">
                <Select value={passwordRequireNumber} onChange={setPasswordRequireNumber} options={[{ value: 'false', label: t('common.no') }, { value: 'true', label: t('common.yes') }]} />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.requireSymbol')}</div>
              <div className="mt-2">
                <Select value={passwordRequireSymbol} onChange={setPasswordRequireSymbol} options={[{ value: 'false', label: t('common.no') }, { value: 'true', label: t('common.yes') }]} />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.loginMaxAttempts')}</div>
              <div className="mt-2">
                <TextInput value={loginMaxAttempts} onChange={setLoginMaxAttempts} type="number" placeholder="3" />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.loginLockMinutes')}</div>
              <div className="mt-2">
                <TextInput value={loginLockMinutes} onChange={setLoginLockMinutes} type="number" placeholder="180" />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.security.loginLockEmailEnabled')}</div>
              <div className="mt-2">
                <Select value={loginLockEmailEnabled} onChange={setLoginLockEmailEnabled} options={[{ value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }]} />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.security.loginLockEmailEnabled.help')}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('settings.smtp.title')}
          description={t('settings.smtp.description')}
          right={
            <div className="flex items-center gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending || q.isPending}>
                {t('common.save')}
              </Button>
              <Button onClick={() => testEmail.mutate()} disabled={testEmail.isPending || q.isPending}>
                {t('settings.smtp.test')}
              </Button>
            </div>
          }
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.host')}</div>
              <div className="mt-2">
                <TextInput value={smtpHost} onChange={setSmtpHost} placeholder="smtp.seudominio.com" />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.port')}</div>
              <div className="mt-2">
                <TextInput value={smtpPort} onChange={setSmtpPort} type="number" placeholder="587" />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.smtp.port.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.secure')}</div>
              <div className="mt-2">
                <Select
                  value={smtpSecure}
                  onChange={setSmtpSecure}
                  options={[
                    { value: 'false', label: 'false (STARTTLS)' },
                    { value: 'true', label: 'true (SMTPS)' },
                  ]}
                />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.smtp.secure.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.tlsRejectUnauthorized')}</div>
              <div className="mt-2">
                <Select
                  value={smtpTlsRejectUnauthorized}
                  onChange={setSmtpTlsRejectUnauthorized}
                  options={[
                    { value: 'true', label: 'true' },
                    { value: 'false', label: 'false' },
                  ]}
                />
              </div>
              <div className="mt-2 text-xs text-white/55">{t('settings.smtp.tlsRejectUnauthorized.help')}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.user')}</div>
              <div className="mt-2">
                <TextInput value={smtpUser} onChange={setSmtpUser} placeholder="usuario@dominio.com" />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.password')}</div>
              <div className="mt-2">
                <TextInput value={smtpPassword} onChange={setSmtpPassword} type="password" placeholder={smtpPasswordSet ? '(já configurada)' : '(vazio)'} />
              </div>
              <div className="mt-2 text-xs text-white/55">
                {smtpPasswordSet
                  ? t('settings.smtp.passwordSet.yes')
                  : t('settings.smtp.passwordSet.no')}{' '}
                — {t('settings.smtp.password.help')}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.from')}</div>
              <div className="mt-2">
                <TextInput value={smtpFrom} onChange={setSmtpFrom} placeholder="OpenRouteX <no-reply@dominio.com>" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs font-medium text-white/70">{t('settings.smtp.testTo')}</div>
              <div className="mt-2">
                <TextInput value={testTo} onChange={setTestTo} placeholder={t('settings.smtp.testTo.placeholder')} />
              </div>
              <div className="mt-2 text-xs text-white/55">
                {t('settings.smtp.testTo.help')}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </PageShell>
  );
}
