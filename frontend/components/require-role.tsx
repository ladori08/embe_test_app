'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@/lib/types';
import { useAuth } from '@/components/auth-context';

export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (!user.roles.includes(role)) {
        router.replace('/shop');
      }
    }
  }, [loading, user, role, router]);

  if (loading || !user || !user.roles.includes(role)) {
    return <div className="p-6 text-sm text-muted">Checking permission...</div>;
  }

  return <>{children}</>;
}
