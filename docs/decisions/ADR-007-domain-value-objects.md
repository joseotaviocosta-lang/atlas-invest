# ADR-007: Distinção entre Entidades de Domínio e Value Objects

## Status

Accepted

## Context

Na modelagem do domínio financeiro do Project Atlas, é fundamental estabelecer convenções inequívocas sobre identidade, ciclo de vida, igualdade e imutabilidade dos conceitos do sistema. Tratar conceitos estruturalmente diferentes da mesma maneira gera mutações acidentais, bugs sutis de igualdade por referência e confusão em operações de agregação.

## Decision

Adotar explicitamente os padrões do Domain-Driven Design (DDD) para classificar os tipos em duas categorias fundamentais:

### 1. Value Objects (Objetos de Valor)

- **Definição:** Conceitos definidos exclusivamente pelo seu valor matemático ou semântico, sem ciclo de vida independente ou identificador próprio.
- **Exemplos no Atlas:** `Money`, `Quantity`, `Percentage`, `LocalDate`, `Currency`.
- **Propriedades:**
  - **Imutabilidade Absoluta:** Uma vez criados, seus valores não sofrem mutação. Operações geram novas instâncias.
  - **Igualdade por Valor:** Dois `Money.from("10.00", "BRL")` são funcionalmente idênticos (`equals()` retorna `true`).

### 2. Entities (Entidades)

- **Definição:** Conceitos que possuem identidade contínua ao longo do tempo, rastreada por um identificador único nominalmente tipado (`DomainId`).
- **Exemplos no Atlas:** `Asset`, `Institution`, `Account`, `Portfolio`, `Transaction`.
- **Propriedades:**
  - **Igualdade por Identidade:** Duas instâncias de `Asset` com o mesmo `ticker` mas IDs diferentes representam entidades distintas (ex.: ativo cotado na B3 vs. NYSE).
  - **Ciclo de Vida:** Possuem metadados de criação e estado (`status`).

## Consequences

- **Positivas:**
  - Semântica clara para comparação (`equals`) e serialização.
  - Imutabilidade em primitivas monetárias e temporais elimina bugs de concorrência ou mutações indesejadas de estado.
  - Segurança reforçada na identificação de ativos financeiros.
- **Negativas:**
  - Requer maior disciplina dos desenvolvedores para instanciar novos Value Objects em transformações aritméticas.
