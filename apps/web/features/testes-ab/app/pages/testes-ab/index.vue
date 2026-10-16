<script setup lang="ts">
// A aba "Teste AB" virou a Visão Geral; o endereço antigo continua funcionando.
import { navigateTo, useRoute } from '#imports';

await navigateTo({ path: '/visao-geral', query: { ...useRoute().query } }, { replace: true });
</script>

<template>
  <div />
</template>
