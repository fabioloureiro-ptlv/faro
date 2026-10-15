// Fachada do wizard sobre a store (componentes não acessam a store diretamente).
import { storeToRefs } from 'pinia';
import { useExperimentStore } from '../stores/experiment';

const AUTOSAVE_MS = 600;

export function useExperimentDraft() {
  const store = useExperimentStore();
  const refs = storeToRefs(store);
  return {
    ...refs,
    load: store.load,
    save: store.save,
    resolveOverlap: store.resolveOverlap,
    setCampaignType: store.setCampaignType,
    markReady: store.markReady,
    confirm: store.confirm,
    addMetric: store.addMetric,
    suggestDates: store.suggestDates,
    suggestMde: store.suggestMde,
  };
}

/** Liga o autosave: qualquer edição no experimento agenda um PATCH com debounce (CFG-01). */
export function useAutosave() {
  const store = useExperimentStore();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armed = false;
  watch(
    () => store.experiment && [store.experiment.name, store.experiment.bu, store.experiment.ownerSquad, store.experiment.design, store.experiment.audience, store.experiment.allocation],
    () => {
      if (!armed) return; // ignora a carga inicial
      clearTimeout(timer);
      timer = setTimeout(() => void store.save(), AUTOSAVE_MS);
    },
    { deep: true },
  );
  onMounted(() => nextTick(() => (armed = true)));
  onBeforeUnmount(() => {
    clearTimeout(timer);
    void store.save();
  });
}
