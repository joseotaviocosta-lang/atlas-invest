# ADR-273: Arredondamento Half-Even por Componente

## Status

Aceito (Fase 4D.2)

## Contexto

A Fase 4D.1A provou, por resultados oficiais do Sicalc, que o arredondamento
monetário é `ROUND_HALF_EVEN` a 2 casas (0,165→0,16; 0,825→0,82; 0,495→0,50;
1,155→1,16), aplicado por componente.

## Decisão

1. Multa e juros são arredondados independentemente a 2 casas com half-even.
2. `updatedAmount = principal + multa_arredondada + juros_arredondado`.
3. Precisão decimal exata antes do arredondamento; zero `Number`/`Math.round`.
4. O total é canonicalizado a 2 casas sem alterar a soma exata.

## Consequências

- Reprodução exata do resultado oficial.
