# ADR-060: Historical Replay Contract, Prefix Consistency and Permutation Invariance

## Status

Accepted

## Context

O Portfolio Engine opera sob o princípio de reexecução determinística baseada em eventos (event sourcing no livro-razão).

Para que o sistema seja confiável em auditorias financeiras, geração de relatórios fiscais passados e simulações temporais ("as of"), o replay deve satisfazer garantias matemáticas formais de consistência cronológica e independência de ordem física de inserção.

## Decision

1. **Garantia de Prefix Consistency (Consistência de Prefixo Temporal)**:
   - Para qualquer conjunto de transações $T$ e qualquer data de corte $D$:
     $$\text{replay}(T, \text{asOfDate} = D) \equiv \text{replay}(\{ t \in T \mid t.\text{tradeDate} \le D \})$$
   - O estado reconstruído através do parâmetro `asOfDate` é idêntico em todas as suas propriedades (posições, custos, realizações, eventos corporativos, rendimentos, fluxos de caixa e transferências) ao estado que seria obtido se o livro contivesse unicamente as transações ocorridas até a data $D$.

2. **Garantia de Append Consistency (Consistência de Concatenação Futura)**:
   - A adição de transações futuras (com $\text{tradeDate} > D$) ao livro-razão jamais altera, corrompe ou recalcula o estado histórico observado em $D$.
   - O histórico patrimonial é imutável perante a expansão futura do livro.

3. **Garantia de Permutation Invariance (Invariância por Permutação de Entrada)**:
   - Para qualquer permutação $\pi(T)$ do array de transações de entrada fornecido ao engine:
     $$\text{replay}(\pi(T)) \equiv \text{replay}(T)$$
   - A ordenação cronológica canônica é imposta de forma estrita pelo engine antes do dispatch:
     1. `tradeDate ASC`
     2. `createdAt ASC`
     3. `id ASC` (tie-breaker determinístico)
   - A ordem física na qual as transações foram recuperadas do banco de dados ou enviadas pela rede é irrelevante.

## Consequences

- **Positivas:**
  - Garantia formal de reprodutibilidade em 100% dos cenários de teste e auditoria.
  - Segurança matemática formal e sem deriva IEEE-754 nos cenários testados para reconstrução retrospectiva de posições para cálculo de imposto e rentabilidade.
- **Negativas:**
  - Requer que toda e qualquer transação possua `tradeDate`, `createdAt` e `id` válidos.
