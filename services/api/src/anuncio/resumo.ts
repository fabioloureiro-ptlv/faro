// Aviso do teste pronto para configurar (ajuste de produto 15/10, ideia do Fabio): o DY não tem API
// para criar campanhas (contexto, seção 4), então o Faro avisa o time num canal do Slack com o resumo
// do teste e abre um card no Jira com a ficha de configuração. Este módulo só monta os textos.
import type { Bu, DySheet, Experiment, Platform } from '@faro/contracts';

export interface AnuncioContext {
  metricName: (id: string) => string;
  pageName: (id: string) => string;
  sheet: DySheet;
  /** Origem do app (FARO_WEB_ORIGIN) para o link do teste; sem ela, o link fica de fora. */
  webOrigin?: string;
  /** Card já aberto, para o Slack apontar para ele. */
  jira?: { key: string; url: string };
}

export interface Anuncio {
  titulo: string;
  /** Mensagem para o Slack (mrkdwn). */
  slackText: string;
  jiraSummary: string;
  /** Descrição do card em wiki markup do Jira (API v2). */
  jiraDescription: string;
}

const BU_LABEL: Record<Bu, string> = {
  ecom: 'Ecom',
  saude: 'Saúde',
  fintech: 'Fintech',
  servicos: 'Serviços',
  ecossistema: 'Ecossistema',
};
const PLATFORM_LABEL: Record<Platform, string> = { site: 'Site', android: 'Android', ios: 'iOS' };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const dm = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export function faroLink(webOrigin: string | undefined, faroId: string): string | undefined {
  const origin = webOrigin?.split(',')[0]?.trim().replace(/\/$/, '');
  return origin ? `${origin}/configuracao/${faroId}` : undefined;
}

/** Linhas do resumo, sem formatação: Slack e Jira formatam cada uma do seu jeito. */
export function resumoLinhas(
  exp: Experiment,
  ctx: Pick<AnuncioContext, 'metricName' | 'pageName'>,
): [string, string][] {
  const d = exp.design;
  const a = exp.allocation;
  const variantes = d.variants.map((v) => `${v.name}: ${v.description}`).join(' · ');
  const guardas = d.guardrailMetricIds.length
    ? d.guardrailMetricIds.map(ctx.metricName).join(', ')
    : 'nenhuma';
  return [
    ['Quem', `${BU_LABEL[exp.bu]} · ${exp.ownerSquad} · ${exp.ownerEmail}`],
    [
      'Hipótese',
      `Se ${d.hypothesis.change}, então ${d.hypothesis.expectedEffect}, porque ${d.hypothesis.because}.`,
    ],
    ['Controle', `${d.control.name}: ${d.control.description}`],
    [d.variants.length > 1 ? 'Variantes' : 'Variante', variantes],
    [
      'Métrica principal',
      `${ctx.metricName(d.primaryMetricId)} (efeito mínimo ${pct(d.mdeRelative)}) · guardas: ${guardas}`,
    ],
    [
      'Onde',
      `${a.pages.map(ctx.pageName).join(', ')} · ${a.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}`,
    ],
    [
      'Público',
      `${exp.audience.description} · ${a.trafficPercent}% do tráfego · split ${a.split.map(pct).join(' × ')}`,
    ],
    ['Quando', `${dm(a.startDate)} a ${dm(a.endDate)}`],
  ];
}

export function buildAnuncio(exp: Experiment, ctx: AnuncioContext): Anuncio {
  const titulo = exp.name;
  const linhas = resumoLinhas(exp, ctx);
  const link = faroLink(ctx.webOrigin, exp.faroId);

  const slack = [
    `:test_tube: *Teste pronto para configurar no DY* — ${titulo}`,
    ...linhas.map(([k, v]) => `*${k}:* ${v}`),
    [
      ctx.jira ? `*Card:* <${ctx.jira.url}|${ctx.jira.key}>` : null,
      link ? `*Faro:* <${link}|ficha e design>` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  ]
    .filter(Boolean)
    .join('\n');

  const ficha = ctx.sheet.blocks
    .map((b) => `*${b.label}*${b.hint ? ` _(${b.hint})_` : ''}\n{noformat}\n${b.value}\n{noformat}`)
    .join('\n');
  const jiraDescription = [
    'h2. Resumo do teste',
    ...linhas.map(([k, v]) => `* *${k}:* ${v}`),
    link ? `* *Faro:* ${link}` : null,
    '',
    'h2. Ficha de configuração do DY',
    'Copie campo a campo no console do Dynamic Yield. Nada aqui precisa ser inventado.',
    '',
    ficha,
    '',
    `_Gerada pelo Faro em ${ctx.sheet.generatedAt}._`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return {
    titulo,
    slackText: slack,
    jiraSummary: `[Faro] Configurar no DY: ${titulo}`,
    jiraDescription,
  };
}
