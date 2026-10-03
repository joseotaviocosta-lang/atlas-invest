# Contrato de Suporte à Declaração e Reporte Fiscal Anual (DIRPF) — v1

## 1. Visão Geral e Propósito

Este contrato define a especificação canônica da camada de **Suporte e Preparação da Declaração de Ajuste Anual do IRPF** (`AnnualTaxReportingPackage`).

A camada de reporte anual do Atlas atua como ponte interpretativa e estruturada entre os dados fiscais apurados (Fases 4A a 4H.5) e o preenchimento ou conferência humana da Declaração de Imposto sobre a Renda da Pessoa Física (DIRPF / PGD IRPF).

---

## 2. Invariantes Rígidos e Limites de Escopo

1. **NÃO TRANSMISSÃO / NÃO INTEGRAÇÃO OFICIAL RFB:**
   - O Atlas **NÃO** realiza transmissão de DIRPF, envio direto de arquivos à Receita Federal, automação de login via gov.br/e-CAC, nem resolução de CAPTCHAs.
   - O documento gerado é estritamente **informativo de suporte** ao contribuinte e seu contador.
2. **DISCLAIMER COMPULSÓRIO:**
   - Todo pacote emitido contém obrigatoriamente a declaração `disclaimer` oficial:
     > _"DOCUMENTO DE SUPORTE À DECLARAÇÃO IRPF — NÃO TRANSMISSÍVEL. Este relatório é um documento estruturado para auxílio ao contribuinte no preenchimento ou conferência da DIRPF. O Atlas não realiza transmissão à Receita Federal e não substitui os informes oficiais."_
3. **READINESS-GATED / FAIL-CLOSED (BLOQUEIO EXPLÍCITO):**
   - Itens originados de subsistemas com status `BLOCKED` ou `REQUIRES_CONFIRMATION` no motor de Prontidão (4H.5) são marcados compulsoriamente como `isBlocked: true` e contêm a lista de `blockingReasons`.
   - **PROIBIDO mascarar itens bloqueados como zero (`0.00`) ou omiti-los silenciosamente.**
4. **POLÍTICA DE STATUS PROVISÓRIO (REFORMA 2026+):**
   - Regras fiscais decorrentes de reformas com layouts de declaração futuros ainda não publicados pela Receita Federal (ex.: retenção exclusiva na fonte de dividendos sob a Lei 15.270/2025 para 2026+) são categorizadas compulsoriamente com `mappingStatus: 'PROVISIONAL'`.
5. **POSIÇÕES ALIENADAS NO ANO-CALENDÁRIO:**
   - Ativos com custo positivo em 31/12/(Ano-1) e alienados integralmente no ano-calendário (quantidade zero em 31/12/Ano) são reportados na ficha de _Bens e Direitos_ sob a regra `POSICAO_ALIENADA_BENS_E_DIREITOS`, contendo `closingQuantity: "0"` e `closingTotalCost: "0.00"`.
6. **ZERO FLOAT / DECIMAIS PURAS:**
   - Todos os valores monetários e quantidades são manipulados e serializados exclusivamente como strings decimais canônicas (`"1234.56"`).

---

## 3. Fichas e Categorias Canônicas de Declaração

O Atlas organiza os dados em 5 fichas estruturadas:

| Ficha (`section`)        | Descrição e Foco                                | Códigos PGD Canônicos                                                                                                                                 |
| :----------------------- | :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BENS_E_DIREITOS`        | Patrimônio em 31/12 do ano-base e ano anterior. | Grupo 03 / Código 01 (Ações)<br>Grupo 07 / Código 03 (FII/FIAGRO)                                                                                     |
| `RENDIMENTOS_ISENTOS`    | Lucros e rendimentos não tributáveis.           | Código 09 (Dividendos isentos / transição pré-2026)<br>Código 20 (Ganhos líquidos ações até R$ 20k/mês)<br>Código 26 (Rendimentos FII/FIAGRO isentos) |
| `RENDIMENTOS_EXCLUSIVOS` | Tributação definitiva na fonte.                 | Código 10 (Juros sobre Capital Próprio - JCP)<br>Código PROV_DIV_EXCLUSIVO (Dividendos tributáveis 2026+)                                             |
| `RENDA_VARIAVEL`         | Apuração de operações comuns e day trade.       | Ficha Renda Variável — Operações Comuns / Day Trade por mês civil                                                                                     |
| `IMPOSTO_PAGO_RETIDO`    | Retenções na fonte e recolhimentos DARF.        | Código IRRF_FONTE (IRRF Day Trade 1% e Normal 0,005%)<br>Código DARF_6015 (Recolhimentos mensais de DARF)                                             |

---

## 4. Endpoints da API

### `GET /api/v1/fiscal/annual/:calendarYear/reporting`

- **Autenticação:** Bearer JWT obrigatório (taxSubjectId derivado do principal autenticado).
- **Parâmetros:**
  - `calendarYear`: Ano civil econômico (ex.: `2025`).
- **Resposta 200 OK:**
  ```json
  {
    "data": {
      "calendarYear": 2025,
      "declarationExercise": 2026,
      "readinessStatus": "READY",
      "overallReportingStatus": "READY",
      "isFullyReady": true,
      "disclaimer": "DOCUMENTO DE SUPORTE À DECLARAÇÃO IRPF...",
      "sections": [
        {
          "section": "BENS_E_DIREITOS",
          "title": "Bens e Direitos",
          "status": "READY",
          "itemCount": 2,
          "blockedCount": 0,
          "isReadyToReport": true,
          "notes": ["Grupo 03/01: Ações...", "Grupo 07/03: FII..."]
        }
      ],
      "items": [
        {
          "itemId": "BD-PETR4-2025",
          "section": "BENS_E_DIREITOS",
          "categoryCode": "03-01",
          "categoryLabel": "Ações (inclusive as listadas em bolsa)",
          "sourceSubsystem": "ANNUAL_POSITIONS",
          "isBlocked": false,
          "blockingReasons": [],
          "mappingStatus": "OFFICIAL",
          "fieldValues": {
            "assetTicker": "PETR4",
            "assetName": "PETROLEO BRASILEIRO S.A. PETROBRAS",
            "closingQuantity": "100.000000000000000000",
            "closingTotalCost": "3450.00",
            "priorYearTotalCost": "3000.00"
          },
          "suggestedDeclarationText": "100 ações preferenciais PETR4...",
          "sourceEvidenceIds": ["asset-position-PETR4"],
          "sourceTrace": {
            "originType": "ANNUAL_POSITION",
            "entityId": "PETR4",
            "referenceYear": 2025,
            "description": "Posição patrimonial de PETR4 apurada em 31/12/2025"
          }
        }
      ],
      "blockingReasons": [],
      "generatedAt": "2026-10-03T17:00:00.000Z",
      "fingerprint": "a1b2c3d4..."
    }
  }
  ```
