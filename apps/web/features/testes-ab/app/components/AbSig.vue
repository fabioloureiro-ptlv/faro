<script setup lang="ts">
// Chip de significância com seta: ▲ Melhora confirmada (98%) · — Sem tendência (71%) · ▼ Queda confirmada (0%).
import type { Sig } from '../composables/types';

defineProps<{ sig: Sig | null | undefined; curto?: boolean }>();
</script>

<template>
  <span v-if="sig" class="ab-sig" :class="`t-${sig.tom}`">{{ sig.seta }} {{ curto ? sig.rotulo.replace('Tendência de ', 'Tend. ').replace(' confirmada', '') : sig.rotulo }} <b>({{ sig.p }}%)</b></span>
  <span v-else class="muted">—</span>
</template>
