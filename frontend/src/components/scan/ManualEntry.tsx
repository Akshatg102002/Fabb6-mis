import { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';

interface ManualEntryProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function ManualEntry({
  onSubmit,
  placeholder = 'Type barcode…',
  label = 'Manual Entry',
}: ManualEntryProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
      }}
    >
      {label && (
        <label
          htmlFor="manual-entry-input"
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </label>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <input
          ref={inputRef}
          id="manual-entry-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            height: '56px',
            padding: '0 1rem',
            fontSize: '1.25rem',
            fontFamily: "'IBM Plex Mono', monospace",
            backgroundColor: 'var(--surface-sunken)',
            border: '2px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            outline: 'none',
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--brand-primary)')
          }
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!value.trim()}
          style={{ flexShrink: 0, minWidth: '100px' }}
        >
          Submit
        </Button>
      </div>
    </form>
  );
}

export default ManualEntry;
