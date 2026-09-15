# Diretrizes de Segurança — Project Atlas

## 1. Princípios Gerais de Segurança da Fundação

Mesmo na Fase 0A (sem autenticação ou persistência conectada), as seguintes políticas de segurança são mandatórias em toda a base de código:

### 1.1. Gerenciamento de Segredos e Credenciais

- **Zero Secrets no Git:** Nenhuma chave de API, string de conexão ou credencial pode ser armazenada no repositório.
- Arquivos `.env` e variações locais são estritamente ignorados no `.gitignore`.
- Somente `.env.example` com valores ilustrativos e genéricos é versionado.

### 1.2. Proteção de Dados Sensíveis em Logs

- É expressamente proibido registrar em logs: senhas, tokens de autenticação (JWT/OAuth), números de documentos fiscais (CPF/CNPJ), dados bancários ou patrimônio/saldos de investidores.
- O pacote `@atlas/logger` implementa sanitização e mascaramento automático (`[REDACTED]`) para chaves e contextos sensíveis.

### 1.3. Configuração de Rede e CORS

- A API NestJS (`apps/api`) possui política de CORS explícita e controlada.
- Em ambientes de produção, nunca utilizar curinga irrestrito (`*`) em endpoints de manipulação de dados ou autenticação.
- Origens autorizadas devem ser configuradas via variável de ambiente `ALLOWED_ORIGINS`.

### 1.4. Tratamento de Erros e Stack Traces

- Stack traces detalhados nunca devem ser vazados para clientes externos em ambiente de produção.
