<script setup lang="ts">
// Título da aba do navegador: "Faro | <nome da aba>". Cada página informa só o nome.
useHead({ titleTemplate: (titulo?: string) => (titulo && titulo !== 'Faro' ? `Faro | ${titulo}` : 'Faro') });
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
