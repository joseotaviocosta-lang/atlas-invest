# Phase 5H — Operator Console

Console do operador em `/admin/operations` (Next.js App Router, rota
autenticada sob `app/(app)/`).

## 1. Autorização

- O layout autenticado redireciona não-autenticados para `/login`.
- A página **não** confia em checagem client-side de papel: cada endpoint
  responde 401 (sem auth) / 403 (usuário comum) / 200 (operador), e a UI
  renderiza esses três estados explicitamente.
- Navegação do console não é anunciada como prova de permissão; a API é a
  autoridade.

## 2. Seções

- **Visão geral:** estado geral, agendador, prontidão resumida, questões
  críticas/avisos e tabela de frescura das 10 fontes (estado, esperado até,
  persistido até, atraso, motivo, último sucesso/tentativa).
- **Alertas:** filtros de severidade/status/tipo, lista limitada (25/50/100),
  detalhe por `dedupeKey` com ciclo de vida completo (ACTIVE/RESOLVED,
  ocorrências, timestamps, motivo).
- **Execuções:** saúde (falhas, parciais, presas, retentativas esgotadas,
  perdidas), histórico paginado com filtros (jobType, status, trigger,
  from/to), detalhe por execução e ação de execução manual guardada.
- **Backfills:** plano dry-run (domínio, from, to) com janelas/períodos
  elegíveis, pulos, estimativa de chamadas e `requiresConfirmation`;
  execução somente após inspeção, com confirmação obrigatória para planos
  grandes e recibo auditável.
- **Prontidão:** veredito READY/NOT_READY e cada verificação individual;
  desabilitado intencional é exibido como configuração, não como falha.
- **Métricas:** totais por status/gatilho, falhas de provedor, retentativas,
  backfills, pulos, locks, duração média e atraso por fonte. Sem backend
  novo: apenas o que a API de métricas já deriva do histórico persistido.

## 3. Segurança de ações

- Toda mutação exige modal de confirmação com tipo, período e chave lógica.
- Botões desabilitam durante a requisição (anti-double-submit).
- Recibos são exibidos verbatim; PARTIAL destaca trabalho restante.
- Nenhum campo de provedor/URL/SGS/range arbitrário existe nos formulários.

## 4. Zero-live-read e polling

- Carregar, atualizar, abrir alerta/job/métrica/prontidão: **0 chamadas** a
  provedores (apenas APIs persistidas `/api/v1/admin/*`).
- Atualização manual via botão "Atualizar agora" + polling passivo de 45s
  sobre as mesmas APIs persistidas. Nenhum intervalo agressivo.
- Somente execução manual e execução de backfill podem acionar provedores
  no servidor, sempre após confirmação explícita.

## 5. Erros e estados

- 401 → "Sessão expirada" com re-login; 403 → "Acesso restrito a
  operadores"; 500/rede → `ErrorState` com retentativa, sem stack trace.
- Vazios honestos (sem alerta, sem histórico, agendador desligado,
  frescura desconhecida) nunca exibem zeros fabricados.
- Timestamps exibidos em horário de São Paulo com rótulo explícito; datas
  civis (targetPeriod/scheduledFor) nunca são transformadas.
