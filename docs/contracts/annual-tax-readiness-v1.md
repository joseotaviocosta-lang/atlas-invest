# Contract: `annual-tax-readiness-v1`

Fase 4H.5 — Invariantes arquiteturais, avaliação de completude, gestão de evidências e confirmações do contribuinte para o IRPF anual.

---

## 1. Escopo e Propósito

Este contrato define as regras e invariantes para avaliar a prontidão fiscal anual do investidor (`AnnualTaxReadinessAssessment`), consolidar exigências probatórias (`AnnualEvidenceRequirement`) e gerenciar confirmações formais do contribuinte (`TaxpayerConfirmationRecord`).

```
Upstream Engines & Persistência
  ├─ Opening Positions (ADR-302)
  ├─ Annual Positions / Portfolio Replay (ADR-303)
  ├─ Monthly Capital Market Fiscal Summaries (Fase 4G / 4H.2)
  ├─ Monthly 6015 / DARF Aggregations (ADR-300 / 4H.3)
  ├─ Annual Investment Income / 2026 Rules (ADR-047 / 4H.4 / 4H.4A)
  └─ Taxpayer Confirmation Repository (Fase 4H.5)
            ↓
  Annual Tax Readiness Engine (Pure Deterministic)
            ↓
  AnnualTaxReadinessAssessment + Section Statuses + Actionable Requirements
```

---

## 2. As 9 Seções Avaliadas

O motor de prontidão avalia rigorosamente 9 seções funcionais:

1. `OPENING_POSITIONS`: Posições de abertura no início do ano-calendário (31/12 do ano anterior).
2. `ANNUAL_POSITIONS`: Posições de encerramento em 31/12 do ano-calendário derivadas via replay determinístico do Portfolio Engine.
3. `CAPITAL_MARKET_FISCAL`: Consolidação dos 12 meses de apuração de ganho líquido e prejuízos de renda variável.
4. `PAYMENTS_6015`: Consolidação e rastreamento de débitos, pagamentos e carry-forward do código DARF 6015.
5. `TRANSITION_EVIDENCE`: Evidências corporativas de deliberação pré-2026 para isenção transitória de dividendos em 2026–2028 (Lei 15.270/2025).
6. `FII_ELIGIBILITY`: Verificação cumulativa dos 3 requisitos legais de isenção de rendimentos de FII (Lei 11.033/2004 c/c Lei 14.754/2023).
7. `WITHHOLDING_EVIDENCE`: Evidências documentais e informes de rendimentos de retenções na fonte (IRRF JCP, IRRF Dividendos 2026+, IRRF Day-Trade/Swing-Trade).
8. `INVESTMENT_INCOME`: Agregação anual de rendimentos (Dividendos, JCP e FII).
9. `TAXPAYER_CONFIRMATIONS`: Integridade e atualidade das confirmações prestadas pelo contribuinte.

---

## 3. Hierarquia de Precedência de Status

O status geral da prontidão (`overallStatus`) e o status de cada seção (`sectionStatus`) obedecem estritamente à hierarquia de severidade:

| Status                  | Severidade | Descrição                                                                                                  |
| :---------------------- | :--------: | :--------------------------------------------------------------------------------------------------------- |
| `BLOCKED`               |   **4**    | Dados faltantes, inconsistência contábil, posição negativa ou custo ausente. Impossibilita prosseguimento. |
| `REQUIRES_CONFIRMATION` |   **3**    | Fato econômico depende de manifestação ou confirmação probatória formal do contribuinte.                   |
| `PARTIAL`               |   **2**    | Meses ou fontes incompletas no ano sem bloqueio fatal.                                                     |
| `READY`                 |   **1**    | Todas as fontes e evidências necessárias estão presentes e validadas.                                      |
| `NO_ACTIVITY`           |   **0**    | Nenhuma operação, custódia ou provento registrado no ano-calendário.                                       |

**Invariante de Precedência:**
`overallStatus = MAX_SEVERITY(sections.map(s => s.status))`

---

## 4. Estrutura de Requisitos Probatórios (`AnnualEvidenceRequirement`)

Cada pendência identificada gera um requisito tipado:

- `requirementId`: Identificador determinístico da exigência (`req_<section>_<subjectId>_<reason>`).
- `section`: Seção funcional de origem.
- `subjectId`: Identificador do ativo (`AssetId`), mês ou declaração.
- `title` / `description`: Texto explicativo claro e não ambíguo para o investidor.
- `status`: `PENDING` | `SATISFIED` | `WAIVED` | `STALE`.
- `blockingReason`: Código canônico do bloqueio/exigência.
- `sourceFingerprint`: Hash SHA-256 do estado dos dados subjacentes que gerou a exigência.
- `satisfiedByConfirmationId`: ID da confirmação que satisfez a exigência (se houver).
- `actionableUrl`: Caminho de ação na aplicação para saneamento.

---

## 5. Modelo de Confirmação do Contribuinte (`TaxpayerConfirmationRecord`)

- **Identidade e Vínculo:** Registrada na tabela `taxpayer_confirmations` com chave estrangeira `userId`.
- **Escopos Tipados:**
  - `DIVIDEND_TRANSITION_EVIDENCE`
  - `FII_EXEMPTION_REQUIREMENTS`
  - `OPENING_COST_BASIS`
  - `WITHHOLDING_PROOF`
  - `GENERAL_TAX_DATA`
- **Controle de Versão e Idempotência:**
  - Atualizações subsequentes incrementam monotonicamente o campo `revision` (1, 2, 3...) e marcam registros anteriores como `SUPERSEDED`.
  - Confirmações canceladas recebem status `REVOKED` e timestamp `revokedAt`.
- **Detecção de Caducidade (Stale Detection):**
  - Se os dados subjacentes do ativo ou transação forem alterados, o novo `sourceFingerprint` divergirá do `sourceFingerprint` registrado na confirmação.
  - O motor detecta a divergência e marca a exigência como `STALE`, exigindo reconfirmação pelo investidor.

---

## 6. Isolamento e Segurança

- **Anti-Enumeração:** Tentativas de consultar ou gravar confirmações para outros usuários resultam invariavelmente em `404 Not Found` ou `401 Unauthorized`.
- **Zero Redefinição de Cálculos Financeiros:** A camada de prontidão apenas audita e orquestra a completude; não realiza cálculos tributários, não emite DARFs e não altera o ledger de transações.
- **Auditoria Segura:** Logs não contêm valores financeiros nem dados fiscais sensíveis.

---

## 7. Orçamento de Consultas e Performance

- `GET /api/v1/fiscal/annual/:calendarYear/readiness`: Execução em tempo sub-segundo com orçamento máximo de 25 queries bounded (zero vazamento N+1).
- Suporte a escalas de 5.000+ requisitos em tempo inferior a 1.000ms.
