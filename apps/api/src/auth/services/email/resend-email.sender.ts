import {
  TransactionalEmailPayload,
  TransactionalEmailSender,
} from './transactional-email.interface';
import { Logger } from '@atlas/logger';

export interface ResendEmailSenderOptions {
  apiKey: string;
  defaultFrom: string;
  timeoutMs?: number;
}

export class ResendEmailSender implements TransactionalEmailSender {
  private readonly apiKey: string;
  private readonly defaultFrom: string;
  private readonly timeoutMs: number;
  private readonly logger = new Logger({ service: 'ResendEmailSender' });

  constructor(options: ResendEmailSenderOptions) {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new Error('ResendEmailSender: apiKey is required.');
    }
    this.apiKey = options.apiKey.trim();
    this.defaultFrom = options.defaultFrom || 'Atlas Invest <no-reply@atlasinvest.com.br>';
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  getProviderName(): string {
    return 'RESEND';
  }

  async send(payload: TransactionalEmailPayload): Promise<void> {
    const from = payload.from || this.defaultFrom;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [payload.to],
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error body');
        this.logger.error('Failed to send transactional email via Resend', {
          statusCode: response.status,
          recipient: payload.to,
        });
        throw new Error(
          `Resend API error: HTTP ${response.status} - ${errorBody.slice(0, 200)}`,
        );
      }

      this.logger.info('Transactional email dispatched via Resend', {
        recipient: payload.to,
        subject: payload.subject,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Resend API timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
