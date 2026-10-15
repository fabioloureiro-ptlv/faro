import { defineStore } from 'pinia';
import type { PainelData } from '../domain';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// Store só guarda o dado bruto da API; filtros vivem na URL (usePainel).
export const usePainelStore = defineStore('painel', {
  state: () => ({
    data: null as PainelData | null,
    status: 'idle' as LoadStatus,
    error: null as string | null,
  }),
  actions: {
    async load(force = false): Promise<PainelData | null> {
      if (this.data && !force) return this.data;
      this.status = 'loading';
      this.error = null;
      try {
        // Unificação: o painel lê da API Fastify da frente 1, não mais do Nitro.
        const cfg = useRuntimeConfig().public;
        this.data = await $fetch<PainelData>(`${cfg.apiBase}/painel`, {
          headers: { 'x-faro-user': cfg.faroUser as string },
        });
        this.status = 'ready';
      } catch {
        this.status = 'error';
        this.error = 'Não foi possível carregar os experimentos.';
      }
      return this.data;
    },
  },
});
