# ADR-301: IRPF Anual como Camada Derivada do Ledger + Estado Fiscal Mensal

## Status

Aceito — Fase 4H.1 (fundação arquitetural; sem cálculo anual implementado).

## Contexto

As Fases 4A–4G entregaram a tributação mensal de mercado de capitais
(renda variável e FII), com o ledger imutável como fonte da verdade, replay
determinístico e obrigação 6015 pronta. O IRPF anual permanece, por decisão
explícita, fora de escopo e não implementado.

Antes de qualquer implementação anual é necessário decidir onde o IRPF anual vive
e qual sua relação com as camadas existentes, para evitar duplicação de lógica
tributária (matching day trade, prejuízos, IRRF, 6015) e uma segunda fonte da
verdade de posições.

## Decisão

1. O IRPF anual é uma **camada derivada de leitura** sobre:
   - o ledger imutável de transações/eventos;
   - as posições/custos derivados pelo Portfolio Engine;
   - o estado fiscal mensal (4A–4G), incluindo a composição 6015.

2. O IRPF anual **não** recalcula: classificação normal/day-trade, buckets de
   prejuízo, IRRF mensal, isenção mensal ou composição 6015. Ele referencia e
   agrega fatos mensais já apurados.

3. O IRPF anual **não** persiste posições editáveis como segunda fonte da
   verdade. O estado anual é reproduzível por replay determinístico
   (ledger + estado fiscal + inputs anuais confirmados).

4. Conceitos temporais distintos e tipados: `CalendarYear`,
   `DeclarationExercise`, `AnnualTaxPeriod`. Regras são year-aware
   (`effectiveFrom`/`effectiveTo`), sem "regra tributária atual" global.

5. Desconhecido nunca é zero; estados `zero` / `unknown` / `not_applicable` /
   `missing` são distintos. Resultado anual incompleto falha fechado
   (`COMPLETE` / `PARTIAL` / `BLOCKED` / `REQUIRES_CONFIRMATION`).

6. Submissão à Receita, automação, captcha e certificados permanecem fora de
   escopo. Tax AI permanece desabilitado (`UNSUPPORTED_TAX`).

## Consequências

- Uma única fonte da verdade (ledger) para posições e custos, inclusive no
  ano-calendário.
- Nenhuma duplicação de lógica fiscal mensal na camada anual.
- Dados insuficientes (custo desconhecido, histórico pré-Atlas, evento
  corporativo ausente) bloqueiam o resultado anual em vez de fabricar valores.
- Dependência de dados externos/confirmados para rendimentos (dividendos, JCP,
  FII) e para a tributação mínima de alta renda.

## Alternativas rejeitadas

- **Segundo motor anual de transações/posições**: duplicaria o Portfolio Engine e
  divergiria do ledger.
- **Persistir posições anuais editáveis como verdade**: criaria segunda fonte da
  verdade e risco de inconsistência histórica.
- **Recalcular imposto mensal no anual**: violaria a autoridade única de 4A–4G.
- **Congelar mapeamento de fichas/campos da DIRPF agora**: códigos/identificadores
  ainda PARTIAL (ver pesquisa legal); congelar seria prematuro.
