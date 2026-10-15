<script setup lang="ts">
// Ficha de configuração do DY (CFG-11): um bloco por campo, cada um com botão copiar.
import type { DySheet } from '@faro/contracts';

const props = defineProps<{ sheet: DySheet; markdownUrl: string }>();
const copied = ref<string | null>(null);
async function copy(key: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = key;
    setTimeout(() => copied.value === key && (copied.value = null), 2000);
  } catch {
    copied.value = null;
  }
}
const all = computed(() => props.sheet.blocks.map((b) => `${b.label}\n${b.value}`).join('\n\n'));
</script>

<template>
  <section aria-labelledby="sheet-title">
    <div class="spread" style="margin-bottom: 12px">
      <div>
        <h2 id="sheet-title">Ficha de configuração do DY</h2>
        <p class="small muted" style="margin: 0">Copie campo a campo no console do Dynamic Yield. Nada aqui precisa ser inventado.</p>
      </div>
      <div class="row">
        <button type="button" class="btn ghost small" @click="copy('__all', all)">{{ copied === '__all' ? 'Copiado' : 'Copiar tudo' }}</button>
        <a class="btn ghost small" :href="markdownUrl" download>Exportar Markdown</a>
      </div>
    </div>
    <ol class="blocks">
      <li v-for="b in sheet.blocks" :key="b.key" class="block">
        <div class="spread">
          <h3 :id="`b-${b.key}`">{{ b.label }}</h3>
          <button type="button" class="btn ghost small" :aria-describedby="`b-${b.key}`" @click="copy(b.key, b.value)">
            {{ copied === b.key ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <pre>{{ b.value }}</pre>
        <p v-if="b.hint" class="small muted" style="margin: 6px 0 0">{{ b.hint }}</p>
      </li>
    </ol>
    <p class="visually-hidden" aria-live="polite">{{ copied ? 'Copiado para a área de transferência' : '' }}</p>
  </section>
</template>

<style scoped>
.blocks { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.block { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--surface); }
pre { margin: 8px 0 0; padding: 10px 12px; background: var(--bg); border-radius: 8px; font: 13.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
</style>
