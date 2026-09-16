# ADR-030: Mitigação de CSRF e Segurança de Cookies no Navegador

## Status

Aprovado

## Contexto

Como o `refreshToken` é armazenado em cookies gerenciados pelo navegador, a aplicação web está potencialmente sujeita a riscos de Cross-Site Request Forgery (CSRF), em que sites maliciosos de terceiros poderiam forçar requisições com credenciais anexadas automaticamente pelo navegador.

## Decisão

1. **Defesa em Profundidade com Cookies SameSite=Lax:**
   - Todos os cookies emitidos pela aplicação web utilizam o atributo `SameSite=Lax`.
   - Isso garante que requisições cross-site disparadas por links ou scripts externos (ex: formulários POST em outros domínios, tags `<img src="...">`, etc.) **nunca** incluem os cookies de sessão do Atlas.
2. **Cabeçalho Customizado Anti-CSRF (`x-atlas-client: web`):**
   - Todas as requisições disparadas pelo cliente HTTP (`ApiClient`) injetam obrigatoriamente o cabeçalho HTTP customizado `x-atlas-client: web`.
   - Sob as regras de segurança CORS dos navegadores, a inclusão de cabeçalhos não-padrão desqualifica a requisição como uma "Simple Request", forçando o navegador a emitir uma requisição `OPTIONS` (preflight) que sites de terceiros não conseguem falsificar.
3. **Restrição de Verbos e Validação de Origem:**
   - Requisições mutatórias (`POST`, `PUT`, `DELETE`) em Route Handlers e na API backend rejeitam origens não autorizadas e requisições sem os cabeçalhos apropriados.

## Consequências

- **Positivas:**
  - Proteção robusta e multicamada contra qualquer tentativa de ataque CSRF.
  - Elimina a necessidade de tokens sincronizados adicionais em formulários tradicionais, simplificando a arquitetura SPA/Next.js.
