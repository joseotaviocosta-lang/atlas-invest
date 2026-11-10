import { apiClient } from '../../lib/api';
import type {
  RawFiscalMonthlyState,
  RawMonthlyTaxLiability,
  RawTaxInputReadiness,
  RawAnnualPositionReport,
  RawAnnualCapitalMarketFiscalSummary,
  RawAnnualInvestmentIncomeSummary,
  RawAnnualTaxReportingPackage,
  CostEvidenceRowDto,
  CostAssessmentDto,
  CostEvidencePreviewDto,
  CostEvidenceCreatePayload,
  CostEvidenceRevisePayload,
  PortfolioAccountDto,
  IncomeIntelligenceDto,
} from './types';

export const fiscalApi = {
  async getMonthlyState(competence: string): Promise<RawFiscalMonthlyState> {
    const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
      `/api/v1/fiscal/monthly/${competence}`
    );
    return res.data;
  },

  async getFiscalMonthly(competence: string): Promise<RawFiscalMonthlyState> {
    return this.getMonthlyState(competence);
  },

  async getMonthlyLiability(competence: string): Promise<RawMonthlyTaxLiability> {
    const res = await apiClient.get<{ data: RawMonthlyTaxLiability }>(
      `/api/v1/fiscal/monthly/${competence}/liability`
    );
    return res.data;
  },

  async getMonthlyTaxLiability(competence: string): Promise<RawMonthlyTaxLiability> {
    return this.getMonthlyLiability(competence);
  },

  async getInputReadiness(competence: string): Promise<RawTaxInputReadiness> {
    const res = await apiClient.get<{ data: RawTaxInputReadiness }>(
      `/api/v1/fiscal/inputs/${competence}`
    );
    return res.data;
  },

  async getTaxInputReadiness(competence: string): Promise<RawTaxInputReadiness> {
    return this.getInputReadiness(competence);
  },

  async getAnnualPositions(calendarYear: number, portfolioId?: string): Promise<RawAnnualPositionReport> {
    const query = portfolioId ? `?portfolioId=${portfolioId}` : '';
    const res = await apiClient.get<{ data: RawAnnualPositionReport }>(
      `/api/v1/fiscal/annual/${calendarYear}/positions${query}`
    );
    return res.data;
  },

  async getAnnualCapitalMarket(calendarYear: number): Promise<RawAnnualCapitalMarketFiscalSummary> {
    const res = await apiClient.get<{ data: RawAnnualCapitalMarketFiscalSummary }>(
      `/api/v1/fiscal/annual/${calendarYear}/capital-market`
    );
    return res.data;
  },

  async getAnnualIncome(calendarYear: number): Promise<RawAnnualInvestmentIncomeSummary> {
    const res = await apiClient.get<{ data: RawAnnualInvestmentIncomeSummary }>(
      `/api/v1/fiscal/annual/${calendarYear}/income`
    );
    return res.data;
  },

  async getAnnualInvestmentIncome(calendarYear: number): Promise<RawAnnualInvestmentIncomeSummary> {
    return this.getAnnualIncome(calendarYear);
  },

  async getAnnualReporting(calendarYear: number): Promise<RawAnnualTaxReportingPackage> {
    const res = await apiClient.get<{ data: RawAnnualTaxReportingPackage }>(
      `/api/v1/fiscal/annual/${calendarYear}/reporting`
    );
    return res.data;
  },

  async getAnnualReportingPackage(calendarYear: number): Promise<RawAnnualTaxReportingPackage> {
    return this.getAnnualReporting(calendarYear);
  },

  async getComplianceTimeline(): Promise<unknown> {
    const res = await apiClient.get<{ data: unknown }>('/api/v1/fiscal/compliance');
    return res.data;
  },

  async getCostEvidence(
    portfolioId: string,
    query?: { accountId?: string; assetId?: string; statuses?: string }
  ): Promise<CostEvidenceRowDto[]> {
    const params = new URLSearchParams();
    if (query?.accountId) params.set('accountId', query.accountId);
    if (query?.assetId) params.set('assetId', query.assetId);
    if (query?.statuses) params.set('statuses', query.statuses);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<{ data: CostEvidenceRowDto[] }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence${queryString}`
    );
    return res.data ?? [];
  },

  async getCostAssessment(
    portfolioId: string,
    accountId: string,
    assetId: string
  ): Promise<CostAssessmentDto> {
    const res = await apiClient.get<{ data: CostAssessmentDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence/assessment?accountId=${accountId}&assetId=${assetId}`
    );
    return res.data;
  },

  async previewCostEvidence(
    portfolioId: string,
    payload: CostEvidenceCreatePayload
  ): Promise<CostEvidencePreviewDto> {
    const res = await apiClient.post<{ data: CostEvidencePreviewDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence/preview`,
      payload
    );
    return res.data;
  },

  async createCostEvidence(
    portfolioId: string,
    payload: CostEvidenceCreatePayload
  ): Promise<CostEvidenceRowDto> {
    const res = await apiClient.post<{ data: CostEvidenceRowDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence`,
      payload
    );
    return res.data;
  },

  async submitCostEvidence(
    portfolioId: string,
    evidenceId: string
  ): Promise<CostEvidenceRowDto> {
    const res = await apiClient.post<{ data: CostEvidenceRowDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence/${evidenceId}/submit`,
      {}
    );
    return res.data;
  },

  async verifyCostEvidence(
    portfolioId: string,
    evidenceId: string
  ): Promise<CostEvidenceRowDto> {
    const res = await apiClient.post<{ data: CostEvidenceRowDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence/${evidenceId}/verify`,
      {}
    );
    return res.data;
  },

  async rejectCostEvidence(
    portfolioId: string,
    evidenceId: string,
    reason: string
  ): Promise<CostEvidenceRowDto> {
    const res = await apiClient.post<{ data: CostEvidenceRowDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence/${evidenceId}/reject`,
      { reason }
    );
    return res.data;
  },

  async reviseCostEvidence(
    portfolioId: string,
    evidenceId: string,
    payload: CostEvidenceRevisePayload
  ): Promise<CostEvidenceRowDto> {
    const res = await apiClient.post<{ data: CostEvidenceRowDto }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence/${evidenceId}/revise`,
      payload
    );
    return res.data;
  },

  async listAccounts(portfolioId: string): Promise<PortfolioAccountDto[]> {
    const res = await apiClient.get<{ data: PortfolioAccountDto[] }>(
      `/api/v1/portfolios/${portfolioId}/accounts`
    );
    return res.data ?? [];
  },

  async getPortfolioIncome(
    portfolioId: string,
    startDate?: string,
    endDate?: string
  ): Promise<IncomeIntelligenceDto> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<{ data: IncomeIntelligenceDto }>(
      `/api/v1/portfolios/${portfolioId}/income-intelligence${queryString}`
    );
    return res.data;
  },

  async exportAnnualReportingCsv(calendarYear: number): Promise<string> {
    return apiClient.get<string>(`/api/v1/fiscal/annual/${calendarYear}/reporting/export`);
  },

  async getReportingExportCsv(calendarYear: number, _portfolioId?: string | null): Promise<string> {
    return this.exportAnnualReportingCsv(calendarYear);
  },
};

