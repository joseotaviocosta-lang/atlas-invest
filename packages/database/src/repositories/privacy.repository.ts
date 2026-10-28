import { PrismaClient } from '@prisma/client';
import {
  IPrivacyRepository,
  LegalDocumentAcceptanceRecord,
  UserConsentRecord,
  DataSubjectRequestRecord,
  UserDataExport,
} from './interfaces';
import { getPrismaClient } from '../client';

export class PrivacyRepository implements IPrivacyRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async recordAcceptance(data: {
    userId: string;
    documentType: string;
    documentVersion: string;
    clientIp?: string | null;
    userAgent?: string | null;
  }): Promise<LegalDocumentAcceptanceRecord> {
    const record = await this.prisma.legalDocumentAcceptance.create({
      data: {
        userId: data.userId,
        documentType: data.documentType,
        documentVersion: data.documentVersion,
        clientIp: data.clientIp,
        userAgent: data.userAgent,
      },
    });

    return {
      id: record.id,
      userId: record.userId,
      documentType: record.documentType,
      documentVersion: record.documentVersion,
      acceptedAt: record.acceptedAt,
      clientIp: record.clientIp,
      userAgent: record.userAgent,
      createdAt: record.createdAt,
    };
  }

  async listAcceptances(userId: string): Promise<LegalDocumentAcceptanceRecord[]> {
    const list = await this.prisma.legalDocumentAcceptance.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });

    return list.map((record) => ({
      id: record.id,
      userId: record.userId,
      documentType: record.documentType,
      documentVersion: record.documentVersion,
      acceptedAt: record.acceptedAt,
      clientIp: record.clientIp,
      userAgent: record.userAgent,
      createdAt: record.createdAt,
    }));
  }

  async getLatestAcceptance(
    userId: string,
    documentType: string,
  ): Promise<LegalDocumentAcceptanceRecord | null> {
    const record = await this.prisma.legalDocumentAcceptance.findFirst({
      where: { userId, documentType },
      orderBy: { acceptedAt: 'desc' },
    });

    if (!record) return null;

    return {
      id: record.id,
      userId: record.userId,
      documentType: record.documentType,
      documentVersion: record.documentVersion,
      acceptedAt: record.acceptedAt,
      clientIp: record.clientIp,
      userAgent: record.userAgent,
      createdAt: record.createdAt,
    };
  }

  async upsertConsent(data: {
    userId: string;
    purpose: string;
    granted: boolean;
    clientIp?: string | null;
    userAgent?: string | null;
  }): Promise<UserConsentRecord> {
    const now = new Date();
    const existing = await this.prisma.userConsent.findUnique({
      where: {
        userId_purpose: {
          userId: data.userId,
          purpose: data.purpose,
        },
      },
    });

    let record;
    if (existing) {
      record = await this.prisma.userConsent.update({
        where: { id: existing.id },
        data: {
          granted: data.granted,
          grantedAt: data.granted ? now : existing.grantedAt,
          revokedAt: !data.granted ? now : existing.revokedAt,
          clientIp: data.clientIp,
          userAgent: data.userAgent,
        },
      });
    } else {
      record = await this.prisma.userConsent.create({
        data: {
          userId: data.userId,
          purpose: data.purpose,
          granted: data.granted,
          grantedAt: data.granted ? now : null,
          revokedAt: !data.granted ? now : null,
          clientIp: data.clientIp,
          userAgent: data.userAgent,
        },
      });
    }

    return {
      id: record.id,
      userId: record.userId,
      purpose: record.purpose,
      granted: record.granted,
      grantedAt: record.grantedAt,
      revokedAt: record.revokedAt,
      clientIp: record.clientIp,
      userAgent: record.userAgent,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async listConsents(userId: string): Promise<UserConsentRecord[]> {
    const list = await this.prisma.userConsent.findMany({
      where: { userId },
      orderBy: { purpose: 'asc' },
    });

    return list.map((record) => ({
      id: record.id,
      userId: record.userId,
      purpose: record.purpose,
      granted: record.granted,
      grantedAt: record.grantedAt,
      revokedAt: record.revokedAt,
      clientIp: record.clientIp,
      userAgent: record.userAgent,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  async createRequest(data: {
    userId: string;
    type: string;
    details?: string | null;
    status?: string;
    responseNotes?: string | null;
  }): Promise<DataSubjectRequestRecord> {
    const isDeletionOrAnonymization = data.type === 'DELETION' || data.type === 'ANONYMIZATION';
    const finalStatus =
      data.status || (isDeletionOrAnonymization ? 'PENDING_LEGAL_RETENTION_REVIEW' : 'PENDING');
    const defaultRetentionNote =
      'Solicitação registrada formalmente sob a LGPD (Lei 13.709/2018). Dados cadastrais de contato e credenciais são passíveis de desativação/bloqueio; transações e registros de custódia patrimonial permanecem sob guarda legal obrigatória de 5 anos (Art. 16, I da LGPD c/c Art. 173 e 174 do Código Tributário Nacional).';
    const finalNotes =
      data.responseNotes || (isDeletionOrAnonymization ? defaultRetentionNote : null);

    const record = await this.prisma.dataSubjectRequest.create({
      data: {
        userId: data.userId,
        type: data.type,
        status: finalStatus,
        details: data.details,
        responseNotes: finalNotes,
      },
    });

    return {
      id: record.id,
      userId: record.userId,
      type: record.type,
      status: record.status,
      details: record.details,
      responseNotes: record.responseNotes,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async listRequests(userId: string): Promise<DataSubjectRequestRecord[]> {
    const list = await this.prisma.dataSubjectRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });

    return list.map((record) => ({
      id: record.id,
      userId: record.userId,
      type: record.type,
      status: record.status,
      details: record.details,
      responseNotes: record.responseNotes,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  async deactivateAccount(userId: string): Promise<{ deactivated: boolean; message: string }> {
    const now = new Date();

    // 1. Mark user deactivated
    await this.prisma.user.update({
      where: { id: userId },
      data: { deactivatedAt: now },
    });

    // 2. Revoke all active sessions
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    // 3. Register formal DataSubjectRequest without destructive cascade
    await this.createRequest({
      userId,
      type: 'DELETION',
      details: 'Desativação voluntária da conta pelo investidor via Privacy Center.',
      status: 'PENDING_LEGAL_RETENTION_REVIEW',
      responseNotes:
        'Conta desativada e todas as sessões revogadas com sucesso. Transações de custódia preservadas em custódia imutável conforme exigência fiscal (Art. 16, I da LGPD e legislação tributária federal).',
    });

    return {
      deactivated: true,
      message:
        'Conta desativada e sessões revogadas com sucesso. Registros fiscais mantidos conforme obrigação legal de retenção.',
    };
  }

  async exportUserData(userId: string): Promise<UserDataExport> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        locale: true,
        timezone: true,
        baseCurrency: true,
        emailVerifiedAt: true,
        deactivatedAt: true,
        createdAt: true,
        updatedAt: true,
        // STRICT INVARIANT: passwordHash is explicitly NOT selected
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // 1. Portfolios & Accounts
    const portfolios = await this.prisma.portfolio.findMany({
      where: { userId },
      include: {
        accounts: {
          include: {
            institution: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const portfolioIds = portfolios.map((p) => p.id);

    // 2. Transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        portfolioId: { in: portfolioIds },
      },
      include: {
        asset: {
          select: {
            ticker: true,
            name: true,
          },
        },
      },
      orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    // 3. Consents & Legal Acceptances
    const consents = await this.listConsents(userId);
    const legalAcceptances = await this.listAcceptances(userId);
    const dataSubjectRequests = await this.listRequests(userId);

    // 4. Watchlists
    const watchlists = await this.prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        asset: {
          select: {
            ticker: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      retentionNotice:
        'Este arquivo exporta dados cadastrais, preferências de privacidade e histórico contábil mantidos no Project Atlas. Dados confidenciais de segurança técnica (senhas, hashes de tokens e segredos criptográficos) são rigorosamente excluídos por segurança.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
        emailVerifiedAt: user.emailVerifiedAt,
        deactivatedAt: user.deactivatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      portfolios: portfolios.map((p) => ({
        id: p.id,
        name: p.name,
        baseCurrency: p.baseCurrency,
        createdAt: p.createdAt,
        accounts: p.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          institutionName: a.institution?.name,
          createdAt: a.createdAt,
        })),
      })),
      transactionLedger: transactions.map((t) => ({
        id: t.id,
        portfolioId: t.portfolioId,
        accountId: t.accountId,
        type: t.type,
        tradeDate: t.tradeDate.toISOString().slice(0, 10),
        settlementDate: t.settlementDate
          ? t.settlementDate.toISOString().slice(0, 10)
          : t.tradeDate.toISOString().slice(0, 10),
        quantity: t.quantity ? t.quantity.toString() : '0',
        unitPrice: t.unitPrice ? t.unitPrice.toString() : '0',
        totalAmount: t.amount ? t.amount.toString() : '0',
        currency: t.currency,
        ticker: t.asset?.ticker,
        assetName: t.asset?.name,
      })),
      consents,
      legalAcceptances,
      dataSubjectRequests,
      watchlists: watchlists.map((w) => ({
        assetId: w.assetId,
        ticker: w.asset?.ticker,
        name: w.asset?.name,
        createdAt: w.createdAt,
      })),
    };
  }
}
