<script setup lang="ts">
import { useRoute } from '#imports';

// Dois destinos: montar um teste (frente 1) e acompanhar os que existem (painel, mapa e segmentos).
const route = useRoute();
const under = (base: string) => route.path === base || route.path.startsWith(`${base}/`);
const novoAtivo = computed(() => under('/configuracao'));
const painelAtivo = computed(() => under('/painel') || under('/segmento'));
</script>

<template>
  <div class="app">
    <aside>
      <NuxtLink to="/painel" class="logo">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <rect width="34" height="34" rx="10" fill="var(--brand)" />
          <circle cx="12" cy="13" r="3" fill="var(--gate)" />
          <circle cx="22" cy="13" r="3" fill="var(--on-brand)" />
          <path d="M9 22c3 3 13 3 16 0" stroke="var(--on-brand)" stroke-width="2.4" fill="none" stroke-linecap="round" />
        </svg>
        <span>Faro<small>Experimentos Petlove</small></span>
      </NuxtLink>
      <nav aria-label="Principal">
        <NuxtLink to="/configuracao" :class="{ active: novoAtivo }" :aria-current="novoAtivo ? 'page' : undefined">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M9 5.5v7M5.5 9h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <span>Novo Experimento</span>
        </NuxtLink>
        <NuxtLink to="/painel" :class="{ active: painelAtivo }" :aria-current="painelAtivo ? 'page' : undefined">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2 14.5V3.5M2 14.5h14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
            <path d="M5.5 11l3-3.5 2.5 2 3.5-5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>
            <span class="longo">Acompanhamento de Experimentos</span>
            <span class="curto">Acompanhamento</span>
          </span>
        </NuxtLink>
      </nav>
    </aside>
    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }
aside { border-right: 1px solid var(--line); padding: 28px 18px; position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 28px; }
.logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 22px; letter-spacing: -0.02em; color: var(--ink); text-decoration: none; }
.logo small { display: block; font-weight: 500; font-size: 12px; color: var(--muted); letter-spacing: 0; }
nav { display: flex; flex-direction: column; gap: 4px; }
nav a { display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; border-radius: 10px; font-weight: 500; color: var(--muted); text-decoration: none; line-height: 1.3; }
nav a svg { flex: none; margin-top: 1px; }
nav a:hover, nav a.active { color: var(--ink); background: var(--brand-soft); }
nav a.active { font-weight: 700; }
nav a.active svg { color: var(--brand); }
.curto { display: none; }
main { padding: 36px clamp(16px, 4vw, 48px) 80px; max-width: 1180px; width: 100%; min-width: 0; }
@media (max-width: 900px) {
  .app { grid-template-columns: 1fr; }
  aside { position: sticky; height: auto; flex-direction: row; align-items: center; flex-wrap: wrap; padding: 12px 16px; gap: 8px 16px; z-index: 5; background: var(--bg); border-right: 0; border-bottom: 1px solid var(--line); }
  .logo small { display: none; }
  nav { flex-direction: row; flex-wrap: wrap; }
  nav a { align-items: center; padding: 7px 10px; }
  .longo { display: none; }
  .curto { display: inline; }
}
</style>
