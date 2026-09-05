import { useState, useDeferredValue, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { Button } from '@/components/ui/Button';
import { useStockOnHand, type StockOnHandItem, type StockOnHandFilters } from '@/api/queries/stock';

type ExpiryBucket = 'expired' | 'lt30' | 'lt60' | 'gt60';

function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Format date as dd-Mon-yy, e.g. 31-Dec-26 */
function formatDateShort(expiryDate: string): string {
  return new Date(expiryDate).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function ExpiryCell({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

  const days = daysUntilExpiry(expiryDate);

  if (days === null) return <span>{formatDateShort(expiryDate)}</span>;

  if (days <= 0) {
    return (
      <span style={{ color: 'var(--scan-error)', fontVariantNumeric: 'tabular-nums' }}>
        Expired
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span style={{ color: 'var(--scan-error)', fontVariantNumeric: 'tabular-nums' }}>
        {days}d
      </span>
    );
  }
  if (days <= 90) {
    return (
      <span style={{ color: 'var(--scan-warn)', fontVariantNumeric: 'tabular-nums' }}>
        {days}d
      </span>
    );
  }
  return (
    <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
      {formatDateShort(expiryDate)}
    </span>
  );
}

function formatValue(v: number | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);
}

/** Simple SVG of an empty 3-shelf warehouse unit */
function EmptyShelfSVG() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left vertical post */}
      <rect x="6" y="8" width="8" height="98" rx="3" stroke="#9ca3af" strokeWidth="2" />
      {/* Right vertical post */}
      <rect x="106" y="8" width="8" height="98" rx="3" stroke="#9ca3af" strokeWidth="2" />
      {/* Top shelf */}
      <rect x="6" y="22" width="108" height="7" rx="2" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
      {/* Middle shelf */}
      <rect x="6" y="58" width="108" height="7" rx="2" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
      {/* Bottom shelf */}
      <rect x="6" y="94" width="108" height="7" rx="2" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
      {/* Left foot */}
      <rect x="2" y="104" width="16" height="5" rx="2" stroke="#9ca3af" strokeWidth="1.5" />
      {/* Right foot */}
      <rect x="102" y="104" width="16" height="5" rx="2" stroke="#9ca3af" strokeWidth="1.5" />
    </svg>
  );
}

export default function StockOnHand() {
  useEffect(() => {
    document.title = 'Fabb6 WMS — Stock on Hand';
  }, []);

  const navigate = useNavigate();
  const [skuSearch, setSkuSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [expiryBucket, setExpiryBucket] = useState<ExpiryBucket | ''>('');
  const [page, setPage] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const deferredSku = useDeferredValue(skuSearch);
  const deferredLocation = useDeferredValue(locationFilter);

  const filters: StockOnHandFilters = {
    skuSearch: deferredSku || undefined,
    locationId: deferredLocation || undefined,
    expiryBucket: (expiryBucket as ExpiryBucket) || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, error, isFetching } = useStockOnHand(filters);

  function resetFilters() {
    setSkuSearch('');
    setLocationFilter('');
    setExpiryBucket('');
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const hasActiveFilters = !!(skuSearch || locationFilter || expiryBucket);
  const isGenuinelyEmpty = !isLoading && !error && data?.total === 0 && !hasActiveFilters;

  const inputStyle: React.CSSProperties = {
    height: '36px',
    padding: '0 0.75rem',
    fontSize: '0.875rem',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    minWidth: '180px',
  };

  return (
    <DeskLayout
      heading="Stock on Hand"
      toolbar={
        <>
          <input
            type="search"
            placeholder="Search SKU / name…"
            value={skuSearch}
            onChange={(e) => { setSkuSearch(e.target.value); setPage(1); }}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Location code…"
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
            style={{ ...inputStyle, minWidth: '140px' }}
          />
          <select
            value={expiryBucket}
            onChange={(e) => { setExpiryBucket(e.target.value as ExpiryBucket | ''); setPage(1); }}
            style={{ ...inputStyle, minWidth: '140px' }}
          >
            <option value="">All expiry</option>
            <option value="expired">Expired</option>
            <option value="lt30">&lt; 30 days</option>
            <option value="lt60">30–60 days</option>
            <option value="gt60">&gt; 60 days</option>
          </select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </>
      }
    >
      {/* Summary bar */}
      {data && data.total > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {data.total.toLocaleString('en-IN')}
            </strong>{' '}
            records
          </span>
          {isFetching && <span>Refreshing…</span>}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          style={{
            color: 'var(--scan-error)',
            padding: '1rem',
            backgroundColor: 'var(--scan-error-bg)',
            borderRadius: '8px',
            marginBottom: '1rem',
          }}
        >
          Failed to load stock data
        </div>
      )}

      {/* Empty state */}
      {isGenuinelyEmpty && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            gap: '1rem',
            textAlign: 'center',
          }}
        >
          <EmptyShelfSVG />
          <p
            style={{
              color: 'var(--text)',
              fontSize: '24px',
              fontWeight: 600,
              margin: 0,
            }}
          >
            No stock on hand yet
          </p>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '15px',
              margin: 0,
            }}
          >
            Start by receiving a GRN or importing your opening stock.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="primary" size="md" onClick={() => navigate('/inward')}>
              Receive GRN
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/settings')}>
              Import Stock
            </Button>
          </div>
        </div>
      )}

      {/* Table (only shown when there is data or filters active) */}
      {!isGenuinelyEmpty && (
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
              backgroundColor: 'var(--surface)',
            }}
          >
            <thead>
              <tr
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  backgroundColor: 'var(--surface-sunken)',
                  borderBottom: '2px solid var(--border)',
                }}
              >
                {[
                  'SKU Code', 'Name', 'Batch', 'Location', 'Qty', 'UOM', 'Expiry', 'Value (INR)',
                ].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '0.625rem 0.875rem',
                      textAlign: col === 'Qty' || col === 'Value (INR)' ? 'right' : 'left',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      fontSize: '0.8125rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      backgroundColor: 'var(--surface-sunken)',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={{ padding: '0.625rem 0.875rem' }}>
                        <div
                          style={{
                            height: '14px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--border)',
                            width: `${60 + (j * 7) % 40}%`,
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    No stock found for the current filters
                  </td>
                </tr>
              )}

              {data?.items.map((item: StockOnHandItem) => {
                const days = daysUntilExpiry(item.expiryDate);
                const isHovered = hoveredId === item.id;

                const rowHighlight =
                  days !== null && days <= 0
                    ? 'var(--scan-error-bg)'
                    : days !== null && days <= 30
                    ? '#fff8f0'
                    : undefined;

                return (
                  <tr
                    key={item.id}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      backgroundColor: isHovered ? 'var(--surface-sunken)' : rowHighlight,
                    }}
                  >
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '0.8125rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.skuCode}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        maxWidth: '240px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.skuName}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '0.8125rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {item.batch ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '0.8125rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.locationCode}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {item.qty.toLocaleString('en-IN')}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {item.uom}
                    </td>
                    <td style={{ padding: '0.5rem 0.875rem', whiteSpace: 'nowrap' }}>
                      <ExpiryCell expiryDate={item.expiryDate} />
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.875rem',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {formatValue(item.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1rem',
            gap: '0.75rem',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Page {page} of {totalPages} &middot; {data.total.toLocaleString('en-IN')} records
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </DeskLayout>
  );
}
