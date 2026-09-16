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
