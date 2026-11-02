import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError, getPrismaClient } from '@atlas/database';
import { TransactionRepository } from '@atlas/database';
import { CostBasisEvidenceRepository } from '@atlas/database';
import { AssetRepository } from '@atlas/database';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { summarizeDocumentaryCoverage } from '@atlas/tax-intelligence';
import { Quantity } from '@atlas/domain';
import { PRISMA_CLIENT } from '../../database/tokens';
import {
  NotificationDto,
  NotificationCategory,
  NotificationPriority,
  NotificationCenterResponseDto,
} from '@atlas/domain';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

export interface GetNotificationCenterFeedInput {
  readonly userId: string;
  readonly category?: NotificationCategory | null;
  readonly priority?: NotificationPriority | null;
  readonly portfolioId?: string | null;
  readonly limit?: number;
}

const PRIORITY_WEIGHTS: Record<NotificationPriority, number> = {
  URGENT: 4,
  ACTION_REQUIRED: 3,
  IMPORTANT: 2,
  INFO: 1,
};

function getCivilToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCivilDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class GetNotificationCenterFeedUseCase {
  constructor(
    @Inject(PRISMA_CLIENT)
    private readonly prisma: AtlasPrismaClient,
  ) {}

  async execute(input: GetNotificationCenterFeedInput): Promise<NotificationCenterResponseDto> {
    const todayCivil = getCivilToday();

    // 1. Resolve and validate user ownership of portfolios (anti-enumeration 404)
    const userPortfolios = await this.prisma.portfolio.findMany({
      where: { userId: input.userId },
      select: { id: true, name: true },
    });

    if (input.portfolioId) {
      const owned = userPortfolios.some((p) => p.id === input.portfolioId);
      if (!owned) {
        throw new EntityNotFoundError('Portfolio', input.portfolioId);
      }
    }

    const targetPortfolios = input.portfolioId
      ? userPortfolios.filter((p) => p.id === input.portfolioId)
      : userPortfolios;

    const targetPortfolioIds = targetPortfolios.map((p) => p.id);
    const portfolioNameMap = new Map<string, string>(
      userPortfolios.map((p) => [p.id, p.name]),
    );

    // 2. Fetch notifications across domains in parallel with partial failure isolation
    const results = await Promise.allSettled([
      this.fetchFiscalNotifications(input.userId, targetPortfolioIds, portfolioNameMap, todayCivil),
      this.fetchReviewNotifications(targetPortfolioIds, portfolioNameMap),
      this.fetchImportNotifications(targetPortfolioIds, portfolioNameMap),
      this.fetchRecoveryAndOperationalNotifications(),
      this.fetchContributionNotifications(targetPortfolioIds, portfolioNameMap, todayCivil),
      this.fetchCostBasisNotifications(targetPortfolioIds, portfolioNameMap, todayCivil),
    ]);

    const allNotifications: NotificationDto[] = [];
    for (const res of results) {
      if (res.status === 'fulfilled') {
        allNotifications.push(...res.value);
      }
    }

    // 3. Deduplicate by deterministic ID
    const dedupMap = new Map<string, NotificationDto>();
    for (const n of allNotifications) {
      if (!dedupMap.has(n.id)) {
        dedupMap.set(n.id, n);
      }
    }
    let notifications = Array.from(dedupMap.values());

    // 4. Filter by Category
    if (input.category) {
      notifications = notifications.filter((n) => n.category === input.category);
    }

    // 5. Filter by Priority
    if (input.priority) {
      notifications = notifications.filter((n) => n.priority === input.priority);
    }

    // 6. Deterministic ordering: Priority DESC -> dueAt ASC -> occurredAt DESC -> ID ASC
    notifications.sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority] ?? 1;
      const weightB = PRIORITY_WEIGHTS[b.priority] ?? 1;
      const weightDiff = weightB - weightA;
      if (weightDiff !== 0) return weightDiff;

      if (a.dueAt && b.dueAt) {
        const dueDiff = a.dueAt.localeCompare(b.dueAt);
        if (dueDiff !== 0) return dueDiff;
      } else if (a.dueAt && !b.dueAt) {
        return -1;
      } else if (!a.dueAt && b.dueAt) {
        return 1;
      }

      const dateDiff = b.occurredAt.localeCompare(a.occurredAt);
      if (dateDiff !== 0) return dateDiff;

      return a.id.localeCompare(b.id);
    });

    // 7. Calculate Meta before limiting
    const totalCount = notifications.length;
    const actionRequiredCount = notifications.filter(
      (n) => n.priority === 'URGENT' || n.priority === 'ACTION_REQUIRED',
    ).length;
    const urgentCount = notifications.filter((n) => n.priority === 'URGENT').length;
    const categoriesPresent = Array.from(
      new Set(notifications.map((n) => n.category)),
    );

    // 8. Apply limit
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const boundedNotifications = notifications.slice(0, limit);

    return {
      data: boundedNotifications,
      meta: {
        totalCount,
        actionRequiredCount,
        urgentCount,
        categories: categoriesPresent,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Fiscal notifications: DARF due dates, overdue obligations, and blocked period closes.
   */
  private async fetchFiscalNotifications(
    userId: string,
    portfolioIds: readonly string[],
    portfolioNameMap: Map<string, string>,
    todayCivil: string,
  ): Promise<NotificationDto[]> {
    const notifications: NotificationDto[] = [];

    // 1. Tax Obligations
    const obligations = await this.prisma.taxObligationRecord.findMany({
      where: {
        taxSubjectId: userId,
        status: { in: ['DRAFT', 'PENDING', 'MATERIALIZED'] },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });

    for (const obl of obligations) {
      const dueCivil = formatCivilDate(obl.dueDate);
      const isOverdue = dueCivil.length > 0 && dueCivil < todayCivil;
      const primaryPortfolioId = portfolioIds[0] ?? null;
      const portfolioName = primaryPortfolioId ? portfolioNameMap.get(primaryPortfolioId) : undefined;
      const revCode = obl.revenueCode ? ` (${obl.revenueCode})` : '';

      const priority: NotificationPriority = isOverdue ? 'URGENT' : 'ACTION_REQUIRED';
      const title = isOverdue
        ? `DARF em atraso${revCode}`
        : `DARF vence em breve${revCode}`;

      const amountFormatted = obl.principalAmount
        ? ` Valor devido: R$ ${obl.principalAmount.toString()}.`
        : '';

      const description = isOverdue
        ? `DARF de ${obl.competence} com vencimento em ${dueCivil} está pendente.${amountFormatted}`
        : `DARF de ${obl.competence} com vencimento em ${dueCivil}.${amountFormatted}`;

      notifications.push({
        id: `fiscal:obl:${obl.id}:${obl.status}`,
        category: 'FISCAL',
        priority,
        title,
        description,
        occurredAt: obl.createdAt.toISOString(),
        dueAt: dueCivil || null,
        portfolioId: primaryPortfolioId,
        portfolioName,
        actionHref: '/tax',
        actionLabel: 'Ver imposto',
        sourceContext: {
          origin: 'Tax Engine',
          entityType: 'TAX_OBLIGATION',
          entityId: obl.id,
        },
      });
    }

    // 2. Blocked compliance period closes
    const blockedCloses = await this.prisma.taxCompliancePeriodCloseRecord.findMany({
      where: {
        taxSubjectId: userId,
        recordStatus: 'ACTIVE',
        statusAtClose: 'BLOCKED',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const bc of blockedCloses) {
      notifications.push({
        id: `fiscal:blocked:${bc.id}`,
        category: 'FISCAL',
        priority: 'URGENT',
        title: `Período fiscal bloqueado: ${bc.period}`,
        description: `A apuração fiscal de ${bc.period} requer resolução de pendências antes da emissão do DARF.`,
        occurredAt: bc.createdAt.toISOString(),
        dueAt: null,
        portfolioId: portfolioIds[0] ?? null,
        portfolioName: portfolioIds[0] ? portfolioNameMap.get(portfolioIds[0]) : undefined,
        actionHref: '/tax',
        actionLabel: 'Ver fiscal',
        sourceContext: {
          origin: 'Tax Engine',
          entityType: 'TAX_COMPLIANCE_PERIOD_CLOSE',
          entityId: bc.id,
        },
      });
    }

    return notifications;
  }

  /**
   * Review notifications: Integration runs requiring human review.
   */
  private async fetchReviewNotifications(
    portfolioIds: readonly string[],
    portfolioNameMap: Map<string, string>,
  ): Promise<NotificationDto[]> {
    if (portfolioIds.length === 0) return [];

    const awaitingRuns = await this.prisma.integrationRun.findMany({
      where: {
        portfolioId: { in: [...portfolioIds] },
        status: 'AWAITING_REVIEW',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return awaitingRuns.map((run) => {
      const pName = portfolioNameMap.get(run.portfolioId) || 'Carteira';
      return {
        id: `review:${run.id}:AWAITING_REVIEW`,
        category: 'REVIEW',
        priority: 'ACTION_REQUIRED',
        title: `Revisão necessária: ${pName}`,
        description: `Importação ${run.source} concluída com pendências que necessitam da sua confirmação.`,
        occurredAt: run.createdAt.toISOString(),
        dueAt: null,
        portfolioId: run.portfolioId,
        portfolioName: pName,
        actionHref: `/reviews/${run.id}`,
        actionLabel: 'Revisar',
        sourceContext: {
          origin: 'Integration Review',
          entityType: 'INTEGRATION_RUN',
          entityId: run.id,
        },
      };
    });
  }

  /**
   * Import notifications: Failed or partial runs.
   */
  private async fetchImportNotifications(
    portfolioIds: readonly string[],
    portfolioNameMap: Map<string, string>,
  ): Promise<NotificationDto[]> {
    if (portfolioIds.length === 0) return [];

    const importRuns = await this.prisma.integrationRun.findMany({
      where: {
        portfolioId: { in: [...portfolioIds] },
        status: { in: ['FAILED', 'PARTIAL'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return importRuns.map((run) => {
      const pName = portfolioNameMap.get(run.portfolioId) || 'Carteira';
      const isFailed = run.status === 'FAILED';
      return {
        id: `import:${run.id}:${run.status}`,
        category: 'IMPORT',
        priority: 'IMPORTANT',
        title: isFailed ? `Falha na importação: ${pName}` : `Importação parcial: ${pName}`,
        description: `Execução ${run.source} ${isFailed ? 'não pôde ser concluída' : 'foi concluída com divergências'}.`,
        occurredAt: run.createdAt.toISOString(),
        dueAt: null,
        portfolioId: run.portfolioId,
        portfolioName: pName,
        actionHref: isFailed ? '/portfolio/import' : `/reviews/${run.id}`,
        actionLabel: isFailed ? 'Ver importação' : 'Ver detalhes',
        sourceContext: {
          origin: 'Import Engine',
          entityType: 'INTEGRATION_RUN',
          entityId: run.id,
        },
      };
    });
  }

  /**
   * Recovery and Operational Alert notifications: Active alerts and recovery flags.
   */
  private async fetchRecoveryAndOperationalNotifications(): Promise<NotificationDto[]> {
    const alerts = await this.prisma.operationalAlertEventRecord.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { lastDetectedAt: 'desc' },
      take: 10,
    });

    return alerts.map((alert) => {
      const isUrgent = alert.severity === 'ERROR';
      const isAction = alert.severity === 'WARNING';
      const priority: NotificationPriority = isUrgent
        ? 'URGENT'
        : isAction
          ? 'ACTION_REQUIRED'
          : 'IMPORTANT';

      return {
        id: `operational_alert:${alert.id}:${alert.status}`,
        category: 'RECOVERY',
        priority,
        title: `Atenção operacional: ${alert.alertType}`,
        description: `Diagnóstico: ${alert.reasonCode}. Ocorrências detectadas: ${alert.occurrenceCount}.`,
        occurredAt: alert.lastDetectedAt.toISOString(),
        dueAt: null,
        portfolioId: null,
        portfolioName: null,
        actionHref: '/portfolio/maintenance',
        actionLabel: 'Ver manutenção',
        sourceContext: {
          origin: alert.source || 'Operational Engine',
          entityType: 'OPERATIONAL_ALERT',
          entityId: alert.id,
        },
      };
    });
  }

  /**
   * Contribution Planning notifications.
   */
  private async fetchContributionNotifications(
    portfolioIds: readonly string[],
    portfolioNameMap: Map<string, string>,
    todayCivil: string,
  ): Promise<NotificationDto[]> {
    if (portfolioIds.length === 0) return [];

    // Check near month end (day >= 20)
    const day = parseInt(todayCivil.slice(8, 10), 10);
    if (day < 20) return [];

    const goals = await this.prisma.portfolioContributionGoal.findMany({
      where: {
        portfolioId: { in: [...portfolioIds] },
        effectiveTo: null,
      },
      take: 5,
    });

    const currentYearMonth = todayCivil.slice(0, 7);

    return goals.map((goal) => {
      const pName = portfolioNameMap.get(goal.portfolioId) || 'Carteira';
      return {
        id: `contribution:${goal.id}:${currentYearMonth}`,
        category: 'CONTRIBUTION',
        priority: 'INFO',
        title: `Acompanhamento de aportes: ${pName}`,
        description: `Meta de aporte ativa (R$ ${goal.amount.toString()} ${goal.currency}). Acompanhe os aportes antes do fim do mês.`,
        occurredAt: goal.createdAt.toISOString(),
        dueAt: null,
        portfolioId: goal.portfolioId,
        portfolioName: pName,
        actionHref: '/portfolio/cash-flow',
        actionLabel: 'Ver aportes',
        sourceContext: {
          origin: 'Contribution Plan',
          entityType: 'PORTFOLIO_CONTRIBUTION_GOAL',
          entityId: goal.id,
        },
      };
    });
  }

  /**
   * Cost-basis evidence reminders (fiscal reminder delivery, read-side only).
   *
   * Derived from live replay + VERIFIED evidence — never writes, never feeds
   * tax. Three item kinds, all deterministic ids (idempotent by construction,
   * auto-resolved when the source condition disappears):
   * - grouped DATA_QUALITY/IMPORTANT per portfolio over scopes whose
   *   documentary coverage is incomplete (KCRE11-style COMPLETE scopes are
   *   structurally excluded — the gate reads the assessment, never the
   *   canonical costBasisStatus);
   * - per-evidence DATA_QUALITY/ACTION_REQUIRED for current REVIEW_REQUIRED
   *   rows only (superseded revisions never listed → never emitted);
   * - grouped FISCAL/ACTION_REQUIRED when canonical cost is INCOMPLETE
   *   anywhere (tax stays fail-closed; data-quality wording, never a payment
   *   instruction, never an amount).
   */
  private async fetchCostBasisNotifications(
    portfolioIds: readonly string[],
    portfolioNameMap: Map<string, string>,
    todayCivil: string,
  ): Promise<NotificationDto[]> {
    if (portfolioIds.length === 0) return [];
    const txRepo = new TransactionRepository(this.prisma);
    const evRepo = new CostBasisEvidenceRepository(this.prisma);
    const assetRepo = new AssetRepository(this.prisma);
    const out: NotificationDto[] = [];

    for (const portfolioId of portfolioIds) {
      const pName = portfolioNameMap.get(portfolioId) || 'Carteira';
      const ledger = await txRepo.findByPortfolioId(portfolioId);
      if (ledger.length === 0) continue;
      const replayed = replayPortfolio({ portfolioId, transactions: ledger });
      const currentEvidence = await evRepo.listCurrentByScope({ portfolioId });
      // Single canonical aggregation (shared with CTI-1 context builder).
      const coverage = summarizeDocumentaryCoverage({
        transactions: ledger,
        replayState: replayed.state,
        evidenceRows: currentEvidence,
      });
      const uncoveredScopes = coverage.scopes.filter(
        (scope) => !Quantity.from(scope.uncoveredQuantity).isZero(),
      );
      const uncoveredAssetIds = uncoveredScopes.map((scope) => scope.assetId);
      const latestUncoveredDate = uncoveredScopes.reduce(
        (max, scope) => (scope.latestLotDate && scope.latestLotDate > max ? scope.latestLotDate : max),
        '',
      );
      const canonicalIncompleteCount = coverage.canonicalIncompleteScopes;
      const latestIncompleteDate = coverage.scopes.reduce(
        (max, scope) =>
          scope.canonicalIncomplete && scope.latestLotDate && scope.latestLotDate > max
            ? scope.latestLotDate
            : max,
        '',
      );
      const uncoveredTickers: string[] = [];

      // Batch ticker lookup for every asset referenced below (single query).
      const reviewRows = currentEvidence.filter((row) => row.status === 'REVIEW_REQUIRED');
      const tickerIds = Array.from(new Set([...uncoveredAssetIds, ...reviewRows.map((r) => r.assetId)]));
      const tickerById = new Map<string, string>();
      if (tickerIds.length > 0) {
        for (const asset of await assetRepo.findByIds(tickerIds)) {
          tickerById.set(String(asset.id), asset.ticker);
        }
      }
      for (const assetId of uncoveredAssetIds) {
        const ticker = tickerById.get(assetId);
        if (ticker && !uncoveredTickers.includes(ticker)) uncoveredTickers.push(ticker);
      }

      if (uncoveredAssetIds.length > 0) {
        const scopeCount = new Set(uncoveredAssetIds).size;
        const shown = uncoveredTickers.slice(0, 3).join(', ');
        out.push({
          id: `cost-basis:${portfolioId}:incomplete:v1`,
          category: 'DATA_QUALITY',
          priority: 'IMPORTANT',
          title: `Custo histórico incompleto em ${scopeCount} ${scopeCount === 1 ? 'posição' : 'posições'}`,
          description:
            `${scopeCount} ${scopeCount === 1 ? 'posição ainda tem' : 'posições ainda têm'} unidades sem custo histórico comprovado${shown ? ` (${shown}${uncoveredTickers.length > 3 ? ', …' : ''})` : ''}. ` +
            'Adicione evidências para melhorar a qualidade dos cálculos futuros.',
          occurredAt: `${latestUncoveredDate || todayCivil}T00:00:00.000Z`,
          dueAt: null,
          portfolioId,
          portfolioName: pName,
          actionHref: `/portfolio?portfolioId=${portfolioId}&tab=overview`,
          actionLabel: 'Revisar posições',
          sourceContext: {
            origin: 'Cost Evidence',
            entityType: 'COST_ASSESSMENT',
            entityId: portfolioId,
          },
        });
      }

      for (const row of reviewRows) {
        const ticker = tickerById.get(row.assetId) ?? 'posição';
        out.push({
          id: `cost-evidence:${row.id}:review-required`,
          category: 'DATA_QUALITY',
          priority: 'ACTION_REQUIRED',
          title: `Evidência aguardando confirmação: ${ticker}`,
          description: `${row.quantityCovered} unidades (${row.acquisitionDate}) aguardam sua confirmação para compor o custo histórico.`,
          occurredAt: row.createdAt.toISOString(),
          dueAt: null,
          portfolioId,
          portfolioName: pName,
          actionHref: `/portfolio/assets/${row.assetId}?portfolioId=${portfolioId}`,
          actionLabel: 'Revisar evidência',
          sourceContext: {
            origin: 'Cost Evidence',
            entityType: 'COST_BASIS_EVIDENCE',
            entityId: row.id,
          },
        });
      }

      if (canonicalIncompleteCount > 0) {
        const n = canonicalIncompleteCount;
        out.push({
          id: `tax-blocked:${portfolioId}:incomplete-cost:v1`,
          category: 'FISCAL',
          priority: 'ACTION_REQUIRED',
          title: 'Cálculo tributário bloqueado',
          description:
            `${n} ${n === 1 ? 'posição ainda tem' : 'posições ainda têm'} custo histórico incompleto para fins fiscais e o cálculo tributário permanece bloqueado. ` +
            'Verifique as pendências — nenhum imposto é calculado a partir de dados incompletos.',
          occurredAt: `${latestIncompleteDate || todayCivil}T00:00:00.000Z`,
          dueAt: null,
          portfolioId,
          portfolioName: pName,
          actionHref: '/tax#entenda',
          actionLabel: 'Ver pendências fiscais',
          sourceContext: {
            origin: 'Cost Evidence',
            entityType: 'TAX_BLOCKED_COST',
            entityId: portfolioId,
          },
        });
      }
    }

    return out;
  }
}
