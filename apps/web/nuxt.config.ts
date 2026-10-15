// Cada frente é uma Nuxt layer em features/<frente> (ADR 0001).
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  extends: ['./features/configuracao', './features/painel', './features/resultados'],
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/tokens.css'],
  ssr: false,
  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      // Título padrão (casca do SPA); cada página informa o seu e app.vue aplica o prefixo "Faro | ".
      title: 'Faro',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap' },
      ],
    },
  },
  runtimeConfig: {
    public: {
      apiBase: 'http://127.0.0.1:4000',
      // DECISAO-PENDENTE: identidade fixa por configuração até existir SSO.
      faroUser: 'pm@example.com',
    },
  },
  typescript: {
    strict: true,
    // As layers ficam em features/ (não em layers/), então entram explicitamente no tsconfig.
    tsConfig: { include: ['../features/*/app/**/*', '../features/*/app/**/*.vue'] },
  },
});
