<script setup lang="ts">
// Título da aba do navegador: "Faro Experimentos | <nome da aba>". Cada página informa só o nome.
useHead({
  titleTemplate: (titulo?: string) =>
    titulo && titulo !== 'Faro Experimentos' ? `Faro Experimentos | ${titulo}` : 'Faro Experimentos',
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
