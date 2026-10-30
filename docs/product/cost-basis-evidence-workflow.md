# Cost-Basis Evidence Workflow (Fase D)

Evidência histórica de custo sem mutação do livro-razão. Conceito independente
(ADR-310): quantidade continua propriedade do ledger imutável; custo comprovado
é uma camada auditada à parte.

## Arquitetura

```text
Transaction Ledger (imutável, append-only)
  → replayPortfolio → Position + ledgerKnownLots (BUY/SUBSCRIPTION/BONUS c/ custo)
  + cost_basis_evidence (VERIFIED) → buildCostBasisAssessment → CostBasisAssessment
  → API read models → Web (formatação apenas)
```

O tax engine **não** consome a avaliação (`TAX_COST_ENRICHMENT_NOT_ENABLED`).

## Ciclo de vida da evidência

```text
DRAFT → REVIEW_REQUIRED → VERIFIED
  DRAFT/REVIEW_REQUIRED → REJECTED (motivo obrigatório)
qualquer conteúdo editado → nova revisão REVIEW_REQUIRED (nunca carrega VERIFIED)
```

- Criação aceita somente `DRAFT`/`REVIEW_REQUIRED` (nunca `VERIFIED` direto).
- Confirmação é do próprio investidor (owner mode): `submit` + `verify` com
  `confirmedBy`/`confirmedAt`.
- Revisões append-only: `version` monotônica, `supersedesId`, histórico preservado.
- Idempotência: mesma impressão digital sem pai → `DUPLICATE` (sem nova linha).
- Identidade: `(portfolioId, fingerprint, version)` — transições reutilizam o
  fingerprint com versão nova.

## Tipos e validação

Tipos: `BROKERAGE_NOTE`, `BROKER_STATEMENT`, `ANNUAL_TAX_STATEMENT`,
`OFFICIAL_POSITION_REPORT`, `MANUAL_DOCUMENTED`. Fonte v1: `MANUAL_CONFIRMED`.

- Exige `quantityCovered > 0` e ao menos um lado monetário (`unitCost`/`totalCost`).
- Ambos presentes: `unitCost × quantityCovered = totalCost` exato, senão
  `COST_EVIDENCE_AMOUNT_MISMATCH` (sem reconciliação silenciosa).
- `acquisitionDate` exige data civil exata (`LocalDate`); moeda obrigatória;
  `sourceReference` é identificador estável (nunca caminho de arquivo).

## Cobertura e lotes

- `covered = ledgerKnown + evidenceVerified(aplicada)`; `uncovered = Q − covered`;
  `coveragePercent` com 2 decimais; custos agregados por moeda (sem FX).
- `EVIDENCE_REDUNDANT`: evidência que repete lote do livro (mesmo
  ativo+conta+data+quantidade) é excluída com aviso.
- `EVIDENCE_LOT_DUPLICATE`: dois documentos do mesmo lote econômico
  (`costLotKey`: ativo+conta+data+quantidade+custo+moeda, sem identidade
  documental) contam uma vez.
- `COST_EVIDENCE_OVER_COVERAGE`: cobertura verificada > posição → `BLOCKED`
  (nunca clamp). O `verify` projeta antes de escrever e recusa com 409.
- Status: `COMPLETE` (uncovered = 0) / `PARTIAL` / `INCOMPLETE` / `BLOCKED`.
- TRANSFER_IN casado com custo transportado: excluído dos lotes do livro na v1
  (limitação documentada, direção fail-closed).

## Ligação com posição de abertura

Evidência referencia `(portfolioId, accountId, assetId)` — o mesmo escopo da
posição derivada do TRANSFER_IN de abertura. A quantidade de abertura nunca é
alterada; a evidência apenas cobre custo das unidades já representadas.

## API

```text
POST /api/v1/portfolios/:id/cost-evidence            criar (DRAFT|REVIEW_REQUIRED)
GET  /api/v1/portfolios/:id/cost-evidence            listar (filtros accountId/assetId/statuses)
POST /api/v1/portfolios/:id/cost-evidence/preview    projeção efêmera (nada persiste)
GET  /api/v1/portfolios/:id/cost-evidence/assessment avaliação persistida+ledger
POST /api/v1/portfolios/:id/cost-evidence/:eid/submit
POST /api/v1/portfolios/:id/cost-evidence/:eid/verify   (pré-checagem over-coverage)
POST /api/v1/portfolios/:id/cost-evidence/:eid/reject   (motivo obrigatório)
POST /api/v1/portfolios/:id/cost-evidence/:eid/revise   (novo conteúdo → REVIEW_REQUIRED)
```

Sem `PUT`/`PATCH`/`DELETE` (apêndice/revisão apenas). `userId` sempre do
principal autenticado; acesso alheio → 404.

## UI (Web)

- Seção na página do ativo (aba visão geral, somente custo incompleto):
  cobertura, custos comprovados por moeda, avisos, lista de evidências com
  ações (enviar/confirmar/rejeitar) e botão "Melhorar custo histórico".
- Modal: formulário → preview do servidor → salvar como rascunho.
- Aviso fiscal permanente: cálculo tributário segue bloqueado.
- Zero matemática financeira no cliente (só `formatCurrency`/`formatQuantity`).

## Exemplo KCRE11 (projeção, nada salvo)

Posição 300 (120 abertura INCOMPLETE + 80@8,45 + 100@7,99 conhecidos = 180).
Evidência: 120 @ R$ 8,50 em 26/12/2024 (R$ 1.020,00).
Avaliação projetada: coberto 300/300 = 100% → `COMPLETE` (leitura),
quantidade do livro inalterada, tributo inalterado (porta fechada).

## Segurança

Servidor valida propriedade da carteira, vínculo conta↔carteira, identidade do
ativo, decimais, transições de status, duplicatas, sobreposição e
sobre-cobertura. Cliente nunca marca `VERIFIED`.

## Extensões futuras

Porta tributária (`TAX_COST_ENRICHMENT_NOT_ENABLED` — exige prova de
equivalência com histórico factual completo); importação assistida de notas
(sem OCR nesta fase); TRANSFER_IN casado nos lotes do livro; linhagem
pós-transferência entre contas.
