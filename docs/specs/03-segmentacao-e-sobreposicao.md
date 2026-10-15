# Frente 3 — Segmentação avançada de público e controle de sobreposição

> Leia antes: `00-contexto-geral.md`. Este arquivo descreve apenas o que é específico desta frente.

## 1. Requisito

Ferramentas para definir públicos-alvo de forma intuitiva e controlar a sobreposição (overlapping) de campanhas simultâneas em diferentes frentes (como Saúde e Fintech).

## 2. Problema hoje

Os segmentos disponíveis são fixos e técnicos, e cada time tem recortes próprios ("quem compra tapete higiênico", "não assinantes Repet com pet idoso"). Ninguém sabe se dois testes de BUs diferentes atingem os mesmos usuários: o Nexus ocupa 98% da home do app enquanto outros times planejam testes na mesma home.

## 3. Objetivo da frente

1. **Público em campo aberto**: o time descreve quem entra no teste com as próprias palavras, o Faro ajuda a transformar isso em regra mensurável, estima o tamanho e publica o público no DY.
2. **Sobreposição controlada**: antes de começar, o Faro estima quantos usuários seriam expostos a dois testes ao mesmo tempo; durante o teste, mede a sobreposição real; e oferece mecanismos de resolução (exclusão mútua, paralelo, reagendar).

## 4. Escopo

**Dentro:** modelo de público (texto livre + regra), construtor de regras, atalhos, estimativa de tamanho, publicação no DY via User Data API, catálogo de páginas e tráfego, motor de sobreposição planejada, medição de sobreposição observada, grupos de exclusão mútua, mapa de sobreposição (dados para a frente 2).

**Fora:** UI de lista e mapa geral (frente 2 desenha; esta frente fornece os dados), cálculo de métricas de resultado (frente 4).

## 5. Jornadas

1. **PM de Ecom** escreve "pessoas que compraram tapete higiênico nos últimos 90 dias". O Faro sugere a regra (categoria de item em `purchase`, janela de 90 dias), estima ~9% da base e cerca de N usuários elegíveis por dia na página escolhida.
2. **PM de Saúde** planeja um teste na home do app e o Faro avisa: o Nexus (Ecossistema) já ocupa 98% desse tráfego até o fim de novembro, com ~27 mil usuários/dia em comum. Ele escolhe reagendar ou pedir exclusão mútua.
3. **Time de experimentação** cria um grupo de exclusão mútua para a home do app e divide o tráfego entre três testes.
4. **Durante o teste**, o painel mostra quantos usuários de fato viram os dois testes.

## 6. Requisitos funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| SEG-01 | Público em texto livre | Campo obrigatório "Quem entra no teste" (≥ 3 caracteres) salvo em `Audience.description` |
| SEG-02 | Atalhos | Públicos prontos que preenchem o texto e a regra: todos, novos, recorrentes, assinantes e não assinantes Repet, tutores de cães e de gatos, compradores por categoria (tapete higiênico, areia, antipulgas…). Lista mantida em dados, não em código |
| SEG-03 | Construtor de regras | Regra composta por condições com E/OU sobre: compra de categoria/marca/item em janela; evento GA4 em janela; propriedade de usuário (assinatura Repet, clube, plano de saúde, espécie do pet, região); plataforma. Serializada em `AudienceRule` |
| SEG-04 | Sugestão de regra a partir do texto | Dado o texto livre, sugerir condições do catálogo (ex.: "tapete higiênico" → `item_category` correspondente). O usuário confirma ou ajusta. Começar com correspondência por dicionário; IA é melhoria |
| SEG-05 | Estimativa de tamanho | Para regras do catálogo, calcular `estimatedShare` e elegíveis por dia via consulta ao `ssot_ga4` (sempre com intervalo de `refdate`) ou tabelas agregadas. Para texto sem regra, aceitar estimativa manual com aviso "estimativa do time" |
| SEG-06 | Elegíveis por dia | `estimateEligibleDaily(allocation, audience)` = usuários únicos/dia nas páginas e plataformas × participação do público × % de tráfego. Usado pela frente 1 para duração |
| SEG-07 | Publicação no DY | Para públicos com regra, gerar atributo de usuário (`dyAttribute`, ex.: `faro_aud_tapete_higienico_90d`) e enviá-lo via User Data API por um job diário; a ficha do DY (frente 1) referencia esse atributo |
| SEG-08 | Catálogo de páginas | Páginas (Home, Busca, PDP, Carrinho, Checkout, Área Saúde, Minha conta…) com usuários únicos/dia por plataforma, atualizado semanalmente a partir do GA4 |
| SEG-09 | Sobreposição planejada | Para um experimento e todos os ativos ou agendados: há sobreposição se as datas, páginas e plataformas se cruzam e os públicos não são disjuntos. Estimar usuários/dia em comum e o % do público de cada teste |
| SEG-10 | Interseção de públicos | Regras conhecidas: disjuntos declarados (novos × recorrentes, assinante × não assinante); mesmo público = menor tamanho; "todos" = tamanho do outro; demais = produto das participações (independência), sinalizado como estimativa. Quando ambos têm regra, calcular a interseção real na base |
| SEG-11 | Severidade | Alto: mesma métrica NORTE, ou página de carrinho/checkout, ou > 20% do público de algum dos testes. Médio: demais casos relevantes. Baixo: < 2 mil usuários/dia em comum e < 5% de cada público. Limiares configuráveis |
| SEG-12 | Resolução | Para médio e alto: exclusão mútua, paralelo (com justificativa) ou reagendar. Gravada em `OverlapDecision` |
| SEG-13 | Grupos de exclusão mútua | Criar grupo por página/plataforma com fatias de tráfego por teste; impedir que a soma passe de 100%; refletir na ficha do DY |
| SEG-14 | Sobreposição observada | Com o export do DY ou o GA4, contar usuários expostos a mais de um teste no período e a contaminação dentro do teste. Publicar como dado para o painel e para o relatório |
| SEG-15 | Sobreposição entre BUs | Marcar conflitos entre BUs diferentes ("Entre BUs: Saúde × Fintech") e notificar os dois donos |

## 7. Requisitos não funcionais

- Estimativa de público responde em até 10 s; consultas pesadas usam tabelas agregadas pré-calculadas.
- Custo: nenhuma consulta interativa sem filtro de `refdate`; orçamento por consulta configurável (ex.: dry run acima de 50 GB exige confirmação).
- Privacidade: públicos são agregados na UI; listas de IDs só circulam entre o job de publicação e a User Data API.

## 8. Contratos

**Expõe:** `Audience`, `AudienceRule` (proposta abaixo), `estimateEligibleDaily`, `OverlapDecision`, `ExclusionGroup`, dados do mapa de sobreposição, `ObservedOverlap`.

```ts
export type AudienceCondition =
  | { type: 'comprou'; dimension: 'categoria' | 'marca' | 'item'; values: string[]; windowDays: number }
  | { type: 'evento'; eventName: string; windowDays: number; minCount?: number }
  | { type: 'propriedade'; key: 'repet' | 'clube' | 'plano_saude' | 'especie_pet' | 'regiao' | string; op: 'eq' | 'in' | 'neq'; values: string[] }
  | { type: 'plataforma'; values: Platform[] };

export interface AudienceRule { op: 'and' | 'or'; conditions: (AudienceCondition | AudienceRule)[] }

export interface ExclusionGroup { id: string; pages: string[]; platforms: Platform[]; slices: { faroId: string; percent: number }[] }

export interface ObservedOverlap { faroIdA: string; faroIdB: string; usersBoth: number; shareOfA: number; shareOfB: number; asOf: string }
```

**Consome:** `Experiment.allocation` e datas (frente 1), métrica NORTE de cada teste (frente 1), exposições por usuário (frente 4, `data/models/exposures`).

## 9. Mocks para trabalhar em paralelo

- Catálogo de páginas com o tráfego diário do protótipo.
- Participações de público fixas (novos 28%, recorrentes 72%, Repet 38%, cães 68%, gatos 44%, tapete higiênico 9%, areia 14%, antipulgas 12%).
- Exposições simuladas para testar a sobreposição observada.

## 10. Plano sugerido

1. Modelo `Audience`/`AudienceRule` e atalhos (SEG-01, SEG-02).
2. Motor de sobreposição planejada como funções puras com testes (SEG-09 a SEG-12), já consumível pela frente 1.
3. Catálogo de páginas e `estimateEligibleDaily` (SEG-06, SEG-08).
4. Construtor de regras e estimativa de tamanho sobre `ssot_ga4` (SEG-03, SEG-05).
5. Sugestão de regra a partir do texto (SEG-04).
6. Grupos de exclusão mútua (SEG-13).
7. Publicação no DY e sobreposição observada (SEG-07, SEG-14, SEG-15).

## 11. Como validar

- **Testes automatizados:** matriz de interseção de públicos; sobreposição com datas que se tocam no limite; soma dos grupos de exclusão; geração de SQL de regra com filtro de `refdate` obrigatório.
- **Validação de dados:** para 3 públicos com regra, comparar a estimativa do Faro com a contagem feita pelo time de Dados (tolerância de 10%). Comparar a sobreposição planejada com a observada em testes reais.
- **Teste com usuários:** 4 PMs de BUs diferentes descrevem um público real; medir quantos chegam a uma regra válida sem ajuda.
- **Métricas de sucesso do requisito:** percentual de testes com público em regra (não só texto); conflitos altos detectados antes do início; usuários contaminados entre testes por mês.

## 12. Perguntas em aberto

- Onde estão as propriedades de usuário (Repet, clube, plano de saúde, espécie do pet) com qualidade suficiente: GA4 `user_properties`, CRM ou banco transacional?
- O DY já recebe atributos de usuário hoje? Quem mantém a integração com a User Data API?
- A exclusão mútua deve ser feita no DY (configuração de campanhas) ou por atributo publicado pelo Faro?
