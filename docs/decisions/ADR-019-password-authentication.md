# ADR-019: Autenticação por Senha com Argon2id e Mitigação de Timing Attacks

## Status

Aprovado

## Contexto

A segurança de credenciais e proteção contra ataques de dicionário, força bruta, comprometimento de banco de dados e timing attacks é mandatória para uma plataforma financeira. Algoritmos tradicionais (como MD5, SHA-256 simples ou mesmo bcrypt desatualizado) não oferecem resistência adequada contra ataques acelerados por GPU/ASIC nem garantem proteção contra análise de tempo de resposta quando o usuário não existe.

## Decisão

1. **Algoritmo Argon2id:**
   - Adotado o padrão Argon2id (versão 19), vencedor da Password Hashing Competition (PHC), combinando resistência contra ataques de canal lateral (Argon2i) e ataques de força bruta com GPUs (Argon2d).
   - Configurações estritas de memória, custo de tempo e paralelismo via biblioteca rgon2 nativa.
2. **Requisitos de Senha:**
   - Tamanho mínimo de 10 caracteres (PasswordSchema no @atlas/validation).
   - Rejeição de senhas vazias ou truncadas.
   - Nenhuma senha em texto puro é jamais gravada em log ou persistida em banco de dados.
3. **Normalização de E-mail:**
   - O e-mail do usuário é sempre higienizado com .trim().toLowerCase() antes de qualquer operação de cadastro, busca ou login, garantindo identidade unívoca.
4. **Mitigação de Timing Attacks (Dummy Verification):**
   - Ao receber credenciais com um e-mail inexistente no banco de dados, o sistema executa um hash/verificação fictício (erifyDummy) contra um hash sintético estático do Argon2id.
   - Isso garante tempo de processamento estatisticamente indistinguível entre e-mails existentes e inexistentes, impedindo a enumeração de contas via latência de resposta.
   - A resposta de erro para senha incorreta ou usuário inexistente é idêntica: status 401 com código AUTH.INVALID_CREDENTIALS e mensagem "Invalid credentials.".

## Consequências

- **Positivas:**
  - Nível de segurança criptográfica em conformidade com as recomendações OWASP e NIST.
  - Proteção robusta contra enumeração de contas e ataques por temporização.
- **Negativas / Mitigações:**
  - Custo computacional elevado por hash do Argon2id, mitigado por rate limiting nas rotas de autenticação (@nestjs/throttler).
