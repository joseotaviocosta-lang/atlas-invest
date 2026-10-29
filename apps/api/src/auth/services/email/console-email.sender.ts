import {
  TransactionalEmailPayload,
  TransactionalEmailSender,
} from './transactional-email.interface';
import { Logger } from '@atlas/logger';

export class ConsoleEmailSender implements TransactionalEmailSender {
  private readonly logger = new Logger({ service: 'ConsoleEmailSender' });

  getProviderName(): string {
    return 'CONSOLE';
  }

  async send(payload: TransactionalEmailPayload): Promise<void> {
    // Audit log without ever printing raw secrets or token to console
    this.logger.info('[DEV EMAIL SINK] Email dispatched (contents omitted for security)', {
      recipient: payload.to,
      subject: payload.subject,
    });
  }
}
