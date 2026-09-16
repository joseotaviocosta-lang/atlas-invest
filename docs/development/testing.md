# Guia de Testes e Qualidade � Project Atlas

## 1. Vis�o Geral da Pir�mide de Testes

O **Project Atlas** possui um pipeline rigoroso de verifica��o automatizada dividido em camadas:

```text
       [ E2E Browser Tests ]        -> Playwright (Desktop, Tablet, Mobile)
     [ Cross-Platform Security ]     -> Vitest Security & Architecture Gates
   [ Unit & Integration Tests ]     -> Vitest (Domain, Database, API, Auth, Mobile, Web, UI)
 [ Lint, Formatting & Typecheck ]    -> ESLint 9, Prettier, TypeScript Strict
```

---

## 2. Comandos de Execu��o dos Testes

### Suites Unit�rias e de Integra��o (Vitest)

```bash
# Executa todos os testes do monorepo
pnpm test

# Dom�nio puro (regras financeiras, invariantes e Value Objects)
pnpm test:domain

# Banco de dados e persist�ncia (PostgreSQL + Prisma)
pnpm test:database

# API REST NestJS (controllers, handlers, DTOs)
pnpm test:api

# Autentica��o e Seguran�a (sess�es, CAS lock, tokens, reuso, rate limit)
pnpm test:auth

# Aplica��o Mobile (stores, navega��o, secure storage)
pnpm test:mobile

# Aplica��o Web (stores, cookies, CSRF, client API)
pnpm test:web

# Design System e Contratos Visuais (formatters BigInt, tokens)
pnpm test:ui

# Suite de Seguran�a Consolidada (auth, csrf, hardware storage, sanitiza��o)
pnpm test:security

# Suite de Fronteiras Arquiteturais (isolamento de camadas e regras de depend�ncia)
pnpm test:architecture

# Regras fundamentais e sa�de da infraestrutura
pnpm test:foundation
```

### Testes End-to-End Web (Playwright)

Executa testes completos em navegadores headless simulando tr�s viewports reais:

- **Desktop Chrome** (1440x900)
- **Tablet Chrome** (768x1024)
- **Mobile Chrome** (Pixel 7 � 390x844)

```bash
# Executa a suite E2E
pnpm test:web:e2e

# Executa em modo interativo com interface gr�fica
pnpm exec playwright test --ui
```

### Valida��o Completa da Funda��o (Release Gate)

Executa lint, verifica��o de formata��o, checagem de tipos estritos, todas as suites de teste unit�rio, seguran�a, arquitetura, E2E e compila��o de produ��o:

```bash
pnpm validate:foundation
```

---

## 3. Valida��o Mobile (Expo / Android)

Para auditar e validar a aplica��o mobile sem necessidade de emuladores pesados:

```bash
# Diagn�stico de integridade do ambiente Expo
npx expo-doctor

# Verifica��o de compila��o e empacotamento do bundle Android (Metro)
pnpm --filter @atlas/mobile exec expo export --platform android
```

---

## 4. Guia de Testes Manuais para Desenvolvedores

### A. Teste Local no Navegador (Web DevTools)

1. Inicie a API e a Web:
   ```bash
   pnpm dev:api
   pnpm dev:web
   ```
2. Abra o Chrome DevTools (`F12`) na aba **Application > Cookies**:
   - Ao fazer login, verifique que `atlas_refresh` possui a flag `HttpOnly` e `SameSite=Lax`.
   - O cookie `atlas_logged_in` deve existir com valor `true` (sem flag HttpOnly).
   - Tente alterar manualmente o valor de `atlas_refresh` ou delet�-lo: a pr�xima navega��o para rota privada deve redirecionar instantaneamente para `/login`.
3. Na aba **Network**:
   - Simule o modo "Offline" no seletor de throttling. O banner de aviso offline deve surgir no topo da p�gina sem quebrar a interface.

### B. Teste em Dispositivo M�vel F�sico

1. Obtenha o IP local da sua m�quina na rede Wi-Fi (`ipconfig` no Windows).
2. Configure a vari�vel no arquivo `apps/mobile/.env`:
   ```bash
   EXPO_PUBLIC_API_URL=http://<SEU-IP-LOCAL>:3001
   ```
3. Inicie o servidor Metro com LAN ativo:
   ```bash
   pnpm dev:mobile -- --lan
   ```
4. Abra o aplicativo **Expo Go** no celular f�sico (Android ou iOS) e escaneie o QR Code do terminal.
5. Teste os fluxos de cria��o de conta, login, altern�ncia entre abas na BottomBar e modo avi�o (para validar o banner offline).

### C. Teste de Endpoints via Swagger

Acesse `http://localhost:3001/api/docs` com a API em execu��o para inspecionar e testar interativamente todos os endpoints e contratos OpenAPI gerados pela aplica��o.
