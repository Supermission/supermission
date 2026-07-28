import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  showGlass?: boolean;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, showGlass = true, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-12 w-full px-6 py-3 text-base text-foreground transition-all duration-200',
          showGlass ? 'glass-card' : 'bg-white border border-border',
          'placeholder:text-muted-foreground placeholder:opacity-40',
          'focus:outline-none focus:ring-2 focus:ring-[#9061FF] focus:ring-opacity-30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        style={{ borderRadius: '8px' }}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
