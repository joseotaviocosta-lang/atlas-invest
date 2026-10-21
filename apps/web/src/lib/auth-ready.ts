import type { AuthStatus } from '@/stores/auth.store';

export function isAuthReady(status: AuthStatus, isInitialized: boolean): boolean {
  return isInitialized && status === 'authenticated';
}
