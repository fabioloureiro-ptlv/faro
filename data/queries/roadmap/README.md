# Consultas do roadmap do Digital (fonte real da frente 4, E8)

O Faro lê a mesma saída das três consultas BigQuery do roadmap do Digital (Marketing Data, Jira MS-5638),
projeto `petlove-dataeng-prod-01`, injetando nelas o **cadastro do Faro** (`npm run job:sync-roadmap`).

| Consulta | Onde fica | Conteúdo | Custo estimado |
| --- | --- | --- | --- |
| `dy_results` v3 | `data/models/results/dy_results.sql` (já versionada) | Resultado por teste × grão (usuário/sessão) × device × variante. Exposições da `dw_corporativo.ft_teste_ab`, compras do `ssot_ga4`. Saída larga: uma coluna por métrica × estatística. | ~10 GB / 45 dias |
| `dy_discovery` | **salvar aqui** como `dy_discovery.sql` | Todos os testes do DY com exposição nos últimos 7 dias: BU, split, período de split estável, estado. | ~12 GB |
| `dy_daily` v3 | **salvar aqui** como `dy_daily_v3.sql` | Por dia × variante × device: usuários novos, usuários na leitura, compradores, transações, receita. | ~8 GB / 45 dias |

Ao salvar, manter as linhas `-- {overrides}`, `-- {linked}`, `-- {split}` e `-- {norte}` exatamente como vêm:
o Faro troca cada uma pelo cadastro dele. As linhas `, STRUCT(...)` (ou `, '<campanha>'`) logo abaixo de cada
marcador são o cadastro do **roadmap**, não do Faro: podem ficar no arquivo (o injetor as descarta na hora de
montar a consulta), o que permite manter o texto exato recebido do time de Marketing Data.

Sem as duas consultas que faltam, `npm run job:sync-roadmap -- --dry-run` falha com a lista do que está ausente.
Snapshots gerados vão para `data/snapshots/roadmap/<dados_ate>/` (gitignored), sem identificadores de usuário.
