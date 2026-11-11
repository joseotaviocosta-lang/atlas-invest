# PROJECT ATLAS — APP-16L-R1: MATERIALITY PRECISION & REGULATORY NOISE REDUCTION REPORT

**Data:** 11 de Novembro de 2026  
**Status do Hotfix:** `APP_16L_R1_MATERIALITY_PRECISION_COMPLETE`  
**Status Restaurado:** `APP_16L_DAILY_NEWS_INTELLIGENCE_COMPLETE`  
**Parent Commit:** `9b1401a38809a7480e8ea05b92f80807b1c0b71a`  
**Modelo de Valuation:** `opportunity-v2.3.1` (inalterado)  
**Banco de Dados:** Zero migrations, zero schema changes  

---

## 1. Contexto e Diagnóstico

Na auditoria pós-implementação da APP-16L, observou-se excesso de classificação de eventos como material:
- **Baseline Audit (APP-16L):** De 393 eventos canônicos, 53 foram classificados como `HIGH` e 286 como `MEDIUM` (totalizando 339 eventos materiais, ou ~86%). Apenas 2 eventos foram para `ROUTINE` e 52 para `LOW`.
- **Causas Raízes Identificadas:**
  1. `if (input.official) return MEDIUM`: tratava oficialidade regulatória (proveniência/confiabilidade) como materialidade econômica intrínseca, elevando centenas de formulários administrativos (ex.: Art. 11 da Instrução CVM 358, informes cadastrais, reapresentações) a `MEDIUM`.
  2. `if (input.importance >= 4) return HIGH`: heurística de importância genérica forçava `HIGH` sem evidência semântica de catalisador.
  3. Contexto de Resultados amplo: matérias de preview/calendário da imprensa (ex.: *"3T26: Petrobras, BB, B3... veja quais empresas divulgam balanços nesta semana"*) eram promovidas a `HIGH (85)`.
  4. Falta de segregação entre AGO rotineira e AGE transformacional.

---

## 2. Implementações Realizadas

### A. Pre-Filter de Compliance Periódico e Rotina (`ROUTINE`)
Implementado filtro regex determinístico antes dos níveis materiais para:
- Art. 11 / Art. 12 da CVM (negociação de administradores e pessoas ligadas);
- Demonstrações Financeiras em Inglês (versão traduzida);
- Calendário de eventos corporativos e comprovantes de entrega;
- Relatórios internos de auditoria e comitês de assessoramento sem divulgação de números;
- Termos de posse e renúncia de membros de comitê.

### B. Segregação Estrita de Resultados (`EARNINGS_SCHEDULE` vs `EARNINGS_ACTUAL`)
- **Calendário / Expectativa / Agenda:** Termos como *"veja quais empresas divulgam"*, *"calendário de resultados"*, *"o que esperar"* sem métricas consolidadas são classificados como `LOW (25)`.
- **Resultados Efetivos:** Exigência de métricas explícitas (*lucro líquido*, *ebitda*, *receita líquida*, *divulga resultado*, *reporta lucro*) ou evento `EARNINGS` com demonstração consolidada para classificação como `HIGH (85)`.

### C. Fatos Relevantes Condicionais
- `FACT_RELEVANT` com termos catalisadores (M&A, recompra, nova concessão, contrato relevante, aumento de capital, descoberta): `HIGH (75)`.
- `FACT_RELEVANT` genérico sem gatilho econômico transformador: `MEDIUM (50)`.

### D. Assembleias Ordinárias (AGO) vs Extraordinárias (AGE)
- AGE / Mudança Estatutária / Incorporação / Cisão: `HIGH (70)`.
- AGO / Aprovação rotineira de contas / balanço: `LOW (25)`.

### E. FII Real Estate & Management
- Operações imobiliárias de impacto (locação, devolução/vacância, venda/aquisição de imóvel): `HIGH (80)`.
- Relatórios gerenciais e informes mensais rotineiros: `LOW (25)`.

### F. Remoção dos Fallbacks Indiscriminados
- Removido `if (input.official) return MEDIUM`. Documentos oficiais sem gatilho de materialidade identificado recebem fallback honesto `LOW (20)`.
- Removido `if (input.importance >= 4) return HIGH`.
- Header do Daily Digest atualizado para destacar eventos que merecem atenção (`CRITICAL + HIGH`):  
  *"X eventos relevantes merecem atenção hoje"* ou *"Nenhum evento crítico ou de alta relevância identificado hoje"*.

---

## 3. Comparativo de Distribuição: Antes vs. Depois

Em execução real e determinística sobre os 393 eventos canônicos da carteira auditada de 36 ativos:

| Nível de Materialidade | Antes (APP-16L) | Depois (APP-16L-R1) | Variação (Delta) |
|---|---:|---:|:---:|
| **CRITICAL** | 0 | **0** | — |
| **HIGH** | 53 | **33** | -20 (-37.7%) |
| **MEDIUM** | 286 | **144** | -142 (-49.7%) |
| **LOW** | 52 | **136** | +84 (+161.5%) |
| **ROUTINE** | 2 | **80** | +78 (+3900%) |
| **Total** | 393 | **393** | 0 |

### Caso Canônico Auditado: B3SA3
- **Notícia de Calendário:** *"3T26: Petrobras (PETR4), Banco do Brasil (BBAS3), B3 (B3SA3) e mais; veja quais empresas divulgam balanços nesta semana"*
  - *Antes:* `HIGH (85)` — Divulgação de resultados ou projeções corporativas (guidance)
  - *Depois:* `LOW (25)` — Calendário, expectativa ou agenda de divulgação de resultados corporativos (**CORRIGIDO COM SUCESSO**)
- **Filing Art. 11 CVM:** *"Valores Mobiliários negociados e detidos (art. 11 da Instr. CVM nº 358)"*
  - *Antes:* `MEDIUM (40)` — Comunicação oficial arquivada na CVM / B3
  - *Depois:* `ROUTINE (5)` — Comunicação administrativa ou regulatória periódica rotineira (**CORRIGIDO COM SUCESSO**)

---

## 4. Auditoria de Qualidade dos Top 10 Eventos no Daily Digest

| # | Nível | Score | Ticker | Manchete / Resumo | Justificativa | Avaliação |
|---|---|---:|---|---|---|:---:|
| 1 | HIGH | 85 | PETR4 | PETR4: Fato Relevante — Descoberta de Petróleo em Águas Ultraprofundas | Divulgação oficial com métricas | **PASS** |
| 2 | HIGH | 85 | VALE3 | VALE3: Produção e Vendas 3T26 / Desempenho Operacional | Divulgação de dados operacionais/financeiros | **PASS** |
| 3 | HIGH | 85 | BBAS3 | BANCO DO BRASIL S.A. (BBAS3): Reunião da Administração — Demonstrações Contábeis e Resultado | Divulgação contábil oficial | **PASS** |
| 4 | HIGH | 85 | HYPE3 | HYPERA S/A (HYPE3): Dados Econômico-Financeiros — Press Release 3T26 | Divulgação oficial de resultados trimestrais | **PASS** |
| 5 | HIGH | 85 | JHSF3 | JHSF3: Reunião da Administração — Resultados 2T26 e Programa de Recompra | Resultados e recompra de ações | **PASS** |
| 6 | HIGH | 82 | ITSA4 | ITAÚSA (ITSA4): Comunicado — Programa de Recompra de Ações | Recompra de ações ordinárias e preferenciais | **PASS** |
| 7 | HIGH | 80 | PRIO3 | PRIO S.A. (PRIO3): Fato Relevante — Aquisição de participação em Campo | M&A e aquisição de ativos produtivos | **PASS** |
| 8 | HIGH | 80 | KNRI11 | KINEA RENDA IMOBILIÁRIA (KNRI11): Fato Relevante — Nova Locação Corporativa | Movimentação relevante em carteira de FII | **PASS** |
| 9 | HIGH | 80 | BRCR11 | BTG PACTUAL CORPORATE (BRCR11): Fato Relevante — Devolução e Vacância | Impacto material de vacância em FII | **PASS** |
| 10 | HIGH | 78 | STBP3 | SANTOS BRASIL (STBP3): Reunião da Administração — Aumento de Capital | Evento estrutural de capital social | **PASS** |

---

## 5. Verificação das Suítes de Testes

- `tests/market-data/app-16l-news-materiality.test.ts`: **20/20 PASS**
- `tests/app/app-16l-daily-news-digest.test.tsx`: **3/3 PASS**
- `pnpm test:market-data`: **24 files, 293 tests PASS**
- `pnpm test:app`: **22 files, 288 tests PASS**
- Typechecks (`@atlas/market-data`, `@atlas/api`, `@atlas/app`, `@atlas/web`): **100% CLEAN**
- Rust backend (`cargo check`): **CLEAN**
- Desktop Standalone Installer NSIS (`Atlas_0.1.0-pilot.1_x64-setup.exe`): **Gerado e instalado silenciosamente** (`C:\Users\joseo\AppData\Local\Atlas\atlas-app.exe`).
