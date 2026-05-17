'use client';

import { useEffect } from 'react';

import { useI18n } from './i18n-provider';
import { Button, cn } from './ui';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'full';
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const widthClass =
    size === 'full'
      ? 'max-w-[calc(100vw-24px)]'
      : size === 'xl'
        ? 'max-w-6xl'
        : size === 'md'
          ? 'max-w-xl'
          : 'max-w-3xl lg:max-w-4xl';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 overflow-x-hidden overflow-y-auto p-3">
        <div className="flex min-h-full items-end justify-center sm:items-center">
          <div
            className={cn(
              'flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#070a18] shadow-[0_20px_80px_rgba(0,0,0,0.55)]',
              widthClass,
              'max-h-[calc(100dvh-24px)]',
            )}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#070a18] p-5">
              <div className="text-sm font-semibold text-zinc-50">{title}</div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('common.close')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
            {footer ? (
              <div className="sticky bottom-0 border-t border-white/10 bg-[#070a18] p-5">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  confirmDisabled,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const cText = cancelText ?? t('common.cancel');
  const okText = confirmText ?? t('common.confirm');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {cText}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={confirmDisabled}>
            {okText}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="text-sm leading-6 text-white/75">{description}</div>
        {children ? <div className="rounded-xl border border-white/10 bg-white/5 p-3">{children}</div> : null}
      </div>
    </Modal>
  );
}
