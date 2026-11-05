import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApiClient, ApiClient, ApiError } from '@atlas/api-client';

describe('Shared API Client (@atlas/api-client)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('HTTP Transport & Basic Operations', () => {
    it('1. GET simples: executes GET request and parses JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ data: [{ id: '1', name: 'Atlas Portfolio' }] }),
      });

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });
      const result = await client.get<{ data: Array<{ id: string; name: string }> }>('/api/v1/portfolios');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.atlasinvest.com.br/api/v1/portfolios');
      expect(options.method).toBe('GET');
      expect(options.headers.Accept).toBe('application/json');
      expect(result.data[0].name).toBe('Atlas Portfolio');
    });

    it('2. POST JSON: serializes body and sets Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ data: { id: 'p2', name: 'Reserva' } }),
      });

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });
      const payload = { name: 'Reserva', currency: 'BRL' };
      const result = await client.post<{ data: { id: string } }>('/api/v1/portfolios', payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.atlasinvest.com.br/api/v1/portfolios');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe(JSON.stringify(payload));
      expect(result.data.id).toBe('p2');
    });

    it('3. status 204: handles No Content without attempting JSON parse', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
      });

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });
      const result = await client.delete<void>('/api/v1/portfolios/p1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });

    it('4. erro JSON: parses structured API error response into ApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({
          'content-type': 'application/json',
          'x-request-id': 'req-err-400',
        }),
        json: async () => ({
          statusCode: 400,
          code: 'VALIDATION.INVALID_INPUT',
          message: 'O nome da carteira é obrigatório',
          details: [{ field: 'name', issue: 'required' }],
        }),
        text: async () => '',
      });

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });

      try {
        await client.post('/api/v1/portfolios', {});
        expect.unreachable('Should have thrown ApiError');
      } catch (err) {
        expect(err instanceof ApiError).toBe(true);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.code).toBe('VALIDATION.INVALID_INPUT');
        expect(apiErr.message).toBe('O nome da carteira é obrigatório');
        expect(apiErr.requestId).toBe('req-err-400');
        expect(apiErr.details).toEqual([{ field: 'name', issue: 'required' }]);
      }
    });

    it('5. erro não-JSON: handles plain text error or non-JSON body gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => {
          throw new Error('Not JSON');
        },
        text: async () => '<html>502 Bad Gateway</html>',
      });

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });

      try {
        await client.get('/api/v1/health');
        expect.unreachable('Should have thrown ApiError');
      } catch (err) {
        expect(err instanceof ApiError).toBe(true);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(502);
        expect(apiErr.message).toBe('Bad Gateway');
      }
    });

    it('6. AbortSignal: re-throws AbortError untouched without wrapping in ApiError', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortErr);

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });
      const controller = new AbortController();
      controller.abort();

      try {
        await client.get('/api/v1/portfolios', { signal: controller.signal });
        expect.unreachable('Should have thrown AbortError');
      } catch (err) {
        expect(err instanceof ApiError).toBe(false);
        expect((err as Error).name).toBe('AbortError');
      }
    });

    it('7. Authorization header: injects Bearer token when provided by token getter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ data: [] }),
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => 'my-access-token-123',
      });

      await client.get('/api/v1/portfolios');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer my-access-token-123');
    });

    it('handles text/csv and text/plain responses', async () => {
      const csv = 'ticker;qty\nPETR4;100';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv; charset=utf-8' }),
        text: async () => csv,
      });

      const client = createApiClient({ baseUrl: 'https://api.atlasinvest.com.br' });
      const result = await client.get<string>('/api/v1/reports/export.csv');
      expect(result).toBe(csv);
    });

    it('detects offline state and rejects immediately without network fetch', async () => {
      let offline = true;
      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        isOffline: () => offline,
      });

      await expect(client.get('/api/v1/portfolios')).rejects.toMatchObject({
        code: 'OFFLINE',
        isOffline: true,
        statusCode: 0,
      });
      expect(mockFetch).not.toHaveBeenCalled();

      offline = false;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ ok: true }),
      });
      await expect(client.get('/api/v1/portfolios')).resolves.toEqual({ ok: true });
    });
  });

  describe('Refresh & Single-Flight Concurrency', () => {
    it('8, 9, 10. single 401: triggers refreshSession, retries request once with new token', async () => {
      let currentToken = 'expired-token';
      const refreshSessionMock = vi.fn().mockImplementation(async () => {
        currentToken = 'refreshed-token-999';
        return currentToken;
      });

      mockFetch.mockImplementation(async (url: string, options: RequestInit) => {
        const auth = (options.headers as Record<string, string>)?.['Authorization'];
        if (auth === 'Bearer expired-token') {
          return {
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'Token expired', code: 'AUTH.TOKEN_EXPIRED' }),
            text: async () => '',
          };
        }
        if (auth === 'Bearer refreshed-token-999') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ data: [{ id: 'p1' }] }),
          };
        }
        return { ok: false, status: 500, headers: new Headers(), text: async () => '' };
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => currentToken,
        refreshSession: refreshSessionMock,
      });

      const result = await client.get<{ data: Array<{ id: string }> }>('/api/v1/portfolios');

      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 1st call had expired token
      expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer expired-token',
      );
      // 2nd call had retried token
      expect((mockFetch.mock.calls[1][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer refreshed-token-999',
      );
      expect(result.data[0].id).toBe('p1');
    });

    it('11, 12. múltiplos 401 simultâneos: somente um refresh executado, todas as requisições concluem com sucesso', async () => {
      let currentToken = 'stale-token';
      let refreshCount = 0;

      const refreshSessionMock = vi.fn().mockImplementation(async () => {
        refreshCount++;
        // Simulate small network delay
        await new Promise((r) => setTimeout(r, 20));
        currentToken = 'fresh-token-888';
        return currentToken;
      });

      mockFetch.mockImplementation(async (_url: string, options: RequestInit) => {
        const auth = (options.headers as Record<string, string>)?.['Authorization'];
        if (auth === 'Bearer stale-token') {
          return {
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'Unauthorized' }),
            text: async () => '',
          };
        }
        if (auth === 'Bearer fresh-token-888') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ data: 'success' }),
          };
        }
        return { ok: false, status: 500, headers: new Headers(), text: async () => '' };
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => currentToken,
        refreshSession: refreshSessionMock,
      });

      // Fire 5 concurrent requests that all receive 401 simultaneously
      const results = await Promise.all([
        client.get('/api/v1/portfolios'),
        client.get('/api/v1/accounts'),
        client.get('/api/v1/assets'),
        client.get('/api/v1/tax'),
        client.get('/api/v1/benchmarks'),
      ]);

      expect(results).toHaveLength(5);
      // STRICT SINGLE-FLIGHT MUTEX: Exactly ONE refresh executed!
      expect(refreshCount).toBe(1);
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      // 5 initial 401s + 5 successful retries = 10 total fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('13, 14. refresh falha: fila inteira rejeitada e onAuthenticationFailure acionado', async () => {
      const authFailureHandler = vi.fn();
      const refreshSessionMock = vi.fn().mockRejectedValue(new Error('Session revoked'));

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Token expired' }),
        text: async () => '',
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => 'dead-token',
        refreshSession: refreshSessionMock,
        onAuthenticationFailure: authFailureHandler,
      });

      const p1 = client.get('/api/v1/portfolios');
      const p2 = client.get('/api/v1/accounts');
      const p3 = client.get('/api/v1/tax');

      const results = await Promise.allSettled([p1, p2, p3]);

      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(authFailureHandler).toHaveBeenCalledTimes(1);

      const reasons = results.map((r) => (r as PromiseRejectedResult).reason);
      reasons.forEach((reason) => {
        expect(reason instanceof ApiError).toBe(true);
        expect((reason as ApiError).statusCode).toBe(401);
      });
    });

    it('15. ausência de loop infinito: se a requisição retentada receber 401 novamente, aborta sem segundo refresh', async () => {
      let refreshCount = 0;
      const refreshSessionMock = vi.fn().mockImplementation(async () => {
        refreshCount++;
        return 'new-token-that-is-still-rejected';
      });

      // API continuously returns 401
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Still forbidden', code: 'AUTH.STILL_INVALID' }),
        text: async () => '',
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => 'token-1',
        refreshSession: refreshSessionMock,
      });

      try {
        await client.get('/api/v1/portfolios');
        expect.unreachable('Should fail with 401');
      } catch (err) {
        expect(err instanceof ApiError).toBe(true);
        expect((err as ApiError).statusCode).toBe(401);
      }

      // Exactly 1 refresh attempted, exactly 1 retry attempted, no loop!
      expect(refreshCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Token Provider Abstraction', () => {
    it('16. sem token: nenhum Authorization header é injetado', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ status: 'ok' }),
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        // No getAccessToken configured
      });

      await client.get('/api/v1/health');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });

    it('17. com token (sync & async): injeta token corretamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ ok: true }),
      });

      // Async getter
      const asyncClient = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: async () => 'async-secret-token',
      });
      await asyncClient.get('/api/v1/test');
      expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer async-secret-token',
      );

      // Sync getter
      const syncClient = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => 'sync-secret-token',
      });
      await syncClient.get('/api/v1/test');
      expect((mockFetch.mock.calls[1][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer sync-secret-token',
      );
    });

    it('18. token atualizado: requisições subsequentes consom o token mais recente', async () => {
      let dynamicToken = 'token-v1';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ ok: true }),
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => dynamicToken,
      });

      await client.get('/api/v1/first');
      expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer token-v1',
      );

      dynamicToken = 'token-v2';
      await client.get('/api/v1/second');
      expect((mockFetch.mock.calls[1][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer token-v2',
      );
    });

    it('skipAuth bypasses Authorization header even if token provider exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ public: true }),
      });

      const client = createApiClient({
        baseUrl: 'https://api.atlasinvest.com.br',
        getAccessToken: () => 'secret-token',
      });

      await client.get('/api/v1/public-endpoint', { skipAuth: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });
  });
});
