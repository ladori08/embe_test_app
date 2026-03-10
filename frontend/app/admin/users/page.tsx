'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { AdminManagedUser, Role } from '@/lib/types';
import { useI18n } from '@/components/language-context';
import { useAuth } from '@/components/auth-context';
import { toDisplayRole } from '@/lib/permissions';

const roleOptions: Role[] = ['SUPERADMIN', 'ADMIN', 'CUSTOMER'];

type UserFormState = {
  email: string;
  fullName: string;
  password: string;
  roles: Role[];
};

const emptyForm: UserFormState = {
  email: '',
  fullName: '',
  password: '',
  roles: ['CUSTOMER']
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminManagedUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);

  const { t } = useI18n();
  const { user: currentUser } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listUsersAdmin();
      setUsers(list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.users.failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [users]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  };

  const openEdit = (managedUser: AdminManagedUser) => {
    setEditing(managedUser);
    setForm({
      email: managedUser.email,
      fullName: managedUser.fullName,
      password: '',
      roles: managedUser.roles
    });
    setError('');
    setOpen(true);
  };

  const toggleRole = (role: Role) => {
    setForm(prev => {
      const hasRole = prev.roles.includes(role);
      if (hasRole) {
        return { ...prev, roles: prev.roles.filter(item => item !== role) };
      }
      return { ...prev, roles: [...prev.roles, role] };
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (form.roles.length === 0) {
      setError(t('admin.users.rolesRequired'));
      return;
    }

    try {
      if (editing) {
        await api.updateUserAdmin(editing.id, {
          fullName: form.fullName,
          password: form.password.trim() || undefined,
          roles: form.roles
        });
      } else {
        if (!form.password.trim()) {
          setError(t('admin.users.passwordRequired'));
          return;
        }
        await api.createUserAdmin({
          email: form.email,
          fullName: form.fullName,
          password: form.password,
          roles: form.roles
        });
      }

      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.users.failed'));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('admin.users.confirmDelete'))) {
      return;
    }
    try {
      await api.deleteUserAdmin(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.users.failed'));
    }
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.users')}>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-muted">{t('admin.users.help')}</p>
              <Button onClick={openCreate}>{t('admin.users.add')}</Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted">{t('admin.users.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : sortedUsers.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.users.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.users.fullName')}</TableHead>
                    <TableHead>{t('admin.users.email')}</TableHead>
                    <TableHead>{t('admin.users.roles')}</TableHead>
                    <TableHead>{t('admin.users.createdAt')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map(managedUser => {
                    const isCurrentUser = managedUser.id === currentUser?.id;
                    return (
                      <TableRow key={managedUser.id}>
                        <TableCell>{managedUser.fullName}</TableCell>
                        <TableCell>{managedUser.email}</TableCell>
                        <TableCell>{managedUser.roles.map(role => toDisplayRole(role)).join(', ')}</TableCell>
                        <TableCell>{new Date(managedUser.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <button className="mr-3 text-sm underline" onClick={() => openEdit(managedUser)}>
                            {t('common.edit')}
                          </button>
                          <button
                            className="text-sm text-red-600 underline disabled:text-muted"
                            onClick={() => remove(managedUser.id)}
                            disabled={isCurrentUser}
                            title={isCurrentUser ? t('admin.users.cannotDeleteSelf') : ''}
                          >
                            {t('common.delete')}
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? t('admin.users.edit') : t('admin.users.create')}</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={submit}>
                <FormField label={t('admin.users.fullName')}>
                  <Input value={form.fullName} onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))} required />
                </FormField>
                <FormField label={t('admin.users.email')}>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                    readOnly={Boolean(editing)}
                  />
                </FormField>
                <FormField label={t('admin.users.password')}>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                    required={!editing}
                    placeholder={editing ? t('admin.users.passwordOptional') : ''}
                  />
                </FormField>
                <FormField label={t('admin.users.roles')}>
                  <div className="flex gap-4">
                    {roleOptions.map(role => (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.roles.includes(role)}
                          onChange={() => toggleRole(role)}
                          disabled={Boolean(
                            editing &&
                              editing.id === currentUser?.id &&
                              form.roles.includes(role) &&
                              (role === 'ADMIN' || role === 'SUPERADMIN')
                          )}
                        />
                        <span>{toDisplayRole(role)}</span>
                      </label>
                    ))}
                  </div>
                </FormField>
                <Button className="w-full">{t('common.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
