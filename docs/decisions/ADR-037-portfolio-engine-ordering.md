# ADR-037: Portfolio Engine Canonical Ordering

## Status

Accepted

## Context

O resultado do replay de uma carteira de investimentos depende criticamente da ordem em que os eventos são aplicados. Em particular:

- Uma ordem arbitrária ou não determinística pode aplicar uma venda (`SELL`) antes de uma compra (`BUY`) no mesmo dia, disparando incorretamente violações da invariante long-only (`NegativePositionError`).
- Ambiguidades de ordenação em bancos de dados relacionais e em arrays JavaScript (`Array.prototype.sort`) sem critério de desempate estável causam divergências sutis de comportamento.

Portanto, uma regra de ordenação canônica e invariante em 3 níveis (tupla de ordenação) deve ser especificada e rigorosamente aplicada tanto no banco de dados quanto no motor em memória.

## Decision

Adotar a **Tupla Canônica de 3 Níveis** como critério imutável de ordenação cronológica de transações:

1. **Critério Primário: Data Econômica (`tradeDate ASC`)**
   - Compara a data do pregão/evento econômico (`LocalDate`).
2. **Critério Secundário: Registro Cronológico de Inclusão (`createdAt ASC`)**
   - Desempate para operações registradas na mesma data econômica, refletindo a ordem real de inserção na plataforma.
3. **Critério de Desempate Estrito: Identificador Único (`id ASC`)**
   - Comparação lexicográfica de UUIDs para garantir estabilidade e reproducibilidade 100% determinística mesmo em transações criadas no mesmo milissegundo.

Implementação padronizada:

- No banco de dados (`TransactionRepository.findByPortfolioId`):
  `orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]`
- No motor (`compareTransactionsChronologically` em `@atlas/portfolio-engine`):
  ```typescript
  export function compareTransactionsChronologically(a: Transaction, b: Transaction): number {
    const dateComp = a.tradeDate.compare(b.tradeDate);
    if (dateComp !== 0) return dateComp;

    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  }
  ```

## Consequences

- **Positivas:**
  - Garantia de determinismo: independentemente da ordem em que as transações são fornecidas na entrada (mesmo embaralhadas aleatoriamente centenas de vezes), a saída do motor é idêntica.
  - Alinhamento perfeito entre queries SQL/Prisma e lógica de ordenação em memória.
  - Eliminação completa de 'race conditions' no processamento de eventos do mesmo dia.
- **Negativas:**
  - Exige ordenação prévia em memória no motor (`filtered.sort(compareTransactionsChronologically)`) para garantir que dados não ordenados vindos de fontes externas sejam normalizados antes do replay.
