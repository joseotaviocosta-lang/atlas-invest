# PROJECT ATLAS — APP-15H
# DOCUMENTARY SEARCH & DISCOVERY AUDIT REPORT

- **Data de Execução:** 06/11/2026
- **Ambiente:** Desktop Windows Local (`DESKTOP_LOCAL_OWNER`)
- **Database:** `atlas_local` (PostgreSQL 18 na porta 5434)
- **Status:** `SEARCH_COMPLETED_NO_DOCUMENTS_FOUND`

---

## 1. ESCOPO DA BUSCA DOCUMENTAL

O objetivo desta busca foi localizar, no armazenamento local do computador pessoal do investidor, qualquer documento comprobatório idôneo do custo de aquisição histórico original (anterior a 28/11/2019) para os três ativos com custo pendente:
- **ITSA4**: 900 ações originais.
- **JHSF3**: 600 ações originais.
- **SAPR4**: 3.300 ações originais.

---

## 2. DIRETÓRIOS E EXTENSÕES AUDITADOS

A busca foi realizada de forma estritamente somente-leitura e não-destrutiva nos seguintes locais:

### A. Diretórios Inspecionados
1. `C:\Users\joseo\Downloads`
2. `C:\Users\joseo\Documents`
3. `C:\Users\joseo\OneDrive\Desktop` / `Área de Trabalho`
4. `C:\Users\joseo\OneDrive\Documentos` / `documentos`
5. `C:\Users\joseo\Backups`
6. Diretórios padrão de programas da Receita Federal:
   - `C:\Arquivos de Programas RFB` (Inexistente)
   - `C:\Program Files\IRPF*` (Inexistente)
   - `C:\Program Files (x86)\IRPF*` (Inexistente)
   - `C:\Users\joseo\IRPF*` (Inexistente)
   - `C:\Users\joseo\Meu Imposto de Renda` (Inexistente)

### B. Extensões Alvo
`.pdf`, `.dec`, `.rec`, `.dbk`, `.bkp`, `.zip`, `.rar`, `.7z`, `.xls`, `.xlsx`, `.csv`, `.txt`

---

## 3. ARQUIVOS CANDIDATOS IDENTIFICADOS E AUDITADOS

| Arquivo / Localização | Tamanho | Classificação de Evidência | Conteúdo e Avaliação |
| :--- | :---: | :---: | :--- |
| `Downloads\negociacao-2026-10-29-18-20-59.xlsx` | 13.260 B | `PRIMARY_TRANSACTION_EVIDENCE` | 189 operações oficiais B3 de 28/11/2019 a 08/10/2026. **100% ingerida no banco local**. Não contém operações anteriores a 28/11/2019. |
| `Downloads\negociacao-2026-10-29-11-47-35.xlsx` | 7.371 B | `PRIMARY_TRANSACTION_EVIDENCE` | Subconjunto de negociações de 2025/2026 (59 linhas). |
| `Downloads\negociacao-2026-10-29-11-44-55.xlsx` | 5.308 B | `PRIMARY_TRANSACTION_EVIDENCE` | Subconjunto recente de outubro/2026 (14 linhas). |
| `Downloads\relatorio-consolidado-anual-2020.xlsx` ... `2025.xlsx` | ~14 KB cada | `POSITION_ONLY` | Relatórios anuais B3 com custódia e preço de fechamento em 31/12. **Não comprovam preço de compra original**. |
| `Downloads\movimentacao-2026-10-29-11-47-54.xlsx` | 31.507 B | `SUPPORTING_EVIDENCE` | 711 movimentações de 28/10/2025 a 28/10/2026 (proventos, bonificações, leilões de frações). |
| `Downloads\posicao-2026-10-29-11-46-14.xlsx` | 12.418 B | `POSITION_ONLY` | Snapshot de custódia B3 em 29/10/2026. |
| `Downloads\atlas-suporte-irpf-*.csv` | ~2 KB cada | `INTERNAL_ARTIFACT` | Relatórios de conferência interna de IRPF gerados durante testes do próprio Atlas em outubro/2026. |
| Notas de Corretagem pré-2019 | — | `NOT_FOUND` | Nenhuma nota de corretagem em PDF ou texto encontrada na máquina. |
| Arquivos de Declaração IRPF (`.dec`, `.rec`, `.dbk`, PDF) | — | `NOT_FOUND` | Nenhum arquivo de declaração de IRPF transmitida ou recibo encontrado na máquina. |

---

## 4. CONCLUSÃO DA BUSCA DOCUMENTAL

Após varredura abrangente nos locais acessíveis do computador:
- **Nenhum documento que comprove o custo de aquisição pré-28/11/2019 de `ITSA4`, `JHSF3` e `SAPR4` existe no disco local**.
- Em conformidade estrita com o princípio de não prolongar buscas indeterminadamente quando não há arquivos locais, a etapa de discovery foi encerrada.
- O Project Atlas mantém fidelidade absoluta aos fatos: nenhum valor foi inventado, nenhuma cotação de fechamento foi arbitrada como custo, e o ledger permanece inalterado.
