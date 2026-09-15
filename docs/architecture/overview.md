# Visão Geral da Arquitetura — Project Atlas

## 1. Visão Geral

O **Project Atlas** é desenhado sob o paradigma de **Modular Monolith + Monorepo**, garantindo alta coesão e baixo acoplamento entre os domínios de negócio de gestão de patrimônio e investimentos.

```text
+-------------------------------------------------------------+
|                      Camada de Apresentação                 |
|   +-----------------------+     +-----------------------+   |
|   |   apps/mobile (Expo)  |     |   apps/web (Next.js)  |   |
|   +-----------------------+     +-----------------------+   |
+------------------------------+------------------------------+
                               |
                               v (HTTP / REST)
+-------------------------------------------------------------+
|                      Camada de Aplicação                    |
|                      apps/api (NestJS)                      |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                   Domínio & Motores de Cálculo              |
|   +------------------------+   +------------------------+   |
|   | packages/portfolio-eng |   |  packages/tax-engine   |   |
|   +------------------------+   +------------------------+   |
|   +------------------------+   +------------------------+   |
|   | packages/performance-e |   |  packages/ai-engine    |   |
|   +------------------------+   +------------------------+   |
|   +------------------------+   +------------------------+   |
|   |  packages/market-data  |   |   packages/news-data   |   |
|   +------------------------+   +------------------------+   |
|   +-----------------------------------------------------+   |
|   |               packages/domain (Core)                |   |
|   +-----------------------------------------------------+   |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                   Infraestrutura de Dados                   |
|                  packages/database (PostgreSQL)             |
+-------------------------------------------------------------+
```

## 2. Regras de Dependência

A hierarquia de dependências é estritamente unidirecional:

1. Interfaces de usuário (`apps/mobile`, `apps/web`) comunicam-se com a API (`apps/api`) via endpoints HTTP/REST.
2. A API consome os motores e pacotes de domínio (`packages/*`).
3. `packages/domain` é totalmente agnóstico de frameworks e bibliotecas visuais ou ORMs.
4. Motores de cálculo financeiro nunca possuem dependências diretas de bibliotecas de interface gráfica.
5. Os dados são persistidos através do adaptador de infraestrutura em `packages/database`.
