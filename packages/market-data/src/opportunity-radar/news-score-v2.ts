import { PortfolioNewsEvent } from './portfolio-news.types';

export interface NewsScoreV2Result {
  score: number | null; // null if UNKNOWN / no news, never default 50
  confidenceMultiplier: number; // 0.0 to 1.0
  effectiveEvents: PortfolioNewsEvent[]; // <= 30d (or up to 5 events influencing score)
  contextEvents: PortfolioNewsEvent[];   // 31-90d (context only)
  explainability: string;
}

/**
 * Project Atlas — News Scorer V2 (APP-16J)
 *
 * Deterministic scoring based on:
 * impactWeight = freshnessDecay * (importance / 5) * (assetRelevance === 'PRIMARY' ? 1.0 : 0.6) * (official ? 1.2 : 1.0)
 *
 * Invariants:
 * 1. If NO news or all news expired (> 90 days), returns score: null (never 50!).
 * 2. Neutral sentiment returns 50 ONLY when there are verified, fresh news items.
 * 3. Differentiates low-importance noise from high-importance official events.
 * 4. Events in 31–90 days window provide background context without driving score.
 */
export function calculateNewsScoreV2(
  events: PortfolioNewsEvent[] | undefined,
  ticker: string,
  _referenceDate: Date = new Date(),
): NewsScoreV2Result {
  if (!events || events.length === 0) {
    return {
      score: null,
      confidenceMultiplier: 0.0,
      effectiveEvents: [],
      contextEvents: [],
      explainability: 'Sem notícias recentes na janela de análise.',
    };
  }

  const tick = ticker.toUpperCase();

  // Filter events relevant to this ticker
  const relevantEvents = events.filter(e =>
    e.primaryTickers.includes(tick) || e.secondaryTickers.includes(tick) || e.assets.includes(tick),
  );

  if (relevantEvents.length === 0) {
    return {
      score: null,
      confidenceMultiplier: 0.0,
      effectiveEvents: [],
      contextEvents: [],
      explainability: 'Sem notícias recentes na janela de análise.',
    };
  }

  // Split into scoring window (<= 30 days) and context window (31-90 days)
  const effectiveEvents: PortfolioNewsEvent[] = [];
  const contextEvents: PortfolioNewsEvent[] = [];

  for (const ev of relevantEvents) {
    if (ev.freshness === 'EXPIRED' || ev.decayWeight <= 0) {
      continue;
    }
    if (ev.freshness === 'CONTEXT') {
      contextEvents.push(ev);
    } else {
      effectiveEvents.push(ev);
    }
  }

  // If no effective news in the primary <= 30d window, check if context exists
  if (effectiveEvents.length === 0) {
    return {
      score: null,
      confidenceMultiplier: contextEvents.length > 0 ? 0.2 : 0.0,
      effectiveEvents: [],
      contextEvents,
      explainability: contextEvents.length > 0
        ? 'Notícias anteriores (31–90 dias) mantidas apenas para contexto histórico.'
        : 'Sem notícias recentes na janela de análise.',
    };
  }

  // Calculate weighted impact score across effective events
  let totalWeight = 0;
  let weightedSentimentSum = 0;
  let maxImportance = 1;
  let hasMaterialOfficial = false;
  let dominantEvent: PortfolioNewsEvent = effectiveEvents[0]!;

  for (const ev of effectiveEvents) {
    const isPrimary = ev.primaryTickers.includes(tick);
    const relevanceMultiplier = isPrimary ? 1.0 : 0.6;
    // Routine filings do not get the official multiplier bonus (APP-16L Parte I)
    const isRoutine = ev.materiality === 'ROUTINE';
    const officialMultiplier = ev.official && !isRoutine ? 1.2 : 1.0;
    const importanceRatio = Math.max(1, ev.importance) / 5;

    const eventWeight = ev.decayWeight * importanceRatio * relevanceMultiplier * officialMultiplier;

    let sentimentVal = 0;
    if (ev.sentiment === 'POSITIVE') {
      sentimentVal = ev.sentimentScore > 0 ? ev.sentimentScore : 0.8;
    } else if (ev.sentiment === 'NEGATIVE') {
      sentimentVal = ev.sentimentScore < 0 ? ev.sentimentScore : -0.8;
    } else {
      sentimentVal = 0.0;
    }

    weightedSentimentSum += sentimentVal * eventWeight;
    totalWeight += eventWeight;

    if (ev.importance > maxImportance) {
      maxImportance = ev.importance;
      dominantEvent = ev;
    }
    // Only non-routine official events grant the official confidence bonus
    if (ev.official && !isRoutine) {
      hasMaterialOfficial = true;
    }
  }

  if (totalWeight <= 0) {
    return {
      score: null,
      confidenceMultiplier: 0.0,
      effectiveEvents,
      contextEvents,
      explainability: 'Notícias sem peso de relevância suficiente para pontuação.',
    };
  }

  // Normalized sentiment in [-1.0 .. 1.0]
  const normalizedSentiment = weightedSentimentSum / totalWeight;

  // Score mapping: base 50, scaled by total impact confidence
  // If neutral (0), result is 50. If strongly positive (+1), result is ~85-90. If strongly negative (-1), ~15-20.
  const rawScore = 50 + normalizedSentiment * 35;
  const clampedScore = Math.max(15, Math.min(95, Math.round(rawScore)));

  // Explainability generation
  let explainability = '';
  if (clampedScore > 65) {
    if (dominantEvent.official && dominantEvent.eventType === 'FACT_RELEVANT') {
      explainability = `Fato relevante recente e favorável (${dominantEvent.headline.slice(0, 70)}).`;
    } else if (dominantEvent.eventType === 'FACT_RELEVANT') {
      explainability = `Notícia sobre fato relevante divulgada na imprensa (${dominantEvent.headline.slice(0, 70)}).`;
    } else if (dominantEvent.eventType === 'EARNINGS') {
      explainability = `Divulgação recente de resultados com perspectiva favorável.`;
    } else if (dominantEvent.eventType === 'DIVIDEND') {
      explainability = `Anúncio recente de distribuição de proventos.`;
    } else {
      explainability = `Notícias recentes com repercussão positiva no mercado.`;
    }
  } else if (clampedScore < 35) {
    if (dominantEvent.official) {
      explainability = `Fato relevante oficial ou comunicado com impacto cautelar no curto prazo.`;
    } else if (dominantEvent.eventType === 'FACT_RELEVANT') {
      explainability = `Notícia sobre fato relevante na imprensa com viés de cautela no curto prazo.`;
    } else if (dominantEvent.importance >= 4) {
      explainability = `Notícia recente de alta importância com viés negativo (${dominantEvent.headline.slice(0, 70)}).`;
    } else {
      explainability = `Noticiário recente com pressão pontual sobre a cotação.`;
    }
  } else {
    explainability = hasMaterialOfficial
      ? `Comunicações oficiais recentes com impacto balanceado na avaliação.`
      : `Notícias recentes com tom predominantemente neutro ou equilibrado.`;
  }

  // Confidence multiplier: based on number of events and max importance
  // Routine paperwork does NOT grant the official bonus (APP-16L)
  const countBonus = Math.min(0.4, effectiveEvents.length * 0.1);
  const importanceBonus = (maxImportance / 5) * 0.4;
  const officialBonus = hasMaterialOfficial ? 0.2 : 0.0;
  const confidenceMultiplier = Math.min(1.0, 0.4 + countBonus + importanceBonus + officialBonus);

  return {
    score: clampedScore,
    confidenceMultiplier,
    effectiveEvents: effectiveEvents.slice(0, 5),
    contextEvents: contextEvents.slice(0, 5),
    explainability,
  };
}
