# PROJECT ATLAS — APP-16B: MACRO DATA COMPLETENESS VALIDATION REPORT

**Runtime:** `DESKTOP_LOCAL_OWNER`  
**Database:** `atlas_local` (Porta 5434)  
**Data:** 09/11/2026  
**Status Oficial:** `APP_16B_MACRO_DATA_COMPLETE_IBOVESPA_PENDING`  

---

## 1. RESUMO EXECUTIVO

A fase **APP-16B** implementou e validou a sincronização determinística, resiliente e auditável de indicadores macroeconômicos oficiais no Project Atlas Desktop, substituindo os estados prévios não inicializados por dados reais de fontes primárias do governo e Banco Central.

### Indicadores Homologados:
1. **SELIC META:** Sincronizada do Banco Central do Brasil / Copom via SGS 432.
2. **SELIC EFETIVA:** Sincronizada do Banco Central do Brasil via SGS 1178 (taxa anualizada base 252).
3. **IPCA (MENSAL):** Sincronizada da série oficial do IBGE espelhada pelo Bacen via SGS 433.
4. **DÓLAR (PTAX):** Sincronizada do Banco Central do Brasil via SGS 10813 (PTAX Fechamento Venda).
5. **IBOVESPA:** Classificado formalmente como `OFFICIAL_SOURCE_UNAVAILABLE` (GAP de fonte oficial B3 documentado para APP-16C; nenhum dado falso ou sintético injetado).

---

## 2. MATRIZ DE PROVEDORES E ENDPOINTS OFICIAIS

| Indicador | Fonte Primária | Provedor / Endpoint Oficial | Série / Identificador | Convenção / Unidade |
|---|---|---|---|---|
| **SELIC META** | Banco Central do Brasil / Copom | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados` | SGS 432 | % a.a. (Event-driven) |
| **SELIC EFETIVA** | Banco Central do Brasil | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados` | SGS 1178 | % a.a. base 252 (Diária útil) |
| **IPCA (MENSAL)** | IBGE (Mirror Bacen SGS) | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados` | SGS 433 | % variação mensal |
| **DÓLAR PTAX** | Banco Central do Brasil | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados` | SGS 10813 | PTAX Venda no Fechamento (R$/US$) |
| **IBOVESPA** | B3 | N/A (Sem API pública gratuita de cotação de fechamento) | N/A | Classificado: `OFFICIAL_SOURCE_UNAVAILABLE` |

---

## 3. VALORES REAIS SINCRONIZADOS EM `atlas_local`

Evidência extraída do banco de dados local após sincronização real:

| Indicador | Valor Armazenado | Valor Formatado | Data de Referência | Fonte Exibida | Freshness | Status |
|---|---|---|---|---|---|---|
| **SELIC META** | `13.75` | `13,75% a.a.` | 09/12/2026 | Banco Central / Copom | `FRESH` | `AVAILABLE` |
| **SELIC EFETIVA** | `13.65` | `13,65% a.a.` | 06/11/2026 | Banco Central (SGS) | `FRESH` | `AVAILABLE` |
| **IPCA MENSAL** | `0.82` | `0,82% no mês` | 01/09/2026 (09/2026) | IBGE | `STALE` | `AVAILABLE` |
| **DÓLAR PTAX** | `5.5007` | `R$ 5,5007` | 06/11/2026 | Banco Central (PTAX) | `FRESH` | `AVAILABLE` |
| **IBOVESPA** | `—` | `—` | — | B3 (Oficial) | — | `OFFICIAL_SOURCE_UNAVAILABLE` |

Total de registros persistidos na tabela `macro_observations`: **40 observações** (histórico dos últimos 10 pontos de cada série).

---

## 4. CONTRATOS DE API E ENDPOINTS

### `GET /api/v1/macro/context`
Retorna o sumário contextual com valores brutos e formatados, fontes primárias e estados de frescor:
```json
{
  "data": {
    "ipcaMonthly": {
      "referenceMonth": "2026-09",
      "referenceMonthFormatted": "09/2026",
      "value": "0.82%",
      "formattedValue": "0,82% no mês",
      "source": "IBGE",
      "freshness": "STALE",
      "status": "AVAILABLE"
    },
    "selicTarget": {
      "rate": "13.75% a.a.",
      "formattedValue": "13,75% a.a.",
      "effectiveDate": "2026-12-09",
      "effectiveDateFormatted": "09/12/2026",
      "source": "Banco Central / Copom",
      "freshness": "FRESH",
      "status": "AVAILABLE"
    },
    "selicEffective": {
      "rate": "13.65% a.a.",
      "formattedValue": "13,65% a.a.",
      "effectiveDate": "2026-11-06",
      "effectiveDateFormatted": "06/11/2026",
      "source": "Banco Central (SGS)",
      "freshness": "FRESH",
      "status": "AVAILABLE"
    },
    "ptax": {
      "rate": "R$ 5,5007",
      "value": "5.5007",
      "effectiveDate": "2026-11-06",
      "effectiveDateFormatted": "06/11/2026",
      "source": "Banco Central (PTAX)",
      "convention": "Venda (Fechamento PTAX)",
      "freshness": "FRESH",
      "status": "AVAILABLE"
    },
    "ibovespa": {
      "value": "—",
      "status": "OFFICIAL_SOURCE_UNAVAILABLE",
      "message": "Integração ainda não disponível",
      "source": "B3 (Oficial)"
    }
  }
}
```

### `POST /api/v1/macro/refresh`
Endpoint idempotente de ingestão sob demanda que sincroniza as séries do BCB SGS com tolerância a falhas parciais.

---

## 5. REGRAS DE FRESHNESS & RESILIÊNCIA

- **SELIC META:** Event-driven. Considerada `FRESH` até 60 dias corridos após a decisão Copom.
- **SELIC EFETIVA & PTAX:** Diárias úteis. Tolerância de até 4 dias corridos sem considerar erro ou stale prematuro para fins de semana regulares e feriados prolongados.
- **IPCA MENSAL:** Mensal. Considerado `FRESH` até 65 dias corridos (janela de divulgação pelo IBGE).
- **Idempotência:** A reexecução de sync atualiza metadados (`lastFetchedAt`, incrementa `fetchCount`) e não duplica linhas no banco (`macro_observations_series_date_source_uniq`).
- **Last-Known-Good:** Em caso de perda de conexão (offline) ou falha pontual de um serviço upstream, a aplicação preserva o último valor válido com indicação de `STALE` sem apagar os cards ou exibir zero.
- **Isolamento de Falhas:** Falha em 1 indicador (ex.: PTAX) não impede a atualização dos demais (status `PARTIAL`).

---

## 6. BACKUPS DE SEGURANÇA EXECUTADOS

- **Pré-16B:** `atlas_local_pre_16b_20261109_084113.sql` (250.663 bytes)
- **Pós-16B:** `atlas_local_post_16b_20261109_085544.sql` (259.853 bytes)

---

## 7. REGRESSÃO DE MARKET DATA

- **Cotações de Ativos (BRAPI):** Confirmadas **37 cotações** na tabela `market_quotes` com provedor `BRAPI` e data `2026-11-09`. Nenhuma regressão nas cotações de ativos já homologadas na APP-16A.
