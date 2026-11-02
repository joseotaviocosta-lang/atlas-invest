# Post-CTI Roadmap — Reassessment & Next Phase Decision

Audit + priorização pós-CTI v1. Somente docs (sem implementação, sem migração,
sem toque em motores). Branch `feature/phase-4l1-contextual-tax-intelligence-foundation`.

## 1. Estado verificado do programa

B3 baseline intacto: ledger 137, replay 109/109, reconciliação 38/40 (95%),
41 posições, 2 contas; blockers EGIE3/ITSA4/SNEL congelados por falta de
evidência externa (proibido reconstruir sem prova). Cost workflow fechado
(KCRE11 300/300 documental, canônico INCOMPLETE, sem enriquecimento).
Reminders fechados e validados (Alertas 13, feed 17, sem spam). CTI v1 fechado
(CTI-1 API determinística + CTI-2 painel + CTI-3 deep-link + 2 hotfixes UX);
CTI-4 = DEFERRED por ADR-311 (lei `UNSUPPORTED_TAX` congelada). Migrations 48;
dívida conhecida: drift de checksum na migration 47.

## 2. Mapa de capacidades (re-auditado)

| Capacidade | Estado | Evidência |
|---|---|---|
| Portfolio (replay/posições) | COMPLETE | 109/109 determinístico, time-travel, 41 posições |
| Imports / B3 movimentação | COMPLETE | pipeline B3 real via upload; simulado determinístico |
| B3 sync real | BLOCKED (externo) | transporte pronto, `ENGINEERING_READY_FOR_CERT` + `CERT_ACCESS_BLOCKED`; sem credenciais/onboarding não há chamada viva construível |
| Reconciliação | PARTIAL | 38/40 real; 3 blockers sem evidência externa |
| Cost basis | PARTIAL | workflow validado; 36/41 posições sem caminho para o fisco |
| Tax engine | PARTIAL | calcula (FII 20%, equity 15/20, 6015, anual, alta renda) mas faminto de dados: custo desconhecido, instituição ausente, IRRF não-confirmado e regra não-verificada bloqueiam fail-closed |
| Notifications/reminders | COMPLETE | feed derivado + 4K.3 compliance; só IN_APP |
| CTI | COMPLETE (v1) | API + painel + deep-link; LLM diferido por lei |
| Market intelligence | FOUNDATION_ONLY | cotações/watchlist reais; news/intel sem provider vivo, mobile market placeholder |
| AI (geral) | PARTIAL | portfólio/ativo/timeline ok; fiscal recusado por lei |
| Mobile | PARTIAL | portfólio/fiscal leitura ok; market placeholder; sem push; sem privacy center (backend já serve) |
| Reliability/observability | PARTIAL | logger PII-scrubbed, probes, runbooks; **sem telemetria externa/alerta (P1 blocker p/ beta externo, doc 6C)** |
| Legal/LGPD | PARTIAL | engenharia completa (consents, DSR, export, deactivation); **aguarda counsel: controladoria, DPO, bases, DPAs, watermark** |
| Release readiness | BLOCKED (externo) | sem veículo de release (regra NO DEPLOY); beta exige telemetria + legal + higiene de migrations |

## 3. Lacunas restantes (separadas)

- **USER VALUE GAP:** custo verificado não alimenta o fisco (36/41 posições travam DARF/IRPF); market mobile placeholder; sem push.
- **RELEASE GAP:** telemetria externa (P1 doc), counsel LGPD, higiene de migrations — todos pré-prod, nenhum com veículo atual.
- **OPERABILITY GAP:** `.next` envenenado por build-concorrente (mitigado por runbook, sem defeito de código).
- **EVIDENCE GAP:** EGIE3/ITSA4/SNEL (externo); IRRF/FII-eligibility não confirmados.
- **TECH DEBT:** drift 47 (forense abaixo); suítes congeladas 18–23 migrations (falham por desenho); version pins; throttle flakes.

## 4. Forense migration 47 (somente leitura)

Prova: migration 47 atual já cria `UNIQUE(portfolio_id,fingerprint,version)`,
mas a 48 (compensação idempotente `DROP IF EXISTS` + `DO ... IF NOT EXISTS`)
só existe porque uma revisão anterior da 47 criou `UNIQUE(portfolio_id,
fingerprint)` e foi aplicada antes da edição — checksum divergente em DBs que
viram os bytes antigos. Estado final = intent do schema (menos `DEFAULT 1` em
`version`, desvio não-semântico) + comentário obsoleto no repository.
**Fresh `migrate deploy` 0→48 foi provado funcional em probe efêmero na fase
de custo** (48 vira no-op determinístico). Classificação: **PRE-RELEASE
REQUIRED, não BLOCKER hoje** — janela aberta (sem prod); após primeiro write
prod, reescrever história vira BLOCKER. Remediação futura: squash 47+48 em 47
canônica única + evidência efêmera 0→48 + `status`/`diff` limpos + fix do
`DEFAULT`/comentário. **Nada disso nesta fase.**

## 5. Cost → tax: o unlock central (PART C/U)

Estado: evidência VERIFIED pode zerar quantidade descoberta, mas o custo
canônico segue INCOMPLETE e o fisco faminto. Equivalência é desenhável com
segurança **via ADR primeiro**: critérios tax-grade (só VERIFIED; data de
aquisição exata obrigatória — já é campo obrigatório na v1; mesma moeda; sem
sobreposição; auditoria por fingerprint no trace); Widerspruch resolvido por
matching explícito lote↔perna fiscal (nunca síntese de eventos no ledger —
o motor tributário consultaria lotes verificados como fallback de custo com
proveniência, ledger intacto); parcial/duplicado/redundante mantém BLOCKED;
revogação/supersessão reabre via nova revisão (cadeia já existe). Fail-closed
preservado por construção. Valor: **o maior do programa** (destrava DARF/IRPF
reais); esforço M; risco médio-alto contido (derivação read-only).

## 6. Candidatos e escore (1–5)

| Candidato | Valor | Unlock | RiskRed. | Leverage | Evidence | Depend. | Esforço | Release |
|---|---|---|---|---|---|---|---|---|
| A. Equivalência custo→tax (via ADR) | 5 | 5 | 4 | 5 | 5 | 1 | 3 | 5 |
| B. Higiene de migrations | 2 | 2 | 5 | 2 | 5 | 1 | 2 | 5 |
| C. Delivery externo (email/push) | 3 | 2 | 2 | 2 | 3 | 4 | 3 | 2 |
| D. Release hardening (telemetria) | 2 | 3 | 5 | 3 | 4 | 2 | 3 | 5 |
| E. Market intelligence | 2 | 1 | 1 | 2 | 2 | 4 | 4 | 2 |
| F. Paridade mobile | 3 | 2 | 2 | 2 | 4 | 1 | 4 | 3 |
| G. B3 real | 2 | 4 | 1 | 1 | 2 | 5 | 5 | 1 |

Rejeições duras: G (externamente bloqueado — sem CERT/onboarding/autorização
5P, zero chamada viva construível); E (sem provider vivo, valor secundário
ao núcleo fiscal); C (dependências externas + privacidade + ruído, sem pedir
do usuário); F (uso real é web; market/privacy mobile não bloqueiam leitura);
D (sem veículo de release, vira prioridade quando beta for agendado);
B (janela aberta, sem prod — agendar pré-release, não agora).

## 7. Decisão

**NEXT_IMPLEMENTATION_PHASE = COST EVIDENCE TAX EQUIVALENCE ADR** (design-only,
mesmo formato desta fase; NENHUMA implementação de motor).
- Meta: responder as 10 perguntas (tax-grade, matching de lotes, limites de
  quantidade, data, moeda, revisões, supersessão, duplicados, proveniência no
  trace, rollback) com invariantes fail-closed.
- Resultado visível: ADR + contrato de equivalência + matriz de testes.
- Non-goals: código de motor, migração, ledger, LLM, DIRPF/DARF oficial.
- Riscos: complexidade de matching fiscal; mitigado por design fechado antes.
- Esforço: S (docs). Migração: 48→48. Validação: revisão do Owner (sem dados).
- Cleanup gate: **NÃO REQUERIDO** (drift não bloqueia design; dívida de testes
  falha identicamente no baseline; branch com 9 commits locais coeso e temático).

## 8. Congelamentos e invariantes

CTI v1 COMPLETE; CTI-4 DEFERRED (sem reabertura sem evidência). Próximas fases
preservam: ledger 137, replay 109/109, 38/40, KCRE11 300/100%/INCOMPLETE,
fail-closed fiscal, blockers intactos, migrations 48.
`MIGRATION_HISTORY_HYGIENE_REQUIRED_BEFORE_PRODUCTION` mantido.
