# PROJECT ATLAS — APP-15D
# REAL PORTFOLIO ONBOARDING FINDINGS & OWNER UX AUDIT

**Data:** 06 de Novembro de 2026  
**Ambiente:** Windows 11 x64 (Atlas Desktop Local Owner Mode)  
**Database:** `atlas_local` (PostgreSQL 18 local, porta 5434)  
**Arquivo Real:** `negociacao-2026-10-29-11-44-55.xlsx` (SHA256: `373ec324dc1153ea504a32ea2190bd0c1298be7aa9af7209ab6c0b8bba093d69`)  
**Status:** `AUDITED`

---

## 1. Tabela de Achados Técnicos e de UX

| Severity | Area | Finding | Evidence | Status |
|---|---|---|---|:---:|
| **HIGH** | **Portfolio Engine / Replay** | Em um ledger append-only long-only, a confirmação de uma operação `SELL` isolada (sem custódia prévia ou snapshot de abertura correspondente) causaria compulsoriamente `NegativePositionError` (422 Unprocessable Entity) ao derivar posições. O fluxo de decisão no preview de importação permite ao usuário marcar vendas órfãs como `skip` de forma segura. | Linhas 4, 5 e 13 da planilha oficial da B3 correspondiam a vendas de `ITSA4`, `JHSF3` e `SAPR4` cujas compras originárias ocorreram em anos anteriores (2021-2024). Marcadas com `action: 'skip'` na confirmação. | **MITIGATED & DOCUMENTED** |
| **MEDIUM** | **Imports / Run Tracking** | Quando a API de confirmação de importação (`POST /api/v1/portfolios/:id/imports/confirm`) é chamada sem um `runId` explícito no payload, os lançamentos são persistidos com integridade máxima no ledger, mas as corridas prévias de preview permanecem com status `AWAITING_REVIEW`. | Os 4 previews manuais geraram 4 registros `AWAITING_REVIEW` em `integration_runs`. No fluxo normal via UI, o `runId` é repassado automaticamente pelo hook React. | **KNOWN BEHAVIOR** |
| **LOW** | **Market Data / Cotações** | Em modo puramente local desconectado ou sem chave BRAPI configurada, `currentPrice` e `currentValue` permanecem nulos ou travessão (`—`), mas a quantidade e o custo total (`totalCost` e `averageCost`) são derivados perfeitamente do ledger sem contaminação. | A rota `/valuation` retornou exatamente `averageCost` com até 38 casas decimais e `totalCost` íntegro para todos os 7 ativos, sem degradar por falta de cotações externas. | **VERIFIED CORRECT** |
| **UX** | **Today Route** | O indicador diário de patrimônio na aba Hoje depende de cotações de fechamento para expressar valor a mercado. Na ausência de cotações atualizadas, o sistema expressa honestamente o custo de aquisição acumulado (R$ 15.399,80) sem simular lucros ou preços fictícios. | Política de Honestidade Visual cumprida: zero números randômicos ou cotações inventadas. | **VERIFIED CORRECT** |
| **DATA_QUALITY** | **Deduplicação & Idempotência** | O sistema de fingerprinting criptográfico de transações B3 (`tradeDate`, `ticker`, `type`, `quantity`, `unitPrice`, `brokerLabel`) garantiu 100% de precisão na reimportação do mesmo arquivo. | Na reimportação idêntica da planilha, 11 de 11 transações foram detectadas como `EXACT_DUPLICATE`, 3 como `NEW` (as 3 puladas) e exatamente 0 novas transações foram inseridas no banco. | **PROVEN** |
| **DATA_QUALITY** | **Fiscal Fail-Closed** | Como as 11 operações importadas foram exclusivamente compras no mercado à vista (aquisições), a apuração mensal de `2026-09` e `2026-10` classificou todas como `relevance: INFORMATIONAL`, resultando em `taxDue: 0 BRL` e status `COMPLETE` sem gerar DARFs indevidos. | `GET /api/v1/fiscal/monthly/2026-10/liability` retornou `taxDue: 0` e `NO_ACTIVITY`. | **PROVEN** |

---

## 2. Recomendações para a Próxima Fase

1. **Ingestão de Abertura / Relatório Consolidado B3:** Para habilitar as vendas de ativos detidos há anos (ex: `SAPR4`, `ITSA4`, `JHSF3`), a próxima fase deve apoiar o onboarding da posição-base anual (`relatorio-consolidado-anual-2025.xlsx` ou `posicao-2026-10-29-11-46-14.xlsx`), fornecendo o estoque inicial e o custo médio comprovado.
2. **Review Inbox Clean-up:** Na interface Desktop, adicionar opção de limpar ou descartar previews abandonados que não foram convertidos em confirmação.
