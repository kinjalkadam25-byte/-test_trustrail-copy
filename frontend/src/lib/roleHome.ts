import type { Role } from '../types';

export function homeForRole(role: Role): string {
  switch (role) {
    case 'donor':
      return '/donor/donate';
    case 'ngo_admin':
      return '/ngo/dashboard';
    case 'vendor':
      return '/vendor/tasks';
    case 'platform_admin':
      return '/admin/flags';
    default:
      return '/';
  }
}
