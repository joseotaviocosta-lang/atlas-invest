# Fiscal Reminder Delivery (Fase 2 — pós-baseline B3)

Lembretes fiscais e de qualidade de dados acionáveis, entregues in-app sobre o
feed unificado de notificações. Sem e-mail/push, sem segundo sistema de
notificações, sem recálculo fiscal.

## Arquitetura reutilizada (descoberta)

- **5V Notification Center**: feed derivado read-only (`GET /api/v1/notifications`),
  zero migrations, ids determinísticos (idempotência por construção),
  auto-resolução quando a condição-fonte desaparece, severidades
  `URGENT/ACTION_REQUIRED/IMPORTANT/INFO`, `Alertas` = actionRequiredCount,
  `Pendências` = integration-reviews count (independente, intocado).
- **4K.3 compliance reminders**: mecânica de entrega persistida, mas escopo
  estrito a obrigações (`reminderKey` embute `obligationKey`); NÃO reutilizado
  — forçar fatos de custo nele exigiria modificar o tax engine (congelado).
- Categorias `DATA_QUALITY`/`CORPORATE_EVENT` existiam na taxonomia sem nenhum
  produtor; esta fase ativa `DATA_QUALITY`.
- Decisão registrada: sem estados READ/DISMISSED nesta fase (nenhuma notificação
  5V os tem; contadores zeram pela resolução da fonte). Persistência de leitura
  exigiria migração + 3 endpoints — fora do porte S/M; reavaliar se o ruído
  justificar.

## Tipos implementados (fetchCostBasisNotifications)

| id | categoria | severidade | condição | destino |
|---|---|---|---|---|
| `cost-basis:{portfólio}:incomplete:v1` | DATA_QUALITY | IMPORTANT | ≥1 escopo com cobertura documental incompleta | `/portfolio?portfolioId=&tab=overview`, "Revisar posições" |
| `cost-evidence:{rowId}:review-required` | DATA_QUALITY | ACTION_REQUIRED | linha atual REVIEW_REQUIRED (superseded nunca listadas) | `/portfolio/assets/:id?portfolioId=`, "Revisar evidência" |
| `tax-blocked:{portfólio}:incomplete-cost:v1` | FISCAL | ACTION_REQUIRED | ≥1 posição com custo canônico INCOMPLETE | `/tax`, "Ver pendências fiscais" |

Não implementados (com motivo): `EVIDENCE_BLOCKER_PRESENT` (EGIE3/ITSA4/SNEL
só existem no register JSON em docs — sem fonte maquinal confiável; inventar
detecção seria fabricar dado); `TAX_DEADLINE_APPROACHING` (o fetcher fiscal
existente já cobre vencimentos de DARF via `taxObligationRecord`).

## Regras de geração

- Porta de custo incompleto lê o **assessment documental** (`buildCostBasisAssessment`
  sobre replay + evidência VERIFIED), nunca o `costBasisStatus` canônico —
  KCRE11 (COMPLETE) é estruturalmente excluído do agrupado.
- Porta fiscal lê o **custo canônico** (o que o motor tributário consome) —
  KCRE11 conta nos "36" porque sua base fiscal segue INCOMPLETE (PART T).
- Lotes: `summarizeLedgerKnownLots` por (conta, ativo); evidência via
  `listCurrentByScope` (1 query por carteira, filtro em memória, sem N+1);
  tickers em 1 `findByIds`.
- Falha de replay Ledger corrompido → fetcher isolado via `allSettled` (padrão
  existente); agregação multi-moeda proibida também aqui (contagens por
  escopo, sem somar quantidades entre ativos).
- `occurredAt`: última tradeDate factual dos escopos afetados (ou hoje);
  `dueAt` sempre null (sem vencimento factual próprio).

## Agregação e ruído

- 36 escopos incompletos → **1** item agrupado ("35 posições…" no dado real,
  KCRE11 excluído), tickers dos 3 primeiros + "…". Revisões → 1 item por linha
  atual (raro, transitório). Total estável medido no dado real: 15 → 17 itens,
  badge Alertas 12 → 13 (+1 tax-blocked; IMPORTANT não badga).

## Segurança fiscal e de acesso

- Wording fail-closed: "Cálculo tributário bloqueado", "nenhum imposto é
  calculado a partir de dados incompletos". Zero linguagem de pagamento
  (testado por regex), zero valores, zero DARF.
- Geração 100% servidor; `userId`/`portfolioId` do principal; anti-enumeração
  404 herdada; sem criação arbitrária pelo cliente.

## Contadores

- `Alertas` (badge) = URGENT+ACTION_REQUIRED do feed → +1 estável (tax-blocked)
  e transitórios (review). `Pendências` inalterado. `totalCount` +2 no dado real.

## Futuro

- READ/DISMISS persistidos (migração + endpoints) se necessário.
- Canais EMAIL/PUSH: apenas conceito (`channel` existe no 4K.3), sem integração.
- `EVIDENCE_BLOCKER_PRESENT` quando houver fonte maquinal de blockers.
- Agendamento: refresh-on-read atual (poll 60s do popover) é suficiente; sem cron.
