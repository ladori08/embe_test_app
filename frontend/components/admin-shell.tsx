'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/language-context';

export function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const links = [
    { href: '/admin/dashboard', label: t('admin.nav.dashboard') },
    { href: '/admin/ingredients', label: t('admin.nav.ingredients') },
    { href: '/admin/products', label: t('admin.nav.products') },
    { href: '/admin/recipes', label: t('admin.nav.recipes') },
    { href: '/admin/production', label: t('admin.nav.production') },
    { href: '/admin/orders', label: t('admin.nav.orders') }
  ];

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-2xl border border-border bg-white p-3 shadow-card">
        <h2 className="px-2 pb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('admin.panel')}</h2>
        <div className="space-y-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm',
                pathname === link.href ? 'bg-accent text-white' : 'text-muted hover:bg-[#f5ede3] hover:text-ink'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </aside>
      <main>
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3 shadow-card">
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
