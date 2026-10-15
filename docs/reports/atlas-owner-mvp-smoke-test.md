# Atlas Local Owner MVP — Practical Smoke Test Script

**Scope**: Manual end-to-end human verification of the core Atlas application with owner test data.  
**Prerequisites**: Web on `http://localhost:3000`, API on `http://localhost:3001`, PostgreSQL 16 on `localhost:5434`.

---

## 1. Authentication & Session Survival

1. Access `http://localhost:3000/login`.
2. Enter owner credentials (`jose.otavio.costa@gmail.com`).
3. Confirm redirect to `/today` with user greeting and real cost basis display.
4. Press `F5` (browser reload) on `/today`. Confirm session survives without redirect to `/login`.

---

## 2. Carteira Principal & Derived Positions

1. Click **"Ver Carteiras →"** on `/today` or use the sidebar **"Carteira"** link.
2. Verify that **"Carteira Principal"** is selected.
3. In the **"Ativos"** tab, confirm derived positions:
   - **PETR4**: 200 cotas • Preço médio ~R$ 22,02 • Custo total ~R$ 4.404,90.
   - **VALE3**: 15 cotas • Preço médio R$ 35,00 • Custo total R$ 525,00.
   - Total em custódia: R$ 4.929,90 across 2 assets.

---

## 3. Rentabilidade Panel (Wired)

1. In the Carteira tabs, click **"Rentabilidade"**.
2. Confirm the card explains the performance capabilities and offers the CTA:
   - **"Acessar Painel de Rentabilidade →"**
3. Click the button.
4. Verify URL routes to `/portfolio/performance?portfolioId=...`.
5. Observe the Performance dashboard:
   - Period selector (`1Y`, `YTD`, `ALL`).
   - TWR / Inception metrics: renders real calculation or explicit unavailable states.
   - No synthetic or fake market values.

---

## 4. Proventos Panel & Manual Entry

1. In the Carteira tabs, click **"Proventos"**.
2. Confirm the card offers two actions:
   - **"Acessar Painel de Proventos →"**
   - **"+ Lançar Provento"**
3. Click **"+ Lançar Provento"**.
4. Confirm modal opens with "Dividendo" pre-selected.
5. In "Buscar Ativo", type `PETR` and select `PETR4 — Petróleo Brasileiro S.A. Petrobras`.
6. Enter an isolated test income:
   - Valor: `25.00`
   - Data: `2026-10-15`
   - Conta: `XP Investimentos`
7. Click **"Salvar Operação"**.
8. Confirm toast notification: _"Operação registrada com sucesso!"_.
9. Click **"Acessar Painel de Proventos →"** and verify the entry appears under Proventos timeline.

---

## 5. Guided Append-Only Transaction Correction Flow

1. Return to `/portfolio` and open the **"Operações"** tab.
2. Locate an operation in the list (e.g., a test entry).
3. Click the **"Corrigir"** button on the card.
4. Confirm the **"Corrigir Operação no Livro-Razão"** modal opens with:
   - Immutability disclaimer explaining that original records are never deleted and a compensating entry will be appended.
   - Operation summary (Type, Asset, Qtd, Price).
5. Enter a reason: `Correção de teste de fumaça`.
6. Click **"Confirmar Reversão Compensatória"**.
7. Confirm success toast: _"Lançamento compensatório registrado com sucesso no livro-razão!"_.
8. Confirm both the original transaction and the new compensating entry remain visible in the history (append-only auditability).

---

## 6. Fiscal Monthly (DARF 6015) & Payment Support

1. In the sidebar, navigate to **"Fiscal"** (`/tax`).
2. Verify competence `10/2026`:
   - Day Trade result: R$ 75,00.
   - Imposto devido: R$ 15,00.
   - Status: **"DARF 6015 — Em Andamento"** (PROVISIONAL).
3. Click to open **"Suporte ao Pagamento"** for 10/2026:
   - Confirm honest disclaimer: obligation is provisional because the competence is still open.
   - Confirm evidence registration is properly disabled (prevents premature receipt upload).

---

## 7. Annual IRPF & DIRPF CSV Export

1. On the Fiscal page, select the annual tab / calendar year **2026** (Exercício 2027).
2. Confirm **Bens e Direitos** displays the 2 custody assets (PETR4 and VALE3).
3. Confirm **Renda Variável** shows the Day Trade operation (R$ 75,00).
4. In **Prontidão e Evidências Anuais**, confirm:
   - **Posições de Encerramento (31/12)**: `Pronto para IRPF` (Green success badge, 0 pendências).
5. Locate the **"Relatório de Apoio à DIRPF"** section.
6. Select format **CSV (apoio)**.
7. Click **"Exportar Pacote de Apoio"** (or **"Baixar CSV"**).
8. Verify file downloads with name `atlas-irpf-2026-relatorio-apoio.csv`.
9. Open the file in a text editor:
   - UTF-8 with Brazilian accents preserved.
   - Semicolon (`;`) delimiter.
   - Header carries legal disclaimer banner.
   - Sections A, B, C, D, E, F present with PETR4 and VALE3 data.
   - No formula injection characters (`=`, `+`, `-`, `@` escaped with single quote).

---

## 8. Logout & Session Closure

1. In the sidebar, navigate to **"Perfil"** (`/profile`).
2. Click **"Sair da Conta"**.
3. Confirm redirect to `/login`.
4. Try to navigate directly to `/portfolio`.
5. Confirm immediate redirect to `/login?redirect=%2Fportfolio`.
