# Checklist de Release: Implantação e Go-Live do Remote Owner MVP

Este documento define o roteiro obrigatório e sequencial para disponibilização do **Project Atlas** em ambiente remoto com acesso seguro e exclusivo pelo titular.

---

## Estágio 1: Verificação Pré-Deploy (Local & CI)

- [ ] **Branch e Commit Auditados:** Garantir que o branch de trabalho está limpo e no commit pretendido (`git status`).
- [ ] **Quality Gates Verificados:**
  - `pnpm lint` — Zero erros ou warnings bloqueantes.
  - `pnpm format:check` — Estilo Prettier 100% consistente.
  - `pnpm typecheck` — TypeScript strict sem exceções.
  - `pnpm build` — Build de todos os pacotes e aplicações (`api`, `web`, `domain`, `ui`, `database`, engines).
  - `pnpm test:api` e `pnpm test:auth` — Todos os testes de segurança e API passando.
- [ ] **Variáveis de Ambiente Auditadas:**
  - Segredos com comprimento mínimo de 32 caracteres (`JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `PASSWORD_RESET_PEPPER`).
  - `NODE_ENV=production`.
  - `ALLOW_PUBLIC_REGISTRATION=false` configurado no backend.
  - `ALLOWED_ORIGINS` configurado estritamente para o domínio da aplicação web.
  - URLs de BFF e API devidamente alinhadas (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `API_BASE_URL`).

---

## Estágio 2: Banco de Dados e Migrations

- [ ] **Backup Pré-Deploy Realizado:** Snapshot completo do banco caso já exista estado anterior.
- [ ] **Execução de Migrations:**
  - Executar estritamente `pnpm db:migrate` (que invoca `prisma migrate deploy`).
  - **PROIBIDO** executar `prisma migrate dev` ou `prisma db push` no ambiente de produção/remoto.
  - **PROIBIDO** executar `pnpm db:seed` em produção.

---

## Estágio 3: Inicialização e Verificação de Serviços

- [ ] **Inicialização da API (`atlas-api`):** Iniciar processo via container ou systemd.
- [ ] **Liveness Probe:**
  ```bash
  curl -s http://localhost:3001/health
  # Esperado: 200 OK com {"status":"ok","service":"atlas-api","version":"...","commitSha":"..."}
  ```
- [ ] **Readiness Probe:**
  ```bash
  curl -s http://localhost:3001/ready
  # Esperado: 200 OK com {"status":"ok","database":"connected",...}
  ```
- [ ] **Inicialização da Web (`atlas-web`):** Iniciar Next.js em produção (`pnpm --filter @atlas/web start`).

---

## Estágio 4: Provisionamento do Titular (Bootstrap)

- [ ] Se a base remota for nova, criar o usuário do titular via CLI administrativo:
  ```bash
  pnpm bootstrap:owner --email titular@exemplo.com --password "SUA_SENHA_SEGURA" --name "Investidor Titular"
  ```
- [ ] Confirmar que o comando exibiu `[BOOTSTRAP] Owner user created successfully` com código de saída 0.

---

## Estágio 5: Hardening de Rede e Segurança

- [ ] **HTTPS e Certificado TLS:** Certificado válido e sem alertas de segurança no navegador.
- [ ] **Cabeçalhos de Segurança (HTTP Security Headers):**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] **Cookies Seguros:**
  - `atlas_refresh`: `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`.
  - `atlas_logged_in`: `SameSite=Lax`, `Secure`, `Path=/`.
- [ ] **Tentativa de Registro Público Bloqueada:**
  - Tentar enviar `POST /api/v1/auth/register` sem credenciais autorizadas.
  - Deve retornar `403 Forbidden` (`AUTH.REGISTRATION_DISABLED`).

---

## Estágio 6: Smoke Test Remoto

- [ ] Executar o protocolo completo descrito em [`remote-owner-smoke-test.md`](file:///c:/Projetos/atlas-invest/docs/operations/remote-owner-smoke-test.md).

---

## Estágio 7: Plano de Rollback e Contingência

Em caso de falha crítica durante ou imediatamente após o deploy:

1. **Reverter Tráfego:** Apontar o proxy reverso para o release/container anterior.
2. **Restaurar Banco de Dados (se migration incompatível tiver ocorrido):**
   ```bash
   pg_restore --clean --if-exists -d "$DATABASE_URL" "/var/backups/atlas/pre_deploy_snapshot.dump"
   ```
3. **Reiniciar Aplicações:** Reiniciar serviços na versão anterior estável.
4. **Verificar Integridade:** Confirmar que `/health` e `/ready` voltam a responder 200 OK.
