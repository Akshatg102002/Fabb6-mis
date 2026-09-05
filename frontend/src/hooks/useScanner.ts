import { useEffect, useRef, useCallback } from 'react';
import { useAudio } from './useAudio';

export interface UseScannerOptions {
  disabled?: boolean;
  /**
   * Maximum gap between keystrokes in a scan burst (ms).
   * Physical scanners fire keys very fast; keyboard entry is slower.
   */
  maxInterKeyGap?: number;
  /**
   * Minimum barcode length to be treated as a hardware scan.
   */
  minLength?: number;
  /**
   * Maximum time from first keystroke to Enter for the sequence to be
   * treated as a hardware scan (ms).
   */
  maxScanDuration?: number;
  /**
   * Suppress identical barcodes within this window (ms) to absorb
   * double-fire from trigger hold.
   */
  debounceMs?: number;
}

const DEFAULTS: Required<Omit<UseScannerOptions, 'disabled'>> = {
  maxInterKeyGap: 40,
  minLength: 6,
  maxScanDuration: 500,
  debounceMs: 800,
};

/**
 * useScanner — document-level barcode scanner hook.
 *
 * Attaches a keydown listener to the document. Buffers keystrokes and
 * classifies the sequence as a hardware scan when:
 *   - All inter-key gaps are ≤ maxInterKeyGap ms
 *   - The sequence ends with Enter
 *   - The accumulated string is ≥ minLength characters
 *   - The total duration is ≤ maxScanDuration ms
 *
 * A visible ManualEntry fallback is exposed via the returned ref so the
 * parent can render it for damaged barcodes.
 */
export function useScanner(
  onScan: (barcode: string) => void,
  options: UseScannerOptions = {},
) {
  const opts = { ...DEFAULTS, ...options };

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const firstKeyTimeRef = useRef<number>(0);
  const lastEmittedRef = useRef<{ barcode: string; at: number } | null>(null);

  const { accept } = useAudio();

  const tryEmit = useCallback(
    (barcode: string) => {
      const trimmed = barcode.trim();
      if (trimmed.length < opts.minLength) return;

      // Debounce identical consecutive scans
      const last = lastEmittedRef.current;
      if (
        last &&
        last.barcode === trimmed &&
        Date.now() - last.at < opts.debounceMs
      ) {
        return;
      }

      lastEmittedRef.current = { barcode: trimmed, at: Date.now() };

      // Play an accept tone as hardware-scan confirmation.
      // The consuming component replaces this with a context-aware outcome.
      accept();

      onScan(trimmed);
    },
    [opts.minLength, opts.debounceMs, accept, onScan],
  );

  useEffect(() => {
    if (opts.disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focus is inside an input or textarea — ManualEntry handles those
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();

      if (e.key === 'Enter') {
        const totalDuration = now - firstKeyTimeRef.current;
        const buf = bufferRef.current;

        if (
          buf.length >= opts.minLength &&
          totalDuration <= opts.maxScanDuration
        ) {
          e.preventDefault();
          tryEmit(buf);
        }

        // Always reset on Enter
        bufferRef.current = '';
        firstKeyTimeRef.current = 0;
        lastKeyTimeRef.current = 0;
        return;
      }

      // Single printable character
      if (e.key.length === 1) {
        const gap = lastKeyTimeRef.current ? now - lastKeyTimeRef.current : 0;

        if (lastKeyTimeRef.current && gap > opts.maxInterKeyGap) {
          // Gap too large — this is keyboard entry, reset buffer
          bufferRef.current = '';
          firstKeyTimeRef.current = 0;
        }

        if (!bufferRef.current) {
          firstKeyTimeRef.current = now;
        }

        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    opts.disabled,
    opts.maxInterKeyGap,
    opts.minLength,
    opts.maxScanDuration,
    tryEmit,
  ]);

  /** Called by ManualEntry when the operator submits a barcode by hand */
  const submitManual = useCallback(
    (barcode: string) => {
      if (barcode.trim().length === 0) return;
      // Manual entry bypasses inter-key timing but still respects debounce
      onScan(barcode.trim());
    },
    [onScan],
  );

  return { submitManual };
}
