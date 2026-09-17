# ADR-059: Unmatched Transfer Policy and Cost Basis Degradation

## Status

Accepted

## Context

No mundo real, investidores frequentemente recebem custódia de fontes externas ao portfólio (ex.: transferência vinda de herança, doação ou de uma conta em corretora não cadastrada no sistema), ou transferem ativos para fora do escopo do portfólio.

Nesses cenários, apenas uma das pernas da operação existe no livro-razão do portfólio (`TRANSFER_IN` sem contraparte ou `TRANSFER_OUT` sem contraparte). É fundamental estabelecer o tratamento dessas transações sem corromper as regras de negócio de integridade de custo.

## Decision

1. **`TRANSFER_IN` Desemparelhado (Entrada Externa de Custódia)**:
   - Identificado quando não há `transferGroupId` ou quando o `transferGroupId` não possui `TRANSFER_OUT` correspondente no portfólio.
   - **Status do Evento**: Marcado como `UNMATCHED_IN`.
   - **Impacto na Posição**: A quantidade em custódia na conta receptora é incrementada.
   - **Degradação de Custo**: Como o custo de aquisição de origem é desconhecido, a posição do ativo na conta e no portfólio consolidados passa imediatamente para `costBasisStatus: 'INCOMPLETE'`.
   - Custo total e preço médio tornam-se `undefined`.
   - Vendas subsequentes desse ativo geram `RealizedDisposal` com status `INCOMPLETE`, sem apuração fictícia de ganho/perda.

2. **`TRANSFER_OUT` Desemparelhado (Saída Externa de Custódia)**:
   - Identificado quando não há `transferGroupId` ou não há `TRANSFER_IN` correspondente no portfólio.
   - **Status do Evento**: Marcado como `UNMATCHED_OUT`.
   - **Impacto na Posição**: A quantidade e o custo carregado correspondente são baixados da conta de origem e saem do escopo do portfólio.
   - O engine **NUNCA** inventa uma conta de destino fictícia.
   - A operação não gera ganho/perda realizada no portfólio (é uma saída de custódia, não uma liquidação financeira).

3. **Propagação de Incompletude em Pares Casados**:
   - Se um par de transferências casado (`TRANSFER_OUT` e `TRANSFER_IN`) ocorrer a partir de uma conta de origem cuja posição já estava com `costBasisStatus: 'INCOMPLETE'`, a transferência propaga rigorosamente o status `INCOMPLETE` para a conta de destino.
   - Em hipótese alguma um par de transferências "cura" ou "inventa" uma base de custo que já era desconhecida.

## Consequences

- **Positivas:**
  - Evita invenção de dados financeiros inexistentes (zero suposições).
  - Alerta fielmente o usuário ou sistemas downstream de que a base de custo está incompleta e requer intervenção manual ou escrituração externa.
- **Negativas:**
  - Relatórios de rentabilidade baseados em custo realizado permanecem suspensos para posições marcadas como `INCOMPLETE`.
