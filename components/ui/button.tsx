import { type ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success' | 'info';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading,
      disabled,
      fullWidth,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyle: React.CSSProperties = {
      fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', system-ui, sans-serif",
      fontWeight: '600',
      letterSpacing: '0.02em',
      transition: 'all 200ms ease',
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? '0.5' : '1',
      border: '0',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: fullWidth ? '100%' : 'auto',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '8px',
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        background: 'linear-gradient(to bottom, #1a1a1a, #3b3b3b)',
        color: '#FFFFFF',
        border: 'none',
      },
      secondary: {
        background: '#FFFFFF',
        color: '#3a3a3a',
        border: '1px solid #e5e7eb',
      },
      outline: {
        background: 'transparent',
        color: '#3a3a3a',
        border: '1px solid #e5e7eb',
      },
      ghost: {
        background: 'transparent',
        color: '#3a3a3a',
        border: 'none',
      },
      danger: {
        background: '#dc2626',
        color: '#FFFFFF',
        border: 'none',
      },
      success: {
        background: 'linear-gradient(to bottom, #16a34a, #15803d)',
        color: '#FFFFFF',
        border: 'none',
      },
      info: {
        background: 'linear-gradient(to bottom, #1a1a1a, #3b3b3b)',
        color: '#FFFFFF',
        border: 'none',
      },
    };

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: {
        padding: '6px 14px',
        fontSize: '11px',
      },
      md: {
        padding: '8px 20px',
        fontSize: '12px',
      },
      lg: {
        padding: '10px 28px',
        fontSize: '13px',
      },
      xl: {
        padding: '12px 36px',
        fontSize: '14px',
      },
    };

    const combinedStyle = {
      ...baseStyle,
      ...variantStyles[variant],
      ...sizeStyles[size],
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || isLoading) return;
      const button = e.currentTarget;
      if (variant === 'primary' || variant === 'info') {
        button.style.background = 'linear-gradient(to bottom, #2a2a2a, #4b4b4b)';
      } else if (variant === 'outline' || variant === 'secondary') {
        button.style.background = '#f7f7f7';
      } else if (variant === 'danger') {
        button.style.background = '#b91c1c';
      }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || isLoading) return;
      const button = e.currentTarget;
      if (variant === 'primary' || variant === 'info') {
        button.style.background = 'linear-gradient(to bottom, #1a1a1a, #3b3b3b)';
      } else if (variant === 'outline' || variant === 'secondary') {
        button.style.background = variant === 'outline' ? 'transparent' : '#FFFFFF';
      } else if (variant === 'danger') {
        button.style.background = '#dc2626';
      }
    };

    return (
      <button
        ref={ref}
        className={className}
        style={combinedStyle}
        disabled={disabled || isLoading}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {isLoading && (
          <svg
            className="mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            style={{
              animation: 'spin 1s linear infinite',
              marginRight: '8px',
            }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              style={{ opacity: '0.25' }}
            />
            <path
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              style={{ opacity: '0.75' }}
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
