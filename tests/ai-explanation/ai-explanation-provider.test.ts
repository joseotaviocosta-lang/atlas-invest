import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAiProvider } from '../../apps/api/src/infrastructure/ai/openai-ai.provider';

describe('OpenAiProvider contract (Phase 3R, ADR-180, ADR-184)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends system policy + grounding + question with structured json_object, low temperature and bounded max_tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-test',
        choices: [
          { message: { content: '{"answer":"ok","evidenceFactIds":[],"limitations":[]}' } },
        ],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'gpt-4o-mini' });
    const system = 'SYSTEM_POLICY';
    const user = JSON.stringify({ question: 'q', groundingContext: { facts: [] } });
    await provider.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.1, maxTokens: 1200 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(1200);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toBe(system);
    expect(body.messages[1].content).toBe(user);
    // No tools, no web search, no streaming flags
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('fails closed with AI.PROVIDER_NOT_CONFIGURED when key is missing', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const provider = new OpenAiProvider({ apiKey: undefined });
      await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI.PROVIDER_NOT_CONFIGURED' }),
      });
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it('maps 429 to AI.PROVIDER_RATE_LIMIT and 5xx to AI.PROVIDER_UNAVAILABLE', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    const provider = new OpenAiProvider({ apiKey: 'k' });
    await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI.PROVIDER_RATE_LIMIT' }),
    });

    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI.PROVIDER_UNAVAILABLE' }),
    });
  });

  it('rejects empty model content as AI.INVALID_MODEL_RESPONSE', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '   ' } }] }),
    })) as unknown as typeof fetch;
    const provider = new OpenAiProvider({ apiKey: 'k' });
    await expect(provider.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI.INVALID_MODEL_RESPONSE' }),
    });
  });

  it('registerTool is a no-op (tools disabled in 3R)', async () => {
    const provider = new OpenAiProvider({ apiKey: 'k' });
    expect(() =>
      provider.registerTool({
        name: 't',
        description: 'd',
        parameters: [],
        execute: async () => ({}),
      }),
    ).not.toThrow();
  });
});
