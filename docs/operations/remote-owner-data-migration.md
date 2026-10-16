# Estratégia de Migração de Dados: Local para Remote Owner MVP

Este documento analisa as opções de transição dos dados do titular da máquina de desenvolvimento local para o ambiente remoto dedicado (**Remote Owner MVP**).

---

## 1. Análise de Opções

| Critério                 | Opção A: Base Remota Vazia (Fresh Start)                                           | Opção B: Clone Integral do Banco Local                                                    | Opção C: Exportação Seletiva do Titular (Recomendada)                                                |
| :----------------------- | :--------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **Descrição**            | Iniciar banco remoto limpo com migrations e recadastrar ativos/transações.         | Copiar integralmente o banco local (dump completo da base de dev).                        | Exportar apenas o investidor titular, suas carteiras, contas e ledger de transações.                 |
| **Prós**                 | Zero risco de vazamento de resquícios de testes; baseline perfeitamente auditável. | Rápido de executar via `pg_dump`/`pg_restore`; preserva exatamente o estado atual.        | Preserva histórico real já validado (H1-H10); expurga contas de teste, tokens e sessões temporárias. |
| **Contras**              | Requer redigitação manual de operações já validadas nos testes humanos.            | Pode carregar lixo de desenvolvimento (usuários de teste automatizado, tokens expirados). | Requer script ou query de extração seletiva com integridade referencial.                             |
| **Risco de Integridade** | Baixo.                                                                             | Médio (poluição de schema por seeds e mocks).                                             | Mínimo (mantém invariantes intactos).                                                                |
| **Recomendação**         | Alternativa viável se o titular desejar recadastrar.                               | Não recomendada para produção.                                                            | **RECOMENDADA.**                                                                                     |

---

## 2. Riscos Concretos Identificados

1. **Vazamento de Dados de Teste:**
   - O banco de desenvolvimento contém instâncias geradas durante hotfixes e suítes de teste.
   - Um clone cego (`pg_dump` completo) levaria dados transitórios e chaves de sessão para o servidor remoto.
2. **Conflito de UUIDs e Contas:**
   - Carteiras e contas associadas a usuários inexistentes geram quebra de integridade referencial e erros em cascata no `GlobalExceptionFilter`.
3. **Sessões e Refresh Tokens Locais:**
   - Sessões antigas ativas na base local usam segredos de desenvolvimento (`dev-refresh-token-pepper`).
   - Se copiadas para produção com segredos novos, causarão falha de validação ou invalidação forçada.

---

## 3. Procedimento Operacional: Opção C (Exportação Seletiva)

### 3.1 Identificação dos Recursos do Titular

No banco local (`localhost:5434`):

```sql
-- 1. Obter ID do investidor titular
SELECT id, email, name FROM users WHERE email = 'investidor@exemplo.com';

-- 2. Validar carteiras pertencentes ao titular
SELECT id, name, user_id FROM portfolios WHERE user_id = 'USER_ID_TITULAR';

-- 3. Validar contas de custódia
SELECT id, name, portfolio_id FROM accounts WHERE portfolio_id IN (
  SELECT id FROM portfolios WHERE user_id = 'USER_ID_TITULAR'
);

-- 4. Validar quantidade de transações do ledger
SELECT count(*) FROM transactions WHERE portfolio_id IN (
  SELECT id FROM portfolios WHERE user_id = 'USER_ID_TITULAR'
);
```

### 3.2 Extração em Ordem Topológica

A extração deve respeitar a ordem de dependência das chaves estrangeiras:

1. `users` (apenas o registro do titular, omitindo hash de sessão)
2. `institutions` (instituições referenciadas pelas contas do titular)
3. `portfolios` (carteiras do titular)
4. `accounts` (contas custodiantes)
5. `assets` (ativos negociados)
6. `transactions` (ledger append-only completo das carteiras do titular)

### 3.3 Importação no Servidor Remoto

1. Aplicar migrations no banco remoto:
   ```bash
   pnpm db:migrate
   ```
2. Executar script de bootstrap ou importação das tabelas ordenadas.
3. Não importar tabelas de sessão (`sessions`, `password_reset_tokens`).

### 3.4 Validação de Replay Financeiro Pós-Migração

Após a importação, execute a chamada do Portfolio Engine para assegurar correspondência matemática idêntica:

```bash
# Executa replay contra a API remota
curl -s -H "Authorization: Bearer $REMOTE_TOKEN" \
  https://api.yourdomain.com/api/v1/portfolios/$PORTFOLIO_ID/state | jq .
```

Verifique:

- Posições em custódia (ativos e quantidades)
- Preço médio e custo de aquisição
- Inexistência de qualquer `NegativePositionError`
