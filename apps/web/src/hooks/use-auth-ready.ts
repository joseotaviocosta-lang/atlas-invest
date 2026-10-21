import { useAuthStore } from '@/stores/auth.store';
import { isAuthReady } from '@/lib/auth-ready';

export { isAuthReady } from '@/lib/auth-ready';

export function useAuthReady(): boolean {
  const status = useAuthStore((state) => state.status);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  return isAuthReady(status, isInitialized);
}
