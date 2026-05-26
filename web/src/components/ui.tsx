'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function PageShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm leading-6 text-[color:var(--muted-2)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--card-border)] p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <div className="text-sm font-medium text-zinc-50">{title}</div>
        {description ? (
          <div className="text-sm text-[color:var(--muted-2)]">{description}</div>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5">{children}</div>;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info';
}) {
  const toneCls =
    tone === 'success'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
      : tone === 'danger'
        ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
        : tone === 'warning'
          ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
          : tone === 'info'
            ? 'border-sky-400/20 bg-sky-400/10 text-sky-200'
            : 'border-white/15 bg-white/5 text-zinc-200';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', toneCls)}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  href,
  variant = 'primary',
  size = 'md',
  disabled,
  type,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  ariaLabel?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40 disabled:opacity-60 disabled:pointer-events-none';
  const sizes = size === 'icon' ? 'h-9 w-9 p-0 text-sm' : size === 'sm' ? 'h-9 px-3 text-sm' : 'h-10 px-4 text-sm';
  const variants =
    variant === 'primary'
      ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_8px_20px_rgba(124,58,237,0.20)] hover:brightness-110'
      : variant === 'secondary'
        ? 'bg-white/6 text-zinc-50 border border-white/12 hover:bg-white/10'
        : variant === 'danger'
          ? 'bg-rose-500/15 text-rose-200 border border-rose-500/25 hover:bg-rose-500/20'
          : 'bg-transparent text-zinc-200 hover:bg-white/6 border border-transparent hover:border-white/10';

  const cls = cn(base, sizes, variants);

  if (href) {
    return (
      <Link className={cls} href={href} title={title} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-50 placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-[color:var(--accent)]/30"
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-[color:var(--foreground)] focus:border-white/20 focus:ring-2 focus:ring-[color:var(--accent)]/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function MethodBadge({ method }: { method: string }) {
  const tone =
    method === 'GET'
      ? 'info'
      : method === 'POST'
        ? 'success'
        : method === 'DELETE'
          ? 'danger'
          : method === 'PUT' || method === 'PATCH'
            ? 'warning'
            : 'neutral';
  return <Badge tone={tone}>{method}</Badge>;
}

type ToastItem = { id: string; title: string; description?: string; tone: 'success' | 'danger' | 'neutral' };
type ToastPush = (t: Omit<ToastItem, 'id'>) => void;

const ToastContext = createContext<{ push: ToastPush } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  return useMemo(() => {
    const push = ctx?.push;
    return {
      success: (title: string, description?: string) =>
        push?.({ title, description, tone: 'success' }),
      error: (title: string, description?: string) =>
        push?.({ title, description, tone: 'danger' }),
      info: (title: string, description?: string) =>
        push?.({ title, description, tone: 'neutral' }),
    };
  }, [ctx]);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback<ToastPush>((t) => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((prev) => [...prev, { id, ...t }]);
    window.setTimeout(
      () => setItems((prev) => prev.filter((x) => x.id !== id)),
      3500,
    );
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-2xl border p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur',
              t.tone === 'success'
                ? 'border-emerald-400/20 bg-emerald-400/10'
                : t.tone === 'danger'
                  ? 'border-rose-400/20 bg-rose-400/10'
                  : 'border-white/12 bg-white/8',
            )}
          >
            <div className="text-sm font-medium text-zinc-50">{t.title}</div>
            {t.description ? (
              <div className="mt-1 text-sm text-[color:var(--muted-2)]">
                {t.description}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl border border-white/10 bg-white/5',
        className,
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="grid gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
