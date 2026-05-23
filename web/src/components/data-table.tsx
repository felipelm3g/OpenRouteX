'use client';

import { useMemo, useState } from 'react';

import { useI18n } from './i18n-provider';
import { Button, cn, TextInput } from './ui';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  filterValue?: (row: T) => string;
  hideOnMobile?: boolean;
};

type SortDir = 'asc' | 'desc';

export function DataTable<T>({
  rows,
  columns,
  keyField,
  empty,
  mobileCard,
  enableFilter = true,
  enablePagination = true,
  pageSize = 10,
  filterPlaceholder = 'Filtrar…',
  initialSort,
}: {
  rows: T[];
  columns: Column<T>[];
  keyField: (row: T) => string;
  empty?: React.ReactNode;
  mobileCard?: (row: T) => React.ReactNode;
  enableFilter?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
  filterPlaceholder?: string;
  initialSort?: { key: string; dir: SortDir };
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    initialSort ?? null,
  );
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!enableFilter) return rows;
    const f = filter.trim().toLowerCase();
    if (!f) return rows;

    return rows.filter((r) => {
      const parts = columns
        .map((c) => (c.filterValue ? c.filterValue(r) : ''))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return parts.includes(f);
    });
  }, [columns, enableFilter, filter, rows]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [columns, filtered, sort]);

  const pagination = useMemo(() => {
    if (!enablePagination) {
      return { pageRows: sorted, totalPages: 1 };
    }
    const ps = Math.max(1, pageSize);
    const totalPages = Math.max(1, Math.ceil(sorted.length / ps));
    const safePage = Math.min(totalPages, Math.max(1, page));
    const start = (safePage - 1) * ps;
    return { pageRows: sorted.slice(start, start + ps), totalPages };
  }, [enablePagination, page, pageSize, sorted]);

  const pageRows = pagination.pageRows;

  const setSortKey = (key: string) => {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const hasRows = pageRows.length > 0;
  if (!hasRows) {
    return (
      <div className="grid gap-3">
        {enableFilter ? (
          <div className="flex items-center justify-between gap-3">
            <div className="w-full sm:max-w-sm">
              <TextInput value={filter} onChange={(v) => { setFilter(v); setPage(1); }} placeholder={filterPlaceholder} />
            </div>
            <div className="text-xs text-white/55">
              {t('common.items', { n: 0 })}
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-white/65">
          {empty ?? t('common.noData')}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {enableFilter || enablePagination ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {enableFilter ? (
            <div className="w-full sm:max-w-sm">
              <TextInput
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setPage(1);
                }}
                placeholder={filterPlaceholder}
              />
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-white/55">
              {t('common.items', { n: sorted.length })}
            </div>
            {enablePagination ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t('common.prev')}
                </Button>
                <div className="text-xs text-white/55">
                  {page} / {pagination.totalPages}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page >= pagination.totalPages}
                >
                  {t('common.next')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs text-white/70">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 font-medium">
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 hover:text-white"
                      onClick={() => setSortKey(c.key)}
                    >
                      <span>{c.header}</span>
                      <span className="text-[11px] text-white/45">
                        {sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {pageRows.map((row) => (
              <tr key={keyField(row)} className="hover:bg-white/[0.04]">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3 text-white/85">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-3 lg:hidden">
        {pageRows.map((row) => (
          <div
            key={keyField(row)}
            className={cn(
              'rounded-2xl border border-white/10 bg-white/5 p-4',
            )}
          >
            {mobileCard ? (
              mobileCard(row)
            ) : (
              <div className="grid gap-2">
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .slice(0, 4)
                  .map((c) => (
                    <div key={c.key} className="grid grid-cols-[120px_1fr] gap-3">
                      <div className="text-xs text-white/55">{c.header}</div>
                      <div className="text-sm text-white/85">{c.render(row)}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
