<template>
  <div class="app">
    <aside>
      <NuxtLink to="/configuracao" class="logo">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <rect width="34" height="34" rx="10" fill="var(--brand)" />
          <circle cx="12" cy="13" r="3" fill="var(--gate)" />
          <circle cx="22" cy="13" r="3" fill="var(--on-brand)" />
          <path d="M9 22c3 3 13 3 16 0" stroke="var(--on-brand)" stroke-width="2.4" fill="none" stroke-linecap="round" />
        </svg>
        <span>Faro<small>Experimentos Petlove</small></span>
      </NuxtLink>
      <nav aria-label="Principal">
        <NuxtLink to="/configuracao" exact-active-class="active">Experimentos</NuxtLink>
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
nav a { padding: 9px 12px; border-radius: 10px; font-weight: 500; color: var(--muted); text-decoration: none; }
nav a:hover, nav a.active { color: var(--ink); background: var(--brand-soft); }
nav a.active { font-weight: 700; }
main { padding: 36px clamp(16px, 4vw, 48px) 80px; max-width: 1180px; width: 100%; min-width: 0; }
@media (max-width: 900px) {
  .app { grid-template-columns: 1fr; }
  aside { position: sticky; height: auto; flex-direction: row; align-items: center; padding: 12px 16px; gap: 16px; z-index: 5; background: var(--bg); border-right: 0; border-bottom: 1px solid var(--line); }
  .logo small { display: none; }
}
</style>
