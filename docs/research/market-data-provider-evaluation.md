# Avaliação de Provedores de Dados de Mercado (Market Data EOD) — Project Atlas

Data: 2026-10-16  
Fase: Phase 5A (Market Data EOD Foundation + Portfolio Valuation & Allocation)  
Status: CONCLUÍDO

---

## 1. Contexto e Objetivos

O Project Atlas necessita de uma fundação de dados de mercado End-of-Day (EOD) determinística, resiliente e segura para ativos listados na B3 (ações, FIIs, BDRs, ETFs).
Esta avaliação analisa as fontes de dados candidatas para operação local e remota do MVP do Titular, considerando requisitos inegociáveis do Atlas:

- Determinação estrita (valores financeiros exatos, sem números flutuantes arbitrários);
- Disponibilidade de cotações para ativos canônicos do titular (`PETR4`, `VALE3`, `HGLG11`);
- Estabilidade de acesso, limites de requisição e imunidade a bloqueios por desafios bot/DDoS (Cloudflare/WAF);
- Facilidade de mock e determinismo em suítes de testes automatizados e CI.

---

## 2. Provedores Avaliados

### 2.1 Stooq (`https://stooq.com`)

- **Natureza:** Provedor público com endpoints CSV históricos/EOD.
- **Formato:** CSV (`Date,Open,High,Low,Close,Volume`).
- **Sufixo B3:** `.SA` (ex: `PETR4.SA`).
- **Vantagens Históricas:** Já possui classes implementadas em `packages/market-data` (`StooqProviderAdapter`, `StooqHistoricalMarketDataProvider`).
- **Problema Crítico Observado no Teste Real:**
  - O Stooq introduziu um desafio JavaScript obrigatório anti-bot/DDoS (WAF/Cloudflare) retornando `200 OK` com payload HTML/JS (`<noscript>This site requires JavaScript to verify your browser.</noscript>`).
  - Clientes HTTP programáticos comuns (Node.js `fetch`, `axios`, `curl`) falham em obter o CSV, tornando a consulta em tempo de execução instável e sujeita a quebra imediata em conexões automáticas sem emulação completa de navegador.

### 2.2 Brapi (`https://brapi.dev`)

- **Natureza:** API REST brasileira focada em ativos da B3.
- **Formato:** JSON estruturado.
- **Sufixo B3:** Ticker nativo direto (ex: `PETR4`).
- **Vantagens:** Ativos brasileiros nativos, dados de dividendos e múltiplos.
- **Problemas Observados no Teste Real:**
  - Requisições sem autenticação (sem token) retornam `MISSING_TOKEN` para múltiplos ativos e FIIs como `HGLG11` (`{"error":true,"message":"Token de autenticação não fornecido","code":"MISSING_TOKEN"}`).
  - Dependência mandatória de criação de conta e fornecimento de API token pessoal de serviço terceiro, inviabilizando execução "out-of-the-box" sem chave externa pré-configurada.

### 2.3 Yahoo Finance API v8 (`https://query1.finance.yahoo.com/v8/finance/chart/*`)

- **Natureza:** Endpoint REST universal de cotações e séries diárias.
- **Formato:** JSON canônico detalhado com timestamps Unix, OHLC, volume e close ajustado.
- **Sufixo B3:** `.SA` (ex: `PETR4.SA`, `VALE3.SA`, `HGLG11.SA`).
- **Resultados no Teste Real em Tempo Real:**
  - `PETR4.SA`: Retornou 200 OK com OHLCV completo e cotação de fechamento (`57.36 BRL`).
  - `VALE3.SA`: Retornou 200 OK com OHLCV completo e cotação de fechamento (`66.42 BRL`).
  - `HGLG11.SA`: Retornou 200 OK com OHLCV completo e cotação de fechamento (`156.60 BRL`).
  - Cobertura excelente para ações e FIIs, sem exigência de API Key ou token pré-pago para consultas EOD com User-Agent padrão de navegador.
  - O pacote `@atlas/benchmark-engine` já possui integração madura com Yahoo Finance (`YahooBenchmarkDataProvider`).

### 2.4 Provedores de Dados Oficiais da B3 / CVM (Dados Abertos)

- **Natureza:** Arquivos `COTAHIST_A*.ZIP` anuais ou diários disponibilizados pela B3 e CVM.
- **Vantagens:** Fonte primária regulatória máxima, 100% oficial.
- **Limitações para MVP Local/Remoto:**
  - O arquivo consolidado diário/anual tem dezenas a centenas de megabytes compactados em formato posicional legado (.txt de largura fixa).
  - Inviável para requisições sob demanda de poucos ativos no fluxo de UI/API sem infraestrutura de pipeline de dados batch (Data Warehouse / ETL). Recomendado para futura fase de reconciliação fiscal histórica pesada.

### 2.5 In-Memory / Dev Manual Mock Provider

- **Natureza:** Provedor em memória determinístico baseado em seeds locais (`InMemoryMarketDataProvider` e `InMemoryHistoricalMarketDataProvider`).
- **Vantagens:** 100% determinístico, zero latência, isolado de instabilidades de rede, essencial para testes unitários, de integração, CI e desenvolvimento offline.

---

## 3. Matriz Comparativa

| Critério                 |   Yahoo Finance v8   |           Stooq           |     Brapi (free)     |  B3 Dados Abertos  | In-Memory (Dev/Test) |
| :----------------------- | :------------------: | :-----------------------: | :------------------: | :----------------: | :------------------: |
| **PETR4**                |       OK (200)       |     Bloqueado por WAF     | OK (unauthenticated) |     OK (Batch)     |      OK (Seed)       |
| **VALE3**                |       OK (200)       |     Bloqueado por WAF     | OK (unauthenticated) |     OK (Batch)     |      OK (Seed)       |
| **HGLG11 (FII)**         |       OK (200)       |     Bloqueado por WAF     | Bloqueado sem token  |     OK (Batch)     |      OK (Seed)       |
| **Sem API Key**          |         SIM          | SIM (se não houvesse WAF) | NÃO (inconsistente)  |        SIM         |         SIM          |
| **Formato**              |   JSON estruturado   |            CSV            |         JSON         |   TXT Posicional   |  TypeScript Object   |
| **Histórico EOD**        | 5d, 1mo, 1y, 5y, max |     1d, 5d, histórico     |   Depende do plano   | Anual / Diário ZIP |     Customizável     |
| **Confiabilidade Local** |   Alta com header    |   Baixa (WAF Bot Check)   | Média (exige Token)  |  Alta para Batch   |    Máxima (100%)     |

---

## 4. Recomendações e Decisão de Arquitetura

```yaml
PRIMARY_PROVIDER: YAHOO
FALLBACK_PROVIDER: IN_MEMORY
```

### Rationale:

1. **Yahoo Finance** provou compatibilidade imediata no ambiente real para Ações (`PETR4`, `VALE3`) e Fundos Imobiliários (`HGLG11`), sem exigir compra de licença ou chaves privadas complexas durante a fase de desenvolvimento e validação do MVP do Titular.
2. O **Stooq** não pode ser o primário porque adotou verificação anti-bot via JavaScript em navegadores, o que gera erros intermitentes de parse em HTTP clients puros.
3. A camada de persistência em banco de dados (`MarketQuote` no PostgreSQL) atuará como **cache canônico de longo prazo**, evitando requisições repetidas aos provedores externos para as mesmas datas EOD.
4. Para a suíte de testes automatizados, CI e modo offline/dev, o `IN_MEMORY` continua sendo a salvaguarda inegociável para garantir determinismo estrito sem dependência de internet.
