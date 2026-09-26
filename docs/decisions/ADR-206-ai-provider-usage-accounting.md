# ADR-206: AI Provider Token Usage Accounting

## Status

Aceito (Fase 3V)

## Contexto

Chamadas a provedores de LLM externos (como a OpenAI) consomem cotas e geram custos de computação baseados no volume de tokens de entrada (prompt) e saída (completion). A contabilidade de uso precisa ser auditável e exata, sem fabricar números fictícios e sem depender de estimativas heurísticas não confiáveis.

## Decisão

1. **Uso Reportado pelo Provedor é Canônico e Estritamente Validado:**
   - Quando o provedor reporta dados de uso (`prompt_tokens`, `completion_tokens`, `total_tokens`), cada campo deve ser validado como um inteiro seguro não-negativo (`typeof val === 'number' && Number.isFinite(val) && Number.isSafeInteger(val) && val >= 0`).
   - São **terminantemente proibidos**: coerção/parsing de strings (`"100"`), arredondamentos (`Math.floor`, `Math.round`), clamp de negativos para zero (`Math.max(0, ...)`), ou qualquer reparo silencioso.
2. **Validação Atômica (Tudo ou Nada):**
   - Caso qualquer campo de token seja inválido, malformado ou ausente enquanto outros estão presentes de modo incompleto, o envelope inteiro de uso torna-se `source: 'UNAVAILABLE'` com `inputTokens: null, outputTokens: null, totalTokens: null`. Nunca emitir estado parcial com tokens fabricados.
3. **Consistência de Soma Total:**
   - Quando todos os três campos estão presentes, impõe-se `total_tokens === prompt_tokens + completion_tokens`. Qualquer inconsistência matemática invalida o envelope para `UNAVAILABLE` (`null / null / null`) sem recálculo arbitrário.
4. **Zero Reportado é Válido:**
   - O relato genuíno de `0 / 0 / 0` pelo provedor é aceito e mantido como `source: 'PROVIDER'`.
5. **Tratamento de Uso Ausente:**
   - Se o provedor não reportar os tokens ou falhar antes da geração, os campos de tokens devem ser gravados como `null` com `source: 'UNAVAILABLE'`.
   - É **proibido** relatar `0` tokens quando a informação não foi fornecida pelo provedor.
6. **Casos Não Aplicáveis:**
   - Para requisições bloqueadas antes do provedor (intenções não suportadas ou orçamentos de contexto excedidos), os tokens são gravados como `0` com `source: 'NOT_APPLICABLE'`.
7. **Falha de Telemetria Não Interrompe a Resposta de Negócio (Fail-Open):**
   - Caso a telemetria encontre metadados de uso malformados, o status de telemetria de uso cai para `UNAVAILABLE`, mas a resposta do assistente ao usuário permanece com status `ANSWERED` (ou stream terminal `FINAL`).
8. **Sem Modelo Monetário na Fase 3V:**
   - A Fase 3V rastreia unicamente quantidades de tokens; tabelas de preços em dólares ou reais e regras de faturamento são diferidas para fases comerciais futuras.

## Consequências

- Auditoria fidedigna de uso de recursos computacionais por requisição sem manipulação de dados do provedor.
- Zero distorção estatística por fabricação arbitrária de números.
- Resiliência operacional sem falhas em cascata para o investidor final.
