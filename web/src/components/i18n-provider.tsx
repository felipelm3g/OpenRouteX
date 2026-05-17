'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';

type SettingsDto = { language?: string };
type Messages = Record<string, string>;

const DEFAULT_LANGUAGE = 'en_us';
const STORAGE_KEY = 'orx_language';

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function getStoredLanguage(): string {
  if (typeof document === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && v.trim()) return v.trim();
  } catch {}

  const fromCookie = document.cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('orx_lang='));
  if (fromCookie) {
    const raw = fromCookie.slice('orx_lang='.length);
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded.trim()) return decoded.trim();
    } catch {
      if (raw && raw.trim()) return raw.trim();
    }
  }

  return DEFAULT_LANGUAGE;
}

function storeLanguage(lang: string) {
  if (typeof document === 'undefined') return;
  const v = String(lang ?? '').trim() || DEFAULT_LANGUAGE;
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {}
  document.cookie = `orx_lang=${encodeURIComponent(v)}; Path=/; Max-Age=${60 * 60 * 24 * 365}`;
}

async function loadMessages(lang: string): Promise<Messages> {
  const res = await fetch(`/api/i18n/messages?lang=${encodeURIComponent(lang)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('not_found');
  const json: unknown = await res.json();
  if (!isObject(json)) return {};
  const out: Messages = {};
  for (const [k, v] of Object.entries(json)) {
    if (k === '__meta') continue;
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? m : String(v);
  });
}

type I18nContextValue = {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const hasToken =
    typeof document !== 'undefined' &&
    document.cookie.split(';').some((p) => p.trim().startsWith('orx_token='));

  const settings = useQuery({
    queryKey: ['settings'],
    enabled: hasToken,
    retry: false,
    queryFn: () => apiFetch<SettingsDto>('/admin/settings'),
  });

  const [language, setLanguageState] = useState(() => getStoredLanguage());
  const [messages, setMessages] = useState<Messages>({});
  const [fallbackMessages, setFallbackMessages] = useState<Messages>({});

  const setLanguage = useCallback((lang: string) => {
    const v = String(lang ?? '').trim() || DEFAULT_LANGUAGE;
    setLanguageState(v);
    storeLanguage(v);
  }, []);

  useEffect(() => {
    if (!settings.data?.language) return;
    const v = String(settings.data.language ?? '').trim();
    if (!v) return;
    const t = setTimeout(() => {
      setLanguageState((prev) => (prev === v ? prev : v));
      storeLanguage(v);
    }, 0);
    return () => clearTimeout(t);
  }, [settings.data?.language]);

  useEffect(() => {
    let cancelled = false;
    void loadMessages(DEFAULT_LANGUAGE)
      .then((m) => {
        if (cancelled) return;
        setFallbackMessages(m);
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackMessages({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadMessages(language)
      .then((m) => {
        if (cancelled) return;
        setMessages(m);
        if (typeof document !== 'undefined') {
          const htmlLang = language.startsWith('pt') ? 'pt-BR' : language.startsWith('en') ? 'en' : language;
          document.documentElement.lang = htmlLang;
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMessages({});
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = messages[key] ?? fallbackMessages[key] ?? key;
      return interpolate(raw, vars);
    },
    [fallbackMessages, messages],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
