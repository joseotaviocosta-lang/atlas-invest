# ADR-289: Proibição de Bypass de Captcha

## Status

Aceito (Fase 4F)

## Contexto

O Sicalc exige interação do usuário e, em alguns fluxos, captcha. Automatizá-lo
por OCR, solução de captcha, replay de sessão ou automação de DOM seria abuso de
serviço público.

## Decisão

1. **Nenhum bypass**: proibido OCR, resolução de captcha, replay de sessão,
   automação headless de UI ou scraping de fluxo autenticado.
2. **Interação do usuário** é um requisito de primeira classe: o resultado é
   `USER_ACTION_REQUIRED`.
3. **Falha explícita**: `CAPTCHA_REQUIRED` / `AUTH_REQUIRED` /
   `OFFICIAL_SERVICE_UNAVAILABLE` — nunca sucesso simulado.
4. **Sem retry storm / polling**: nenhuma integração automática nesta fase.

## Consequências

- Conformidade com o serviço oficial.
- O produto assume explicitamente a etapa manual no Sicalc.
