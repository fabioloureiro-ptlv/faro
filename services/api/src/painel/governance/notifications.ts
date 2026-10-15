import type { Bu, Experiment, GovernanceAlert } from '@faro/contracts';
import { RULE_LABEL } from './labels.ts';

// PNL-13: alerta novo vai para o dono do teste (e-mail) e para o canal do Slack da BU.
// Envio real fica atrás de `Notifier`; nenhum token ou webhook vive no código.

export interface NotificationRouting {
  /** Canal por BU. Pergunta em aberto no spec: quais canais. */
  slackChannelByBu: Partial<Record<Bu, string>>;
  /** Canal do time de experimentação: órfãs e BU sem canal configurado. */
  defaultSlackChannel?: string;
}

export type NotificationTarget = { kind: 'email'; to: string } | { kind: 'slack'; channel: string };

export interface AlertNotification {
  alertId: string;
  target: NotificationTarget;
  subject: string;
  text: string;
}

export interface Notifier {
  send(n: AlertNotification): Promise<void>;
}

/** Notifier de desenvolvimento/teste: só guarda o que seria enviado. */
export class InMemoryNotifier implements Notifier {
  readonly sent: AlertNotification[] = [];
  async send(n: AlertNotification) {
    this.sent.push(n);
  }
}

export interface AlertDiff {
  opened: GovernanceAlert[];
  /** Alertas da carga anterior que não aparecem mais (resolvidos). */
  resolved: GovernanceAlert[];
  /** Continuam abertos; preservam o createdAt original. */
  ongoing: GovernanceAlert[];
}

/** Compara a avaliação de hoje com os alertas abertos da carga anterior (ids determinísticos). */
export function diffAlerts(
  previous: readonly GovernanceAlert[],
  current: readonly GovernanceAlert[],
  today: string,
): AlertDiff {
  const prev = new Map(previous.filter((a) => !a.resolvedAt).map((a) => [a.id, a]));
  const curIds = new Set(current.map((a) => a.id));
  return {
    opened: current.filter((a) => !prev.has(a.id)),
    ongoing: current
      .filter((a) => prev.has(a.id))
      .map((a) => ({ ...a, createdAt: prev.get(a.id)!.createdAt })),
    resolved: [...prev.values()].filter((a) => !curIds.has(a.id)).map((a) => ({ ...a, resolvedAt: today })),
  };
}

const SEVERITY_TEXT = { critico: 'Crítico', atencao: 'Atenção', info: 'Info' } as const;

export function planNotifications(
  opened: readonly GovernanceAlert[],
  experiments: readonly Experiment[],
  routing: NotificationRouting,
): AlertNotification[] {
  const byId = new Map(experiments.map((e) => [e.faroId, e]));
  return opened.flatMap((a) => {
    const exp = a.faroId ? byId.get(a.faroId) : undefined;
    const subject = `[Faro · ${SEVERITY_TEXT[a.severity]}] ${RULE_LABEL[a.rule]}${exp ? ` · ${exp.name}` : ''}`;
    const text = [
      exp ? `${exp.faroId} · ${exp.name}` : `Campanha ${a.dyCampaignId}`,
      a.message,
      `Ação sugerida: ${a.suggestedAction}`,
    ].join('\n');

    const out: AlertNotification[] = [
      { alertId: a.id, target: { kind: 'email', to: a.owner }, subject, text },
    ];
    // DECISAO-PENDENTE: teste `ecossistema` usa o canal configurado para `ecossistema`, senão o padrão.
    const channel = (exp && routing.slackChannelByBu[exp.bu]) || routing.defaultSlackChannel;
    if (channel) out.push({ alertId: a.id, target: { kind: 'slack', channel }, subject, text });
    return out;
  });
}

/** Envia uma a uma; falha de um destino não impede os outros. Não loga destinatários. */
export async function dispatch(
  notifier: Notifier,
  notifications: readonly AlertNotification[],
): Promise<{ sent: number; failed: { alertId: string; kind: NotificationTarget['kind'] }[] }> {
  let sent = 0;
  const failed: { alertId: string; kind: NotificationTarget['kind'] }[] = [];
  for (const n of notifications) {
    try {
      await notifier.send(n);
      sent++;
    } catch {
      failed.push({ alertId: n.alertId, kind: n.target.kind });
    }
  }
  return { sent, failed };
}
