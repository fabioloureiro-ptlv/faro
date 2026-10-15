<script setup lang="ts">
import type { GateResult } from '@faro/config-core';

defineProps<{ gate: GateResult }>();
const emit = defineEmits<{ next: [] }>();
</script>

<template>
  <section class="gatebox" aria-labelledby="gate-title">
    <h2 id="gate-title">{{ gate.complete ? 'Design completo' : 'Design obrigatório' }}</h2>
    <p class="small muted" style="margin: 0">
      {{ gate.complete ? 'Público e sobreposição liberados.' : 'Preencha os itens abaixo para liberar o restante.' }}
    </p>
    <div
      class="meter"
      role="progressbar"
      :aria-valuenow="gate.done"
      aria-valuemin="0"
      :aria-valuemax="gate.total"
      :aria-valuetext="`${gate.done} de ${gate.total} itens`"
    >
      <span :style="{ width: `${(gate.done / gate.total) * 100}%` }" />
    </div>
    <ul class="checks">
      <li v-for="c in gate.checks" :key="c.id" :class="{ ok: c.ok }">
        <span class="tick" aria-hidden="true" />
        <span>
          {{ c.label }}<span class="visually-hidden">: {{ c.ok ? 'ok' : 'pendente' }}</span>
          <span v-if="!c.ok && c.message" class="msg">{{ c.message }}</span>
        </span>
      </li>
    </ul>
    <button type="button" class="btn gate" style="width: 100%" :disabled="!gate.complete" @click="emit('next')">Liberar público</button>
  </section>
</template>

<style scoped>
.gatebox { border-radius: 16px; padding: 20px; background: var(--gate-soft); border: 1px solid color-mix(in srgb, var(--gate) 55%, transparent); }
.meter { height: 10px; border-radius: 999px; background: color-mix(in srgb, var(--gate) 25%, var(--surface)); overflow: hidden; margin: 12px 0 14px; }
.meter span { display: block; height: 100%; background: var(--gate); transition: width 0.35s ease; }
.checks { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-direction: column; gap: 7px; font-size: 14px; }
.checks li { display: flex; gap: 9px; align-items: flex-start; }
.tick { flex: none; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--muted); margin-top: 2px; display: grid; place-items: center; }
.checks li.ok .tick { background: var(--ok); border-color: var(--ok); }
.checks li.ok .tick::after { content: ''; width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg) translate(-1px, -1px); }
.checks li.ok { color: var(--muted); }
.msg { display: block; font-size: 12.5px; color: var(--warn); }
</style>
