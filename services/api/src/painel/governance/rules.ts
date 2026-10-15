import type {
  DyCampaignStatus,
  Experiment,
  ExperimentHealth,
  ExperimentStatus,
  GovernanceAlert,
  GovernanceRule,
  MetricResult,
} from '@faro/contracts';
import { missingDesignFields } from './design.ts';
import { DESIGN_FIELD_LABEL } from './labels.ts';

// PNL-08: uma função pura por regra. O motor junta as entradas D-1 de todas as frentes,
// avalia e devolve a lista de alertas abertos. Persistência de createdAt/resolvedAt entre
// cargas fica com quem chama (ver diffAlerts em notifications.ts).

export interface RuleContext {
  today: string; // YYYY-MM-DD
  campaign?: DyCampaignStatus;
  /** NORTE consolidada da melhor variante. */
  norte?: MetricResult;
  health?: ExperimentHealth;
  /** CFG-13 (frente 1): campos em que ficha e campanha no DY divergem. */
  divergences: string[];
}

export type RuleOutput = Pick<GovernanceAlert, 'severity' | 'message' | 'suggestedAction'>;
export type Rule = (e: Experiment, ctx: RuleContext) => RuleOutput | null;

export const SRM_P_THRESHOLD = 0.001;
export const SPLIT_EXTREME_THRESHOLD = 0.95;
export const NO_EXPOSURE_DAYS = 2; // 48 h, na granularidade diária do export
export const DECIDED_ACTIVE_CRITICAL_DAYS = 7; // meta do spec: zero decididos ativos após 7 dias

const DAY = 864e5;
const days = (from: string, to: string) =>
  Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (x: number, d = 0) =>
  (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const nf = (n: number) => n.toLocaleString('pt-BR');
const is = (e: Experiment, ...s: ExperimentStatus[]) => s.includes(e.status);
const armKeys = (e: Experiment) => ['controle', ...e.design.variants.map((v) => v.key)];

export const RULES: Record<Exclude<GovernanceRule, 'campanha_orfa'>, Rule> = {
  design_incompleto(e) {
    // Rascunho ainda está sendo escrito; o gate é da frente 1.
    if (is(e, 'rascunho', 'cancelado')) return null;
    const missing = missingDesignFields(e.design);
    if (missing.length === 0) return null;
    const fields = missing.map((f) => DESIGN_FIELD_LABEL[f]).join(', ');
    return {
      severity: 'atencao',
      message: e.legacy
        ? `Teste legado importado do DY. Falta registrar: ${fields}.`
        : `Design incompleto: falta ${fields}.`,
      suggestedAction: 'Completar o design para manter o histórico do aprendizado.',
    };
  },

  decidido_ativo(e, { campaign, today }) {
    if (!campaign?.active || !is(e, 'decidido', 'encerrado')) return null;
    if (e.status === 'encerrado') {
      return {
        severity: 'critico',
        message: 'Encerrado no Faro, mas a campanha continua ativa no DY.',
        suggestedAction: 'Desligar a campanha no DY.',
      };
    }
    const since = e.decision ? days(e.decision.decidedAt, today) : 0;
    return {
      severity: since > DECIDED_ACTIVE_CRITICAL_DAYS ? 'critico' : 'atencao',
      message: e.decision
        ? `Decidido em ${dm(e.decision.decidedAt)} e a campanha continua ativa no DY (${since} ${since === 1 ? 'dia' : 'dias'}).`
        : 'Decidido e a campanha continua ativa no DY.',
      suggestedAction: 'Desligar a campanha no DY e confirmar no checklist de encerramento.',
    };
  },

  split_extremo(e) {
    if (!is(e, 'configurado_no_dy', 'rodando', 'decidido')) return null;
    const max = Math.max(...e.allocation.split);
    if (max < SPLIT_EXTREME_THRESHOLD) return null;
    return {
      severity: 'atencao',
      message: `Um braço recebe ${pct(max)} do tráfego; os outros quase não acumulam amostra.`,
      suggestedAction: 'Encerrar o teste ou reequilibrar o split.',
    };
  },

  srm(e, { health }) {
    if (!is(e, 'rodando', 'decidido') || health?.srmPValue === undefined) return null;
    if (health.srmPValue >= SRM_P_THRESHOLD) return null;
    const users = armKeys(e).map((k) => health.usersByVariant[k] ?? 0);
    const total = users.reduce((a, b) => a + b, 0);
    const observed = users.map((u) => pct(total ? u / total : 0, 1)).join(' × ');
    const expected = e.allocation.split.map((s) => pct(s)).join(' × ');
    return {
      severity: 'critico',
      message: `Divisão observada ${observed} para ${expected} esperado (p < 0,001).`,
      suggestedAction: 'Investigar a alocação no DY antes de ler o resultado.',
    };
  },

  parada_antecipada(e, { norte, health }) {
    if (!is(e, 'rodando') || !norte?.label || !health?.plannedSamplePerArm) return null;
    if (norte.label !== 'melhora_confirmada' && norte.label !== 'queda_confirmada') return null;
    const minArm = Math.min(...armKeys(e).map((k) => health.usersByVariant[k] ?? 0));
    if (minArm >= health.plannedSamplePerArm) return null;
    const what = norte.label === 'melhora_confirmada' ? 'Melhora confirmada' : 'Queda confirmada';
    return {
      severity: 'atencao',
      message: `${what} na NORTE com ${pct(minArm / health.plannedSamplePerArm)} da amostra planejada (${nf(minArm)} de ${nf(health.plannedSamplePerArm)} por braço).`,
      suggestedAction: 'Manter rodando até a amostra planejada para evitar falso positivo.',
    };
  },

  passou_da_data(e, { today }) {
    if (!is(e, 'configurado_no_dy', 'rodando') || today <= e.allocation.endDate) return null;
    return {
      severity: 'atencao',
      message: `Fim previsto em ${dm(e.allocation.endDate)} (${days(e.allocation.endDate, today)} dias atrás).`,
      suggestedAction: 'Registrar a decisão ou estender o período com justificativa.',
    };
  },

  sem_exposicao(e, { campaign, today }) {
    if (!is(e, 'configurado_no_dy')) return null;
    // Antes do início não há exposição esperada.
    const configured = e.dy?.configuredAt ?? e.allocation.startDate;
    const since = configured > e.allocation.startDate ? configured : e.allocation.startDate;
    if (days(since, today) < NO_EXPOSURE_DAYS) return null;
    const last = campaign?.lastExposureDate;
    if (last && last >= since.slice(0, 10)) return null;
    return {
      severity: 'atencao',
      message: `Configurado no DY e sem exposição desde ${dm(since)}.`,
      suggestedAction: 'Conferir no DY se a campanha está ativa, publicada e com o label faro:.',
    };
  },

  divergencia_config(_e, { divergences }) {
    if (divergences.length === 0) return null;
    return {
      severity: 'atencao',
      message: `Ficha do Faro e campanha no DY divergem em: ${divergences.join(', ')}.`,
      suggestedAction: 'Corrigir a campanha no DY ou atualizar a ficha no Faro.',
    };
  },

  conflito_sem_resolucao(e) {
    if (is(e, 'encerrado', 'cancelado')) return null;
    const pending = (e.overlap ?? []).filter((o) => o.severity === 'alto' && !o.resolution);
    if (pending.length === 0) return null;
    return {
      severity: 'critico',
      message: `Sobreposição alta sem decisão com ${pending.map((o) => o.otherFaroId).join(', ')}.`,
      suggestedAction: 'Decidir entre exclusão mútua, rodar em paralelo ou reagendar.',
    };
  },
};

export interface GovernanceInput {
  experiments: readonly Experiment[];
  campaigns: readonly DyCampaignStatus[];
  /** NORTE consolidada (platform 'all'); outras linhas são ignoradas. */
  norteResults: readonly MetricResult[];
  health: readonly ExperimentHealth[];
  configDivergences?: Readonly<Record<string, string[]>>;
  today: string;
  /** Dono dos alertas sem squad (ex.: campanhas órfãs). */
  experimentationTeam: string;
}

const SEVERITY_RANK = { critico: 0, atencao: 1, info: 2 } as const;

function bestNorte(e: Experiment, results: readonly MetricResult[]): MetricResult | undefined {
  return results
    .filter(
      (r) =>
        r.faroId === e.faroId &&
        r.metricId === e.design.primaryMetricId &&
        r.platform === 'all' &&
        r.variantKey !== 'controle' &&
        r.probBetter !== undefined,
    )
    .sort((a, b) => (b.probBetter ?? 0) - (a.probBetter ?? 0))[0];
}

/** Campanhas ativas sem label `faro:` ou com label de experimento inexistente. */
export function orphanAlerts(input: GovernanceInput): GovernanceAlert[] {
  const known = new Set(input.experiments.map((e) => e.faroId));
  return input.campaigns
    .filter((c) => c.active)
    .flatMap((c): GovernanceAlert[] => {
      const faroLabels = c.labels.filter((l) => l.startsWith('faro:'));
      if (faroLabels.some((l) => known.has(l.slice('faro:'.length)))) return [];
      return [
        {
          id: `campanha_orfa:${c.campaignId}`,
          dyCampaignId: c.campaignId,
          rule: 'campanha_orfa',
          severity: 'atencao',
          message:
            faroLabels.length === 0
              ? `Campanha ativa no DY sem label faro: “${c.campaignName}”.`
              : `Campanha “${c.campaignName}” aponta para ${faroLabels.join(', ')}, que não existe no Faro.`,
          suggestedAction: 'Importar como legado.',
          owner: input.experimentationTeam,
          createdAt: input.today,
        },
      ];
    });
}

export function evaluateGovernance(input: GovernanceInput): GovernanceAlert[] {
  const campaignOf = new Map<string, DyCampaignStatus>();
  for (const c of input.campaigns) {
    for (const l of c.labels) if (l.startsWith('faro:')) campaignOf.set(l.slice('faro:'.length), c);
  }
  const healthOf = new Map(input.health.map((h) => [h.faroId, h]));

  const alerts: GovernanceAlert[] = [];
  for (const e of input.experiments) {
    const campaign = campaignOf.get(e.faroId);
    const ctx: RuleContext = {
      today: input.today,
      campaign,
      health: healthOf.get(e.faroId),
      norte: bestNorte(e, input.norteResults),
      divergences: input.configDivergences?.[e.faroId] ?? [],
    };
    for (const [rule, fn] of Object.entries(RULES) as [GovernanceRule, Rule][]) {
      const out = fn(e, ctx);
      if (!out) continue;
      alerts.push({
        id: `${rule}:${e.faroId}`,
        faroId: e.faroId,
        ...(campaign ? { dyCampaignId: campaign.campaignId } : {}),
        rule,
        ...out,
        owner: e.ownerEmail,
        createdAt: input.today,
      });
    }
  }
  alerts.push(...orphanAlerts(input));

  return alerts.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.faroId ?? a.dyCampaignId ?? '').localeCompare(b.faroId ?? b.dyCampaignId ?? '') ||
      a.rule.localeCompare(b.rule),
  );
}
