import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import type { AIProvider, AIMessage, AICompletionOptions, AITool } from '@atlas/ai-engine';

export const AI_PROVIDER_TOKEN = Symbol('AI_PROVIDER_TOKEN');

export interface OpenAiProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  baseUrl?: string;
  maxTokens?: number;
}

/**
 * Concrete OpenAI AI Provider Adapter (Phase 3R, ADR-180, ADR-184)
 *
 * Isolated infrastructure adapter for generative model calls.
 * Strict invariants:
 * - Isolated from financial core and domain packages
 * - API keys are server-only and NEVER exposed in client bundles
 * - Zero tools enabled, zero web search, zero multi-pass loops
 * - Structured response via json_object format
 * - Explicit timeouts and canonical provider error mapping
 */
@Injectable()
export class OpenAiProvider implements AIProvider {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly maxTokens: number;

  constructor(options?: OpenAiProviderOptions) {
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options?.model ?? process.env.AI_MODEL ?? 'gpt-4o-mini';
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.baseUrl = (options?.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.maxTokens = options?.maxTokens ?? 1200;
  }

  async complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AIMessage> {
    if (!this.apiKey) {
      throw new HttpException(
        {
          message: 'AI provider is not configured. OPENAI_API_KEY is missing.',
          code: 'AI.PROVIDER_NOT_CONFIGURED',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options?.temperature ?? 0.1,
          max_tokens: options?.maxTokens ?? this.maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new HttpException(
            {
              message: 'AI provider rate limit exceeded',
              code: 'AI.PROVIDER_RATE_LIMIT',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (response.status >= 500) {
          throw new HttpException(
            {
              message: 'AI provider service unavailable',
              code: 'AI.PROVIDER_UNAVAILABLE',
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        throw new HttpException(
          {
            message: `AI provider returned error (${response.status})`,
            code: 'AI.PROVIDER_ERROR',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = (await response.json()) as {
        id?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string' || content.trim() === '') {
        throw new HttpException(
          {
            message: 'AI provider returned empty response content',
            code: 'AI.INVALID_MODEL_RESPONSE',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;

      return {
        role: 'assistant',
        content: content.trim(),
        usage,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        if (options?.signal?.aborted) {
          throw new HttpException(
            {
              message: 'AI request was aborted by client',
              code: 'AI.CLIENT_ABORTED',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        throw new HttpException(
          {
            message: 'AI provider request timed out',
            code: 'AI.PROVIDER_TIMEOUT',
          },
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw new HttpException(
        {
          message: 'Failed to communicate with AI provider',
          code: 'AI.PROVIDER_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  registerTool(_tool: AITool): void {
    // Prohibited in 3R
  }
}
