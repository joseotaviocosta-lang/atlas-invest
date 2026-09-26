# ADR-212: Prohibition of Financial Recalculation in AI Layer

## Status

Aceito (Fase 3W)

## Contexto

O `@atlas/ai-engine` é uma camada de explicação, orquestração e validação de claims, não um motor contábil ou fiscal. Permitir que o motor de IA realize cálculos financeiros introduziria drift aritmético e duplicidade de regras de negócio.

## Decisão

1. **Delta Zero em Algoritmos Financeiros:**
   - A Fase 3W introduz zero novos algoritmos de cálculo financeiro no sistema.
   - Todo cálculo de quantidade, preço médio, ganho realizado ou alocação pertence exclusivamente ao `@atlas/domain` e aos motores financeiros.
2. **Strings Decimais Literais:**
   - Fatos financeiros transportam valores numéricos exclusivamente em strings decimais exatas (`value: "30.123456"`), sem qualquer conversão para `number` ou float.
3. **Semântica de Indisponibilidade:**
   - Preço de mercado indisponível ou preço médio desconhecido são expressos estritamente como `value: null` acompanhado de `status: 'UNAVAILABLE'` e código de motivo (`UNKNOWN_COST_BASIS`, `PRICE_UNAVAILABLE`), jamais sendo convertidos para `"0"` ou `0`.

## Consequências

- Garantia de precisão monetária arbitrária e conformidade com as diretrizes do `AGENTS.md`.
- Impossibilidade de drift contábil na IA.
