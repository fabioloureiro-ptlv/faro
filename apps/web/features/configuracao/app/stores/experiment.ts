// Store do wizard (padrão CAL: componentes falam com useExperimentDraft, não com a store).
import { defineStore } from 'pinia';
import type { AudienceShortcut, Experiment, MetricDefinition, PageCatalog } from '@faro/contracts';
import {
  audienceChecks,
  effectiveBaseline,
  estimateDuration,
  evaluateDesignGate,
  overlapCheck,
  sampleSizePerGroup,
  unlockedSteps,
  type WizardStep,
} from '@faro/config-core';
import { ApiError, useFaroApi, type ExperimentSummary, type ServerView } from '../composables/useFaroApi';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const useExperimentStore = defineStore('configuracao/experiment', () => {
  const api = useFaroApi();
  const experiment = ref<Experiment | null>(null);
  const catalog = ref<MetricDefinition[]>([]);
  const pageCatalog = ref<PageCatalog | null>(null);
  const shortcuts = ref<AudienceShortcut[]>([]);
  const others = ref<ExperimentSummary[]>([]);
  const eligibleDaily = ref(0);
  const designRegistered = ref(true);
  const saveState = ref<SaveState>('idle');
  const savedAt = ref<string | null>(null);
  const saveError = ref<string | null>(null);
  let pending = false;
  let inFlight: Promise<void> | null = null;

  // ---- derivados locais (mesmo código que a API usa para revalidar)
  const gate = computed(() => experiment.value && evaluateDesignGate(experiment.value, new Set(catalog.value.map((m) => m.id))));
  const primaryMetric = computed(() => catalog.value.find((m) => m.id === experiment.value?.design.primaryMetricId));
  const sampleInput = computed(() => {
    const e = experiment.value;
    const m = primaryMetric.value;
    if (!e || !m) return null;
    return { metric: m, mdeRelative: e.design.mdeRelative, ...(e.design.baselineOverride != null ? { baselineOverride: e.design.baselineOverride } : {}) };
  });
  const nPerGroup = computed(() => (sampleInput.value ? sampleSizePerGroup(sampleInput.value) : null));
  const baseline = computed(() => (sampleInput.value ? effectiveBaseline(sampleInput.value) : undefined));
  const duration = computed(() => {
    const a = experiment.value?.allocation;
    if (!a) return null;
    return estimateDuration({ nPerGroup: nPerGroup.value, eligibleDaily: eligibleDaily.value, split: a.split, startDate: a.startDate, endDate: a.endDate });
  });
  const audience = computed(() => (experiment.value && duration.value ? audienceChecks(experiment.value, duration.value) : []));
  const overlap = computed(() => (experiment.value ? overlapCheck(experiment.value) : null));
  const unlocked = computed<WizardStep[]>(() => (gate.value && overlap.value ? unlockedSteps(gate.value, audience.value, overlap.value) : [1]));

  function applyServer(view: ServerView, full: boolean) {
    eligibleDaily.value = view.derived.eligibleDaily;
    designRegistered.value = view.derived.designRegistered;
    if (full || !experiment.value) {
      experiment.value = view.experiment;
      return;
    }
    // Só o que o servidor decide; as edições locais em andamento são preservadas.
    const e = experiment.value;
    e.status = view.experiment.status;
    e.updatedAt = view.experiment.updatedAt;
    e.overlap = view.experiment.overlap;
    e.dy = view.experiment.dy;
    if (view.experiment.audience.dyAttribute) e.audience.dyAttribute = view.experiment.audience.dyAttribute;
  }

  async function load(faroId: string) {
    const [view, metrics, pages, sc, list] = await Promise.all([
      api.get(faroId),
      api.metrics(),
      api.pages(),
      api.shortcuts(),
      api.list(),
    ]);
    catalog.value = metrics;
    pageCatalog.value = pages;
    shortcuts.value = sc;
    others.value = list;
    applyServer(view, true);
    saveState.value = 'idle';
  }

  function editableBody(e: Experiment) {
    return { name: e.name, bu: e.bu, ownerSquad: e.ownerSquad, design: e.design, audience: e.audience, allocation: e.allocation };
  }

  /** Autosave. Se houver edição durante o envio, salva de novo ao terminar. */
  async function save(): Promise<void> {
    if (!experiment.value) return;
    if (inFlight) {
      pending = true;
      return inFlight;
    }
    saveState.value = 'saving';
    inFlight = (async () => {
      try {
        const view = await api.patch(experiment.value!.faroId, editableBody(experiment.value!));
        applyServer(view, false);
        saveState.value = 'saved';
        savedAt.value = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        saveError.value = null;
      } catch (e) {
        saveState.value = 'error';
        saveError.value = e instanceof ApiError ? e.message : 'Falha ao salvar.';
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
    if (pending) {
      pending = false;
      await save();
    }
  }

  async function resolveOverlap(otherFaroId: string, resolution: 'exclusao_mutua' | 'paralelo' | 'reagendar') {
    if (!experiment.value) return;
    await save();
    const view = await api.patch(experiment.value.faroId, { overlapResolutions: [{ otherFaroId, resolution }] });
    applyServer(view, false);
  }

  async function setCampaignType(campaignType: 'custom_code' | 'api_custom' | 'recommendation') {
    if (!experiment.value) return;
    const view = await api.patch(experiment.value.faroId, { dy: { campaignType } });
    applyServer(view, false);
  }

  async function markReady() {
    await save();
    applyServer(await api.ready(experiment.value!.faroId), true);
  }

  async function confirm(body: { campaignId: string; configuredBy: string; configuredAt: string }) {
    applyServer(await api.confirm(experiment.value!.faroId, body), true);
  }

  /** Sugestões lidas do servidor sobre o estado salvo: salva antes de pedir. */
  async function suggestDates() {
    await save();
    return api.dateSuggestion(experiment.value!.faroId);
  }
  async function suggestMde() {
    await save();
    return api.mdeSuggestion(experiment.value!.faroId);
  }

  async function addMetric(input: Parameters<typeof api.createMetric>[0]) {
    const m = await api.createMetric(input);
    catalog.value = [...catalog.value, m];
    return m;
  }

  return {
    experiment, catalog, pageCatalog, shortcuts, others, eligibleDaily, designRegistered,
    saveState, savedAt, saveError,
    gate, primaryMetric, nPerGroup, baseline, duration, audience, overlap, unlocked,
    load, save, resolveOverlap, setCampaignType, markReady, confirm, addMetric, suggestDates, suggestMde,
  };
});
