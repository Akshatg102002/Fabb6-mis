import { useEffect } from 'react';
import { useAudio } from '@/hooks/useAudio';

export type ScanOutcome = 'ok' | 'warn' | 'error' | null;

interface ScanFeedbackProps {
  outcome: ScanOutcome;
  /** Play the corresponding audio tone whenever outcome changes to non-null */
  playAudio?: boolean;
}

const outcomeStyles: Record<Exclude<ScanOutcome, null>, string> = {
  ok: 'bg-[var(--scan-ok-bg)] border-[var(--scan-ok)]',
  warn: 'bg-[var(--scan-warn-bg)] border-[var(--scan-warn)]',
  error: 'bg-[var(--scan-error-bg)] border-[var(--scan-error)]',
};

const outcomeIcons: Record<Exclude<ScanOutcome, null>, string> = {
  ok: '✓',
  warn: '!',
  error: '✗',
};

const outcomeIconColor: Record<Exclude<ScanOutcome, null>, string> = {
  ok: 'text-[var(--scan-ok)]',
  warn: 'text-[var(--scan-warn)]',
  error: 'text-[var(--scan-error)]',
};

/**
 * ScanFeedback renders a colored indicator bar.
 * Place this at the top or bottom of a floor screen so the outcome
 * is visible from a distance — color + icon, no reliance on text alone.
 */
export function ScanFeedback({ outcome, playAudio = true }: ScanFeedbackProps) {
  const { accept, reject, warning } = useAudio();

  useEffect(() => {
    if (!playAudio || outcome === null) return;
    if (outcome === 'ok') accept();
    else if (outcome === 'error') reject();
    else warning();
  }, [outcome, playAudio, accept, reject, warning]);

  if (outcome === null) {
    return (
      <div className="h-3 w-full bg-[var(--border)] rounded-full" aria-hidden="true" />
    );
  }

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`flex items-center justify-center gap-3 rounded-xl border-2 py-3 transition-colors ${outcomeStyles[outcome]}`}
    >
      <span
        className={`text-4xl font-bold leading-none select-none ${outcomeIconColor[outcome]}`}
        aria-hidden="true"
      >
        {outcomeIcons[outcome]}
      </span>
    </div>
  );
}
