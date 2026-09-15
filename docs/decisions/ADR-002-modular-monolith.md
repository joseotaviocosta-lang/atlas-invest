# ADR-002: Arquitetura de Monolito Modular (Modular Monolith)

## Status

Accepted

## Context

Sistemas financeiros e de investimentos exigem alta coerência de dados, consistência transacional e integridade contábil. A divisão prematura em múltiplos microsserviços distribuídos introduziria complexidade excessiva de rede, latência desnecessária, falhas parciais e desafios de consistência eventual (Two-Phase Commit, Sagas).
Por outro lado, um monolito não estruturado ("Big Ball of Mud") prejudica a manutenibilidade e a evolução independente dos subsistemas de cálculo (portfolio, tributação, mercado, IA).

## Decision

Adotar o padrão **Modular Monolith**:

- O código do backend e lógica de negócios reside em módulos e pacotes claramente delimitados (`@atlas/domain`, `@atlas/portfolio-engine`, `@atlas/tax-engine`, `@atlas/market-data`, etc.).
- A comunicação entre módulos deve respeitar contratos estritos e unidirecionais.
- A aplicação API (NestJS) orquestra esses módulos internamente em um único processo de execução ou deploy.
- Dependências circulares entre domínios ou engines são estritamente proibidas.

## Consequences

- **Positivas:**
  - Facilidade de desenvolvimento, testes ponta a ponta e deploy simples.
  - Baixa latência e transações locais no banco de dados quando necessário.
  - Limites de domínio bem definidos que permitem, caso haja necessidade de escala no futuro, a extração pontual de módulos específicos para microsserviços sem reescrita estrutural.
- **Negativas:**
  - Exige monitoramento contínuo dos limites dos pacotes para evitar vazamento de dependências.
