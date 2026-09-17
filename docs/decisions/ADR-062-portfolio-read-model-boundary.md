# ADR-062: Portfolio Read Model Boundary & Domain/Engine Encapsulation

## Status

Accepted

## Context

Com o Portfolio Engine operando em memória via replay determinístico (Fases 1A a 1F), tornou-se necessário expor os dados consolidados e pontuais de carteiras para a camada de aplicação e a API HTTP externa.

O motor interno utiliza estruturas e tipos ricos de domínio, como `PortfolioState`, `AccountState`, `AssetState`, `Money`, `Quantity`, `Percentage`, `DecimalValue` e coleções `ReadonlyMap`. Expor essas classes ou estruturas internas diretamente através dos controladores ou use cases violaria os princípios de separação de camadas, encapsulamento e arquitetura limpa (Hexagonal/Ports & Adapters), além de acoplar clientes externos à evolução interna do motor de cálculo.

## Decision

1. **Camada de Read Models Puros e Imutáveis**:
   - Foram definidos Read Models imutáveis dedicados na camada de aplicação (`apps/api/src/application/portfolios/read-models/types.ts`):
     - `PortfolioStateReadModel`
     - `PortfolioPositionsReadModel`
     - `PortfolioHistoryReadModel`
     - `PortfolioPositionReadModel`
     - `RealizedSummaryReadModel`
     - `IncomeSummaryReadModel`
     - `CashFlowSummaryReadModel`
     - `AccountStateReadModel`
     - `ReplayMetadataReadModel`
     - `PortfolioCompletenessReadModel`
   - Nenhuma propriedade desses modelos expõe Value Objects, Maps ou classes do motor.

2. **Mapeador Unidirecional Puro (`PortfolioReadModelMapper`)**:
   - Uma classe utilitária pura sem efeitos colaterais (`PortfolioReadModelMapper`) transforma o `ReplayResult` gerado pelo motor nos Read Models de aplicação.
   - Aplica ordenação determinística de posições (`assetId ASC`), contas (`accountId ASC`) e histórico (`tradeDate DESC, id DESC`).

3. **Isolamento de Dependência Validado por Teste de Arquitetura**:
   - Os controladores da camada de apresentação (`apps/api/src/modules/portfolios`) comunicam-se exclusivamente com os Use Cases da camada de aplicação e recebem apenas DTOs e Read Models.
   - Um teste de arquitetura automatizado em `tests/architecture/dependency-boundaries.test.ts` fiscaliza e impede a importação direta de tipos internos de estado ou Value Objects (`PortfolioState`, `AccountState`, `AssetState`, `DecimalValue`, `Money`, `Quantity`, `Percentage`) nos controladores da API.

## Consequences

- **Positivas:**
  - Desacoplamento estrito entre o motor de cálculo e a interface REST pública.
  - Segurança de evolução interna do engine sem riscos de quebra de contrato na API pública.
  - DTOs Swagger limpos e autodescritivos com tipos primitivos JSON seguros.
- **Negativas:**
  - Custo computacional marginal de mapeamento dos objetos de domínio para Read Models a cada consulta (mitigado pela simplicidade e pureza dos mappers).
