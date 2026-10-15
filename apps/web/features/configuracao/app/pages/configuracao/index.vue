<script setup lang="ts">
// Entrada da frente 1: criar em branco e duplicar (CFG-15). Ajuste de produto 15/10:
// sem "começar de um template" e sem importar do DY aqui — os testes criados direto
// no DY aparecem no Painel (Lista/Mapa) e a atualização roda por lá.
import { ApiError, useFaroApi, type ExperimentSummary } from '../../composables/useFaroApi';
import { BU_LABEL, fmtDate } from '../../utils/labels';

useHead({ title: 'Novo Experimento' });
const api = useFaroApi();
const list = ref<ExperimentSummary[]>([]);
const error = ref('');
const busy = ref(false);

async function refresh() {
  list.value = await api.list();
}
onMounted(() => refresh().catch(() => (error.value = 'Não foi possível falar com a API do Faro. Ela está rodando?')));

async function run(fn: () => Promise<{ experiment: { faroId: string } }>) {
  busy.value = true;
  error.value = '';
  try {
    const { experiment } = await fn();
    await navigateTo(`/configuracao/${experiment.faroId}`);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Algo deu errado.';
  } finally {
    busy.value = false;
  }
}

const groups = computed(() => ({
  drafts: list.value.filter((e) => ['rascunho', 'design_completo', 'pronto_para_configurar'].includes(e.status)),
  rest: list.value.filter((e) => !['rascunho', 'design_completo', 'pronto_para_configurar'].includes(e.status)),
}));
</script>

<template>
  <div>
    <div class="spread">
      <div>
        <h1>Experimentos</h1>
        <p class="lead">Todo teste nasce de um design completo, com contexto, hipótese e métricas, antes de qualquer configuração no DY.</p>
      </div>
      <div class="row">
        <button type="button" class="btn" :disabled="busy" @click="run(() => api.create())">Novo experimento</button>
      </div>
    </div>
    <p v-if="error" class="err" role="alert">{{ error }}</p>

    <section v-for="[title, rows] in [['Em configuração', groups.drafts], ['Configurados e em andamento', groups.rest]] as const" :key="title" style="margin-bottom: 24px">
      <h2 style="margin-bottom: 10px">{{ title }}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Experimento</th><th>Status</th><th>BU · squad</th><th>Atualizado</th><th><span class="visually-hidden">Ações</span></th></tr></thead>
          <tbody>
            <tr v-for="x in rows" :key="x.faroId">
              <td><NuxtLink :to="`/configuracao/${x.faroId}`"><b>{{ x.name || 'Sem nome' }}</b></NuxtLink><div class="small muted">{{ x.faroId }}<span v-if="x.legacy"> · legado</span></div></td>
              <td><CfgStatusPill :status="x.status" /></td>
              <td>{{ BU_LABEL[x.bu] }}<div class="small muted">{{ x.ownerSquad }}</div></td>
              <td>{{ fmtDate(x.updatedAt) }}</td>
              <td><button type="button" class="btn ghost small" :disabled="busy" :aria-label="`Duplicar ${x.name}`" @click="run(() => api.duplicate(x.faroId))">Duplicar</button></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="5" class="muted">Nada por aqui.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
a { color: var(--ink); }
</style>
