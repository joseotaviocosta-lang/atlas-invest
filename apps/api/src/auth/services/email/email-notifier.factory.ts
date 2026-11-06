import {
  PasswordResetNotifier,
  InMemoryPasswordResetNotifier,
} from '../password-reset-notifier.interface';
import { ResendEmailSender } from './resend-email.sender';
import { SmtpEmailSender } from './smtp-email.sender';
import { ConsoleEmailSender } from './console-email.sender';
import { ProductionPasswordResetNotifier } from './production-password-reset-notifier.service';
import { TransactionalEmailSender } from './transactional-email.interface';

export function createPasswordResetNotifier(): PasswordResetNotifier {
  const isTest = process.env.NODE_ENV === 'test' || process.env.EMAIL_PROVIDER === 'TEST';
  const isLocalOwner = process.env.ATLAS_LOCAL_OWNER_MODE === 'true';
  const isProduction = process.env.NODE_ENV === 'production' && !isLocalOwner;
  const provider = (process.env.EMAIL_PROVIDER || '').trim().toUpperCase();

  // Test mode strictly preserves in-memory behavior for automated test suites
  if (isTest) {
    return new InMemoryPasswordResetNotifier();
  }

  // Production mode: fail-fast if no real provider is configured
  if (isProduction) {
    if (provider === 'RESEND') {
      const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error(
          'Security invariant violated: RESEND_API_KEY or EMAIL_API_KEY must be configured when EMAIL_PROVIDER=RESEND in production.',
        );
      }
      const defaultFrom = process.env.EMAIL_FROM || 'Atlas Invest <no-reply@atlasinvest.com.br>';
      const sender = new ResendEmailSender({ apiKey, defaultFrom });
      return new ProductionPasswordResetNotifier(sender);
    }

    if (provider === 'SMTP') {
      const host = process.env.SMTP_HOST;
      if (!host || host.trim().length === 0) {
        throw new Error(
          'Security invariant violated: SMTP_HOST must be configured when EMAIL_PROVIDER=SMTP in production.',
        );
      }
      const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const secure = process.env.SMTP_SECURE === 'true';
      const defaultFrom = process.env.EMAIL_FROM || 'Atlas Invest <no-reply@atlasinvest.com.br>';
      const sender = new SmtpEmailSender({ host, port, user, pass, secure, defaultFrom });
      return new ProductionPasswordResetNotifier(sender);
    }

    throw new Error(
      `Security invariant violated: A valid transactional email provider (RESEND or SMTP) with credentials must be configured in production (received EMAIL_PROVIDER='${provider || 'EMPTY'}'). Fallback to InMemoryPasswordResetNotifier is strictly prohibited in production.`,
    );
  }

  // Development mode fallback
  let devSender: TransactionalEmailSender;
  if (provider === 'RESEND' && (process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY)) {
    devSender = new ResendEmailSender({
      apiKey: (process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY)!,
      defaultFrom: process.env.EMAIL_FROM || 'Atlas Dev <no-reply@atlasinvest.local>',
    });
  } else if (provider === 'SMTP' && process.env.SMTP_HOST) {
    devSender = new SmtpEmailSender({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      defaultFrom: process.env.EMAIL_FROM || 'Atlas Dev <no-reply@atlasinvest.local>',
    });
  } else {
    devSender = new ConsoleEmailSender();
  }

  return new ProductionPasswordResetNotifier(devSender);
}

