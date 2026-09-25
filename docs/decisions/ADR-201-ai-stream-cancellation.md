# ADR-201: Cancelamento Resiliente e Desconexão de Cliente em AI Streaming

## Status
Aceito (Fase 3U)

## Contexto
Comunicações por streaming HTTP (SSE) são propensas a desconexões súbitas da rede móvel, fechamento de abas no navegador ou cancelamentos intencionais pelo usuário (ex.: navegação para outra tela ou novo envio). Em sistemas ingênuos, tais situações provocam:
1. Processos zumbis no backend consumindo CPU e créditos de API de LLM.
2. Escritas órfãs ou incompletas no banco de dados.
3. Desalinhamento entre o histórico da conversa e o que o usuário efetivamente presenciou.

## Decisão
1. **Propagação de `AbortSignal`:**
   - O controlador SSE intercepta o encerramento do transporte HTTP (`req.on('close')` e `(req as any).signal`).
   - Um `AbortController` é mantido ativo durante toda a execução do caso de uso e repassado para o provedor de inteligência artificial (`AICompletionOptions.signal`).
2. **Interrupção Imediata a Jusante:**
   - A chamada ao modelo (OpenAI ou Fake) aborta imediatamente a requisição HTTP upstream assim que o sinal for disparado, cessando o consumo de tokens e recursos de rede.
3. **Rollback Limpo e Zero Gravação no Banco:**
   - Se o cancelamento ocorrer antes da persistência do turno (`conversationRepository.appendTurn`), nenhuma mensagem do assistente respondida é gravada no banco.
   - O estado do banco de dados permanece íntegro e imutável.
4. **Fechamento Gracioso do Socket:**
   - O socket SSE é encerrado de forma limpa sem vazamento de handles ou conexões abertas no servidor.

## Consequências
- Economia rigorosa de recursos computacionais e financeiros de terceiros.
- Zero ocorrência de respostas fantasmas registradas no banco que o investidor nunca recebeu.

