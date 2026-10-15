# Faro — Contexto geral (leia antes de qualquer frente)

> Este arquivo é a fonte única de contexto do projeto. Cada frente (`01` a `05`) tem seu próprio `.md`, mas **todas dependem das definições daqui**: domínio, contratos, fontes de dados, convenções e regras de trabalho em paralelo. Se uma frente precisar mudar algo deste arquivo, siga o protocolo da seção 9.

## 1. Visão

O Faro é a camada de orquestração de testes A/B da Petlove, construída em cima do Dynamic Yield (DY). Hoje os testes nascem direto no console do DY, sem design registrado, sem visão de sobreposição entre times e com métricas calculadas de formas diferentes. O Faro resolve isso com quatro ideias:

1. **Nenhum teste existe sem design.** Contexto, hipótese, o que muda (com Figma do antes e do depois) e métricas primária e secundárias são obrigatórios antes de qualquer configuração.
2. **Todo teste tem um ID único (`faroId`)** que viaja do Faro para o DY (labels da campanha) e para o GA4 (parâmetro de evento). É isso que permite medir de forma automática.
3. **Uma visão única de todos os testes**, com status, sobreposição entre BUs e governança.
4. **Métricas unificadas e padronizadas**: o que foi escolhido no design volta calculado sempre do mesmo jeito, juntando engajamento (cliques, visualizações) e negócio (conversão, receita por visitante, inadimplência, retenção, CSAT).

Protótipo de referência (navegável, com dados simulados e um teste real, o Nexus): https://claude.ai/artifact/FTFXpZhRkdf8HGjUXvLmg7

## 2. Requisitos do projeto e frentes

| # | Frente | Requisito | Arquivo |
|---|---|---|---|
| 1 | Simplificação da configuração | Reduzir trabalho manual e etapas complexas na configuração inicial para minimizar erros operacionais | `01-simplificacao-configuracao.md` |
| 2 | Painel centralizado | Interface unificada para ver todos os testes, acompanhar status e garantir governança | `02-painel-centralizado.md` |
| 3 | Segmentação e sobreposição | Definir públicos de forma intuitiva e controlar sobreposição entre campanhas simultâneas de frentes diferentes | `03-segmentacao-e-sobreposicao.md` |
| 4 | Unificação de métricas | Juntar engajamento e métricas de negócio em uma visualização única | `04-unificacao-de-metricas.md` |
| 5 | Templates | Modelos padrão para criação de campanhas e estrutura de relatórios | `05-templates.md` |

Todos os requisitos são hipóteses **a serem testadas**: cada frente define como medir se o requisito foi atendido (seção "Como validar" de cada arquivo).

## 3. Glossário

- **Experimento / teste**: unidade cadastrada no Faro, identificada por `faroId`.
- **Campanha (DY)**: objeto do console do DY que executa o teste. Uma campanha pertence a exatamente um experimento.
- **Variante**: cada versão testada. O controle é uma variante com `isControl = true`.
- **Design**: o documento obrigatório do experimento (contexto, hipótese, mudança, métricas).
- **Métrica NORTE**: a métrica primária, que decide o teste. Só existe uma.
- **Métrica GUARDA (guardrail)**: métrica que não pode piorar.
- **Público**: quem entra no teste. Descrito em texto livre e, quando possível, traduzido em regra.
- **Sobreposição (overlap)**: usuários que podem ser expostos a dois testes ao mesmo tempo (mesma página, plataforma, período e público).
- **Contaminação**: usuários que viram mais de uma variante do mesmo teste. São excluídos da leitura.
- **SRM**: *sample ratio mismatch*, desbalanceamento entre a divisão esperada e a observada.
- **MDE**: menor efeito relativo detectável com a amostra disponível (80% de poder, α = 5%).
- **BU**: unidade de negócio. Valores: `ecom`, `saude`, `fintech`, `servicos`, `ecossistema` (afeta mais de uma BU).

## 4. Restrições conhecidas (não tente contornar sem validar)

- **O DY não tem API pública para criar ou editar campanhas.** As APIs públicas servem variações (Choose), registram eventos, engajamento e pageviews, recebem dados de usuário (User Data API) e feed de produtos. Criação, segmentação, alocação e métrica primária são configuradas no console (Experience OS). Consequência: o Faro gera uma **ficha de configuração** e o operador replica no console; o vínculo é feito pelo `faroId` nos labels. Se o account manager do DY confirmar alguma API de gestão, isso vira melhoria, não premissa.
- **Dados do GA4 são caros de consultar.** Toda consulta às tabelas GA4 precisa filtrar um intervalo fechado de `refdate`. Nunca use `refdate <= X` (varre a tabela inteira; já houve consulta de 2,4 TB em `event_params`).
- **O Daily Activity Stream do DY fica 30 dias no S3.** Precisa ser ingerido e persistido no BigQuery para testes longos.
- **Dados pessoais**: nada de PII em URL, parâmetro de GA4 ou log. Identificadores de usuário só nas camadas de dados com controle de acesso.

## 5. Fontes de dados

| Fonte | O que traz | Status | Observações |
|---|---|---|---|
| DY — console (Experience OS) | Campanhas, variações, alocação, segmentação | Confirmado | Sem API de criação |
| DY — Daily Activity Stream | Impressões e cliques por campanha e variação, eventos, pageviews, IDs de usuário e sessão DY | Confirmado (doc pública) | Export diário para S3, retenção de 30 dias. Verificar se já é ingerido (o visualizador atual cita "export D-1") |
| DY — User Data API | Envio de atributos de usuário para targeting | Confirmado (doc pública) | Usado pela frente 3 para publicar públicos |
| GA4 bruto | `petlove-dataeng-ga-prod-01.analytics_153833752.events_*` | Citado na doc interna | Colunas aninhadas |
| GA4 planificado (`ssot_ga4`) | `events`, `event_params`, `items`, `user_properties`, ligados por `join_key` + `refdate` | Documentado no Confluence ("Tabelas planificadas GA4 (SSOT)") | Projeto atual a confirmar. Clusterização: `events.event_name`, `event_params.key`, `items.item_id/item_name`, `user_properties.key` |
| Parâmetro `variationName` em `event_params` | Variação do DY vista no evento | Citado como exemplo na doc interna | Confirmar cobertura em site e app e se há nome de campanha junto |
| Evento `DY Variation Impression` | Campanha, experiência e variação (Vetsmart) | Implementado em out/2026 (VETSMART-887) | Padrão ainda não unificado entre produtos |
| Visualizador atual de Testes A/B | Resultados D-1 por variante, consolidado e por plataforma, MDE, saúde do teste | Em produção | Base a reaproveitar. Repositório a localizar |
| Catálogo de Dados (OpenMetadata) | Documentação de tabelas, domínios, testes de qualidade | Em produção | Métricas e públicos devem ser registrados lá |
| Inadimplência, retenção, CSAT | Métricas de negócio de Fintech, Saúde e Atendimento | **A descobrir** | Frente 4 mapeia tabelas e donos |

## 6. Modelo de domínio (contrato compartilhado)

Estes tipos vivem em `packages/contracts` e são a interface entre as frentes. TypeScript como referência; se o stack for outro, mantenha os mesmos nomes e semântica.

```ts
export type Bu = 'ecom' | 'saude' | 'fintech' | 'servicos' | 'ecossistema';
export type Platform = 'site' | 'android' | 'ios';

export type ExperimentStatus =
  | 'rascunho'                // design incompleto
  | 'design_completo'         // passou no gate de design
  | 'pronto_para_configurar'  // público, alocação e sobreposição resolvidos
  | 'configurado_no_dy'       // operador confirmou a campanha no DY
  | 'rodando'                 // exposições chegando
  | 'decidido'                // decisão tomada, campanha ainda ativa no DY
  | 'encerrado'               // campanha desligada, decisão registrada
  | 'cancelado';

export interface Experiment {
  faroId: string;                 // ex.: "FARO-2026-0042" (imutável)
  name: string;
  bu: Bu;
  ownerSquad: string;
  ownerEmail: string;
  status: ExperimentStatus;
  templateId?: string;            // frente 5
  design: Design;                 // frente 1
  audience: Audience;             // frente 3
  allocation: Allocation;         // frentes 1 e 3
  overlap?: OverlapDecision[];    // frente 3
  dy?: DyLink;                    // frente 1
  decision?: Decision;            // frente 2
  legacy?: boolean;               // teste importado do DY sem design original
  createdAt: string; updatedAt: string;
}

export interface Design {
  context: string;                // problema + evidência
  hypothesis: { change: string; expectedEffect: string; because: string };
  control: { name: string; description: string; figmaUrl?: string };
  variants: { key: string; name: string; description: string; figmaUrl?: string }[];
  primaryMetricId: string;        // exatamente uma (NORTE)
  secondaryMetricIds: string[];   // ≥ 1
  guardrailMetricIds: string[];   // ≥ 0 (GUARDA)
  mdeRelative: number;            // ex.: 0.05
  baselineOverride?: number;      // ajuste manual da linha de base da NORTE
}

export interface Audience {
  description: string;            // texto livre, obrigatório
  source: 'atalho' | 'regra' | 'manual';
  rule?: AudienceRule;            // frente 3
  estimatedShare?: number;        // 0–1 da base elegível
  dyAttribute?: string;           // atributo publicado no DY via User Data API
}

export interface Allocation {
  platforms: Platform[];
  pages: string[];                // ids do catálogo de páginas
  trafficPercent: number;         // % do público elegível no teste
  split: number[];                // ex.: [0.5, 0.5]
  startDate: string; endDate: string;
  exclusionGroupId?: string;      // exclusão mútua (frente 3)
}

export interface DyLink {
  campaignName: string;
  campaignId?: string;
  selector?: string;
  labels: string[];               // sempre inclui o faroId
  configuredAt?: string; configuredBy?: string;
}

export interface MetricDefinition {          // dono: frente 4
  id: string;                                // ex.: "receita_por_usuario"
  name: string;
  section: 'Engajamento' | 'eCom' | 'Clube' | 'Saúde' | 'Fintech' | 'Serviços' | 'Atendimento' | 'Operação';
  kind: 'proportion' | 'mean' | 'ratio';
  direction: 'higher_better' | 'lower_better';
  unit: 'percent' | 'brl' | 'count' | 'seconds' | 'score';
  grains: ('user' | 'session')[];
  definition: string;                        // texto para humanos
  sqlTemplateRef: string;                    // referência ao modelo SQL versionado
  baseline?: number; cv?: number;            // para cálculo de amostra
  owner: string;
  status: 'ativa' | 'rascunho' | 'depreciada';
}

export type SignificanceLabel =
  | 'melhora_confirmada'      // P(melhor) ≥ 95%
  | 'tendencia_de_melhora'    // 80% ≤ P < 95%
  | 'sem_tendencia'           // 20% < P < 80%
  | 'tendencia_de_queda'      // 5% < P ≤ 20%
  | 'queda_confirmada';       // P ≤ 5%

export interface MetricResult {              // produzido pela frente 4
  faroId: string; metricId: string;
  platform: Platform | 'all'; grain: 'user' | 'session';
  variantKey: string;
  value: number | null; n: number;
  deltaRelative?: number;                    // vs controle
  probBetter?: number;                       // 0–1, já considerando direction
  label?: SignificanceLabel;
  mde?: number;
  asOf: string;                              // data dos dados (D-1)
}

export interface OverlapDecision {           // dono: frente 3
  otherFaroId: string;
  severity: 'baixo' | 'medio' | 'alto';
  estimatedDailyUsers: number;
  resolution?: 'exclusao_mutua' | 'paralelo' | 'reagendar';
  decidedBy?: string; decidedAt?: string;
}

export interface Decision {
  outcome: 'implementar_variante' | 'manter_controle' | 'sem_vencedor' | 'invalido';
  rationale: string; decidedBy: string; decidedAt: string;
}
```

Regras de significância usadas em todo o produto (vêm do visualizador atual):

- `probBetter` é a chance de a variante ser melhor que o controle, já invertendo para métricas `lower_better` (churn, tempo de carregamento, inadimplência).
- ≥ 95%: melhora confirmada · ≤ 5%: queda confirmada · 80–95%: tendência de melhora · 5–20%: tendência de queda · demais: sem tendência.
- SRM: qui-quadrado sobre o split esperado; alerta com p < 0,001.
- Usuários que viram mais de uma variante são excluídos e reportados ("26.016 usuários viram 2 variantes (2,3%), excluídos").

## 7. Convenção de identificação (proposta a validar com Analytics)

- `faroId` no formato `FARO-AAAA-NNNN`, gerado no cadastro e imutável.
- No DY: label `faro:FARO-AAAA-NNNN` na campanha e nome da campanha prefixado pelo `faroId`.
- No GA4: evento de exposição `experiment_exposure` com parâmetros `experiment_id` (= `faroId`), `experiment_variant`, `dy_campaign_id`, `dy_variation_id`. Até isso existir, a frente 4 usa `variationName` e o Daily Activity Stream como fallback.

## 8. Arquitetura e organização do repositório

Antes de criar estrutura nova, **procure o repositório do visualizador de Testes A/B atual** e prefira estendê-lo. Se não houver, use esta organização:

```
faro/
  CLAUDE.md
  docs/specs/                 # estes arquivos
  docs/adr/                   # decisões de arquitetura (uma por arquivo)
  packages/contracts/         # tipos, schemas de validação, fixtures — compartilhado
  packages/stats/             # motor estatístico — frente 4
  data/models/metrics/        # SQL das métricas — frente 4
  data/models/exposures/      # exposição por usuário/variante — frente 4
  data/models/audiences/      # regras de público e estimativas — frente 3
  services/api/               # API do Faro
    experiments/              # frente 1 (cadastro) e 2 (status/decisão)
    overlap/                  # frente 3
    templates/                # frente 5
    results/                  # frente 4
  apps/web/
    features/configuracao/    # frente 1
    features/painel/          # frente 2
    features/publico/         # frente 3
    features/resultados/      # frente 4 (UI do relatório usa template da frente 5)
    features/templates/       # frente 5
    shared/ui/                # componentes comuns (dono: quem criar primeiro, revisão cruzada)
```

Mapa de propriedade (quem escreve onde):

| Módulo | Dono | Consome |
|---|---|---|
| `packages/contracts` | todas, via protocolo da seção 9 | todas |
| `features/configuracao`, `services/api/experiments` (criação) | Frente 1 | 3, 4, 5 |
| `features/painel`, status e decisão | Frente 2 | 1, 3, 4 |
| `features/publico`, `services/api/overlap`, `data/models/audiences` | Frente 3 | 1, 2 |
| `packages/stats`, `data/models/*` (exceto audiences), `services/api/results`, `features/resultados` | Frente 4 | 2, 5 |
| `features/templates`, `services/api/templates` | Frente 5 | 1, 4 |

## 9. Como trabalhar em paralelo sem perder o todo

1. **Fase 0 (sequencial, curta):** criar `packages/contracts` com os tipos da seção 6, schemas de validação e fixtures (seção 10). Nenhuma frente começa código de produto antes disso.
2. **Contratos primeiro, mocks sempre.** Cada frente desenvolve contra fixtures e mocks dos módulos das outras. Ninguém espera ninguém.
3. **Mudança de contrato:** abrir alteração só em `packages/contracts`, registrar em `packages/contracts/CHANGELOG.md` (o quê, por quê, quais frentes afetadas) e só então usar. Mudanças incompatíveis exigem uma ADR em `docs/adr/`.
4. **Não edite módulos de outra frente.** Se precisar de algo, registre em `docs/specs/PEDIDOS.md` com a frente dona e use um mock até lá.
5. **Cada frente mantém** `docs/specs/frente-0X/PLAN.md` (plano aprovado) e `docs/specs/frente-0X/STATUS.md` (o que está pronto, o que está mockado, bloqueios).
6. **Integração contínua:** testes de contrato rodam para todas as frentes a cada mudança em `packages/contracts`.

## 10. Fixtures obrigatórias

- **Nexus | Nova Home do App** (teste real, export do DY de 13/10/2026): BU ecossistema, app Android e iOS, split 2% × 98%, `home antiga` × `home nova`, NORTE receita por usuário, GUARDA conversão e margem 2, 26.016 usuários contaminados (2,3%), 6 dias de split instável em 90. Valores consolidados e por plataforma estão no protótipo (tela de resultados) e devem ser copiados para `packages/contracts/fixtures/nexus.json`. É também o exemplo de teste legado sem design.
- **Cinco testes simulados** cobrindo os casos de borda: melhora confirmada com amostra incompleta (risco de parar cedo), tendência sem significância, SRM, encerrado com vencedor e agendado sem dados. Também estão no protótipo.

## 11. Princípios de produto

- Escrever na linguagem do time, não do sistema ("Quem entra no teste", não "segment rule").
- Bloquear só o que gera erro caro (design incompleto, conflito alto sem decisão); o resto é alerta.
- Toda tela de resultado mostra o design no topo: o teste nunca aparece sem o porquê.
- Mobile não é prioridade, mas nada pode quebrar em telas pequenas.

## 12. Instruções para o Claude Code

1. Leia este arquivo inteiro e depois o arquivo da sua frente.
2. Entre em **modo de planejamento**: explore o repositório, liste o que já existe e pode ser reaproveitado, e escreva `docs/specs/frente-0X/PLAN.md` com etapas, arquivos que vai criar ou mudar, contratos que consome e expõe, mocks necessários e riscos.
3. Só comece a implementar depois que o plano estiver aprovado.
4. Ao terminar cada etapa, atualize `STATUS.md` e rode os testes de contrato.
5. Em caso de dúvida sobre regra de negócio, registre em "Perguntas em aberto" do arquivo da frente e siga com a opção mais conservadora, sinalizada no código com `// DECISAO-PENDENTE:`.
