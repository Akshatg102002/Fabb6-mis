import { type ButtonHTMLAttributes, forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'floor';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--brand-primary)',
    color: '#ffffff',
    border: '2px solid var(--brand-primary)',
  },
  secondary: {
    backgroundColor: 'transparent',
    color: 'var(--brand-primary)',
    border: '2px solid var(--brand-primary)',
  },
  danger: {
    backgroundColor: 'var(--scan-error)',
    color: '#ffffff',
    border: '2px solid var(--scan-error)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--text)',
    border: '2px solid var(--border)',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height: '36px',
    padding: '0 0.875rem',
    fontSize: '0.875rem',
    borderRadius: '6px',
  },
  md: {
    height: '44px',
    padding: '0 1.25rem',
    fontSize: '1rem',
    borderRadius: '8px',
  },
  lg: {
    height: '56px',
    padding: '0 1.5rem',
    fontSize: '1.0625rem',
    borderRadius: '10px',
  },
  floor: {
    height: '64px',
    padding: '0 1.5rem',
    fontSize: '1.25rem',
    fontWeight: 700,
    borderRadius: '12px',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      children,
      style,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontFamily: 'inherit',
          fontWeight: 600,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.55 : 1,
          width: fullWidth ? '100%' : undefined,
          transition: 'opacity 80ms ease, background-color 80ms ease',
          ...variantStyles[variant],
          ...sizeStyles[size],
          ...style,
        }}
        {...rest}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="9"
        cy="9"
        r="7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="28 16"
        strokeLinecap="round"
      />
    </svg>
  );
}
