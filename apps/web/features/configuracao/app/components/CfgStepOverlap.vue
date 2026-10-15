<script setup lang="ts">
// Etapa 3 — Sobreposição (CFG-09). Conflitos vêm da frente 3; médio e alto exigem decisão.
import type { OverlapDecision } from '@faro/contracts';
import { useExperimentDraft } from '../composables/useExperimentDraft';
import { fmtDate, fmtInt, fmtPct } from '../utils/labels';

const emit = defineEmits<{ next: [] }>();
const { experiment: exp, others, eligibleDaily, overlap, resolveOverlap } = useExperimentDraft();
const list = computed(() => exp.value?.overlap ?? []);
const busy = ref<string | null>(null);
const error = ref('');
const SEV: Record<OverlapDecision['severity'], [string, string]> = { alto: ['Risco alto', 'riskp'], medio: ['Risco médio', 'warnp'], baixo: ['Risco baixo', 'okp'] };
const RES = [
  ['exclusao_mutua', 'Exclusão mútua', 'Cada usuário cai em só um dos testes. Resultados limpos, mas cada teste recebe menos tráfego.'],
  ['paralelo', 'Rodar em paralelo', 'Usuários podem ver os dois testes. Aceitável quando as mudanças não interagem.'],
  ['reagendar', 'Reagendar', 'Começar este teste depois que o outro terminar.'],
] as const;
const other = (id: string) => others.value.find((o) => o.faroId === id);
const pending = computed(() => list.value.filter((o) => o.severity !== 'baixo' && !o.resolution).length);

async function choose(o: OverlapDecision, r: (typeof RES)[number][0]) {
  busy.value = o.otherFaroId;
  error.value = '';
  try {
    await resolveOverlap(o.otherFaroId, r);
  } catch {
    error.value = 'Não foi possível salvar a decisão. Tente de novo.';
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="grid2">
    <div>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div v-if="!list.length" class="panel">
        <h2>Sem sobreposição</h2>
        <p class="muted" style="margin: 0">Nenhum teste ativo ou agendado disputa as mesmas páginas, plataformas e público nesse período.</p>
      </div>
      <article v-for="o in list" :key="o.otherFaroId" class="conf" :class="o.severity">
        <div class="spread">
          <div>
            <h3>{{ other(o.otherFaroId)?.name ?? o.otherFaroId }}</h3>
            <div class="small muted">{{ o.otherFaroId }} · {{ other(o.otherFaroId)?.ownerSquad }}</div>
          </div>
          <span class="pill" :class="SEV[o.severity][1]">{{ SEV[o.severity][0] }}</span>
        </div>
        <p class="small" style="margin: 12px 0 0">
          Cerca de <b>{{ fmtInt(o.estimatedDailyUsers) }}</b> usuários por dia veriam os dois testes
          ({{ fmtPct(o.estimatedDailyUsers / Math.max(1, eligibleDaily)) }} do público deste teste).
        </p>
        <p v-if="o.severity === 'baixo'" class="small muted" style="margin: 8px 0 0">Impacto pequeno. Pode seguir sem ação.</p>
        <fieldset v-else class="radio" :disabled="busy === o.otherFaroId">
          <legend class="visually-hidden">Como resolver o conflito com {{ other(o.otherFaroId)?.name ?? o.otherFaroId }}</legend>
          <label v-for="[k, t, h] in RES" :key="k">
            <input type="radio" :name="`r-${o.otherFaroId}`" :value="k" :checked="o.resolution === k" @change="choose(o, k)">
            <span><b>{{ t }}</b><br><span class="muted">{{ h }}</span></span>
          </label>
          <p v-if="o.decidedBy" class="small muted" style="margin: 4px 0 0">Decidido por {{ o.decidedBy }} em {{ fmtDate(o.decidedAt ?? '') }}.</p>
        </fieldset>
      </article>
    </div>
    <div class="sticky">
      <section class="panel" aria-live="polite">
        <h2>Sobreposição</h2>
        <div class="stat"><span class="small muted">Testes que cruzam com este</span><b>{{ list.length }}</b></div>
        <div class="stat"><span class="small muted">Pendentes de decisão</span><b>{{ pending }}</b></div>
        <p class="small muted">Riscos médio e alto precisam de uma decisão antes da revisão.</p>
        <button type="button" class="btn" style="width: 100%" :disabled="!overlap?.ok" @click="emit('next')">Revisar experimento</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.conf { border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; background: var(--surface); }
.conf.alto { border-color: color-mix(in srgb, var(--risk) 50%, var(--line)); }
.radio { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 0; border: 0; padding: 0; }
.radio label { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; cursor: pointer; font-size: 14px; }
.radio input { margin-top: 4px; accent-color: var(--brand); }
.radio label:has(input:checked) { border-color: var(--brand); background: var(--brand-soft); }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.stat b { font-size: 22px; letter-spacing: -0.02em; }
</style>
