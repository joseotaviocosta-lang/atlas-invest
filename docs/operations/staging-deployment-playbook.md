# Staging Deployment Playbook (Phase 5H)

> Nenhuma implantação externa foi executada nesta fase. Este playbook é o
> procedimento autorizado para a **primeira** implantação em staging,
> quando (e somente quando) o dono aprová-la.

## 1. Pré-condições

1. Branch no commit aprovado do 5H, worktree limpa.
2. Banco Postgres 16 dedicado de staging (nunca `atlas_dev`).
3. Variáveis de ambiente de staging definidas (ver `staging-config.md`):
   `DATABASE_URL`, `NODE_ENV=staging`, `INGESTION_SCHEDULER_ENABLED=false`
   (inicial), `INGESTION_OPERATOR_USER_IDS`, provedores, URLs e segredos.
4. Conta de operador criada no banco de staging.

## 2. Build

```sh
pnpm install
pnpm build        # API (tsc) + Web (Next.js)
```

## 3. Migrations (deploy seguro, nunca dev/reset)

```sh
pnpm prisma migrate deploy
```

Esperado: 31/31 aplicadas, sem drift (`prisma migrate status` limpo).

## 4. Subir API e Web

```sh
pnpm --filter @atlas/api start
pnpm --filter @atlas/web start
```

Comandos exatos de produção seguem o `package.json` de cada app
(`start` sobre o artefato de `build`).

## 5. Verificações

1. `GET /health` → 200 (processo no ar).
2. `GET /ready` → 200 (banco acessível).
3. Login como operador na Web.
4. `GET /api/v1/admin/operations/scheduler/readiness` → `NOT_READY` com
   `SCHEDULER_DISABLED` (esperado com o flag ainda em `false`).
5. Abrir `/admin/operations`: visão geral legível, sem erros 500.

## 6. Habilitação controlada do scheduler (somente após 1–5 verdes)

1. Definir `INGESTION_SCHEDULER_ENABLED=true` e reiniciar a API.
2. `scheduler/readiness` deve responder `READY` (10 definições,
   `America/Sao_Paulo`).
3. Observar `data-status` por 24h antes de qualquer backfill amplo.

## 7. Rollback

- API/Web: voltar ao commit anterior + rebuild + restart.
- Scheduler: `INGESTION_SCHEDULER_ENABLED=false` + restart (kill switch).
- Banco: sem rollback destrutivo; correções via nova migration.
- Em outage de provedor: não trocar provedores ad hoc; aguardar e fazer
  backfill do intervalo exato pelo console (seção Backfills).

## 8. Limpeza

- Remover contas/credenciais temporárias de teste.
- Confirmar que nenhum dado de teste (`atlas_test`) foi copiado para staging.
- Registrar a janela de implantação e o responsável no relatório de
  prontidão antes de qualquer passo rumo a produção.
