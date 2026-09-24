import { Inject, Injectable } from '@nestjs/common';
import { GetPortfolioIntelligenceSummaryUseCase } from '../performance/get-portfolio-intelligence-summary.use-case';
import { buildPortfolioAiGroundingContext, PortfolioAiGroundingContextV1 } from '@atlas/ai-engine';

/**
 * GetPortfolioAiGroundingContextUseCase (Phase 3Q, ADR-173–ADR-178)
 *
 * Transports the approved, deterministic Portfolio Intelligence Summary into
 * a versioned, bounded, immutable AI grounding context.
 *
 * Strict invariants:
 * - Exactly ONE call to GetPortfolioIntelligenceSummaryUseCase
 * - Zero recalculations of TWR, XIRR, benchmark differences, or risk formulas
 * - Zero additional provider/database calls
 * - Zero external model provider invocations
 * - Zero sensitive authentication data / PII / raw transactions
 * - Hidden 404 for unowned or missing portfolios
 */
@Injectable()
export class GetPortfolioAiGroundingContextUseCase {
  constructor(
    @Inject(GetPortfolioIntelligenceSummaryUseCase)
    private readonly getIntelligenceSummaryUseCase: GetPortfolioIntelligenceSummaryUseCase,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PortfolioAiGroundingContextV1> {
    const summary = await this.getIntelligenceSummaryUseCase.execute(params);
    return buildPortfolioAiGroundingContext(summary);
  }
}
