import { apiClient } from '../../lib/api';
import type {
  RawFiscalMonthlyState,
  RawMonthlyTaxLiability,
  RawTaxInputReadiness,
  RawAnnualPositionReport,
  RawAnnualCapitalMarketFiscalSummary,
  RawAnnualInvestmentIncomeSummary,
  RawAnnualTaxReportingPackage,
  CostEvidenceDto,
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

  async getCostEvidence(portfolioId: string): Promise<CostEvidenceDto[]> {
    const res = await apiClient.get<{ data: CostEvidenceDto[] }>(
      `/api/v1/portfolios/${portfolioId}/cost-evidence`
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

