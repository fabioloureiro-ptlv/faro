# Frente 4 — STATUS

Atualizado em 14/10/2026 (plano aprovado; E0, E1, E5 e as partes sem execução de E2/E3 entregues).

## Pronto
- **E0 — contratos.** `packages/contracts`: tipos da seção 6 do contexto (`domain.ts`), contratos de resultado (`results.ts`: `ResultsResponse`, `SrmResult`, `Recommendation`, `Synthesis`…), schemas zod, `CHANGELOG.md` 0.1.0. Fixtures: `nexus.json` (92 linhas de resultado, consolidado/Android/iOS, MDE, série diária, contaminação) e cinco simulados gerados pelo motor.
- **E1 — `packages/stats`.** Proporções (z, Wald/Agresti-Caffo), médias e razões (delta method), `probBetter` com inversão para `lower_better`, rótulos, SRM, MDE/amostra, CUPED, Holm/BH/Dunnett-Šidák, regras de exposição e atribuição (oráculo dos modelos SQL), recomendação (MET-12), síntese (MET-13), gerador seedado. Método documentado em `METODO.md`.
- **E2 — catálogo (parcial).** `data/models/metrics/catalog.json` com 25 métricas (eCom, Clube, Saúde, Fintech, Retenção, Atendimento, Operação), todas `rascunho`, com dono provisório por time e `maturationDays` nas de efeito tardio. Teste garante que toda métrica das fixtures existe no catálogo.
- **Validações executadas:** `npm run build` (tsc) e `npm test` (vitest): 11 arquivos, 80 testes, todos verdes. Cobertos: rótulos nos limites (79,9%, 80%, 95%, 5%, 20%), inversão `lower_better`, SRM com casos conhecidos (50/50, 30.520 × 28.790, Nexus 2/98), contaminados excluídos, eventos antes da exposição não contam, todos os ramos de recomendação, síntese do Nexus, fixtures contra os schemas.

- **Reconciliação com o Hórus (14/10).** Nexus somado em `dts_teste_ab` na janela de leitura: variante próxima do protótipo (transações −5%), controle muito diferente (2,5× transações, 4× receita). Receita por sessão −29% contra +108% por usuário no visualizador. Registrado em `FONTES.md` e `data/fixtures/dts_teste_ab_nexus_*.json`; lista de campanhas ativas em `data/fixtures/dts_teste_ab_campanhas_*.md` (útil para as frentes 1, 2 e 3).

- **Série diária do Nexus (14/10).** 63 dias de sessões por variante e plataforma em `data/fixtures/`. Achados: participação do controle em queda contínua (3,9% → 0,7%), SRM diário alertando em todos os dias da janela quando medido em sessões, e queda abrupta de exposições do app a partir de 08/10. Dois novos requisitos derivados para o motor: SRM em usuários com acompanhamento de tendência, e alerta de queda de volume de exposição por dia.

- **E5 — API e tela de resultados.** `services/api` (Node puro, sem dependências): `GET /api/experiments`, `/api/experiments/{faroId}`, `/api/results/{faroId}?platform=&grain=`, `/api/metrics`, servindo as fixtures e o catálogo, com filtro por plataforma e grão. `apps/web`: tela de resultados no formato do protótipo (cabeçalho com tags, design no topo, variantes com split, síntese, "o que fazer", tabela por seção com NORTE/GUARDA/SECUNDÁRIA, alternância usuário/sessão e consolidado/plataforma, saúde do teste com a série diária real do Nexus, detectabilidade, "como os números são calculados" e fonte dos dados). Revisão de visualização (14/10, pedido da Marina): números-chave em stat tiles (NORTE como hero com delta, IC95 e chance de ser melhor; expostos e contaminação; amostra com barra de progresso; split com status SRM), forest de impacto por métrica com IC95 e cor de status reservada (sempre com ícone + texto), expostos por dia em pequenos múltiplos com crosshair e participação do controle vs. planejado, NORTE por plataforma e volumes normalizados em barras com IC quando houver, filtros em uma linha acima dos gráficos, tabela de métricas como gêmea (com n e IC95), seção "Dados brutos" (MDE, série diária, volumes por plataforma, JSON) e botões de export CSV/JSON. Funil da jornada (pedido seguinte): `ResultsResponse.funnel?` no contrato, funil do Nexus derivado das taxas por plataforma, funil gerado nos simulados (eCom: viu produto → carrinho → checkout → compra; Saúde: iniciou cadastro → cadastrou o pet → ativou), gráfico de barras por passo normalizado pelos expostos de cada variante com conversão passo a passo e delta vs. controle, tabela e CSV do funil. Paleta validada com `scripts/validate_palette.js` nos modos light e dark. Roda com `npm run dev`. Verificado nesta sessão: rotas via curl e tela via Chromium (lista, Nexus consolidado e iOS, cenário SRM, agendado), sem erros de página.
- **Validações executadas:** `npm run build` e `npm test`: 13 arquivos, 84 testes, todos verdes.

## Mockado
- `fixtures/nexus.json` faz o papel do `metric_results` real do Nexus. Deltas e rótulos são os do visualizador, não recomputados.
- Os cinco simulados são sintéticos (seed fixo) e passam pelo motor; servem para a UI e para a frente 2.

- **E3 (rascunhos completos, sem execução).** Levantamento dos eventos da DY no GA4 (via Fabio) e do Catálogo de Dados (OpenMetadata, 14/10) registrados em `FONTES.md`. Três adaptadores escritos com colunas confirmadas no catálogo: `dy_activity_stream.sql`, `ga4_variation_impression.sql` (GUID de `user_properties`), `dw_ft_teste_ab.sql`; `exposures.sql` une os três e casa Activity Stream ↔ GUID pela sessão DY; `data/tests/exposures_quality.sql`. Não executados: sem BigQuery nesta sessão. Pontos "A CONFIRMAR": app × site no Activity Stream; join de `ft_teste_ab` com `dim_plataforma_marketing`.
- **E2 (fontes mapeadas).** Cada métrica do catálogo cita as tabelas de origem (ver tabela "Métricas → tabelas" em `FONTES.md`). Falta o SQL por métrica.

## Pendente (próximas etapas)
- **E2:** SQL versionado por métrica (`data/models/metrics/<id>.sql`) e registro no OpenMetadata. Depende do SQL v4 do roadmap e do acesso às tabelas.
- **E3:** adaptador `dy_activity_stream.sql` (depende da tabela confirmada); validar os rascunhos GA4 no BigQuery; medir casamento GUID e `dy_session_id`; registrar testes de qualidade no Kraken.
- **E4:** `metric_values`/`metric_results` para eCom e paridade completa com o Nexus (0,5%).
- **E5 (restante):** trocar as fixtures por `metric_results` real; definir os passos canônicos do funil por BU e sua fonte (`// DECISAO-PENDENTE:` eCom viu produto → carrinho → checkout → compra; Saúde iniciou cadastro → cadastrou pet → ativou; hoje placeholders); adotar o template da frente 5 quando existir (a tela segue o protótipo).
- **E6/E7:** fontes de Saúde, Fintech, Retenção, CSAT; linhagem e alertas.

## Bloqueios
- Não há repositório do Faro: o código está em `faro/` no scratchpad desta sessão. Precisa de um repositório para virar PR.
- Artifacts do MS-5638 (SQL v4 e prévia) não compartilhados com esta conta; paridade MET-17 provisória. A reconciliação com o Hórus mostra que o resultado do Nexus muda de sinal conforme o método, então o SQL v4 passou de "desejável" a "bloqueante" para a paridade.
- Sem acesso ao BigQuery nesta sessão (conector não conectou); modelos SQL não podem ser validados aqui.
- Leitura de páginas do Confluence bloqueada por IP (busca funciona).

## Decisões pendentes no código
- `inadimplencia`: N = 30 dias como padrão conservador (`DECISAO-PENDENTE` na definição do catálogo).
- `Allocation.exposureSource` padrão `dy_activity_stream`.

## Perguntas em aberto
- Ver seção 7 do `PLAN.md`.
