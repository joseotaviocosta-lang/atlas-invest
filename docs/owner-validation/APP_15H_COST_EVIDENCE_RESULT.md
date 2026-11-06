# PROJECT ATLAS — APP-15H
# COST EVIDENCE RESULT & FISCAL IMPACT REPORT

- **Data de Execução:** 06/11/2026
- **Ambiente:** Desktop Windows Local (`DESKTOP_LOCAL_OWNER`)
- **Database:** `atlas_local` (PostgreSQL 18 na porta 5434)
- **Status Final:** `APP_15H_DOCUMENTARY_EVIDENCE_NOT_FOUND`

---

## 1. SITUAÇÃO FINAL DOS ATIVOS COM GAP DOCUMENTAL

| Ativo | Quantidade Original Pendente | Situação Documental Local | Status do Custo | Ação Realizada |
| :--- | :---: | :---: | :---: | :--- |
| **ITSA4** | 900 ações | `DOCUMENTARY_GAP` | `INCOMPLETE` | Nenhuma alteração no ledger. Custo mantido como incompleto. |
| **JHSF3** | 600 ações | `DOCUMENTARY_GAP` | `INCOMPLETE` | Nenhuma alteração no ledger. Custo mantido como incompleto. |
| **SAPR4** | 3.300 ações | `DOCUMENTARY_GAP` | `INCOMPLETE` | Nenhuma alteração no ledger. Custo mantido como incompleto. |

### Regra de Ouro da Integridade Financeira
- **Zero custo inventado:** Proibido o uso da cotação de fechamento de 31/12, cotação atual, valor de mercado dividido pela quantidade ou custo zero.
- **Zero transações fictícias:** Proibida a conversão de saldos não comprovados em transações `BUY` simuladas.
- **Ledger Inalterado:** As 145 transações canônicas continuam intactas no ledger append-only.

---

## 2. AUDITORIA DO MODELO DE EVIDÊNCIA (`cost_basis_evidence`)

A auditoria em `packages/domain/src/ledger/cost-evidence.ts` e `apps/api/src/application/cost-evidence/` confirmou que a arquitetura do Project Atlas já possui suporte nativo completo para absorver declarações fiscais e notas de corretagem sem mutação do ledger:

- **Tipos de Evidência Suportados:**
  - `ANNUAL_TAX_STATEMENT` (Declaração de Ajuste Anual DIRPF / Bens e Direitos)
  - `BROKERAGE_NOTE` (Nota de corretagem)
  - `BROKER_STATEMENT` (Extrato de custódia / posição da corretora)
  - `OFFICIAL_POSITION_REPORT` (Relatório oficial)
- **Atributos de Proveniência:**
  - `quantityCovered` (quantidade exata coberta pelo documento)
  - `totalCost` / `unitCost` (custo em `Money` com precisão arbitrária)
  - `acquisitionDate` / `evidenceDate` (datas econômicas civis)
  - `sourceReference` (hash SHA-256 e referência do documento)
  - `status`: ciclo de vida `DRAFT` → `REVIEW_REQUIRED` → `VERIFIED`
- **Diagnóstico Arquitetural:** **`ZERO_EVIDENCE_MODEL_GAP`**. A plataforma está 100% pronta para registrar e verificar o custo no momento em que o investidor fornecer o documento.

---

## 3. IMPACTO TRIBUTÁRIO (COMPETÊNCIA 2026-10)

Resultado da consulta oficial via API:
`GET /api/v1/portfolios/:portfolioId/tax-intelligence?competence=2026-10`

- **Status:** **`BLOCKED`**
- **Headline:** *Cálculo tributário bloqueado*
- **Bloqueadores Ativos:**
  1. `UNKNOWN_COST_BASIS`: Há posições com custo de aquisição desconhecido (`ITSA4`, `JHSF3`, `SAPR4`).
  2. `COST_DOCUMENTARY_INCOMPLETE`: Custo documental incompleto em 3 posições.
- **Rigor Tributário (*Fail-Closed*):**
  Como as vendas ocorridas em outubro de 2026 envolvem ações dessas três empresas, o motor fiscal do Atlas se recusa a emitir DARF ou apurar ganho líquido baseado em suposições. As demais funções do aplicativo continuam totalmente operacionais.

---

## 4. FONTES EXTERNAS RECOMENDADAS PARA RECUPERAÇÃO HUMANA

Para desbloquear a apuração fiscal de 2026-10 no futuro, o investidor poderá obter a comprovação através dos seguintes canais externos (fora do computador):
1. **Portal e-CAC da Receita Federal:**
   - Download da cópia da DIRPF transmitida no **Exercício 2020 (Ano-Calendário 2019)** ou anos anteriores, acessando a aba *Meu Imposto de Renda* via conta Gov.br (nível Prata ou Ouro).
   - Na ficha *Bens e Direitos*, obter a discriminação do custo declarado em 31/12/2019 para `ITSA4`, `JHSF3` e `SAPR4`.
2. **Área do Cliente da Corretora (XP Investimentos):**
   - Solicitação de segunda via das notas de corretagem históricas anteriores a novembro de 2019 diretamente pelo atendimento ou extrato histórico da conta `395072`.
3. **Arquivo Físico ou Contábil Pessoal:**
   - Cópia impressa ou informe de rendimentos emitido pela corretora em 2019/2020.

---

## 5. CONCLUSÃO E PRÓXIMA FASE

A ausência local de documentos comprobatórios pré-2019 não impede o uso diário e completo do aplicativo para a gestão patrimonial, acompanhamento de cotações, rentabilidade, histórico e novas operações.

- **Status Declarado:** **`APP_15H_DOCUMENTARY_EVIDENCE_NOT_FOUND`**
- **Próxima Fase:** **`APP-15I — OWNER DAILY USE WITH DOCUMENTARY EXCEPTIONS`**
