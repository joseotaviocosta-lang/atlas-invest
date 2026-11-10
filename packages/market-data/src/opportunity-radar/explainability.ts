import { OpportunityAssetInput, OpportunityScoreComponents, OpportunityConfidence } from './types';

export interface ExplainabilitySynthesis {
  positives: string[];
  risks: string[];
}

/**
 * Pure deterministic explainability generator (APP-16F / APP-16G).
 *
 * Generates transparent, factual justifications for why an asset ranks favorably,
 * accompanied by critical risk factors and data warnings. Never hallucinates or invents data.
 */
export function generateExplainabilitySynthesis(
  input: OpportunityAssetInput,
  components: OpportunityScoreComponents,
  confidence: OpportunityConfidence,
  concentrationPenalty: number,
): ExplainabilitySynthesis {
  const positives: string[] = [];
  const risks: string[] = [];

  // --- Positives Synthesis (2 to 3 key drivers) ---

  // 1. Portfolio Fit driver
  if (components.portfolioFit >= 75) {
    if (input.portfolioWeight < 5.0) {
      positives.push(
        `Peso reduzido (${input.portfolioWeight.toFixed(1)}% da carteira) oferece ampla margem para novo aporte sem concentração`,
      );
    } else {
      positives.push(
        `Alocação atual (${input.portfolioWeight.toFixed(1)}%) equilibrada dentro da classe patrimonial`,
      );
    }
  }

  // 2. Valuation / Fundamentals driver
  if (input.assetType === 'STOCK') {
    if (components.valuation !== null && components.valuation >= 75) {
      if (input.priceEarnings && input.priceEarnings > 0 && input.priceEarnings <= 15) {
        positives.push(
          `Múltiplo P/L atrativo em ${input.priceEarnings.toFixed(1)}x com boa relação de valuation`,
        );
      } else if (input.dividendYield && input.dividendYield >= 6) {
        positives.push(
          `Dividend Yield consistente em ${input.dividendYield.toFixed(1)}% a.a.`,
        );
      } else {
        positives.push(`Múltiplos fundamentalistas atrativos frente à média de mercado`);
      }
    }
  } else {
    // FII
    if (components.valuation !== null && components.valuation >= 75) {
      const pvp = input.fiiPriceToBook ?? input.priceToBook;
      if (pvp && pvp <= 1.0) {
        positives.push(
          `Negociando com desconto sobre o valor patrimonial (P/VP ${pvp.toFixed(2)})`,
        );
      } else if (pvp && pvp > 1.0) {
        positives.push(
          `Cotação alinhada ao valor patrimonial (P/VP ${pvp.toFixed(2)})`,
        );
      }
    }
    // FII Dividend Calendar Driver (APP-16I) - high priority actionable catalyst
    if (input.dividendCalendar && input.dividendCalendar.eventStatus === 'ANNOUNCED') {
      if (input.dividendCalendar.eligibilityStatus === 'ELIGIBLE' && positives.length < 3) {
        const amtStr =
          input.dividendCalendar.amountPerShare !== null
            ? ` de R$ ${input.dividendCalendar.amountPerShare.toFixed(2)}/cota`
            : '';
        positives.push(`Data-com anunciada (${input.dividendCalendar.recordDate}) com rendimento${amtStr}`);
      } else if (input.dividendCalendar.eligibilityStatus === 'RECORD_DATE_TODAY' && positives.length < 3) {
        const amtStr =
          input.dividendCalendar.amountPerShare !== null
            ? ` (R$ ${input.dividendCalendar.amountPerShare.toFixed(2)}/cota)`
            : '';
        positives.push(`Último dia para garantir o rendimento anunciado${amtStr} (data-com hoje)`);
      }

      if (input.dividendCalendar.sameMonthReinvestmentCandidate && positives.length < 3) {
        positives.push(`Janela estratégica favorável para reinvestimento dos proventos recebidos no mês`);
      }
    }

    if (components.priceOpportunity !== null && components.priceOpportunity >= 75 && positives.length < 3) {
      const dy = input.fiiDividendYield ?? input.dividendYield;
      if (dy && dy >= 8) {
        positives.push(
          `Distribuição de renda atrativa com Dividend Yield de ${dy.toFixed(1)}%`,
        );
      }
    }
  }

  // 3. Momentum / Trend driver
  if (components.momentum !== null && components.momentum >= 70 && positives.length < 3) {
    if (input.change21dPercent && input.change21dPercent > 0) {
      positives.push(
        input.assetType === 'FII'
          ? `Tendência de cotação estável e recuperação recente (+${input.change21dPercent.toFixed(1)}% em 21 pregões)`
          : `Tendência de curto/médio prazo em recuperação (+${input.change21dPercent.toFixed(1)}% em 21 pregões)`,
      );
    } else {
      positives.push(
        input.assetType === 'FII'
          ? `Preço em região favorável com suporte técnico`
          : `Preço com suporte técnico favorável e consolidação de movimento`,
      );
    }
  }

  // 4. News driver
  if (components.news !== null && components.news >= 70 && positives.length < 3) {
    const positiveNews = input.recentNews?.filter((n) => n.sentiment === 'POSITIVE');
    if (positiveNews && positiveNews.length > 0) {
      positives.push(`Noticiário recente com fatos favoráveis e fluxo informativo positivo`);
    }
  }

  // Fallback positive if strictly needed to satisfy 2 items
  if (positives.length < 2) {
    positives.push(`Ativo elegível com liquidez e histórico de cotações ativo no mercado`);
  }

  // Ensure at most 3 positives
  const finalPositives = positives.slice(0, 3);

  // --- Risks Synthesis (1 to 3 critical risks) ---

  // 1. Concentration risk
  if (concentrationPenalty > 0 || input.portfolioWeight > 10.0) {
    risks.push(
      `Alocação de ${input.portfolioWeight.toFixed(1)}% exige cautela para não sobrecarregar a carteira`,
    );
  }

  // 2. Trend / Momentum risk
  if (components.momentum !== null && components.momentum < 50) {
    if (input.dailyChangePercent && input.dailyChangePercent < -3.0) {
      risks.push(`Oscilação negativa diária recente (${input.dailyChangePercent.toFixed(1)}%) sem confirmação de reversão`);
    } else {
      risks.push(`Momento de curto prazo pressionado e sem tendência altista definida`);
    }
  }

  // 3. News risk
  if (components.news !== null && components.news <= 40) {
    const negativeNews = input.recentNews?.filter((n) => n.sentiment === 'NEGATIVE');
    if (negativeNews && negativeNews.length > 0) {
      risks.push(`Presença de notícia recente com viés cauteloso ou negativo`);
    }
  }

  // 4. Confidence / Data Quality risk
  if (confidence === 'LOW' || confidence === 'INSUFFICIENT_DATA') {
    risks.push(`Cobertura limitada de dados fundamentalistas ou de mercado reduz a convicção`);
  }

  // 5. FII Ex-Dividend & Adjustment Risk (APP-16I)
  if (input.assetType === 'FII' && input.dividendCalendar?.eligibilityStatus === 'EX_DIVIDEND') {
    risks.push(`Ativo já em data-ex para este ciclo; aquisições hoje participam apenas do próximo anúncio`);
    risks.push(`Risco de ajuste de cotação em virtude do desconto da data-ex`);
  }

  // Fallback default risk
  if (risks.length === 0) {
    if (input.assetType === 'FII') {
      risks.push(`Exposição ao risco de vacância imobiliária e variações nas taxas de juros`);
    } else {
      risks.push(`Sensibilidade ao ciclo macroeconômico e volatilidade da renda variável`);
    }
  }

  const finalRisks = risks.slice(0, 3);

  return {
    positives: finalPositives,
    risks: finalRisks,
  };
}
