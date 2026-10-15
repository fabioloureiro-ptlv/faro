<script setup lang="ts">
// O Mapa temporal agora é uma aba da Visão Geral; o endereço antigo redireciona.
import { navigateTo, useRoute } from '#imports';

await navigateTo({ path: '/visao-geral', query: { bu: useRoute().query.bu, aba: 'mapa' } }, { replace: true });
</script>

<template>
  <div />
</template>
