/**
 * Phase 6D: Transactional Email Abstraction for Project Atlas
 *
 * Provider-neutral contract for sending transactional emails (password reset,
 * security alerts, DSR notices). Strictly prohibits promotional content and
 * enforces payload sanitization.
 */

export interface TransactionalEmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface TransactionalEmailSender {
  send(payload: TransactionalEmailPayload): Promise<void>;
  getProviderName(): string;
}

export const TRANSACTIONAL_EMAIL_SENDER = Symbol('TRANSACTIONAL_EMAIL_SENDER');

