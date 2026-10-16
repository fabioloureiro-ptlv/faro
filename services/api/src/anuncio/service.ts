// Aviso do teste pronto: monta o resumo, abre (ou reaproveita) o card no Jira, posta no Slack marcando
// o PM que preencheu e registra `experiment.announced` no outbox. Usado pela rota e pela linha de comando.
import type { FaroEvent } from '@faro/contracts';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { appendEvent, listEvents } from '../experiments/repository.ts';
import type { ExperimentService } from '../experiments/service.ts';
import type { Ports } from '../ports.ts';
import { extraMentions } from './clients.ts';
import { buildAnuncio } from './resumo.ts';

export type DestinoStatus = 'enviado' | 'nao_configurado' | 'falhou';

export interface AnuncioResult {
  slack: { status: DestinoStatus; channel?: string };
  jira: { status: DestinoStatus; key?: string; url?: string };
  /** Texto enviado (ou que seria enviado) ao Slack, para a tela e o terminal mostrarem. */
  texto: string;
  /** Quem foi marcado no Slack (e-mails). */
  mencoes: string[];
}

export interface AnuncioDeps {
  svc: ExperimentService;
  db: Db;
  ports: Ports;
  log?: (msg: string) => void;
}

/** `dryRun` monta tudo e não envia nada (nem grava evento). */
export async function anunciarExperimento(
  deps: AnuncioDeps,
  faroId: string,
  actor: string,
  opts: { dryRun?: boolean } = {},
): Promise<AnuncioResult> {
  const { svc, db, ports } = deps;
  const log = deps.log ?? (() => {});
  const sheet = await svc.dySheet(faroId); // 409 se ainda não revisado
  const { experiment: exp } = await svc.get(faroId);
  if (!opts.dryRun && !ports.anuncio.slack && !ports.anuncio.jira)
    throw new HttpError(
      503,
      'aviso_nao_configurado',
      'Nenhum destino configurado: defina FARO_SLACK_* e/ou FARO_JIRA_* na API (services/api/.env).',
    );

  const pages = await ports.audience.pageCatalog();
  const metrics = await ports.metrics.list();
  const ctx = {
    metricName: (id: string) => metrics.find((m) => m.id === id)?.name ?? id,
    pageName: (id: string) => pages.pages.find((p) => p.id === id)?.name ?? id,
    sheet,
    webOrigin: process.env.FARO_WEB_ORIGIN,
  };
  const mencoes = [...new Set([exp.ownerEmail, ...extraMentions()])];

  // Reaproveita o card já aberto num aviso anterior (não duplica no Jira).
  const anterior = (await listEvents(db, { faroId })).find(
    (e) => e.type === 'experiment.announced',
  ) as (Extract<FaroEvent, { type: 'experiment.announced' }> & { id: number }) | undefined;
  const result: AnuncioResult = {
    slack: { status: 'nao_configurado' },
    jira: { status: 'nao_configurado' },
    texto: '',
    mencoes,
  };

  let jira = anterior?.payload.jira;
  if (jira) result.jira = { status: 'enviado', ...jira };
  else if (ports.anuncio.jira && !opts.dryRun) {
    const a = buildAnuncio(exp, ctx);
    try {
      jira = await ports.anuncio.jira.createIssue({
        summary: a.jiraSummary,
        description: a.jiraDescription,
      });
      result.jira = { status: 'enviado', ...jira };
    } catch (err) {
      log(`jira falhou: ${(err as Error).message}`);
      result.jira = { status: 'falhou' };
    }
  }

  const anuncio = buildAnuncio(exp, { ...ctx, jira });
  result.texto = anuncio.slackText;
  if (ports.anuncio.slack && !opts.dryRun) {
    try {
      const r = await ports.anuncio.slack.post(anuncio.slackText, { mentionEmails: mencoes });
      result.slack = { status: 'enviado', ...(r.channel ? { channel: r.channel } : {}) };
    } catch (err) {
      log(`slack falhou: ${(err as Error).message}`);
      result.slack = { status: 'falhou' };
    }
  }

  if (result.slack.status === 'enviado' || (result.jira.status === 'enviado' && !anterior)) {
    await appendEvent(db, {
      type: 'experiment.announced',
      faroId,
      occurredAt: ports.now().toISOString(),
      actor,
      payload: {
        ...(result.slack.status === 'enviado'
          ? { slack: result.slack.channel ? { channel: result.slack.channel } : {} }
          : {}),
        ...(jira ? { jira } : {}),
      },
    });
  }
  return result;
}
