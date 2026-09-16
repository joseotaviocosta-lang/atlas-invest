# ADR-024: Arquitetura de Navegação Mobile com Expo Router (File-Based Routing)

## Status

Aprovado

## Contexto

O aplicativo mobile do Project Atlas (Android e iOS) necessita de uma fundação de navegação modular, com separação estrita de fluxos autenticados e não-autenticados, suporte a deep linking e manutenibilidade arquitetural sem acoplamento de roteamento manual imperativo.

## Decisão

1. **Adoção do Expo Router (v4):**
   - Utilização de roteamento baseado no sistema de arquivos sob o diretório `apps/mobile/app/`.
   - Ponto de entrada padrão configurado como `expo-router/entry` em `package.json`.
2. **Segmentação de Rotas:**
   - Grupo Público `(auth)`:
     - `login.tsx`: Autenticação por e-mail e senha.
     - `register.tsx`: Criação de nova conta de investidor.
     - `forgot-password.tsx`: Solicitação de recuperação anti-enumeração.
     - `reset-password.tsx`: Redefinição segura de credenciais.
   - Grupo Autenticado `(app)`:
     - Stack interno contendo `(tabs)`, modais de ação (`create-portfolio.tsx`) e tela de perfil (`profile.tsx`).
     - Bottom Tab Navigator `(tabs)` estruturado em 5 abas de domínio:
       - `today.tsx`: Hoje (resumo diário e fechamento).
       - `portfolio.tsx`: Carteira (listagem e criação de carteiras).
       - `market.tsx`: Mercado (cotações e indicadores financeiros).
       - `tax.tsx`: Fiscal (DARF e conformidade tributária).
       - `ai.tsx`: IA (assistente contextual inteligente).
3. **Route Guards e Restauração de Sessão no Root Layout:**
   - O `app/_layout.tsx` atua como sentinela central de ciclo de vida.
   - Enquanto a sessão estiver em restauração (`unknown` ou `refreshing`), renderiza tela neutra de inicialização.
   - Se não-autenticado e fora de `(auth)`, redireciona imediatamente para `/(auth)/login`.
   - Se autenticado e em `(auth)`, redireciona imediatamente para `/(app)/(tabs)/portfolio`.

## Consequências

- **Positivas:**
  - Separação completa e declarativa entre contextos público e privado.
  - Redução drástica de boilerplate de navegação.
  - Suporte out-of-the-box para deep links e tipagem de rotas.
- **Negativas / Mitigações:**
  - Exige convenção estrita de nomenclatura de arquivos no diretório `app/`.
