<script setup lang="ts">
// O Acompanhamento (Lista) foi incorporado à Visão Geral, aba "Rodando no DY"; o endereço antigo redireciona.
import { navigateTo, useRoute } from '#imports';

await navigateTo({ path: '/visao-geral', query: { bu: useRoute().query.bu, aba: 'dy' } }, { replace: true });
</script>

<template>
  <div />
</template>
