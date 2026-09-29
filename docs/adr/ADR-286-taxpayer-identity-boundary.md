# ADR-286: Fronteira de Identidade do Contribuinte

## Status

Aceito (Fase 4F)

## Contexto

O Sicalc exige CPF (e data de nascimento) digitados pelo próprio usuário. O Atlas
não precisa persistir o CPF bruto e não deve espalhá-lo por logs, telemetria,
trace de cálculo ou grounding de IA.

## Decisão

1. **CPF nunca no `@atlas/tax-engine`**: o domínio puro não recebe identificador
   bruto; apenas funções puras de validação/máscara.
2. **Modelo `TaxpayerIdentityReference`**: `userId`, `identityAvailable`,
   `identityType`, `maskedIdentifier`, `secureReference` (HMAC-SHA256 com
   pimenta de servidor). **Nunca** o valor bruto.
3. **Validação imediata**: o identificador é validado (dígitos verificadores) e
   imediatamente mascarado; o valor bruto não é persistido nem devolvido.
4. **Sem PII em logs/telemetria/IA**: proibido registrar CPF bruto.
5. **Handoff não exige identidade**: o usuário digita o CPF no serviço oficial;
   a identidade disponível apenas agiliza/rotula.

## Consequências

- Redução de risco LGPD; nenhum CPF bruto em repouso.
- A obrigação de digitar o CPF permanece no serviço oficial.
