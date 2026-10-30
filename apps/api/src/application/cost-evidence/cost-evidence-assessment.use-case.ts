import { Inject, Injectable } from '@nestjs/common';
import {
  validateCostEvidenceInput,
} from '@atlas/domain';
import {
  buildCostBasisAssessment,
  summarizeLedgerKnownLots,
  replayPortfolio,
  toVerifiedEvidenceLot,
  type VerifiedEvidenceLot,
  type CostBasisAssessment,
} from '@atlas/portfolio-engine';
import {
  EntityNotFoundError,
  CrossPortfolioIntegrityError,
  type ICostBasisEvidenceRepository,
} from '@atlas/database';
import type {
  ITransactionRepository,
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
} from '@atlas/database';
import {
  COST_EVIDENCE_REPOSITORY,
  TRANSACTION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';

export interface CostAssessmentPreviewInput {
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
}

export interface CostAssessmentPreview {
  status: CostBasisAssessment['status'];
  positionQuantity: string;
  ledgerKnownQuantity: string;
  evidenceCoveredQuantity: string;
  totalCoveredQuantity: string;
  uncoveredQuantity: string;
  coveragePercent: string;
  verifiedKnownCost: Array<{ amount: string; currency: string }>;
  averageKnownCostForCoveredQuantity: { amount: string; currency: string } | null;
  alreadyCoveredWarning: string | null;
  issues: Array<{ code: string; message: string }>;
}

@Injectable()
export class CostEvidenceAssessmentUseCase {
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

  private async loadScope(
    portfolioId: string,
    userId: string,
    accountId: string,
    assetId: string,
  ) {
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio || portfolio.userId !== userId) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new EntityNotFoundError('Account', accountId);
    }
    if (account.portfolioId !== portfolioId) {
      throw new CrossPortfolioIntegrityError(
        `Account '${accountId}' belongs to portfolio '${account.portfolioId}', not '${portfolioId}'`,
      );
    }
    const assets = await this.assetRepository.findByIds([assetId]);
    if (!assets.some((asset) => String(asset.id) === assetId)) {
      throw new EntityNotFoundError('Asset', assetId);
    }
    const transactions = await this.transactionRepository.findByPortfolioId(portfolioId);
    const replayed = replayPortfolio({ portfolioId, transactions });
    const accountState = replayed.state.accounts.get(accountId);
    const position = accountState?.assets.get(assetId);
    if (!position || position.quantity.isZero()) {
      throw new EntityNotFoundError('Position', `${accountId}/${assetId}`);
    }
    return { transactions, position };
  }

  /**
   * Read-side assessment over persisted VERIFIED evidence. Never writes,
   * never touches the ledger, never feeds tax.
   */
  async assess(
    portfolioId: string,
    userId: string,
    accountId: string,
    assetId: string,
  ): Promise<CostBasisAssessment> {
    const { transactions, position } = await this.loadScope(portfolioId, userId, accountId, assetId);
    const rows = await this.evidenceRepository.listCurrentByScope({
      portfolioId,
      accountId,
      assetId,
    });
    const verified = rows.filter((row) => row.status === 'VERIFIED').map(toVerifiedEvidenceLot);
    return buildCostBasisAssessment({
      positionQuantity: position.quantity,
      ledgerLots: summarizeLedgerKnownLots(transactions, { assetId, accountId }),
      evidence: verified,
    });
  }

  /**
   * Ephemeral projection of a hypothetical draft as if VERIFIED, layered
   * over already-verified evidence. Nothing is persisted.
   */
  async preview(
    portfolioId: string,
    userId: string,
    input: CostAssessmentPreviewInput,
  ): Promise<CostAssessmentPreview & { hypotheticalCoveredQuantity: string }> {
    const { transactions, position } = await this.loadScope(
      portfolioId,
      userId,
      input.accountId,
      input.assetId,
    );
    const validated = validateCostEvidenceInput({
      portfolioId,
      accountId: input.accountId,
      assetId: input.assetId,
      evidenceType: input.evidenceType,
      sourceType: 'MANUAL_CONFIRMED',
      quantityCovered: input.quantityCovered,
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      currency: input.currency,
      acquisitionDate: input.acquisitionDate,
      evidenceDate: input.evidenceDate,
      sourceReference: input.sourceReference,
      notes: input.notes,
    });
    const rows = await this.evidenceRepository.listCurrentByScope({
      portfolioId,
      accountId: input.accountId,
      assetId: input.assetId,
    });
    const hypothetical: VerifiedEvidenceLot = {
      evidenceId: 'preview-hypothetical',
      assetId: validated.assetId,
      accountId: validated.accountId,
      acquisitionDate: validated.acquisitionDate.toString(),
      quantityCovered: validated.quantityCovered,
      unitCost: validated.unitCost,
      totalCost: validated.totalCost,
      currency: validated.currency,
      evidenceType: validated.evidenceType,
      sourceReference: validated.sourceReference,
      createdAt: new Date(8640000000000000),
    };
    const assessment = buildCostBasisAssessment({
      positionQuantity: position.quantity,
      ledgerLots: summarizeLedgerKnownLots(transactions, {
        assetId: input.assetId,
        accountId: input.accountId,
      }),
      evidence: [...rows.filter((row) => row.status === 'VERIFIED').map(toVerifiedEvidenceLot), hypothetical],
    });
    return {
      ...assessment,
      hypotheticalCoveredQuantity: validated.quantityCovered.value,
      alreadyCoveredWarning:
        assessment.redundantEvidenceIds.includes('preview-hypothetical') ||
        assessment.duplicateEvidenceIds.includes('preview-hypothetical')
          ? 'This evidence restates already-covered cost and would not add coverage.'
          : null,
    };
  }
}
