'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const DialogContext = React.createContext<((open: boolean) => void) | null>(null);

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <DialogContext.Provider value={onOpenChange}>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4" onClick={() => onOpenChange(false)}>
        <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  hideCloseButton?: boolean;
}

export function DialogContent({ className, hideCloseButton = false, children, ...props }: DialogContentProps) {
  const onOpenChange = React.useContext(DialogContext);
  const { onClick, ...restProps } = props;

  return (
    <div
      className={cn('relative mx-auto w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-white p-5 shadow-card', className)}
      onClick={e => {
        e.stopPropagation();
        onClick?.(e);
      }}
      {...restProps}
    >
      {!hideCloseButton && onOpenChange ? (
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute right-3 top-3 rounded-md px-2 py-1 text-lg leading-none text-muted transition hover:bg-[#f5ede3] hover:text-ink"
          onClick={() => onOpenChange(false)}
        >
          ×
        </button>
      ) : null}
      {children}
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />;
}
