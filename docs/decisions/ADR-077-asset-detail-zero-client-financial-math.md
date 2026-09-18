# ADR-077: Zero Client Financial Math & Incomplete Cost Basis Semantics in Asset Position Details

## Status

Accepted

## Context

A premissa fundamental do Project Atlas é a confiabilidade contábil absoluta (_audit-grade_). No desenvolvimento de front-ends para plataformas financeiras, é comum que desenvolvedores realizem multiplicações ingênuas no cliente (por exemplo, `quantidade * precoMedio = custoTotal`), somas de arrays com números decimais em JavaScript IEEE 754, ou assumam `0` para custos que não foram precificados.
Essas práticas introduzem erros de ponto flutuante, mascaram omissões históricas no livro-razão e violam a integridade dos modelos auditados pelo Portfolio Engine.

## Decision

1. **Zero Client Math:**
   - Nem o `AssetPositionDetailPage` (Web), nem o `MobileAssetDetailPage` (Mobile), nem o `AssetPositionDetailViewModel` realizam multiplicações, divisões, recálculos de preço médio ou agregações financeiras.
   - Todos os valores de quantidade, preço médio, custo total, proventos e ganhos realizados provêm diretamente dos read models e eventos emitidos pelo Portfolio Engine `1.0.0-rc.1`.
2. **Formatação Padronizada via `@atlas/ui`:**
   - O ViewModel consome os contratos `MoneyDto` e strings de quantidade e gera strings formatadas em pt-BR (ex: `R$ 3.200,00` ou `$3,200.00`) usando utilitários puros de internacionalização com suporte multi-moeda isolado (`BRL` e `USD`).
3. **Semântica Rigorosa para Custo Incompleto (`INCOMPLETE`):**
   - Se uma posição possui status de base de custo `INCOMPLETE` (gerada por transferências sem custo prévio conhecido, doações ou subscrições não precificadas):
     - O preço médio e o custo total são renderizados estritamente como travessão em-dash (`—`).
     - É terminantemente vedado renderizar `0`, `R$ 0,00`, `$0.00` ou lançar exceções não tratadas no front-end.
     - É exibido o rótulo/badge informativo e não alarmista **"Dados de custo incompletos"** acompanhado de explicação contextual.
     - O rótulo do custo total é adaptado para **"Custo total conhecido"**.

## Consequences

- Os clientes Web e Mobile comportam-se como projeções visuais 100% fiéis ao Portfolio Engine.
- Impossibilidade de desvios aritméticos ou inconsistências entre a visão geral e a tela de detalhe.
