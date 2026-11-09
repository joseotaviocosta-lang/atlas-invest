# PROJECT ATLAS — APP-16C: BENCHMARK DATA SOURCE COMPLETION

## 1. Contexto & Diagnóstico

- **Data / Hora**: 09/11/2026 12:40 UTC (09:40 BRT)
- **Runtime**: `DESKTOP_LOCAL_OWNER`
- **Database**: `atlas_local` (PostgreSQL 18 na porta 5434)
- **Status Anterior**: `APP_16B_MACRO_DATA_COMPLETENESS_COMPLETE`
  - Selic Meta, Selic Efetiva, IPCA e PTAX sincronizados com fontes oficiais (Bacen SGS / IBGE).
  - Ibovespa em status `OFFICIAL_SOURCE_UNAVAILABLE` (UI: `—` / `Integração ainda não disponível`).
- **Objetivo da APP-16C**:
  - Avaliar e selecionar fonte confiável e auditável para o benchmark Ibovespa.
  - Implementar provedor, persistência idempotente em `macro_observations` e apresentação honesta nas UIs Today e Market.
  - Assegurar resiliência offline (last-known-good) e zero regressão nos demais indicadores e cotações de ativos (36/36).

---

## 2. Auditoria e Discovery de Fontes

| Fonte Candidata | Classificação | Suporte a Nível do Índice | Autenticação / Cota | Veredito |
|---|---|---|---|---|
| **B3 Oficial (Portal/API Pública)** | `OFFICIAL` | Inexistente em REST público gratuito. Apenas composição da carteira (`GetPortfolioDay`). Nível intradiário/fechamento requer feed pago contratado (Market Data B3). | Sem endpoint REST gratuito para fechamento. | **Inviável para consumo direto sem contrato de feed pago B3.** |
| **BRAPI Autenticada (`^BVSP`)** | `THIRD_PARTY_AUTHENTICATED` | **Sim**. Ticker `^BVSP` retorna pontos de fechamento diário (`regularMarketPrice`), variação (`regularMarketChange`), data/hora (`regularMarketTime`) e histórico diário (`historicalDataPrice`). | Chave de API já configurada e armazenada com segurança no Windows Credential Manager (`Project Atlas`). | **Selecionada**. Provider homologado e auditado para o ecossistema Atlas Desktop. |
| **BRAPI (`IBOV`)** | `UNSUITABLE` | Retorna `404 Not Found` (ticker não existe na base da BRAPI). | N/A | **Descartado**. |
| **ETFs de Índice (`BOVA11`, `SMAL11`)** | `UNSUITABLE` | Retorna preço de cota em reais (ex.: `BOVA11` = R$ 165,93), não a pontuação do índice. | N/A | **Estritamente proibido** confundir cota de ETF com pontuação do benchmark. |

### Racional da Escolha
A BRAPI provê a cotação pontual exata do Índice Bovespa através do símbolo canônico `^BVSP`, refletindo a pontuação oficial da B3 (ex.: 168.498,45 pontos em 09/11/2026). Como a chave de API já reside no cofre de credenciais do Windows (`Project Atlas` / `brapi-api-key`) e foi validada na APP-16A, sua reutilização é direta, segura e auditável.

---

## 3. Implementação Técnica

### 3.1 Contrato e Provedor (`packages/market-data`)
- **Tipo de Série**: Estendido `MacroSeriesId` para incluir `'IBOVESPA'`:
  ```typescript
  export type MacroSeriesId = 'IPCA' | 'SELIC_TARGET' | 'SELIC_EFFECTIVE' | 'PTAX' | 'IBOVESPA';
  ```
- **Provedor Dedicado**: Criado `BrapiMacroBenchmarkProvider` implementando `IMacroDataProvider`.
  - Endpoint: `https://brapi.dev/api/quote/%5EBVSP?range=1mo&interval=1d`
  - Autenticação: cabeçalho `Authorization: Bearer <token>`
  - Extração: processa tanto a cotação em tempo real (`regularMarketPrice`) quanto o histórico diário (`historicalDataPrice`).
  - Unidade: `INDEX_POINTS`
  - Frequência: `DAILY`
  - Fonte (Provenance): `BRAPI` (nunca rotulado falsamente como "B3 Oficial").

### 3.2 Avaliação de Freshness
- Em `evaluateMacroFreshness('IBOVESPA', referenceDate)`:
  - Classificado como série diária de pregão (mesma regra de `SELIC_EFFECTIVE` e `PTAX`).
  - `daysDiff <= 4 ? 'FRESH' : 'STALE'`: acomoda fechamento de sexta-feira visto na segunda-feira subsequente e feriados prolongados de até 3 dias.

### 3.3 Casos de Uso na API (`apps/api`)
- `SyncMacroDataUseCase`:
  - Inclui `IBOVESPA` no pipeline de sincronização.
  - Falha isolada por indicador: se a BRAPI falhar ou o token for inválido, os 4 indicadores oficiais (Bacen/IBGE) continuam sincronizados normalmente (`overallStatus: 'PARTIAL'`).
  - Idempotência: inserções repetidas com os mesmos valores registram `UNCHANGED` e incrementam `fetchCount` sem criar duplicatas.
- `GetMacroContextUseCase`:
  - Consulta `macroRepository.findLatest('IBOVESPA')`.
  - Formatação com separadores de milhar brasileiros: `168.498 pts`.
  - Metadados: `referenceDateFormatted` (ex.: `09/11/2026`), `source: 'BRAPI'`, `status: 'AVAILABLE'`.
  - Fallback fail-closed: se a série não estiver na base, responde com `OFFICIAL_SOURCE_UNAVAILABLE` e valor `—`.

### 3.4 Interface do Usuário (`apps/atlas-app`)
- `MacroIndicatorsGrid.tsx`:
  - Card `IBOVESPA`:
    - Valor principal: `168.498 pts`
    - Subtítulo: `Fechamento 09/11/2026 • BRAPI`
  - Utilizado tanto na rota Hoje (`TodayRoute.tsx`) quanto na rota Mercado (`MarketRoute.tsx`).

---

## 4. Evidências de Teste e Sincronização Real

### 4.1 Consulta Real e Ingestão no Banco de Dados (`atlas_local`)

| Benchmark | Símbolo | Provedor | HTTP | Valor Pontos | Data Referência | Unidade | Freshness | Status |
|---|---|---|---|---|---|---|---|---|
| **Ibovespa** | `^BVSP` | BRAPI | 200 OK | `168.498,45` | 09/11/2026 | `INDEX_POINTS` | `FRESH` | `AVAILABLE` |
| **Ibovespa (Hist.)** | `^BVSP` | BRAPI | 200 OK | `168.499,00` | 06/11/2026 | `INDEX_POINTS` | `FRESH` | `AVAILABLE` |
| **Ibovespa (Hist.)** | `^BVSP` | BRAPI | 200 OK | `166.192,00` | 05/11/2026 | `INDEX_POINTS` | `FRESH` | `AVAILABLE` |

### 4.2 Idempotência Auditada no Banco de Dados
- **Execução 1**: 10 observações do Ibovespa inseridas com sucesso.
- **Execução 2**: 0 inserções, 10 `UNCHANGED`. Contagem da tabela `macro_observations` permaneceu estritamente estável (zero duplicações).

### 4.3 Resiliência Offline (Last-Known-Good)
- Ao simular queda de conectividade ou rede inexistente, `GetMacroContextUseCase` consulta exclusivamente a tabela local `macro_observations`.
- A UI exibe os últimos dados válidos persistidos com indicador de procedência `BRAPI`, sem zerar ou quebrar a tela.

### 4.4 Regressão dos Demais Indicadores e Cotações
- **Selic Meta**: `13,75% a.a.` (Meta Copom 09/12/2026) • `AVAILABLE`
- **Selic Efetiva**: `13,65% a.a.` (Taxa anualizada 06/11/2026) • `AVAILABLE`
- **IPCA**: `0,82% no mês` (Variação mensal 09/2026) • `AVAILABLE`
- **Dólar PTAX**: `R$ 5,5007` (Fechamento Venda 06/11/2026) • `AVAILABLE`
- **Cotações de Carteira**: 37 cotações persistidas (36 de 36 ativos de custódia mantidos).

---

## 5. Suíte de Testes Automatizados

- `pnpm test:market-data`: **15 arquivos / 138 testes aprovados** (incluindo `app-16c-benchmark.test.ts`).
- `pnpm test:app`: **18 arquivos / 244 testes aprovados** (incluindo testes de renderização do Ibovespa).
- `pnpm test:api-client`: **2 arquivos / 35 testes aprovados**.
- `pnpm --filter @atlas/api typecheck`: **Aprovado (0 erros)**.
- `pnpm --filter @atlas/app typecheck`: **Aprovado (0 erros)**.
- `cargo check --manifest-path apps/atlas-app/src-tauri/Cargo.toml`: **Aprovado (0 erros)**.
- `git diff --check`: **Aprovado (sem marcadores de conflito ou quebras de formatação)**.

---

## 6. Build, Empacotamento e Verificação em Executável Instalado

- **API Bundle**: Gerado em `apps/api/dist/bundle.cjs`.
- **Runtime Standalone**: Empacotado em `apps/atlas-app/runtime/`.
- **Frontend Vite**: Compilado em `apps/atlas-app/dist/`.
- **Instalador NSIS**:
  - Arquivo: `apps/atlas-app/src-tauri/target/release/bundle/nsis/Atlas_0.1.0-pilot.1_x64-setup.exe`
  - Tamanho: 40.15 MiB
  - SHA-256: `D3B42FABBF432EAB6225F38264E677118CD5ACE379A045EB2B398C6545EEBB8F`
- **Instalação Silenciosa**: Executada com `/S` sobre `C:\Users\joseo\AppData\Local\Atlas\atlas-app.exe`.
- **Verificação de 3 Ciclos de Inicialização do Executável Instalado**:
  - **Ciclo 1**: Processo iniciado -> API `/ready` respondeu 200 OK -> `/api/v1/macro/context` retornou `IBOVESPA: 168.498 pts | AVAILABLE | BRAPI` -> Finalizado com sucesso.
  - **Ciclo 2**: Processo iniciado -> API `/ready` respondeu 200 OK -> `/api/v1/macro/context` retornou `IBOVESPA: 168.498 pts | AVAILABLE | BRAPI` -> Finalizado com sucesso.
  - **Ciclo 3**: Processo iniciado -> API `/ready` respondeu 200 OK -> `/api/v1/macro/context` retornou `IBOVESPA: 168.498 pts | AVAILABLE | BRAPI` -> Finalizado com sucesso.

---

## 7. Status Final

`APP_16C_BENCHMARK_DATA_COMPLETION_COMPLETE`
