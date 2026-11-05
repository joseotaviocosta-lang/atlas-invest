import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createInstalledSession,
  SessionManager,
  MemorySecureTokenStorage,
  SecureTokenStorage,
  ApiError,
  AuthUser,
} from '@atlas/api-client';

describe('Installed Client Authentication (@atlas/api-client/auth)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let storage: MemorySecureTokenStorage;

  const mockUser: AuthUser = {
    id: 'user-uuid-1',
    email: 'investor@atlas.com',
    name: 'Investor One',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    baseCurrency: 'BRL',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    storage = new MemorySecureTokenStorage();
  });

  describe('Login Flow', () => {
    it('1, 2, 3. login sucesso: stores access token in memory, persists refresh token in storage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            user: mockUser,
            accessToken: 'jwt-access-token-123',
            refreshToken: 'opaque-refresh-token-456',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      const loginResult = await session.login({
        email: '  Investor@Atlas.COM ',
        password: 'StrongPassword123!',
      });

      // Assert payload normalization
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.atlasinvest.com.br/api/v1/auth/login');
      const body = JSON.parse(options.body as string);
      expect(body.email).toBe('investor@atlas.com');
      expect(body.password).toBe('StrongPassword123!');

      // Assert access token is in memory ONLY
      expect(session.getAccessToken()).toBe('jwt-access-token-123');
      expect(loginResult.accessToken).toBe('jwt-access-token-123');
      expect(session.getUser()?.email).toBe('investor@atlas.com');
      expect(session.getAuthState()).toEqual({
        status: 'authenticated',
        user: mockUser,
      });

      // Assert refresh token is in storage ONLY
      expect(await storage.getRefreshToken()).toBe('opaque-refresh-token-456');
    });

    it('4. login inválido: API returns 401 -> throws ApiError, storage remains empty, state anonymous', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 401,
          code: 'AUTH.INVALID_CREDENTIALS',
          message: 'Invalid credentials.',
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      await expect(
        session.login({
          email: 'wrong@atlas.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTH.INVALID_CREDENTIALS',
      });

      expect(session.getAccessToken()).toBeNull();
      expect(await storage.getRefreshToken()).toBeNull();
      expect(session.getAuthState()).toEqual({
        status: 'anonymous',
        user: null,
      });
    });

    it('5. storage failure durante login: fails safely, attempts remote revocation, leaves no partial session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            user: mockUser,
            accessToken: 'jwt-access-token-orphan',
            refreshToken: 'opaque-refresh-token-orphan',
            expiresIn: 900,
          },
        }),
      });

      // Storage that throws on write
      const faultyStorage: SecureTokenStorage = {
        getRefreshToken: async () => null,
        setRefreshToken: async () => {
          throw new Error('Hardware Keystore unavailable');
        },
        clearRefreshToken: async () => {},
      };

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: faultyStorage,
      });

      // Should attempt best-effort logout on the server
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => '',
      });

      await expect(
        session.login({
          email: 'investor@atlas.com',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'AUTH.STORAGE_ERROR',
      });

      expect(session.getAccessToken()).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
      // Verify logout attempt
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toContain('/api/v1/auth/logout');
    });
  });

  describe('Refresh & Rotation Flow', () => {
    it('6, 7, 8, 9. refresh sucesso: rotates refresh token in storage, updates access token in memory', async () => {
      await storage.setRefreshToken('current-token-v1');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'new-access-token-v2',
            refreshToken: 'rotated-refresh-token-v2',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      const newToken = await session.refresh();

      expect(newToken).toBe('new-access-token-v2');
      expect(session.getAccessToken()).toBe('new-access-token-v2');
      // Invariant: Storage now holds the NEW rotated refresh token
      expect(await storage.getRefreshToken()).toBe('rotated-refresh-token-v2');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.atlasinvest.com.br/api/v1/auth/refresh');
      expect(JSON.parse(options.body as string)).toEqual({ refreshToken: 'current-token-v1' });
    });

    it('10. refresh sem token: storage empty -> throws AUTH.NO_REFRESH_TOKEN, state anonymous', async () => {
      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      await expect(session.refresh()).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTH.NO_REFRESH_TOKEN',
      });

      expect(session.getAccessToken()).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
    });

    it('11. refresh inválido: API returns 401 AUTH.INVALID_REFRESH_TOKEN -> clears storage and memory', async () => {
      await storage.setRefreshToken('reused-or-revoked-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 401,
          code: 'AUTH.INVALID_REFRESH_TOKEN',
          message: 'Refresh token reuse detected. Session has been revoked.',
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      await expect(session.refresh()).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTH.INVALID_REFRESH_TOKEN',
      });

      expect(session.getAccessToken()).toBeNull();
      expect(await storage.getRefreshToken()).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
    });

    it('12, 13. storage failure após rotação: rotated token not lost silently; session destroyed safely', async () => {
      let readToken: string | null = 'valid-token-v1';
      const storageWithBrokenWrite: SecureTokenStorage = {
        getRefreshToken: async () => readToken,
        setRefreshToken: async () => {
          throw new Error('Disk / Keystore write error');
        },
        clearRefreshToken: async () => {
          readToken = null;
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'new-access-token-v2',
            refreshToken: 'rotated-token-v2',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: storageWithBrokenWrite,
      });

      await expect(session.refresh()).rejects.toMatchObject({
        statusCode: 500,
        code: 'AUTH.STORAGE_ERROR',
      });

      // Invariant: In-memory token destroyed, storage cleared, anonymous
      expect(session.getAccessToken()).toBeNull();
      expect(await storageWithBrokenWrite.getRefreshToken()).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
    });
  });

  describe('Concurrency & Single-Flight Coordination', () => {
    it('14, 15, 16, 17. 5 concurrent requests receiving 401 trigger exactly 1 refresh call and retry all 5 successfully', async () => {
      await storage.setRefreshToken('refresh-token-concurrency');

      let currentAccessToken = 'expired-token';
      let refreshEndpointCalls = 0;

      mockFetch.mockImplementation(async (url: string, options: RequestInit) => {
        // Refresh endpoint
        if (url.includes('/api/v1/auth/refresh')) {
          refreshEndpointCalls++;
          // Simulate network latency
          await new Promise((r) => setTimeout(r, 20));
          currentAccessToken = 'fresh-token-winner';
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: {
                accessToken: 'fresh-token-winner',
                refreshToken: 'rotated-token-concurrency-2',
                expiresIn: 900,
              },
            }),
            text: async () => '',
          };
        }

        // Domain endpoints
        const authHeader = (options.headers as Record<string, string>)?.['Authorization'];
        if (authHeader === 'Bearer expired-token') {
          return {
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'Token expired', code: 'AUTH.TOKEN_EXPIRED' }),
            text: async () => '',
          };
        }

        if (authHeader === 'Bearer fresh-token-winner') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ data: { endpoint: url } }),
          };
        }

        return { ok: false, status: 500, headers: new Headers(), text: async () => '' };
      });

      const { client, session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      // Seed initial expired access token
      (session as unknown as { inMemoryAccessToken: string }).inMemoryAccessToken = currentAccessToken;

      // Fire 5 concurrent domain requests that all fail with 401
      const [res1, res2, res3, res4, res5] = await Promise.all([
        client.get<{ data: { endpoint: string } }>('/api/v1/portfolios'),
        client.get<{ data: { endpoint: string } }>('/api/v1/accounts'),
        client.get<{ data: { endpoint: string } }>('/api/v1/assets'),
        client.get<{ data: { endpoint: string } }>('/api/v1/tax'),
        client.get<{ data: { endpoint: string } }>('/api/v1/market'),
      ]);

      // All 5 requests retried and succeeded
      expect(res1.data.endpoint).toContain('/portfolios');
      expect(res2.data.endpoint).toContain('/accounts');
      expect(res3.data.endpoint).toContain('/assets');
      expect(res4.data.endpoint).toContain('/tax');
      expect(res5.data.endpoint).toContain('/market');

      // CRITICAL: Exactly ONE refresh call was made!
      expect(refreshEndpointCalls).toBe(1);
      // New access token in memory
      expect(session.getAccessToken()).toBe('fresh-token-winner');
      // Rotated token in storage
      expect(await storage.getRefreshToken()).toBe('rotated-token-concurrency-2');
    });
  });

  describe('Session Restore Flow', () => {
    it('18. restore sem refresh token: returns null, sets status to anonymous', async () => {
      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      const user = await session.restoreSession();

      expect(user).toBeNull();
      expect(session.getAuthState()).toEqual({
        status: 'anonymous',
        user: null,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('19. restore com refresh token válido: refreshes, fetches /me, sets status to authenticated', async () => {
      await storage.setRefreshToken('valid-persisted-refresh-token');

      // 1. Refresh response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'restored-access-token',
            refreshToken: 'restored-rotated-refresh-token',
            expiresIn: 900,
          },
        }),
      });

      // 2. /api/v1/auth/me response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: mockUser,
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      const restoredUser = await session.restoreSession();

      expect(restoredUser).toEqual(mockUser);
      expect(session.getAccessToken()).toBe('restored-access-token');
      expect(await storage.getRefreshToken()).toBe('restored-rotated-refresh-token');
      expect(session.getAuthState()).toEqual({
        status: 'authenticated',
        user: mockUser,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/auth/refresh');
      expect(mockFetch.mock.calls[1][0]).toContain('/api/v1/auth/me');
      expect((mockFetch.mock.calls[1][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer restored-access-token',
      );
    });

    it('20, 21. restore com refresh token expirado/revogado: clears storage, returns null, state anonymous', async () => {
      await storage.setRefreshToken('expired-refresh-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 401,
          code: 'AUTH.SESSION_EXPIRED',
          message: 'Session has expired.',
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      const restoredUser = await session.restoreSession();

      expect(restoredUser).toBeNull();
      expect(session.getAccessToken()).toBeNull();
      expect(await storage.getRefreshToken()).toBeNull();
      expect(session.getAuthState()).toEqual({
        status: 'anonymous',
        user: null,
      });
    });

    it('21b. restore com erro de rede: preserves refresh token in storage without wiping and sets state anonymous', async () => {
      await storage.setRefreshToken('valid-offline-refresh-token');

      mockFetch.mockRejectedValueOnce(new Error('Network offline / connection refused'));

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      const restoredUser = await session.restoreSession();

      expect(restoredUser).toBeNull();
      expect(session.getAccessToken()).toBeNull();
      // Crucial invariant (Parte M): network error must NOT destroy stored refresh token!
      expect(await storage.getRefreshToken()).toBe('valid-offline-refresh-token');
      expect(session.getAuthState()).toEqual({
        status: 'anonymous',
        user: null,
      });
    });
  });

  describe('Logout Flow', () => {
    it('22, 24, 25. logout sucesso: calls server logout, wipes access token from memory, clears storage', async () => {
      await storage.setRefreshToken('refresh-token-to-logout');

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      // Seed active session
      (session as unknown as { inMemoryAccessToken: string }).inMemoryAccessToken = 'access-token-active';
      (session as unknown as { currentUser: AuthUser }).currentUser = mockUser;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      await session.logout();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/auth/logout');
      expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer access-token-active',
      );

      // Invariants: Memory and storage completely wiped
      expect(session.getAccessToken()).toBeNull();
      expect(session.getUser()).toBeNull();
      expect(await storage.getRefreshToken()).toBeNull();
      expect(session.getAuthState()).toEqual({
        status: 'anonymous',
        user: null,
      });
    });

    it('23. API indisponível no logout: local tokens still wiped completely', async () => {
      await storage.setRefreshToken('offline-refresh-token');

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      (session as unknown as { inMemoryAccessToken: string }).inMemoryAccessToken = 'offline-access-token';
      (session as unknown as { currentUser: AuthUser }).currentUser = mockUser;

      // Network error (offline / connection refused)
      mockFetch.mockRejectedValueOnce(new Error('Network error: server unreachable'));

      await session.logout();

      // Local credentials must NEVER remain because of network failure
      expect(session.getAccessToken()).toBeNull();
      expect(session.getUser()).toBeNull();
      expect(await storage.getRefreshToken()).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
    });
  });

  describe('Security & Privacy Invariants', () => {
    it('26. access token nunca persistido: storage only receives refresh token, never access token', async () => {
      let storedValues: string[] = [];
      const spyStorage: SecureTokenStorage = {
        getRefreshToken: async () => null,
        setRefreshToken: async (val: string) => {
          storedValues.push(val);
        },
        clearRefreshToken: async () => {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            user: mockUser,
            accessToken: 'jwt-access-secret-token',
            refreshToken: 'refresh-token-secret',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: spyStorage,
      });

      await session.login({ email: 'user@atlas.com', password: 'Password123!' });

      expect(storedValues).toEqual(['refresh-token-secret']);
      expect(storedValues).not.toContain('jwt-access-secret-token');
    });

    it('27, 28. erros não expõem tokens e refresh token nunca é logado em mensagens de erro', async () => {
      await storage.setRefreshToken('secret-token-xyz-987');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 401,
          code: 'AUTH.INVALID_REFRESH_TOKEN',
          message: 'Refresh token invalid.',
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      try {
        await session.refresh();
        expect.unreachable('Should fail');
      } catch (err) {
        expect(err instanceof ApiError).toBe(true);
        const msg = (err as Error).message;
        expect(msg).not.toContain('secret-token-xyz-987');
      }
    });

    it('29, 30. nenhum localStorage nem cookies são manipulados pelo fluxo de cliente instalado', async () => {
      // Mock global window/localStorage to verify it is NOT accessed
      const localStorageGetItemSpy = vi.fn();
      const localStorageSetItemSpy = vi.fn();
      (global as unknown as { localStorage?: unknown }).localStorage = {
        getItem: localStorageGetItemSpy,
        setItem: localStorageSetItemSpy,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            user: mockUser,
            accessToken: 'jwt-clean',
            refreshToken: 'refresh-clean',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
      });

      await session.login({ email: 'u@a.com', password: 'Password123!' });

      expect(localStorageGetItemSpy).not.toHaveBeenCalled();
      expect(localStorageSetItemSpy).not.toHaveBeenCalled();

      // Check request options had no cookie header
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Cookie']).toBeUndefined();
      expect(options.credentials).not.toBe('include');

      delete (global as unknown as { localStorage?: unknown }).localStorage;
    });
  });

  describe('Auth State Change Subscriptions', () => {
    it('notifies subscribers upon login, logout, and restore state transitions', async () => {
      const stateHistory: string[] = [];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            user: mockUser,
            accessToken: 'jwt-1',
            refreshToken: 'ref-1',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage,
        onAuthStateChange: (s) => stateHistory.push(s.status),
      });

      await session.login({ email: 'u@a.com', password: 'Password123!' });
      expect(stateHistory).toEqual(['authenticated']);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => '',
      });

      await session.logout();
      expect(stateHistory).toEqual(['authenticated', 'anonymous']);
    });
  });
});
