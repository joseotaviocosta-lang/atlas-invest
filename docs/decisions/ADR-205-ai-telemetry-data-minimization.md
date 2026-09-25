# ADR-205: AI Telemetry Privacy & Data Minimization

## Status

Aceito (Fase 3V)

## Contexto

Registros de telemetria e métricas operacionais são frequentemente exportados para sistemas de agregação de logs, ferramentas de monitoramento centralizadas e consoles de depuração. Armazenar entradas brutas de usuários, instruções de sistema ou dados de carteira em telemetria genérica exporia segredos, dados pessoais e patrimônio a riscos de vazamento e não conformidade com a LGPD.

## Decisão

1. **Zero Textos Brutos:**
   - É terminantemente proibido incluir em registros genéricos de telemetria: a pergunta bruta do usuário, o prompt construído (system/user), a resposta gerada pelo modelo ou as mensagens do histórico.
   - Em vez de texto, a telemetria registra estritamente metadados dimensionais e contagens (`questionLength`, `historyMessageCount`, `historyChars`).
2. **Zero Fatos Financeiros ou Saldos:**
   - Valores em reais, porcentagens, cotas de ativos e identificadores de fatos com valores monetários são omitidos dos eventos de telemetria.
   - Registram-se apenas contagens agregadas (`groundingFactCount`, `groundingSerializedBytes`, `claimCount`, `evidenceCount`).
3. **Zero Credenciais e PII:**
   - Chaves de API (`OPENAI_API_KEY`), tokens de autenticação (JWT), senhas, endereços de e-mail e CPFs jamais devem estar presentes na telemetria.

## Consequências

- Telemetria segura para ambientes de observabilidade compartilhados.
- Conformidade total com a LGPD e regras inegociáveis de segurança do Atlas.
