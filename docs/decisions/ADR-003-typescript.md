# ADR-003: Padronização de TypeScript Estrito (Strict Mode)

## Status

Accepted

## Context

A gestão de investimentos lida diretamente com ativos financeiros, cálculos de impostos e patrimônio do investidor. Erros em tempo de execução causados por coerções implícitas, referências nulas ou acessos indefinidos (`undefined is not a function`) representam risco crítico para a integridade do produto e a confiança dos usuários.

## Decision

Padronizar **TypeScript** em todo o monorepo (mobile, web, api e packages compartilhados) com as seguintes diretrizes:

- Configurações compartilhadas através do pacote `@atlas/config`.
- Ativação obrigatória de `"strict": true` em todos os projetos.
- Proibição de uso descuidado de `any` (com regra de linter `@typescript-eslint/no-explicit-any` como erro).
- Configurações específicas e estendidas para cada ambiente (`tsconfig.node.json`, `tsconfig.react.json`, `tsconfig.next.json`, `tsconfig.react-native.json`).

## Consequences

- **Positivas:**
  - Detecção precoce de bugs de tipagem antes de execução em produção.
  - Autocompletação e refatoração assistida altamente confiáveis em IDEs.
  - Alinhamento de contratos de ponta a ponta (da API ao frontend web e mobile).
- **Negativas:**
  - Exige maior rigor e modelagem precisa de tipos em código novo, resultando em pequeno aumento de tempo de escrita inicial de código em prol de segurança a longo prazo.
