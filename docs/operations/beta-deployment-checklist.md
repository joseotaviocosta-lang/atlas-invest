# Project Atlas — Beta Deployment Checklist & Runbook

Este documento orienta os operadores e desenvolvedores na execução segura do primeiro deployment do Project Atlas em ambiente de homologação ou Beta Externo.

---

## 1. Fase Pré-Deploy (Pre-Flight)

- [ ] **1.1. Provisionamento de Infraestrutura**
  - Instância PostgreSQL gerenciada provisionada ($\ge 16$).
  - Servidor / Container runtime provisionado para `apps/api` e `apps/web`.
  - Certificado SSL/TLS configurado no proxy de borda (Cloudflare / Caddy / Nginx) apontando para o domínio público.
- [ ] **1.2. Configuração de Variáveis de Ambiente e Segredos**
  - [ ] `DATABASE_URL` aponta para a base gerenciada com `sslmode=require`.
  - [ ] `JWT_ACCESS_SECRET` gerado com $\ge 32$ caracteres criptograficamente aleatórios.
  - [ ] `REFRESH_TOKEN_PEPPER` gerado com $\ge 32$ caracteres criptograficamente aleatórios.
  - [ ] `PASSWORD_RESET_PEPPER` gerado com $\ge 32$ caracteres criptograficamente aleatórios.
  - [ ] `ALLOWED_ORIGINS` configurado estritamente com o FQDN público da Web (ex: `https://app.atlasinvest.com.br`).
  - [ ] `NEXT_PUBLIC_APP_URL` configurado na Web correspondendo ao FQDN público.
  - [ ] `BRAPI_API_KEY` configurado com chave válida de produção.
  - [ ] `OPENAI_API_KEY` configurado com chave válida de produção (se módulo de IA estiver ativo).
  - [ ] `ALLOW_PUBLIC_REGISTRATION=false` (para beta fechado por convite) ou `true` (apenas se autorizado).
  - [ ] `NODE_ENV=production` configurado em todos os serviços.

---

## 2. Fase de Migração e Banco de Dados (Database Rollout)

- [ ] **2.1. Snapshot Pré-Migração**
  - Executar dump ou snapshot gerenciado do banco antes de qualquer aplicação de DDL:
    ```bash
    pnpm db:backup
    ```
- [ ] **2.2. Execução Idempotente de Migrations**
  - Aplicar as 45 migrações rastreadas no Git:
    ```bash
    pnpm db:migrate
    ```
- [ ] **2.3. Verificação de Integridade das Migrações**
  - Confirmar que exatamente 45 migrações foram aplicadas com sucesso:
    ```sql
    SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;
    -- Esperado: 45
    ```

---

## 3. Fase de Inicialização e Rollout das Aplicações (Application Rollout)

- [ ] **3.1. Build dos Artefatos de Produção**
  - Compilar API e Web:
    ```bash
    pnpm --filter @atlas/api build
    pnpm --filter @atlas/web build
    ```
- [ ] **3.2. Startup com Fail-Fast**
  - Iniciar a API:
    ```bash
    pnpm --filter @atlas/api start
    ```
  - Verificar se a aplicação iniciou sem disparar exceções de `validateProductionSecrets()`.
- [ ] **3.3. Iniciar a Web**
  - Iniciar o servidor Next.js:
    ```bash
    pnpm --filter @atlas/web start
    ```

---

## 4. Fase de Validação e Smoke Tests (Post-Deploy Smoke)

- [ ] **4.1. Liveness Probe**
  - Fazer requisição a `GET /health`.
  - Resposta esperada: `200 OK` com `status: "ok"` e tempo de uptime.
- [ ] **4.2. Readiness Probe**
  - Fazer requisição a `GET /ready`.
  - Resposta esperada: `200 OK` com `status: "ready"`, `database: "connected"`, e `migrations: { count: 45, status: "up_to_date" }`.
- [ ] **4.3. Teste de Autenticação e Registro**
  - Criar um usuário de teste beta via navegador ou API.
  - Confirmar redirecionamento automático para Onboarding (`/onboarding`).
  - Criar a primeira carteira.
  - Confirmar transição para `/today`.
- [ ] **4.4. Teste do Centro de Privacidade**
  - Acessar `/profile/privacy`.
  - Executar o download da exportação JSON de dados.
  - Verificar se o arquivo JSON foi gerado sem erros e com dados do usuário sanitizados.
- [ ] **4.5. Teste de Navegação Mobile (390px)**
  - Testar a interface em tela reduzida (390px) no navegador para verificar responsividade e ausência de travamentos.

---

## 5. Fase de Rollback de Emergência

Caso ocorra falha impeditiva no post-deploy:

1. **Parada dos Serviços:**
   - Parar containers de API e Web para interromper tráfego de novos dados.
2. **Restauração da Base:**
   - Restaurar o dump pré-migração gerado no passo 2.1 utilizando o procedimento documentado em `docs/operations/database-backup-recovery.md`.
3. **Reconciliação LGPD:**
   - Executar o checklist de reconciliação pós-restauração (`POST_RESTORE_PRIVACY_RECONCILIATION_GAP`) se o backup restaurado for anterior a solicitações de privacidade.
4. **Deploy da Versão Anterior do Código:**
   - Realizar o checkout do commit estável anterior e reiniciar os serviços.
