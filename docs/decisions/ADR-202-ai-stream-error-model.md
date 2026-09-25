# ADR-202: Modelo de Erros e Falha Fechada em AI Streaming

## Status

Aceito (Fase 3U)

## Contexto

Durante o processamento de um fluxo SSE, falhas podem ocorrer em diferentes etapas:

1. Validação de parâmetros de entrada.
2. Violação de permissões ou tentativa de acesso a carteira alheia.
3. Timeout ou erro de conectividade com o provedor de IA.
4. Falha na validação de afirmações estruturadas (ex.: alegação citando fato inexistente no grounding).
5. Erro no renderizador de strings ou persistência.

É necessário um modelo de tratamento de erros consistente que não vaze metadados confidenciais, não entregue respostas parciais corruptas e responda adequadamente ao protocolo HTTP antes e depois do início do fluxo.

## Decisão

1. **Falhas Pré-Fluxo (HTTP Puro):**
   - Validações de rota, formato Zod, autenticação JWT e verificação de propriedade (`verifyOwnership`) são executadas estritamente **antes** do envio de cabeçalhos SSE.
   - Qualquer falha nessa etapa responde com o status code HTTP correspondente: `400 Bad Request`, `401 Unauthorized` ou `404 Not Found` (anti-enumeração).
2. **Falhas Durante o Fluxo (Evento SSE `ERROR`):**
   - Caso os cabeçalhos já tenham sido confirmados e o fluxo iniciado, qualquer exceção técnica ou recusa dispara compulsoriamente um evento terminal `ERROR`.
   - Carga útil: `{ "code": "<STRING_CODE>", "message": "<MENSAGEM_SEGURA_USUARIO>" }`.
   - Códigos padronizados: `AI.CLIENT_ABORTED`, `AI.PROVIDER_TIMEOUT`, `AI.PROVIDER_ERROR`, `AI.VALIDATION_FAILED`, `AI.INTERNAL_ERROR`.
3. **Travamento e Fechamento:**
   - A emissão de `ERROR` finaliza o stream imediatamente (`res.end()`).
   - Nenhuma informação de stack trace, tokens de API ou dados de infraestrutura é exposta no campo `message`.

## Consequências

- A camada cliente possui tratamento inequívoco de erros: status code HTTP para falhas de validação/acesso, ou evento `ERROR` com rollback se o stream já tiver iniciado.
- Impossibilidade de o cliente interpretar um erro técnico como resposta analítica válida.
