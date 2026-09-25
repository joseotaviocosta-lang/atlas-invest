# ADR-195: Numeric Integrity and Display Formatting

## Status

Approved (Fase 3T)

## Contexto

O Project Atlas adota estrita precisão decimal e regras de formatação brasileiras (pt-BR). A exibição de valores nas respostas de IA precisa respeitar as especificidades de cada tipo semântico de métrica (moeda, percentual, pontos percentuais, múltiplos/ratios e contagens), sem introduzir cálculos de ponto flutuante IEEE 754.

## Decisão

1. A formatação de valores para renderização de afirmações (`formatFactValueForDisplay` e `formatFactLabelForDisplay`) é executada nativamente em `@atlas/ai-engine` através de manipulações estritas de strings decimais canônicas, sem uso de `number`, `parseFloat` ou ponto flutuante.
2. Cada tipo de métrica possui regras de apresentação imutáveis:
   - `MONEY`: prefixado com o código da moeda canônica correspondente (ex: `R$ 10.000,00` ou `US$ 1.500,00`).
   - `PERCENTAGE`: sufixado com `%` e vírgula decimal (ex: `12,50%`, `-3,40%`).
   - `PERCENTAGE_POINTS`: sufixado com `p.p.` e sinal explícito para valores não-negativos quando aplicável (ex: `+2,50 p.p.`, `-1,20 p.p.`).
   - `RATIO`: número puro sem unidade ou `%` (ex: `1,45`).
   - `COUNT`: inteiro formatado sem casas decimais (ex: `15`).
   - Fatos nulos ou indisponíveis (`isAvailable: false`): renderizados como travessão (`—`).
3. É expressamente proibida a presença de percentuais ou valores monetários literais embutidos em segmentos do tipo `TEXT`. Qualquer número financeiro deve obrigatoriamente ser expressado através de um segmento `FACT_VALUE`.

## Consequências

- Padronização rigorosa da apresentação numérica em todo o ecossistema de IA.
- Prevenção contra a injeção ou mascaramento de números não-auditados pelo modelo no texto da resposta.
