# ADR-241: Estratégia de Persistência do Tax Ledger

## Status

Aceito (Fase 4A)

## Contexto

O Tax Ledger é estado derivado e recalculável. Persistir estado derivado prematuramente
cria risco de se tornar uma segunda fonte da verdade, de ficar desatualizado quando o
livro-razão muda e de exigir invalidação complexa.

## Decisão

1.  **Compute-on-Read (Opção A):** A Fase 4A adota projeção **calculada sob demanda**
    (compute-on-read). O `FiscalEvent` e o `MonthlyTaxState` são derivados a cada leitura a
    partir do livro-razão canônico, sem persistência intermediária.

2.  **Sem Migração de Estado Derivado:** A Fase 4A **não** cria tabelas para estado fiscal
    derivado. `migration: NONE`.

3.  **Sem Cache Prematuro:** Não se adiciona Redis ou cache de posições fiscais. Correção
    antes de otimização.

4.  **Se Persistência for Necessária no Futuro:** Deve ser comprovadamente recalculável,
    nunca fonte da verdade, e carregar fingerprint de entrada (transações + versão de
    projeção + versão de regra). Resultado obsoleto deve ser invalidado/rebuildado.

5.  **Boundedness:** A projeção não é persistida proporcionalmente ao número de transações
    além do necessário ao cálculo corrente.

## Consequências

- Zero risco de divergência entre estado persistido e livro-razão.
- Reconstrução determinística é sempre possível (invariância de replay).
- Otimização de performance fica adiada até haver evidência de necessidade de escala.
