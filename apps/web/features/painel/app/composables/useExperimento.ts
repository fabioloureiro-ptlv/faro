import { computed, type Ref } from 'vue';
import { useFetch } from '#imports';
import { buildTimeline, headerTags, norteRows, type ExperimentDetail } from '../domain';
import { missingDesignFields } from '@faro/api/experiments/governance';

// Detalhe é leitura de um item só, sem estado compartilhado: useFetch basta (sem store).
export function useExperimento(faroId: Ref<string>) {
  // Unificação: detalhe vem da API Fastify (namespace /painel, para não colidir
  // com o GET /experiments/:faroId do wizard da frente 1).
  const cfg = useRuntimeConfig().public;
  const { data, error, status, refresh } = useFetch<ExperimentDetail>(
    () => `${cfg.apiBase}/painel/experiments/${encodeURIComponent(faroId.value)}`,
    { key: computed(() => `experimento:${faroId.value}`), headers: { 'x-faro-user': cfg.faroUser as string } },
  );

  const pageNames = computed(() => new Map((data.value?.pages ?? []).map((p) => [p.id, p.name])));
  const metricsById = computed(() => new Map((data.value?.metrics ?? []).map((m) => [m.id, m])));
  const pageName = (id: string) => pageNames.value.get(id) ?? id;

  return {
    data,
    error,
    status,
    refresh,
    pageName,
    metric: (id: string) => metricsById.value.get(id),
    tags: computed(() => (data.value ? headerTags(data.value.experiment, data.value.health, pageName) : [])),
    missingDesign: computed(() => (data.value ? missingDesignFields(data.value.experiment.design) : [])),
    norte: computed(() => (data.value ? norteRows(data.value.experiment, data.value.norteResults) : [])),
    timeline: computed(() => (data.value ? buildTimeline(data.value.events) : [])),
  };
}
