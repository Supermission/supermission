import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'primary' | 'outline';
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-gray-100 text-gray-700 border border-[#E6E6E6]',
      success: 'bg-[#42C366]/10 text-[#42C366] border border-[#42C366]/20',
      error: 'bg-[#EB3424]/10 text-[#EB3424] border border-[#EB3424]/20',
      warning: 'bg-[#ECB730]/10 text-[#ECB730] border border-[#ECB730]/20',
      info: 'bg-[#2A6DFB]/10 text-[#2A6DFB] border border-[#2A6DFB]/20',
      primary: 'bg-[#9061FF]/10 text-[#9061FF] border border-[#9061FF]/20',
      outline: 'bg-transparent text-gray-700 border border-[#E6E6E6]',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 text-[10px] font-semibold bricolage-grotesque',
          variants[variant],
          className
        )}
        style={{ borderRadius: '6px' }}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
