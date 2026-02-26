import * as React from 'react';
import { cn } from '@/lib/utils';

export function FormField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-2', className)}>
      <span className="text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export function FormMessage({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-red-600', className)} {...props} />;
}
