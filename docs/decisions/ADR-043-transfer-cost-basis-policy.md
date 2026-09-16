# ADR-043: Transfer Cost Basis Policy and Incomplete Cost Handling

## Status

Accepted

## Context

Transferências de custódia (`TRANSFER_IN` e `TRANSFER_OUT`) representam movimentações de ativos entre contas ou corretoras. Enquanto um `TRANSFER_OUT` pode determinar a dedução de custo proporcional com base no preço médio da conta de origem, um `TRANSFER_IN` (entrada de custódia) muitas vezes chega à plataforma sem os metadados de aquisição originais (ex: nota de corretagem de origem ou STVM).

Em muitos sistemas financeiros amadores, adota-se ou a invenção de um custo médio zero (`averageCost = 0`), ou a adivinhação heurística pareando entradas e saídas por data, ativo e quantidade coincidentes. Ambas as abordagens são frágeis, propensas a falsos positivos e violam a integridade contábil.

## Decision

1. **Proibição Estrita de Pareamento Heurístico**:
   O `PortfolioReplayEngine` **NÃO** pareia transações `TRANSFER_OUT` e `TRANSFER_IN` por inferência ou heurística (mesma data, mesmo ativo ou mesma quantidade). Cada evento do ledger é processado isolada e deterministicamente.

2. **Dedução no `TRANSFER_OUT`**:
   O `TRANSFER_OUT` deduz a quantidade e remove o custo proporcional correspondente da conta de origem, utilizando o mesmo mecanismo proporcional de uma alienação (ADR-041).

3. **Inbound Transfer sem Custo (`TRANSFER_IN`)**:
   Quando ocorre um `TRANSFER_IN` sem custo de aquisição explícito vinculado:
   - A quantidade física é incorporada à custódia da conta de destino.
   - O status do custo base da posição é formalmente classificado como `costBasisStatus: 'INCOMPLETE'`.
   - `totalCost` e `averageCost` tornam-se `undefined`.

4. **Regra Inegociável: Custo Desconhecido ≠ Custo Zero**:
   É expressamente proibido representar custo desconhecido como `0` ou `0.00`. Uma posição com custo desconhecido tem custo não-determinado (`INCOMPLETE`), enquanto uma aquisição gratuita real (como uma bonificação de ações `BONUS`) terá semântica própria na Fase 1C.

5. **Impacto na Agregação**:
   Uma posição com `costBasisStatus === 'INCOMPLETE'` em qualquer conta propaga esse status para a visão consolidada do portfólio para aquele ativo, garantindo transparência contábil e impedindo relatórios tributários incorretos.

## Consequences

- **Positivas:**
  - Honestidade contábil: o sistema nunca informa ao investidor ou à Receita Federal um preço médio falso de R$ 0,00 gerado por transferência.
  - Eliminação de bugs catastróficos causados por heurísticas de pareamento de transferências simultâneas.
  - Modelo formal preparado para receber no futuro notas de transferência ou vinculações explícitas de custódia (STVM).
- **Negativas:**
  - Posições que receberam `TRANSFER_IN` exigirão ferramentas de preenchimento ou vinculação de nota para que o preço médio passe a ser `KNOWN`.
