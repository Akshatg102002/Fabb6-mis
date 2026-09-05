import { useRef, useCallback } from 'react';

type ToneType = 'accept' | 'reject' | 'warning';

interface ToneConfig {
  frequency: number;
  duration: number; // ms
  type: OscillatorType;
  gainStart: number;
  gainEnd: number;
}

const TONES: Record<ToneType, ToneConfig> = {
  accept: {
    frequency: 1200,
    duration: 120,
    type: 'sine',
    gainStart: 0.4,
    gainEnd: 0.0,
  },
  reject: {
    frequency: 220,
    duration: 300,
    type: 'sawtooth',
    gainStart: 0.35,
    gainEnd: 0.0,
  },
  warning: {
    frequency: 660,
    duration: 200,
    type: 'triangle',
    gainStart: 0.3,
    gainEnd: 0.0,
  },
};

export function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback((): AudioContext | null => {
    if (typeof AudioContext === 'undefined' && typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === 'undefined') {
      return null;
    }
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      const Ctor =
        AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (tone: ToneType) => {
      const ctx = getContext();
      if (!ctx) return;

      // Resume if suspended (autoplay policy)
      const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
      resume.then(() => {
        const cfg = TONES[tone];
        const now = ctx.currentTime;
        const durationSec = cfg.duration / 1000;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = cfg.type;
        oscillator.frequency.setValueAtTime(cfg.frequency, now);

        gainNode.gain.setValueAtTime(cfg.gainStart, now);
        gainNode.gain.exponentialRampToValueAtTime(
          Math.max(cfg.gainEnd, 0.001),
          now + durationSec,
        );

        oscillator.start(now);
        oscillator.stop(now + durationSec);
      }).catch(() => {
        // Silently ignore audio errors — visual feedback remains
      });
    },
    [getContext],
  );

  const accept = useCallback(() => play('accept'), [play]);
  const reject = useCallback(() => play('reject'), [play]);
  const warning = useCallback(() => play('warning'), [play]);

  return { accept, reject, warning, play };
}
