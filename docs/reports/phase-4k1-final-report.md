# PROJECT ATLAS — RELATÓRIO DE AVALIAÇÃO DE CONFORMIDADE E ENTREGA FINAL

## FASE 4K.1: UNIFIED TAX OBLIGATION TIMELINE & COMPLIANCE STATE FOUNDATION

**Data de Emissão:** 10 de Outubro de 2026  
**Status do Portão:** **APROVADO / CANDIDATE-READY**  
**Ancestral Canônico Congelado (Fase 4J Final):** `465e9d93421146a3b28ff9a5576a87301f9269ef`  
**Escopo:** Camada Fundacional do Workspace de Obrigações Fiscais e Compliance Operacional (Fase 4K.1).

---

### 1. SUMÁRIO EXECUTIVO E ESCOPO DA FASE 4K.1

A **Fase 4K.1** estabelece a infraestrutura operacional de **Tax Compliance** do Project Atlas, respondendo à pergunta essencial do investidor brasileiro: _"O que devo fazer a seguir com relação às minhas obrigações fiscais?"_.

Esta fase atua como uma camada determinística e pura de conformidade construída sobre os motores fiscais previamente certificados e imutáveis (Fase 4G - Mensal, Fase 4H - Anual Geral, Fase 4I - Altas Rendas, Fase 4J - IRPF Unificado).

#### Fronteiras Rígidas e Garantias Negativas (Invioláveis)

- **Zero Novo Motor de Cálculo Fiscal:** A camada de compliance não realiza cálculos fiscais, não recalcula tributos nem duplica fórmulas dos motores 4G/4H/4I/4J.
- **Zero DARF / Sicalc:** Não gera guias DARF oficiais nem automatiza emissão no Sicalc (escopo futuro 4K.2).
- **Zero Pagamento / Bancário:** Não executa pagamentos, PIX ou débito automático.
- **Zero Transmissão à RFB:** Não submete nem transmite dados ao e-CAC, Gov.br ou Receita Federal.
- **Zero Tax AI:** Não utiliza modelos de IA para interpretação tributária.
- **Zero Math no Cliente:** Interfaces (Web e Mobile) apenas renderizam ViewModels e interações do usuário.
- **Isolamento de Estado:** Apenas ações explícitas de workflow do investidor (`TaxComplianceActionRecord`) são persistidas. Todas as obrigações e pendências são projeções determinísticas puras.

---

### 2. ARQUITETURA DE DOMÍNIO & ENGINE DE COMPLIANCE (`@atlas/tax-engine`)

O motor `TaxComplianceTimelineEngine` opera em regime puramente funcional, sem I/O, derivando a linha do tempo de obrigações a partir de dados fiscais consolidados:

1. **Classificação Canônica de Obrigações:**
   - **DARF Mensal de Renda Variável (`MONTHLY_DARF`):**
     - Vencimento canônico no último dia útil do mês seguinte ao fato gerador (`tradeMonth`).
     - Alerta de limite mínimo (R$ 10,00) com acúmulo automático para competências subsequentes.
   - **Retenções na Fonte e Confirmações (`WITHHOLDING_REPORT` / `EVIDENCE_CONFIRMATION`):**
     - Acompanhamento de eventos de dividendos > R$ 50k (Lei 14.754/2023 e reformas 2026+) e pendências informativas.
   - **Declaração de Ajuste Anual DIRPF (`ANNUAL_DECLARATION`):**
     - Período legal canônico de entrega (março a maio do ano-calendário subsequente).
   - **DARF de Ajuste Anual e Quotas (`ANNUAL_BALANCE_SETTLEMENT`):**
     - Quota única ou 1ª quota até 31 de maio; parcelamento e vencimentos mensais subsequentes.

2. **Deduplicação e Determinismo via Chave Canônica:**
   - Cada obrigação possui uma `obligationKey` determinística no padrão:
     - Mensal: `MONTHLY_DARF:VARIABLE_INCOME:YYYY-MM`
     - Retenções: `WITHHOLDING_REPORT:PAYER_CNPJ:YYYY-MM`
     - DIRPF: `ANNUAL_DECLARATION:IRPF:YYYY`
     - Quota DIRPF: `ANNUAL_BALANCE_SETTLEMENT:QUOTA_N:YYYY`

3. **Impressão Digital de Origem e Detecção de Obsolecência (`Stale State`):**
   - O `TaxComplianceFingerprint` calcula o hash SHA-256 canônico dos inputs fiscais (`sourceFingerprint`).
   - Se os dados econômicos forem alterados retroativamente após uma ação de workflow do usuário, a obrigação transiciona para `PENDING_REVIEW` com flag `isStale: true`.

4. **Máquina de Estados de Conformidade:**
   - `PENDING` (não cumprida no prazo)
   - `OVERDUE` (vencida sem comprovação)
   - `USER_COMPLETED` (marcada como concluída pelo investidor com timestamp, método e notas)
   - `DISMISSED` (dispensada justificadamente)
   - `BLOCKED` (depende de pré-requisitos anteriores)
   - `PENDING_REVIEW` (ação prévia existente, mas dados de origem alterados)

5. **Aviso Legal Obrigatório (`Compliance Disclaimer`):**
   - Toda obrigação marcada pelo usuário inclui compulsoriamente a mensagem padronizada:
     _"O registro de cumprimento foi informado pelo usuário para controle pessoal no Atlas e não constitui comprovação de quitação junto à Secretaria Especial da Receita Federal do Brasil."_

---

### 3. PERSISTÊNCIA, SCHEMA & REPOSITÓRIO (`@atlas/database`)

1. **Migration 19:** `20261010000000_add_tax_compliance_actions`
   - Tabela: `tax_compliance_actions`
   - Campos:
     - `id`: UUID Primary Key
     - `user_id`: UUID (Foreign Key para `users.id` com `ON DELETE CASCADE`)
     - `portfolio_id`: UUID opcional (Foreign Key para `portfolios.id` com `ON DELETE SET NULL`)
     - `obligation_key`: VARCHAR(128)
     - `action_type`: VARCHAR(32) (`COMPLETED`, `DISMISSED`, `ACKNOWLEDGED`, `REOPENED`)
     - `completion_date`: DATE civil
     - `payment_method`: VARCHAR(32) opcional (`PIX`, `DARF_BARCODE`, `BANK_DEBIT`, `OTHER`)
     - `notes`: TEXT opcional
     - `metadata`: JSONB para auditoria
     - `source_fingerprint`: VARCHAR(64) SHA-256
     - `created_at` / `updated_at`: Timestamps técnicos UTC
   - Índices Otimizados:
     - `idx_tax_compliance_actions_user_obligation`: `(user_id, obligation_key)`
     - `idx_tax_compliance_actions_user_created`: `(user_id, created_at DESC)`

2. **Repositório Tipado:** `TaxComplianceActionRepository`
   - Métodos: `upsertAction`, `getActionsByUser`, `getActionsByObligationKey`, `deleteActionByObligationKey`.
   - Conversão segura de datas e strings com tipagem estrita de Value Objects.

---

### 4. CAMADA DE API REST & CONTRATO HTTP (`apps/api`)

1. **Rotas Protegidas:**
   - `GET /api/v1/fiscal/compliance?year=YYYY&portfolioId=UUID`
     - Retorna `{ data: { timeline: TaxComplianceObligationDto[], summary: TaxComplianceSummaryDto, staleCount: number } }`
   - `POST /api/v1/fiscal/compliance/:obligationKey/actions`
     - Executa o registro ou atualização de ação de workflow do investidor.
     - Payload validado por Zod (`RecordTaxComplianceActionDto`).

2. **Isolamento de Segurança e Anti-Enumeração:**
   - Injeção obrigatória do `@CurrentPrincipal()` extraído do JWT autenticado.
   - Validação de propriedade de carteira: tentativa de acesso a carteira de outro usuário retorna invariavelmente `404 Not Found`.

---

### 5. INTERFACE WEB & DESIGN SYSTEM (`apps/web` & `@atlas/ui`)

1. **Visualização do Workspace de Compliance (`apps/web/src/components/fiscal/ComplianceTimelineSection.tsx`):**
   - Resumo dinâmico de conformidade (Obrigações Pendentes, Vencidas, Concluídas e Alertas de Revisão).
   - Filtros por Ano-Calendário e Status.
   - Badges semânticos com tokens do Design System (`positive` para concluído, `negative` para vencido, `warning` para revisão/atenção).
   - Modal de Ação do Investidor: permite marcar conclusão informando data, método de pagamento e anotações, exibindo o disclaimer legal de não-quitação oficial.
   - Integrado de forma reativa na página canônica de Fiscal (`/tax`).

---

### 6. MATRIZ DE TESTES E EVIDÊNCIAS DE VALIDAÇÃO

| Suíte de Validação                           | Quantidade de Testes / Arquivos                | Resultado     |
| :------------------------------------------- | :--------------------------------------------- | :------------ |
| **Tax Compliance Engine (Unit & Fuzz)**      | 8 unitários + 20.000 casos fuzzing             | **100% PASS** |
| **Full Tax Engine Suite**                    | 724 testes / 63 arquivos                       | **100% PASS** |
| **Database & Repositories**                  | 128 testes / 24 arquivos                       | **100% PASS** |
| **Fiscal API & Compliance Integration**      | 417 testes / 54 arquivos                       | **100% PASS** |
| **E2E Browser Playwright Suite**             | 330 testes em 3 viewports                      | **100% PASS** |
| **Web Build (Next.js 15 App Router)**        | 28/28 páginas estáticas compiladas             | **100% PASS** |
| **Foundation Gate (`validate:foundation`)**  | Lint, Format, Typecheck, Security, Arch, Tests | **EXIT 0**    |
| **RC Gate (`validate:portfolio-engine-rc`)** | Replay Determinism, Property-based & Stress    | **EXIT 0**    |

---

### 7. CONCLUSÃO E PRÓXIMOS PASSOS

A **Fase 4K.1** foi implementada com rigor matemático, integridade de monorepo e conformidade estrita aos princípios do Atlas. O workspace fundacional de conformidade fiscal está pronto para subsidiar as próximas etapas de automação documental e conferência fiscal assistida (Fase 4K.2).
