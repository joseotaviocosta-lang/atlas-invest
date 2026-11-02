# Cost Evidence Tax Equivalence — Contrato de Produto e Desenho

Design contratado (ADR-312). Sem implementação: nenhum serviço, endpoint,
flag, UI ou migração nesta fase. Revogado somente por nova ADR.

## 1. Definição tax-grade

Evidência é tax-grade se e somente se: status VERIFIED corrente (não
superseded, não rejeitada) + `acquisitionDate` civil exata + moeda idêntica à
posição + quantidade sem sobreposição com lotes conhecidos + cobertura sem
excesso + proveniência completa (fingerprint, versão, tipo documental,
confirmador e hora). Qualquer item ausente ⇒ não contribui (fail-closed).

## 2. O que a evidência representa

Resposta (PART C): **C convertida em visão de lote fiscal** — a evidência
permanece afirmação documental sobre quantidade existente; a camada de
resolução a projeta como `TaxCostLot` somente-leitura para consumo fiscal.
Nenhuma transação é criada; nenhuma quantidade muda.

## 3. Matching e precedência

Chave: `(portfolio, conta, ativo, data, quantidade, moeda)` + custo na chave
de lote; sem ticker/fuzzy. Fixação primária em `TRANSFER_IN UNMATCHED_IN`.
Custo do livro sempre vence: redeclaração de lote conhecido ⇒ `REDUNDANT`
(excluído com aviso); segundo documento do mesmo lote ⇒ `DUPLICATE` (conta
uma vez); mesma quantidade com custo distinto ou faixas sobrepostas
incompatíveis ⇒ `CONFLICT` (BLOCKED); resubmissão idêntica ⇒ `IDEMPOTENT`;
cobertura além da posição ⇒ `OVER_COVERAGE` (BLOCKED). Multi-conta: escopos
isolados, sem linhagem automática na v1.

## 4. Cobertura parcial, total e datas

Parcial (ex.: 300/180/60/60): escopo segue INCOMPLETE; fisco bloqueado onde
exigir custo total; lotes conhecidos podem aparecer em diagnósticos não-finais.
Total (KCRE11 300/180/120/0): `COMPLETE_WITH_VERIFIED_EVIDENCE` na resolução;
ledger permanece INCOMPLETE. Data de aquisição é obrigatória e autoritativa
(data de documento ≠ data de aquisição; sem substituição). Moeda: igualdade
exata ou BLOCKED; sem FX.

## 5. Revisões, revogação e temporalidade

Só a versão corrente conta; `v4 REJECTED` ou supersessão remove a contribuição
imediatamente nas releituras. Evidência vale para alienações com `tradeDate >=
acquisitionDate` (venda anterior: sem suporte). Day-trade nunca consome
evidência (matching exige perna BUY intradiária). Entrada tardia retroage em
leituras; obrigações já materializadas usam supersessão/reconciliação
existentes — jamais reescrita silenciosa. Splits/bônus sobre quantidade
coberta: BLOCKED na v1 (`CORPORATE_ACTION_ADJUSTMENT_REQUIRED`).

## 6. Modelo de resolução (somente leitura, sem persistência, sem cache v1)

`TaxCostResolution { portfolioId, accountId, assetId, quantity,
ledgerKnownQuantity, evidenceKnownQuantity, uncoveredQuantity, currency,
resolvedCost, resolvedAverageCost, status, sources[], issues[] }` com
`COMPLETE_LEDGER_ONLY | COMPLETE_WITH_VERIFIED_EVIDENCE | PARTIAL | BLOCKED |
UNKNOWN`. Lotes: `TaxCostLot { sourceKind: LEDGER | VERIFIED_EVIDENCE,
sourceId (txId ou evidenceId+versão), quantidade, data, unitCost, totalCost,
moeda }`. Integração: enriquecimento do mapa canônico em `loadContext`
(Opção A estreita); B e C rejeitadas. Proveniência por `transactionId`
sidecar para o trace (`evidenceId/versão/fingerprint`, tipo, datas,
quantidade, custo, verificador/hora). UI futura distingue `Custo confirmado
pelo livro` de `Custo complementado por evidência verificada`.

## 7. KCRE11 dourado (projetado, não executado)

Ledger 80@8.45 + 96@7.99 + 4@7.98 (=1474.96) + evidência VERIFIED 120@8.50 de
26/12/2024 (=1020.00) ⇒ resolvido 300 / 2494.96 / média 2494.96÷300, status
`COMPLETE_WITH_VERIFIED_EVIDENCE`, ledger INTACTO em INCOMPLETE, zero mutação
fiscal nesta fase. Futuro: cálculos passam a consumir o custo resolvido
somente com gate + ativação.

## 8. Casos negativos (todos fail-closed)

Quantidade além do descoberto; sobreposição com lote exato; custos
conflitantes; VERIFIED superseded; corrente REJECTED; moeda divergente; data
ausente; venda anterior à aquisição; quantidade documental ≠ replay;
duplicata trans-documentos. Monotonicidade: PARTIAL→COMPLETE só com descoberto
zero; CONFLICT nunca COMPLETE; superseded sai da resolução.

## 9. Segurança, auditoria e gates

Ownership/escopo/404/autoridade VERIFIED/supersessão herdados das camadas
existentes; cliente nunca marca tax-grade (derivado servidor). Auditoria por
lote: fonte, versão, data, quantidade, custo, moeda, verificação. Gates:
`TAX_COST_EVIDENCE_ENRICHMENT_ENABLED=false` na resolução + ativação explícita
do Owner antes de qualquer impacto real. CTI/notifications futuros leem os
novos estados (`DOCUMENTARY_COMPLETE_TAX_ENABLED` etc.) sem código agora.

## 10. Matriz de testes da implementação (resumo)

KCRE11 total; parcial; redundante; duplicado; conflito; sobre-cobertura;
superseded; rejeitado; moeda; data ausente; temporal; multi-conta/ativo;
precedência do livro; proveniência no trace; sem mutação de ledger/quantidade;
10 negativos; monotonicidade; fallback; fidelidade decimal ("2494.96" verbatim);
gate default-off/on; revogação recomputa. Estágios CTE-1→CTE-4.

## 11. Baseline e dívida

Preservar: ledger 137, replay 109/109, 38/40, KCRE11 300/INCOMPLETE canônico,
blockers intactos, migrations 48. Dívida 47 registrada à parte
(`MIGRATION_HISTORY_HYGIENE_REQUIRED_BEFORE_PRODUCTION`). Testes automatizados
futuros usam fixtures sintéticas; evidência real KCRE11 jamais editada,
revisada, rejeitada ou copiada.
