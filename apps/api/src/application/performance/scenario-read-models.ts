import { ScenarioDefinition } from '@atlas/scenario-engine';

export interface ScenarioComponentReadModel {
  componentType: string;
  status: string;
  baseValue: string | null;
  stressedValue: string | null;
  absoluteImpact: string | null;
  percentageImpact: string | null;
  reason: string | null;
}

export interface ScenarioCurrencyReadModel {
  currency: string;
  status: string;
  baseValue: string | null;
  stressedValue: string | null;
  absoluteImpact: string | null;
  percentageImpact: string | null;
  positionCount: number;
  valuedPositionCount: number;
  unvaluedPositionCount: number;
  components: ScenarioComponentReadModel[];
}

export interface PortfolioScenarioReadModel {
  portfolioId: string;
  asOf: string;
  scenario: ScenarioDefinition;
  currencies: Record<string, ScenarioCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
