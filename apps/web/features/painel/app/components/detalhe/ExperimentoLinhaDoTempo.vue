<script setup lang="ts">
import { formatDateTime, type TimelineItem } from '../../domain';

defineProps<{ items: TimelineItem[] }>();
</script>

<template>
  <section class="bloco" aria-labelledby="tempo-titulo">
    <h2 id="tempo-titulo">Histórico</h2>
    <p v-if="items.length === 0" class="vazio">Sem histórico registrado.</p>
    <ol v-else>
      <li v-for="(it, i) in items" :key="`${it.at}-${i}`" :class="it.kind.replace('experiment.', '')">
        <time :datetime="it.at">{{ formatDateTime(it.at) }}</time>
        <strong>{{ it.title }}</strong>
        <p v-if="it.detail">{{ it.detail }}</p>
        <small>{{ it.actor }}</small>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.bloco {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
}
h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
.vazio {
  color: var(--muted);
  margin: 0;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 2px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
li {
  position: relative;
  display: flex;
  flex-direction: column;
}
li::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--brand);
}
li.decided::before {
  background: var(--ok);
}
li.design_changed::before,
li.allocation_changed::before {
  background: var(--warn);
}
time,
small {
  color: var(--muted);
  font-size: 12.5px;
}
small {
  overflow-wrap: anywhere;
}
p {
  margin: 2px 0;
  font-size: 14px;
}
</style>
