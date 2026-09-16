# ADR-022: Isolamento de Recursos por Usuário e Política Anti-Enumeração

## Status

Aprovado

## Contexto

Em uma plataforma financeira de investimentos, a privacidade e o sigilo patrimonial são fundamentais. Recursos como Carteiras, Contas Bancárias e Transações pertencem a um usuário específico. Se a API expuser userId aceito diretamente do cliente, agentes maliciosos poderiam injetar ou manipular carteiras de terceiros. Além disso, retornar 403 Forbidden quando um recurso existe mas pertence a outro usuário revela a existência prévia daquele recurso para atacantes (enumeração de IDs).

## Decisão

1. **Remoção de userId dos Contratos de Entrada:**
   - O payload do endpoint POST /api/v1/portfolios não aceita mais userId. Quaisquer campos extras são rejeitados com 400 pelo validador Zod em modo estrito.
   - O endpoint GET /api/v1/portfolios não aceita userId via query string; retorna exclusivamente as carteiras do usuário autenticado.
   - O userId é extraído exclusivamente do token autenticado através do decorator @CurrentPrincipal().
2. **Propriedade e Isolamento de Recursos:**
   - Ao acessar, listar ou modificar carteiras, contas e transações, a camada de aplicação valida se a carteira pertence ao userId autenticado via portfolioRepository.findByIdAndUserId(portfolioId, principal.userId).
   - Contas e transações operam sob a hierarquia de posse da carteira. Acesso a contas ou transações pertencentes a carteiras de outros usuários é bloqueado na raiz.
3. **Política Anti-Enumeração (404 Not Found Obrigatório):**
   - Tentativas de acessar, modificar ou inserir dados em carteiras, contas ou transações pertencentes a outros usuários retornam invariavelmente **404 Not Found** com mensagem genérica de recurso não encontrado.
   - **NÃO é retornado 403 Forbidden** para recursos de terceiros, impedindo que atacantes descubram quais UUIDs existem no sistema.

## Consequências

- **Positivas:**
  - Isolamento multi-inquilino rígido no nível de banco de dados e aplicação.
  - Impossibilidade de spoofing de identidade via payload HTTP.
  - Mitigação de vulnerabilidades de IDOR (Insecure Direct Object Reference).
- **Negativas / Mitigações:**
  - Diagnóstico de permissões requer inspeção de logs internos estruturados pelo correlation ID em vez de códigos de erro específicos expostos externamente.
