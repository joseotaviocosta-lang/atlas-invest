# Contrato: TaxTradeClassification v1 (Fase 4B.2)

Classificação canônica do tipo de operação para fins fiscais. Representa **fato**,
não tratamento tributário (ADR-249, ADR-253).

## Valores

`NORMAL | DAY_TRADE | UNKNOWN`

`UNKNOWN` é cidadão de primeira classe e **nunca** vira `NORMAL`.

## Estrutura

```
{ transactionId, classification, source, sourceReference?, classifiedAt?, classificationVersion }
```

## Fontes

`BROKER_IMPORT | CANONICAL_LEDGER | MANUAL_CONFIRMED`

## Regras

1. Classificação concreta (`NORMAL`/`DAY_TRADE`) exige `sourceReference` (proveniência).
2. `UNKNOWN` não exige proveniência.
3. **Proibido** inferir `DAY_TRADE` de heurística (ex.: mesmo ativo + mesmo dia + BUY/SELL) — ADR-249/253.
4. A classificação é metadado derivado/auxiliar; nunca reescreve o livro-razão imutável.
5. Não há fusão de operações entre contas/instituições sem justificativa explícita.

## Estado atual do Atlas

O modelo de transação não contém informação suficiente (ordem de execução,
identificador de operação, timestamp de execução) para classificar day trade com
segurança. Portanto, na ausência de input canônico, a classificação permanece
`UNKNOWN` e o bucket de equity dependente dela permanece bloqueado.
