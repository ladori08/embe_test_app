import * as React from 'react';
import { cn } from '@/lib/utils';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn('h-10 w-full rounded-xl border border-border bg-cream px-3 text-sm outline-none focus:border-accent', className)}
      {...props}
    >
      {children}
    </select>
  );
}
