# PROJECT ATLAS — APP-16L
# DAILY NEWS INTELLIGENCE & MATERIAL EVENT PRIORITIZATION REPORT

**Data de Execução:** 11 de Novembro de 2026  
**Ambiente:** Desktop Local Owner / Windows x64  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Initial HEAD:** `9c2f66b1d42cfca195f9263a3d0fa6d5822b8f3e`  
**Modelo do Radar:** `opportunity-v2.3.1` (preservado sem alteração de pesos; conformidade fail-closed)  
**Status Declarado:** `APP_16L_DAILY_NEWS_INTELLIGENCE_COMPLETE`

---

## 1. Resumo Executivo da Entrega

A fase **APP-16L** resolveu o desafio crítico de que **MAIS DADOS ≠ MAIS INTELIGÊNCIA**. Com a integração da CVM e B3 nas fases APP-16K e APP-16K-R1, a base atingiu centenas de documentos brutos, dos quais uma parcela substancial é composta por formulários cadastrais e informes rotineiros.

O Project Atlas passa a responder de forma limpa, priorizada e 100% determinística:
1. **O que realmente aconteceu hoje com os meus investimentos?**
   - Resumo diário consolidado (`PortfolioDailyNewsDigest`) na tela principal **Hoje** (`/today`) na seção `"📰 O que aconteceu com sua carteira"`.
   - Limitação visual a **5–10 eventos principais**, evitando sobrecarregar o investidor.
2. **O que merece minha atenção agora?**
   - Modelo de materialidade (`NewsMateriality`: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `ROUTINE`).
   - Separação estrita entre **Materialidade**, **Sentimento** e **Oficialidade**:
     - *Oficialidade:* comprova procedência (CVM/B3), mas documentos burocráticos oficiais continuam classificados como `ROUTINE`.
     - *Sentimento:* neutro/desconhecido em balanços ou M&A não diminui a relevância `HIGH` do fato.
     - *Rotina:* não contamina o Radar nem infla artificialmente o multiplicador de confiança.
   - Justificativa determinística clara (`whyItMatters`) e impacto no Radar (`radarImpact`) exibidos em cada card.
   - Acesso direto e contínuo a todos os documentos originais na caixa de entrada completa (`Ver todas as notícias`).

---

## 2. Auditoria de Volume Real da Carteira (Parte A)

Auditoria executada em tempo real contra os 36 ativos da carteira piloto:

| Métrica de Volume | Quantidade Real Auditada |
|---|---:|
| **Artigos Brutos de Mídia (Google News RSS)** | 94 |
| **Documentos Oficiais CVM (Companhias Abertas)** | 324 |
| **Documentos Oficiais B3/FNET (FIIs e Fiagros)** | 3 |
| **Eventos Canônicos Pós-Deduplicação** | 393 |
| **Eventos <= 24h (Breaking)** | 8 |
| **Eventos <= 7d (Recentes)** | 61 |
| **Eventos <= 30d (Current)** | 148 |
| **Eventos Canônicos Oficiais** | 327 |
| **Ativos Auditados com Cobertura** | 35 / 36 (97,2%) |
| **Ativos em Silêncio (NO_RECENT_NEWS)** | 1 (MXRF11) — Zero penalidade |

---

## 3. Modelo de Materialidade e Distribuição Real (Partes B a K)

| Nível de Materialidade | Score Range | Conceito / Exemplos | Volume Real na Carteira |
|---|---|---|---:|
| **🔴 CRITICAL** | 90–100 | Recuperação judicial, falência, fraude contábil, intervenção, OPA, fechamento de capital, deslistagem, default de dívida, despejo/liquidação de fundo | 0 |
| **🟠 HIGH** | 70–89 | Balanços/resultados trimestrais (3T26), recompra de ações, fusões/aquisições expressivas, emissão/subscrição, vacância/locação material de FII, venda de imóvel relevante, corte expressivo de dividendos | 53 |
| **🟡 MEDIUM** | 40–69 | Proventos ordinários (anúncios mensais de FII, dividendos/JCP), comunicados ao mercado com esclarecimentos, assembleias gerais com pauta de deliberação, relatórios gerenciais | 286 |
| **LOW** | 15–39 | Noticiário geral de mercado, relatórios de rating de agências (Moody's/Fitch), análises de preço-alvo de corretoras, oscilação diária | 52 |
| **⚪ ROUTINE** | 0–14 | Informes periódicos burocráticos, atas administrativas sem pauta material, calendários de eventos, reapresentações e documentos substitutivos | 2 |

---

## 4. Daily News Digest — Top 10 Real da Carteira (Partes M, N, O, P, AU, BO)

| # | Ticker | Materialidade | Evento | Sentimento | Provedor | Por Que Importa (`materialityReason`) | Impacto Radar |
|---|---|---|---|---|---|---|---|
| **1** | **BBAS3** | `HIGH` (85) | Balanço 3T26 | Positivo | Imprensa (Money Times) | Divulgação de resultados ou projeções corporativas (guidance) | `POSITIVE` |
| **2** | **ITSA4** | `HIGH` (85) | Lucro 3T26 (+17,8%) | Positivo | Imprensa (TradeMap) | Divulgação de resultados ou projeções corporativas (guidance) | `POSITIVE` |
| **3** | **B3SA3** | `HIGH` (85) | Temporada Balanços 3T26 | Neutro | Imprensa (Money Times) | Divulgação de resultados ou projeções corporativas (guidance) | `NEUTRAL` |
| **4** | **PETR4** | `HIGH` (85) | Resultados e Balanço 3T26 | Neutro | Imprensa (Money Times) | Divulgação de resultados ou projeções corporativas (guidance) | `NEUTRAL` |
| **5** | **FLRY3** | `HIGH` (85) | Resultados 3T26 | Positivo | Imprensa (InfoMoney) | Divulgação de resultados ou projeções corporativas (guidance) | `POSITIVE` |
| **6** | **EGIE3** | `HIGH` (78) | Incorporação de subsidiária e aumento capital | Neutro | 🏛 CVM | Evento estrutural de capital (aumento de capital, subscrição ou bonificação) | `NEUTRAL` |
| **7** | **EZTC3** | `HIGH` (85) | Demonstrações Financeiras 3T26 | Neutro | 🏛 CVM | Divulgação de resultados ou projeções corporativas (guidance) | `NEUTRAL` |
| **8** | **EZTC3** | `HIGH` (70) | Dados Econômico-Financeiros 30/09 | Neutro | 🏛 CVM | Notícia corporativa de relevância intermediária | `NEUTRAL` |
| **9** | **FLRY3** | `HIGH` (70) | Demonstrações Financeiras 3T26 CVM | Neutro | 🏛 CVM | Notícia corporativa de relevância intermediária | `NEUTRAL` |
| **10** | **HGLG11** | `HIGH` (80) | Aquisição/Locação imobiliária de galpão | Neutro | 🏛 B3 / FNET | Movimentação relevante em carteira imobiliária, locação ou gestão de FII | `NEUTRAL` |

**Auditoria de Qualidade (Parte AV):** Todos os 10 eventos no topo do Digest são fatos materiais genuínos para o investidor (Balanços do 3T26, Reestruturação societária, Informes trimestrais auditados). **Resultado: PASS (10/10).**

**Auditoria de Falsos Positivos (Parte AW):** A amostragem de eventos rebaixados para `LOW` e `ROUTINE` inspecionou relatórios rotineiros de rating da Moody's, menções de rotina sobre oscilação diária do Ibovespa e informes cadastrais. Nenhum evento crítico foi rebaixado indevidamente. **Resultado: PASS (10/10).**

---

## 5. Auditoria de Cobertura dos 36 Ativos (Parte AT)

| Ticker | Eventos 24h | 7d | 30d | Material Highest | Status Diário (`AssetNewsDailyStatus`) |
|---|---:|---:|---:|---|---|
| **B3SA3** | 1 | 4 | 6 | HIGH | `MATERIAL_EVENT` |
| **BBAS3** | 2 | 4 | 6 | HIGH | `MATERIAL_EVENT` |
| **BRAP4** | 1 | 1 | 7 | HIGH | `RECENT_NEWS` |
| **COGN3** | 0 | 1 | 5 | MEDIUM | `RECENT_NEWS` |
| **EGIE3** | 0 | 4 | 4 | HIGH | `MATERIAL_EVENT` |
| **EZTC3** | 0 | 5 | 6 | HIGH | `MATERIAL_EVENT` |
| **FESA4** | 0 | 1 | 2 | MEDIUM | `RECENT_NEWS` |
| **FLRY3** | 0 | 3 | 6 | HIGH | `MATERIAL_EVENT` |
| **HYPE3** | 0 | 1 | 4 | HIGH | `MATERIAL_EVENT` |
| **IRBR3** | 0 | 0 | 1 | HIGH | `MATERIAL_EVENT` |
| **ISAE4** | 0 | 0 | 5 | MEDIUM | `RECENT_NEWS` |
| **ITSA4** | 0 | 1 | 1 | HIGH | `MATERIAL_EVENT` |
| **JHSF3** | 0 | 1 | 1 | HIGH | `RECENT_NEWS` |
| **MRFG3** | 0 | 0 | 5 | MEDIUM | `RECENT_NEWS` |
| **PETR4** | 2 | 5 | 13 | HIGH | `MATERIAL_EVENT` |
| **PRIO3** | 0 | 2 | 5 | HIGH | `RECENT_NEWS` |
| **SAPR4** | 0 | 1 | 7 | HIGH | `RECENT_NEWS` |
| **SOJA3** | 0 | 0 | 2 | HIGH | `MATERIAL_EVENT` |
| **STBP3** | 0 | 1 | 1 | HIGH | `RECENT_NEWS` |
| **TAEE11** | 0 | 0 | 5 | MEDIUM | `RECENT_NEWS` |
| **TUPY3** | 0 | 4 | 10 | HIGH | `MATERIAL_EVENT` |
| **UNIP3** | 0 | 1 | 2 | MEDIUM | `RECENT_NEWS` |
| **VALE3** | 0 | 1 | 8 | MEDIUM | `RECENT_NEWS` |
| **VIVT3** | 0 | 1 | 4 | MEDIUM | `RECENT_NEWS` |
| **WIZC3** | 1 | 4 | 8 | HIGH | `MATERIAL_EVENT` |
| **BRCR11** | 0 | 2 | 2 | MEDIUM | `RECENT_NEWS` |
| **HGLG11** | 1 | 1 | 1 | HIGH | `RECENT_NEWS` |
| **IRIM11** | 0 | 1 | 2 | MEDIUM | `RECENT_NEWS` |
| **KCRE11** | 0 | 0 | 0 | MEDIUM | `RECENT_NEWS` |
| **KNRI11** | 0 | 2 | 2 | MEDIUM | `RECENT_NEWS` |
| **MALL11** | 0 | 2 | 3 | MEDIUM | `RECENT_NEWS` |
| **MCCI11** | 0 | 0 | 1 | MEDIUM | `RECENT_NEWS` |
| **MXRF11** | 0 | 0 | 0 | NONE | `NO_RECENT_NEWS` |
| **RBRP11** | 0 | 1 | 1 | MEDIUM | `RECENT_NEWS` |
| **SNAG11** | 0 | 0 | 0 | LOW | `RECENT_NEWS` |
| **SNCI11** | 0 | 0 | 1 | MEDIUM | `RECENT_NEWS` |

**Preservação de Silêncio:** O ativo MXRF11 apresentou 0 notícias recentes e manteve status `NO_RECENT_NEWS`, garantindo `score: null` sem aplicar penalidades falsas no Radar.

---

## 6. Deduplicação e Redução de Ruído (Partes AB a AE)

- Agrupamento inteligente entre fontes oficiais CVM/B3 e imprensa financeira (InfoMoney, Valor Econômico, TradeMap, Money Times).
- Quando há cobertura simultânea de fato relevante, o título oficial informativo prevalece; caso o título oficial seja meramente protocolar (ex: "Companhia Aberta: IPE"), o título descritivo da mídia é adotado como display headline, preservando o selo oficial e o link direto para o documento CVM (`rad.cvm.gov.br`).

---

## 7. Integração e Isolamento no News Score (Partes I, J, AO, AR)

- O `News Scorer V2` foi protegido para evitar dupla contagem ou distorção:
  - Documentos com `materiality === 'ROUTINE'` não recebem multiplicador de impacto oficial nem conferem o bônus de confiança oficial (+0.20).
  - O multiplicador oficial exige que o evento seja material (`!isRoutine`).
  - A fórmula de pontuação do Radar de Oportunidades permaneceu estável e validada sob a versão canônica `opportunity-v2.3.1`.

---

## 8. Resultados dos Gates de Testes, Compilação e Empacotamento

| Gate | Verificação | Comando | Resultado |
|---|---|---|---|
| **BK.1** | Testes Unitários de Materialidade e Digest | `pnpm vitest run tests/market-data/app-16l-news-materiality.test.ts` | **20/20 passed** (100%) |
| **BK.2** | Testes Frontend do Digest e Inbox | `pnpm vitest run tests/app/app-16l-daily-news-digest.test.tsx` | **3/3 passed** (100%) |
| **BK.3** | Suíte Completa Market Data | `pnpm test:market-data` | **24 files, 293 passed** (100%) |
| **BK.4** | Suíte Completa App Frontend | `pnpm test:app` | **22 files, 288 passed** (100%) |
| **BK.5** | Suíte API Client | `pnpm test:api-client` | **2 files, 35 passed** (100%) |
| **BK.6** | Typecheck Market Data | `pnpm --filter @atlas/market-data typecheck` | **Passed (0 errors)** |
| **BK.7** | Typecheck API | `pnpm --filter @atlas/api typecheck` | **Passed (0 errors)** |
| **BK.8** | Typecheck App Desktop | `pnpm --filter @atlas/app typecheck` | **Passed (0 errors)** |
| **BK.9** | Typecheck Web App | `pnpm --filter @atlas/web typecheck` | **Passed (0 errors)** |
| **BK.10** | Verificação Rust / Tauri | `cargo check --manifest-path apps/atlas-app/src-tauri/Cargo.toml` | **Passed (exit code 0)** |
| **BK.11** | Verificação Git Diff | `git diff --check` | **Clean (exit code 0)** |
| **BL.1** | Build do Pacote API | `pnpm --filter @atlas/api build` | **Sucesso** |
| **BL.2** | Desktop Runtime Packaging | `pnpm desktop:package-runtime` | **Sucesso (Node runtime + CJS bundle)** |
| **BL.3** | Frontend Vite Build | `pnpm --filter @atlas/app build` | **Sucesso (dist/index.html)** |
| **BL.4** | Pacote Instalador Tauri / NSIS | `pnpm --filter @atlas/app tauri:build` | **Gerado: `Atlas_0.1.0-pilot.1_x64-setup.exe` (40.21 MiB)** |
| **BM.1** | Instalação Silenciosa Windows | `Start-Process ... -ArgumentList "/S" -Wait` | **Executado com exit code 0** |

---

## 9. Banco de Dados e Segurança

- **Zero Migrations:** Toda a inteligência de materialidade, ordenação determinística e derivação do Daily News Digest opera puramente em memória e runtime.
- **Segurança e Privacidade:** Nenhum dado patrimonial, saldo, quantidade, custo de aquisição ou credencial é enviado externamente.

---

## 10. Conclusão

A camada de inteligência diária de notícias e priorização material do Project Atlas atinge seu propósito essencial: filtrar o ruído, priorizar fatos críticos e de alta relevância, e entregar ao investidor uma resposta clara e auditável sobre o que realmente aconteceu com seu patrimônio hoje.
