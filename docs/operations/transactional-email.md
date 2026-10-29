# Project Atlas — Transactional Email Operations & Architecture

Este documento descreve a arquitetura, operação e diretrizes de configuração do subsistema de e-mails transacionais do Project Atlas, implementado na **Fase 6D**.

---

## 1. Visão Geral da Arquitetura

O sistema adota uma arquitetura em camadas desacoplada e estritamente neutra em relação a provedores:

```text
[ ForgotPasswordUseCase ]
          │
          ▼
[ ProductionPasswordResetNotifier ] ── Renders pt-BR templates & secure URLs
          │
          ▼
[ TransactionalEmailSender ] ────────── Provider-Neutral Interface
   ├── ResendEmailSender     (REST API via fetch nativo com timeout de 10s)
   ├── SmtpEmailSender       (Gateway SMTP corporativo padrão)
   ├── ConsoleEmailSender    (Apenas desenvolvimento local / sanitizado)
   └── InMemoryEmailNotifier (Apenas ambiente de testes automatizados)
```

---

## 2. Invariantes Inegociáveis de Segurança

1. **PROIBIDO Fallback em Memória em Produção:**
   - Quando `NODE_ENV === 'production'`, o uso de `InMemoryPasswordResetNotifier` dispara compulsoriamente uma exceção fatal de inicialização (`fail-fast`).
   - A API não inicializa se um provedor real (`RESEND` ou `SMTP`) não estiver adequadamente configurado com credenciais válidas.
2. **Proteção Anti-Enumeração de Contas:**
   - A rota `POST /api/v1/auth/forgot-password` responde invariavelmente com `{ "accepted": true }`, independente de o e-mail existir na base de dados.
3. **Higienização Estrita de Logs (Zero Token Leaks):**
   - Segredos, senhas e tokens de redefinição de acesso **NUNCA** são registrados em logs estruturados ou no console do servidor.
   - Falhas no envio registram apenas metadados técnicos (destinatário anonimizável, código de erro HTTP e provedor utilizado).
4. **Proteção Contra Força Bruta:**
   - Rate limiting estrito de 5 requisições por minuto por IP gerenciado pelo `ThrottlerGuard` na API.
5. **Expiração e Uso Único:**
   - O token gerado expira em exatamente 15 minutos e é invalidado imediatamente após o uso. A conclusão de `reset-password` revoga compulsoriamente todas as sessões ativas do investidor no banco de dados.

---

## 3. Matriz de Variáveis de Ambiente

| Variável | Obrigatória em Prod? | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `EMAIL_PROVIDER` | **Sim** | Provedor transacional selecionado (`RESEND` ou `SMTP`). | `RESEND` |
| `RESEND_API_KEY` | Condicional | Chave de API da Resend (exigida se `EMAIL_PROVIDER=RESEND`). | `re_live_...` |
| `SMTP_HOST` | Condicional | Host do servidor SMTP (exigido se `EMAIL_PROVIDER=SMTP`). | `smtp.provedor.com` |
| `SMTP_PORT` | Opcional | Porta do servidor SMTP (padrão: 587). | `587` |
| `SMTP_USER` | Opcional | Usuário para autenticação SMTP. | `apikey` |
| `SMTP_PASS` | Opcional | Senha para autenticação SMTP. | `sua-senha-secreta` |
| `SMTP_SECURE` | Opcional | Define conexão TLS explícita (`true` ou `false`). | `false` |
| `EMAIL_FROM` | **Sim** | Remetente autorizado com domínio verificado. | `Atlas Invest <no-reply@atlasinvest.com.br>` |
| `NEXT_PUBLIC_APP_URL` | **Sim** | URL base canônica pública para o link de redefinição. | `https://app.atlasinvest.com.br` |

---

## 4. Instruções de Configuração para o Operador / Owner

### Opção A: Configuração via Resend (Recomendada para Beta)
1. Crie uma conta em [resend.com](https://resend.com) e adicione o domínio do projeto (ex: `atlasinvest.com.br`).
2. Configure os registros DNS (SPF, DKIM e DMARC) no painel do registrador do domínio.
3. Gere uma API Key com escopo de envio de e-mails.
4. Adicione as variáveis ao ambiente de produção:
   ```bash
   EMAIL_PROVIDER=RESEND
   RESEND_API_KEY=re_123456789...
   EMAIL_FROM=Atlas Invest <no-reply@atlasinvest.com.br>
   NEXT_PUBLIC_APP_URL=https://app.atlasinvest.com.br
   ```

### Opção B: Configuração via Servidor SMTP Corporativo
1. Obtenha as credenciais do relay SMTP seguro da infraestrutura da organização.
2. Adicione as variáveis ao ambiente de produção:
   ```bash
   EMAIL_PROVIDER=SMTP
   SMTP_HOST=smtp.provedor.com.br
   SMTP_PORT=587
   SMTP_USER=usuario_smtp
   SMTP_PASS=senha_smtp
   EMAIL_FROM=Atlas Invest <no-reply@atlasinvest.com.br>
   NEXT_PUBLIC_APP_URL=https://app.atlasinvest.com.br
   ```

