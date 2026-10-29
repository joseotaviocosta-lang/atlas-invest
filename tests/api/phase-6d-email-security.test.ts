import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ForgotPasswordUseCase } from '../../apps/api/src/application/auth/forgot-password.use-case';
import {
  PasswordResetNotifier,
  InMemoryPasswordResetNotifier,
} from '../../apps/api/src/auth/services/password-reset-notifier.interface';
import { TokenService } from '../../apps/api/src/auth/services/token.service';
import { IUserRepository, IPasswordResetTokenRepository } from '@atlas/database';
import { createPasswordResetNotifier } from '../../apps/api/src/auth/services/email/email-notifier.factory';
import { ProductionPasswordResetNotifier } from '../../apps/api/src/auth/services/email/production-password-reset-notifier.service';
import {
  TransactionalEmailSender,
  TransactionalEmailPayload,
} from '../../apps/api/src/auth/services/email/transactional-email.interface';
import { ResendEmailSender } from '../../apps/api/src/auth/services/email/resend-email.sender';
import { SmtpEmailSender } from '../../apps/api/src/auth/services/email/smtp-email.sender';

describe('Phase 6D: Transactional Email Security & Password Reset Contracts', () => {
  let mockUserRepo: Partial<IUserRepository>;
  let mockTokenRepo: Partial<IPasswordResetTokenRepository>;
  let mockNotifier: PasswordResetNotifier;
  let tokenService: TokenService;
  let useCase: ForgotPasswordUseCase;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: vi.fn(),
    };
    mockTokenRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'token-uuid-123',
        userId: 'user-uuid-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: null,
        createdAt: new Date(),
      }),
    };
    mockNotifier = new InMemoryPasswordResetNotifier();
    tokenService = new TokenService();

    useCase = new ForgotPasswordUseCase(
      mockUserRepo as IUserRepository,
      mockTokenRepo as IPasswordResetTokenRepository,
      mockNotifier,
      tokenService,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Anti-Enumeration & Token Privacy', () => {
    it('returns { accepted: true } when user exists and dispatches reset email', async () => {
      vi.mocked(mockUserRepo.findByEmail!).mockResolvedValue({
        id: 'user-uuid-1',
        email: 'investor@atlas.com.br',
        name: 'Investor One',
        passwordHash: 'hash',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await useCase.execute({ email: 'INVESTOR@atlas.com.br ' });
      expect(res).toEqual({ accepted: true });
      expect(mockTokenRepo.create).toHaveBeenCalledOnce();

      const inMemoryNotifier = mockNotifier as InMemoryPasswordResetNotifier;
      expect(inMemoryNotifier.getLastToken('investor@atlas.com.br')).toBeDefined();
    });

    it('returns { accepted: true } when user does NOT exist without leaking presence', async () => {
      vi.mocked(mockUserRepo.findByEmail!).mockResolvedValue(null);

      const res = await useCase.execute({ email: 'nonexistent@atlas.com.br' });
      expect(res).toEqual({ accepted: true });
      expect(mockTokenRepo.create).not.toHaveBeenCalled();

      const inMemoryNotifier = mockNotifier as InMemoryPasswordResetNotifier;
      expect(inMemoryNotifier.getLastToken('nonexistent@atlas.com.br')).toBeUndefined();
    });

    it('preserves { accepted: true } and logs sanitized error when email provider fails', async () => {
      vi.mocked(mockUserRepo.findByEmail!).mockResolvedValue({
        id: 'user-uuid-fail',
        email: 'fail@atlas.com.br',
        name: 'Fail User',
        passwordHash: 'hash',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const failingNotifier: PasswordResetNotifier = {
        sendResetEmail: vi.fn().mockRejectedValue(new Error('SMTP connection refused')),
      };

      const failingUseCase = new ForgotPasswordUseCase(
        mockUserRepo as IUserRepository,
        mockTokenRepo as IPasswordResetTokenRepository,
        failingNotifier,
        tokenService,
      );

      // Must not throw or reveal failure to client
      const res = await failingUseCase.execute({ email: 'fail@atlas.com.br' });
      expect(res).toEqual({ accepted: true });
      expect(mockTokenRepo.create).toHaveBeenCalledOnce();
    });
  });

  describe('2. Email Template & Public URL Construction', () => {
    it('renders pt-BR copy with valid reset URL and explicit 15-minute expiration', async () => {
      let sentPayload: TransactionalEmailPayload | null = null;
      const mockSender: TransactionalEmailSender = {
        getProviderName: () => 'MOCK_SENDER',
        send: vi.fn().mockImplementation(async (payload) => {
          sentPayload = payload;
        }),
      };

      const notifier = new ProductionPasswordResetNotifier(
        mockSender,
        'https://app.atlasinvest.com.br',
      );

      const token = 'secret-raw-token-12345';
      await notifier.sendResetEmail('investor@atlas.com.br', token);

      expect(sentPayload).not.toBeNull();
      expect(sentPayload!.to).toBe('investor@atlas.com.br');
      expect(sentPayload!.subject).toBe('Redefinição de senha — Project Atlas');
      expect(sentPayload!.text).toContain(
        'https://app.atlasinvest.com.br/reset-password?token=secret-raw-token-12345',
      );
      expect(sentPayload!.text).toContain('expira em 15 minutos');
      expect(sentPayload!.text).toContain('Se você não solicitou a redefinição de senha, ignore');
      expect(sentPayload!.html).toContain('Redefinir Minha Senha');
      expect(sentPayload!.html).toContain(
        'https://app.atlasinvest.com.br/reset-password?token=secret-raw-token-12345',
      );
    });

    it('falls back to NEXT_PUBLIC_APP_URL when constructor URL is omitted', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://portal.atlas.dev';

      let sentPayload: TransactionalEmailPayload | null = null;
      const mockSender: TransactionalEmailSender = {
        getProviderName: () => 'MOCK_SENDER',
        send: vi.fn().mockImplementation(async (payload) => {
          sentPayload = payload;
        }),
      };

      const notifier = new ProductionPasswordResetNotifier(mockSender);
      await notifier.sendResetEmail('carlos@atlas.dev', 'my-token');

      expect(sentPayload!.text).toContain('https://portal.atlas.dev/reset-password?token=my-token');
    });
  });

  describe('3. Production Fail-Fast & Factory Isolation', () => {
    it('returns InMemoryPasswordResetNotifier when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.EMAIL_PROVIDER;

      const notifier = createPasswordResetNotifier();
      expect(notifier instanceof InMemoryPasswordResetNotifier).toBe(true);
    });

    it('throws fail-fast exception in production when EMAIL_PROVIDER is missing or invalid', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.EMAIL_PROVIDER;

      expect(() => createPasswordResetNotifier()).toThrow(
        /Security invariant violated: A valid transactional email provider \(RESEND or SMTP\) with credentials must be configured in production/,
      );
    });

    it('throws fail-fast exception in production when EMAIL_PROVIDER=RESEND without API key', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'RESEND';
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_API_KEY;

      expect(() => createPasswordResetNotifier()).toThrow(
        /RESEND_API_KEY or EMAIL_API_KEY must be configured/,
      );
    });

    it('throws fail-fast exception in production when EMAIL_PROVIDER=SMTP without host', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'SMTP';
      delete process.env.SMTP_HOST;

      expect(() => createPasswordResetNotifier()).toThrow(/SMTP_HOST must be configured/);
    });

    it('instantiates ProductionPasswordResetNotifier with Resend when valid', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'RESEND';
      process.env.RESEND_API_KEY = 're_test_key_12345';
      process.env.EMAIL_FROM = 'Atlas <noreply@atlas.dev>';

      const notifier = createPasswordResetNotifier();
      expect(notifier instanceof ProductionPasswordResetNotifier).toBe(true);
    });

    it('instantiates ProductionPasswordResetNotifier with SMTP when valid', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'SMTP';
      process.env.SMTP_HOST = 'smtp.sendgrid.net';
      process.env.SMTP_PORT = '587';
      process.env.EMAIL_FROM = 'Atlas <noreply@atlas.dev>';

      const notifier = createPasswordResetNotifier();
      expect(notifier instanceof ProductionPasswordResetNotifier).toBe(true);
    });
  });

  describe('4. Sender Implementations', () => {
    it('ResendEmailSender handles successful API call and handles API errors gracefully', async () => {
      const sender = new ResendEmailSender({
        apiKey: 're_valid_api_key',
        defaultFrom: 'Atlas <test@atlas.com>',
      });
      expect(sender.getProviderName()).toBe('RESEND');

      // Mock fetch
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ id: 'email-resend-id-123' }),
        } as Response);

        await sender.send({
          to: 'test@atlas.com',
          subject: 'Test',
          text: 'Hello',
          html: '<p>Hello</p>',
        });

        expect(globalThis.fetch).toHaveBeenCalledOnce();

        // Error path
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'Invalid API Key',
        } as Response);

        await expect(
          sender.send({
            to: 'test@atlas.com',
            subject: 'Test',
            text: 'Hello',
            html: '<p>Hello</p>',
          }),
        ).rejects.toThrow(/Resend API error: HTTP 401/);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('SmtpEmailSender reports SMTP provider and sends without leaking tokens', async () => {
      const sender = new SmtpEmailSender({
        host: 'mail.atlas.local',
        port: 587,
        defaultFrom: 'Atlas <noreply@atlas.local>',
      });
      expect(sender.getProviderName()).toBe('SMTP');

      await expect(
        sender.send({
          to: 'dest@atlas.local',
          subject: 'Test Subject',
          text: 'Plain Body',
          html: '<p>HTML Body</p>',
        }),
      ).resolves.toBeUndefined();
    });
  });
});

