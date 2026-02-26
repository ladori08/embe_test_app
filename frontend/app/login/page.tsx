'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/components/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/shop');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-md px-4 py-10">
        <Card className="reveal">
          <CardTitle className="font-script text-4xl">Welcome Back</CardTitle>
          <CardDescription>Use seeded accounts or your own credentials.</CardDescription>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <FormField label="Email">
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
              </FormField>
              <FormField label="Password">
                <Input value={password} onChange={e => setPassword(e.target.value)} type="password" />
              </FormField>
              {error && <FormMessage>{error}</FormMessage>}
              <Button className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
              {user && <p className="text-sm text-muted">You are signed in as {user.email}</p>}
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
