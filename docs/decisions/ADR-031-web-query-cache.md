# ADR-031: Gerenciamento de Cache de Servidor e Isolamento de Estado Cross-User (TanStack Query)

## Status

Aprovado

## Contexto

A aplicação web utiliza TanStack Query (v5) para gerenciar o estado assíncrono do servidor (como listas de carteiras, ativos e contas). Quando múltiplos usuários utilizam o mesmo navegador ou quando um investidor efetua logout, dados financeiros cacheados na memória da aplicação poderiam vazar para outro usuário caso o cache não seja sanitizado compulsoriamente.

## Decisão

1. **Adoção do TanStack Query v5 no Cliente Web:**
   - Centralizado via `QueryClientProvider` em `apps/web/src/providers/query-provider.tsx`.
   - Políticas padrão configuradas:
     - `staleTime: 2 minutos` (evita refetches excessivos em navegações rápidas);
     - `retry: 1` para queries idempotentes;
     - `refetchOnWindowFocus: false` para controle previsível de rede.
2. **Purga Compulsória em Qualquer Evento de Logout ou 401 Irrecuperável:**
   - O helper `clearQueryCache()` executa `queryClient.clear()`.
   - Essa limpeza é invocada compulsoriamente:
     - Na ação de logout explícito (`useAuthStore.getState().logout()`);
     - Na falha definitiva de renovação de sessão (refresh token revogado ou expirado);
     - Na inicialização de nova sessão com credenciais distintas.
3. **Isolamento Total de Dados Financeiros:**
   - Nenhuma informação de carteiras ou investimentos é mantida após o término da sessão do usuário autenticado.

## Consequências

- **Positivas:**
  - Imunidade contra vazamento de dados entre usuários em computadores compartilhados.
  - Sincronização previsível e invalidation declarativa (`queryClient.invalidateQueries({ queryKey: ['portfolios'] })`).
- **Negativas / Mitigações:**
  - Após o logout, o novo login precisará buscar as carteiras na rede novamente (comportamento desejado e seguro).
