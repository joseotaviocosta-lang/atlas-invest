# PROJECT ATLAS — APP-15G
# HISTORICAL GAPS AUDIT REPORT

- **Data de Execução:** 06/11/2026
- **Ambiente:** Desktop Windows Local (`DESKTOP_LOCAL_OWNER`)
- **Database:** `atlas_local` (PostgreSQL 18 na porta 5434)
- **Status da Fase:** `APP_15G_DOCUMENTARY_GAPS_REMAIN`

---

## 1. RESUMO EXECUTIVO

A fase **APP-15G** realizou uma auditoria exaustiva em todo o sistema de arquivos local do computador do investidor para identificar fontes documentais de transações, custódias e custos anteriores a 28/11/2019, data de início da planilha mestre de negociações da B3 (`negociacao-2026-10-29-18-20-59.xlsx`).

O objetivo foi avaliar se é possível provar documentalmente o custo de aquisição histórico das posições que deram origem às vendas de outubro de 2026:
- `ITSA4` (venda de 200 ações em 06/10/2026)
- `JHSF3` (venda de 200 ações em 06/10/2026)
- `SAPR4` (venda de 800 ações em 08/10/2026)

---

## 2. AUDITORIA DE FONTES LOCAIS DISPONÍVEIS

Foram inspecionados os diretórios `Downloads`, `Documents`, `OneDrive` e raiz de usuário `C:\Users\joseo`:

| Fonte / Arquivo | Período Coberto | Classificação | Conteúdo Relevante para Custos | Status |
| :--- | :---: | :---: | :--- | :--- |
| `negociacao-2026-10-29-18-20-59.xlsx` | 28/11/2019 → 08/10/2026 | `TRANSACTION_EVIDENCE` | 189 compras e vendas oficiais da B3 com preços, taxas e emolumentos. Não contém negócios pré-28/11/2019. | **USADA (100% Ingerida)** |
| `relatorio-consolidado-anual-2020.xlsx` ... `2025.xlsx` | 2020 → 2025 | `POSITION_EVIDENCE` | Posição estática de custódia em 31/12 de cada ano, cotação de fechamento da B3 e valor de mercado bruto. **NÃO contém preço de aquisição ou custo histórico**. | **AUDITADA (Checkpoints Anuais)** |
| `movimentacao-2026-10-29-11-47-54.xlsx` | 28/10/2025 → 28/10/2026 | `TRANSACTION_EVIDENCE` | 711 movimentações de custódia (bonificações, aluguel de ações, proventos em dinheiro, leilões de frações e subscrições). | **AUDITADA (Eventos 2025/2026)** |
| `posicao-2026-10-29-11-46-14.xlsx` | 29/10/2026 | `POSITION_EVIDENCE` | Snapshot oficial da custódia B3 em 29/10/2026 (36 ativos em carteira). | **BENCHMARK DE CUSTÓDIA** |
| Notas de Corretagem pré-2019 | — | `TRANSACTION_EVIDENCE` | Inexistentes na máquina local do usuário. | **NÃO DISPONÍVEL** |
| Declarações IRPF (DIRPF / PGD) | — | `TAX_DECLARATION_EVIDENCE` | Inexistentes na máquina local do usuário. | **NÃO DISPONÍVEL** |

---

## 3. AUDITORIA INDIVIDUAL DOS ATIVOS CRÍTICOS (ITSA4, JHSF3, SAPR4)

### A. ITSA4 (Itaúsa PN)
- **Histórico Reconstituído:**
  - 31/12/2020: 900 ações (Relatório Anual 2020).
  - 31/12/2021: 945 ações (Bonificação de 5% em 2021 = +45 ações).
  - 31/12/2022: 1.039 ações (Bonificação de 10% em 2022 = +94 ações).
  - 31/12/2024: 1.161,3 ações (Bonificação de 2023/2024).
  - 22/12/2025: Bonificação de 23,54 ações (Linha 594 de `movimentacao-*.xlsx`) totalizando 1.200,54 ações.
  - 25/02/2026: Leilão de fração de 0,54 ações liquidado a R$ 14,658.
  - 06/10/2026: Venda de 200 ações a R$ 16,10 (Lote 15D).
  - Custódia Remanescente em 29/10/2026: 1.000,54 ações (Match exato com snapshot B3).
- **Status do Custo:** **`INCOMPLETE`**.
- **Diagnóstico:** O saldo de abertura (900 ações) adveio de aquisições anteriores a 28/11/2019. Não há nota de corretagem no computador que comprove o preço unitário pago. Conforme a regra de ouro do Project Atlas, o custo não foi arbitrado nem estimado pela cotação de 31/12.

### B. JHSF3 (JHSF ON)
- **Histórico Reconstituído:**
  - 31/12/2020: 600 ações (Relatório Anual 2020).
  - 31/12/2021 a 31/12/2025: 600 ações mantidas inalteradas (recebimento regular de dividendos mensais).
  - 06/10/2026: Venda de 200 ações a R$ 13,22 (Lote 15D).
  - Custódia Remanescente em 29/10/2026: 400 ações (Match exato com snapshot B3).
- **Status do Custo:** **`INCOMPLETE`**.
- **Diagnóstico:** Aquisição original de 600 ações anterior a 28/11/2019. Sem notas fiscais de compra disponíveis localmente.

### C. SAPR4 (Sanepar PN)
- **Histórico Reconstituído:**
  - 31/12/2020: 3.300 ações (Relatório Anual 2020).
  - 31/12/2021 a 31/12/2025: 3.300 ações mantidas inalteradas.
  - 08/10/2026: Venda de 800 ações a R$ 8,05 (Lote 15D).
  - Custódia Remanescente em 29/10/2026: 2.500 ações (Match exato com snapshot B3).
- **Status do Custo:** **`INCOMPLETE`**.
- **Diagnóstico:** Aquisição original de 3.300 ações anterior a 28/11/2019. Sem notas fiscais de compra disponíveis localmente.

---

## 4. IMPACTO TRIBUTÁRIO E INTEGRIDADE *FAIL-CLOSED*

Conforme demonstrado na consulta da API local:
`GET /api/v1/portfolios/:portfolioId/tax-intelligence?competence=2026-10`

- **Status:** **`BLOCKED`**
- **Headline:** *Cálculo tributário bloqueado*
- **Bloqueador Canônico:** `UNKNOWN_COST_BASIS`
- **Explicação:** Há posições com custo de aquisição desconhecido (`ITSA4`, `JHSF3`, `SAPR4`). O Atlas proíbe o cálculo de DARF ou apuração de lucro líquido presumido sem lastro documental.
- **Rigor Tributário:** O Project Atlas nunca assume preço zero, preço médio de mercado ou isenção automática sem comprovação factual.
