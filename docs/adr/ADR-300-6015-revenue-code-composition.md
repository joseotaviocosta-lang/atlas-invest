# ADR-300: Composição por Código de Receita 6015 (FII + Operações Comuns + Day Trade)

## Status

Aceito — Fase 4G.2C.

## Contexto

A Fase 4G.2B produziu o imposto líquido de categoria para renda variável
(`netTaxBefore6015Aggregation`): operações comuns (15%, IRRF 0,005%) e day trade
(20%, IRRF 1%), com pools de IRRF e prejuízos isolados por categoria (ADR-296,
ADR-297, ADR-298). A Fase 4B/4B.5 já produzia o imposto líquido de FII sob a
regra verificada `BR-FII-SALE-20-2015`, resolvido para o bucket `FII_SALE` e o
código de receita `6015`.

O pagamento federal, entretanto, é exigido **por código de receita**: FII,
operações comuns e day trade compartilham o código `6015`. Era necessário
compor as três categorias em uma única obrigação mensal sem duplicar os motores
já aprovados de mínimo DARF (4E), vencimento (4C), atraso (4D) e DARF/Sicalc
(4F).

## Decisão

1. Introduzir um compositor puro em `@atlas/tax-engine` (`compose6015`) que soma
   os impostos líquidos de categoria (FII, `EQUITY_NORMAL`, `EQUITY_DAY_TRADE`)
   em um único total mensal `6015`, preservando a trilha por categoria.
2. A composição é um **input** do motor de obrigação existente
   (`materializeTaxObligation`); quando presente, substitui `liability.taxDue`
   como valor pagável e mantém a resolução de bucket/vencimento já existente.
3. Fronteira de falha fechada: componente `BLOCKED`/`PARTIAL`, valor negativo,
   moeda divergente ou atividade fora do conjunto composto bloqueiam a
   composição; nunca se apresenta um total parcial como final.
4. A regra de mínimo DARF e o carry-forward (4E) continuam aplicando-se **após**
   a agregação por código de receita, sobre o total mensal.
5. A composição ativa o pipeline DARF/Sicalc existente (4F); nenhum segundo motor
   de DARF é criado.
6. O `fingerprint` de composição integra o `fingerprint` da obrigação, de modo
   que mudanças em qualquer categoria de origem mudam deterministicamente a
   identidade/`revision` da obrigação.

## Consequências

- Uma obrigação por `taxSubjectId` + `competence` + `6015`.
- Rastreabilidade por categoria preservada no read model (composição e
  `provenance`).
- Web/Mobile apenas renderizam; nunca agregam.
- Sem novas migrações de schema (a composição é persistida em `provenance`).
- FII passa a coexistir com a renda variável na mesma obrigação pela primeira
  vez.
- Nenhum teste existente precisou ser alterado: a fixture 4E de bucket "não
  suportado" já usava um ativo de categoria desconhecida. Um defeito de
  composição (categoria FII materializada apenas a partir de saldo de prejuízo
  inicial zero, com status `PARTIAL`, bloqueando indevidamente a composição) foi
  corrigido no mapeamento da composição.

## Alternativas rejeitadas

- Uma obrigação por categoria: violaria a regra de pagamento por código de
  receita e criaria DARFs paralelos.
- Recalcular imposto no compositor: duplicaria 4G.2B e violaria a autoridade
  única do `@atlas/tax-engine`.
- Estender `MonthlyTaxLiability` com categorias `EQUITY_*` (que não são
  `TaxAssetCategory`): quebraria a resolução de bucket e a tipagem congelada.
