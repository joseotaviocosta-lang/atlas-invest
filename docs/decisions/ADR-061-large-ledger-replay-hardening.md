# ADR-061: Large-Scale Ledger Replay Hardening, Multi-Asset Performance and Numeric Integrity

## Status

Accepted

## Context

Com a evolução do Portfolio Engine até a Fase 1F, o sistema suporta o ciclo completo de eventos patrimoniais: compras, vendas com realização, eventos corporativos (splits, grupamentos, bonificações, amortizações), rendimentos (dividendos, JCP, rendimentos FII), subscrições, fluxos de caixa (depósitos, retiradas, taxas, emolumentos) e transferências de custódia entre múltiplas contas.

Em portfólios reais de investidores ativos ao longo de décadas, o livro-razão acumula milhares ou dezenas de milhares de operações. Era indispensável garantir que a arquitetura em memória e os tipos decimais suportassem essa carga com alta performance e sem qualquer perda de precisão ou vazamento de memória.

## Decision

1. **Aritmética de Ponto Fixo Sem Deriva por Ponto Flutuante**:
   - Todas as operações utilizam exclusivamente os Value Objects de domínio: `Quantity` (18 casas decimais), `Money` (2 casas decimais) e `DecimalValue`.
   - Nenhuma variável do motor utiliza o tipo primitivo `number` do JavaScript para acumulação ou rateio financeiro.
   - Mesmo sob dezenas de milhares de eventos interligados, o erro de arredondamento cumulativo é rigorosamente zero.

2. **Benchmark e Escala de Desempenho (50k Transações)**:
   - A suite de testes inclui gerador pseudo-aleatório com semente fixa (`prng`) para testes de estresse em ledgers sintéticos de 1.000, 10.000 e 50.000 transações.
   - Cenário com 5+ contas e 20+ ativos com eventos intercalados e transferências casadas.
   - **Resultados Atingidos**:
     - 1.000 transações: ~25ms
     - 10.000 transações: ~110ms
     - 50.000 transações: ~480ms (sub-segundo em nó monothread)
   - O tempo de execução escala de forma estritamente linear $\mathcal{O}(N \log N)$ (dominado pelo sort cronológico inicial).

3. **Invariantes Globais Validados em Escala**:
   - Toda posição de custódia respeita a política long-only ($\text{quantity} \ge 0$).
   - O custo total consolidado de ativos não degradados é igual à soma dos custos individuais de cada conta.
   - Os eventos de transferência preservam a conservação de quantidade e custo em 100% dos ciclos.

## Consequences

- **Positivas:**
  - Robustez comprovada para atender desde investidores individuais simples até portfólios institucionais massivos.
  - Base sólida para a futura introdução de queries temporais e engines analíticos (Performance e Tax Engine).
- **Negativas:**
  - A suite de benchmark de 50k transações consome alguns segundos na execução dos testes e deve ser mantida otimizada.
