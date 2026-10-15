<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '#imports';

// Alterna entre as visões do painel preservando a BU escolhida (segmentos é global).
const route = useRoute();
const query = computed(() => (route.query.bu ? { bu: route.query.bu } : {}));
</script>

<template>
  <nav class="nav" aria-label="Visões do painel">
    <NuxtLink :to="{ path: '/painel', query }" :class="{ on: route.path === '/painel' }">Lista</NuxtLink>
    <NuxtLink :to="{ path: '/painel/mapa', query }" :class="{ on: route.path === '/painel/mapa' }">
      Mapa temporal
    </NuxtLink>
    <NuxtLink to="/segmento" :class="{ on: route.path === '/segmento' }">Segmentos</NuxtLink>
  </nav>
</template>

<style scoped>
.nav {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  background: var(--brand-soft);
  border-radius: 999px;
  padding: 3px;
}
a {
  padding: 5px 14px;
  border-radius: 999px;
  text-decoration: none;
  color: var(--ink);
  font-weight: 600;
  font-size: 14px;
}
a.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
</style>
