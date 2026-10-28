# Runbook Operacional: Gestão e Triagem de Incidentes (Fase 6A)

Este documento define a taxonomia de severidade, os fluxos de triagem e os procedimentos de contingência técnica para incidentes operacionais no **Project Atlas**.

---

## 1. Classificação de Severidade de Incidentes

| Nível | Definição | Critérios Exemplares | SLA de Resposta |
|---|---|---|---|
| **SEV-1 (Crítico)** | Indisponibilidade total do sistema ou risco iminente de corrupção de dados | - API retornando 503 no `/ready`<br>- PostgreSQL inalcançável<br>- Invariante de integridade do ledger rompida | Imediato (< 15 min) |
| **SEV-2 (Alto)** | Degradação severa de funcionalidade primária sem perda de dados | - Todos os provedores de mercado indisponíveis (`status: degraded`)<br>- Spike de erros 5xx > 5% no `/metrics`<br>- Pipeline de importação de notas travado | < 1 hora |
| **SEV-3 (Médio)** | Degradação pontual ou falha de serviço auxiliar com fallback ativo | - Provedor de IA lento ou com timeout<br>- Job de atualização cadastral com retry esgotado<br>- P95 de queries de banco > 500ms | < 4 horas |
| **SEV-4 (Baixo)** | Anomalia menor, erro estético ou alerta de baixa criticidade | - Alerta de log mascarado isolado<br>- Discrepância cosmética de label em ambiente desktop | Próximo ciclo regular |

---

## 2. Fluxo Canônico de Triagem Rápida

Quando um alerta disparar ou um investidor reportar problema, seguir esta ordem estrita:

```text
[1. GET /health] ──► O processo Node.js/NestJS está vivo?
       │
       ├── NÃO ──► REINICIAR SERVIÇO / INSPECIONAR OUT OF MEMORY (OOM)
       │
       └── SIM ──► [2. GET /ready] ──► Banco conectado e 44 migrations ok?
                      │
                      ├── NÃO (503) ──► VERIFICAR POSTGRES / POOL DE CONEXÕES
                      │
                      └── SIM (200) ──► [3. GET /ready?telemetry=true] ou [GET /metrics]
                                           │
                                           ├── status: 'degraded' ──► PROVEDOR EXTERNO FALHANDO
                                           │
                                           └── status: 'ok' ──► INSPECIONAR REQUEST ID NOS LOGS
```

### 2.1 Inspeção de Telemetria sem Vendor Lock-in
A API expõe o estado agregado em memória via:
```bash
curl http://localhost:3001/metrics
```
Permite verificar imediatamente:
- `requests.errorRate`: percentual de chamadas 5xx.
- `database.avgLatencyMs` e `database.p95LatencyMs`: lentidão no PostgreSQL.
- `providers`: taxa de sucesso de cada provedor externo (HG Brasil, Brapi, BCB, Gemini).
- `retries`: contagem de retentativas esgotadas.

### 2.2 Rastreamento por `x-request-id`
Todo erro técnico registrado nos logs do `@atlas/logger` contém o identificador correlacionado `requestId`.
Para rastrear a causa raiz de um erro retornado ao usuário:
```bash
grep "requestId\":\"<UUID>" /var/log/atlas/api.log
```
*Lembrete: Os logs são estritamente sanitizados e nunca contêm senhas, saldos, CPFs ou payloads brutos.*

---

## 3. Procedimentos por Cenário de Falha

### Cenário A: PostgreSQL Inacessível (SEV-1)
**Sintoma:** `/ready` responde `503 Service Unavailable` com `database: 'disconnected'`.
1. **Verificar processo e contêiner:**
   ```bash
   docker ps | grep atlas_postgres
   ```
2. **Checar uso de conexões:**
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
   *Se o limite de conexões (`max_connections`) estiver esgotado, inspecionar vazamento de PrismaClient ou pools órfãos.*
3. **Reiniciar o serviço PostgreSQL se o processo estiver congelado:**
   ```bash
   docker restart atlas_postgres
   ```
4. **Verificar se a base recupera o estado `connected` no `/ready`:**
   ```bash
   curl http://localhost:3001/ready
   ```

---

### Cenário B: Provedores Externos Indisponíveis (SEV-2)
**Sintoma:** `/ready` responde `200 OK` com `status: 'degraded'`.
1. **Consultar o breakdown no `/ready?telemetry=true`:**
   Inspecionar o bloco `providers` para identificar se é BRAPI, HG Brasil, BCB ou Gemini.
2. **Estratégia de Sobrevivência:**
   - O Atlas opera em modo **Degradação Graciosa**:
     - Cotações históricas em cache continuam servindo consultas patrimoniais.
     - Operações de importação são enfileiradas para reprocessamento.
     - Módulo de IA entra em modo fallback com mensagem factual explicativa.
3. **Ação:** Monitorar taxa de erros; se o provedor continuar indisponível por > 2 horas, acionar fallback manual de chaves ou chaveamento para provedor secundário.

---

### Cenário C: Job de Importação ou Conciliação Travado (SEV-2)
**Sintoma:** Transações de importação ficam em status pendente sem avanço.
1. **Inspecionar a tabela de runs de integração:**
   ```sql
   SELECT id, status, started_at FROM integration_runs WHERE status = 'IN_PROGRESS';
   ```
2. **Verificar se há lock órfão:**
   Se um run estiver `IN_PROGRESS` há mais de 30 minutos sem batimento cardíaco, marcar como `FAILED` com motivo `TIMEOUT_ORPHANED_RUN`.
3. **Instruir o investidor via Review Inbox** a acionar o botão "Tentar Novamente" (`POST /api/v1/imports/:id/retry`).

---

## 4. Política de Rollback e Segurança de Deploy

1. **Deploy Seguro e Invariante de Migrations:**
   - O schema do banco possui exatamente **44 migrations**.
   - Novas migrations devem ser exclusivamente **expand-and-contract** (aditivas primeiro, sem remoção destrutiva imediata de colunas).
2. **Rollback de Aplicação:**
   - Se um novo build de API ou Web apresentar instabilidade, realizar rollback imediato da imagem/contêiner para a versão anterior (`COMMIT_SHA` prévio).
3. **Rollback de Banco de Dados:**
   - **PROIBIDO** executar `prisma migrate reset` ou comandos destrutivos em bases ativas.
   - Caso uma migration falhe durante a aplicação, aplicar correção via migration de compensação ou restaurar a partir do snapshot pré-deploy verificado via `pnpm db:restore:verify`.

