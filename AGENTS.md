# AGENTS.md — Diretrizes para Agentes de IA no Project Atlas

Este documento define as regras inegociáveis de arquitetura, segurança e desenvolvimento para quaisquer agentes de IA e desenvolvedores que atuem no **Project Atlas**.

---

## 1. Princípios de Negócio e Cálculos Financeiros

1. **PROIBIDO usar float para valores financeiros e monetários:**
   - Todo cálculo envolvendo moeda, cotação, preço médio, saldo, imposto ou rentabilidade deve utilizar tipos de precisão decimal arbitrária (`Money`, `Quantity`, `Percentage` encapsulando `decimal.js`).
   - Tipos primitivos `number` de ponto flutuante do JavaScript **NUNCA** devem ser utilizados para somas monetárias, multiplicações de quantidade por preço ou balanços.
   - **PROIBIDO** o uso de `parseFloat()`, `Number()` ou unário `+` para conversão de valores em regras financeiras.
2. **ENCAPSULAMENTO DE DECIMAL.JS:**
   - A biblioteca `decimal.js` é um detalhe de implementação restrito a `@atlas/domain`.
   - Classes internas como `Decimal` **NUNCA** devem vazar para a API pública ou interfaces externas.
3. **SERIALIZAÇÃO FINANCEIRA POR STRINGS DECIMAIS:**
   - Valores monetários (`Money`), quantidades (`Quantity`), percentuais (`Percentage`) e datas (`LocalDate`) devem sempre serializar para JSON como strings decimais explícitas (ex.: `"1234.56"`, `"2026-09-15"`).
4. **TRANSACTION LEDGER COMO SOURCE OF TRUTH:**
   - O histórico imutável de transações e eventos financeiros é a única fonte da verdade.
   - Posições patrimoniais (`Position`), preço médio (`average cost`), custo total (`total cost`) e ganho de capital realizado (`realized gain`) são estados **estritamente derivados e recalculáveis** via `Portfolio Engine`.
   - O Atlas **NÃO** adota contabilidade formal de partidas dobradas.
5. **TRANSAÇÃO É EVENTO IMUTÁVEL:**
   - Transações no ledger são imutáveis (`Object.freeze`), sem setters mutáveis. Retificações ocorrem por novos eventos compensatórios.
6. **SEPARAÇÃO DE DATAS ECONÔMICAS E TIMESTAMPS TÉCNICOS:**
   - `tradeDate` e `settlementDate` são datas econômicas representadas por `LocalDate` (`YYYY-MM-DD`), imunes a fusos horários.
   - `createdAt` e `updatedAt` são timestamps técnicos de auditoria do sistema.
7. **TICKER NUNCA É IDENTIDADE:**
   - Ativos financeiros são identificados por seu `AssetId`, nunca pelo ticker. O mesmo ticker pode existir em exchanges diferentes (ex.: B3 vs. NYSE).
8. **ISOLAMENTO FISCAL:**
   - Não implementar lógica de cálculo tributário (DARF, isenção de R$ 20k em ações, alíquotas de FII, compensação de prejuízo) na interface do usuário (UI).
   - Todas as regras fiscais pertencem exclusivamente ao `@atlas/tax-engine`.

---

## 2. Arquitetura Modular Monolith e Monorepo

1. **HIERARQUIA DE DEPENDÊNCIAS:**
   ```text
   UI (apps/mobile, apps/web, packages/ui)
     ↓
   API (apps/api)
     ↓
   Engines e Domínio (packages/domain, packages/*-engine)
     ↓
   Database (packages/database)
   ```
2. **RESTRIÇÕES ESTRITAS DE DEPENDÊNCIA:**
   - `packages/domain` **NUNCA** pode depender de React, React Native, Expo, Next.js, NestJS ou ORMs (Prisma, TypeORM, Drizzle). O domínio é puro TypeScript agnóstico.
   - `packages/*-engine` (portfolio, performance, tax, ai, market-data, news-data) **NUNCA** podem depender de bibliotecas de interface visual (`React`, `Expo`, `UI`).
   - `packages/tax-engine` **NUNCA** pode depender de `packages/ai-engine` ou `Expo`.
   - `packages/portfolio-engine` **NUNCA** pode depender de `packages/ui` ou `React`.
3. **NÃO DUPLICAR LÓGICA ENTRE APPS:**
   - Regras de validação, cálculos, transformações e modelos devem residir nos pacotes compartilhados em `packages/*`, nunca duplicados entre `apps/mobile` e `apps/web`.
4. **INDEPENDÊNCIA DE INTERFACE:**
   - Manter as interfaces de mobile (Expo) e web (Next.js) desacopladas, compartilhando somente design tokens e contratos através de `@atlas/ui` e pacotes de domínio.

---

## 3. Segurança e Privacidade de Dados

1. **NUNCA ARMAZENAR SECRETS NO REPOSITÓRIO:**
   - Arquivos `.env`, chaves de API, certificados ou credenciais não devem ser comitados no Git. Utilize `.env.example` para documentar variáveis necessárias.
2. **SANITIZAÇÃO DE LOGS:**
   - Logs gerados no sistema **NUNCA** devem conter patrimônio total do investidor, saldos, senhas, tokens de autenticação, CPF ou dados bancários/cartões de crédito.
   - Sempre utilizar a abstração estruturada em `@atlas/logger` com mascaramento automático de campos sensíveis.
3. **EXPOSIÇÃO DA API:**
   - Não expor stack traces de erros de produção em respostas da API.
   - Manter política de CORS controlada e restrita por ambiente.

---

## 4. Banco de Dados e Persistência

1. **SCHEMA E MIGRATIONS:**
   - Nenhuma alteração de schema de banco de dados deve ser realizada diretamente ou sem migration correspondente rastreada no Git (`prisma/migrations`).
   - Migrations devem ser idempotentes e seguras para deployment contínuo.
2. **ISOLAMENTO DOMÍNIO-PERSISTÊNCIA:**
   - `@atlas/database` depende de `@atlas/domain`. O domínio **NUNCA** depende da persistência.
   - Tipos internos do Prisma (`@prisma/client`, `Prisma.Decimal`, modelos anêmicos) **NUNCA** devem ser exportados publicamente por `@atlas/database` ou consumidos pelo domínio.
3. **REGRA DE OURO DA CONVERSÃO DECIMAL:**
   - Colunas financeiras utilizam `NUMERIC(38,18)`. A conversão de/para `Money` e `Quantity` é realizada exclusivamente através de strings decimais canônicas (`decimal.toString()`).
   - **PROIBIDO** converter `Prisma.Decimal` para ponto flutuante (`toNumber()`, `parseFloat()`).
4. **TRANSACTION LEDGER APPEND-ONLY:**
   - A tabela `Transaction` e o repositório `TransactionRepository` operam exclusivamente em regime append-only (`create`, `createMany`).
   - É **proibido** expor métodos de update ou delete para transações do ledger.
5. **DATAS ECONÔMICAS CIVIS:**
   - `tradeDate` e `settlementDate` são armazenadas como `@db.Date` e convertidas utilizando componentes UTC (`getUTCFullYear()`, `getUTCMonth() + 1`, `getUTCDate()`), imunes a fuso horário.
6. **PROTEÇÃO CROSS-PORTFOLIO:**
   - Garantida na camada de banco de dados pela chave estrangeira composta `(account_id, portfolio_id) REFERENCES accounts(id, portfolio_id)`.

---

## 5. Qualidade de Código e TypeScript

1. **TYPESCRIPT STRICT OBRIGATÓRIO:**
   - A flag `"strict": true` deve permanecer ativada em todos os projetos e pacotes.
   - Evitar `any`. O uso explícito de `any` sem justificativa prévia e documentada é proibido; priorize generics, `unknown` e type guards.
2. **TESTABILIDADE E INTEGRIDADE:**
   - **NUNCA** remover ou desabilitar testes existentes para fazer um build ou CI passar.
   - Todo novo recurso ou engine deve vir acompanhado de testes unitários ou de integração via Vitest.
3. **DEPENDÊNCIAS EXTERNAS:**
   - Não adicionar novas bibliotecas de terceiros sem justificativa clara e análise de segurança e bundle size.

---

## 6. Camada de API HTTP (Fase 0D)

1. **ARQUITETURA EM CAMADAS LIMPAS:**
   - `HTTP Request -> Controller -> Application Service (Use Case) -> Repository -> Database / Domain`.
   - Controllers lidam apenas com rotas, status codes, anotações Swagger e delegação para casos de uso.
   - Casos de uso orquestram entidades e repositórios sem acoplamento com objetos de request/response do NestJS/Express.
   - Repositórios são injetados exclusivamente através de tokens tipados desacoplados (`Symbol('..._REPOSITORY')`).
2. **VERSIONAMENTO E ROTAS:**
   - Recursos de domínio sob prefixo explícito `/api/v1/*` (ex: `/api/v1/portfolios`, `/api/v1/institutions`, `/api/v1/transactions`).
   - Rotas operacionais permanecem na raiz (`/health`, `/ready`, `/docs`, `/docs-json`).
3. **TRANSACTION LEDGER APPEND-ONLY NA API:**
   - Disponibilizar unicamente `POST /api/v1/portfolios/:portfolioId/transactions` e `GET`.
   - **PROIBIDO** criar rotas `PUT`, `PATCH` ou `DELETE` para transações. O ledger é imutável.
4. **IMPOSIÇÃO DE STRINGS DECIMAIS E DATAS DE CALENDÁRIO:**
   - Valores monetários e quantitativos devem ser strings decimais (`"1234.56"`). O envio de `number` ou float de JavaScript deve falhar imediatamente com `400 Bad Request` (`VALIDATION.INVALID_INPUT`).
   - Datas econômicas (`tradeDate`, `settlementDate`) devem ser validadas contra datas civis válidas (`YYYY-MM-DD`). Datas irreais (ex: `2026-02-30`) devem ser rejeitadas com `400 Bad Request`.
5. **ENVELOPE DE RESPOSTA E TRATAMENTO DE ERROS:**
   - Recursos individuais: `{ data: T }`.
   - Listas paginadas por cursor: `{ data: T[], meta: { limit, cursor, nextCursor, hasMore } }`.
   - Erros são centralizados no `GlobalExceptionFilter` com schema unificado: `{ statusCode, error, code, message, details?, timestamp, path, requestId }`.
   - Mapeamentos padronizados: `ZodError` / `DomainError` -> `400`, `EntityNotFoundError` -> `404`, `CrossPortfolioIntegrityError` / `DuplicateExternalTransactionError` -> `409`, `PersistenceError` -> `500`.
6. **RASTREAMENTO E LOGGING SEGURO:**
   - Header `x-request-id` deve ser propagado em todas as requisições e respostas.
   - Logs de erro devem conter apenas metadados técnicos (`timestamp`, `requestId`, `method`, `url`, `statusCode`, `code`, `message`). **NUNCA** logar payloads com dados financeiros ou sensíveis.
7. **DOCUMENTAÇÃO OPENAPI 3.0:**
   - Swagger documentado em `/docs` e OpenAPI JSON em `/docs-json`.
8. **PROBES OPERACIONAIS:**
   - `/health`: Liveness probe (processo no ar).
   - `/ready`: Readiness probe (conectividade com banco de dados via `SELECT 1`). Retorna 503 se o banco estiver inacessível.
9. **EXECUÇÃO DE TESTES:**
   - Testes de integração da API executados com `pnpm test:api` contra banco de dados PostgreSQL real (`atlas_test`).

---

## 7. Autenticação, Segurança e Isolamento de Usuários (Fase 0E)

1. **AUTENTICAÇÃO POR SENHA COM ARGON2ID:**
   - Senhas de usuários devem ser hashadas invariavelmente com Argon2id. Senhas em texto puro **NUNCA** devem ser persistidas ou logadas.
   - Requisito mínimo de tamanho de senha: 10 caracteres (`PasswordSchema`).
   - O e-mail deve ser sempre normalizado com `.trim().toLowerCase()`.
   - Proteção obrigatória contra timing attacks via verificação fictícia em tempo constante (`verifyDummy()`) quando o e-mail não existe.
   - A resposta para credenciais inválidas deve ser idêntica (401 `AUTH.INVALID_CREDENTIALS`), sem revelar se o e-mail existe.
2. **ESTRATÉGIA DE TOKENS E ROTAÇÃO:**
   - Access Tokens: JWTs assinados com HMAC-SHA256, TTL estrito de 15 minutos (900s), contendo apenas `sub` (userId) e `sid` (sessionId).
   - Refresh Tokens: Strings opacas aleatórias de 48 bytes geradas via `crypto.randomBytes(48)`, armazenadas exclusivamente sob hash HMAC-SHA256 com pimenta de servidor (`REFRESH_TOKEN_PEPPER`).
   - Rotação mandatória a cada `POST /api/v1/auth/refresh`. Se um token já rotacionado (`previousRefreshTokenHash`) for apresentado, a sessão inteira é revogada imediatamente por suspeita de furto/reuso.
3. **SESSÃO PERSISTIDA E REVOGAÇÃO ATIVA:**
   - Toda sessão ativa é registrada na tabela `sessions`.
   - O guard global `JwtAuthGuard` valida o JWT e confirma que a sessão não foi revogada (`revokedAt === null`) e não expirou (`expiresAt > now()`).
   - Logout e redefinição de senha invalidam imediatamente a(s) sessão(ões) no banco.
4. **REDEFINIÇÃO DE SENHA E ANTI-ENUMERAÇÃO:**
   - `POST /api/v1/auth/forgot-password` SEMPRE responde com `{ "accepted": true }`, independentemente de o e-mail existir na base.
   - Tokens de recuperação são de uso único (15 minutos) e armazenados como hash HMAC-SHA256.
   - A conclusão de `POST /api/v1/auth/reset-password` revoga compulsoriamente todas as sessões ativas do usuário.
5. **ISOLAMENTO DE RECURSOS E REMOÇÃO DE `userId` DOS PAYLOADS:**
   - O `userId` de qualquer operação é obtido unicamente do principal autenticado via `@CurrentPrincipal()`.
   - Payloads como `POST /api/v1/portfolios` **NÃO** devem aceitar `userId` do cliente; campos extras devem ser rejeitados com 400 pelo Zod.
   - O endpoint `GET /api/v1/portfolios` lista apenas as carteiras do usuário autenticado.
   - **INVARIANTE DE ISOLAMENTO ANTI-ENUMERAÇÃO:** Tentativas de acesso, inserção ou manipulação de recursos pertencentes a outro investidor devem invariavelmente retornar **`404 Not Found`**, e **NUNCA** `403 Forbidden`.
6. **SUÍTE DE TESTES DE SEGURANÇA:**
   - Testes de autenticação e segurança executados com `pnpm test:auth`.

---

## 8. Arquitetura e Regras da Aplicação Mobile (Fase 0F)

1. **ESTRUTURA DE NAVEGAÇÃO E FILE-BASED ROUTING:**
   - `apps/mobile` utiliza **Expo Router v4** com roteamento baseado em arquivos em `app/`.
   - Rotas públicas residem no grupo `app/(auth)/` (`login`, `register`, `forgot-password`, `reset-password`).
   - Rotas autenticadas residem no grupo `app/(app)/`, contendo o Bottom Tab Navigator `app/(app)/(tabs)/` com as 5 abas canônicas: `today`, `portfolio`, `market`, `tax`, `ai`.
   - Modais e telas filhas (como `create-portfolio` e `profile`) residem diretamente em `app/(app)/`.
   - O `app/_layout.tsx` atua como guard central e sentinela de restauração de sessão.
2. **POLÍTICA DE ARMAZENAMENTO SEGURO:**
   - O `refreshToken` rotativo deve ser armazenado exclusivamente via `expo-secure-store` sob a chave `atlas.refresh-token`.
   - O `accessToken` (JWT) reside **estritamente em memória volátil** (variável de módulo e Zustand Store). **PROIBIDO** armazenar o access token em disco ou no SecureStore.
   - **PROIBIDO** utilizar `@react-native-async-storage/async-storage` para armazenar tokens sensíveis.
   - **PROIBIDO** salvar senhas em texto plano sob qualquer circunstância.
3. **CLIENTE HTTP E INTERCEPTOR SINGLE-FLIGHT:**
   - Todas as requisições do app móvel passam por `apiClient` (`apps/mobile/src/api/client.ts`).
   - Ao receber status 401 em requisição autenticada, ativa o interceptor de renovação single-flight: se houver renovação em andamento, as demais requisições concorrentes aguardam a mesma `Promise`.
   - Após renovação com sucesso, as requisições originais são reexecutadas com o novo token de acesso e a flag `isRetry: true`.
   - **Invariante Anti-Loop:** Se a requisição reexecutada retornar 401 novamente, aborta imediatamente sem nova tentativa.
   - Se o refresh falhar, o cliente cancela a fila, limpa o `expo-secure-store`, expurga o cache e desloga o usuário.
4. **GERENCIAMENTO DE ESTADO DE SERVIDOR E ISOLAMENTO DE CACHE:**
   - Dados de servidor gerenciados exclusivamente por `@tanstack/react-query`.
   - Ao executar logout (voluntário ou por sessão revogada), a função `clearQueryCache()` executa obrigatoriamente `queryClient.clear()` para isolamento cross-user.
5. **ZERO CÁLCULOS FINANCEIROS NA INTERFACE:**
   - O cliente móvel nunca calcula preço médio, rentabilidade ou DARF; apenas renderiza dados estruturais fornecidos pela API.
6. **SUÍTE DE TESTES MÓVEIS:**
   - Testes unitários e de integração mobile executados com `pnpm test:mobile`.

---

## 9. Arquitetura e Regras da Aplicação Web (Fase 0G)

1. **ESTRUTURA DE ROTAS E NEXT.JS 15 APP ROUTER:**
   - `apps/web` utiliza **Next.js 15** com App Router sob `src/app/`.
   - Rotas públicas de autenticação sob `src/app/(auth)/` (`login`, `register`, `forgot-password`, `reset-password`).
   - Rotas autenticadas sob `src/app/(app)/` (`today`, `portfolio`, `market`, `tax`, `ai`, `profile`).
   - A casca visual responsiva (`AppLayout`) provê Sidebar e Header para Desktop e Bottom Navigation Bar para dispositivos móveis.
2. **PADRÃO BACKEND-FOR-FRONTEND (BFF) E COOKIES SEGUROS:**
   - Autenticação web intermediada por Route Handlers em `src/app/api/auth/*`.
   - O `refreshToken` rotativo é gravado exclusivamente em cookie seguro `HttpOnly`, `SameSite=Lax`, `Path=/`, e `Secure` (em produção).
   - **PROIBIÇÃO RIGOROSA:** O JavaScript do navegador **NUNCA** deve ter acesso, armazenar ou ler o `refreshToken` em `localStorage`, `sessionStorage`, `IndexedDB` ou stores persistidos no cliente.
   - O `accessToken` reside **estritamente na memória volátil** do cliente (Zustand store e variável em módulo).
3. **EDGE MIDDLEWARE DE ROTEAMENTO:**
   - `src/middleware.ts` intercepta todas as requisições, inspecionando cookies de sessão (`atlas_refresh` / `atlas_logged_in`).
   - Redireciona usuários não-autenticados de rotas privadas para `/login?redirect=...`.
   - Redireciona usuários autenticados de rotas públicas de auth para `/today`.
4. **CLIENTE HTTP E INTERCEPTOR SINGLE-FLIGHT NO BROWSER:**
   - Todas as requisições passam por `ApiClient` (`apps/web/src/api/client.ts`), injetando `x-atlas-client: web`.
   - Ao receber 401, o interceptor serializa as chamadas via mutex, chama `/api/auth/refresh` (que usa o cookie HttpOnly), atualiza o access token em memória e reexecuta as requisições pendentes.
   - Em caso de falha no refresh, a sessão é limpa, os cookies purgados e o usuário redirecionado ao login.
5. **ISOLAMENTO DE CACHE CROSS-USER:**
   - Cache de queries gerenciado por `@tanstack/react-query`.
   - Ao realizar logout voluntário ou automático por revogação, o cache do navegador é compulsoriamente limpo com `queryClient.clear()`.
6. **SUSPENSE BOUNDARIES E PRÉ-RENDERIZAÇÃO:**
   - Componentes clientes que consumam `useSearchParams()` devem obrigatoriamente estar envelopados em `<Suspense fallback={...}>` para garantir build estático sem falhas.
7. **ESTADOS VISUAIS E CONECTIVIDADE:**
   - Toda listagem de dados deve implementar os 5 estados visuais: Loading (`Skeleton`), Vazio (`EmptyState`), Erro com retentativa (`ErrorState`), Sucesso (`Card`) e Desconectado (`OfflineBanner`).
8. **SUÍTE DE TESTES WEB:**
   - Testes unitários e de integração web executados com `pnpm test:web`.

---

## 10. Arquitetura e Regras do Product Shell e Design System (Fase 0H)

1. **AUTORIDADE CENTRAL DO DESIGN SYSTEM (`packages/ui`):**
   - O pacote `@atlas/ui` é a autoridade central de tokens (`colors`, `typography`, `spacing`, `borderRadius`, `shadows`, `breakpoints`), formatadores puros (`formatCurrency`, `formatPercentage`, `formatDate`) e contratos tipados de componentes (`contracts.ts`).
   - **PROIBIDO** o uso de cores literais/hexadecimais arbitrárias nas interfaces de aplicação; use exclusivamente os tokens semânticos (`positive`, `negative`, `accent`, `surface`, `border`, etc.).
2. **AS 5 ÁREAS CANÔNICAS DE NAVEGAÇÃO:**
   - A arquitetura do produto adota exatamente 5 áreas principais unificadas entre Web e Mobile:
     - `Hoje` (`/today`): Resumo diário, boas-vindas contextuais e indicadores patrimoniais de alto nível.
     - `Carteira` (`/portfolio`): Alternador de carteiras (`PortfolioSwitcher`), abas (Visão Geral, Ativos, Rentabilidade, Histórico, Alocação, Operações) e modal de criação de carteira.
     - `Mercado` (`/market`): Radar de oportunidades, watchlist, calendário de eventos e notícias curadas.
     - `Fiscal` (`/tax`): Gestão e acompanhamento tributário, DARFs, prejuízos a compensar e relatórios de IRPF (integrados ao futuro Tax Engine).
     - `IA` (`/ai`): Assistente contextual financeiro com chips de sugestões.
   - A área `Perfil` (`/profile`) concentra preferências globais, dados cadastrais, auditoria de segurança da sessão e logout, sem descaracterizar a navegação primária das 5 abas.
3. **FLUXO DE ONBOARDING NÃO-BLOQUEANTE:**
   - Investidores recém-cadastrados são direcionados ao fluxo de 3 passos (`/onboarding`): Boas-vindas -> Criação da Primeira Carteira (com persistência real via API) -> Escolha do Método de Início.
   - **Bypass Automático:** Usuários que já possuem ao menos uma carteira ativa são automaticamente redirecionados de `/onboarding` para `/today`.
4. **POLÍTICA DE HONESTIDADE VISUAL E ZERO DADOS FICTÍCIOS:**
   - **PROIBIDO** renderizar saldos falsos, gráficos randômicos ou tickers fictícios nas interfaces.
   - Onde o cálculo depender de motores em desenvolvimento (ex: Portfolio Engine, Tax Engine), o valor numérico deve ser estritamente o travessão (`—`), acompanhado de nota contextual explicativa.
5. **HARDENING DE SEGURANÇA NO BFF WEB:**
   - Todos os Route Handlers mutatórios (`POST`, `PUT`, `DELETE` em `/api/auth/*`) exigem validação rigorosa de cabeçalhos de origem (`Origin` / `Referer`) correspondentes à URL canônica da aplicação (`NEXT_PUBLIC_APP_URL`).
   - O cookie `atlas_logged_in` atua estritamente como hint visual para roteamento no middleware do Next.js e **NUNCA** como prova de autenticação em endpoints protegidos do BFF ou da API backend.
6. **ACESSIBILIDADE E TESTES E2E EM NAVEGADOR REAL:**
   - Componentes devem obedecer aos padrões WAI-ARIA, suportar navegação por teclado e possuir alvos de toque mínimos de 44x44px.
   - O fluxo completo de usuário (Registro -> Onboarding -> Navegação canônica -> Logout) é validado em navegador real via **Playwright** (`pnpm test:web:e2e`) nos viewports Desktop (1440x900), Tablet (768x1024) e Mobile (390x844).

---

## 11. Arquitetura e Invariantes do Portfolio Engine (Fase 1A)

1. **PURE DETERMINISTIC REPLAY ENGINE (`@atlas/portfolio-engine`):**
   - O `PortfolioReplayEngine` é estritamente puro, sem estado mantido entre chamadas, sem I/O e sem dependência de persistência ou rede.
   - O Ledger de Transações (`Transaction`) é a Única Fonte da Verdade (Source of Truth); todo estado patrimonial (`PortfolioState`, `AccountState`, `AssetState`) é derivado sob demanda.
2. **ORDENAÇÃO CANÔNICA EM 3 NÍVEIS (3-TUPLE):**
   - Todas as transações são obrigatoriamente ordenadas por: `(tradeDate ASC, createdAt ASC, id ASC)`.
   - Garante determinismo matemático absoluto, reprodutível 1.000x com saídas idênticas mesmo diante de embaralhamentos na entrada.
3. **PRECISÃO ARBITRÁRIA (ZERO FLOATS):**
   - É terminantemente proibido o uso de `number` ou ponto flutuante IEEE 754 em cálculos de quantidade ou financeiro.
   - Todas as operações utilizam o Value Object `Quantity` do `@atlas/domain` (baseado em Decimal.js com até 18 casas decimais).
4. **INVARIANTE LONG-ONLY E POSIÇÃO NÃO-NEGATIVA:**
   - O sistema proíbe posições vendidas a descoberto. Qualquer `SELL` ou `TRANSFER_OUT` que resulte em `quantity < 0` dispara compulsoriamente `NegativePositionError` contendo diagnóstico detalhado.
5. **POLÍTICA DE POSIÇÃO ZERO (ADR-039):**
   - Quando a quantidade de um ativo atinge exatamente zero (`quantity.isZero()`), o ativo é omitido do mapa de posições ativas (`state.assets` e `accountState.assets`).
   - `state.assets.size` reflete estritamente ativos com custódia positiva (> 0). O encerramento da posição é auditado pelo histórico de transações aplicadas.
6. **DISPATCHER EXAUSTIVO E POLÍTICA DE DIFERIMENTO (ADR-038):**
   - Todos os 16 tipos de transação (`TRANSACTION_TYPES`) são exaustivamente tratados com verificação `never` em tempo de compilação.
   - 8 tipos canônicos (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `SPLIT`, `REVERSE_SPLIT`, `BONUS`, `AMORTIZATION`) são computados em `appliedTransactions`.
   - Os 8 tipos restantes (`DIVIDEND`, `JCP`, `FII_INCOME`, `SUBSCRIPTION`, `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TAX`) não são descartados: são registrados em `deferredEvents` com justificativa explícita.
   - Satisfaz sempre: `totalProcessedCount === appliedTransactions.length + deferredEvents.length`.
7. **IMUTABILIDADE ESTRITA DE ENTRADA E SAÍDA:**
   - O array de transações fornecido na entrada nunca é alterado ou ordenado in-place.
   - Todas as estruturas retornadas em `ReplayResult` e `PortfolioState` (objetos, maps e arrays) são profundamente congeladas (`Object.freeze`).

---

## 12. Regras de Custo Base e Preço Médio (Fase 1B)

1. **PREÇO MÉDIO COMO RAZÃO DO CUSTO CARREGADO PELA QUANTIDADE:**
   - O preço médio (`averageCost`) é estritamente a razão entre o custo contábil total carregado e a quantidade em custódia (`totalCost / quantity`).
   - Média aritmética simples de preços de aquisição é terminantemente proibida (ADR-040).
2. **INVARIÂNCIA DO PREÇO MÉDIO NA VENDA:**
   - Operações de venda (`SELL`) deduzem o custo proporcionalmente pelo preço médio unitário pré-venda.
   - O preço de execução da venda **NUNCA** recalcula ou altera o preço médio das cotas remanescentes (ADR-041).
3. **AGREGAÇÃO PONDERADA NO NÍVEL DO PORTFÓLIO:**
   - O preço médio consolidado da carteira é ponderado: `sum(account.totalCost) / sum(account.quantity)`.
   - É proibido realizar "média de médias" entre contas (ADR-042).
4. **CUSTO DESCONHECIDO NUNCA É ZERO:**
   - Se uma posição possui quantidade conhecida mas custo de aquisição indeterminado (ex: `TRANSFER_IN` sem nota ou custo de aquisição explícito), o status é `costBasisStatus: 'INCOMPLETE'` com `totalCost = undefined` e `averageCost = undefined`.
   - Custo desconhecido **NUNCA** deve ser representado como zero (ADR-043).
5. **PORTFOLIO COST BASIS ≠ TAX BASIS:**
   - O estoque de custo apurado no Portfolio Engine reflete exclusivamente a base de custo patrimonial carregada (`portfolio cost basis`). Esta NÃO é a base fiscal tributária (`tax basis`). Regras fiscais (alíquotas, isenções, DARF, compensação de prejuízos, day-trade) pertencem exclusivamente ao futuro Tax Engine.
6. **PRECISÃO DECIMAL OPERACIONAL (OPERATIONAL DECIMAL PRECISION):**
   - Cálculos e acumulações no motor operam com contexto decimal de 40 dígitos (`DecimalValue` / `Decimal.js`) com arredondamento `ROUND_HALF_UP`. Registra-se expressamente que 40 dígitos constituem precisão decimal operacional de alta fidelidade para mitigar erros cumulativos de ponto flutuante, não precisão matemática infinita. Arredondamentos visuais para 2 casas decimais ocorrem estritamente na camada de exibição (`@atlas/ui`).

---

## 13. Regras de Realização de Vendas e Ganho/Prejuízo Econômico (Fase 1C)

1. **RESULTADO REALIZADO É VALOR LÍQUIDO DA VENDA MENOS CUSTO REMOVIDO:**
   - O resultado de uma venda (`RealizedDisposal`) é estritamente: `realizedGainLoss = netProceeds - costBasisRemoved`, onde `netProceeds = (quantity * unitPrice) - sellingCosts`.
   - `sellingCosts = fees + taxes`, onde `SELL.taxes` representa única e exclusivamente encargos contratuais/emolumentos atribuídos à transação de venda pelo custodiante/corretor (não se confunde com IR, IRRF, DARF ou tax liability).
2. **PREÇO DE VENDA NUNCA ALTERA O PREÇO MÉDIO REMANESCENTE:**
   - Vendas parciais deduzem o custo proporcionalmente pelo preço médio anterior. O preço de venda nunca altera a base unitária das cotas que permanecem em carteira (ADR-041, ADR-044).
3. **TRANSFER_OUT NÃO É ALIENAÇÃO ECONÔMICA:**
   - Transferências de custódia (`TRANSFER_OUT` e `TRANSFER_IN`) removem/acrescentam cotas e custo da conta, mas **NUNCA** emitem `RealizedDisposal`.
4. **GANHO ECONÔMICO NÃO É OBRIGAÇÃO TRIBUTÁRIA:**
   - O resultado realizado apurado no Portfolio Engine é o lucro/prejuízo econômico patrimonial (`economic realized gain`). Ele **NÃO** calcula imposto devido, DARF, isenção de R$ 20.000 ou classificação de day trade (ADR-047).
5. **CUSTO INCOMPLETO NUNCA PRODUZ GANHO FABRICADO:**
   - Vender cotas com `costBasisStatus: 'INCOMPLETE'` gera `RealizedDisposal` com `status: 'INCOMPLETE'`, deixando `costBasisRemoved`, `realizedGainLoss` e `realizedReturnPercentage` como `undefined`. É proibido assumir custo zero (ADR-046).
6. **SEGURANÇA DE MOEDA E PRECISÃO DECIMAL:**
   - Vendas e encargos devem ser expressos na moeda da posição. Sumarizações no portfólio são agregadas por moeda (`Map<Currency, RealizedSummary>`), sem conversão cambial fictícia.
   - Retorno consolidado é `totalRealizedGainLoss / totalCostBasisRemoved * 100`, **NUNCA** média de retornos percentuais (ADR-045).

---

## 14. Regras de Eventos Corporativos / Ações Societárias (Fase 1D)

1. **SPLIT E REVERSE_SPLIT PRESERVAM CUSTO TOTAL CARREGADO (INVARIANTE 1):**
   - Em desdobramentos (`SPLIT`) e grupamentos (`REVERSE_SPLIT`), o custo total acumulado não se altera: `totalCost_after = totalCost_before` (ADR-048).
   - O preço médio unitário é recalculado como `totalCost / quantity_after`.
   - Sobras fracionárias resultantes de grupamentos são preservadas com precisão operacional de 40 dígitos (`Quantity`), sem truncamento arbitrário para inteiros.
   - Rejeitam fator $\le 0$ ou fator $= 1$ com `InvalidCorporateActionFactorError`.
2. **BONIFICAÇÃO COM CUSTO ATRIBUÍDO vs CUSTO INCOMPLETO (ADR-049):**
   - Novas ações somam-se à custódia: `quantity_after = quantity_before + bonusQuantity`.
   - Se `assignedCost` for fornecido: `totalCost_after = totalCost_before + assignedCost` e status permanece `KNOWN`.
   - Se `assignedCost` for ausente/indefinido: é **TERMINANTEMENTE PROIBIDO** assumir custo zero. A posição transiciona para `costBasisStatus: 'INCOMPLETE'`, com `totalCost = undefined` e `averageCost = undefined`.
3. **AMORTIZAÇÃO DEDUZ CUSTO CARREGADO COM LIMITE DE EXAUSTÃO (ADR-050):**
   - A amortização deduz o custo contábil: `totalCost_after = totalCost_before - amortizationAmount`, mantendo quantidade idêntica.
   - O valor amortizado não pode exceder o custo carregado (`amortizationAmount <= totalCost_before`), disparando `AmortizationExceedsCostError` em caso de excesso.
   - Se o custo atingir exatamente zero, `totalCost = 0` e `averageCost = 0` com status `KNOWN`. Custo zero conhecido é ontologicamente distinto de custo ausente (`INCOMPLETE`).
   - Amortizar posição com custo `INCOMPLETE` dispara compulsoriamente `IncompleteAmortizationCostError`.
4. **EXIGÊNCIA DE POSIÇÃO PRÉVIA ATIVA:**
   - Eventos corporativos exigem posição existente com quantidade estritamente positiva (`quantity > 0`). Tentar aplicar evento corporativo em ativo inexistente ou zerado dispara `EmptyPositionCorporateActionError`.
5. **EVENTOS CORPORATIVOS NUNCA EMITEM REALIZED DISPOSALS:**
   - `SPLIT`, `REVERSE_SPLIT`, `BONUS` e `AMORTIZATION` **nunca** configuram alienação e não emitem `RealizedDisposal` (contagem de descarte permanece inalterada).
6. **TRILHA DE AUDITORIA FORMAL (AppliedCorporateAction):**
   - Cada evento aplicado gera um registro imutável em `AccountState.appliedCorporateActions` e `PortfolioState.appliedCorporateActions` com os valores de quantidade e custo antes e depois do evento.
7. **FRONTEIRA TRIBUTÁRIA E PADRONIZAÇÃO TERMINOLÓGICA (ADR-051):**
   - Eventos corporativos refletem contabilidade patrimonial econômica interna. O motor não apura obrigações fiscais ou tributação exclusiva de leilões de frações.
   - O termo "Proventos" é reservado para rendimentos (`DIVIDEND`, `JCP`, `FII_INCOME`). Em alienações (`SELL`), os valores resultantes denominam-se rigorosamente "Valor Bruto/Líquido da Venda".

---

## 15. Regras de Proventos, Fluxos de Caixa e Subscrições (Fase 1E)

1. **PROVENTOS NÃO ALTERAM CUSTÓDIA NEM BASE DE CUSTO (ADR-052):**
   - `DIVIDEND`, `JCP` e `FII_INCOME` geram `IncomeEvent` sem alterar `quantity`, `totalCost` ou `averageCost` de posições em custódia.
   - Podem ser auferidos mesmo após liquidação total da posição (ex-date anterior à venda, liquidação financeira posterior).
   - Proventos **nunca** emitem `RealizedDisposal` e são sumarizados por moeda em `IncomeSummary`.

2. **FLUXOS EXTERNOS DE CAIXA NÃO SÃO PERFORMANCE (ADR-053):**
   - `DEPOSIT` (inflow / `EXTERNAL_CONTRIBUTION`) e `WITHDRAWAL` (outflow / `EXTERNAL_WITHDRAWAL`) registram movimentações financeiras externas com magnitude sempre positiva em `amount`.
   - Não alteram posições de ativos nem representam rentabilidade patrimonial.
   - O fluxo líquido externo é estritamente $\text{netExternalFlow} = \text{contributions} - \text{withdrawals}$.

3. **SUBSGRIÇÃO É AQUISIÇÃO ONEROSA DE NOVAS COTAS (ADR-054):**
   - No domínio do Atlas, `SUBSCRIPTION` modela o exercício do direito de subscrição: eleva a quantidade e incorpora o custo financeiro ($\text{quantity} \times \text{unitPrice}$) com recálculo de preço médio ponderado idêntico a uma compra (`BUY`).
   - Mantém o tipo originário `SUBSCRIPTION` na trilha de auditoria e nunca emite `RealizedDisposal`.
   - Se a posição possuir custo `INCOMPLETE`, o status permanece `INCOMPLETE` (custo total e médio indefinidos).

4. **DESPESAS AVULSAS (FEE/TAX) E PROIBIÇÃO DE CASAMENTO HEURÍSTICO (ADR-055):**
   - Transações independentes `FEE` e `TAX` geram `CashFlowEvent` com `direction: 'OUTFLOW'` (`OPERATIONAL_EXPENSE` e `TAX_PAYMENT`).
   - Não alteram posição, quantidade ou preço médio de ativos.
   - É **terminantemente proibido** correlacionar heuristicamente taxas ou tributos avulsos com alienações `SELL`. O resultado líquido de alienações em `RealizedDisposal` depende unicamente dos custos expressos na própria transação `SELL`.

5. **AMORTIZAÇÃO POSSUI DUPLA DIMENSÃO ECONÔMICA (ADR-056):**
   - Toda transação `AMORTIZATION` deduz a base de custo contábil do ativo (`AppliedCorporateAction`) E simultaneamente gera um `CashFlowEvent` (`CAPITAL_RETURN`, `direction: 'INFLOW'`).
   - Invariante estrita: conta como **exatamente 1 transação aplicada** em `appliedTransactions`.
   - Compõe `totalCapitalReturns` e `totalInflows` no `CashFlowSummary`, sem distorcer `netExternalFlow`.

6. **EXHAUSTIVIDADE TOTAL DOS 16 TIPOS DE TRANSAÇÃO:**
   - Na Fase 1E, todos os 16 tipos de transação do livro-razão são ativamente processados pelo motor.
   - `appliedTransactions.length = totalProcessedCount` e `deferredEvents.length = 0`.
   - Nenhuma transação é descartada silenciosamente.

---

## 16. Regras de Transferências, Replay Histórico e Escala (Fase 1F)

1. **PAREAMENTO EXPLÍCITO SEM HEURÍSTICA (ADR-057):**
   - A vinculação entre pernas de transferência (`TRANSFER_OUT` e `TRANSFER_IN`) ocorre exclusivamente via `transferGroupId: string`.
   - **Zero Heurística**: Proibido tentar casar pernas por ticker, data aproximada, valor ou conta. Sem `transferGroupId`, a perna é estritamente não pareada (externa).
   - Validações canônicas: rejeita duplicações de pernas (`DuplicateTransferLegError`), divergência de ativos (`CrossAssetTransferError`), divergência de moedas (`TransferCurrencyMismatchError`), quantidades desiguais (`TransferPairMismatchError`), auto-transferência (`InvalidTransferGroupError`) e inversão temporal (`inTradeDate < outTradeDate`).

2. **PRESERVAÇÃO INTEGRAL DE CUSTO E INVARIANTES PATRIMONIAIS (ADR-058):**
   - A conta de origem deduz quantidade e custo carregado exato: $\text{carriedCost} = \text{currentAverageCost}_{\text{origin}} \times \text{quantity}$.
   - A conta de destino recebe $\text{carriedCost}$ e funde via soma ponderada com a posição existente.
   - Em transferências internas casadas:
     - $\text{portfolioQuantity}_{\text{before}} = \text{portfolioQuantity}_{\text{after}}$
     - $\text{portfolioTotalCost}_{\text{before}} = \text{portfolioTotalCost}_{\text{after}}$
     - $\text{portfolioRealizedGain}_{\text{before}} = \text{portfolioRealizedGain}_{\text{after}}$
     - $\text{portfolioIncome}_{\text{before}} = \text{portfolioIncome}_{\text{after}}$
     - **NUNCA** emite `RealizedDisposal`, **NUNCA** emite `IncomeEvent`, **NUNCA** emite `CashFlowEvent`. Emite registros de auditoria em `AppliedTransfer`.

3. **POLÍTICA DE PERNAS DESEMPARELHADAS E DEGRADAÇÃO DE CUSTO (ADR-059):**
   - `TRANSFER_IN` sem contraparte: status `UNMATCHED_IN`, eleva quantidade e marca a posição como `costBasisStatus: 'INCOMPLETE'` (custo total e médio indefinidos).
   - `TRANSFER_OUT` sem contraparte: status `UNMATCHED_OUT`, baixa quantidade e custo carregado para fora do escopo do portfólio sem inventar contas fantasmas.
   - Se a origem de um par casado possuir custo `INCOMPLETE`, o status `INCOMPLETE` é propagado compulsoriamente para o destino.

4. **CONTRATO DE REPLAY HISTÓRICO E CONSISTÊNCIA FORMAL (ADR-060):**
   - **Prefix Consistency**: $\text{replay}(T, \text{asOfDate} = D) \equiv \text{replay}(\{ t \in T \mid t.\text{tradeDate} \le D \})$.
   - **Append Consistency**: Inserção de transações futuras não altera o estado histórico reconstituído em datas passadas.
   - **Permutation Invariance**: $\text{replay}(\pi(T)) \equiv \text{replay}(T)$. A ordenação é estritamente canônica (`tradeDate ASC`, `createdAt ASC`, `id ASC`), invariante à ordem de inserção do array de entrada.

5. **HARDENING E ESCALA DE GRANDES LEDGERS (ADR-061):**
   - Replay testado e validado em benchmarks sintéticos determinísticos com sementes fixas para 1.000, 10.000 e 50.000 transações multi-contas (5+) e multi-ativos (20+) (observed development/test benchmark, não SLA de produção).
   - Tempo de replay de 50.000 transações atinge desempenho sub-segundo (~480ms) com complexidade linear $\mathcal{O}(N \log N)$.
   - Aritmética com precisão decimal operacional de 40 dígitos e 18 casas decimais via Value Objects (`Quantity`, `Money`, `DecimalValue`), sem deriva IEEE-754 nos cenários testados.

---

## 17. Integração API/Aplicação e Modelos de Leitura (Fase 1G)

1. **FRONTEIRA ESTREITA E NÃO-VAZAMENTO DE DOMÍNIO (ADR-062):**
   - Controladores NestJS e DTOs de apresentação nunca expõem entidades e tipos internos do engine (`PortfolioState`, `AccountState`, `AssetState`, `Money`, `Quantity`, `Percentage`, `DecimalValue`, `ReadonlyMap`).
   - A camada de aplicação atua como barreira estrita e converte os dados exclusivamente para Read Models serializáveis puros (`PortfolioStateReadModel`, `PortfolioPositionsReadModel`, `PortfolioHistoryReadModel`).
   - Mapeador utilitário puro `PortfolioReadModelMapper` aplica ordenações determinísticas (`assetId ASC` para posições, `accountId ASC` para contas, `tradeDate DESC, id DESC` para histórico).
   - Teste de arquitetura em `tests/architecture/dependency-boundaries.test.ts` fiscaliza a ausência de importações diretas de tipos internos nos controladores.

2. **ENDPOINTS DE ESTADO E POSIÇÕES E AUTORIZAÇÃO SEGURA (ADR-063):**
   - `GET /api/v1/portfolios/:portfolioId/state`: Replay do livro-razão consolidado e por conta, com metadados de execução (`engineVersion`, `processedTransactionCount`).
   - `GET /api/v1/portfolios/:portfolioId/positions`: Posições em aberto consolidadas ou filtradas por `accountId`.
   - **Isolamento e Privacidade**: Requer autenticação JWT. Tentativas de acessar carteiras de outros usuários ou contas fora do escopo da carteira resultam compulsoriamente em HTTP `404 Not Found` (evitando confirmação de existência de IDs de terceiros).
   - **Falhas de Integridade do Livro-Razão**: `PortfolioReplayError` é capturado pelo filtro global e mapeado para HTTP `422 Unprocessable Entity` (`PORTFOLIO.REPLAY_FAILED`).

3. **SEMÂNTICA TEMPORAL DE PONTO NO TEMPO (`asOf`) — ADR-064:**
   - Parâmetro `asOf` nos formatos ISO `YYYY-MM-DD`.
   - Validação estrita de calendário civil gregoriano (rejeita datas inexistentes como `2026-02-30` com `400 Bad Request` / `PORTFOLIO.INVALID_AS_OF_DATE`).
   - Corte inclusivo: transações com `tradeDate <= asOf` são processadas no replay; transações posteriores são omitidas.
   - Chamadas com `asOf` anterior à primeira transação retornam com sucesso o estado vazio da carteira (`processedTransactionCount = 0`).

4. **SERIALIZAÇÃO DECIMAL EXATA E SEMÂNTICA NULL VS ZERO (ADR-065):**
   - **Zero Float Math**: Todos os montantes financeiros e quantidades de cotas são serializados estritamente como `string` decimal exata (nunca tipos numéricos IEEE-754).
   - **Semântica Null vs Zero**: Posições com status `INCOMPLETE` serializam `totalCost` e `averageCost` estritamente como `null` (nunca `0` ou `"0"`).
   - Números primitivos são permitidos exclusivamente em contadores inteiros e limites de paginação de metadados (`limit`, `totalCount`, `processedTransactionCount`).

5. **EXTRATO DE HISTÓRICO PATRIMONIAL CATEGORIZADO (ADR-066):**
   - `GET /api/v1/portfolios/:portfolioId/history`: Extrato auditável unificado cobrindo `REALIZED_DISPOSAL`, `INCOME`, `CASH_FLOW`, `CORPORATE_ACTION` e `TRANSFER`.
   - Ordenação cronológica reversa estrita: `tradeDate DESC, id DESC`.
   - Paginação estável via keyset cursor (`data: items`, `meta: { limit, cursor, nextCursor, hasMore, totalCount }`).
   - Suporte a filtros por `type`, `from`, `to`, `accountId` e `assetId`, com validação de consistência do intervalo temporal (`PORTFOLIO.INVALID_DATE_RANGE`).

---

## 18. Portfolio Engine 1.0 Final Hardening, Contract Freeze & Release Candidate (Fase 1H)

1. **VERSIONAMENTO E CONTRATOS CONGELADOS (ADR-067, ADR-069):**
   - Versão canônica formalizada: `1.0.0-rc.1`.
   - Congelamento estrito do pipeline: `Transaction Ledger -> Deterministic Replay -> Derived State -> Application Read Models -> Portfolio Read API v1`.
   - Matriz semântica formalmente congelada para todos os 16 tipos de transação do livro-razão.
   - Nomenclatura oficial: "Portfolio Engine 1.0 Release Candidate" / "pronto para integração de MVP da carteira" (vedada qualquer alegação promocional de produção).

2. **CONGELAMENTO DA API DE LEITURA V1 (ADR-068):**
   - Endpoints congelados: `GET /state`, `GET /positions`, `GET /history`.
   - Envelope padronizado `{ data }` e `{ data, meta }`.
   - Validação estrita de limites (1 a 200) e rejeição de cursores adulterados ou transcarteiras (IDOR) com `400 Bad Request` (`PORTFOLIO.INVALID_PAGINATION_CURSOR`).

3. **POLÍTICA FAIL-CLOSED E TRATAMENTO DE ERROS (ADR-070):**
   - Inconsistências de ledger provocam falha atômica do replay disparando erro específico (`PortfolioReplayError`), mapeado para HTTP `422 Unprocessable Entity` (`PORTFOLIO.REPLAY_FAILED`).
   - Zero descarte silencioso e zero emissão de estado parcial corrompido.

4. **ESTRATÉGIA DE ESCALA E BOUNDEDNESS (ADR-071):**
   - O payload de `/state` é estritamente limitado pelo número de ativos e contas custodiados (`O(posições)`), sem crescimento proporcional ao total de transações históricas.
   - Preservação da pureza sem estado (zero persistência intermediária de posições ou cache prematuro em Redis).

---

## 19. Regras de Interface e Apresentação da Carteira MVP (Fase 2A)

1. **CONSUMO EXCLUSIVO DE CONTRATOS CONGELADOS DA API V1:**
   - A interface da Carteira consome exclusivamente os endpoints da API v1 (`GET /api/v1/portfolios/:portfolioId/state`).
   - É terminantemente vedado acessar transações do ledger ou duplicar a lógica de cálculo do Portfolio Engine na camada visual.

2. **ZERO CLIENT-SIDE FINANCIAL MATH (ADR-073):**
   - O cliente (Web/Mobile) **nunca** multiplica quantidade por preço médio para derivar custo total.
   - O cliente **nunca** calcula ganho/prejuízo ou total de proventos.
   - O ViewModel apenas formata strings decimais exatas usando os formatters seguros de `@atlas/ui` (`formatCurrency`, `formatQuantity`, `formatPercentage`), sem uso de ponto flutuante IEEE-754.

3. **PROIBIÇÃO DE VALOR DE MERCADO E PERFORMANCE ANTES DO MARKET DATA (ADR-074):**
   - O custo carregado **jamais** pode ser rotulado como "Patrimônio Atual", "Valor de Mercado" ou "Patrimônio Total".
   - Use terminologia analítica precisa: **"Custo total"** ou **"Custo total conhecido"**.
   - Resultados de alienações e proventos não podem ser denominados "Rentabilidade da Carteira".

4. **TRATAMENTO DE CUSTO INCOMPLETO (INCOMPLETE COST BASIS):**
   - Posições com `costBasisStatus === 'INCOMPLETE'` renderizam preço médio e custo total como `—` (travessão), **nunca** como `0` ou `R$ 0,00`.
   - Exibe banner informativo de completude de forma clara e não-alarmista.

5. **SEGREGAÇÃO MULTIMOEDA:**
   - Valores monetários em moedas distintas (ex: `BRL` e `USD`) devem permanecer segregados por moeda em blocos/linhas distintas, sem conversão cambial implícita ou agregação cruzada.

---

## 20. Regras de Interface e Detalhamento da Posição do Ativo (Fase 2B)

1. **NAVEGAÇÃO E ROTAS CANÔNICAS (ADR-075):**
   - **Web:** Rota canônica `/portfolio/assets/[assetId]?portfolioId=...`, acessível via clique no ticker ou botão "Ver detalhe →" no overview da carteira. Retorno garantido por breadcrumb acessível (`← Carteira`).
   - **Mobile:** Rota canônica `/(app)/portfolio/[assetId]?portfolioId=...`, acessível via toque no card ou botão com alvo touch $\ge 44\text{px}$ ("Ver detalhes do ativo →"). Retorno garantido pelo `Header` com `onBack`.

2. **HIERARQUIA VISUAL E DETALHAMENTO INSTITUCIONAL:**
   - O detalhamento do ativo decompõe a posição em:
     1. Cabeçalho de identidade do ativo (ticker, nome empresarial, classe de ativo formatada, contexto da carteira e status da posição: `ABERTA` ou `ENCERRADA`).
     2. Posição consolidada (quantidade total, preço médio ponderado, custo total de aquisição conhecido).
     3. Distribuição por conta de custódia (instituições/corretoras com quantidade, preço médio e custo específico).
     4. Resultado realizado (extrato de alienações com valor bruto, custos, valor líquido e ganho/perda apurado com percentual).
     5. Rendimentos recebidos (dividendos, JCP, rendimentos de FII creditados especificamente para o ativo).
     6. Histórico cronológico auditável de eventos do ativo.

3. **PAGINAÇÃO POR KEYSET CURSOR AUDITÁVEL (ADR-076):**
   - O extrato de movimentações do ativo utiliza o endpoint `/api/v1/portfolios/:portfolioId/history?assetId=...` com `useInfiniteQuery`.
   - As páginas de histórico são achatadas e deduplicadas por `item.id` no cliente.
   - O acionamento de carregamento de páginas adicionais possui alvo de toque mínimo de $44\text{px}$ na Web e no Mobile.

4. **ZERO CLIENT FINANCIAL MATH E CUSTO INCOMPLETO (ADR-077):**
   - É terminantemente vedado calcular ou recalcular grandezas financeiras na UI/ViewModel.
   - Em caso de incompletude de custo (`INCOMPLETE`), o preço médio e o custo total são apresentados estritamente como travessão `—`, acompanhados de badge informativo não alarmista ("Dados de custo incompletos") e adaptação para "Custo total conhecido". Nunca renderizar `0` ou `R$ 0,00`.

5. **ANTI-ESCOPO ESTATUÁRIO:**
   - Mantém-se a proibição estrita de cotações em tempo real, valor de mercado, P&L não realizado, TWR/XIRR e cálculos fiscais (DARF/IRPF) antes da conclusão de seus respectivos engines especializados.
