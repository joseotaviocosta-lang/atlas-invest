# Status da Funda��o � Project Atlas (Fases 0A a 0J)

## 1. Resumo Executivo do Status das Fases

| Fase        | T�tulo                                   | Status      | Branch de Origem                            |
| ----------- | ---------------------------------------- | ----------- | ------------------------------------------- |
| **Fase 0A** | Repository Foundation                    | ? Aprovada  | `feature/phase-0a-repository-foundation`    |
| **Fase 0B** | Domain Foundation                        | ? Aprovada  | `feature/phase-0b-domain-foundation`        |
| **Fase 0C** | Database Foundation                      | ? Aprovada  | `feature/phase-0c-database-foundation`      |
| **Fase 0D** | API Foundation                           | ? Aprovada  | `feature/phase-0d-api-foundation`           |
| **Fase 0E** | Authentication & Security Foundation     | ? Aprovada  | `feature/phase-0e-auth-security-foundation` |
| **Fase 0F** | Mobile Foundation                        | ? Aprovada  | `feature/phase-0f-mobile-foundation`        |
| **Fase 0G** | Web Foundation                           | ? Aprovada  | `feature/phase-0g-web-foundation`           |
| **Fase 0H** | Product Shell                            | ? Aprovada  | `feature/phase-0h-product-shell`            |
| **Fase 0J** | Foundation Hardening & Release Readiness | ? Conclu�da | `feature/phase-0j-foundation-hardening`     |

---

## 2. Capacidades Conclu�das e Auditadas

### A. Dom�nio & Precis�o Financeira

- Value Objects invariantes (`Money`, `Quantity`, `Asset`, `LocalDate`, `Currency`).
- Representa��o decimal exata via strings num�ricas (`NUMERIC(28,18)` para valores monet�rios e `NUMERIC(38,18)` para quantidades).
- Elimina��o completa de n�meros bin�rios IEEE 754 float em c�lculos financeiros.
- Separa��o estrita entre c�lculo financeiro e formata��o visual (`@atlas/ui/formatters` com visual half-up rounding em BigInt decimal string).
- Transaction Ledger como fonte �nica da verdade imut�vel.

### B. Banco de Dados & Infraestrutura

- PostgreSQL 16/18 com Prisma ORM 6.
- Modelos can�nicos: `users`, `sessions`, `password_reset_tokens`, `institutions`, `portfolios`, `accounts`, `assets`, `transactions`.
- Migra��es determin�sticas (`pnpm db:migrate`) e seed can�nico (`pnpm db:seed`) validados do zero.
- Autoridade de concorr�ncia CAS em n�vel de banco de dados (`SELECT ... FOR UPDATE`) no `SessionRepository`, garantindo rota��o at�mica independente de mutexes locais em mem�ria.
- Detec��o de reuso em qualquer n� do hist�rico da fam�lia de tokens (reuso revoga a sess�o inteira imediatamente).

### C. Seguran�a & Autentica��o

- Criptografia com Argon2id para senhas e SHA-256 para tokens de reset.
- Estrat�gia de tokens duplos: Access Token JWT de curta dura��o (15 min) e Refresh Token rotativo (30 dias).
- Armazenamento Mobile: Refresh Token no hardware (`expo-secure-store`); Access Token estritamente vol�til em mem�ria.
- Armazenamento Web: Refresh Token em cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (em produ��o); Access Token exclusivamente vol�til em mem�ria (Zustand).
- Prote��o CSRF no BFF com inje��o de header `x-atlas-client` e valida��o estrita de `Origin` e `Referer` para muta��es.
- Valida��o de `atlas_logged_in`: indicador meramente visual para o cliente, sem permiss�o para transpor o Edge Middleware ou autorizar requisi��es privadas.
- Throttler / Rate Limiting configurado para endpoints sens�veis de autentica��o.
- Sanitiza��o de credenciais, senhas e tokens nos logs Pino via `@atlas/logger`.

### D. Aplica��es Mobile & Web

- **Mobile (`apps/mobile`):** Expo Router 4 + React Native 0.76; navega��o em abas can�nicas (`Hoje`, `Carteira`, `Mercado`, `Fiscal`, `IA`); autentica��o completa; restaura��o de sess�o; banner offline; export Android limpo (`expo export --platform android`).
- **Web (`apps/web`):** Next.js 15 (App Router); rotas privadas e p�blicas; BFF Route Handlers; layout responsivo consistente com breakpoint unificado (`< 768px` mobile, `>= 768px` tablet/desktop); design tokens sem�nticos de `@atlas/ui` sem cores hexadecimais raw; suite E2E Playwright automatizada com 9 testes em Desktop, Tablet e Mobile.

---

## 3. Escopo Diferido (Anti-Escopo � A Implementar nas Pr�ximas Fases)

Os seguintes itens **N�O** foram implementados na Funda��o (Fases 0A�0J) e est�o expressamente postergados para as fases de produto subsequentes:

1. **Portfolio Engine (Fase 1):**
   - Agrega��o de posi��es a partir do Ledger.
   - C�lculo determin�stico de pre�o m�dio ponderado.
   - C�lculo de patrim�nio consolidado e lucro/preju�zo n�o realizado.
2. **Performance Engine (Fase 2):**
   - Time-Weighted Return (TWR) e Money-Weighted Return (MWR / XIRR).
   - Compara��o contra benchmarks (CDI, Ibovespa, IPCA, S&P 500).
3. **Tax Engine / Motor Fiscal (Fase 3):**
   - Apura��o de ganhos de capital tribut�veis em a��es, FIIs, ETFs e BDRs.
   - Controle de preju�zos acumulados e compensa��o fiscal.
   - Gera��o de guias DARF.
   - _(A tela do Product Shell exibe placeholders neutros "�" com aviso de ativa��o futura)._
4. **Market Data Engine (Fase 4):**
   - Cota��es em tempo real e hist�rico di�rio via provedores de dados.
   - Atualiza��o autom�tica de marca��o a mercado.
5. **News Data Engine & AI Contextual Engine (Fase 5):**
   - Agrega��o de not�cias financeiras e resumos por LLM.
   - Insights de carteira com IA generativa.
6. **Integra��es Externas:**
   - Open Finance / Pluggy.
   - Importa��o de notas de corretagem (PDF / B3 CEI).
7. **Seguran�a Avan�ada:**
   - Autentica��o de dois fatores (2FA / TOTP).
   - Biometria nativa (FaceID / TouchID) e Passkeys / WebAuthn.
   - Social Logins (Google, Apple).

---

## 4. Veredito de Prontid�o

A funda��o do **Project Atlas** atende integralmente a todos os crit�rios de isolamento arquitetural, consist�ncia visual, seguran�a multicamadas, determinismo de migra��es e testes automatizados. O projeto est� **100% pronto e desbloqueado** para o in�cio do desenvolvimento do **Portfolio Engine**.
