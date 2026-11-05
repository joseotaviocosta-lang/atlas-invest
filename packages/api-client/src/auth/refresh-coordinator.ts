import type { SessionRefresher, AuthFailureHandler } from '../types';
import { ApiError } from '../errors';

/**
 * Single-flight refresh coordinator:
 * Serializes concurrent 401 refresh calls into a single invocation.
 * All awaiting callers receive the same fresh token or error.
 */
export class RefreshCoordinator {
  private activeRefreshPromise: Promise<string> | null = null;

  constructor(
    private readonly refreshSession?: SessionRefresher,
    private readonly onAuthenticationFailure?: AuthFailureHandler,
  ) {}

  getActiveRefreshPromise(): Promise<string> | null {
    return this.activeRefreshPromise;
  }

  async performRefresh(): Promise<string> {
    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    const refresher = this.refreshSession;
    if (!refresher) {
      const err = new ApiError('Session refresh not configured', 401, 'AUTH.NO_REFRESHER');
      if (this.onAuthenticationFailure) {
        await Promise.resolve(this.onAuthenticationFailure(err));
      }
      throw err;
    }

    this.activeRefreshPromise = (async () => {
      try {
        const newToken = await refresher();
        if (!newToken) {
          const err = new ApiError('No access token received from refresh', 401, 'AUTH.INVALID_TOKEN');
          if (this.onAuthenticationFailure) {
            await Promise.resolve(this.onAuthenticationFailure(err));
          }
          throw err;
        }
        return newToken;
      } catch (err) {
        if (this.onAuthenticationFailure) {
          await Promise.resolve(this.onAuthenticationFailure(err));
        }
        if (err instanceof ApiError) {
          throw err;
        }
        throw new ApiError(
          (err as Error)?.message || 'Session refresh failed',
          401,
          'AUTH.REFRESH_FAILED',
        );
      } finally {
        this.activeRefreshPromise = null;
      }
    })();

    return this.activeRefreshPromise;
  }
}
