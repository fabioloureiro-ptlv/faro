<script setup lang="ts">
// Entrada da frente 1: criar (em branco ou por template), importar legado (CFG-14) e duplicar (CFG-15).
import type { Bu, Template } from '@faro/contracts';
import { ApiError, useFaroApi, type DyCampaignRow, type ExperimentSummary } from '../../composables/useFaroApi';
import { BU_LABEL, fmtDate } from '../../utils/labels';

useHead({ title: 'Experimentos · Faro' });
const api = useFaroApi();
const list = ref<ExperimentSummary[]>([]);
const templates = ref<Template[]>([]);
const error = ref('');
const busy = ref(false);

async function refresh() {
  [list.value, templates.value] = await Promise.all([api.list(), api.templates()]);
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

const imp = reactive({ open: false, dyCampaignId: '', bu: 'ecom' as Bu, ownerSquad: '' });
const dyCampaigns = ref<DyCampaignRow[]>([]);
watch(
  () => imp.open,
  (open) => {
    if (open && !dyCampaigns.value.length) api.dyCampaigns().then((c) => (dyCampaigns.value = c)).catch(() => {});
  },
);
const BUS = Object.entries(BU_LABEL) as [Bu, string][];
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
        <button type="button" class="btn ghost" :aria-expanded="imp.open" aria-controls="imp-form" @click="imp.open = !imp.open">Importar do DY</button>
      </div>
    </div>
    <p v-if="error" class="err" role="alert">{{ error }}</p>

    <section v-if="templates.length" class="panel" style="margin-bottom: 18px" aria-labelledby="tpl-title">
      <h2 id="tpl-title">Começar de um template</h2>
      <div class="tpls">
        <button v-for="t in templates" :key="t.id" type="button" class="tpl" :disabled="busy" @click="run(() => api.create(t.id))">
          <b>{{ t.name }}</b><span class="small muted">{{ t.description }}</span>
        </button>
      </div>
    </section>

    <form v-if="imp.open" id="imp-form" class="panel" style="margin-bottom: 18px" @submit.prevent="run(() => api.importLegacy({ dyCampaignId: imp.dyCampaignId.trim(), bu: imp.bu, ownerSquad: imp.ownerSquad.trim() }))">
      <h2>Importar teste legado do DY</h2>
      <p class="small muted">Para campanhas criadas direto no DY, sem faroId. O Faro preenche o que o export traz e você completa o design.</p>
      <div class="pair">
        <div class="field">
          <label for="i-id">Campanha no DY</label>
          <select v-if="dyCampaigns.length" id="i-id" v-model="imp.dyCampaignId" required>
            <option value="" disabled>Escolha a campanha…</option>
            <option v-for="c in dyCampaigns" :key="c.campaignId" :value="c.campaignId">{{ c.campaignName }} · desde {{ fmtDate(c.firstSeen) }}</option>
          </select>
          <input v-else id="i-id" v-model="imp.dyCampaignId" type="text" required placeholder="Ex.: dy-busca-filtro-marca">
        </div>
        <div class="field"><label for="i-sq">Squad responsável</label><input id="i-sq" v-model="imp.ownerSquad" type="text" required minlength="2"></div>
      </div>
      <fieldset class="field">
        <legend>BU</legend>
        <div class="chips"><button v-for="[k, l] in BUS" :key="k" type="button" class="chip" :aria-pressed="imp.bu === k" @click="imp.bu = k">{{ l }}</button></div>
      </fieldset>
      <button class="btn" type="submit" :disabled="busy">Importar</button>
    </form>

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
.tpls { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 12px; }
.tpl { text-align: left; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--line); background: var(--bg); border-radius: 12px; padding: 14px; cursor: pointer; }
.tpl:hover { border-color: var(--brand); background: var(--brand-soft); }
</style>
