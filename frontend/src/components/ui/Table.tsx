import { type ReactNode } from 'react';

// Dense desk-mode table — appropriate for management screens with mouse navigation.

interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  stickyHeader?: boolean;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  loading = false,
  emptyMessage = 'No data',
  className = '',
  stickyHeader = false,
}: TableProps<T>) {
  const alignClass = (align?: 'left' | 'right' | 'center') => {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
  };

  return (
    <div className={`overflow-x-auto rounded-lg border border-[var(--border)] ${className}`}>
      <table className="min-w-full divide-y divide-[var(--border)] text-sm">
        <thead
          className={`bg-[var(--surface-sunken)] ${stickyHeader ? 'sticky top-0 z-10' : ''}`}
        >
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 py-2 font-semibold text-[var(--text-muted)] whitespace-nowrap ${alignClass(col.align)} ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-[var(--text-muted)]"
              >
                <span className="inline-block h-5 w-5 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-[var(--text-muted)]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-[var(--surface-sunken)] transition-colors' : ''}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 whitespace-nowrap tabular ${alignClass(col.align)} ${col.className ?? ''}`}
                  >
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
