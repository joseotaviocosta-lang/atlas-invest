# ADR-224: Aliases de Evidência Locais à Requisição

## Status

Aceito (Fase 3Y) — implementado

## Contexto

Identificadores canônicos de fato são longos e autodescritivos por desenho
(`BRL.RELATIVE_RISK.TRACKING_ERROR`, `EVENT:evt-000049.QUANTITY`). A auditoria da Fase 3Y
mediu 10.725 bytes apenas de `factId` em uma timeline de 50 eventos, e cada citação exige
que o identificador apareça também no contexto enviado ao provedor.

Como o provedor precisa citar evidência de forma inequívoca, remover os identificadores
não é opção. A alternativa é encurtá-los apenas na fronteira do provedor.

## Decisão

1. **Aliases Efêmeros e Locais à Requisição:**
   - A projeção atribui `F1`, `F2`, `F3`, … aos fatos selecionados, em ordem determinística
     de seleção.
   - Os aliases existem **exclusivamente dentro de uma requisição**. Não são identidade,
     não são persistidos e não atravessam turnos.

2. **Mapeamento Servidor-Autoritativo:**
   - O servidor mantém `alias → factId canônico` e `factId canônico → alias`.
   - O provedor devolve o alias; o servidor resolve para a identidade canônica **antes** da
     validação de claims e de evidências.
   - Identificadores canônicos também continuam aceitos, sem quebra de compatibilidade.

3. **Ausência de Colisão por Construção:**
   - A atribuição é sequencial e memoizada por `factId`; um mesmo fato recebe sempre o
     mesmo alias, e dois fatos distintos nunca compartilham alias dentro da requisição.

4. **Estabilidade de Ordem:**
   - Para grounding idêntico, o mapeamento de aliases é idêntico, byte a byte.

5. **Referência Desconhecida Falha Fechada:**
   - Uma referência que não exista no mapa é repassada intacta, de modo que a validação
     fail-closed a rejeite com `AI.INVALID_MODEL_RESPONSE` (422). A resolução **nunca**
     inventa identidade canônica.

6. **Persistência Sempre Canônica:**
   - O snapshot mínimo de evidência e o histórico de conversa gravam exclusivamente
     `factId` canônico. É **proibido** persistir `F1`/`F2` como identidade histórica.

7. **Contrato de Claims Inalterado:**
   - Claim V1 não sofre migração: a resolução ocorre a montante da validação, portanto o
     schema de segmentos e `factIds` permanece idêntico.

## Consequências

- Redução material de bytes na fronteira do provedor sem ambiguidade de citação.
- Auditoria histórica permanece estável e legível em identidade canônica.
- Um alias vazado para fora da requisição não tem significado, o que é intencional.
