# ADR-308: Resultados de Alta Renda Derivados; Somente Evidência Não-Derivável é Persistida

## Contexto

As Fases 4I.1–4I.3 congelaram um domínio fiscal puro e determinístico (snapshot, cálculo, redutor
corporativo) sobre fatos anuais autoritativos da Fase 4H. A Fase 4I.4 integra esse domínio ao fluxo
real da aplicação (serviço, persistência, API). O risco central é transformar resultado calculado em
fonte da verdade, quebrar isolamento entre usuários/anos ou permitir que o cliente forje autoridade
probatória.

## Decisão

1. **Resultados 4I são derivados e nunca persistidos.** O banco guarda exclusivamente fatos de
   evidência não-deriváveis (registros corporativos por pagador, atestações de ajuste e de total
   anual). Todo valor calculado é recomposto a cada leitura a partir das fontes + evidência.
2. **Evidência é append-only e revisionada.** Mesmo conteúdo é idempotente; conteúdo alterado gera
   nova revisão com `supersedesId`; histórico preservado; contenção resolvida por constraint única
   - retry otimista. Identidade inclui o exercício de origem do lucro (períodos distintos coexistem
     e falham fechado no motor, sem regra estatutária de rateio).
3. **Autoridade é controlada pelo servidor.** O cliente declara origem e conteúdo; o servidor decide
   `AUTHORITATIVE` vs `REQUIRES_CONFIRMATION` por regras fixas (documentação de origem + campos
   completos para livros corporativos; confirmação isolada nunca autoriza livros). Conflito entre
   fontes exige resolução explícita auditável (`KEEP_EXISTING`/`ACCEPT_NEW`, sempre via nova revisão).
4. **Evidência fixa o upstream por fingerprint.** Divergência entre o pin gravado e o upstream atual
   marca STALE, degrada autoridade e fecha o líquido — sem reuso silencioso. Escopo estrito por
   (sujeito, ano); entre anos não há vazamento.
5. **Consistência de snapshot por cerca de versão.** Watermark append-only antes/depois do build,
   com uma reconstrução; corrida persistente falha fechado (`FISCAL.SNAPSHOT_INCONSISTENT`).
   Sem cache de cálculo.
6. **Isolamento por construção.** Sujeito derivado do principal autenticado; pagadores validados
   contra o upstream do próprio sujeito; acesso cross-user impossível e testado.
7. **Consultas limitadas e sem N+1.** Upstream via use-cases canônicos 4H, evidência em lote (1
   listagem + 2 watermarks); invariância do shape de queries ao número de pagadores é testada.

## Consequências

- **Positivas:** cálculo autoritativo só com evidência completa e atual; trilha auditável total;
  rebuilds determinísticos; superfície de ataque mínima (sem upload, sem CPF, sem math no cliente).
- **Negativas:** cada novo dividendo do mesmo pagador torna a evidência corporativa STALE até
  re-atestação (fricção consciente, fail-closed); ajuste anual e total de renda dependem de
  atestação do contribuinte (fora do Atlas); taxas certificadas não suportadas.
