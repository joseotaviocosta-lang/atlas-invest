# ADR-251: Metadados de Condição Tributária de FII

## Status

Aceito (Fase 4B.2)

## Contexto

O tratamento de rendimentos de FII depende de condições (contagem de cotistas,
percentual de titularidade, negociação em bolsa). Sem esses fatos, a condição não
pode ser avaliada.

## Decisão

1. `FiiTaxEligibilityFacts` é **input factual**, não tratamento tributário.
2. O motor não decide isenção/tributação nesta camada.
3. `KNOWN` exige todos os fatos; `UNKNOWN` não carrega valores adivinhados.
4. `asOfDate` explícito: metadado atual não é verdade histórica automática.
5. Aquisição externa ocorre fora do Tax Engine (offline/puro).
6. Conflito importado vs manual → `CONFLICT`, sem escolha silenciosa.

## Consequências

- Condições avaliáveis de forma determinística quando os fatos existirem.
- Nenhum valor de condição inventado.
