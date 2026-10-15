<script setup lang="ts">
// Etapa 2 — Público e alocação (CFG-08). Elegíveis por dia vêm da frente 3 (mock na API).
import type { Platform } from '@faro/contracts';
import { useExperimentDraft } from '../composables/useExperimentDraft';
import { PLATFORM_LABEL, fmtInt } from '../utils/labels';

const emit = defineEmits<{ next: [] }>();
const { experiment: exp, pageCatalog, shortcuts, eligibleDaily, nPerGroup, duration, audience, saveState } = useExperimentDraft();
const e = computed(() => exp.value!);
const a = computed(() => e.value.allocation);
const groups = computed(() => ['Controle', ...e.value.design.variants.map((v) => v.name)]);
const PLATS = Object.entries(PLATFORM_LABEL) as [Platform, string][];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
function pickShortcut(id: string) {
  const s = shortcuts.value.find((x) => x.id === id)!;
  e.value.audience = { description: s.name, source: 'atalho', estimatedShare: s.share, ...(s.dyAttribute ? { dyAttribute: s.dyAttribute } : {}) };
}
const activeShortcut = computed(() => shortcuts.value.find((s) => s.name.toLowerCase() === e.value.audience.description.trim().toLowerCase())?.id);
function onDescription(v: string) {
  const s = shortcuts.value.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
  if (s) return pickShortcut(s.id);
  e.value.audience = { description: v, source: 'manual', estimatedShare: e.value.audience.source === 'atalho' ? 1 : (e.value.audience.estimatedShare ?? 1) };
}
const sharePct = computed({
  get: () => Math.round((e.value.audience.estimatedShare ?? 1) * 1000) / 10,
  set: (v: number) => (e.value.audience.estimatedShare = Math.min(100, Math.max(0.1, Number(v) || 100)) / 100),
});
const splitPct = (i: number) => Math.round((a.value.split[i] ?? 0) * 1000) / 10;
function setSplit(i: number, v: number) {
  const next = [...a.value.split];
  next[i] = Math.max(0, Number(v) || 0) / 100;
  a.value.split = next;
}
const splitSum = computed(() => Math.round(a.value.split.reduce((s, x) => s + x, 0) * 1000) / 10);
const failing = computed(() => audience.value.filter((c) => !c.ok && c.id !== 'viabilidade'));
const tone = (lvl: string) => (lvl === 'bloqueio' ? 'riskp' : 'warnp');
const slack = computed(() => (duration.value?.periodDays != null && duration.value.durationDays != null ? duration.value.periodDays - duration.value.durationDays : null));
</script>

<template>
  <div class="grid2">
    <div class="panel">
      <h2>Público e alocação</h2>
      <p class="small muted" style="margin: 0 0 18px">Onde o teste aparece e para quem.</p>

      <fieldset class="field">
        <legend>Plataformas</legend>
        <div class="chips">
          <button v-for="[k, l] in PLATS" :key="k" type="button" class="chip" :aria-pressed="a.platforms.includes(k)" @click="a.platforms = toggle(a.platforms, k)">{{ l }}</button>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Páginas</legend>
        <div class="chips">
          <button v-for="p in pageCatalog?.pages ?? []" :key="p.id" type="button" class="chip" :aria-pressed="a.pages.includes(p.id)" @click="a.pages = toggle(a.pages, p.id)">{{ p.name }}</button>
        </div>
      </fieldset>

      <div class="field">
        <label for="f-aud">Quem entra no teste</label>
        <p id="h-aud" class="hint">Descreva o público com as palavras do seu time: categoria comprada, espécie, plano, região, comportamento.</p>
        <input id="f-aud" :value="e.audience.description" type="text" aria-describedby="h-aud" placeholder="Ex.: pessoas que compraram tapete higiênico nos últimos 90 dias" @input="onDescription(($event.target as HTMLInputElement).value)">
        <p class="small muted" style="margin: 10px 0 6px">Atalhos</p>
        <div class="chips" role="group" aria-label="Atalhos de público">
          <button v-for="s in shortcuts" :key="s.id" type="button" class="chip" :aria-pressed="activeShortcut === s.id" @click="pickShortcut(s.id)">{{ s.name }}</button>
        </div>
      </div>

      <div class="pair">
        <div class="field">
          <label for="f-share">Tamanho estimado (% da base)</label>
          <p class="hint">Se não souber, deixe 100 e o time de dados ajusta.</p>
          <input id="f-share" v-model.number="sharePct" type="number" min="0.1" max="100" step="any" :disabled="e.audience.source === 'atalho'">
        </div>
        <div class="field">
          <label for="f-tr">Tráfego no experimento: {{ a.trafficPercent }}%</label>
          <p class="hint">Parte do público elegível que entra no teste. O resto fica livre para outros testes.</p>
          <input id="f-tr" v-model.number="a.trafficPercent" type="range" min="5" max="100" step="5" style="width: 100%; accent-color: var(--brand)">
        </div>
      </div>

      <fieldset class="field">
        <legend>Divisão entre grupos (%)</legend>
        <div class="split">
          <label v-for="(g, i) in groups" :key="g">
            <span class="sub">{{ g }}</span>
            <input type="number" min="0" max="100" step="any" :value="splitPct(i)" @change="setSplit(i, +($event.target as HTMLInputElement).value)">
          </label>
        </div>
        <p v-if="splitSum !== 100" class="err">A divisão soma {{ splitSum.toLocaleString('pt-BR') }}%. Ajuste para 100%.</p>
      </fieldset>

      <div class="pair">
        <div class="field"><label for="f-st">Início</label><input id="f-st" v-model="a.startDate" type="date"></div>
        <div class="field"><label for="f-en">Fim</label><input id="f-en" v-model="a.endDate" type="date" :min="a.startDate || undefined"></div>
      </div>
    </div>

    <div class="sticky">
      <section class="panel" aria-labelledby="est-title" aria-live="polite">
        <h2 id="est-title">Estimativa</h2>
        <div class="stat"><span class="small muted">Usuários elegíveis por dia</span><b>{{ fmtInt(eligibleDaily) }}</b><span v-if="saveState === 'saving'" class="small muted">atualizando…</span></div>
        <div class="stat"><span class="small muted">Amostra por grupo</span><b>{{ nPerGroup ? fmtInt(nPerGroup) : '–' }}</b></div>
        <div class="stat"><span class="small muted">Amostra total ({{ groups.length }} grupos)</span><b>{{ duration?.totalSample ? fmtInt(duration.totalSample) : '–' }}</b></div>
        <div class="stat"><span class="small muted">Duração mínima</span><b>{{ duration?.durationDays ? `${duration.durationDays} dias` : '–' }}</b></div>
        <div v-for="al in duration?.alerts ?? []" :key="al.code" class="callout" :class="tone(al.level)">{{ al.message }}</div>
        <div v-if="duration && !duration.alerts.length && slack != null" class="callout okp">Cabe no período, com {{ slack }} dias de folga.</div>
        <ul v-if="failing.length" class="todo small">
          <li v-for="c in failing" :key="c.id">{{ c.message }}</li>
        </ul>
        <button type="button" class="btn" style="width: 100%; margin-top: 16px" :disabled="!audience.every((c) => c.ok)" @click="emit('next')">Checar sobreposição</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.stat b { font-size: 22px; letter-spacing: -0.02em; }
.split { display: flex; gap: 12px; flex-wrap: wrap; }
.split label { display: flex; flex-direction: column; width: 140px; }
.todo { margin: 12px 0 0; padding-left: 18px; color: var(--warn); }
</style>
