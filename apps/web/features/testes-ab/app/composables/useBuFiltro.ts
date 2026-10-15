// Filtro de área (BU) da Visão Geral, na URL (?bu=ecom). Vale para as quatro abas.
import { computed } from 'vue';
import { useRoute } from '#imports';

export type BuFiltro = 'todas' | 'ecom' | 'saude' | 'fintech' | 'servicos';
const BUS: readonly string[] = ['ecom', 'saude', 'fintech', 'servicos'];

export function useBuFiltro() {
  const route = useRoute();
  const bu = computed<BuFiltro>(() => (typeof route.query.bu === 'string' && BUS.includes(route.query.bu) ? (route.query.bu as BuFiltro) : 'todas'));
  /** Teste de ecossistema aparece em qualquer área (mesma regra do painel). */
  const naArea = (area: string) => bu.value === 'todas' || area === bu.value || area === 'ecossistema';
  return { bu, naArea };
}
