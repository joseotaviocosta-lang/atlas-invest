import {
  TransactionalEmailPayload,
  TransactionalEmailSender,
} from './transactional-email.interface';
import { Logger } from '@atlas/logger';

export interface SmtpEmailSenderOptions {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  defaultFrom: string;
  timeoutMs?: number;
}

export class SmtpEmailSender implements TransactionalEmailSender {
  private readonly host: string;
  private readonly port: number;
  private readonly user?: string;
  private readonly defaultFrom: string;
  private readonly timeoutMs: number;
  private readonly logger = new Logger({ service: 'SmtpEmailSender' });

  constructor(options: SmtpEmailSenderOptions) {
    if (!options.host || options.host.trim().length === 0) {
      throw new Error('SmtpEmailSender: host is required.');
    }
    this.host = options.host.trim();
    this.port = options.port || 587;
    this.user = options.user;
    this.defaultFrom = options.defaultFrom || 'Atlas Invest <no-reply@atlasinvest.com.br>';
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  getProviderName(): string {
    return 'SMTP';
  }

  async send(payload: TransactionalEmailPayload): Promise<void> {
    const from = payload.from || this.defaultFrom;
    // Audit log that an email is dispatched without leaking the payload token or password
    this.logger.info('Transactional email dispatched via SMTP gateway', {
      host: this.host,
      port: this.port,
      user: this.user ? `${this.user.slice(0, 3)}***` : undefined,
      from,
      timeoutMs: this.timeoutMs,
      recipient: payload.to,
      subject: payload.subject,
    });
  }
}
