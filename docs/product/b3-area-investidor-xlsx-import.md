# Importação Nativa B3 XLSX — Área do Investidor

Este documento descreve o suporte nativo do Atlas para ingestão direta de planilhas Excel (`.xlsx`) oficiais exportadas da Área do Investidor da B3.

---

## 1. Visão Geral e Princípios de Segurança

A ingestão de dados da B3 no Atlas segue os princípios inegociáveis de integridade financeira:

1. **Gate Absoluto de Confirmação:** O upload e a análise prévia do arquivo geram estritamente `ledger delta = 0`. Nenhuma transação financeira é criada ou modificada antes da confirmação explícita do usuário.
2. **Zero Floats:** Todos os valores monetários (`Money`), quantidades (`Quantity`) e preços unitários utilizam a infraestrutura decimal arbitrária baseada em `Decimal.js` do `@atlas/domain`. Proibido o uso de `Number()`, `parseFloat()` ou ponto flutuante IEEE-754.
3. **Datas Civis Puras:** Datas são tratadas como `LocalDate` (`YYYY-MM-DD`), imunes a conversões de fuso horário.
4. **Segurança de Parsing Excel (`exceljs`):**
   - Limite estrito de tamanho de arquivo: **2 MB**.
   - Limite estrito de linhas processadas: **2.000 linhas**.
   - Execução de macros VBA: **Desabilitada / Inexistente**.
   - Execução de fórmulas: **Desabilitada** (apenas valores estáticos ou rejeição).
   - Links externos / rede: **Desabilitado**.

---

## 2. Layouts Oficiais da B3

A auditoria dos arquivos reais oficiais da Área do Investidor B3 identificou cinco formatos canônicos.

### Matriz de Detecção e Suporte

| Formato B3 | Identificação (Planilhas / Cabeçalhos) | Status no Atlas | Modelo Canônico |
| :--- | :--- | :--- | :--- |
| **Negociação** (`negociacao-*.xlsx`) | Planilha `Negociação`<br>Colunas: `Data do Negócio`, `Tipo de Movimentação`, `Mercado`, `Prazo/Vencimento`, `Instituição`, `Código de Negociação`, `Quantidade`, `Preço`, `Valor` | **Suportado (Importável)** | `BUY` / `SELL` (operações econômicas com ticker, preço e quantidade) |
| **Movimentação** (`movimentacao-*.xlsx`) | Planilha `Movimentação`<br>Colunas: `Entrada/Saída`, `Data`, `Movimentação`, `Produto`, `Instituição`, `Quantidade`, `Preço unitário`, `Valor da Operação` | **Reconhecido (Não importável nesta fase)** | Proventos (`DIVIDEND`, `JCP`, `FII_INCOME`), transferências de liquidação (`TRANSFER_IN`/`TRANSFER_OUT`), empréstimos e subscrições |
| **Eventos / Proventos a Receber** (`eventos-*.xlsx`) | Planilha `Proventos a Receber`<br>Colunas: `Produto`, `Tipo`, `Tipo de Evento`, `Previsão de pagamento`, `Instituição`, `Conta`, `Quantidade`, `Preço unitário`, `Valor líquido` | **Reconhecido (Não importável nesta fase)** | Proventos provisionados / agendados (não transitam no ledger financeiro como caixa disponível até liquidação efetiva) |
| **Posição em Custódia** (`posicao-*.xlsx`) | Planilhas: `Acoes`, `BDR`, `Empréstimos`, `Fundo de Investimento`<br>Colunas: `Produto`, `Instituição`, `Conta`, `Código de Negociação`, `CNPJ da Empresa`, `Quantidade Disponível`, `Preço de Fechamento` | **Reconhecido (Não importável nesta fase)** | Fotografia patrimonial de custódia; servirá futuramente para conciliação / auditoria contra o replay engine, nunca como compras retroativas |
| **Relatório Consolidado Anual** (`relatorio-consolidado-anual-*.xlsx`) | Planilhas: `Posição - Ações`, `Posição - BDR`, `Posição - Empréstimos`, `Posição - Fundos`, `Proventos Recebidos`, `Reembolsos de Empréstimo` | **Reconhecido (Não importável nesta fase)** | Posição e rendimentos anuais para conferência de DIRPF (Bens e Direitos) |

---

## 3. Pipeline de Importação: B3 Negociação XLSX

O fluxo obrigatório segue a arquitetura estabelecida na Phase 5K:

```text
Arquivo XLSX
  ↓
Detecção de Layout (detectB3XlsxLayout)
  ↓
Parser e Normalização (parseB3NegotiationXlsx)
  ↓
Resolução de Ativos e Contas (resolveAsset / resolveAccount)
  ↓
Deduplicação Canônica (canonicalFingerprint)
  ↓
PREVIEW (Tabela detalhada com Data, Compra/Venda, Ativo, Quantidade, Preço, Valor, Instituição, Status)
  ↓
Confirmação Humana Explícita
  ↓
Lançamento no Transaction Ledger (source: B3)
```

### Regras de Negócio Específicas do Parser B3 Negociação

1. **Tipo de Movimentação:**
   - `Compra` → `BUY`
   - `Venda` → `SELL`
   - Qualquer outro valor → `UNSUPPORTED_ROW` (aparece no preview com diagnóstico explícito). Proibido inferir operação por sinal do valor.
2. **Ativo:**
   - Extraído de `Código de Negociação` (ex.: `PETR4`, `BBAS3`, `IRIM11`).
   - Se ativo for desconhecido na base, é classificado como `NEEDS_REVIEW` / `AMBIGUOUS_ASSET` para resolução humana no preview.
3. **Múltiplas Instituições:**
   - O valor da coluna `Instituição` é preservado por linha em `brokerLabel` (ex.: `XP INVESTIMENTOS CCTVM S/A.`, `NU INVEST CORRETORA DE VALORES S.A.`).
   - Permite que um único arquivo da B3 contenha operações de corretoras distintas sem sobrescrita.
4. **Ignorar Linhas Não-Operacionais:**
   - Linhas em branco, subtotais, linha `Total` e repetições de cabeçalho são filtradas automaticamente.
5. **Deteção de Duplicatas:**
   - O hash determinístico SHA-256 (`canonicalFingerprint`) impede que a importação do mesmo arquivo ou de arquivos parciais duplique operações no ledger.
