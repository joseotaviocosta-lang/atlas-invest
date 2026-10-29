import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: Phase 6B LGPD & Legal Compliance Readiness', () => {
  let app: INestApplication;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();

    userAId = randomUUID();
    userBId = randomUUID();

    // Create User A
    await prisma.user.create({
      data: {
        id: userAId,
        email: `investor.a.${userAId}@atlas.local`,
        name: 'Investor Alpha',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fake_hash_user_a',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
    });

    // Create User B
    await prisma.user.create({
      data: {
        id: userBId,
        email: `investor.b.${userBId}@atlas.local`,
        name: 'Investor Beta',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fake_hash_user_b',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
    });

    // Create sessions
    const sessionA = await createAuthenticatedUserSession(userAId);
    userAToken = sessionA.token;

    const sessionB = await createAuthenticatedUserSession(userBId);
    userBToken = sessionB.token;

    // Seed User A's financial assets & transactions for export verification
    const institution = await prisma.institution.create({
      data: {
        id: randomUUID(),
        name: 'XP Investimentos',
        type: 'BROKERAGE',
        country: 'BR',
      },
    });

    const portfolio = await prisma.portfolio.create({
      data: {
        id: randomUUID(),
        userId: userAId,
        name: 'Carteira Principal',
        baseCurrency: 'BRL',
        type: 'INVESTMENT',
        status: 'ACTIVE',
      },
    });

    const account = await prisma.account.create({
      data: {
        id: randomUUID(),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'XP Custódia',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-03-15T00:00:00Z'),
        settlementDate: new Date('2026-03-17T00:00:00Z'),
        quantity: '100',
        unitPrice: '35.50',
        amount: '3550.00',
        currency: 'BRL',
      },
    });
  }, 30000);

  describe('1. Versioned Legal Documents & Acceptance Audit Trail', () => {
    it('GET /api/v1/privacy/documents: returns versioned legal documents with mandatory watermarks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/privacy/documents')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);

      const tos = res.body.data.find((d: Record<string, unknown>) => d.type === 'TERMS_OF_SERVICE');
      expect(tos).toBeDefined();
      expect(tos.version).toBe('1.0.0');
      expect(tos.draftWatermark).toContain('DRAFT — LEGAL REVIEW REQUIRED');

      const privacy = res.body.data.find((d: Record<string, unknown>) => d.type === 'PRIVACY_POLICY');
      expect(privacy).toBeDefined();
      expect(privacy.version).toBe('1.0.0');
      expect(privacy.draftWatermark).toContain('DRAFT — LEGAL REVIEW REQUIRED');
    });

    it('POST /api/v1/privacy/acceptances: records acceptance with client IP and User-Agent', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/acceptances')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('User-Agent', 'AtlasWeb/1.0.0')
        .send({
          documentType: 'TERMS_OF_SERVICE',
          version: '1.0.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.documentType).toBe('TERMS_OF_SERVICE');
      expect(res.body.data.documentVersion).toBe('1.0.0');
      expect(res.body.data.userId).toBe(userAId);
      expect(res.body.data.userAgent).toBe('AtlasWeb/1.0.0');

      // Check listing
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/privacy/acceptances')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].documentType).toBe('TERMS_OF_SERVICE');
    });
  });

  describe('2. Granular Consent Recording & Revocation', () => {
    it('GET /api/v1/privacy/consents: returns 4 canonical purposes defaulting to false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/privacy/consents')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(4);
      expect(res.body.data.every((c: Record<string, unknown>) => c.granted === false)).toBe(true);
    });

    it('POST /api/v1/privacy/consents: records grant and revocation timestamps accurately', async () => {
      // 1. Grant consent
      const grantRes = await request(app.getHttpServer())
        .post('/api/v1/privacy/consents')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          purpose: 'AI_GROUNDED_EXPLANATIONS',
          granted: true,
        });

      expect(grantRes.status).toBe(200);
      expect(grantRes.body.data.purpose).toBe('AI_GROUNDED_EXPLANATIONS');
      expect(grantRes.body.data.granted).toBe(true);
      expect(grantRes.body.data.grantedAt).toBeDefined();
      expect(grantRes.body.data.revokedAt).toBeNull();

      // 2. Revoke consent
      const revokeRes = await request(app.getHttpServer())
        .post('/api/v1/privacy/consents')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          purpose: 'AI_GROUNDED_EXPLANATIONS',
          granted: false,
        });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.granted).toBe(false);
      expect(revokeRes.body.data.grantedAt).toBeDefined();
      expect(revokeRes.body.data.revokedAt).toBeDefined();
    });
  });

  describe('3. Data Subject Requests (DSR) & Legal Retention Classification', () => {
    it('POST /api/v1/privacy/requests: classifies DELETION as PENDING_LEGAL_RETENTION_REVIEW with fiscal notes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/requests')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          type: 'DELETION',
          details: 'Desejo encerrar o uso do aplicativo e solicitar exclusão de dados.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('DELETION');
      expect(res.body.data.status).toBe('PENDING_LEGAL_RETENTION_REVIEW');
      expect(res.body.data.responseNotes).toContain('Art. 16, I da LGPD');
      expect(res.body.data.responseNotes).toContain('Código Tributário Nacional');

      // Verify list endpoint
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/privacy/requests')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].type).toBe('DELETION');
    });
  });

  describe('4. Data Export (Machine-Readable JSON, Strict Isolation, No Secrets)', () => {
    it('GET /api/v1/privacy/export: exports sanitized data package with no-store headers and zero leaked credentials', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/privacy/export')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain(
        `attachment; filename="atlas-privacy-export-${userAId}.json"`,
      );
      expect(res.headers['cache-control']).toContain('no-store');

      const data = res.body.data;
      expect(data.schemaVersion).toBe('1.0.0');
      expect(data.user.id).toBe(userAId);
      expect(data.user.email).toBe(`investor.a.${userAId}@atlas.local`);

      // CRITICAL SECURITY INVARIANT: passwordHash MUST NOT be exposed
      expect(data.user.passwordHash).toBeUndefined();
      const rawText = JSON.stringify(res.body);
      expect(rawText).not.toContain('fake_hash');
      expect(rawText).not.toContain('passwordHash');

      // Check tenant-isolation: User A has transactions, User B must not see User A's data
      expect(data.portfolios.length).toBe(1);
      expect(data.transactionLedger.length).toBe(1);
      expect(data.transactionLedger[0].ticker).toBe('PETR4');
      expect(data.transactionLedger[0].totalAmount).toBe('3550');

      // User B export is strictly empty of User A's data
      const resB = await request(app.getHttpServer())
        .get('/api/v1/privacy/export')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.user.id).toBe(userBId);
      expect(resB.body.data.portfolios.length).toBe(0);
      expect(resB.body.data.transactionLedger.length).toBe(0);
    });
  });

  describe('5. Account Deactivation & Retention Safety (No Destructive Ledger Cascade)', () => {
    it('POST /api/v1/privacy/account/deactivate: deactivates user, revokes sessions, preserves ledger transactions', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/privacy/account/deactivate')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          confirmation: 'DESATIVAR MINHA CONTA',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.deactivated).toBe(true);

      // Verify user has deactivatedAt set
      const dbUser = await prisma.user.findUnique({ where: { id: userAId } });
      expect(dbUser?.deactivatedAt).not.toBeNull();

      // Verify sessions are revoked
      const activeSessions = await prisma.session.findMany({
        where: { userId: userAId, revokedAt: null },
      });
      expect(activeSessions.length).toBe(0);

      // Verify ledger transactions were NOT deleted (Source of Truth / Fiscal Retention preserved)
      const transactions = await prisma.transaction.findMany();
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount.toString()).toBe('3550');

      // Verify formal DSR was logged
      const requests = await prisma.dataSubjectRequest.findMany({ where: { userId: userAId } });
      expect(requests.length).toBe(1);
      expect(requests[0].type).toBe('DELETION');
      expect(requests[0].status).toBe('PENDING_LEGAL_RETENTION_REVIEW');
    });
  });

  describe('6. Data Sharing Transparency', () => {
    it('GET /api/v1/privacy/sharing: returns third-party data processors and legal basis candidate matrix', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/privacy/sharing')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.principles.length).toBeGreaterThanOrEqual(4);
      expect(res.body.data.entities.length).toBe(4);

      const b3 = res.body.data.entities.find((e: Record<string, unknown>) => typeof e.name === 'string' && e.name.includes('B3'));
      expect(b3).toBeDefined();
      expect(b3.legalBasisCandidate).toContain('Art. 7, V');

      const rfb = res.body.data.entities.find((e: Record<string, unknown>) => typeof e.name === 'string' && e.name.includes('Receita Federal'));
      expect(rfb).toBeDefined();
      expect(rfb.legalBasisCandidate).toContain('Art. 7, II');

      const ai = res.body.data.entities.find((e: Record<string, unknown>) => typeof e.name === 'string' && e.name.includes('Google Vertex AI'));
      expect(ai).toBeDefined();
      expect(ai.legalBasisCandidate).toContain('Art. 7, I');
    });
  });
});
