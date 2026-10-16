# Decisão de Licenciamento e Contratos de Dados de Mercado (Market Data) — Project Atlas

Data: 2026-10-16  
Fase: Phase 5A-R1  
Status: DEFINIDO E AUDITADO

---

## 1. Visão Geral e Finalidade

Este documento formaliza a análise jurídica, contratual e operacional de dados de mercado para o **Project Atlas**, diferenciando os três horizontes de utilização:

1. **Ambiente de Desenvolvimento & Testes Automatizados (CI):** 100% determinístico e offline.
2. **Ambiente Local Owner MVP (Uso Pessoal e Privado do Titular):** Acesso individual direto sem redistribuição pública.
3. **Ambiente Futuro Commercial SaaS (Multi-inquilino / Clientes Pagantes):** Exigência de conformidade regulatória plena e licenciamento explícito de redistribuição da B3.

---

## 2. Análise por Provedor

### 2.1 brapi (`brapi.dev`)

- **Natureza:** Serviço comercial brasileiro de API de dados financeiros B3.
- **Modelo de Licenciamento & Termos:**
  - Oferece termos de serviço públicos de autosserviço (Self-Service SaaS).
  - Conta Gratuita: Permite até 15.000 requisições/mês, 1 requisição simultânea, com cotações com delay de ~30 min.
  - Símbolos Sandbox/Free sem token: `PETR4`, `VALE3`, `MGLU3`, `ITUB4` (ações) e `MXRF11` (FII).
  - Demais ativos e FIIs (como `HGLG11`): Exigem token de autenticação de conta cadastrada (`Authorization: Bearer <token>`).
- **Uso no Local Owner MVP:** **PERMITIDO (YES)**. O titular pode cadastrar sua própria chave gratuita pessoal no dashboard da brapi e inseri-la em seu `.env` local (`BRAPI_API_KEY`), operando dentro da cota de 15.000 req/mês sem qualquer custo.
- **Uso em Futuro Commercial SaaS:** **REQUER PLANO CORPORATIVO / UPGRADE (UNCLEAR/CONDITIONAL)**. A brapi proíbe uso em alta frequência ou trading institucional sem delay, mas seus planos pagos (Startup/Pro) suportam explicitamente backends de aplicações web. Não obstante, para um SaaS em larga escala com milhares de usuários, uma revisão de volume e conformidade com a política de redistribuição da B3 é necessária.
- **Redistribuição Direta:** A brapi permite exibição dos dados na interface da aplicação do titular; proíbe revenda direta do feed cru como provedor concorrente.
- **Attribution:** Recomendada na documentação para planos gratuitos ("Dados fornecidos por brapi.dev").

### 2.2 Yahoo Finance (`query1.finance.yahoo.com`)

- **Natureza:** Endpoints internos não-oficiais do portal Yahoo Finance.
- **Status Oficial:** A Yahoo descontinuou oficialmente sua API pública para desenvolvedores há anos. Os endpoints remanescentes são proprietários para suporte à interface web.
- **Termos de Uso:**
  - O contrato de usuário da Yahoo veda expressamente o scraping, engenharia reversa e uso comercial ou de redistribuição dos dados.
  - O uso é restrito estritamente a fins pessoais e educacionais/pesquisa em navegadores.
- **Uso no Local Owner MVP:** **PERMITIDO COMO DEV_EXPERIMENTAL_FALLBACK (BEST EFFORT)**. Pode ser usado localmente pelo proprietário em sua máquina caso esteja sem token da brapi, mas sem garantias contratuais de SLA.
- **Uso em Futuro Commercial SaaS:** **PROIBIDO (NO / BLOCKER)**. Usar Yahoo Finance como fonte primária em um SaaS comercial viola os termos de serviço da Yahoo e os contratos das bolsas fontes (B3, NYSE, NASDAQ), gerando risco de bloqueio de IP sem aviso prévio e passivo legal de copyright/redistribuição.

### 2.3 Stooq (`stooq.com`)

- **Natureza:** Portal financeiro polonês com downloads CSV de cotações.
- **Status Técnico:** Implementou desafio obrigatório anti-bot via JavaScript (Cloudflare WAF), bloqueando clientes HTTP programáticos puros.
- **Classificação:** **REJECTED (INVIÁVEL TÉCNICAMENTE)** para consumo automatizado confiável.

### 2.4 B3 Oficial / B3 for Developers (`b3.com.br`)

- **Natureza:** Bolsa oficial brasileira.
- **Modelo de Licenciamento:**
  - Acesso direto exige contrato comercial institucional B2B, homologação de software e pagamento de taxas de distribuição de dados de mercado (_Market Data Policy / Display & Non-Display Fees_).
  - Não há API aberta de autoatendimento para desenvolvedores individuais ou MVPs iniciais.
- **Classificação:** **FUTURE_ENTERPRISE_PROVIDER (BLOQUEIO PARA MVP / APENAS PARA SAAS MADURO)**.

### 2.5 In-Memory (`@atlas/market-data`)

- **Natureza:** Módulo interno de memória determinístico com fixtures canônicas.
- **Licenciamento:** Código proprietário do Project Atlas (100% permissivo e isolado).
- **Classificação:** **DETERMINISTIC_TEST_PROVIDER** inegociável para testes unitários, testes de integração e CI.

---

## 3. Matriz Decisória de Licenciamento

| Provedor       |    Local Owner MVP    |          Commercial SaaS           |  Redistribuição  | Atribuição Exigida | Status / Papel                  |
| :------------- | :-------------------: | :--------------------------------: | :--------------: | :----------------: | :------------------------------ |
| **BRAPI**      |        **YES**        | **CONDITIONAL** (Exige Plano Pago) | Permitida na UI  |  Sim (Plano Free)  | **PRIMARY_PROVIDER**            |
| **YAHOO**      |   **YES** (Pessoal)   |         **NO** (Viola TOS)         |  Não permitida   |        N/A         | **DEV_FALLBACK (Best Effort)**  |
| **STOOQ**      | **NO** (Bloqueio WAF) |               **NO**               |       N/A        |        N/A         | **REJECTED**                    |
| **B3 OFICIAL** | **NO** (Barreira B2B) |       **YES** (Contrato B2B)       | Exige licença B3 |  Exige auditoria   | **FUTURE_ENTERPRISE_PROVIDER**  |
| **IN_MEMORY**  |        **YES**        |              **YES**               |     Próprio      |        N/A         | **DETERMINISTIC_TEST_PROVIDER** |

---

## 4. Conclusão do Gate de Licenciamento

1. O **Local Owner MVP** está plenamente autorizado a operar utilizando a **BRAPI** como provedor primário (com ou sem token pessoal gratuito do titular), mantendo **Yahoo** estritamente como _fallback de melhor esforço_ em modo de desenvolvimento, e **IN_MEMORY** para a garantia de testes automatizados.
2. A commercialização como SaaS multi-inquilino público (Phase 5+) demandará a contratação de plano pago da brapi ou redistribuidor B3 licenciado. Este marco está formalmente documentado e não bloqueia a Phase 5A.
