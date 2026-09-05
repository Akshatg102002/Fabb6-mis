import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/client';

// ── Types ───────────────────────────────────────────────────────────────────

interface ImportRow {
  sku_code: string;
  sku_name: string;
  batch_number: string | undefined;
  expiry_date: string | undefined;
  location_code: string;
  quantity: number;
  cost_per_unit: number | undefined;
  brand_name: string | undefined;
  hsn_code: string | undefined;
}

interface ParsedRow {
  rowNum: number;
  raw: Record<string, string>;
  valid: boolean;
  errors: string[];
  data: ImportRow | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { message: string }[];
}

interface SiteOption {
  id: string;
  name: string;
}

// ── CSV utilities ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'sku_code',
  'sku_name',
  'batch_number',
  'expiry_date',
  'location_code',
  'quantity',
  'cost_per_unit',
  'brand_name',
  'hsn_code',
] as const;

const CSV_TEMPLATE = [
  CSV_HEADERS.join(','),
  "SKU001,Loreal Colour 5.0 60g,B2024-001,2026-12-31,A01-01-01,50,450.00,L'Oreal Professionnel,33059090",
  'SKU002,Schwarzkopf Developer 1000ml,B2024-002,2027-06-30,A01-01-02,20,320.00,Schwarzkopf,33059090',
].join('\r\n');

/** RFC 4180-compliant single-line CSV field parser */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse CSV text → array of header-keyed records (skips header row + empty lines) */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const headerLine = lines[0];
  if (!headerLine) return [];

  const headers = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = parseCSVLine(line);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] ?? `col${j}`;
      record[key] = values[j] ?? '';
    }
    result.push(record);
  }
  return result;
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateRawRow(rowNum: number, raw: Record<string, string>): ParsedRow {
  const errors: string[] = [];

  if (!raw['sku_code']?.trim()) errors.push('SKU Code required');
  if (!raw['sku_name']?.trim()) errors.push('SKU Name required');
  if (!raw['location_code']?.trim()) errors.push('Location Code required');

  const qtyStr = raw['quantity']?.trim() ?? '';
  const qty = Number(qtyStr);
  if (!qtyStr || !Number.isInteger(qty) || qty <= 0) {
    errors.push('Quantity must be a positive integer');
  }

  const expiryStr = raw['expiry_date']?.trim() ?? '';
  if (expiryStr && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryStr) || Number.isNaN(Date.parse(expiryStr)))) {
    errors.push('Expiry must be YYYY-MM-DD');
  }

  if (errors.length > 0) {
    return { rowNum, raw, valid: false, errors, data: null };
  }

  const data: ImportRow = {
    sku_code: (raw['sku_code'] ?? '').trim(),
    sku_name: (raw['sku_name'] ?? '').trim(),
    batch_number: raw['batch_number']?.trim() || undefined,
    expiry_date: expiryStr || undefined,
    location_code: (raw['location_code'] ?? '').trim(),
    quantity: qty,
    cost_per_unit: raw['cost_per_unit']?.trim() ? Number(raw['cost_per_unit']) : undefined,
    brand_name: raw['brand_name']?.trim() || undefined,
    hsn_code: raw['hsn_code']?.trim() || undefined,
  };

  return { rowNum, raw, valid: true, errors: [], data };
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StockImport() {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load available sites
  useEffect(() => {
    apiClient<{ data: { id: string; name: string }[] }>('/locations/sites')
      .then((resp) => setSites(resp.data))
      .catch(() => {
        // If API unavailable, fall back to manual entry — no-op
      });
  }, []);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setImportError('Please select a .csv file');
      return;
    }
    setFileName(file.name);
    setResult(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;
      const records = parseCSV(text);
      const rows = records.map((rec, i) => validateRawRow(i + 1, rec));
      setParsedRows(rows);
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleTemplateDownload = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'opening-stock-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const allValid = parsedRows.length > 0 && parsedRows.every((r) => r.valid);
  const validCount = parsedRows.filter((r) => r.valid).length;

  const handleImport = async () => {
    if (!allValid || !siteId.trim()) return;
    setImporting(true);
    setImportError(null);
    setResult(null);

    const rows = parsedRows.map((r) => r.data).filter((d): d is ImportRow => d !== null);
    setImportProgress({ done: 0, total: rows.length });

    try {
      const response = await apiClient<ImportResult>('/stock/import', {
        method: 'POST',
        body: { site_id: siteId.trim(), rows },
      });
      setResult(response);
      setParsedRows([]);
      setFileName(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setImportError(msg);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.25rem',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '0.5rem',
  };

  return (
    <div style={{ maxWidth: '860px' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          Import Opening Stock
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Upload a CSV to bulk-load your initial stock levels into the warehouse.
        </p>
      </div>

      {/* ── Step 1: Template download ── */}
      <div style={cardStyle}>
        <span style={labelStyle}>Step 1 — Download Template</span>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Fill in the CSV template with your stock data.
        </p>
        <Button variant="secondary" size="sm" onClick={handleTemplateDownload}>
          ↓ Download template.csv
        </Button>
      </div>

      {/* ── Step 2: Site selector ── */}
      <div style={cardStyle}>
        <label style={labelStyle} htmlFor="site-select">
          Step 2 — Select Site
        </label>
        {sites.length > 0 ? (
          <select
            id="site-select"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{
              height: '36px',
              padding: '0 0.75rem',
              fontSize: '0.875rem',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              minWidth: '240px',
            }}
          >
            <option value="">— choose site —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="site-select"
            type="text"
            placeholder="Paste Site UUID…"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{
              height: '36px',
              padding: '0 0.75rem',
              fontSize: '0.875rem',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: "'IBM Plex Mono', monospace",
              minWidth: '320px',
            }}
          />
        )}
      </div>

      {/* ── Step 3: Upload ── */}
      <div style={cardStyle}>
        <span style={labelStyle}>Step 3 — Upload CSV</span>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop CSV here or click to browse"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            border: `2px dashed ${isDragging ? 'var(--brand-primary)' : 'var(--border)'}`,
            borderRadius: '8px',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragging ? 'rgba(var(--brand-primary-rgb, 0 80 184), 0.04)' : 'var(--surface-sunken)',
            transition: 'border-color 120ms ease, background-color 120ms ease',
          }}
        >
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
            {fileName
              ? `📄 ${fileName}`
              : 'Drop CSV here or click to browse'}
          </p>
          {!fileName && (
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
              .csv files only
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* ── Preview table ── */}
      {parsedRows.length > 0 && (
        <div style={cardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span style={labelStyle as React.CSSProperties}>
              Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''}{' '}
              {parsedRows.length > 10 ? '(showing first 10)' : ''}
            </span>
            <span
              style={{
                fontSize: '0.8125rem',
                color: allValid ? 'var(--scan-ok, #0e8a4f)' : 'var(--scan-error)',
                fontWeight: 600,
              }}
            >
              {allValid
                ? `✓ ${validCount} valid`
                : `${parsedRows.filter((r) => !r.valid).length} row(s) have errors`}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--surface-sunken)',
                    borderBottom: '2px solid var(--border)',
                  }}
                >
                  {['#', 'SKU Code', 'SKU Name', 'Batch', 'Expiry', 'Location', 'Qty', 'Cost', 'Valid'].map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: col === 'Qty' || col === 'Cost' || col === '#' ? 'right' : 'left',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          fontSize: '0.75rem',
                        }}
                      >
                        {col}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 10).map((row) => (
                  <>
                    <tr
                      key={row.rowNum}
                      style={{
                        borderBottom: row.valid ? '1px solid var(--border)' : undefined,
                        backgroundColor: row.valid ? undefined : 'var(--scan-error-bg, #fef2f2)',
                      }}
                    >
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          textAlign: 'right',
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.rowNum}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {row.raw['sku_code'] ?? ''}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.raw['sku_name'] ?? ''}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          color: 'var(--text-muted)',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {row.raw['batch_number'] || '—'}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {row.raw['expiry_date'] || '—'}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {row.raw['location_code'] ?? ''}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.raw['quantity'] ?? ''}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.75rem',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {row.raw['cost_per_unit'] || '—'}
                      </td>
                      <td style={{ padding: '0.4rem 0.75rem', textAlign: 'center' }}>
                        {row.valid ? (
                          <span style={{ color: 'var(--scan-ok, #0e8a4f)', fontSize: '1rem' }}>✓</span>
                        ) : (
                          <span style={{ color: 'var(--scan-error)', fontSize: '1rem' }}>✗</span>
                        )}
                      </td>
                    </tr>
                    {!row.valid && (
                      <tr
                        key={`${row.rowNum}-errors`}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td />
                        <td
                          colSpan={8}
                          style={{
                            padding: '0.25rem 0.75rem 0.5rem',
                            color: 'var(--scan-error)',
                            fontSize: '0.75rem',
                          }}
                        >
                          {row.errors.join(' · ')}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Result banner ── */}
      {result && (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            color: '#065f46',
            fontSize: '0.9rem',
          }}
        >
          <strong>Import complete:</strong> {result.imported} rows imported
          {result.skipped > 0 && `, ${result.skipped} skipped (already imported)`}
          {result.errors.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ color: '#b45309' }}>
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Error banner ── */}
      {importError && (
        <div
          style={{
            backgroundColor: 'var(--scan-error-bg, #fef2f2)',
            border: '1px solid var(--scan-error)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            color: 'var(--scan-error)',
            fontSize: '0.9rem',
          }}
        >
          {importError}
        </div>
      )}

      {/* ── Submit ── */}
      {parsedRows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Button
            variant="primary"
            size="md"
            disabled={!allValid || !siteId.trim() || importing}
            loading={importing}
            onClick={() => void handleImport()}
          >
            {importing && importProgress
              ? `Importing… ${importProgress.done} of ${importProgress.total}`
              : `Import ${validCount} row${validCount !== 1 ? 's' : ''}`}
          </Button>
          {!siteId.trim() && (
            <span style={{ fontSize: '0.85rem', color: 'var(--scan-warn, #c77700)' }}>
              Select a site before importing
            </span>
          )}
          {!allValid && siteId.trim() && (
            <span style={{ fontSize: '0.85rem', color: 'var(--scan-error)' }}>
              Fix validation errors before importing
            </span>
          )}
        </div>
      )}
    </div>
  );
}
