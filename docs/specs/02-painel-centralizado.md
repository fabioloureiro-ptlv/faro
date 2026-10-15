# Frente 2 — Painel centralizado de gerenciamento

> Leia antes: `00-contexto-geral.md`. Este arquivo descreve apenas o que é específico desta frente.

## 1. Requisito

Criar uma interface unificada para visualizar todos os testes em andamento, acompanhar o status e garantir a governança das campanhas.

## 2. Problema hoje

Existem 31 campanhas rodando no DY e não há uma visão única de quem está testando o quê, onde, desde quando e com que decisão pendente. Testes decididos continuam ligados (o Nexus está com 98% do tráfego na variante e o controle residual só gera ruído), e testes sem design convivem com testes bem planejados.

## 3. Objetivo da frente

Ser a porta de entrada do Faro: uma lista e um calendário de todos os experimentos, com status confiável, filtros por BU, alertas de governança e o registro de decisões.

## 4. Escopo

**Dentro:** lista de experimentos, filtros e busca, ciclo de vida de status, mapa temporal (calendário por página), detecção de campanhas órfãs no DY, alertas de governança, registro de decisão e encerramento, histórico e auditoria, visão por BU e por squad.

**Fora:** criação e edição de design (frente 1), cálculo de sobreposição (frente 3; aqui só se exibe), cálculo de resultados (frente 4; aqui só se exibe o resumo), conteúdo dos templates (frente 5).

## 5. Jornadas

1. **Líder de BU** abre o painel filtrado por Saúde e vê o que está rodando, o que vem a seguir e o que precisa de decisão.
2. **Time de experimentação** faz a revisão semanal: alertas de governança, testes que podem ser encerrados, órfãos no DY.
3. **PM** registra a decisão de um teste e confirma o desligamento no DY.
4. **Qualquer pessoa** consulta o histórico: o que já testamos naquela página e o que aprendemos.

## 6. Requisitos funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| PNL-01 | Lista de experimentos | Colunas: nome com BU e squad, status, onde (páginas e plataformas), público, métrica NORTE com leitura atual (rótulo de significância), período, sobreposição (contagem e pior severidade), alertas. Ordenação por qualquer coluna |
| PNL-02 | Filtros | BU (Ecossistema = todos; testes `ecossistema` aparecem em todos os filtros), status, squad, plataforma, página, período, "tem alerta", "legado sem design". Filtros refletidos na URL |
| PNL-03 | Busca | Por nome, `faroId`, nome da campanha DY e texto do design |
| PNL-04 | Ciclo de vida | Transições válidas conforme `ExperimentStatus` (seção 6 do contexto). `rodando` é derivado automaticamente quando há exposição no export do DY; `encerrado` exige decisão registrada |
| PNL-05 | Detalhe do experimento | Cabeçalho com tags (status, BU, variantes, plataformas, público, tráfego, contaminação, sobreposições), design no topo, resumo de resultado (frente 4), linha do tempo de eventos |
| PNL-06 | Mapa temporal | Linhas por página, barras por teste no tempo, linha de hoje, contorno para testes que se sobrepõem. Com filtro de BU, testes de outras BUs que cruzam aparecem esmaecidos com o nome da BU |
| PNL-07 | Campanhas órfãs | A partir do export do DY, listar campanhas ativas sem label `faro:` e oferecer "importar como legado" (CFG-14) |
| PNL-08 | Alertas de governança | Regras mínimas: design incompleto ou legado; decidido mas ainda ativo no DY; split próximo de 100% em uma variante; SRM; significância antes da amostra planejada; passou da data de fim; sem exposição 48h após `configurado_no_dy`; divergência de configuração (CFG-13); conflito alto sem resolução. Cada alerta com dono, severidade e ação sugerida |
| PNL-09 | Registro de decisão | Formulário com `Decision` (resultado, justificativa, quem, quando), usando o template de decisão da frente 5. Obrigatório para ir a `encerrado` |
| PNL-10 | Checklist de encerramento | Decisão registrada, campanha desligada no DY (confirmada pelo export: sem exposições no D+1), aprendizado publicado |
| PNL-11 | Histórico e auditoria | Linha do tempo por experimento com todas as mudanças de status, design, alocação e decisões (autor e data) |
| PNL-12 | Visão de capacidade | Por página e plataforma: quantos testes ativos e qual % do tráfego já está comprometido. Ajuda a escolher onde testar |
| PNL-13 | Notificações | Alertas novos enviados ao dono do teste e a um canal do Slack configurável por BU |

## 7. Requisitos não funcionais

- Lista com 200 experimentos carrega em menos de 2 s.
- Status e alertas atualizados pelo menos uma vez por dia, após a carga D-1.
- Permissões: leitura para toda a empresa; edição de status e decisão só para o squad dono e o time de experimentação.

## 8. Contratos

**Expõe:** listagem e filtros de `Experiment`, transições de status, `Decision`, `GovernanceAlert` (proposta abaixo, adicionar a `packages/contracts`), eventos `experiment.status_changed` e `experiment.decided`.

```ts
export interface GovernanceAlert {
  id: string; faroId?: string; dyCampaignId?: string;
  rule: 'design_incompleto' | 'decidido_ativo' | 'split_extremo' | 'srm' | 'parada_antecipada'
      | 'passou_da_data' | 'sem_exposicao' | 'divergencia_config' | 'conflito_sem_resolucao' | 'campanha_orfa';
  severity: 'info' | 'atencao' | 'critico';
  message: string; suggestedAction: string;
  owner: string; createdAt: string; resolvedAt?: string;
}
```

**Consome:** `Experiment` (frente 1), `OverlapDecision` e detecção de sobreposição (frente 3), `MetricResult` da NORTE e indicadores de SRM e amostra (frente 4), template de decisão (frente 5), export de campanhas do DY.

## 9. Mocks para trabalhar em paralelo

- Fixture com os seis experimentos do protótipo (Nexus real e cinco simulados), cobrindo todos os status e alertas.
- Mock de `MetricResult` com rótulos de significância para a coluna NORTE.
- Mock de lista de campanhas do DY com duas campanhas órfãs.

## 10. Plano sugerido

1. Lista, filtros e busca sobre fixtures (PNL-01 a PNL-03).
2. Máquina de estados de status com testes (PNL-04).
3. Detalhe do experimento e linha do tempo (PNL-05, PNL-11).
4. Mapa temporal com filtro de BU (PNL-06).
5. Motor de regras de governança como funções puras (PNL-08) e notificações (PNL-13).
6. Órfãs, decisão e encerramento (PNL-07, PNL-09, PNL-10).
7. Visão de capacidade (PNL-12).

## 11. Como validar

- **Testes automatizados:** transições de status válidas e inválidas; cada regra de governança com caso positivo e negativo; filtro de BU incluindo `ecossistema`.
- **Teste com usuários:** em uma revisão semanal real, o time encontra em menos de 5 minutos todos os testes que precisam de ação.
- **Métricas de sucesso do requisito:** percentual de campanhas ativas no DY com `faroId` (meta: 100% em 2 meses); tempo médio entre decisão e desligamento no DY; número de testes decididos ainda ativos (meta: zero após 7 dias).

## 12. Perguntas em aberto

- O export do DY traz a lista de campanhas ativas e seus labels, ou só as exposições? Se só exposições, como detectar órfãs sem tráfego?
- Qual canal do Slack por BU recebe os alertas?
- Quem pode encerrar teste de outro squad (ex.: teste `ecossistema`)?
