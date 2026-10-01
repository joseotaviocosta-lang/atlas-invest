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

---

## 21. Regras de Interface, Histórico e Atividade da Carteira (Fase 2C)

1. **CONSUMO EXCLUSIVO DO ENDPOINT CONGELADO DE HISTÓRICO:**
   - O histórico da carteira deve consumir exclusivamente o endpoint oficial `GET /api/v1/portfolios/:portfolioId/history`.
   - É terminantemente vedado acessar ou reconstituir transações do livro-razão bruto no cliente.

2. **OPACIDADE E INTEGRIDADE DO CURSOR DE PAGINAÇÃO (ADR-079):**
   - Os cursores de histórico (`meta.nextCursor`) são tratados como strings puramente opacas.
   - O cliente **nunca** decodifica, compõe, modifica ou assume estrutura interna para os cursores.
   - Qualquer alteração nos filtros da timeline invalida e redefine o cursor para a primeira página, sem misturar páginas obsoletas.

3. **FILTRAGEM EXCLUSIVAMENTE VIA FILTROS OFICIAIS DO SERVIDOR:**
   - O cliente não substitui filtros server-side suportados por filtragem manual client-side sobre um lote parcial de dados.
   - Todos os filtros de período (`from`/`to`), tipo (`type`), conta de custódia (`accountId`) e ativo (`assetId`) são encaminhados como query parameters oficiais para a API.

4. **ZERO CLIENT FINANCIAL MATH E PROIBIÇÃO DE TOTAIS ARBITRÁRIOS (ADR-077, ADR-080):**
   - A interface e o ViewModel de atividade não realizam somas, subtrações ou agregações de fluxos de caixa, ganhos acumulados, saldos ou impostos.
   - É expressamente vedado calcular ou exibir cabeçalhos agregados como "Total movimentado", "Fluxo líquido" ou "Rentabilidade do período".

5. **TERMINOLOGIA CANÔNICA E CONFORMIDADE FISCAL (ADR-080):**
   - Eventos de tributos (`TAX`) devem ser estritamente rotulados como **"Tributo pago"** (ou "Pagamento de tributo"), **nunca** como "Imposto devido".
   - Eventos de subscrição corporativa (`SUBSCRIPTION`) são rotulados como **"Subscrição"**, nunca como compra em mercado comum.
   - Eventos de transferência (`TRANSFER`) indicam movimentação de custódia e exibem o badge **"Transferência incompleta"** quando despareados (`UNMATCHED`).
   - Eventos de amortização (`AMORTIZATION`) exibem o subtítulo contextual **"Devolução de capital"**.
   - Eventos de alienação (`REALIZED_DISPOSAL`) são rotulados como **"Venda"**, nunca "Proventos da venda".

6. **SEGURANÇA DE NAVEGAÇÃO PARA POSIÇÕES ENCERRADAS (ADR-078):**
   - Eventos históricos vinculados a ativos cujas posições encontram-se encerradas (`quantity === '0'` ou sem posição aberta no estado atual) não devem fornecer links para a tela de detalhe de posição aberta, prevenindo erros de "posição não encontrada" ou redirecionamentos enganosos.

7. **CONFORMIDADE DE CONTRATO E HARDENING DE HISTÓRICO (HOTFIX 2C.1):**
   - **Exaustividade sobre o Enum Real:** A camada de apresentação do histórico deve ser estritamente exaustiva sobre o enum `PortfolioHistoryKind` congelado na API (`REALIZED_DISPOSAL`, `INCOME`, `CASH_FLOW`, `CORPORATE_ACTION`, `TRANSFER`).
   - **Proibição de Kinds Inventados:** O cliente nunca deve inventar ou manter kinds ad-hoc de histórico (ex: `SPIN_OFF`, `MERGER`, `INTEREST`, `BONUS_SHARES`, `BUY`).
   - **Proibição de Cálculo Client-Side de Percentual por Conta:** ViewModels no cliente não devem calcular percentuais de alocação ou participação por conta a partir de quantidades (`accountQuantity / totalQuantity`). A regra permanece estrita: cálculo econômico pertence ao Engine/API; apresentação pertence ao cliente.
   - **Preservação de Cobertura dos Gates de Validação do RC:** Os scripts de validação do Portfolio Engine RC (`validate:portfolio-engine-rc`, `test:portfolio-engine`) devem preservar integralmente a cobertura de hardening da Fase 1H (53 arquivos de teste / 243 testes unitários e de integração).

## 22. Regras de Carteira Histórica e Time Travel por asOf (Fase 2F)

1. **ESTADO HISTÓRICO SEMPRE VEM DO REPLAY DO SERVIDOR VIA asOf (ADR-087, ADR-089):**
   - Todo estado histórico de carteira (`Historical state`) deve ser obtido exclusivamente via `GET /api/v1/portfolios/:portfolioId/state?asOf=YYYY-MM-DD` (ou `GET /positions?asOf=`).
   - O cliente **NUNCA** reconstrói posições históricas a partir do histórico de eventos/transações, nunca filtra o ledger por data localmente e nunca recalcula quantidade, preço médio, custo ou ganho.
2. **asOf USA SEMÂNTICA CIVIL LocalDate, NÃO TIMESTAMPS COM TIMEZONE (ADR-088):**
   - `asOf` trafega e é validado como string civil `YYYY-MM-DD` (regex estrita + calendário gregoriano real). É **proibido** usar `new Date(asOf)` para semântica econômica ou qualquer conversão que possa deslocar o dia.
   - `asOf` igual a hoje normaliza para modo atual (sem parâmetro); `asOf` futuro é recusado na UI; `asOf` inválido exibe erro de data sem quebrar.
3. **CACHE CURRENT E HISTÓRICO ISOLADOS (ADR-088):**
   - Chaves de query incluem o corte (`asOf ?? 'current'`) por carteira/ativo/conta. Entradas current e históricas **nunca** compartilham cache.
   - Trocar de carteira limpa `asOf`; nunca carregar snapshot histórico de outra carteira.
4. **NAVEGAÇÃO HISTÓRICA PRESERVA CONTEXTO asOf (ADR-087):**
   - Links overview → asset/account e voltas carregam `asOf`; regras de navegação segura avaliam o estado histórico, não o atual.
   - É **proibido** comparar automaticamente valores hoje × passado (deltas, percentuais, TWR/XIRR, benchmarks) nesta fase.

## 23. Market Data Foundation (Fase 3A)

1. **Market prices do not belong to Portfolio Engine.**
   - Preço de mercado é camada separada, independente do motor de replay.
   - Portfolio Engine continua responsável por ledger, quantidade, custo, realized, income, cash flow, corporate actions, transfers e replay histórico.
   - Market Data é responsabilidade exclusiva da camada externa de preço.

2. **External provider types must never leak outside adapters.**
   - Tipos como `YahooFinanceQuote`, `AlphaVantageQuote`, `StooqCsvRow` são implementação específica do adapter.
   - Nunca devem ser expostos nos pacotes de domínio, API ou interfaces de aplicação.
   - Apenas o contrato canônico `MarketQuote` e erros normalizados (`MarketDataError`) devem sair do adapter.

3. **AssetId remains canonical identity.**
   - Identidade exclusiva do ativo é `AssetId`, nunca ticker.
   - Mesmo ticker em exchanges diferentes deve continuar distinguível por `exchange` e `providerSymbol`.
   - `map[ticker]` nunca deve ser usado como identidade global.

4. **Provider symbols are adapter-specific metadata.**
   - `providerSymbol` é mapeamento específico do provedor (ex: `PETR4.SA` no Stooq).
   - A mesma ação pode ter símbolos diferentes em provedores distintos.
   - O símbolo nunca substitui `AssetId` como identificador canônico.

5. **Market prices must use exact decimal primitives.**
   - Preço deve sempre ser `Money` (ou `Quantity`) do `@atlas/domain`, nunca `number` ou float IEEE-754.
   - Serialização JSON rigorosa: string decimal exata (`"37.52"`), nunca número JSON.
   - Guard contra `parseFloat`, `Number(price)`, `+ price` em todos os caminhos financeiros.

6. **Quote currency must always be explicit.**
   - Toda cotação deve carregar `currency` explícita (ex: `BRL`, `USD`).
   - Nunca assumir `BRL` implicitamente ou converter silenciosamente entre moedas.
   - Se a cotação divergir da moeda esperada do instrumento: flag `error`, nunca conversão automática.

7. **Stale quotes must never be presented as fresh.**
   - Status `STALE` ou `freshness: 'STALE'` deve ser exibido explicitamente como dado desatualizado.
   - A lógica de freshness não deve ficar espalhada na UI; deve ser decidida pelo serviço `MarketDataService`.

8. **Tests must not depend on live external market-data APIs.**
   - Unit e integration tests não podem chamar provedores reais de internet.
   - Todos os testes devem usar provider mock determinístico (`InMemoryMarketDataProvider`) ou fakes.
   - CI/CD deve usar mock provider exclusivamente.

---

## 24. Portfolio Valuation & Current Market Value (Fase 3B)

1. **Market valuation must never be calculated client-side.**
   - `quantity × price = marketValue`, somas por moeda e `unrealized` são calculados exclusivamente no servidor (`@atlas/valuation-engine` + `GET /api/v1/portfolios/:id/valuation`).
   - UI (Web/Mobile) apenas renderiza `marketValue`, `unrealizedGainLoss`, `unrealizedGainLossPercent` já serializados como strings decimais via `@atlas/ui` (`formatCurrency`, `formatPercentage`), sem `parseFloat`/`Number`/`+`.

2. **Market value must never mutate portfolio cost basis.**
   - Valuation é camada de leitura derivada (`PortfolioState + MarketQuotes → PortfolioValuation`), com `valuation-engine@0.1.0` puro, sem I/O, `Object.freeze`.
   - `Portfolio Engine 1.0.0-rc.1` permanece FROZEN (ledger, quantity, cost, realized, income, replay). Market price nunca entra no engine.

3. **Unknown cost must never be treated as zero.**
   - `costBasisStatus: 'INCOMPLETE'` → `totalCost=null`, `unrealized=null`, `percent=null`, nunca `"0"`. Status `COST_INCOMPLETE` com `marketValue` ainda valuado quando quote existe.
   - `totalCost=0` conhecido → `unrealized=marketValue`, `percent=null` (sem divisão por zero).

4. **Multi-currency valuation must remain segregated without FX.**
   - `BRL` e `USD` nunca somados. `totalsByCurrency: { BRL: { marketValue, knownCost, unrealized }, USD: { ... } }`, `currencies: ['BRL','USD']`.
   - `quote.currency !== position.currency` → `CURRENCY_MISMATCH`, `marketValue=null`, sem conversão.

5. **Current valuation must not be shown as historical valuation.**
   - Valuation é `current-only` (`GET /valuation` sem `asOf`). Quando `?asOf=YYYY-MM-DD` histórico ativo, **ocultar** valuation (não mostrar current como se fosse histórico). Preferência: `MobileValuationSection`/`PortfolioValuationSection` retornam `null` em `isHistorical`.

6. **Quote freshness must remain visible in valuation UX.**
   - `freshness: 'STALE'` ou `status: 'STALE'` → badge `Cotação desatualizada` (`QUOTE_STALE`), nunca mascarado como `FRESH`. `QUOTE_UNAVAILABLE` → `Preço atual —`, `CURRENCY_MISMATCH` → `Moeda divergente`.

---

## 25. Performance Engine Foundation (Fase 3C)

1. **Performance must never be inferred from cost basis.**
   - `cost basis` (ledger) nunca é `market value` histórico. `current quote` nunca reusado retroativamente. Sem `historical valuations` (observações), performance retorna `INSUFFICIENT_DATA`/`UNAVAILABLE` com `null`, nunca `0%` inventado.

2. **Current quotes must never be reused as historical prices.**
   - `GET /performance` com `period` usa apenas `PerformanceObservation` canônicos (`date`, `value`, `currency`); `valuation atual` não entra como histórico.

3. **Deposits/withdrawals are external cash flows; buys/sells are not.**
   - `DEPOSIT` (`INFLOW`) e `WITHDRAWAL` (`OUTFLOW`) são `external` e neutralizados em `TWR` e com sinal trocado em `XIRR` (`DEPOSIT` = outflow do investidor `-`). `BUY`, `SELL`, `DIVIDEND`, `JCP`, `FII_INCOME`, `FEE`, `TAX`, `TRANSFER` são internos e não entram como `external flow`.

4. **Internal transfers must not affect consolidated performance.**
   - `TRANSFER_IN/OUT` entre contas do mesmo portfolio net 0 consolidado; `TWR` consolidado não muda com transferências internas.

5. **Performance remains segregated by currency without FX.**
   - `BRL` e `USD` nunca somados. `currencies: { BRL: { twr, xirr }, USD: { ... } }`, `status` per moeda, sem conversão.

6. **TWR and XIRR must be deterministic and auditable.**
   - `performance-engine@0.2.0` puro, sem I/O, `Object.freeze`, `subperiods` com `R = (Ending - Beginning - NetFlow)/Beginning` (flows no fim do dia, documentado), chaining `(1+r1)...-1` exato, `XIRR` Newton+Bisection com `tolerance 1e-7`, `status CONVERGED|NO_SOLUTION|INSUFFICIENT_DATA|NUMERICAL_FAILURE`, nunca `parseFloat`/`Number` em TWR (só `Math.pow` documentado em XIRR).

---

## 26. Historical Market Prices & Performance Data Pipeline (Fase 3D)

1. **Historical performance must use historical market prices.**
   - `PerformanceObservation` vem de `replayPortfolio(asOf=date)` + `HistoricalMarketPrice` (`LocalDate`, `close` exato, `Money`), nunca de `cost basis` ou `current quote` retroativo.

2. **Current quotes must never be backfilled into past dates.**
   - `HistoricalMarketDataProvider.getDailyPrice` nunca retorna `priceDate > requestedDate` (no future leakage).

3. **Historical price resolution must never use a future trading date.**
   - `requested Sunday` → `Friday` (`PREVIOUS_TRADING_DAY`) dentro de `maxLookback` 7 dias; `Friday` faltando + `Monday` existe → `Friday` é `UNAVAILABLE`, não `Monday`.

4. **Historical valuations must be computed server-side.**
   - `HistoricalValuationBuilder` server-side, reuse `valuation-engine` (`quantity×close`), `partial` se preço faltar, `multi-currency` segregado, sem FX, sem client math.

5. **Performance observations must preserve currency segregation.**
   - `observationsByCurrency: { BRL: [...], USD: [...] }`, `TWR/XIRR` por moeda, nunca `BRL+USD`.

6. **Partial historical valuation must never be labeled complete.**
   - `valuedPositions < totalPositions` → `PARTIAL`/`PARTIAL_QUOTES`, nunca `COMPLETE` falsa. `PerformanceDataAvailability` `AVAILABLE|PARTIAL|UNAVAILABLE`.

7. **Historical price provider types must stay inside adapters.**
   - `StooqCsvRow`, `InMemoryHistoricalPrice` nunca vazam; só `HistoricalMarketPrice` canônico e `MarketDataError` normalizado.

---

## 27. Performance UX & Analytics Views (Fase 3E)

1. **Client must never calculate TWR or XIRR.**
   - `TWR`/`XIRR` vêm prontos de `GET /api/v1/portfolios/:id/performance` via `performance-engine@0.2.0` (semântica TWR/XIRR inalterada desde `0.1.0`; `0.2.0` adiciona apenas a série cumulativa). View-model só formata `formatPercentage`/`formatLocalDateDisplay`, nunca `Math.pow`/`parseFloat` para performance.

2. **Partial performance must never be labeled complete.**
   - `dataAvailability: PARTIAL` → banner `Dados parciais` (`Alguns preços históricos não estavam disponíveis...`), não `COMPLETE`. `PARTIAL` não usa vermelho alarmista.

3. **Unavailable performance must never be displayed as 0%.**
   - `twr: null`/`xirr: null` → `—`, nunca `0,00%`. `status: UNAVAILABLE` → `Performance indisponível para este período.`

4. **Performance periods use civil LocalDate semantics.**
   - `startDate`/`endDate` `YYYY-MM-DD` civil, `start <= end`, `end <= today`, sem timezone. `queryKey` `['portfolio-performance', id, start, end]` sem colisão; `URL state` `?period=1Y` ou `?startDate&endDate`.

5. **Multi-currency performance must remain segregated without FX.**
   - `currencies: { BRL: { twr, xirr }, USD: {...} }`, nunca `BRL+USD`. Sem `FX` conversion, sem `retorno consolidado` cross-currency.

6. **TWR and XIRR must be explained as distinct concepts.**
   - `TWR`: `Retorno da carteira desconsiderando o efeito de aportes e retiradas.` `XIRR`: `Retorno considerando quando os aportes e retiradas aconteceram.` `XIRR` já anualizado → `a.a.`, nunca inventar anualização.

---

## 28. Benchmark Foundation & Comparative Performance (Fase 3F)

1. **BENCHMARK ENGINE PURO E ZERO I/O (ADR-112, ADR-113):**
   - `@atlas/benchmark-engine` é determinístico, sem estado, sem I/O nos caminhos de cálculo.
   - `portfolio-engine` **nunca** importa `benchmark-engine`.
   - Somente adapters fazem `fetch`; DTOs externos (`YahooFinanceQuote`, `StooqCsvRow`) nunca vazam.

2. **PRICE_INDEX NÃO É RATE_SERIES (ADR-114, ADR-117):**
   - `PRICE_INDEX` (ex.: `IBOV`): `return = (endLevel / startLevel - 1) × 100`.
   - `RATE_SERIES` (ex.: `CDI`): composição de fatores diários (ver seção 29).
   - O engine recusa cruzamento de tipos com `UnsupportedBenchmarkTypeError`.

3. **COMPARAÇÃO USA TWR, NUNCA XIRR (ADR-115):**
   - `differencePercentagePoints = portfolioTwr - benchmarkReturn` em pontos percentuais, calculado no servidor.
   - Proibido o termo "alpha"; XIRR permanece visível, porém separado.

4. **MULTI-MOEDA SEM FX (ADR-116):**
   - Comparação apenas `BRL`; moeda não `BRL` → `benchmark: null`, sem conversão cambial.

5. **ESTADOS E HONESTIDADE VISUAL (ADR-116, ADR-121):**
   - `AVAILABLE` / `PARTIAL` / `UNAVAILABLE`; `PARTIAL` nunca rotulado como completo.
   - `UNAVAILABLE` nunca exibido como `0%`; usa-se `—` ou mensagem explícita.

---

## 29. CDI & Rate-Based Benchmarks (Fase 3G)

1. **CDI MUST NEVER BE MODELED AS A PRICE INDEX (ADR-117).**
   - `CDI` é `RATE_SERIES`; `IBOV` permanece `PRICE_INDEX`. Proibido `end / start - 1` sobre CDI.

2. **RATE BENCHMARK UNITS MUST ALWAYS BE EXPLICIT (ADR-118, ADR-119).**
   - Toda observação carrega `unit` (`DAILY_PERCENT` ou `DAILY_FACTOR`); nunca um número sem unidade.
   - `ANNUAL_PERCENT` não é modelado; unidade desconhecida lança `UnsupportedRateUnitError`.

3. **RATE COMPOUNDING MUST FOLLOW SOURCE SEMANTICS EXACTLY (ADR-119).**
   - `dailyFactor = 1 + rate/100` (`DAILY_PERCENT`); `accumulatedFactor = ∏ dailyFactor`;
     `return = (accumulatedFactor - 1) × 100`. `1% + 1% = 2.01%`.
   - Aritmética decimal exata; proibido `parseFloat`, `Number`, `Math.pow` em caminhos financeiros.

4. **MISSING RATE OBSERVATIONS MUST NEVER BE TREATED AS ZERO (ADR-121).**
   - Fins de semana/feriados são ausências legítimas, não falhas; ausência nunca vira `0%`.
   - Sem calendário oficial, o servidor não inventa gaps: `AVAILABLE` ou `UNAVAILABLE`.
     `PARTIAL` é suportado via `expectedObservationDates` e por propagação de valuation parcial.

5. **CLIENT MUST NEVER COMPOUND CDI OR CALCULATE RATE BENCHMARK RETURN (ADR-119, ADR-121).**
   - Web/Mobile apenas renderizam strings decimais; zero matemática financeira no cliente.

6. **PORTFOLIO BENCHMARK COMPARISON CONTINUES TO USE TWR (ADR-115).**
   - CDI é comparado ao TWR `BRL` da carteira, em p.p., nunca ao XIRR.

7. **CDI MAY ONLY COMPARE WITH BRL WITHOUT FX (ADR-116).**
   - `USD`/`EUR` → não aplicável; nenhuma conversão cambial.

8. **PROVIDER SERIES CODE MUST NEVER BECOME CANONICAL BENCHMARK IDENTITY (ADR-118).**
   - A identidade é o `BenchmarkId` (`'IBOV' | 'CDI'`); `12` (SGS) é apenas `providerSeriesCode` (metadado).
   - Metadados de fonte (`source`, `seriesCode`, `observationCount`) permanecem server-side.

---

## 30. Performance Series & Historical Chart Foundation (Fase 3H)

1. **PERFORMANCE CHARTS MUST CONSUME SERVER-COMPUTED CUMULATIVE RETURNS.**
   - O gráfico consome exclusivamente `GET /api/v1/portfolios/:id/performance/series` (`performance-engine@0.2.0`).
   - `GET /performance` (summary TWR/XIRR) permanece intacto e congelado.

2. **CLIENT MUST NEVER NORMALIZE PERFORMANCE OR BENCHMARK SERIES.**
   - Web/Mobile nunca subtraem o primeiro ponto, dividem níveis, compõem taxas, encadeiam retornos ou neutralizam flows.

3. **PORTFOLIO PERFORMANCE SERIES MUST USE TWR SEMANTICS, NOT RAW MARKET-VALUE RATIOS.**
   - Cada ponto é TWR cumulativo `[start, D]` com chaining exato; `value(D)/value(start)-1` é proibido.

4. **EXTERNAL CASH FLOWS MUST REMAIN NEUTRALIZED IN PERFORMANCE CHARTS.**
   - `DEPOSIT`/`WITHDRAWAL` neutralizados; `BUY`/`SELL` internos; transferências internas com efeito zero consolidado.

5. **BENCHMARK SERIES MUST PRESERVE THEIR NATIVE PRICE_INDEX OR RATE_SERIES SEMANTICS.**
   - IBOV: `level(D)/startLevel-1`; CDI: produto de fatores diários em `(start, D]-1`. Sem mistura.

6. **MISSING SERIES POINTS MUST NEVER BE REPRESENTED AS ZERO.**
   - Ponto indisponível é `null` → gap no gráfico e `—` no tooltip; nunca linha reta 0%.

7. **CALCULATION BOUNDARIES AND DISPLAY SAMPLING ARE DISTINCT CONCEPTS.**
   - `calculation dates = display dates ∪ flow dates`; `AUTO`: ≤90d DAILY, 91–365d WEEKLY, >365d MONTHLY; `start`/`end` sempre incluídos; `≤400` pontos.

8. **CROSS-CURRENCY BENCHMARK SERIES ARE FORBIDDEN WITHOUT FX.**
   - `BRL` pode alinhar IBOV/CDI; `USD` é portfolio-only (`benchmark: null`).

---

## 31. Risk Metrics Foundation — Volatility & Drawdown (Fase 3I)

1. **RISK METRICS MUST USE SERVER-SIDE FINANCIAL OBSERVATIONS, NEVER CHART DISPLAY SAMPLES.**
   - `GET /api/v1/portfolios/:id/performance/risk` usa toda data civil em `[start, end]` ∪ flow dates (`risk-engine@0.1.0`); nunca pontos `AUTO/WEEKLY/MONTHLY` do gráfico 3H.

2. **VOLATILITY MUST USE SUBPERIOD TWR RETURNS, NOT CUMULATIVE-RETURN LEVELS.**
   - `RiskSubperiodReturn` vem de `calculateTWR(...).subperiods`; níveis cumulativos nunca entram no desvio padrão.

3. **EXTERNAL CASH FLOWS MUST REMAIN NEUTRALIZED BEFORE RISK CALCULATION.**
   - `DEPOSIT`/`WITHDRAWAL` neutralizados via TWR; transferências internas com efeito zero consolidado.

4. **VOLATILITY METHODOLOGY MUST DECLARE FREQUENCY AND ANNUALIZATION FACTOR.**
   - `frequency: 'DAILY'`, `annualizationFactor: '252'` (`dailyVol × sqrt(252)`); variância amostral `n−1`; `n < 2` → `UNAVAILABLE`.

5. **DRAWDOWN MUST USE CUMULATIVE TWR WEALTH PATH, NOT RAW PORTFOLIO MARKET VALUE.**
   - `wealthIndex = 1 + cumulativeReturn`; `drawdown = wealth/peak − 1` (sempre `≤ 0`); `peakDate`/`troughDate`/`recoveryDate` (`null` se aberto ou sem queda); `current` é `0` em novo máximo.

6. **INSUFFICIENT OBSERVATIONS MUST PRODUCE UNAVAILABLE/NULL, NEVER ZERO.**
   - `null` significa indisponível; `"0"` é 0% real (ex.: retornos constantes).

7. **CLIENT MUST NEVER CALCULATE VOLATILITY, VARIANCE, ANNUALIZATION, DRAWDOWN, PEAKS, TROUGHS OR RECOVERIES.**
   - `PortfolioRiskViewModel` só formata strings e datas; `Math.sqrt`/`Math.pow`/`variance`/`drawdown`/`runningPeak` proibidos no client.

8. **RISK METRICS DESCRIBE HISTORICAL BEHAVIOR AND MUST NOT BE LABELED AS PREDICTIONS.**
   - Linguagem canônica: `risco histórico` / `métricas históricas`; proibido `risco futuro`, scores e rótulos (`baixo/alto risco`).

9. **CROSS-CURRENCY RISK AGGREGATION IS FORBIDDEN WITHOUT FX.**
   - `BRL` e `USD` segregados, mesma metodologia, sem conversão.

10. **RISK DAILY OBSERVATIONS ARE NOT CALENDAR-DAY OBSERVATIONS (ADR-132).**
    - `frequency: DAILY` denota observações válidas de dias de mercado (preço `EXACT`), nunca 365 dias civis.
11. **PREVIOUS-TRADING-DAY PRICE RESOLUTION MUST NOT CREATE ARTIFICIAL ZERO-RETURN RISK OBSERVATIONS.**
    - Valuation resolvida via fallback é boundary TWR válido, mas nunca estatística de risco.
12. **WEEKEND AND HOLIDAY DATES MUST NOT ENTER VOLATILITY SOLELY BECAUSE A VALUATION CAN BE RESOLVED FOR THEM.**
    - Sem nova observação econômica (`EXACT`), sem retorno estatístico — nem `0%`.
13. **TWR FLOW BOUNDARIES AND STATISTICAL RISK OBSERVATIONS ARE DISTINCT CONCEPTS.**
    - Layer A neutraliza flows (inclusive em dias sem mercado); Layer B (`selectRiskStatisticalReturns`) filtra só datas econômicas.
14. **SQRT(252) ANNUALIZATION REQUIRES COMPATIBLE DAILY OBSERVATION SEMANTICS.**
    - Trocar 252 → 365 para preservar código calendar-day é proibido; corrija metodologia ou fator — nunca silenciosamente.

---

## 32. Risk-Adjusted Performance — Sharpe & Sortino (Fase 3J)

1. **RISK-ADJUSTED METRICS MUST USE ECONOMIC RETURN OBSERVATIONS, NEVER CHART SAMPLES.**
   - `GET /api/v1/portfolios/:id/performance/risk-adjusted` usa subperíodos TWR Layer B (`risk-engine@0.2.0`); nunca pontos `AUTO/WEEKLY/MONTHLY`, níveis cumulativos ou variações brutas de valor.

2. **SHARPE AND SORTINO MUST USE ALIGNED PORTFOLIO AND REFERENCE OBSERVATIONS.**
   - Interseção por data econômica (`alignRiskFreeObservations`); `excess_t = portfolio − riskFree` por observação; `n−1` amostral no Sharpe; downside `Σ min(excess,0)² / n` no Sortino; anualização `× sqrt(252)`; `n < 2` ou denominador zero → `UNAVAILABLE`/`null`, nunca `Infinity`/`NaN`.

3. **CDI IS A BRL RISK-FREE PROXY, NOT A LITERAL GUARANTEE OF ZERO RISK.**
   - `RiskFreeProxy = 'CDI'` canônico; UI diz `Referência usada: CDI`; sem taxa hardcoded, sem fallback para zero/IBOV, sem CDI em `USD`.

4. **MISSING CDI OBSERVATIONS MUST NEVER BE TREATED AS ZERO.**
   - Datas sem CDI estreitam a amostra (`PARTIAL`) ou inviabilizam (`UNAVAILABLE`); provedor indisponível → `UNAVAILABLE`.

5. **SHARPE AND SORTINO ARE RATIOS, NOT PERCENTAGES.**
   - Serialização string decimal (`"1.24"`); UI renderiza `1,24` via `formatRatio`, nunca `1,24%`.

6. **ZERO DENOMINATOR MUST PRODUCE UNAVAILABLE/NULL, NEVER INFINITY.**
   - `stddev = 0` ou downside `= 0` → `null` (UX usa mensagem unavailable, nunca `∞`).

7. **CLIENT MUST NEVER CALCULATE EXCESS RETURNS, SHARPE, SORTINO OR DOWNSIDE DEVIATION.**
   - `PortfolioRiskAdjustedViewModel` só formata; `sharpe`/`sortino`/`downsideDeviation`/`riskFreeReturn`/`Math.sqrt`/`Math.pow` proibidos no client.

8. **CROSS-CURRENCY RISK-ADJUSTED METRICS ARE FORBIDDEN WITHOUT A COMPATIBLE REFERENCE.**
   - `USD` → `riskFreeProxy: null`, `UNAVAILABLE`, `Indisponível sem referência compatível.`; sem FX.

---

## 33. Benchmark-Relative Risk — Beta, Correlation & Tracking Error (Fase 3K)

1. **BENCHMARK-RELATIVE METRICS MUST USE RETURNS OVER IDENTICAL ECONOMIC INTERVALS.**
   - `GET /api/v1/portfolios/:id/performance/relative-risk` usa intervalos econômicos TWR da carteira e do IBOV (`risk-engine@0.3.0`); nunca amostras de gráfico, variações brutas de valor ou retornos acumulados.

2. **MATCHING ONLY BY RETURN END DATE IS FORBIDDEN.**
   - Identidade de par é `(startDate, endDate)`, chave `startDate::endDate`; carteira `Fri→Tue` vs benchmark `Mon→Tue` → **0 pares** (ADR-139).

3. **PREVIOUS-TRADING-DAY VALUATION FALLBACK MUST NOT CREATE BENCHMARK-RELATIVE STATISTICAL OBSERVATIONS.**
   - Fins de semana/feriados e datas de fluxo são fronteiras TWR, nunca fronteiras de par; nenhum `0%` artificial.

4. **BETA USES SAMPLE COVARIANCE DIVIDED BY BENCHMARK SAMPLE VARIANCE.**
   - `beta = cov(Rp,Rb) / var(Rb)` (ambos `n−1`); `var(Rb) = 0` → `null`; ratio unitless, nunca `%`.

5. **CORRELATION USES PAIRED RETURNS OVER IDENTICAL INTERVALS.**
   - Pearson `cov / (stdRp × stdRb)`, limitada a `[-1,1]` com clamp só dentro de tolerância `1e-18`; `std = 0` → `null`.

6. **TRACKING ERROR USES ANNUALIZED SAMPLE STANDARD DEVIATION OF ACTIVE RETURNS.**
   - `active = Rp − Rb`; `daily = std(active)` (`n−1`); `annualized = daily × sqrt(252)`; percentage, nunca ratio.

7. **IBOV IS THE ONLY BENCHMARK-RELATIVE MARKET BENCHMARK IN PHASE 3K.**
   - `^BVSP` permanece metadado do adapter; nunca identidade canônica.

8. **CDI MUST NOT BE USED AS A MARKET-RELATIVE BENCHMARK.**
   - CDI é `RATE_SERIES` proxy livre de risco (3G/3J); `?benchmark=CDI` → `400 RELATIVE_RISK.UNSUPPORTED_BENCHMARK`.

9. **MISSING BENCHMARK DATA MUST NEVER BE INTERPRETED AS ZERO.**
   - Ausência estreita a amostra (`PARTIAL`) ou inviabiliza (`UNAVAILABLE`); provedor indisponível → `UNAVAILABLE`.

10. **CLIENT MUST NEVER CALCULATE BETA, CORRELATION, COVARIANCE, ACTIVE RETURNS, TRACKING ERROR OR INTERVAL ALIGNMENT.**
    - `PortfolioBenchmarkRelativeRiskViewModel` só formata; `Math.sqrt`/`Math.pow`/`parseFloat`/`covariance`/`activeReturn`/`alignBenchmarkRelativeReturns` proibidos no client.

11. **HISTORICAL RELATIVE-RISK RELATIONSHIPS MUST NOT BE PRESENTED AS FORECASTS.**
    - Linguagem canônica: `Valores históricos, não previsões.`; proibido `"se o Ibovespa subir..."` e rótulos qualitativos (`beta alto/baixo`, `agressivo/defensivo`).

12. **CROSS-CURRENCY RELATIVE RISK IS FORBIDDEN WITHOUT FX.**
    - `USD` → `UNAVAILABLE`, `Indisponível sem benchmark compatível.`; sem conversão cambial.

---

## 34. Active Performance — Alpha, Information Ratio & Treynor (Fase 3L)

1. **ACTIVE PERFORMANCE METRICS MUST USE PERIOD-CONSISTENT INPUTS.**
   - `GET /api/v1/portfolios/:id/performance/active` usa `effectiveStart`/`effectiveEnd` idênticos para `Rp`, `Rf`, `Rm` e Beta (`risk-engine@0.4.0`); nunca Beta de YTD com Alpha de 1Y.

2. **JENSEN ALPHA USES PORTFOLIO RETURN, CDI PROXY, IBOV RETURN AND BETA FROM THE SAME PERIOD.**
   - `alpha_period = Rp − [Rf + Beta×(Rm−Rf)]`; é o alpha DO PERÍODO, nunca anualizado automaticamente (ADR-144).

3. **INFORMATION RATIO USES PAIRED ACTIVE RETURNS AND TRACKING ERROR FROM IDENTICAL INTERVALS.**
   - `mean(active)/trackingError` sobre os mesmos pares diários econômicos da 3K; `dailyTrackingError` reutiliza exatamente a convenção `n−1` da 3K; anualização `×sqrt(252)` (ADR-145).

4. **TREYNOR USES PORTFOLIO EXCESS RETURN OVER CDI DIVIDED BY BETA FROM THE SAME PERIOD.**
   - `(Rp−Rf)/Beta`, unidade percentage-per-beta; `Beta = 0`/`null` → `null`; Beta negativo permitido (ADR-146).

5. **CDI REMAINS A BRL RISK-FREE PROXY, NOT A MARKET BENCHMARK.**
   - `riskFreeProxy='CDI'`; IBOV é o benchmark de mercado. Nunca intercambiar referências.

6. **IBOV REMAINS THE BRL MARKET BENCHMARK.**
   - `marketBenchmark='IBOV'`; `^BVSP` permanece metadado do adapter.

7. **ZERO BETA OR ZERO TRACKING ERROR MUST PRODUCE UNAVAILABLE/NULL WHERE THEY ARE DENOMINATORS.**
   - Nunca `Infinity`/`NaN`; ausência de dependência → `null` e `PARTIAL`/`UNAVAILABLE` com disponibilidade por métrica preservada (ADR-143).

8. **CLIENT MUST NEVER CALCULATE ALPHA, INFORMATION RATIO, TREYNOR OR EXPECTED CAPM RETURN.**
   - `PortfolioActivePerformanceViewModel` só formata; `Math.sqrt`/`Math.pow`/`parseFloat`/`expectedReturn`/`activeReturn`/divisões por beta ou tracking error proibidos no client.

9. **ACTIVE PERFORMANCE METRICS ARE HISTORICAL AND MUST NOT BE PRESENTED AS FORECASTS.**
   - Linguagem canônica: `Valores históricos, não previsões.`; proibido `"se o Ibovespa subir..."` e rótulos qualitativos (`alpha bom/ruim`, `Treynor alto`).

10. **CROSS-CURRENCY ACTIVE PERFORMANCE IS UNAVAILABLE WITHOUT COMPATIBLE REFERENCES.**
    - `USD` → `UNAVAILABLE`, `Indisponível sem referências compatíveis.`; sem FX.

---

## 35. Rolling Analytics — Volatility, Beta & Sharpe (Fase 3M)

1. **ROLLING WINDOWS ARE COUNTED IN VALID ECONOMIC OBSERVATIONS, NEVER CALENDAR DAYS.**
   - `window=20|60|120` significa 20/60/120 observações econômicas válidas; fim de semana, feriado, fallback `PREVIOUS_TRADING_DAY` e fronteira flow-only não contam (ADR-149).

2. **ROLLING METRICS MUST REUSE CANONICAL SOURCE OBSERVATIONS FROM PRIOR PHASES.**
   - Volatilidade = 3I Layer-B; Sharpe = 3J alinhado; Beta = 3K pareado. Nenhuma fórmula duplicada, nenhum alinhamento refeito (`risk-engine@0.5.0`).

3. **ROLLING BETA MUST USE ALREADY-PAIRED 3K INTERVALS AND MUST NOT REALIGN BY END DATE.**
   - Rejeição same-end/different-start e de sessão intermediária ausente permanece a montante (ADR-151).

4. **ROLLING SHARPE MUST USE ALREADY-ALIGNED 3J PORTFOLIO/CDI OBSERVATIONS.**
   - CDI nunca preenchido com zero; ausência de CDI apenas estreita a série (ADR-152).

5. **MISSING CDI OR BENCHMARK DATA MUST NOT BE ZERO-FILLED.**
   - Ausência não vira `0%`; janela com variância/desvio zero mantém o ponto com valor `null`.

6. **PARTIAL WINDOWS ARE FORBIDDEN.**
   - Sem expanding window: `points = max(0, n − W + 1)`; `n < W` → `UNAVAILABLE` com `points=[]`.

7. **ROLLING POINTS BEGIN ONLY WHEN THE FULL CONFIGURED OBSERVATION WINDOW IS AVAILABLE.**
   - Cada ponto é identificado por `windowStartDate` e `endDate`, ordenado `endDate ASC`, congelado.

8. **FINANCIAL ROLLING CALCULATIONS ARE SERVER-SIDE ONLY.**
   - `PortfolioRollingAnalyticsViewModel` só formata; `slice` de retornos, variância, covariância, beta, volatilidade, Sharpe e anualização proibidos no client.

9. **A PROVIDER MUST NEVER BE CALLED ONCE PER ROLLING POINT.**
   - 1 build de contexto, 1 range fetch IBOV, 1 range fetch CDI por request.

10. **HISTORICAL ROLLING ANALYTICS MUST NOT BE PRESENTED AS FORECASTS.**
    - Linguagem canônica: `Valores históricos, não previsões.`; proibido `tendência de alta`, `vai subir`, rótulos qualitativos.

---

## 36. Downside & Tail Risk — Downside, Semideviation, Historical VaR & CVaR (Fase 3N)

1. **TAIL-RISK METRICS USE CANONICAL ECONOMIC TWR RETURNS, NEVER CHART SAMPLES OR CALENDAR-DAY ZEROS.**
   - Downside/semideviação/VaR/CVaR usam Layer-B (`selectRiskStatisticalReturns`); fim de semana/feriado/fluxo não entram (ADR-132/ADR-153).

2. **HISTORICAL VaR/CVaR ARE EMPIRICAL, NOT PARAMETRIC.**
   - Sem normalidade/Gauss, Cornish-Fisher, Monte Carlo, EWMA ou GARCH.

3. **VaR QUANTILE METHODOLOGY IS NEAREST-RANK AND MUST NOT DEPEND ON LIBRARY DEFAULTS.**
   - `rank = ceil((1−c)×n)` (`95 → n/20`, `99 → n/100`), clamp `[1,n]`; `quantile = sorted[rank−1]` (ADR-156).

4. **VaR/CVaR ARE DAILY HISTORICAL METRICS IN PHASE 3N; SQRT-TIME SCALING IS FORBIDDEN.**
   - Sem VaR multi-dia, sem escalonamento por `sqrt(t)`, sem VaR monetário.

5. **VaR/CVaR LOSS VALUES ARE NON-NEGATIVE MAGNITUDES; THRESHOLD RETURNS REMAIN SEPARATELY AUDITABLE.**
   - `loss = max(0, −quantile)`; `quantileReturnPercentage` exposto para auditoria.

6. **CVaR TAIL COUNT IS DETERMINISTIC AND MUST NOT EXPAND BECAUSE OF DUPLICATE THRESHOLD VALUES.**
   - CVaR usa exatamente as primeiras `rank` observações ordenadas, nunca "todas ≤ threshold" (ADR-157).

7. **VaR 95 REQUIRES AT LEAST 20 OBSERVATIONS; VaR 99 REQUIRES AT LEAST 100.**
   - Abaixo do mínimo → `UNAVAILABLE`; downside/semideviação podem permanecer `AVAILABLE` (PARTIAL) (ADR-158).

8. **TAIL-RISK METRICS REMAIN SEGREGATED BY CURRENCY; NO FX AGGREGATION.**
   - BRL e USD calculados separadamente; nunca somados.

9. **CLIENT MUST NEVER CALCULATE QUANTILES, DOWNSIDE STATISTICS, VaR OR CVaR.**
   - `PortfolioTailRiskViewModel` só formata; `sort`, `quantile`, downside, VaR, CVaR e `Math.*` proibidos no client.

10. **HISTORICAL TAIL-RISK METRICS MUST NOT BE DESCRIBED AS GUARANTEES OR FORECASTS.**
    - Proibido `perda máxima`, `você não perderá`, `99% de certeza`, `garantia`; linguagem `histórico`/`observado`/`distribuição histórica`.

---

## 37. Scenario Analysis — Deterministic Stress Testing (Fase 3O)

1. **SCENARIO ANALYSIS IS DETERMINISTIC WHAT-IF ANALYSIS, NEVER FORECAST OR PROBABILITY.**
   - `POST /api/v1/portfolios/:id/performance/scenarios/run` aplica choques explícitos e reproduzíveis; sem probabilidade, likelihood, Monte Carlo ou previsão.

2. **SCENARIO RUNS MUST NEVER MUTATE THE TRANSACTION LEDGER OR PORTFOLIO STATE.**
   - Pure what-if; sem persistência, sem escrita no ledger, sem alterar posições, valuations ou inputs.

3. **SCENARIO ENGINE IS SEPARATE FROM STATISTICAL RISK ENGINE.**
   - `@atlas/scenario-engine@0.1.0` puro/zero I/O; `risk-engine` e `portfolio-engine` nunca importam o scenario-engine.

4. **DIRECT EQUITY SHOCKS APPLY ONLY TO EXPLICITLY ELIGIBLE ASSET CLASSES.**
   - `STOCK`, `FII`, `ETF`, `BDR`; demais classes inalteradas; impacto sobre market value, nunca cost basis.

5. **BENCHMARK SHOCKS USE HISTORICAL PORTFOLIO BETA AND MUST BE LABELED AS ESTIMATES BASED ON HISTORICAL BETA.**
   - `estimatedReturn% = Beta × shock%` (IBOV); reutiliza 3K; nível consolidado BRL, nunca per-asset.

6. **BETA UNAVAILABLE MUST NEVER FALL BACK TO 1.**
   - `Beta = null` → `UNAVAILABLE` (`SCENARIO.BETA_UNAVAILABLE`).

7. **DIRECT EQUITY SHOCK AND BENCHMARK SHOCK MUST NOT DOUBLE-COUNT THE SAME EXPOSURE.**
   - Equity + benchmark no mesmo cenário → `400 SCENARIO.CONFLICTING_SHOCKS` (ADR-164).

8. **RATE SHOCKS REQUIRE EXPLICIT SENSITIVITY METADATA; MISSING DURATION MUST NEVER BE INFERRED OR FABRICATED.**
   - Sem `modifiedDuration` canônico → `SCENARIO.UNSUPPORTED_RATE_SHOCK`; aproximação linear por duration só com duração explícita; sem convexity.

9. **MULTI-CURRENCY SCENARIOS REMAIN SEGREGATED; NO FX AGGREGATION.**
   - BRL e USD calculados separadamente; nunca somados.

10. **MISSING VALUATION DATA MUST PRODUCE PARTIAL, NEVER IMPLICIT ZERO MARKET VALUE.**
    - Posições sem quote são excluídas e contadas (`unvaluedPositionCount`); cobertura apenas em contagem, nunca percentual por valor.

11. **CLIENT MUST NEVER CALCULATE STRESSED PRICES, BETA SHOCKS, DURATION IMPACTS, OR SCENARIO TOTALS.**
    - `PortfolioScenarioViewModel` só formata; `stressedValue`, `shockFactor`, `beta *`, `duration *`, `Math.*` proibidos no client.

12. **SCENARIO OUTPUTS MUST NOT BE DESCRIBED AS PREDICTIONS, PROBABILITIES, OR GUARANTEED OUTCOMES.**
    - Linguagem canônica: `Impacto estimado no cenário`, `Hipótese`, `Simulação`; proibido `previsão`, `vai cair`, `perda esperada`, `probabilidade`, `garantia`.

---

## 38. Portfolio Intelligence Summary (Fase 3P)

1. **PORTFOLIO INTELLIGENCE AGGREGATES CANONICAL READ MODELS; IT MUST NOT OWN OR DUPLICATE FINANCIAL FORMULAS.**
   - `@atlas/portfolio-intelligence@0.1.0` puro/zero I/O recebe read models já calculados; nunca recalcula TWR/Sharpe/Beta/VaR.

2. **A SUMMARY USES ONE SHARED EFFECTIVE ANALYSIS PERIOD ACROSS ALL PERIOD-BASED METRICS.**
   - Default 1Y (`endDate = today`, `startDate = endDate − 365`), inception clamp; nenhum bloco usa período diferente (ADR-167).

3. **OBJECTIVE OBSERVATIONS ARE FACTUAL STRUCTURED DATA, NEVER RECOMMENDATIONS OR QUALITATIVE JUDGMENTS.**
   - `PortfolioObservation[]` determinístico, ordenado, sem duplicatas `code+scope`; valores copiados, nunca recomputados (ADR-168).

4. **PORTFOLIO INTELLIGENCE MUST NOT CREATE SCORES, GRADES, RANKINGS, RATINGS, TRAFFIC LIGHTS, OR PORTFOLIO HEALTH CLASSIFICATIONS.**

5. **DATA QUALITY MUST BE REPRESENTED THROUGH EXPLICIT STATUSES AND REASON CODES, NOT A NUMERIC SCORE.**
   - `AVAILABLE | PARTIAL | UNAVAILABLE` + reason codes estáveis; `UNSUPPORTED` estrutural distinto de lacuna acidental (ADR-169).

6. **MULTI-CURRENCY SUMMARIES REMAIN SEGREGATED; NO IMPLICIT FX OR GLOBAL PORTFOLIO TOTAL.**
   - `currencies: { BRL, USD }`; sem total consolidado (ADR-171).

7. **CURRENT VALUATION AND HISTORICAL PERIOD METRICS MUST REMAIN EXPLICITLY DISTINGUISHABLE.**
   - Overview à `effectiveEnd` (point-in-time) vs blocos PERIOD.

8. **SCENARIO DATA IN THE SUMMARY IS HYPOTHETICAL AND DETERMINISTIC, NEVER PREDICTIVE.**
   - Apenas `EQUITY_DOWN_10`; sem benchmark/rate shock no summary.

9. **TAIL-RISK DATA IS HISTORICAL, NEVER A GUARANTEE OF FUTURE LOSSES.**
   - Confiança canônica 95% no summary.

10. **CLIENTS MUST NOT CALCULATE FINANCIAL SUMMARY METRICS.**
    - `PortfolioIntelligenceSummaryViewModel` só formata e aplica templates factuais.

11. **PROVIDER/CONTEXT WORK MUST BE REUSED; SUMMARY CARDS MUST NOT TRIGGER INDEPENDENT DUPLICATE FETCH PIPELINES.**
    - 1 replay, 1 contexto, ≤1 IBOV, ≤1 CDI, 1 pass de valuation atual reusado pelo cenário (ADR-170).

12. **FUTURE AI MAY CONSUME PORTFOLIO INTELLIGENCE SUMMARY, BUT AI MUST NEVER BECOME THE SOURCE OF TRUTH FOR FINANCIAL METRICS.**
    - 3P não chama o AI Engine (ADR-172).

---

## 39. AI Grounding Foundation (Fase 3Q)

1. **AI GROUNDING MAY ONLY CONSUME APPROVED STRUCTURED READ MODELS.**
   - O grounding context (`PortfolioAiGroundingContextV1`) é derivado exclusivamente do `PortfolioIntelligenceSummary` aprovado da 3P. É terminantemente proibido acessar ledgers brutos, tabelas do Prisma ou transações raw.

2. **AI MUST NEVER BE THE SOURCE OF TRUTH FOR FINANCIAL METRICS.**
   - O Atlas nunca permite que modelos de linguagem probabilísticos calculem, aproximem ou definam métricas patrimoniais ou de performance.

3. **AI GROUNDING MUST NOT RECOMPUTE TWR, XIRR, BENCHMARK DIFFERENCES, RISK METRICS, TAIL RISK, OR SCENARIOS.**
   - `@atlas/ai-engine` é puramente um transportador determinístico de fatos. É proibida qualquer recalculação de métricas financeiras ou uso de float.

4. **EVERY GROUNDED FINANCIAL FACT MUST BE TRACEABLE TO A CANONICAL SOURCE PATH.**
   - Todo fato carrega `source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: string }` correspondente a uma propriedade navegável e válida no summary de entrada. Citações e URLs externas inventadas são proibidas.

5. **GROUNDING FACT IDS AND ORDERING MUST BE DETERMINISTIC.**
   - Fact IDs são canônicos, estáveis e legíveis (ex.: `BRL.OVERVIEW.MARKET_VALUE`, `BRL.PERFORMANCE.TWR`). A ordenação é estritamente canônica por categoria (`OVERVIEW` -> `PERFORMANCE` -> `BENCHMARK` -> `RISK` -> `RISK_ADJUSTED` -> `RELATIVE_RISK` -> `ACTIVE_PERFORMANCE` -> `TAIL_RISK` -> `SCENARIO`), depois escopo de moeda ASC, depois factId ASC. Duplicatas disparam erro imediato (fail-closed).

6. **MULTI-CURRENCY FACTS REMAIN SEGREGATED; NO IMPLICIT FX OR GLOBAL MONEY TOTAL.**
   - Carteiras com mais de uma moeda segregam fatos por escopo (`scope: "BRL"`, `scope: "USD"`). Nunca emitir fato monetário total consolidado sem motor explícito de câmbio. Adicionar limitação `MULTI_CURRENCY_NO_FX`.

7. **HISTORICAL, POINT-IN-TIME, AND HYPOTHETICAL FACTS MUST REMAIN EXPLICITLY DISTINGUISHABLE.**
   - Todo fato declara explicitamente sua natureza temporal: `POINT_IN_TIME`, `PERIOD`, `HISTORICAL` ou `HYPOTHETICAL`. Simulações de estresse não podem ser confundidas com perdas passadas ou previsões futuras.

8. **MODEL-FACING CONTEXT MUST EXCLUDE AUTHENTICATION DATA, SECRETS, PERSONAL IDENTIFIERS, AND RAW TRANSACTION LEDGERS.**
   - O grounding context exclui senhas, tokens de autenticação (JWT/refresh), sessões, dados sensíveis (CPF, e-mail, endereço), dados bancários e o histórico bruto de transações (`Transaction[]`).

9. **AI GROUNDING MUST REMAIN BOUNDED AND MUST NOT GROW WITH RAW TRANSACTION COUNT.**
   - O número de fatos e o tamanho serializado do contexto são limitados a $O(\text{métricas} \times \text{moedas})$, permanecendo estritamente constantes seja com 10, 100 ou 1.000 posições.

10. **PHASE 3Q DOES NOT INVOKE ANY MODEL PROVIDER.**
    - A Fase 3Q termina na construção e transporte do contexto de grounding. Chamadas a OpenAI, Anthropic, Gemini, modelos locais, chatbots, RAG ou embeddings são terminantemente proibidas nesta fase.

11. **AI RECOMMENDATION, PREDICTION, OPTIMIZATION, SCORING, OR TRADING ADVICE REMAIN OUTSIDE THE 3Q BOUNDARY.**
    - As capacidades do contexto declaram explicitamente `canRecommendTrades: false`, `canPredictReturns: false` e `canCalculateNewMetrics: false`.

---

## 40. Grounded AI Explanation Foundation (Fase 3R)

1. **AI EXPLANATION BOUNDARY STRICTLY BOUND TO GROUNDING CONTEXT.**
   - Explicações geradas por modelos de linguagem são estritamente limitadas aos fatos presentes no `PortfolioAiGroundingContextV1` (Fase 3Q). O modelo nunca pode afirmar métricas, números ou históricos ausentes do contexto de grounding.

2. **AI MODEL IS EXPLAINER, NEVER A FINANCIAL CALCULATOR.**
   - O `@atlas/ai-engine` e qualquer modelo de linguagem atuam exclusivamente na tradução didática e descritiva dos fatos. É terminantemente proibido delegar ao modelo cálculos de retorno, volatilidade, conversões cambiais ou projeções tributárias.

3. **DETERMINISTIC UPSTREAM CAPABILITY & INTENT GATE.**
   - Antes de invocar o grounding ou qualquer modelo, a consulta é classificada deterministicamente via `classifyExplanationIntent(question)`.
   - Pedidos de recomendação de compra/venda (`UNSUPPORTED_RECOMMENDATION`), projeções de mercado (`UNSUPPORTED_PREDICTION`), novos cálculos personalizados (`UNSUPPORTED_CUSTOM_CALCULATION`) ou conselhos fiscais (`UNSUPPORTED_TAX_ADVICE`) são recusados imediatamente:
     - Disparam **0 chamadas de grounding**.
     - Disparam **0 chamadas de modelo/provedor**.
     - Retornam status `UNSUPPORTED` com resposta explicativa padronizada.

4. **FAIL-CLOSED EVIDENCE VALIDATION AND STRUCTURED CITATIONS.**
   - O modelo deve citar os `factId`s exatos dos fatos utilizados no campo `evidenceFactIds`.
   - Todas as citações são validadas no backend contra `context.facts` (`validateExplanationEvidence`). Identificadores inexistentes rejeitam a resposta com `422 AI.INVALID_MODEL_RESPONSE`.
   - Se 0 evidências válidas forem retornadas em uma resposta suportada, o sistema falha fechado com `422 AI.INVALID_MODEL_RESPONSE`.
   - Os valores de evidência exibidos ao usuário vêm exclusivamente dos fatos de grounding, nunca da prosa do modelo.

5. **SERVER-SIDE KEY ISOLATION & ADAPTER ABSTRACTION.**
   - Provedores reais de modelo (`OpenAiProvider`) residem estritamente no backend (`apps/api`). Chaves de API (`OPENAI_API_KEY`) nunca são enviadas ao cliente web ou mobile nem incluídas em bundles.
   - Repositórios e use-cases dependem exclusivamente da abstração `AI_PROVIDER_TOKEN`.
   - Testes e desenvolvimento local utilizam compulsoriamente `FakeAiProvider`, garantindo execução 100% determinística e sem dependência de rede externa.

6. **TRANSIENT SINGLE-TURN EXPLANATION (NO PERSISTENCE / NO RAG).**
   - A explicação é efêmera e sem estado: não são criadas tabelas de mensagens de chat, histórico de conversas, embeddings ou bancos vetoriais.

7. **SEGREGATED MULTI-CURRENCY CONTEXTS PRESERVED.**
   - Carteiras com múltiplas moedas (`BRL`, `USD`) mantêm fatos estritamente segregados por escopo. O modelo é instruído e proibido de realizar somas ou médias sintéticas entre moedas distintas sem taxa explícita de câmbio.

8. **PROMPT INJECTION DEMARCATION AND STRICT JSON SCHEMA.**
   - Consultas de usuários são dados não-confiáveis e nunca instruções de sistema; respeitam a política `PORTFOLIO_AI_EXPLANATION_POLICY_V1`.
   - A saída do modelo deve validar estritamente o schema JSON esperado. Respostas inválidas retornam `422 AI.INVALID_MODEL_RESPONSE`.

9. **HTTP 200 REFUSAL SEMANTICS & API PROTECTION.**
   - O endpoint `POST /api/v1/portfolios/:portfolioId/ai/explain` retorna `200 OK` tanto para `ANSWERED` quanto para `UNSUPPORTED` (recusas por intenção não são erros HTTP).
   - Invariante anti-enumeração: carteiras não pertencentes ao usuário autenticado retornam `404 Not Found`.
   - Endpoint protegido por rate limit `@Throttle({ default: { limit: 20, ttl: 60000 } })`.

10. **AI MUST NOT ACCESS RAW LEDGERS, PRISMA, MARKET PROVIDERS, OR FINANCIAL ENGINES DIRECTLY.**
    - `ExplainPortfolioWithAiUseCase` consome exclusivamente `PortfolioAiGroundingContextV1` via `GetPortfolioAiGroundingContextUseCase` (1 chamada por request suportado).
    - É proibido importar Prisma, repositórios de portfólio, market providers ou engines financeiros no use-case de explicação.

11. **HISTORICAL METRICS MUST REMAIN EXPLICITLY HISTORICAL.**
    - Volatilidade, drawdown, Sharpe, Sortino, VaR/CVaR são medidas históricas do período; nunca previsões ou garantias futuras.

12. **SCENARIO RESULTS MUST REMAIN EXPLICITLY HYPOTHETICAL.**
    - Cenários (`EQUITY_DOWN_10`) são choques determinísticos hipotéticos; nunca previsões, probabilidades ou perdas esperadas.

13. **PROVIDER FAILURES MUST NOT BE MISLABELED AS FINANCIAL-DATA FAILURES.**
    - Timeout/5xx/rate-limit retornam `AI.PROVIDER_UNAVAILABLE` / `AI.PROVIDER_TIMEOUT` / `AI.PROVIDER_RATE_LIMIT` (`503`/`504`/`429`); nunca "dados financeiros indisponíveis".

14. **3R IS STATELESS; ONE MODEL CALL MAXIMUM PER SUPPORTED REQUEST.**
    - Sem persistência de conversas, sem cache Redis, sem `conversationId`/`messages[]`.
    - Request suportado: no máximo 1 chamada de modelo. Request não-suportado: 0 chamadas.

15. **NO AUTONOMOUS TOOL USE, RAG, EMBEDDINGS, OR AGENTS IN 3R.**
    - Ferramentas do provedor desabilitadas, sem web browsing/search, sem invocação de ferramentas pelo modelo (resposta com tool-call é `AI.INVALID_MODEL_RESPONSE`).

---

## 41. Regras da Fundamentação de Conversação de IA (Fase 3S)

1. **O HISTÓRICO CONVERSACIONAL NUNCA É FONTE DE VERDADE FINANCEIRA:**
   - O histórico de mensagens anteriores é contexto textual delimitado para compreensão linguística de anáforas e elipses; nunca fonte de dados ou evidência financeira.
   - Mensagens anteriores do assistente não substituem nem complementam fatos do grounding atual.

2. **FRESH GROUNDING POR TURNO SUPORTADO:**
   - Toda rodada conversacional suportada reconstrói um `PortfolioAiGroundingContextV1` completamente atualizado (fresh grounding) através de exatamente 1 chamada ao caso de uso canônico.

3. **CITAÇÃO E VALIDAÇÃO DE EVIDÊNCIAS CONTRA O GROUNDING ATUAL:**
   - Respostas do modelo no novo turno devem citar `factId`s estritamente pertencentes ao grounding ATUAL. Fatos inexistentes no contexto corrente disparam compulsoriamente `422 AI.INVALID_MODEL_RESPONSE`.

4. **ESTABILIDADE E AUDITORIA DA EVIDÊNCIA HISTÓRICA:**
   - Cada resposta persistida do assistente armazena um snapshot minimalista contendo estritamente os fatos canônicos citados naquela resposta (`MinimalEvidenceSnapshotFact`).
   - Evidências de respostas históricas nunca são atualizadas silenciosamente com os valores correntes do dia de hoje.

5. **HISTÓRICO DELIMITADO DETERMINÍSTICO (BOUNDED HISTORY):**
   - O histórico enviado ao provedor LLM é estritamente limitado por contagem (máximo 10 mensagens) e orçamento de caracteres (máximo 14.000 caracteres), descartando mensagens mais antigas primeiro (FIFO).
   - O grounding atual e a política do sistema têm prioridade absoluta sobre o histórico conversacional.
   - É proibido o uso de agentes ou LLMs secundários para sumarização de conversas na Fase 3S.

6. **GATE DE INTENÇÃO E RECUSA UPSTREAM (ZERO CALLS):**
   - Tentativas de obter recomendações de compra/venda, projeções futuras, cálculos arbitrários, consultoria fiscal ou prompt injections são interceptadas pelo gate determinístico antes de qualquer chamada ao modelo ou grounding (0 chamadas de grounding, 0 chamadas de modelo).

7. **PERSISTÊNCIA SEGURA E ISOLAMENTO MULTITENANT:**
   - Conversas pertencem exclusivamente a um usuário e a uma carteira (`userId`, `portfolioId`).
   - Acesso não autorizado ou cross-portfolio retorna invariavelmente `404 Not Found` (anti-enumeração).
   - É terminantemente proibido persistir chaves de API, tokens de autenticação, o livro de transações bruto (ledger), o contexto de grounding completo ou a requisição bruta do provedor.

8. **ANTI-ESCOPO DA FASE 3S:**
   - Proibido implementar RAG, embeddings, bancos vetoriais, agentes autônomos, chamadas de ferramentas (tool calling), navegação na web ou streaming de tokens (SSE/WebSocket).

---

## 42. Validação de Afirmações e Integridade de Citações de IA (Fase 3T)

1. **AUTORIDADE SERVIDORA SOBRE VALORES FINANCEIROS (SERVER AUTHORITY):**
   - Todo número ou valor financeiro apresentado ao investidor em explicações ou diálogos de IA é renderizado deterministicamente no servidor através de segmentos do tipo `FACT_VALUE`.
   - É terminantemente proibido confiar em números financeiros gerados pelo LLM ou permitir que literais de ponto flutuante/moeda inseridos pelo modelo cheguem ao usuário final.
   - Segmentos do tipo `TEXT` são proibidos de conter grandezas monetárias (`R$`, `US$`) ou percentuais literais (`%`).

2. **TAXONOMIA FECHADA DE AFIRMAÇÕES (`GROUNDED_CLAIM_TYPES`):**
   - As respostas são estruturadas em até 10 afirmações discretas (`GroundedClaimV1`), pertencentes exclusivamente aos 7 tipos canônicos:
     `FACTUAL_METRIC`, `BENCHMARK_COMPARISON`, `RISK_EXPLANATION`, `SCENARIO_EXPLANATION`, `DATA_QUALITY`, `LIMITATION`, `CONTEXTUAL_EXPLANATION`.
   - Cada afirmação é composta por até 10 segmentos sequenciais (`TEXT`, `FACT_VALUE`, `FACT_LABEL`).

3. **VALIDAÇÃO DETERMINÍSTICA FAIL-CLOSED (`validateGroundedClaims`):**
   - A validação de afirmações é uma função pura em `@atlas/ai-engine`, sem dependências de I/O ou bibliotecas de UI, com execução em complexidade linear O(N).
   - Qualquer violação semântica, estrutural ou de política invalida a resposta inteira (`isValid: false`), resultando compulsoriamente em HTTP 422 `AI.INVALID_MODEL_RESPONSE` na camada de API.
   - Respostas que falham na validação jamais são persistidas no banco de dados.

4. **COMPATIBILIDADE DE CATEGORIA E NATUREZA TEMPORAL/HIPOTÉTICA:**
   - Tipos de afirmação devem respeitar estritamente o mapa de categorias compatíveis (`CLAIM_CATEGORY_COMPATIBILITY`).
   - Fatos da categoria `SCENARIO_ANALYSIS` representam simulações estritamente hipotéticas e só podem ser citados sob `SCENARIO_EXPLANATION`; jamais sob `FACTUAL_METRIC` ou como rentabilidade garantida/futura.
   - Fatos de cauda (`TAIL_RISK`) são métricas históricas observadas e jamais podem ser apresentados como cenários hipotéticos.

5. **FORMATAÇÃO DECIMAL NATIVA (ZERO FLOATS IEEE 754):**
   - A formatação de valores e rótulos (`formatFactValueForDisplay`, `formatFactLabelForDisplay`) é executada nativamente em `@atlas/ai-engine` através de manipulação estrita de strings decimais canônicas.
   - Moedas recebem prefixo monetário (`R$`, `US$`), percentuais recebem `%`, pontos percentuais recebem `p.p.` com sinal explícito quando positivo, índices/ratios permanecem sem unidade, e contagens são formatadas como inteiros.
   - Fatos indisponíveis (`isAvailable: false`) são renderizados invariavelmente como travessão (`—`).

6. **ISOLAMENTO CAMBIAL POR AFIRMAÇÃO:**
   - Uma afirmação factual não pode misturar fatos monetários de moedas distintas sem contexto ou conversão explícita aprovada (Zero Implicit FX).

7. **ANTI-ESCOPO DA FASE 3T:**
   - Proibido implementar RAG, embeddings, bancos vetoriais, agentes autônomos, busca na web, streaming (SSE/WebSocket), recomendações de investimento ou recálculo financeiro pelo modelo.

---

## 43. Regras de Streaming de IA e Entrega Resiliente (Fase 3U)

1. **PROIBIÇÃO DE AUTORIDADE FINANCEIRA PARCIAL (ADR-200):**
   - Texto parcial ou intermediário do provedor de IA **NUNCA** é resposta financeira nem autoridade patrimonial.
   - É terminantemente proibido transmitir números, moedas, cotações ou percentuais literais gerados pelo modelo nos eventos de progresso (`PROGRESS`).
   - A resposta financeira autoritativa e suas evidências comprovadas só são emitidas no evento terminal `FINAL`, após validação completa de claims no servidor.

2. **BUFFER OBRIGATÓRIO NO SERVIDOR E VALIDAÇÃO PRÉ-FINAL (ADR-200):**
   - Toda resposta bruta do provedor de IA é integralmente retida em buffer de memória no servidor (`apps/api`).
   - As afirmações estruturadas (`GroundedClaimInput`) são submetidas à validação de claims (`validateGroundedClaims`) e renderizadas deterministicamente (`renderValidatedClaims`) com formatação canônica de strings decimais exatas antes de compor o evento `FINAL`.

3. **SEQUENCIAMENTO MONOTÔNICO E TRAVAMENTO TERMINAL (ADR-199):**
   - O protocolo SSE obedece à especificação `STREAM_SCHEMA_VERSION = '1'`.
   - Eventos iniciam compulsoriamente com `sequence = 1` e avançam estritamente de `+1` em `+1`.
   - O fluxo transmite no máximo **8 eventos** por mensagem.
   - Após a emissão de um evento terminal (`FINAL` ou `ERROR`), o emissor (`GroundedAiStreamEmitter`) é travado contra qualquer emissão subsequente.

4. **PERSISTÊNCIA ATÔMICA ANTES DO FINAL (PERSIST-BEFORE-FINAL, ADR-203):**
   - O turno da conversa é gravado no PostgreSQL (`conversationRepository.appendTurn`) **antes** da transmissão do evento terminal `FINAL`.
   - Em caso de falha de persistência, um evento `ERROR` (`AI.INTERNAL_ERROR`) é emitido e nenhum evento `FINAL` é transmitido.
   - Em caso de cancelamento pelo cliente (`AbortSignal`) ou erro do provedor, nenhum turno de assistente respondido com sucesso é persistido no banco.

5. **CANCELAMENTO RESILIENTE E PROPAGAÇÃO DE ABORT (ADR-201):**
   - Desconexões de socket (`req.on('close')`) e sinais de cancelamento do cliente são propagados imediatamente ao provedor a jusante (`AICompletionOptions.signal`), interrompendo a requisição sem processos zumbis.

6. **ISOLAMENTO DE RECURSOS E PROTEÇÃO PRÉ-STREAM (ADR-202):**
   - A verificação de propriedade (`verifyOwnership`) é executada compulsoriamente antes do envio de cabeçalhos SSE. Tentativas de acesso não autorizado ou cross-portfolio respondem com HTTP puro `404 Not Found` (anti-enumeração).
   - Rate limit estrito de 20 requisições por minuto por usuário.

7. **ZERO IMPACTO UPSTREAM (DELTA 3T → 3U = 0):**
   - A Fase 3U é estritamente uma camada de transporte e entrega resiliente.
   - Adiciona zero cálculos financeiros, zero replay, zero chamadas de valuation e zero alterações em motores a montante.
   - Exatamente 1 chamada de provedor para requisições suportadas, 0 chamadas para requisições não-suportadas.

8. **ANTI-ESCOPO DA FASE 3U:**
   - Proibido implementar RAG, embeddings, bancos vetoriais, agentes autônomos, busca na web, recomendações de investimento ou recálculo financeiro.

---

## 44. Regras de Confiabilidade, Observabilidade e Governança de Uso de IA (Fase 3V)

1. **MINIMIZAÇÃO DE DADOS E PRIVACIDADE EM TELEMETRIA (ADR-205):**
   - Registros de telemetria de IA **NUNCA** devem armazenar por padrão a pergunta bruta do usuário, o prompt construído (system/user), a resposta do modelo ou fatos de grounding.
   - Valores financeiros, quantias monetárias, cotas ou patrimônio **NUNCA** devem constar na telemetria genérica de observabilidade.
   - Senhas, chaves de API (`OPENAI_API_KEY`), tokens de autenticação (JWT), e-mails ou CPF são terminantemente proibidos na telemetria.
   - O rastreamento utiliza contagens seguras (`questionLength`, `historyMessageCount`, `historyChars`, `groundingFactCount`, `claimCount`).

2. **CONTABILIDADE FIDEDIGNA E ESTRITA DE TOKENS (ADR-206):**
   - O uso de tokens reportado pelo provedor (`prompt_tokens`, `completion_tokens`, `total_tokens`) é a contabilidade canônica operacional de recursos.
   - Todo campo deve ser um inteiro seguro não-negativo (`isValidTokenCount`). São **terminantemente proibidos**: coerção de strings, truncamentos via `Math.floor`/`Math.round`, e clamps de negativos via `Math.max(0, ...)`.
   - Validação atômica: qualquer campo malformado ou inconsistente com a soma (`total !== prompt + completion`) invalida todo o uso para `source: 'UNAVAILABLE'` e `null` em todos os campos, sem reparo silencioso.
   - Relato genuíno de `0 / 0 / 0` pelo provedor é válido e gravado como `source: 'PROVIDER'`.
   - Se o provedor não reportar uso, os tokens devem ser gravados como `null` com `source: 'UNAVAILABLE'`, **NUNCA** reportando silenciosamente zero.
   - Requisições não suportadas ou orçamentos excedidos registram tokens `0` com `source: 'NOT_APPLICABLE'`.
   - Sem tabelas de precificação monetária fictícia na Fase 3V. Falhas na telemetria de uso operam em fail-open e não afetam o status da resposta ao usuário.

3. **BAIXA CARDINALIDADE EM MÉTRICAS (ADR-209):**
   - As dimensões/tags de métricas agregadas devem ser estritamente de baixa cardinalidade (`operation`, `deliveryMode`, `intent`, `status`, `provider`, `model`, `errorCode`).
   - Identificadores de alta cardinalidade (`requestId`, `portfolioId`, `conversationId`, `userId`) pertencem exclusivamente a logs e traces estruturados, sendo **expressamente proibidos** em dimensões de métricas.

4. **TELEMETRIA FAIL-OPEN (ADR-204):**
   - Falhas no registro de telemetria (ex: sink de logs indisponível) **NUNCA** devem quebrar ou impedir o retorno de respostas de IA válidas para o usuário.

5. **GOVERNANÇA DE ORÇAMENTO DE CONTEXTO PRÉ-PROVEDOR (ADR-207):**
   - O payload de contexto serializado é validado deterministicamente contra o orçamento (`AI_DEFAULT_MAX_CONTEXT_BYTES = 32,768`).
   - Se exceder o orçamento, a requisição é rejeitada imediatamente (`AI.CONTEXT_BUDGET_EXCEEDED`) com **zero** chamadas ao provedor de IA (`providerCallCount = 0`).

6. **AVALIAÇÃO DETERMINÍSTICA OFFLINE (NO LLM JUDGE) (ADR-208):**
   - A esteira de avaliação (`pnpm test:ai-evals`) é 100% determinística, rodando offline em CI sem chamadas pagas externas.
   - Proibido o uso de juiz modelo (LLM-as-a-judge), modelos de reparo automático ou notas de qualidade arbitrárias (ex: 85/100). Cada invariante recebe avaliação binária PASS ou FAIL.
   - As fixtures canônicas douradas (`AI-EVAL-001` a `AI-EVAL-016`) atuam como barreiras de regressão do sistema.

7. **LIMITAÇÃO ESTRITA DE CHAMADAS A PROVEDORES:**
   - Requisições suportadas realizam no máximo 1 chamada ao provedor de IA (`providerCallCount <= 1`).
   - Requisições não suportadas realizam rigorosamente 0 chamadas (`providerCallCount = 0`).

8. **ANTI-ESCOPO DA FASE 3V:**
   - A Fase 3V não adiciona RAG, embeddings, bancos vetoriais, agentes autônomos, busca na web, recomendações ou previsões de investimento.

---

## 45. Regras de Inteligência de Ativos e Escopo de IA (Fase 3W)

1. **ASSETID COMO IDENTIDADE CANÔNICA (ADR-210):**
   - O `AssetId` é a identidade canônica e inequívoca do ativo financeiro no escopo de IA. O ticker/símbolo atua unicamente como metadado visual de exibição.
   - Requisições com escopo de ativo devem resolver o `AssetId` antes de qualquer invocação ao provedor de IA. É **terminantemente proibido** utilizar LLMs para inferir ou adivinhar o ativo a partir de texto livre.

2. **AUTORIDADE CANÔNICA E ZERO RECÁLCULO FINANCEIRO (ADR-211, ADR-212):**
   - Fatos de ativos derivam exclusivamente dos modelos de leitura e avaliação canônicos (`PortfolioReadApi`, `PortfolioReplayEngine`, `PortfolioValuation`).
   - A IA pode explicar valores canônicos preexistentes, mas **NUNCA** calcular novos valores financeiros ou métricas contábeis.
   - É expressamente proibido enviar o histórico bruto de transações (ledger) ao modelo de IA.

3. **SEMÂNTICA DE PRECISÃO E VALORES INDISPONÍVEIS (ADR-212):**
   - Fatos de ativos preservam moedas, unidades e naturezas canônicas com precisão decimal exata (`Money`, `Quantity`, `Percentage` em strings decimais).
   - Preço médio desconhecido (`UNKNOWN_COST_BASIS`) ou cotação indisponível (`PRICE_UNAVAILABLE`) resultam estritamente em valor `null`, **NUNCA** sendo coagidos para `"0"` ou `0`.

4. **ESCOPO POR MENSAGEM E SEM SANGRIA HISTÓRICA (ADR-213):**
   - O escopo de conversa é avaliado por mensagem (`{ type: 'PORTFOLIO' } | { type: 'ASSET', assetId }`).
   - O escopo de turnos anteriores **NUNCA** deve sangrar silenciosamente para turnos futuros. Limpar o escopo na interface retorna imediatamente ao contexto global da carteira.

5. **PROIBIÇÃO ESTRITA DE EVIDÊNCIA CRUZADA (ADR-214):**
   - Em requisições com escopo de ativo (`targetAssetId`), é proibido que qualquer claim cite fatos pertencentes a outro ativo.
   - Violações disparam imediatamente `CROSS_ASSET_EVIDENCE_PROHIBITED` e falha fechada com `422 Unprocessable Entity` (`AI.INVALID_MODEL_RESPONSE`).

6. **CONTEXTO BOUNDED INDEPENDENTE DO TAMANHO DA CARTEIRA (ADR-215):**
   - O contexto de grounding de ativo é estritamente limitado ($\le 25$ fatos de ativo e orçamento total $\le 32.768$ bytes), independentemente de a carteira possuir 10, 100 ou 1.000 posições.
   - Métricas de telemetria utilizam exclusivamente `scopeType: 'PORTFOLIO' | 'ASSET'`, excluindo `assetId` de labels para evitar explosão de cardinalidade.

7. **BARRAGEM PRÉ-MODELO DE INTENÇÕES NÃO SUPORTADAS:**
   - Perguntas de recomendação ("devo comprar mais?"), previsão ("vai subir?") ou opinião de valuation permanecem bloqueadas deterministicamente antes de qualquer chamada a provedores (`providerCallCount = 0`).

8. **ANTI-ESCOPO DA FASE 3W:**
   - A Fase 3W proíbe estritamente RAG, bancos vetoriais, embeddings, agentes autônomos, busca na internet, web scraping, ferramentas (function calling) ou novas autoridades financeiras.

---

## 46. Arquitetura e Invariantes do AI Timeline Grounding (Fase 3X)

1. **AUTORIDADE CANÔNICA DE HISTÓRICO E ZERO REPLAY PARALELO (ADR-216):**
   - O grounding temporal e de eventos consome exclusivamente projeções canônicas de leitura (`PortfolioReadApi`, `PortfolioReplayEngine`, `PortfolioReadModelMapper`).
   - É terminantemente proibido reimplementar interpretação de ledger ou cálculo de replay no motor de IA.
2. **ZERO LEDGER BRUTO AO PROVEDOR DE IA (ADR-217):**
   - Linhas brutas da tabela `Transaction` ou entidades do Prisma **NUNCA** devem ser enviadas aos modelos de linguagem.
   - O modelo recebe exclusivamente a projeção sanitizada `PortfolioAiEventV1` contendo apenas dados econômicos relevantes.
3. **PRIMAZIA DA DATA ECONÔMICA E ESCOPO TEMPORAL EXPLÍCITO (ADR-218):**
   - A data econômica civil (`tradeDate`, `LocalDate`, `YYYY-MM-DD`) é soberana e imune a fusos horários. Timestamps técnicos (`createdAt`) nunca representam datas de eventos financeiros.
   - O escopo temporal (`TIMELINE` ou `ASSET_TIMELINE`) é fornecido explicitamente a cada mensagem (`[from, to]`). O modelo nunca deduz ou expande intervalos de datas por conta própria.
   - Intervalos de calendário inválidos (ex: datas civis inexistentes ou `from > to`) ou que excedam o teto de 366 dias (`MAX_TIMELINE_RANGE_DAYS`) são rejeitados compulsoriamente com erro 400.
4. **CONTEXTO DE EVENTOS DELIMITADO E SELEÇÃO DETERMINÍSTICA (ADR-219):**
   - O número de eventos no contexto é limitado a no máximo 50 (`MAX_AI_TIMELINE_EVENTS = 50`).
   - A seleção prioriza os 50 eventos mais recentes do período por ordenação determinística (`economicDate DESC, eventId DESC`) e os apresenta em ordem cronológica (`economicDate ASC, eventId ASC`) no prompt.
   - Em caso de truncamento, a limitação `PARTIAL_TIMELINE_EVENTS` e `summaryFacts.hasMore: true` são obrigatoriamente divulgados ao investidor.
5. **PRECISÃO DECIMAL EXATA E ZERO COERÇÃO (ADR-220):**
   - Quantidades transacionadas e valores monetários preservam strings decimais canônicas exatas.
   - Valores desconhecidos ou indisponíveis jamais são convertidos para zero.
   - O `AssetId` permanece a identidade canônica e inequívoca do ativo.
6. **DISTINÇÃO SEMÂNTICA DE NATUREZAS DE EVENTOS (ADR-220):**
   - Semânticas de `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `DIVIDEND`, `JCP`, `SPLIT`, `BONUS`, `AMORTIZATION` permanecem estritamente distintas. Transferências não são compras, proventos não são aportes e bonificações não são trades.
7. **ZERO CÁLCULOS OU AGREGAÇÕES FINANCEIRAS PELA IA:**
   - A IA pode explicar eventos passados, mas é expressamente proibida de computar agregações ou novos totais contábeis no período.
8. **ESTABILIDADE E IMUTABILIDADE DE EVIDÊNCIAS HISTÓRICAS (ADR-221):**
   - Snapshots de evidências de mensagens anteriores permanecem imutáveis. O surgimento de novos eventos é capturado deterministicamente pela reconstrução de contexto no turno subsequente.
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - As garantias de streaming seguro (3U), governança estrita de tokens e telemetria fail-open (3V) e isolamento de escopo de ativos (3W) permanecem integralmente ativas e invioláveis.

---

## 47. Eficiência de Contexto e Seleção Determinística de Relevância (Fase 3Y)

1. **SELEÇÃO DE GROUNDING DETERMINÍSTICA E PRÉ-PROVEDOR (ADR-222):**
   - A escolha dos fatos enviados ao provedor é feita por lógica determinística de servidor (`selectGroundingFacts`), **antes** de qualquer chamada ao modelo, a partir de intenção classificada deterministicamente e escopo explícito.
   - Entradas permitidas: `intent`, `scope.type`, `AssetId`, intervalo temporal, filtros de tipo de evento e capacidades canônicas.
   - É **terminantemente proibido** usar a saída do provedor, embeddings, similaridade vetorial ou ranking por magnitude numérica de valores financeiros para decidir relevância. Ranking por "valor grande" introduziria julgamento financeiro oculto.
   - Versão da política exposta para auditoria: `GROUNDING_SELECTION_POLICY_VERSION = "1"`. Não é atrelada à versão do Portfolio Engine.
2. **GROUNDING CANÔNICO E PROJEÇÃO PARA O PROVEDOR SÃO CONCEITOS DISTINTOS (ADR-223):**
   - O grounding canônico permanece rico e autoritativo, e não é alterado pela otimização.
   - A projeção para o provedor é compacta, local à requisição e derivada apenas dos fatos selecionados; ela não possui autoridade financeira própria.
3. **O CONTEXTO DO PROVEDOR CONTÉM APENAS O EXIGIDO PELA INTENÇÃO E PELO ESCOPO:**
   - Pergunta sobre rentabilidade não recebe automaticamente cauda, cenário ou métricas não relacionadas; pergunta sobre risco não recebe automaticamente performance e cenário; pergunta sobre preço médio não recebe automaticamente proventos, benchmark ou timeline.
4. **FATOS EXCLUÍDOS NÃO SÃO AUTORITATIVOS NO TURNO (ADR-227):**
   - O registro autoritativo do turno (`canonicalFactRegistry`) contém **apenas** os fatos selecionados.
   - A validação de claims e de evidências opera sobre a autoridade selecionada, nunca sobre o conjunto canônico completo. Citar fato excluído falha fechado com `422 AI.INVALID_MODEL_RESPONSE` e nada é persistido.
   - A seleção é finalizada antes do provedor e **nunca** é revisada após a resposta. Não há ferramentas nem segunda chamada para obter mais fatos no meio do turno.
5. **COMPACTAÇÃO NUNCA ALTERA SEMÂNTICA FINANCEIRA:**
   - Proibido alterar valor, moeda, natureza (`CURRENT` / `HISTORICAL` / `HYPOTHETICAL`), status de disponibilidade ou tipo semântico.
   - Strings decimais permanecem exatas: `3.999999999999999999` nunca se torna `4` nem `3.99`. Arredondamento é exclusivamente da camada de renderização.
   - Proibido fundir realizado com não realizado, `DIVIDEND` com `JCP`, `BUY` com `TRANSFER_IN`, ou moedas distintas. Custo desconhecido permanece `null`, nunca `0`.
6. **LIMITAÇÕES NECESSÁRIAS À INTERPRETAÇÃO SOBREVIVEM À SELEÇÃO:**
   - `PARTIAL_TIMELINE_EVENTS` e `EMPTY_TIMELINE_PERIOD` nunca são removidas para economizar bytes. Nenhuma diretriz de segurança da política de sistema é removida por motivo de tamanho.
7. **O PAYLOAD FINAL DO PROVEDOR É SEMPRE MEDIDO APÓS A COMPACTAÇÃO (ADR-225):**
   - Ordem canônica: seleção -> compactação -> mensagens finais -> medição exata de bytes UTF-8 -> decisão de orçamento -> provedor.
   - `32768` bytes permanece limite rígido e inalterável: `<= 32768` permitido, `> 32768` bloqueado (32768 permitido, 32769 bloqueado). Proibido elevar o limite ou estimar por contagem de tokens.
   - Payload acima do orçamento após compactação: `0` chamadas de provedor, `AI.CONTEXT_BUDGET_EXCEEDED`, nenhum `FINAL` no streaming, nenhuma resposta de assistente persistida.
   - Proibido descartar mensagens arbitrárias do provedor para caber no orçamento.
8. **NENHUM SUMARIZADOR, EMBEDDING OU CHAMADA ADICIONAL DE MODELO (ADR-226):**
   - Proibido usar LLM sumarizador, compressor, juiz, modelo de reparo, embeddings, banco vetorial ou RAG para selecionar ou compactar contexto.
   - Seleção custa `0` chamadas de provedor. Requisição suportada: no máximo `1` chamada. Requisição não suportada: `0`.
   - Histórico conversacional continua sendo contexto linguístico (3S), nunca verdade financeira, e nunca é resumido por modelo.
9. **EVIDÊNCIA HISTÓRICA PERSISTIDA USA IDENTIDADE CANÔNICA (ADR-224):**
   - Aliases de evidência (`F1`, `F2`) são efêmeros e locais à requisição, resolvidos no servidor antes da validação. É **proibido** persistir aliases como identidade histórica.
10. **TELEMETRIA DE SELEÇÃO PRESERVA PRIVACIDADE E BAIXA CARDINALIDADE:**
    - Permitidos: `selectedFactCount`, `availableFactCount`, `contextBytes`, `budgetUtilizationBucket`, `scopeType`, `intent`, `selectionPolicyVersion`.
    - Proibidos como rótulo de métrica: `factId`, `assetId`, `portfolioId`, `conversationId`, `userId`, `requestId` e contagens brutas de bytes. Proibido registrar texto de pergunta, texto de resposta ou qualquer valor financeiro.
11. **ZERO DELTA FINANCEIRO:**
    - A seleção opera sobre grounding já construído: zero novo replay, zero nova valuation, zero nova busca de mercado, zero nova chamada de benchmark ou cenário, zero novo algoritmo financeiro e zero N+1.
12. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - As garantias de streaming seguro (3U), governança estrita de tokens e telemetria fail-open (3V), isolamento de escopo de ativos por `AssetId` (3W) e autoridade de timeline (3X) permanecem integralmente ativas e invioláveis.

---

## 48. Arquitetura e Invariantes do Tax Engine Foundation (Fase 4A)

1. **AUTORIDADE EXCLUSIVA DO TAX ENGINE (ADR-235):**
   - Todo cálculo fiscal pertence exclusivamente a `@atlas/tax-engine`. UI, API (exceto orquestração), IA e clientes nunca calculam tributos.
2. **LIVRO-RAZÃO IMUTÁVEL COMO FONTE DA VERDADE FISCAL (ADR-236):**
   - `FiscalEvent` e o Tax Ledger são **derivados** do livro-razão imutável de transações e nunca editáveis. A projeção é determinística, idempotente e invariante à ordem de entrada.
3. **REGRAS FISCAIS VERSIONADAS E EFETIVAS POR DATA (ADR-237):**
   - Todo comportamento fiscal material deriva de `TaxRuleSet` versionado com vigência explícita. Sem regra vigente → falha fechada; sobreposição de vigência → config inválida. Nenhuma alíquota/isenção/limite legal hardcoded sem fonte oficial verificada.
4. **SUJEITO PASSIVO DISTINTO DE CARTEIRA (ADR-238):**
   - A arquitetura fiscal não fica permanentemente acoplada a um único `PortfolioId`. `TaxSubjectId` é opaco e nunca usa PII (CPF). Transferências internas não geram venda/compra.
5. **QUALIDADE DE DADOS FISCAL COM FALHA FECHADA (ADR-239):**
   - Desconhecido nunca vira zero. Custo/base/categoria/regra ausentes falham fechado (`PARTIAL`/`BLOCKED`). Moedas distintas não são somadas sem FX.
6. **SEM MATEMÁTICA FISCAL NA IA OU NA UI (ADR-240):**
   - Web, Mobile e IA nunca calculam tributos. Perguntas fiscais conversacionais permanecem `UNSUPPORTED_TAX` com zero chamadas ao provedor.
7. **DECISÃO DE PERSISTÊNCIA (ADR-241):**
   - A Fase 4A adota compute-on-read, sem migração de estado fiscal derivado. Se persistência for adicionada no futuro, deve ser recalculável e carregar fingerprint de entrada — nunca fonte da verdade.
8. **MAPEAMENTO EXAUSTIVO DOS 16 TIPOS DE TRANSAÇÃO:**
   - Todo tipo canônico é explicitamente mapeado para um `FiscalEventType` e `FiscalRelevance`. Transferências (`TRANSFER_IN`/`TRANSFER_OUT`) nunca são compra/venda. `DIVIDEND`, `JCP` e `FII_INCOME` permanecem distintos.
9. **CLASSIFICAÇÃO FISCAL POR METADADOS CANÔNICOS:**
   - A categoria fiscal deriva de `AssetType`, nunca do ticker. Entrada desconhecida → `UNKNOWN`, que nunca recebe tratamento de equity.
10. **SEM FLOAT FINANCEIRO:**
    - Zero `parseFloat`/`Number()`/aritmética IEEE-754 em caminhos fiscais. Strings decimais exatas de ponta a ponta.
11. **ESCOPO DA FASE 4A:**
    - A Fase 4A **não** calcula imposto a pagar, DARF ou IRPF e não implica cobertura completa da legislação brasileira.
12. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z) e Market Intelligence permanecem inalterados e invioláveis.

---

## 49. Arquitetura e Invariantes da Responsabilidade Tributária Mensal (Fase 4B)

1. **AUTORIDADE ÚNICA (ADR-242):**
   - A responsabilidade tributária mensal é calculada exclusivamente por `@atlas/tax-engine`. UI, mobile, controllers, IA e renderer nunca calculam imposto.
2. **RELEVÂNCIA FISCAL 4A ≠ TRIBUTABILIDADE LEGAL (ADR-245):**
   - O rótulo de relevância fiscal da 4A (ex.: `TAXABLE`) não significa imposto devido. Somente uma regra `VERIFIED` efetiva decide tributação, isenção, retenção ou não-tributação.
3. **REGRAS DE PRODUÇÃO VERIFICADAS (ADR-245):**
   - `taxDue` de produção só existe sob regra `VERIFIED` com proveniência oficial (`legalSourceId`, `effectiveFrom`, `verifiedAt`). Regras `TEST_ONLY` nunca produzem responsabilidade de produção. Sem fonte oficial, não se inventa valor legal; o registro de produção fica vazio e a apuração falha fechada.
4. **REGRA EFETIVA E ESTABILIDADE HISTÓRICA (ADR-237, ADR-248):**
   - A regra é resolvida por jurisdição + categoria + data. Sobreposição é config inválida; lacuna é `MISSING_RULE_SET`. Regra futura nunca reescreve resultado histórico.
5. **PREJUÍZO ISOLADO POR CATEGORIA (ADR-243):**
   - `closing = opening − lossApplied + lossGenerated`, exato. Prejuízo de uma categoria não compensa outra sem regra verificada. Desconhecido nunca vira zero: `UNKNOWN_OPENING_LOSS_BALANCE` torna o resultado `PARTIAL`.
6. **RETENÇÃO CANÔNICA (ADR-244):**
   - Retenção deriva exclusivamente de `FiscalEvent`/campo canônico; nunca estimada. `taxDue = max(0, taxBeforeWithholding − withholdingApplied)`.
7. **SEM ZERO FABRICADO (ADR-247):**
   - `BLOCKED`/`PARTIAL` → `taxDue = null`. `NO_ACTIVITY` → `taxDue = "0"` somente com histórico conhecido. Imposto nunca é negativo.
8. **TRILHA DE CÁLCULO (ADR-246):**
   - Toda apuração emite `TaxCalculationTraceV1` estruturada, determinística, com referências a eventos fiscais e versão de regra. Sem prosa, sem float.
9. **DECIMAL EXATO E MOEDA:**
   - Zero `parseFloat`/`Number()`/`Math.round` em caminhos fiscais. Sem FX implícito; moeda não suportada → `BLOCKED`.
10. **SEM VAZAMENTO TEMPORAL:**
    - O mês não enxerga eventos nem regras de meses futuros.
11. **ANTI-ESCOPO 4B:**
    - Não gera DARF, pagamento, juros/multa ou IRPF; não integra Receita Federal; não oferece otimização/planejamento tributário; a IA permanece `UNSUPPORTED_TAX` com zero chamadas ao provedor.
12. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e a fundação fiscal 4A permanecem inalterados e invioláveis.

---

## 50. Arquitetura e Invariantes de Inputs Tributários Canônicos (Fase 4B.2)

1. **COMPLETUDE DE INPUT ≠ COBERTURA DE REGRA:**
   - A existência de inputs canônicos (classificação de operação, retenção/IRRF, metadados de FII) **não** ativa cálculo tributário. Regras de produção verificadas permanecem separadas e ausentes na 4B.2.
2. **CLASSIFICAÇÃO DE OPERAÇÃO CANÔNICA (ADR-249):**
   - `NORMAL | DAY_TRADE | UNKNOWN` com proveniência. Proibido inferir `DAY_TRADE` por heurística (mesmo ativo + mesmo dia + BUY/SELL). `UNKNOWN` nunca vira `NORMAL`.
3. **RETENÇÃO/IRRF CANÔNICA (ADR-250):**
   - Valor decimal exato, moeda explícita, proveniência. Nunca estimada. `UNKNOWN` não carrega valor. Só `CONFIRMED` poderá alimentar regra de produção futura.
4. **METADADOS DE CONDIÇÃO DE FII (ADR-251):**
   - Input factual, nunca tratamento tributário. `KNOWN` exige todos os fatos; `UNKNOWN` não adivinha. `asOfDate` explícito; metadado atual não é verdade histórica automática.
5. **PROVENIÊNCIA DE INPUTS (ADR-252):**
   - Todo input carrega `source`/`sourceReference`; manual exige confirmação e não sobrescreve importado sem tratamento de conflito.
6. **SEM HEURÍSTICA TRIBUTÁRIA (ADR-253):**
   - Ausência de dado nunca vira valor favorável/desfavorável. `UNKNOWN` permanece `UNKNOWN`; input exigido ausente mantém `PARTIAL`/`BLOCKED`.
7. **PRONTIDÃO SERVER-SIDE:**
   - `GET /api/v1/fiscal/inputs/:competence` expõe prontidão (COMPLETE/PARTIAL/MISSING/UNKNOWN/NOT_REQUIRED) e issues. Read-only; sem cálculo de imposto.
8. **UI SEM MATEMÁTICA FISCAL:**
   - A UI mostra disponibilidade de inputs e pendências; nunca calcula imposto nem infere valores.
9. **ANTI-ESCOPO 4B.2:**
   - Nenhuma regra de produção, alíquota, limiar, DARF, pagamento, IRPF, integração Receita ou resposta fiscal de IA. A IA permanece `UNSUPPORTED_TAX` com provedor 0.
10. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B permanecem inalterados e invioláveis.

---

## 51. Arquitetura e Invariantes de Persistência de Inputs Tributários (Fase 4B.3)

1. **PERSISTÊNCIA COM PROVENIÊNCIA (ADR-254):**
   - Inputs tributários canônicos são persistidos com identidade estável, escopo de sujeito, `sourceType`/`sourceReference`, fingerprint e proveniência.
2. **DUPLICATA ≠ CONFLITO (ADR-255):**
   - Mesma identidade + mesmo fingerprint = duplicata idempotente (uma linha). Mesma identidade + fingerprint diferente = conflito explícito (`409`), **nunca** sobrescrita silenciosa. A `unique constraint` do banco é a barreira de concorrência.
3. **PROVENIÊNCIA MANUAL (ADR-256):**
   - Entrada manual exige `MANUAL*` + `confirmedAt`; não sobrescreve importado. Manual é fato, não regra, e não ativa responsabilidade tributária.
4. **SEM MUTAÇÃO DO LIVRO-RAZÃO:**
   - Registros de input apenas referenciam `transactionId`/`assetId`; as linhas imutáveis de `transactions` nunca são alteradas.
5. **UNKNOWN PERMANECE UNKNOWN:**
   - Nunca normalizado para valor favorável/desfavorável. `amount` nulo quando `UNKNOWN`.
6. **SEMÂNTICA as-of (ADR-257):**
   - Fatos datados; leitura por `asOf` sem vazamento futuro; retenção segregada por competência.
7. **REGRA DE PRODUÇÃO AINDA DESABILITADA:**
   - A 4B.3 adiciona **zero** regras de produção. A responsabilidade tributária real permanece indisponível (fonte oficial ainda pendente).
8. **SEM CLASSIFICADOR AUTOMÁTICO DE DAY TRADE:**
   - A classificação só se torna canônica a partir de fonte explícita (importada/confirmada). Proibida inferência por heurística.
9. **PRONTIDÃO SERVER-SIDE:**
   - `GET /api/v1/fiscal/inputs/:competence` lê dados persistidos e reflete conflitos como `PARTIAL`, nunca `COMPLETE`.
10. **ANTI-ESCOPO 4B.3:**
    - Nenhuma regra de produção, DARF, pagamento, IRPF, integração Receita ou resposta fiscal de IA. A IA permanece `UNSUPPORTED_TAX` com provedor 0.
11. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B permanecem inalterados e invioláveis.

---

## 52. Arquitetura e Invariantes de UX de Inputs Tributários (Fase 4B.4)

1. **INPUT COMPLETO ≠ REGRA COBERTA ≠ APURAÇÃO DISPONÍVEL (ADR-261):**
   - A prontidão distingue três estados independentes: dados disponíveis, regras tributárias disponíveis e apuração disponível. Dados completos **nunca** implicam imposto apurado.
2. **INPUT MANUAL É FATO, NÃO LEI (ADR-258):**
   - A UX coleta fatos; nunca alíquota, isenção, imposto ou compensação. Estado inicial `UNKNOWN`; proibido default `NORMAL`/`0`/`false`.
3. **PROVENIÊNCIA MANUAL:**
   - Salvar registra `MANUAL*` + `confirmedAt`. Editar com valor diferente gera conflito explícito.
4. **CONFLITOS EXPLÍCITOS E RESOLUÇÃO AUDITÁVEL (ADR-260):**
   - Conflitos permanecem explícitos até resolução (`KEEP_EXISTING`/`ACCEPT_NEW`); registros originais preservados; nunca sobrescrita silenciosa.
5. **ADAPTADORES PROVIDER-NEUTRAL (ADR-259):**
   - Adaptadores emitem apenas modelos canônicos; sem fonte real o registro permanece vazio. Prioridade de fonte não é hardcoded.
6. **DECIMAL EXATO NO CLIENTE:**
   - Strings decimais exatas; proibido `parseFloat`/`Number()` em valores financeiros; comma brasileiro normalizado deterministicamente; campo vazio ≠ `"0"`.
7. **SEM CLASSIFICADOR AUTOMÁTICO DE DAY TRADE.**
8. **ANTI-ESCOPO 4B.4:**
   - Nenhuma regra de produção, DARF, pagamento, IRPF, integração Receita ou resposta fiscal de IA. A IA permanece `UNSUPPORTED_TAX` com provedor 0.
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3 permanecem inalterados e invioláveis.

---

## 53. Arquitetura e Invariantes de Regras Tributárias de Produção (Fase 4B.5)

1. **PRODUÇÃO EXIGE REGRA `VERIFIED` EFETIVA (ADR-245):**
   - `taxDue` de produção só existe sob regra `VERIFIED` efetiva na competência. Regras `TEST_ONLY` nunca produzem responsabilidade de produção.
2. **PROVENIÊNCIA OFICIAL OBRIGATÓRIA:**
   - Toda regra `VERIFIED` exige `source.legalSourceId`, `source.legalSourceReference` e `source.verifiedAt`; `validateTaxRuleProvenance` rejeita a ausência.
3. **SUPORTE É POR BUCKET:**
   - O suporte de produção é específico por bucket. Apenas `FII_SALE` está ativado (`BR-FII-SALE-20-2015`); demais buckets falham fechados. Nunca marcar a categoria-mãe como totalmente suportada.
4. **INPUTS FACTUAIS E COBERTURA LEGAL SÃO INDEPENDENTES:**
   - Dados canônicos completos não implicam cobertura de regra; regra verificada não dispensa os inputs exigidos.
5. **AUSÊNCIA FALHA FECHADO:**
   - Sem regra → `MISSING_RULE_SET`; sem input exigido (ex.: IRRF canônico) → `PARTIAL`. Nunca estimar IRRF nem assumir zero.
6. **SEM CONSTANTE LEGAL FORA DA REGRA:**
   - Alíquotas, limiares e percentuais de retenção vivem exclusivamente na configuração da regra verificada, com proveniência.
7. **ESTABILIDADE HISTÓRICA (ADR-248):**
   - Regra futura não reescreve cálculo histórico; a resolução é por data efetiva.
8. **AI PERMANECE DESABILITADA PARA IMPOSTO:**
   - Mesmo com responsabilidade de produção ativa, a IA continua `UNSUPPORTED_TAX` com provedor 0. Sem DARF, pagamento, IRPF, Receita ou otimização.
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4 permanecem inalterados e invioláveis.

---

## 54. Arquitetura e Invariantes de Obrigações Tributárias e Vencimento Direto (Fase 4C.2)

1. **AUTORIDADE DE PRAZO POR REGISTRO OFICIAL DIRETO (ADR-262):**
   - O vencimento de tributo federal vem exclusivamente do `FederalTaxDeadlineRegistry` (Agenda Tributária RFB + ADE CORAT), endereçado por `(revenueCode, competence)`.
   - É proibido reconstruir "dia útil" ou calendário genérico de negócios na Fase 4C.2 (ADR-268).
2. **ENTRADAS IMUTÁVEIS E VERSIONADAS (ADR-263):**
   - `FederalTaxDeadlineEntry` é imutável; correção da Receita cria nova versão e marca a anterior `SUPERSEDED`. No máximo uma `VERIFIED` ativa por `(revenueCode, competence)`.
   - Apenas entradas `VERIFIED` produzem obrigação pagável; ausência → `MISSING_OFFICIAL_DEADLINE`; ambiguidade → falha fechada.
3. **RESPONSABILIDADE ≠ OBRIGAÇÃO (ADR-264):**
   - `MonthlyTaxLiability` permanece a autoridade de cálculo; `TaxObligation` é estado operacional derivado e nunca recalcula imposto.
   - Só `COMPLETE` positiva gera obrigação pagável; zero → `NO_PAYMENT_DUE`; `PARTIAL`/`BLOCKED`/bucket não suportado/atividade mista → `BLOCKED` (sem total consolidado enganoso).
4. **DARF READINESS ≠ GERAÇÃO DE DARF (ADR-265):**
   - O Atlas expõe apenas prontidão de dados (`READY|PARTIAL|BLOCKED|NOT_REQUIRED`); é proibido gerar documento oficial, código de barras, QR, PIX ou número de documento.
5. **EVIDÊNCIA DE PAGAMENTO SEPARADA (ADR-266):**
   - `TaxPaymentEvidence` é manual (`MANUAL_CONFIRMED`), integral, decimal exata e idempotente; nunca altera a responsabilidade tributária. Sem sincronização bancária, sem parcial/sobrepagamento, sem crédito/estorno automático.
6. **SUPERSESSÃO E RECONCILIAÇÃO (ADR-267):**
   - Mudança de responsabilidade cria nova revisão e supersede a anterior; obrigação paga alterada → `RECONCILIATION_REQUIRED` com pagamento preservado.
7. **OVERDUE É APENAS STATUS (ADR-269):**
   - `OVERDUE` deriva de vencimento oficial + relógio civil injetado + estado de pagamento. Sem multa, juros, Selic ou valor atualizado.
8. **AI PERMANECE DESABILITADA PARA IMPOSTO:**
   - Perguntas fiscais continuam `UNSUPPORTED_TAX` com provedor 0 (sem "quanto devo pagar", "quando vence", "qual código DARF").
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5 permanecem inalterados e invioláveis.

---

## 55. Arquitetura e Invariantes de Ajuste por Atraso (Fase 4D.2)

1. **PRINCIPAL ORIGINAL IMUTÁVEL (ADR-274):**
   - `TaxObligation.principalAmount` nunca é alterado. `TaxPaymentAdjustment.updatedAmount` é um valor derivado para uma `paymentDate` explícita (date-only). Nenhum `Date.now()` oculto no domínio.
2. **CAMADA DERIVADA SEPARADA (ADR-270):**
   - Multa e juros são camada derivada de atraso; nunca recalculam a responsabilidade tributária (4B/4C permanecem congelados).
3. **AUTORIDADE HÍBRIDA (ADR-270/271/272):**
   - Motor local determinístico para fórmula/teto/juros/acumulação SELIC/arredondamento/composição.
   - Snapshot oficial do Sicalc (`OfficialLateFeeSnapshot`) é autoridade para a multa sensível ao dia útil de início; paridade local obrigatória.
   - Snapshot oficial da SELIC (`TaxInterestRateSnapshot`) é obrigatório; fonte exclusivamente oficial.
   - Ausência de autoridade/taxa → falha fechada (`MISSING_LATE_FEE_AUTHORITY`, `MISSING_OFFICIAL_INTEREST_RATE`, `AUTHORITY_PARITY_MISMATCH`).
4. **ARREDONDAMENTO HALF-EVEN (ADR-273):**
   - `ROUND_HALF_EVEN` a 2 casas, por componente; `updatedAmount = principal + multa + juros`. Sem `Number`/`Math.round`; zero float.
5. **JUROS = SOMA SIMPLES SELIC + 1% (ADR-272):**
   - Meses estritamente entre vencimento e pagamento, +1% no mês do pagamento; sem juros no mesmo mês; sem capitalização; sem vazamento de taxas futuras.
6. **SEM CALENDÁRIO GENÉRICO (ADR-275):**
   - Proibido `isBusinessDay`, feriados municipais/estaduais/nacionais, Carnaval ou Corpus Christi no Atlas. O dia útil de início vem do snapshot oficial.
7. **PAGAMENTO EM ATRASO (ADR-276):**
   - Obrigação vencida só aceita pagamento igual ao valor atualizado verificado; principal isolado é rejeitado (nunca `PAID` silencioso). Sem crédito/estorno automático; evidência de pagamento preservada.
8. **DARF MÍNIMO DIFERIDO (ADR-277):**
   - A regra de mínimo (R$ 10,00) é `DARF_ONLY_BLOCKER` e não é ativada; carry-forward não implementado.
9. **AI PERMANECE DESABILITADA PARA IMPOSTO:**
   - Perguntas fiscais continuam `UNSUPPORTED_TAX` com provedor 0.
10. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2 permanecem inalterados e invioláveis.

---

## 56. Regras de DARF Mínimo e Carry-Forward (Fase 4E)

1. **MINIMUM-DARF NUNCA ALTERA A RESPONSABILIDADE TRIBUTÁRIA (ADR-278/279):**
   - A lógica de mínimo DARF afeta exclusivamente elegibilidade de pagamento e agregação.
   - `MonthlyTaxLiability`, `TaxObligation.principalAmount` e `TaxPaymentAdjustment.updatedAmount` permanecem inalterados.
2. **VALORES ABAIXO DO MÍNIMO NUNCA SÃO DESCARTADOS NEM ZERADOS (ADR-279):**
   - Um valor estritamente inferior a R$ 10,00 gera um fato `TaxCarryForwardEntry` (`OPEN`); nunca é marcado `PAID` e nunca é reescrito para `0`.
3. **CARRY-FORWARD É EXPLÍCITO E IMUTÁVEL (ADR-281):**
   - Entradas são fatos históricos imutáveis; correções geram `SUPERSEDED`; não há `delete`. Re-materialização é idempotente por `(sourceObligationId, ruleId, ruleVersion)`.
4. **AGREGAÇÃO CRUZADA ENTRE CÓDIGOS DE RECEITA É PROIBIDA (ADR-280):**
   - O valor abaixo do mínimo só é adicionado ao **mesmo código de receita** ("de mesmo código"). Código divergente ⇒ `BLOCKED` (`CROSS_REVENUE_CODE_NOT_ALLOWED`); moeda divergente ⇒ `BLOCKED` (`CURRENCY_MISMATCH`); sem FX.
5. **CONSUMO É EXATAMENTE-UMA-VEZ (ADR-281):**
   - Apenas entradas `OPEN` participam; o consumo é atômico (all-or-nothing) e marca `CONSUMED` + `consumedByAggregationId` + `consumedAt`. Concorrência não consome a mesma entrada duas vezes.
6. **VENCIMENTO E ACÉSCIMOS (ADR-282):**
   - O montante acumulado vence no prazo do **último** período de apuração. Valores validamente adiados **não** acumulam multa/juros; acréscimos só conforme regra verificada (4D). Pagamento tardio do montante agregado falha fechado sem snapshot oficial.
7. **AUSÊNCIA DE REGRA/MÍNIMO FALHA FECHADO (ADR-278):**
   - Sem `MinimumDarfRuleSet` `VERIFIED` efetiva ⇒ `MISSING_MINIMUM_RULE` / `BLOCKED`; ambiguidade ⇒ `AMBIGUOUS_MINIMUM_RULE`. Nenhum valor é estimado.
8. **GERAÇÃO DE DARF OFICIAL PERMANECE FORA DE ESCOPO (ADR-283):**
   - `DarfPreparationV2` é aditivo e expõe apenas dados estruturados; proibido barcode, QR, PIX, linha digitável, número de documento, auto-pagamento ou integração bancária.
9. **AI PERMANECE DESABILITADA PARA IMPOSTO:**
   - Perguntas fiscais continuam `UNSUPPORTED_TAX` com provedor 0.
10. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2/4D.2 permanecem inalterados e invioláveis.

---

## 57. Regras de Geração Oficial de DARF e Handoff (Fase 4F)

1. **SÓ A RECEITA/SICALC PRODUZ O DARF OFICIAL (ADR-284):**
   - Somente a saída do serviço oficial Receita Federal/Sicalc pode ser chamada de "DARF oficial". O Atlas nunca rotula um PDF próprio como oficial.
2. **DARFPREPARATIONV2 É A ENTRADA; SEM RECÁLCULO (ADR-287):**
   - A camada de geração/entrega consome `DarfPreparationV2`/elegibilidade (4E) e o ajuste 4D; é proibido recalcular base, perdas, SELIC ou carry-forward.
3. **GERADO NÃO É PAGO (ADR-287):**
   - `GENERATED`/`USER_ACTION_REQUIRED` nunca implica pagamento. Evidência de pagamento (`TaxPaymentEvidence`) permanece separada e obrigatória.
4. **CAPTCHA/AUTENTICAÇÃO NUNCA SÃO BURLADOS (ADR-289):**
   - Proibido OCR, resolução de captcha, replay de sessão, automação de DOM ou scraping de fluxo autenticado. Interação do usuário é `USER_ACTION_REQUIRED`.
5. **ENDPOINTS DE NAVEGADOR NÃO SÃO API SUPORTADA (ADR-285):**
   - Endpoints internos do Sicalc não são tratados como integração de produção. Não há prefill de URL fabricado.
6. **PARIDADE OFICIAL FALHA FECHADO (ADR-290):**
   - Quando houver recálculo oficial programático, divergência de principal/multa/juros/total ⇒ `BLOCKED` (`PARITY_MISMATCH`). Nesta fase, paridade programática é `N/A` (modo interativo).
7. **IDENTIDADE FORA DO TAX-ENGINE (ADR-286):**
   - CPF/CNPJ bruto nunca entra no `@atlas/tax-engine`, logs, telemetria, trace ou IA. Persistência apenas mascarada + referência HMAC.
8. **DOCUMENTOS OFICIAIS SÃO PRIVADOS E IMUTÁVEIS (ADR-288/291):**
   - Registros são append-only; sem sobrescrita. Documento oficial (quando existir) é privado, com SHA-256 e autorização.
9. **SEM FAKE PDF/BARCODE/PIX/QR (ADR-284):**
   - Proibido gerar PDF, código de barras, PIX, QR ou linha digitável sintéticos; sem auto-pagamento e sem integração bancária.
10. **AI PERMANECE DESABILITADA PARA IMPOSTO:**
    - Perguntas fiscais continuam `UNSUPPORTED_TAX` com provedor 0.
11. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2/4D.2/4E permanecem inalterados e invioláveis.

---

## 58. Persistência da Eleição de Compensação Tributária (Fase 4G.2A.1a)

1. **REVISÕES IMUTÁVEIS (ADR-292):**
   - Linhas de `tax_compensation_elections` são imutáveis; nunca há `UPDATE` semântico de `value`.
   - Mudança de eleição **insere** nova revisão com `version` monotônica e `supersedesId` apontando para a anterior.
2. **IDENTIDADE LÓGICA E DE REVISÃO:**
   - Identidade lógica: `(taxSubjectId, competence, electionType)`.
   - Identidade de revisão: `(taxSubjectId, competence, electionType, version)`.
3. **MESMO VALOR É IDEMPOTENTE:**
   - Se o valor corrente já é igual ao solicitado, nenhuma nova revisão é criada.
4. **VALOR DIFERENTE CRIA REVISÃO:**
   - Exatamente uma nova revisão, preservando integralmente o histórico.
5. **REVISÃO CORRENTE POR VERSÃO:**
   - A revisão corrente é resolvida pela maior `version`, nunca por `createdAt`.
6. **FONTE MANUAL_CONFIRMED:**
   - Apenas `MANUAL_CONFIRMED` nesta fase; sem fonte heurística.
7. **SEM CPF:**
   - `TaxSubjectId` é opaco; nenhum CPF/CNPJ bruto é persistido.
8. **FINGERPRINT SEMÂNTICO:**
   - Determinístico sobre `taxSubjectId|competence|electionType|value|version|source`; independente de `id`/`createdAt`.
9. **CONCORRÊNCIA MONOTÔNICA:**
   - A `UNIQUE (tax_subject_id, competence, election_type, version)` é a barreira; retry otimista limitado preserva histórico monotônico e sem versão duplicada.
10. **ESCOPO E ANTI-ESCOPO:**
    - Esta fase é persistência-only: sem API, sem web/mobile, sem integração de leitura mensal, sem IRRF, sem composição 6015 e sem DARF de ações.
11. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2/4D.2/4E/4F permanecem inalterados e invioláveis.

---

## 59. API da Eleição de Compensação Tributária (Fase 4G.2A.1b)

1. **ESCOPO PELO PRINCIPAL AUTENTICADO (ADR-293):**
   - A API de eleição nunca aceita `taxSubjectId` do cliente; o sujeito é resolvido exclusivamente pelo principal autenticado.
2. **ANTI-ENUMERAÇÃO:**
   - Acesso a escopo de terceiros equivale, por construção, a `404`; nunca `403`.
3. **COMPETENCE CANÔNICA:**
   - `YYYY-MM` validada por `parseFiscalCompetence`; inválida → `400 FISCAL.INVALID_COMPETENCE`.
4. **VALORES EXPLÍCITOS:**
   - `DECLARE_FOR_CARRYFORWARD` | `DO_NOT_DECLARE`; sem coerção → `400 FISCAL.INVALID_ELECTION_VALUE`.
5. **IDEMPOTÊNCIA E REVISÃO:**
   - Mesmo valor → `created: false`; valor diferente → nova revisão imutável com `created: true`.
6. **SEM CÁLCULO FISCAL NA API:**
   - A API apenas lê/persiste a eleição; o controller não acessa Prisma diretamente (controller → caso de uso → porta de repositório).
7. **ANTI-ESCOPO 4G.2A.1b:**
   - IRRF, composição 6015, mínimo DARF, DARF de ações e UX web/mobile permanecem fora desta fase.
8. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2/4D.2/4E/4F e a persistência de eleição (4G.2A.1a) permanecem inalterados e invioláveis.

---

## 60. Replay Mensal Fiscal de Ações (Fase 4G.2A.1b.1)

1. **LEDGER É A FONTE DA VERDADE (ADR-294):**
   - A leitura mensal fiscal de ações mapeia `BUY`/`SELL` do livro-razão; snapshots de posição **nunca** são fonte da verdade.
2. **IDENTIDADE DE INSTITUIÇÃO NO DAY TRADE:**
   - O day trade usa `account.institutionId`; contas distintas do **mesmo** intermediário compartilham identidade e podem casar.
   - Intermediários distintos nunca casam; instituição ausente **bloqueia**.
3. **MATCHER CONGELADO:**
   - Reutiliza-se `classifyEquityTradesForTax`; proibida reimplementação de classificação.
4. **CUSTO BASE AUTORITATIVO:**
   - Legs normais usam a disposição realizada canônica rateada por quantidade (decimal exato).
   - O custo do day trade vem do leg de compra casado, nunca do custo médio de estoque pré-existente.
   - Custo desconhecido **bloqueia** (nunca zero).
5. **REPLAY CRONOLÓGICO E BUCKETS ISOLADOS:**
   - Prejuízos normais e day trade são transportados separadamente; nunca se cruzam.
6. **ELEIÇÃO POR COMPETÊNCIA:**
   - Eleições persistidas são injetadas competência a competência; ausente → `ELECTION_REQUIRED`.
   - Revisão em M afeta M e seguintes; **nunca** altera M-1.
7. **FAIL-CLOSED:**
   - Ativo desconhecido, instituição ausente, custo ausente, falha do matcher e competência anterior bloqueada produzem `BLOCKED`, sem isenção afirmada nem prejuízo fabricado.
8. **SEM MATEMÁTICA NO CLIENTE E SEM PRISMA NO MOTOR:**
   - Todos os valores são strings decimais exatas fornecidas pelo servidor; o motor puro não acessa Prisma nem rede.
9. **ANTI-ESCOPO 4G.2A.1b.1:**
   - IRRF, composição 6015, mínimo DARF, DARF de ações e UX web/mobile permanecem fora.
10. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2/4D.2/4E/4F/4G.2A.1a/4G.2A.1b permanecem inalterados e invioláveis.

---

## 61. Fechamento do Replay Mensal Fiscal de Ações (Fase 4G.2A.1b.2)

1. **INSTITUIÇÃO AUSENTE BLOQUEIA (ADR-294):**
   - Execução de renda variável sem identidade canônica de instituição resolve em `BLOCKED` com `MISSING_INSTITUTION_IDENTITY`; nunca se adivinha instituição nem se usa `accountId` como substituto; nenhum resultado parcial `COMPLETE` é emitido.
2. **METADADOS DE ATIVO EM LOTE:**
   - A leitura mensal resolve todos os `assetId` distintos com uma única consulta (`IAssetRepository.findByIds`); proibido 1 consulta por ativo.
3. **CONTA/INSTITUIÇÃO EM LOTE:**
   - O mapeamento conta→instituição é feito por carteira (em memória), sem consulta por execução.
4. **ELEIÇÕES EM LOTE:**
   - As eleições são carregadas em lote (`listCurrentBySubject`), nunca 1 consulta por competência.
5. **ZERO N+1:**
   - Sem consulta por trade, por leg, por ativo ou por mês.
6. **SEM DRIFT SEMÂNTICO:**
   - Matcher, núcleo mensal, eleição, prejuízos e custo base permanecem inalterados.
7. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A/4B/4B.2/4B.3/4B.4/4B.5/4C.2/4D.2/4E/4F/4G.2A.1a/4G.2A.1b.1 permanecem inalterados e invioláveis.

---

## 62. UX Fiscal de Ações Web/Mobile (Fase 4G.2A.1c)

1. **A UI FISCAL NUNCA CALCULA IMPOSTO (ADR-295):**
   - A UI de ações apenas formata e rotula valores do read model do servidor; proibido comparar limiar, calcular prejuízo, base tributável, isenção ou classificar day trade no cliente.
2. **VALORES MENSAIS VÊM DO SERVIDOR:**
   - Todos os campos de `equityNormal`, `equityDayTrade` e `equityCompensationElection` são strings decimais exatas fornecidas pelo servidor.
3. **MUTAÇÃO DE ELEIÇÃO ENVIA APENAS `value`:**
   - O `PUT` de eleição nunca envia `taxSubjectId`; o escopo vem do principal autenticado.
4. **REFETCH APÓS MUTAÇÃO:**
   - Após o `PUT`, o read model mensal é re-buscado no servidor; proibida mutação otimista de saldos.
5. **WEB É A SUPERFÍCIE DE MUTAÇÃO DESTA FASE:**
   - A decisão de eleição é feita exclusivamente na web, com confirmação explícita.
6. **MOBILE É SOMENTE-LEITURA:**
   - O mobile exibe valores e o estado da eleição e orienta concluir a decisão na web; sem botão de mutação.
7. **ESTADOS BLOQUEADOS NUNCA VIRAM ZERO:**
   - `BLOCKED` exibe mensagem por `reasonCode`; vazio e erro têm estados próprios; nunca se fabricam valores zero.
8. **FII PERMANECE INALTERADO:**
   - A seção de FII continua intacta; a seção de ações é aditiva.
9. **ANTI-ESCOPO 4G.2A.1c:**
   - IRRF, composição 6015, DARF, IRPF anual e IA fiscal permanecem fora.
10. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A–4G.2A.1b permanecem inalterados e invioláveis.

---

## 63. Regras de Produção e Pools de IRRF de Renda Variável (Fase 4G.2B)

1. **ALÍQUOTA NORMAL 15% (ADR-296):**
   - O imposto bruto de operações comuns é `base × 15%`, calculado no servidor (`@atlas/tax-engine`); proibido no cliente.
2. **ALÍQUOTA DAY TRADE 20%:**
   - O imposto bruto de day trade é `base × 20%`, sem isenção mensal.
3. **POOLS DE IRRF ISOLADOS POR CATEGORIA:**
   - `EQUITY_NORMAL_IRRF` (0,005%) e `EQUITY_DAY_TRADE_IRRF` (1%) são separados; mesmo código de receita ≠ mesmo pool.
4. **IRRF NUNCA CRUZA CATEGORIA:**
   - IRRF normal nunca reduz day trade nem FII; IRRF day trade nunca reduz normal nem FII.
5. **IRRF APÓS PREJUÍZO E IMPOSTO BRUTO:**
   - O IRRF aplica-se após a compensação de prejuízo da categoria e o cálculo do imposto bruto; nunca é consumido quando o imposto bruto é zero.
6. **SEM USO DUPLO:**
   - Cada evidência de retenção carrega `fingerprint` estável; reutilizar a mesma evidência não duplica crédito.
7. **FRONTEIRA DE ANO TERMINAL (ADR-297):**
   - Em dezembro, o saldo residual normal vira `AVAILABLE_FOR_ANNUAL_ADJUSTMENT` e o day trade `AVAILABLE_FOR_RESTITUTION`; sem carry automático para janeiro.
8. **IMPOSTO LÍQUIDO DE CATEGORIA (ADR-298):**
   - `netTaxBefore6015Aggregation` não é o valor final do DARF; composição 6015, mínimo e vencimento permanecem fora desta fase.
9. **UI SEM MATEMÁTICA FISCAL:**
   - A UI exibe alíquota, imposto bruto, IRRF e imposto líquido fornecidos pelo servidor; sem cálculo no cliente.
10. **ANTI-ESCOPO 4G.2B:**
    - 6015, mínimo DARF, vencimento, atraso, Sicalc, IRPF anual e IA fiscal permanecem fora.
11. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A–4G.2A permanecem inalterados e invioláveis.

---

## 64. Classificação Canônica de Retenção de Renda Variável (Fase 4G.2B.0)

1. **TAXASSETCATEGORY NÃO É CLASSIFICADOR DE POOL DE IRRF (ADR-299):**
   - `category` é a categoria ampla do ativo; `withholdingCategory` é o classificador explícito do pool de IRRF.
2. **EVIDÊNCIA DE EQUITY EXIGE `withholdingCategory`:**
   - `BRAZILIAN_EQUITY` exige `withholdingCategory ∈ { EQUITY_NORMAL, EQUITY_DAY_TRADE }`.
3. **DADOS DE ORIGEM EXPLÍCITOS:**
   - `EQUITY_NORMAL` e `EQUITY_DAY_TRADE` são dados de origem; nunca inferidos.
4. **SEM INFERÊNCIA POR TEXTO:**
   - `sourceReference` nunca é parseado para classificação fiscal.
5. **FALHA FECHADA:**
   - Discriminador ausente/ambíguo bloqueia o replay de IRRF de produção; nunca vira zero.
6. **LEGADO LEGÍVEL E INCOMPLETO:**
   - Registros sem discriminador permanecem legíveis com `withholdingCategory: null`; sem backfill destrutivo.
7. **FINGERPRINT:**
   - O discriminador compõe a identidade semântica quando presente; fingerprints legados são preservados.
8. **ANTI-ESCOPO 4G.2B.0:**
   - Integração do IRRF no replay mensal, extensão do read model, web/mobile, 6015 e DARF permanecem fora.
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A–4G.2B permanecem inalterados e invioláveis.

---

## 65. Integração do IRRF de Renda Variável no Replay Mensal (Fase 4G.2B.1)

1. **WITHHOLDINGCATEGORY → POOL (ADR-296/ADR-299):**
   - `BRAZILIAN_EQUITY + EQUITY_NORMAL` alimenta `EQUITY_NORMAL_IRRF`; `BRAZILIAN_EQUITY + EQUITY_DAY_TRADE` alimenta `EQUITY_DAY_TRADE_IRRF`; nunca inferido.
2. **LEGADO/AMBÍGUO BLOQUEIA:**
   - Evidência de equity sem discriminador confiável bloqueia a competência (`INCOMPLETE_WITHHOLDING_CLASSIFICATION`); nunca vira zero fabricado.
3. **REGRAS DE PRODUÇÃO VIA REGISTRO:**
   - O replay real resolve `BR-EQUITY-NORMAL`/`BR-EQUITY-DAY-TRADE` do registro de produção; sem constantes diretas na aplicação.
4. **EVIDÊNCIA EM LOTE:**
   - A retenção é carregada em lote (1 consulta); sem consulta por trade, leg, ativo ou mês.
5. **SEM MATEMÁTICA NO CLIENTE:**
   - A UI exibe alíquota, imposto bruto, IRRF e imposto líquido fornecidos pelo servidor; sem cálculo.
6. **IMPOSTO LÍQUIDO DE CATEGORIA ≠ DARF FINAL (ADR-298):**
   - `netTaxBefore6015Aggregation` é da categoria; o DARF final será consolidado em etapa posterior.
7. **BLOQUEIO NÃO APRESENTA CONCLUSÃO:**
   - Mês bloqueado zera imposto/IRRF/líquido e não apresenta estado terminal.
8. **ANTI-ESCOPO 4G.2B.1:**
   - 6015, mínimo DARF, vencimento, atraso, Sicalc, IRPF anual e IA fiscal permanecem fora.
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q–3Z), Market Intelligence e as fundações fiscais 4A–4G.2B.0 permanecem inalterados e invioláveis.

---

## 66. Composicao da Obrigacao 6015 e Integracao DARF (Fase 4G.2C)

1. **TAXA POR CATEGORIA E COMPOSTA ANTES DA OBRIGACAO (ADR-300):**
   - O imposto liquido e apurado por categoria (FII, EQUITY_NORMAL, EQUITY_DAY_TRADE) antes da composicao.
   - A composicao `compose6015` apenas soma valores de categoria ja apurados; nunca recalcula aliquotas, base, prejuizo, IRRF, isencao ou election.
2. **6015 AGREGA FII + OPERACOES COMUNS + DAY TRADE:**
   - `FII net tax + EQUITY_NORMAL netTaxBefore6015Aggregation + EQUITY_DAY_TRADE netTaxBefore6015Aggregation = composicao 6015`.
   - Ordem canonica: FII, EQUITY_NORMAL, EQUITY_DAY_TRADE.
3. **PREJUIZO E IRRF NUNCA CRUZAM CATEGORIA (ADR-296/297):**
   - A composicao nao mescla pools de IRRF nem buckets de prejuizo; apenas soma o imposto liquido final.
4. **MINIMO DARF APLICA-SE APOS A AGREGACAO POR CODIGO DE RECEITA (ADR-278):**
   - A regra de minimo (4E) e o carry-forward aplicam-se ao total mensal de 6015, nunca por categoria.
5. **UMA OBRIGACAO POR (taxSubjectId, competence, 6015):**
   - Nunca uma obrigacao por categoria; a identidade reutiliza a semantica 4C.
6. **COMPONENTE BLOQUEADO BLOQUEIA A OBRIGACAO FINAL:**
   - `BLOCKED`/`PARTIAL`, valor negativo, moeda divergente ou atividade fora do conjunto composto falham fechado; nunca se apresenta total parcial como final.
7. **VENCIMENTO/ATRASO/DARF REUTILIZAM 4C/4D/4F:**
   - Sem duplicar logica de data, multa/juros, minimo ou DARF/Sicalc.
8. **A UI NUNCA AGREGA COMPONENTES:**
   - Web/Mobile apenas formatam o total composto e a trilha por categoria fornecidos pelo servidor.
9. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
   - Portfolio Engine, AI (3Q-3Z), Market Intelligence e as fundacoes fiscais 4A-4G.2B permanecem inalterados e inviolaveis.

---

## 67. Fundacao do IRPF Anual (Fase 4H.1)

1. **CAMADA DERIVADA, NAO MOTOR (ADR-301):**
   - O IRPF anual e uma camada de leitura derivada do ledger imutavel + estado fiscal mensal (4A-4G); nunca um segundo motor de transacoes/posicoes nem uma segunda fonte da verdade.
2. **NUNCA RECALCULA A FISCALIZACAO MENSAL:**
   - O anual nao recalcula classificacao normal/day-trade, buckets de prejuizo, IRRF mensal, isencao mensal ou composicao 6015; apenas referencia e agrega fatos mensais ja apurados.
3. **ANO-CALENDARIO != EXERCICIO (ADR-301):**
   - `CalendarYear`, `DeclarationExercise` e `AnnualTaxPeriod` sao conceitos tipados distintos; nunca colapsar.
4. **REGRA ANUAL POR ANO:**
   - Regras anuais resolvem por `effectiveFrom`/`effectiveTo` + ano-calendario/exercicio; nao existe "regra tributaria atual" global. Regras PARTIAL/UNRESOLVED nao entram em producao.
5. **DESCONHECIDO != ZERO:**
   - `zero` / `unknown` / `not_applicable` / `missing` sao distintos; resultado anual incompleto falha fechado (`COMPLETE`/`PARTIAL`/`BLOCKED`/`REQUIRES_CONFIRMATION`).
6. **PROVENIENCIA ANUAL:**
   - Todo fato anual material e rastreavel a transacao do ledger, input fiscal, evidencia de retencao, evento corporativo, input manual confirmado ou versao de regra oficial.
7. **IDENTIDADE E MOEDA:**
   - `AssetId` e a identidade do ativo (ticker nunca); multi-moeda segregada ate conversao explicita.
8. **SEGURANCA:**
   - CPF nunca em log; sujeito passivo derivado do principal; isolamento cross-user.
9. **ANTI-ESCOPO IRPF (Fase 4H):**
   - Sem geracao/envio de declaracao, automacao Receita/GCAP/ReVar/PGD, captcha, certificados, IRPF de ETF/BDR/opcoes/futuros/cripto, ativos no exterior, ou habilitacao de Tax AI (permanece `UNSUPPORTED_TAX`, 0 chamadas).
10. **CONGELAMENTO DE INVARIANTES ANTERIORES:**
    - Portfolio Engine, AI (3Q-3Z), Market Intelligence e as fundacoes fiscais 4A-4G permanecem inalterados e inviolaveis.
