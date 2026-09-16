# ADR-026: Cliente HTTP Centralizado e Interceptor Single-Flight de Renovação de Tokens

## Status

Aprovado

## Contexto

Na arquitetura de autenticação por tokens rotativos (ADR-020), o access token possui TTL curto (15 minutos). Ao carregar telas complexas que disparam múltiplas requisições paralelas (ex: listar carteiras, carregar perfil, verificar cotações), a expiração do token de acesso pode gerar dezenas de respostas `401 Unauthorized` concorrentes. Disparar múltiplos requests de renovação (`/api/v1/auth/refresh`) simultâneos acionaria falsamente a detecção de reuso de token no backend e revogaria toda a sessão do usuário legítimo.

## Decisão

1. **Cliente HTTP Centralizado (`ApiClient`):**
   - Todas as chamadas de rede no aplicativo móvel trafegam obrigatoriamente através da instância única `apiClient` (`src/api/client.ts`).
   - Injeção automática do header `Authorization: Bearer <inMemoryAccessToken>`.
2. **Mecanismo Single-Flight Refresh:**
   - Ao receber status HTTP 401 em uma requisição autenticada:
     - Se a requisição já for uma retentativa (`isRetry: true`), aborta imediatamente para evitar loops infinitos.
     - Se nenhuma renovação estiver em andamento, instancia uma `Promise` única em `activeRefreshPromise` que chama `POST /api/v1/auth/refresh` com o token do `SecureStore`.
     - Se uma renovação já estiver em andamento por outra requisição concorrente, a requisição atual anexa-se à mesma `Promise` já existente sem disparar nova chamada de rede.
     - Quando a `Promise` resolve com o novo access token, todas as requisições aguardando no pool são reexecutadas exatamente uma vez com o novo token de acesso e a flag `isRetry: true`.
3. **Tratamento de Falha de Renovação:**
   - Se o endpoint `/refresh` falhar (401/403 por token expirado ou reuso detectado), o interceptor cancela todas as requisições em espera, executa `logout()` no `authStore`, esvazia o cache do TanStack Query e redireciona o usuário para o login.
4. **Detecção de Conectividade e Offline:**
   - Erros de rede a nível de socket ou fetch são mapeados para `ApiError` com `isOffline: true`, permitindo que a interface apresente o banner e estados visuais de conectividade sem crashes.

## Consequências

- **Positivas:**
  - Exatamente UMA chamada de rotação é realizada mesmo com dezenas de requisições paralelas.
  - Impossibilidade de deslogar o usuário legítimo por colisão de refresh.
  - Ausência total de loops recursivos de 401.
- **Negativas / Mitigações:**
  - Requisições concorrentes aguardam a conclusão da renovação (geralmente entre 100ms e 300ms), o que é imperceptível para o usuário final.
