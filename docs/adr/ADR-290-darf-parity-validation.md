# ADR-290: Validação de Paridade Oficial

## Status

Aceito (Fase 4F) — **parcialmente aplicável**

## Contexto

Se um serviço oficial recalculasse os valores (multa/juros/total), qualquer
divergência em relação ao Atlas deveria bloquear, nunca aceitar silenciosamente.

## Decisão

1. **Regra geral**: quando houver recálculo oficial programático, a paridade
   (principal, multa, juros, total) é obrigatória; divergência ⇒ `BLOCKED`
   (`PARITY_MISMATCH`), sem aceitar nenhum dos lados.
2. **Nesta fase**: não há chamada oficial de geração (modo interativo). O Sicalc
   recalcula os acréscimos **na emissão pelo usuário**; o Atlas exibe os valores
   do 4D (autoridade oficial verificada) e orienta a conferência no Sicalc.
3. **Paridade programática** permanece `N/A` até existir API oficial suportada
   para 6015.

## Consequências

- Nenhuma divergência oficial é aceita silenciosamente quando a paridade for
  aplicável.
- A limitação é explicitamente documentada.
