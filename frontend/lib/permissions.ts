import { Role, User } from '@/lib/types';

export function expandRoles(rawRoles: Role[] | undefined): Set<Role> {
  const roles = new Set<Role>(rawRoles ?? []);

  if (roles.has('CLIENT')) {
    roles.add('CUSTOMER');
  }

  if (roles.has('SUPERADMIN')) {
    roles.add('ADMIN');
    roles.add('CUSTOMER');
  }

  return roles;
}

export function hasRole(user: Pick<User, 'roles'> | null | undefined, role: Role): boolean {
  if (!user) {
    return false;
  }
  return expandRoles(user.roles).has(role);
}

export function isSuperAdmin(user: Pick<User, 'roles'> | null | undefined): boolean {
  return hasRole(user, 'SUPERADMIN');
}

export function toDisplayRole(role: Role): string {
  if (role === 'CLIENT') {
    return 'CUSTOMER';
  }
  return role;
}
