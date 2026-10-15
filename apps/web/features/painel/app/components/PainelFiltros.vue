<script setup lang="ts">
import { EXPERIMENT_STATUSES, PlatformSchema } from '@faro/contracts';
import type { ExperimentStatus, PageDefinition, Platform } from '@faro/contracts';
import { PLATFORM_LABEL, STATUS_LABEL, type PainelFilters } from '../domain';
import PainelBuTabs from './PainelBuTabs.vue';

const props = defineProps<{
  filters: PainelFilters;
  squads: string[];
  pages: PageDefinition[];
  shown: number;
  total: number;
}>();

const emit = defineEmits<{ update: [patch: Partial<PainelFilters>]; reset: [] }>();

function toggleStatus(s: ExperimentStatus) {
  const cur = props.filters.status;
  emit('update', { status: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] });
}

const one = (v: string) => (v ? [v] : []);
const value = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
</script>

<template>
  <section class="filtros" aria-label="Filtros">
    <PainelBuTabs :bu="filters.bu" @select="(bu) => emit('update', { bu })" />

    <div class="linha">
      <label class="busca">
        <span class="sr-only">Buscar</span>
        <input
          type="search"
          placeholder="Buscar por nome, FARO-…, campanha no DY ou texto do design"
          :value="filters.q"
          maxlength="120"
          @input="emit('update', { q: value($event) })"
        />
      </label>

      <label>
        <span>Squad</span>
        <select :value="filters.squad[0] ?? ''" @change="emit('update', { squad: one(value($event)) })">
          <option value="">Todos</option>
          <option v-for="s in squads" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>

      <label>
        <span>Plataforma</span>
        <select
          :value="filters.platform[0] ?? ''"
          @change="emit('update', { platform: one(value($event)) as Platform[] })"
        >
          <option value="">Todas</option>
          <option v-for="p in PlatformSchema.options" :key="p" :value="p">{{ PLATFORM_LABEL[p] }}</option>
        </select>
      </label>

      <label>
        <span>Página</span>
        <select :value="filters.page[0] ?? ''" @change="emit('update', { page: one(value($event)) })">
          <option value="">Todas</option>
          <option v-for="p in pages" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>

      <label>
        <span>De</span>
        <input
          type="date"
          :value="filters.from ?? ''"
          @change="emit('update', { from: value($event) || undefined })"
        />
      </label>
      <label>
        <span>Até</span>
        <input
          type="date"
          :value="filters.to ?? ''"
          @change="emit('update', { to: value($event) || undefined })"
        />
      </label>
    </div>

    <div class="linha">
      <fieldset class="status">
        <legend class="sr-only">Status</legend>
        <button
          v-for="s in EXPERIMENT_STATUSES"
          :key="s"
          type="button"
          :aria-pressed="filters.status.includes(s)"
          :class="{ on: filters.status.includes(s) }"
          @click="toggleStatus(s)"
        >
          {{ STATUS_LABEL[s] }}
        </button>
      </fieldset>

      <label class="check">
        <input
          type="checkbox"
          :checked="filters.hasAlert"
          @change="emit('update', { hasAlert: checked($event) })"
        />
        Só com alerta
      </label>
      <label class="check">
        <input
          type="checkbox"
          :checked="filters.legacy"
          @change="emit('update', { legacy: checked($event) })"
        />
        Legado sem design
      </label>

      <span class="contagem" aria-live="polite">{{ shown }} de {{ total }} testes</span>
      <button type="button" class="limpar" @click="emit('reset')">Limpar filtros</button>
    </div>
  </section>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.linha {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: flex-end;
}
label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  color: var(--muted);
}
input,
select {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 8px;
  padding: 6px 10px;
  min-height: 36px;
  font-size: 14px;
}
.busca {
  flex: 1 1 280px;
}
.status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border: 0;
  margin: 0;
  padding: 0;
}
.status button {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 13px;
  cursor: pointer;
}
.status button.on {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--on-brand);
}
.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--ink);
}
.check input {
  min-height: auto;
}
.contagem {
  margin-left: auto;
  color: var(--muted);
  font-size: 13px;
}
.limpar {
  border: 0;
  background: none;
  color: var(--brand);
  font-weight: 600;
  cursor: pointer;
  padding: 6px 4px;
}
</style>
