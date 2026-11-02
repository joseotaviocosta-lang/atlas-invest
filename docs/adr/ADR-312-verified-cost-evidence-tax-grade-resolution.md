# ADR-312: Verified Cost Evidence as a Tax-Grade Read-Side Cost Resolution Layer

## Contexto

O replay (`portfolio-engine`, média móvel, sem lotes) marca posições com custo
desconhecido como `INCOMPLETE` (nunca zero) e emite `RealizedDisposal`
incompleto. O fiscal mensal (`get-monthly-tax-liability.use-case.ts`,
`loadContext`) constrói `canonicalRealizedByTransactionId` a partir desses
disposals; ambos os caminhos (FII via `projection.ts`, equity via
`equity-monthly-fiscal-replay.service.ts`) falham fechado sem custo
(`UNKNOWN_COST_BASIS` / `MISSING_CANONICAL_COST_BASIS`). Evidência VERIFIED
cobre hoje 100% da quantidade KCRE11 no read-side, mas nenhum caminho fiscal
a consome (grep confirma zero imports). Resultado: 36/41 posições reais
travam DARF/IRPF apesar de custo documentalmente comprovável.

## Decisão

1. Camada de resolução `TaxCostResolution` (pura, derivada, sem persistência)
   entre replay e consumo fiscal: lotes de custo exato do ledger +
   lotes de evidência tax-grade → custo resolvido por escopo
   (conta, ativo), com status `COMPLETE_LEDGER_ONLY` /
   `COMPLETE_WITH_VERIFIED_EVIDENCE` / `PARTIAL` / `BLOCKED` / `UNKNOWN`.
2. Definição tax-grade: evidência VERIFIED + corrente (não superseded/
   rejeitada) + data de aquisição `LocalDate` exata + mesma moeda da posição
   + sem sobreposição + sem sobre-cobertura + proveniência completa
   (fingerprint, versão, autor/hora de confirmação). Tudo verificável
   mecanicamente; nada discricionário.
3. Matching determinístico por
   `(portfolio, conta, ativo, data, quantidade, moeda)` (+ custo na chave de
   lote); sem ticker, sem fuzzy. Ponto de fixação primário: pernas
   `TRANSFER_IN` desemparelhadas (`UNMATCHED_IN`); custo conhecido do livro
   sempre vence (`REDUNDANT`/`DUPLICATE` excluídos, nunca somados;
   `CONFLICT`/`OVER_COVERAGE` → `BLOCKED`).
4. Precedência do livro e incompletude parcial: descoberto > 0 ⇒ custo fiscal
   INCOMPLETE no escopo; custo desconhecido nunca vira zero.
5. Cobertura total ⇒ `COMPLETE_WITH_VERIFIED_EVIDENCE` **na resolução**;
   o ledger canônico permanece `INCOMPLETE` (posição replayada intocada).
6. Temporalidade: lote de evidência só vale para alienações com
   `tradeDate >= acquisitionDate` (venda anterior ⇒ sem suporte); day-trade
   nunca consome evidência (matching intradiário exige perna BUY do dia);
   entrada tardia da evidência retroage em leituras sob demanda; sem
   recomposição silenciosa de períodos com obrigação já materializada
   (supersessão/reconciliação existentes).
7. Intervenções societárias sobre quantidade coberta (split/bonus após a
   aquisição): v1 **bloqueia** (`CORPORATE_ACTION_ADJUSTMENT_REQUIRED`) —
   ajustar quantidade evidenciada por fator corporativo fica para desenho futuro.
8. Moeda: igualdade exata com a posição; divergência ⇒ `BLOCKED`; zero FX.
9. Integração (Opção A, forma estreita): enriquecimento do mapa canônico em
   `loadContext` — disposals `INCOMPLETE` cobertos por evidência ganham
   `CanonicalRealizedResult` derivado (custo pró-rata exato) + sidecar de
   proveniência por `transactionId` para o trace. `projection.ts` e equity
   consomem **sem alteração**; `tax-engine` puro e `portfolio-engine`
   congelado (única mudança futura: campo opcional de proveniência no trace).
   Opção B (fallbacks dentro do motor, dois pontos de toque, perda de pureza)
   rejeitada. Opção C (mutar replay) rejeitada (viola pureza do replay).
10. Divulgação: `Custo confirmado pelo livro` vs `Custo complementado por
    evidência verificada` — nunca fundidos silenciosamente.
11. Gate: `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED`, default `false`, na camada
    de resolução; ativação real exige flag + validação do Owner (sem troca
    silenciosa do canônico para enriquecido).

## Alternativas

- Sintetizar BUY no ledger: rejeitada (duplica quantidade, fabrica realização,
  viola append-only).
- Marcar posição canônica COMPLETE por cobertura documental: rejeitada
  (colapsa duas naturezas distintas; corrompe semântica fiscal existente).
- Status quo permanente: possível, mas mantém 36/41 posições sem saída fiscal.

## Consequências

- **Positivas:** destrava DARF/IRPF onde custo é factual; trilha completa por
  `transactionId`; KCRE11 vira `COMPLETE_WITH_VERIFIED_EVIDENCE` (2494.96/300)
  sem tocar ledger, quantidade ou replay; CTI/notifications passam a ler o
  novo status com textos já previstos (`DOCUMENTARY_COMPLETE_TAX_ENABLED`).
- **Negativas:** day-trade e pós-split seguem bloqueados na v1; matching exige
  disciplina de dados (data exata, moeda exata); segunda fonte de custo exige
  auditoria contínua (trace obrigatório mitiga).

## Invariantes fail-closed (I1–I12)

I1 ledger imutável. I2 evidência nunca altera quantidade (divergência ⇒
BLOCKED). I3 só VERIFIED corrente contribui. I4 custo do livro prevalece. I5
sem sobreposição/dupla contagem. I6 descoberto > 0 ⇒ incompleto. I7 conflito
bloqueia. I8 moeda divergente bloqueia. I9 vedada aplicação pré-aquisição.
I10 proveniência identifica custo evidenciado. I11 superseded/rejeitado sai da
resolução. I12 desconhecido nunca é zero.

## Futuro

CTE-1 (resolução pura) → CTE-2 (integração atrás do gate) → CTE-3 (validação
read-only sintética/real) → CTE-4 (ativação do Owner + ajustes Fiscal/CTI).
Sem persistência, sem cache v1, sem DIRPF/DARF oficial novos.
