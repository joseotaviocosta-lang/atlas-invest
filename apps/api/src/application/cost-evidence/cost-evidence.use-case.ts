import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  computeCostEvidenceFingerprint,
  validateCostEvidenceInput,
  type CostEvidenceStatus,
} from '@atlas/domain';
import {
  buildCostBasisAssessment,
  summarizeLedgerKnownLots,
  replayPortfolio,
  toVerifiedEvidenceLot,
} from '@atlas/portfolio-engine';
import {
  EntityNotFoundError,
  CrossPortfolioIntegrityError,
  type CostBasisEvidenceRow,
  type ICostBasisEvidenceRepository,
} from '@atlas/database';
import {
  COST_EVIDENCE_REPOSITORY,
  TRANSACTION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import type {
  ITransactionRepository,
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
} from '@atlas/database';

export interface CostEvidenceInput {
  accountId: string;
  assetId: string;
  evidenceType: string;
  quantityCovered: string;
  unitCost?: string;
  totalCost?: string;
  currency: string;
  acquisitionDate: string;
  evidenceDate?: string;
  sourceReference: string;
  notes?: string;
  status?: 'DRAFT' | 'REVIEW_REQUIRED';
}

async function loadScopedContext(
  repos: {
    portfolioRepository: IPortfolioRepository;
    accountRepository: IAccountRepository;
    assetRepository: IAssetRepository;
  },
  command: { portfolioId: string; accountId: string; assetId: string; userId?: string },
): Promise<void> {
  const portfolio = await repos.portfolioRepository.findById(command.portfolioId);
  if (!portfolio || (command.userId && portfolio.userId !== command.userId)) {
    throw new EntityNotFoundError('Portfolio', command.portfolioId);
  }
  const account = await repos.accountRepository.findById(command.accountId);
  if (!account) {
    throw new EntityNotFoundError('Account', command.accountId);
  }
  if (account.portfolioId !== command.portfolioId) {
    throw new CrossPortfolioIntegrityError(
      `Account '${command.accountId}' belongs to portfolio '${account.portfolioId}', not '${command.portfolioId}'`,
    );
  }
  const assets = await repos.assetRepository.findByIds([command.assetId]);
  if (!assets.some((asset) => String(asset.id) === command.assetId)) {
    throw new EntityNotFoundError('Asset', command.assetId);
  }
}

function fingerprintFor(portfolioId: string, validated: ReturnType<typeof validateCostEvidenceInput>): string {
  return computeCostEvidenceFingerprint({
    portfolioId,
    accountId: validated.accountId,
    assetId: validated.assetId,
    evidenceType: validated.evidenceType,
    acquisitionDate: validated.acquisitionDate.toString(),
    quantityCovered: validated.quantityCovered.value,
    unitCost: validated.unitCost?.amount,
    totalCost: validated.totalCost.amount,
    currency: validated.currency,
    sourceReference: validated.sourceReference,
    source: validated.sourceType,
  });
}

@Injectable()
export class CostEvidenceUseCase {
  constructor(
    @Inject(COST_EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: ICostBasisEvidenceRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  private repos() {
    return {
      portfolioRepository: this.portfolioRepository,
      accountRepository: this.accountRepository,
      assetRepository: this.assetRepository,
    };
  }

  async create(
    portfolioId: string,
    userId: string,
    input: CostEvidenceInput,
  ): Promise<{ outcome: 'CREATED' | 'DUPLICATE'; record: CostBasisEvidenceRow }> {
    await loadScopedContext(this.repos(), { ...input, portfolioId, userId });
    const { status: _ignored, ...evidenceFields } = input;
    void _ignored;
    const validated = validateCostEvidenceInput(
      { ...evidenceFields, portfolioId, sourceType: 'MANUAL_CONFIRMED' },
      { initialStatus: input.status ?? 'DRAFT' },
    );
    return this.evidenceRepository.create({
      portfolioId,
      accountId: validated.accountId,
      assetId: validated.assetId,
      evidenceType: validated.evidenceType,
      source: validated.sourceType,
      quantityCovered: validated.quantityCovered.value,
      unitCost: validated.unitCost?.amount ?? null,
      totalCost: validated.totalCost.amount,
      currency: validated.currency,
      acquisitionDate: validated.acquisitionDate.toString(),
      evidenceDate: validated.evidenceDate?.toString() ?? null,
      status: validated.status,
      sourceReference: validated.sourceReference,
      notes: validated.notes ?? null,
      fingerprint: fingerprintFor(portfolioId, validated),
    });
  }

  async list(
    portfolioId: string,
    userId: string,
    filter: { accountId?: string; assetId?: string; statuses?: CostEvidenceStatus[] },
  ): Promise<CostBasisEvidenceRow[]> {
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio || portfolio.userId !== userId) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    return this.evidenceRepository.listByScope({ portfolioId, ...filter });
  }

  /**
   * Fail-closed pre-check for verification: projects the candidate as
   * VERIFIED against live positions and refuses when coverage would exceed
   * the position. Runs before any write.
   */
  private async assertFitsPosition(
    portfolioId: string,
    row: CostBasisEvidenceRow,
  ): Promise<void> {
    const transactions = await this.transactionRepository.findByPortfolioId(portfolioId);
    const replayed = replayPortfolio({ portfolioId, transactions });
    const position = replayed.state.accounts.get(row.accountId)?.assets.get(row.assetId);
    if (!position || position.quantity.isZero()) {
      throw new ConflictException({
        message: 'Position has no open quantity; evidence cannot be verified against it.',
        code: 'COST_EVIDENCE.NO_OPEN_POSITION',
      });
    }
    const current = await this.evidenceRepository.listCurrentByScope({
      portfolioId,
      accountId: row.accountId,
      assetId: row.assetId,
    });
    const assessment = buildCostBasisAssessment({
      positionQuantity: position.quantity,
      ledgerLots: summarizeLedgerKnownLots(transactions, {
        assetId: row.assetId,
        accountId: row.accountId,
      }),
      evidence: [
        ...current.filter((r) => r.status === 'VERIFIED').map(toVerifiedEvidenceLot),
        toVerifiedEvidenceLot(row),
      ],
    });
    if (assessment.status === 'BLOCKED') {
      throw new ConflictException({
        message:
          'Verifying this evidence would over-cover the position. Correct or reject it instead.',
        code: 'COST_EVIDENCE_OVER_COVERAGE',
      });
    }
  }

  private async loadOwnedCurrent(
    portfolioId: string,
    userId: string,
    evidenceId: string,
  ): Promise<CostBasisEvidenceRow> {
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio || portfolio.userId !== userId) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    const row = await this.evidenceRepository.findById(evidenceId);
    if (!row || row.portfolioId !== portfolioId) {
      throw new EntityNotFoundError('CostBasisEvidence', evidenceId);
    }
    const current = await this.evidenceRepository.listCurrentByScope({ portfolioId });
    if (!current.some((r) => r.id === row.id)) {
      throw new ConflictException({
        message: 'Evidence was superseded by a newer revision.',
        code: 'COST_EVIDENCE.SUPERSEDED',
      });
    }
    return row;
  }

  async submit(
    portfolioId: string,
    userId: string,
    evidenceId: string,
  ): Promise<CostBasisEvidenceRow> {
    const row = await this.loadOwnedCurrent(portfolioId, userId, evidenceId);
    if (row.status !== 'DRAFT') {
      throw new ConflictException({
        message: `Only DRAFT evidence can be submitted (current: ${row.status}).`,
        code: 'COST_EVIDENCE.INVALID_TRANSITION',
      });
    }
    const { record } = await this.evidenceRepository.create({
      portfolioId: row.portfolioId,
      accountId: row.accountId,
      assetId: row.assetId,
      evidenceType: row.evidenceType,
      source: row.source,
      quantityCovered: row.quantityCovered,
      unitCost: row.unitCost,
      totalCost: row.totalCost,
      currency: row.currency,
      acquisitionDate: row.acquisitionDate,
      evidenceDate: row.evidenceDate,
      status: 'REVIEW_REQUIRED',
      sourceReference: row.sourceReference,
      notes: row.notes,
      supersedesId: row.id,
      fingerprint: row.fingerprint,
    });
    return record;
  }

  async verify(
    portfolioId: string,
    userId: string,
    evidenceId: string,
  ): Promise<CostBasisEvidenceRow> {
    const row = await this.loadOwnedCurrent(portfolioId, userId, evidenceId);
    if (row.status !== 'REVIEW_REQUIRED') {
      throw new ConflictException({
        message: `Only REVIEW_REQUIRED evidence can be verified (current: ${row.status}).`,
        code: 'COST_EVIDENCE.INVALID_TRANSITION',
      });
    }
    await this.assertFitsPosition(portfolioId, row);
    const { record } = await this.evidenceRepository.create({
      portfolioId: row.portfolioId,
      accountId: row.accountId,
      assetId: row.assetId,
      evidenceType: row.evidenceType,
      source: row.source,
      quantityCovered: row.quantityCovered,
      unitCost: row.unitCost,
      totalCost: row.totalCost,
      currency: row.currency,
      acquisitionDate: row.acquisitionDate,
      evidenceDate: row.evidenceDate,
      status: 'VERIFIED',
      sourceReference: row.sourceReference,
      notes: row.notes,
      supersedesId: row.id,
      fingerprint: row.fingerprint,
      confirmedBy: userId,
    });
    return record;
  }

  async reject(
    portfolioId: string,
    userId: string,
    evidenceId: string,
    reason: string,
  ): Promise<CostBasisEvidenceRow> {
    const trimmed = (reason ?? '').trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      throw new ConflictException({
        message: 'A rejection reason (1–500 characters) is required.',
        code: 'COST_EVIDENCE.REASON_REQUIRED',
      });
    }
    const row = await this.loadOwnedCurrent(portfolioId, userId, evidenceId);
    if (row.status !== 'REVIEW_REQUIRED' && row.status !== 'DRAFT') {
      throw new ConflictException({
        message: `Only DRAFT or REVIEW_REQUIRED evidence can be rejected (current: ${row.status}).`,
        code: 'COST_EVIDENCE.INVALID_TRANSITION',
      });
    }
    const { record } = await this.evidenceRepository.create({
      portfolioId: row.portfolioId,
      accountId: row.accountId,
      assetId: row.assetId,
      evidenceType: row.evidenceType,
      source: row.source,
      quantityCovered: row.quantityCovered,
      unitCost: row.unitCost,
      totalCost: row.totalCost,
      currency: row.currency,
      acquisitionDate: row.acquisitionDate,
      evidenceDate: row.evidenceDate,
      status: 'REJECTED',
      sourceReference: row.sourceReference,
      notes: row.notes,
      supersedesId: row.id,
      fingerprint: row.fingerprint,
      rejectedReason: trimmed,
    });
    return record;
  }

  async revise(
    portfolioId: string,
    userId: string,
    evidenceId: string,
    patch: Partial<CostEvidenceInput>,
  ): Promise<{ outcome: 'CREATED' | 'DUPLICATE'; record: CostBasisEvidenceRow }> {
    const row = await this.loadOwnedCurrent(portfolioId, userId, evidenceId);
    const merged: CostEvidenceInput = {
      accountId: patch.accountId ?? row.accountId,
      assetId: patch.assetId ?? row.assetId,
      evidenceType: patch.evidenceType ?? row.evidenceType,
      quantityCovered: patch.quantityCovered ?? row.quantityCovered,
      unitCost: patch.unitCost ?? row.unitCost ?? undefined,
      totalCost: patch.totalCost ?? row.totalCost ?? undefined,
      currency: patch.currency ?? row.currency,
      acquisitionDate: patch.acquisitionDate ?? row.acquisitionDate,
      evidenceDate: patch.evidenceDate ?? row.evidenceDate ?? undefined,
      sourceReference: patch.sourceReference ?? row.sourceReference,
      notes: patch.notes ?? row.notes ?? undefined,
    };
    // Re-scoped rows re-validate ownership against the merged scope.
    await loadScopedContext(this.repos(), {
      portfolioId,
      accountId: merged.accountId,
      assetId: merged.assetId,
      userId,
    });
    // Content edits always reset to review — verified status is never carried.
    const validated = validateCostEvidenceInput(
      { ...merged, portfolioId, sourceType: 'MANUAL_CONFIRMED' },
      { initialStatus: 'REVIEW_REQUIRED' },
    );
    return this.evidenceRepository.create({
      portfolioId,
      accountId: validated.accountId,
      assetId: validated.assetId,
      evidenceType: validated.evidenceType,
      source: validated.sourceType,
      quantityCovered: validated.quantityCovered.value,
      unitCost: validated.unitCost?.amount ?? null,
      totalCost: validated.totalCost.amount,
      currency: validated.currency,
      acquisitionDate: validated.acquisitionDate.toString(),
      evidenceDate: validated.evidenceDate?.toString() ?? null,
      status: validated.status,
      sourceReference: validated.sourceReference,
      notes: validated.notes ?? null,
      supersedesId: row.id,
      fingerprint: fingerprintFor(portfolioId, validated),
    });
  }
}
