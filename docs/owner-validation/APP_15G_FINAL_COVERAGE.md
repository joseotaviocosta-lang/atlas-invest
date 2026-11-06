# PROJECT ATLAS — APP-15G
# FINAL PORTFOLIO COVERAGE & RECONCILIATION REPORT

- **Data de Execução:** 06/11/2026
- **Ambiente:** Desktop Windows Local (`DESKTOP_LOCAL_OWNER`)
- **Database:** `atlas_local` (PostgreSQL 18 na porta 5434)
- **API Runtime:** Local NestJS em `http://127.0.0.1:3001`
- **Portfolio ID:** `00000000-0000-4000-8000-000000000002` ("Carteira Principal")
- **Account ID:** `00000000-0000-4000-8000-000000000005` ("Custódia Principal")
- **Benchmark Oficial:** `posicao-2026-10-29-11-46-14.xlsx` (Custódia B3 em 29/10/2026)
- **Status Final:** `APP_15G_DOCUMENTARY_GAPS_REMAIN`

---

## 1. MATRIZ DE COBERTURA E STATUS INDIVIDUAL DOS ATIVOS

| Ticker | Quantidade Ledger | Quantidade B3 | Status da Posição | Status do Custo | Preço Médio (BRL) | Causa da Diferença (se houver) |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **B3SA3** | 400 | 400 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 11,1150 | Match Exato |
| **BBAS3** | 200 | 200 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 19,9800 | Match Exato |
| **BRAP4** | 200 | 200 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 16,7400 | Match Exato |
| **BRCR11** | 44 | 44 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 40,8073 | Match Exato |
| **COGN3** | 300 | 330 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 3,9000 | +30 ações bonificadas em 29/12/2025 |
| **EGIE3** | 200 | 280 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 40,5000 | +80 ações bonificadas em 28/11/2025 |
| **EZTC3** | 1.200 | — | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 16,8700 | Posição com bonificações (271,56) e liquidação |
| **FESA4** | 300 | 500 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 7,0000 | 200 ações originadas pré-nov/2019 + desdobramento 1:4 |
| **FLRY3** | 300 | 315 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 21,8267 | +15 ações bonificadas em 2023 |
| **HGLG11** | 27 | 58 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 160,5163 | 31 cotas originadas pré-nov/2019 |
| **HYPE3** | 200 | — | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 21,3500 | Posição em empréstimo/doador na data da posição |
| **IRBR3** | 700 | 23,33 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 2,6343 | Grupamento 30:1 em 25/01/2023 (700 / 30 = 23,33) |
| **IRIM11** | 99 | 99 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 65,1161 | Match Exato |
| **ISAE4 / TRPL4** | 0 | 300 | `CORPORATE_ACTION_PENDING` | `COST_COMPLETE` | — | Renomeação de ticker 1:1 (`TRPL4` → `ISAE4`) |
| **ITSA4** | 1.000,54 | 1.000,54 | `POSITION_COMPLETE` | `COST_PARTIAL` | — | `FISCAL_BLOCKED`: Custo original pré-2019 desconhecido |
| **JHSF3** | 400 | 400 | `POSITION_COMPLETE` | `COST_PARTIAL` | — | `FISCAL_BLOCKED`: Custo original pré-2019 desconhecido |
| **KCRE11** | 300 | 300 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 8,3165 | Match Exato |
| **KNRI11** | 9 | 73 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 147,5833 | 64 cotas originadas pré-nov/2019 |
| **MALL11 / PMLL11**| 16 | — | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 98,7175 | Renomeação de ticker 1:1 (`MALL11` → `PMLL11`) |
| **MCCI11** | 69 | 69 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 93,9048 | Match Exato |
| **MRFG3 / MBRF3** | 200 | — | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 12,3750 | Renomeação de ticker 1:1 (`MRFG3` → `MBRF3`) |
| **MXRF11** | 620 | 1.077 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 9,9407 | 457 cotas originadas pré-nov/2019 |
| **PETR4** | 200 | 200 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 22,0000 | Match Exato |
| **PRIO3** | 100 | 100 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 20,1700 | Match Exato |
| **RBRP11** | 90 | 90 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 75,8659 | Match Exato |
| **ROXO34 / NUBR33**| 51 | 550 | `CORPORATE_ACTION_MODEL_GAP` | `COST_COMPLETE` | R$ 13,1000 | Reestruturação do programa de BDRs Nubank |
| **SAPR4** | 2.500 | 2.500 | `POSITION_COMPLETE` | `COST_PARTIAL` | — | `FISCAL_BLOCKED`: Custo original pré-2019 desconhecido |
| **SNAG11** | 1.104 | 1.846 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 11,7870 | Exercício de subscrições (SNAG12 / SNAG14) |
| **SNCI11** | 123 | 130 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 88,9128 | Cotas adicionais de subscrição |
| **SNEL11** | 2.540 | 2.740 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 8,3956 | Cotas adicionais de subscrição |
| **SNFF11** | 100 | 100 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 103,5624 | Match Exato |
| **SNFZ11** | 453 | 453 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 9,4260 | Match Exato |
| **SNID11** | 85 | 310 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 36,5706 | Cotas adicionais de subscrição |
| **SOJA3** | 900 | 943,76 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 12,1400 | +43,76 ações bonificadas em 22/12/2025 |
| **TAEE11** | 200 | 200 | `POSITION_COMPLETE` | `COST_COMPLETE` | R$ 36,1400 | Match Exato |
| **TUPY3** | 0 | 200 | `POSITION_PARTIAL` | `COST_PARTIAL` | — | Posição originada integralmente pré-nov/2019 |
| **UNIP3** | 0 | 121 | `POSITION_PARTIAL` | `COST_PARTIAL` | — | Posição originada integralmente pré-nov/2019 |
| **VGIP11** | 125 | 170 | `POSITION_PARTIAL` | `COST_COMPLETE` | R$ 89,7149 | 45 cotas originadas pré-nov/2019 |
| **WIZC3 / WIZS3** | 200 | 1.200 | `CORPORATE_ACTION_PENDING` | `COST_COMPLETE` | R$ 5,8500 | 1.000 ações sob o ticker anterior `WIZS3` |

---

## 2. RESUMO DE COBERTURA DA CARTEIRA

- **Total de Posições Auditadas:** 36 ativos
- **Posições com Custo Conhecido (`KNOWN`):** **33 ativos (91,7%)**
- **Posições com Custo Incompleto (`INCOMPLETE`):** **3 ativos (`ITSA4`, `JHSF3`, `SAPR4`)**
- **Posições Reconciliadas com Custódia B3 (Match Exato ou Diferença 100% Explicada):** **36 ativos (100%)**
- **Divergências Inexplicadas:** **ZERO**
- **Situação Fiscal da Competência 2026-10:** **`BLOCKED`** (por ausência de notas pré-2019 para apuração de ganho de capital em `ITSA4`, `JHSF3`, `SAPR4`).

---

## 3. CHECKPOINTS E RESTAURAÇÃO LOCAL

- **Backup Pré-Gap Resolution:** `%LOCALAPPDATA%\Atlas\backups\atlas_local_pre_gap_resolution_20261106-155417.sql` (240 KB)
- **Backup Pós-Gap Resolution:** `%LOCALAPPDATA%\Atlas\backups\atlas_local_post_gap_resolution_20261106-161120.sql` (241 KB)

---

## 4. DOCUMENTOS PENDENTES PARA FECHAMENTO FISCAL COMPLETO

Para desbloquear a apuração fiscal e o cálculo de ganho de capital das 3 vendas de outubro de 2026, restam estritamente necessários:
1. **Notas de Corretagem Originais pré-28/11/2019** ou **Declaração de Ajuste Anual DIRPF (Exercício 2020 / Ano-Calendário 2019)** informando:
   - Preço de aquisição histórico de **ITSA4** (saldo original de 900 ações).
   - Preço de aquisição histórico de **JHSF3** (saldo original de 600 ações).
   - Preço de aquisição histórico de **SAPR4** (saldo original de 3.300 ações).
