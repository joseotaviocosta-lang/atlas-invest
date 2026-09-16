# ADR-028: Estratégia de Autenticação Web e Isolamento de Sessão (BFF + HttpOnly Cookies)

## Status

Aprovado

## Contexto

A aplicação web do Project Atlas (`apps/web`) é executada no ambiente do navegador, sujeito a riscos de exfiltração de credenciais via ataques de Cross-Site Scripting (XSS). O armazenamento de tokens de longa duração (`refreshToken`) em `localStorage`, `sessionStorage`, `IndexedDB` ou variáveis persistidas no cliente expõe o investidor a roubo irrevogável de identidade financeira.

Ao mesmo tempo, a API do Atlas (`apps/api`) atende simultaneamente clientes mobile (`apps/mobile`, que utilizam tokens Bearer com armazenamento em hardware via `expo-secure-store`) e clientes web.

## Decisão

1. **Padrão Backend-for-Frontend (BFF) com Next.js Route Handlers:**
   - A aplicação web atua como BFF através de Route Handlers dedicados sob `apps/web/src/app/api/auth/` (`login`, `register`, `refresh`, `logout`, `me`, `forgot-password`, `reset-password`).
   - O navegador nunca se comunica diretamente com os endpoints upstream de autenticação portando refresh tokens.
2. **Separação Rígida de Tokens e Zero Armazenamento no Browser:**
   - O `refreshToken` rotativo é gravado exclusivamente pelo servidor Next.js em um cookie seguro com os atributos:
     - `HttpOnly: true` (inacessível para qualquer código JavaScript no cliente);
     - `SameSite: Lax` (bloqueia envio em requisições cross-site de terceiros);
     - `Path: /` (disponível para chamadas ao BFF);
     - `Secure: true` em ambiente de produção;
     - `Max-Age: 30 dias` (2.592.000 segundos).
   - O `accessToken` de curta duração reside exclusivamente na memória volátil do cliente (Zustand store e variável em escopo de módulo), nunca persistido em disco ou storage do navegador.
   - Um cookie não-sensível (`atlas_logged_in=true`) é mantido como indicador de sessão para o Edge Middleware.
3. **Compatibilidade Dual-Client Sem Quebra de Contratos:**
   - A API backend NestJS mantém o contrato de autenticação (`/api/v1/auth/*`), servindo tanto mobile (via Bearer tokens diretos) quanto web (via proxy BFF).

## Consequências

- **Positivas:**
  - Imunidade total do refresh token contra roubo via XSS no navegador.
  - Alinhamento rigoroso com as diretrizes OWASP ASVS e guias de segurança financeira.
  - Suporte transparente a rotação contínua de refresh tokens a cada ciclo.
- **Negativas / Mitigações:**
  - Exige camada BFF em Next.js para intermediação de chamadas sensíveis de autenticação.
