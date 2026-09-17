# ADR-065: Financial Decimal HTTP Serialization and Null Cost Basis Semantics

## Status

Accepted

## Context

O Project Atlas estabelece o princípio fundamental de **Zero Float Math** para valores financeiros e quantidades de ativos. Tipos binários de ponto flutuante (como `double` ou `number` no padrão IEEE-754) sofrem de imprecisão cumulativa e perda de dígitos significativos em conversões e cálculos com moedas ou frações de ações.

Além disso, nos casos em que um ativo tem histórico incompleto (por exemplo, após uma transferência de custódia de entrada sem indicação de custo de aquisição), o custo médio não pode ser presumido como zero ($0,00$ ou $"0"$), pois uma suposição incorreta geraria apurações fiscais e contábeis graves (como tributar 100% do valor da alienação futura como ganho de capital).

## Decision

1. **Serialização de Valores Decimais como Strings**:
   - Todo campo financeiro retornado nos payloads HTTP JSON (`amount`, `unitPrice`, `quantity`, `costBasis`, `totalCost`, `averageCost`, `realizedGainLoss`, etc.) é serializado exclusivamente como `string` decimal exata (ou `null`).
   - É expressamente vedado o uso de números de ponto flutuante em campos financeiros em qualquer resposta da API.
   - Números primitivos são permitidos exclusivamente em contadores inteiros e limites de paginação de metadados (`limit`, `totalCount`, `processedTransactionCount`).

2. **Semântica Estrita de Null vs Zero**:
   - Quando o status do custo de um ativo for `INCOMPLETE`, as propriedades `totalCost` e `averageCost` nos read models de posições são serializadas estritamente como `null`.
   - É proibido serializar `0`, `"0"`, `"0.00"` ou valores negativos como substituto de custo indeterminado.
   - O campo `costBasisStatus` é explicitamente exposto como `'KNOWN' | 'INCOMPLETE'`, permitindo aos clientes exibir avisos apropriados ao investidor.

3. **Validação por Teste Automatizado**:
   - A suíte de testes de integração (`tests/api/portfolio-read-serialization.test.ts`) varre as respostas dos endpoints `/state`, `/positions` e `/history`, garantindo que nenhuma chave com conteúdo financeiro contenha números float ou objetos não serializados.

## Consequences

- **Positivas:**
  - Integridade contábil em trânsito de 100%, sem perda de precisão entre o backend Nest e os front-ends React / React Native.
  - Fidelidade semântica para custos ausentes, prevenindo cálculos tributários distorcidos.
- **Negativas:**
  - Clientes que consom a API precisam converter as strings para suas respectivas bibliotecas de aritmética decimal (ex.: `Decimal.js` ou similar) antes de realizar agregações no cliente.
