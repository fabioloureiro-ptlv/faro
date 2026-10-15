<script setup lang="ts">
// Modal para escolher o segmento do catálogo: busca em cima, lista embaixo. Usa o <dialog> nativo
// (showModal): foco preso no modal, Esc fecha e o fundo fica inerte sem código extra.
import type { AudienceShortcut } from '@faro/contracts';

const props = defineProps<{ shortcuts: AudienceShortcut[]; selectedId?: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ select: [id: string] }>();

const dialog = ref<HTMLDialogElement>();
const searchInput = ref<HTMLInputElement>();
const q = ref('');

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const filtered = computed(() => {
  const t = norm(q.value.trim());
  if (!t) return props.shortcuts;
  return props.shortcuts.filter((s) => norm([s.name, s.id, s.origin?.label ?? '', s.dyAttribute ?? ''].join(' ')).includes(t));
});
const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const nParams = (s: AudienceShortcut) => s.parameters?.length ?? 0;

watch(open, async (aberto) => {
  const d = dialog.value;
  if (!d) return;
  if (aberto && !d.open) {
    q.value = '';
    d.showModal();
    await nextTick();
    searchInput.value?.focus();
  } else if (!aberto && d.open) {
    d.close();
  }
});

// Esc ou d.close(): mantém o estado do pai em dia.
function onClose() {
  open.value = false;
}
// Clique no fundo escurecido: o alvo é o próprio <dialog>, não o conteúdo.
function onBackdrop(ev: MouseEvent) {
  if (ev.target === dialog.value) open.value = false;
}
function pick(id: string) {
  emit('select', id);
  open.value = false;
}
function pickFirst() {
  const first = filtered.value[0];
  if (first) pick(first.id);
}
</script>

<template>
  <dialog ref="dialog" class="picker" aria-labelledby="picker-title" @close="onClose" @click="onBackdrop">
    <div class="box">
      <div class="top">
        <h2 id="picker-title">Escolher segmento</h2>
        <button type="button" class="btn ghost small" @click="open = false">Fechar</button>
      </div>
      <label class="visually-hidden" for="picker-busca">Buscar segmento</label>
      <input
        id="picker-busca"
        ref="searchInput"
        v-model="q"
        type="search"
        autocomplete="off"
        placeholder="Buscar por nome, origem ou atributo"
        @keydown.enter.prevent="pickFirst"
      >
      <p class="small muted count" aria-live="polite">{{ filtered.length }} de {{ shortcuts.length }} segmentos</p>
      <ul class="lista">
        <li v-for="s in filtered" :key="s.id">
          <button type="button" class="item" :class="{ on: s.id === selectedId }" :aria-pressed="s.id === selectedId" @click="pick(s.id)">
            <span class="nome">{{ s.name }}</span>
            <span v-if="s.id === selectedId" class="pill okp">Selecionado</span>
            <span class="meta">
              {{ s.origin?.label ?? 'Informado pelo time' }} · {{ pct(s.share) }} da base
              <template v-if="nParams(s)"> · {{ nParams(s) }} {{ nParams(s) === 1 ? 'parâmetro' : 'parâmetros' }}</template>
            </span>
          </button>
        </li>
        <li v-if="!filtered.length" class="vazio">Nenhum segmento encontrado para “{{ q }}”.</li>
      </ul>
    </div>
  </dialog>
</template>

<style scoped>
.picker { border: 1px solid var(--line); border-radius: 16px; padding: 0; width: min(560px, calc(100vw - 32px)); background: var(--surface); color: var(--ink); box-shadow: 0 24px 60px rgb(0 0 0 / 0.25); }
.picker::backdrop { background: rgb(20 16 30 / 0.5); }
.box { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.top h2 { margin: 0; }
input[type='search'] { width: 100%; }
.count { margin: 0; }
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: min(52vh, 420px); overflow-y: auto; }
.item { width: 100%; text-align: left; display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); font: inherit; cursor: pointer; }
.item:hover { border-color: var(--brand); background: var(--brand-soft); }
.item.on { border-color: var(--brand); background: var(--brand-soft); }
.nome { font-weight: 700; }
.meta { grid-column: 1 / -1; font-size: 13px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.vazio { padding: 16px 4px; color: var(--muted); }
</style>
