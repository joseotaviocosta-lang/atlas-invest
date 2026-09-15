# ADR-009: Imutabilidade Permanente das Transações no Ledger

## Status

Accepted

## Context

Sistemas financeiros que permitem mutação in-place em transações já consolidadas (`transaction.quantity = newQuantity`) sofrem com graves riscos de inconsistência histórica: posições passadas deixam de bater com extratos de custódia, cálculos de preço médio histórico ficam corrompidos e relatórios de IRPF enviados à Receita Federal tornam-se inauditáveis.

## Decision

Definir que toda **`Transaction`** no Project Atlas representa um **evento histórico imutável** do Transaction Ledger:

1. **Sem Setters Mutáveis:**
   - Instâncias de transações são criadas através de factories estritas que validam todas as invariantes no momento da construção.
   - Os objetos são congelados (`Object.freeze`) para impedir qualquer alteração de propriedades em tempo de execução.
2. **Correções e Estornos:**
   - Qualquer ajuste de carteira, cancelamento ou compensação deve ser realizado através da emissão de uma nova transação compensatória no ledger, preservando o evento original.
3. **Metadados de Idempotência:**
   - As transações suportam campos opcionais `provider` e `externalId` para permitir deduplicação em importações automatizadas (Open Finance, notas de corretagem, B3).

## Consequences

- **Positivas:**
  - Garantia de trilha de auditoria completa para conformidade fiscal e regulatória.
  - Ausência de condições de corrida (race conditions) em leitura de dados históricos.
  - Simplificação radical dos algoritmos de replicação, caching e recomputação de carteira no `Portfolio Engine`.
- **Negativas:**
  - Requer que qualquer fluxo de edição ou retificação na UI seja tratado como cancelamento + emissão de novo evento.
