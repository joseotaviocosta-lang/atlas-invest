# ADR-027: Gerenciamento de Estado de Servidor e Isolamento de Cache por Usuário (TanStack Query)

## Status

Aprovado

## Contexto

O aplicativo mobile precisa de sincronização eficiente com os dados do servidor (carteiras, contas, ativos futuros), suportando cache local, revalidação em segundo plano, mutações otimistas e tratamento padronizado de estados visuais (carregamento, vazio, erro, offline). Além disso, múltiplos usuários podem utilizar o mesmo dispositivo compartilhado em momentos diferentes, o que exige garantia matemática de que os dados financeiros de um investidor nunca vazem para outro.

## Decisão

1. **Adoção do @tanstack/react-query:**
   - Padronização de queries e mutações em todo o ecossistema móvel.
   - Configuração de `staleTime` para 2 minutos e `gcTime` para 10 minutos.
   - `refetchOnWindowFocus: false` para evitar requisições desnecessárias durante trocas rápidas de app.
2. **Separação Rígida entre Estado de Servidor e Estado de Cliente:**
   - **Estado de Servidor:** Gerenciado exclusivamente pelo TanStack Query (`carteiras`, `contas`, etc.).
   - **Estado de Cliente:** Gerenciado exclusivamente pelo Zustand (`authStore` para status de autenticação, perfil e tokens).
3. **Isolamento e Purga de Cache no Logout:**
   - A função `clearQueryCache()` executa compulsoriamente `queryClient.clear()` no momento em que qualquer logout é acionado (seja intencional pelo usuário ou forçado por expiração de sessão).
   - Nenhuma chave de consulta persiste entre sessões de usuários distintos.
4. **Padronização de Estados Visuais:**
   - Todas as telas de dados implementam a quádrupla verificação de estados:
     - `isLoading` -> `LoadingState`
     - `isError` -> `ErrorState` (+ `OfflineBanner` se `isOffline`)
     - `data.length === 0` -> `EmptyState` com Call to Action
     - Sucesso -> Lista de componentes (`Card` / `FlatList`).

## Consequências

- **Positivas:**
  - Garantia estrita de isolamento de dados entre investidores diferentes no mesmo aparelho.
  - Redução expressiva de consumo de banda e latência percebida com cache em memória.
  - Interfaces consistentes e resilientes a falhas de rede.
- **Negativas / Mitigações:**
  - Ao alternar de conta, todas as consultas precisam ser refeitas do servidor, o que é mandatório por conformidade de segurança bancária.
