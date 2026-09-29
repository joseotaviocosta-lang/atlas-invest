# ADR-284: Autoridade de Geração do DARF Oficial

## Status

Aceito (Fase 4F)

## Contexto

Era preciso determinar a autoridade oficial de geração de DARF antes de qualquer
integração. Pesquisa oficial (2026-09-29) mostrou que o gerador oficial é o
Sicalc/SicalcWeb (SERPRO/RFB), aplicação de navegador, e que **não** existe API
programática pública e suportada para IRPF/ganhos líquidos (6015).

## Decisão

1. **Autoridade**: o DARF oficial é gerado exclusivamente pelo Sicalc/SicalcWeb
   da Receita Federal.
2. **Sem API suportada para 6015**: as novas APIs oficiais (RAD/PCONT) são de
   CBS, em beta, e não cobrem 6015.
3. **Endpoints de navegador não são API**: endpoints internos do Sicalc não são
   tratados como integração suportada (ADR-285).
4. **Sem renderizador local**: o Atlas nunca rotula PDF próprio como DARF
   oficial.

## Consequências

- O caminho de produção é a entrega interativa oficial (handoff).
- Nenhuma geração local ou scraping é implementada.
