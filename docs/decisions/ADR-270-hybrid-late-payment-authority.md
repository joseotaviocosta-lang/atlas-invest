# ADR-270: Autoridade Híbrida de Atraso

## Status

Aceito (Fase 4D.2)

## Contexto

A Fase 4D.1A provou (por resultados oficiais do Sicalc) que a multa usa início
no primeiro dia útil após o vencimento, contagem em dias corridos, teto 20% e
arredondamento `ROUND_HALF_EVEN`; e que os juros são a soma simples mensal da
SELIC + 1% no mês do pagamento. O início depende do calendário de feriados
(que o Atlas não reconstrói).

## Decisão

1. **Motor local determinístico** para a fórmula da multa, teto, juros,
   acumulação SELIC, arredondamento e composição.
2. **Snapshot oficial do Sicalc** como autoridade para o valor/percentual de
   multa sensível ao dia útil.
3. **Snapshots oficiais da SELIC** para as taxas mensais.
4. Falha fechada quando a autoridade ou as taxas estiverem ausentes.

## Consequências

- Resultado auditável e reproduzível sem inventar calendário.
- O principal original nunca é alterado.
