# Frente 5 — Padronização por templates

> Leia antes: `00-contexto-geral.md`. Este arquivo descreve apenas o que é específico desta frente.

## 1. Requisito

Utilizar modelos padrão para a criação de campanhas e a estruturação de relatórios, facilitando a análise e o acompanhamento dos resultados.

## 2. Problema hoje

Cada squad cria testes e relatórios do seu jeito: designs em páginas do Confluence com formatos diferentes, métricas escolhidas caso a caso, relatórios montados à mão. Isso dificulta comparar testes, aprender com o histórico e revisar rapidamente.

## 3. Objetivo da frente

Três famílias de templates, mantidas como dados versionados (não como código espalhado):

1. **Templates de campanha**: pontos de partida por tipo de teste que pré-preenchem design, métricas, guardrails, público, alocação e ficha do DY.
2. **Template de relatório**: a estrutura única da tela e do export de resultados, baseada no visualizador atual.
3. **Templates de registro**: decisão, aprendizado e exportação do design (Confluence/Markdown).

## 4. Escopo

**Dentro:** modelo de dados de template, biblioteca inicial, aplicação de template no cadastro, versionamento, governança (quem cria e aprova), template de relatório (estrutura, seções, textos padrão), templates de decisão e aprendizado, exportação.

**Fora:** wizard de cadastro (frente 1 aplica o template), cálculo dos resultados (frente 4 preenche o relatório), lista e status (frente 2 usa o template de decisão).

## 5. Templates de campanha

```ts
export interface CampaignTemplate {
  id: string; version: number; status: 'rascunho' | 'publicado' | 'arquivado';
  name: string;                       // ex.: "Banner ou bloco na home"
  description: string; whenToUse: string;
  bu?: Bu;                            // vazio = qualquer BU
  defaults: {
    design?: Partial<Pick<Design, 'primaryMetricId' | 'secondaryMetricIds' | 'guardrailMetricIds' | 'mdeRelative'>>;
    hypothesisHint?: string;          // exemplo de hipótese bem escrita
    contextChecklist?: string[];      // perguntas que o contexto deve responder
    audience?: Partial<Audience>;
    allocation?: Partial<Allocation>; // split, % tráfego, duração mínima
    dy?: { campaignType: string; namingPattern: string; labels: string[]; checklist: string[] };
  };
  lockedFields?: string[];            // campos que o usuário não pode alterar (ex.: guardrail obrigatório)
  owner: string; updatedAt: string;
}
```

Biblioteca inicial sugerida (validar com as BUs):

| Template | NORTE | Secundárias | Guardrails | Observações |
|---|---|---|---|---|
| Banner ou bloco na home | Receita por usuário | Conversão, CTR da variação | Margem 2 por usuário | Duração mínima 14 dias; alerta de sobreposição com testes de home |
| Mudança na página de produto | Conversão para o carrinho | Conversão, ticket médio | Tempo de carregamento | |
| Teste de preço ou desconto | Margem 2 por usuário | Receita por usuário, conversão | Ticket médio | Guardrail travado; exige aprovação de Pricing |
| Fluxo de checkout ou pagamento | Conversão | Receita por usuário | Taxa de erro, chamados no SAC | Severidade alta de sobreposição por padrão |
| Upsell de Repet ou Clube | Conversão em Repet nova / no clube | Receita por usuário | Churn do clube, cancelamento de Repet | Métrica de churn com maturação |
| Funil de Saúde (cadastro, contratação, retenção) | Conversão em saúde | Vidas por usuário, retenção em 30 dias | Churn de saúde, chamados | |
| Oferta Fintech (cashback, crédito) | Conversão | Uso de cashback | Inadimplência | Inadimplência com maturação; exige aprovação de Risco |
| Recomendação de produtos | CTR da recomendação | Adição ao carrinho, receita por usuário | Tempo de carregamento | |

## 6. Template de relatório

Estrutura fixa, na ordem (é a mesma do visualizador atual e do protótipo):

1. Cabeçalho: nome, tags (status, BU, variantes, plataformas, público, tráfego, contaminação, sobreposições), data dos dados e janela de leitura.
2. Avisos: split instável, SRM, maturação de métricas.
3. Design do experimento: contexto, hipótese, controle e variantes (com Figma), métricas.
4. Variantes com split observado.
5. Síntese em uma frase.
6. O que fazer (recomendação, grão e métrica que decidem).
7. Métricas: volumes; depois seções (Engajamento, eCom, Clube, Saúde, Fintech, Retenção, Atendimento, Operação), cada linha com valor do controle, valor da variante, delta, significância e tag NORTE/GUARDA/SECUNDÁRIA. Alternância usuário/sessão e consolidado/plataforma.
8. Saúde do teste: expostos por dia por variante e NORTE dia a dia.
9. Detectabilidade (MDE atual × MDE do design).
10. Como os números são calculados e fonte dos dados.

```ts
export interface ReportTemplate {
  id: string; version: number;
  sections: { key: string; title: string; visible: boolean; order: number }[];
  metricSections: { key: string; title: string; metricIds?: string[] }[];   // ordem das seções de métricas
  copy: Record<string, string>;      // textos padrão (avisos, explicação dos rótulos, metodologia)
  labels: Record<SignificanceLabel, { text: string; tone: 'ok' | 'risk' | 'warn' | 'neutral' }>;
}
```

## 7. Templates de registro

- **Decisão** (usado pela frente 2): resultado, justificativa ligada à NORTE e aos guardrails, riscos aceitos, próximo passo, quem decidiu.
- **Aprendizado**: o que aprendemos, se a hipótese se confirmou, o que testar a seguir; publicado na biblioteca de aprendizados.
- **Exportação do design**: Markdown e página de Confluence no formato padrão do time (há uma página "Design do experimento" no espaço PPA que serve de referência), com campos do tracking plan.

## 8. Requisitos funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| TPL-01 | Biblioteca de templates de campanha | Listagem com busca e filtro por BU; cada template mostra quando usar e o que pré-preenche |
| TPL-02 | Aplicar template | Na frente 1, escolher template preenche os campos de `defaults`; campos em `lockedFields` aparecem travados com o motivo |
| TPL-03 | Versionamento | Experimento guarda `templateId` e a versão usada; mudar o template não altera experimentos existentes |
| TPL-04 | Governança | Criar e editar template exige papel "curador de templates"; publicação passa por revisão; histórico de versões |
| TPL-05 | Template de relatório | Estrutura da seção 6 servida por API e consumida pela UI de resultados (frente 4); textos editáveis sem deploy |
| TPL-06 | Template de decisão | Formulário de `Decision` gerado a partir do template; validação de campos obrigatórios |
| TPL-07 | Template de aprendizado | Registro após o encerramento; aparece no detalhe do experimento e na busca do painel |
| TPL-08 | Exportação | Exportar design e relatório em Markdown e para Confluence; o relatório exportado traz a data dos dados |
| TPL-09 | Sugestão de template | No início do cadastro, sugerir template a partir da página, da BU e do texto do nome |
| TPL-10 | Uso e qualidade | Medir uso por template e taxa de testes que mudam a NORTE padrão, para revisar templates |

## 9. Requisitos não funcionais

- Templates são dados (JSON/YAML versionado ou tabela), editáveis sem deploy.
- Validação de schema na publicação: métricas referenciadas existem e estão `ativa` no catálogo (frente 4).

## 10. Contratos

**Expõe:** `CampaignTemplate`, `ReportTemplate`, templates de decisão e aprendizado, API `GET /templates`, `GET /templates/{id}`, `GET /report-template`, exportadores.

**Consome:** `MetricDefinition` (frente 4) para validar métricas; `Experiment` e `MetricResult` para exportação.

## 11. Mocks para trabalhar em paralelo

- Os oito templates da seção 5 em JSON, referenciando ids de métricas do catálogo mock.
- `ReportTemplate` padrão reproduzindo a estrutura do protótipo.
- Um `Experiment` completo e o Nexus para testar exportação.

## 12. Plano sugerido

1. Schemas de `CampaignTemplate` e `ReportTemplate` em `packages/contracts` e validação.
2. Biblioteca inicial em dados e API de leitura.
3. Integração com o cadastro (TPL-02) junto com a frente 1.
4. `ReportTemplate` consumido pela UI de resultados junto com a frente 4.
5. Templates de decisão e aprendizado com a frente 2.
6. Exportação Markdown e Confluence.
7. Governança, versionamento e métricas de uso.

## 13. Como validar

- **Testes automatizados:** validação de schema; template com métrica inexistente falha na publicação; aplicar template não sobrescreve campos já preenchidos sem confirmação; versão gravada no experimento.
- **Teste com usuários:** dois squads cadastram o mesmo tipo de teste com e sem template; comparar tempo e completude.
- **Métricas de sucesso do requisito:** percentual de testes criados a partir de template (meta: 70%); tempo médio de cadastro com template; percentual de relatórios exportados no padrão.

## 14. Perguntas em aberto

- Quem é o curador de templates (time de experimentação, Analytics, cada BU)?
- Testes de preço e de oferta Fintech exigem aprovação de outras áreas: o Faro registra a aprovação ou só lembra?
- O relatório exportado vai para o Confluence de cada squad ou para um espaço central de aprendizados?
