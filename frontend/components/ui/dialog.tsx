'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
      <div
        className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4"
        onClick={event => {
          if (event.target === event.currentTarget) {
            onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ className, onClick, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-white p-5 shadow-card', className)}
      onClick={event => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    />
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />;
}
