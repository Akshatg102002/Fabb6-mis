import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          'primary-dark': 'var(--brand-primary-dark)',
          accent: 'var(--brand-accent)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          sunken: 'var(--surface-sunken)',
          raised: 'var(--surface-raised)',
        },
        border: 'var(--border)',
        text: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
        },
        scan: {
          ok: 'var(--scan-ok)',
          warn: 'var(--scan-warn)',
          error: 'var(--scan-error)',
        },
      },
      fontSize: {
        'floor-sm': ['1.25rem', { lineHeight: '1.5' }],
        'floor-base': ['1.5rem', { lineHeight: '1.6' }],
        'floor-lg': ['2rem', { lineHeight: '1.4' }],
        'floor-xl': ['2.5rem', { lineHeight: '1.3' }],
      },
      minHeight: {
        touch: '56px',
      },
      minWidth: {
        touch: '56px',
      },
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          'Inter',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
