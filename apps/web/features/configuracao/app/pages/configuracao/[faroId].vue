<script setup lang="ts">
// Wizard de cadastro em 4 etapas (CFG-01). Estado salvo automaticamente como rascunho.
import type { WizardStep } from '@faro/config-core';
import { ApiError } from '../../composables/useFaroApi';
import { useAutosave, useExperimentDraft } from '../../composables/useExperimentDraft';

const route = useRoute();
const router = useRouter();
const faroId = computed(() => String(route.params.faroId));
const { experiment, unlocked, saveState, savedAt, saveError, load } = useExperimentDraft();
const loadError = ref('');

await load(faroId.value).catch((e) => (loadError.value = e instanceof ApiError ? e.message : 'Não foi possível carregar o experimento.'));
useAutosave();
useHead({ title: () => `Novo Experimento · ${experiment.value?.name || faroId.value}` });

const step = computed<WizardStep>(() => {
  const n = Number(route.query.etapa ?? 1) as WizardStep;
  return unlocked.value.includes(n) ? n : 1;
});
function go(n: WizardStep) {
  if (!unlocked.value.includes(n)) return;
  router.push({ query: { ...route.query, etapa: String(n) } });
  if (import.meta.client) window.scrollTo({ top: 0 });
}
const configured = computed(() => experiment.value && !['rascunho', 'design_completo', 'pronto_para_configurar'].includes(experiment.value.status));
</script>

<template>
  <div v-if="loadError" class="panel">
    <h1>Experimento indisponível</h1>
    <p class="err">{{ loadError }}</p>
    <NuxtLink to="/configuracao">Voltar para a lista</NuxtLink>
  </div>
  <div v-else-if="experiment">
    <NuxtLink to="/configuracao" class="back">← Experimentos</NuxtLink>
    <div class="spread">
      <div>
        <h1>{{ experiment.name || 'Novo experimento' }}</h1>
        <p class="small muted" style="margin: 0 0 18px">
          {{ experiment.faroId }} · <CfgStatusPill :status="experiment.status" />
        </p>
      </div>
      <p class="small save" :class="saveState" role="status" aria-live="polite">
        <template v-if="saveState === 'saving'">Salvando…</template>
        <template v-else-if="saveState === 'saved'">Rascunho salvo às {{ savedAt }}</template>
        <template v-else-if="saveState === 'error'">Não salvou: {{ saveError }}</template>
      </p>
    </div>
    <p v-if="configured" class="banner">Já configurado no DY. Mudanças no design ficam registradas na auditoria com autor e data.</p>
    <CfgSteps :current="step" :unlocked="unlocked" @go="go" />
    <CfgStepDesign v-if="step === 1" @next="go(2)" />
    <CfgStepAudience v-else-if="step === 2" @next="go(3)" />
    <CfgStepOverlap v-else-if="step === 3" @next="go(4)" />
    <CfgStepReview v-else @edit="go(1)" />
  </div>
</template>

<style scoped>
.back { color: var(--muted); font-weight: 600; margin-bottom: 14px; display: inline-block; text-decoration: none; }
.back:hover { color: var(--ink); }
.save { color: var(--muted); margin: 8px 0 0; }
.save.error { color: var(--risk); }
</style>
