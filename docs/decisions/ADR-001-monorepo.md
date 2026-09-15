# ADR-001: Adoção de Monorepo com pnpm e Turborepo

## Status

Accepted

## Context

O Project Atlas abriga múltiplos pontos de contato e camadas arquiteturais: aplicativo mobile (Expo / React Native), aplicativo web (Next.js), API backend (NestJS) e diversos pacotes reutilizáveis (motores de cálculo, domínio agnóstico, validação, tokens visuais e utilitários).
Gerenciar múltiplos repositórios isolados (polyrepo) acarretaria alto overhead em sincronização de contratos TypeScript, duplicação de regras de negócio, dificuldade no versionamento de dependências internas e complexidade no CI/CD.

## Decision

Adotar a estratégia de **Monorepo** único utilizando:

- **pnpm** com workspaces (`pnpm-workspace.yaml`) para isolamento de dependências com eficiência de disco através de hard links e symlinks.
- **Turborepo** para orquestração de tarefas em pipeline, compilação incremental e cache local e remoto de builds e testes.

## Consequences

- **Positivas:**
  - Código compartilhado (domínio, tipos, tokens) pode ser consumido instantaneamente por apps e packages via `workspace:*`.
  - Pipelines de lint, typecheck, teste e build centralizados e acelerados por cache.
  - Refatorações em contratos de API ou domínio podem ser feitas e validadas atomicamente em um único commit ou Pull Request.
- **Negativas:**
  - Curva de aprendizado inicial na configuração de ferramentas de tooling de monorepo.
  - Necessidade de disciplina rigorosa nos limites de dependências entre pacotes para evitar acoplamento indevido.
