<script setup lang="ts">
// Entrada da frente 1, em formato de guia: como montar um teste, as configurações em andamento
// (Draft) e os experimentos já desenhados (Done). O acompanhamento de quem já roda fica no Painel.
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

// Draft = o wizard ainda não terminou; Done = o desenho foi concluído (cancelados não aparecem aqui).
const DRAFT = ['rascunho', 'design_completo'];
const groups = computed(() => ({
  draft: list.value.filter((e) => DRAFT.includes(e.status)),
  done: list.value.filter((e) => !DRAFT.includes(e.status) && e.status !== 'cancelado'),
}));

const STEPS = [
  { n: 1, title: 'Design do experimento', text: 'Contexto, hipótese, o que muda e as métricas (uma primária e as secundárias).' },
  { n: 2, title: 'Público', text: 'Onde o teste aparece e quem entra, com a query do segmento e a volumetria.' },
  { n: 3, title: 'Sobreposição', text: 'Quais testes ativos ou agendados disputam o mesmo público e a mesma página.' },
  { n: 4, title: 'Revisão', text: 'Ficha de configuração do DY, pronta para quem vai montar a campanha.' },
];

const sections = computed(() => [
  { key: 'draft', title: 'Configurações em andamento', hint: 'Continue de onde parou.', rows: groups.value.draft, label: 'Draft', tone: 'warnp', empty: 'Nenhuma configuração em andamento.' },
  { key: 'done', title: 'Experimentos desenhados', hint: 'Design concluído. Duplique para partir de um teste parecido.', rows: groups.value.done, label: 'Done', tone: 'okp', empty: 'Nenhum experimento desenhado ainda.' },
]);
</script>

<template>
  <div>
    <h1>Novo Experimento</h1>
    <p class="lead">Todo teste nasce de um design completo, com contexto, hipótese e métricas, antes de qualquer configuração no DY.</p>
    <p v-if="error" class="err" role="alert">{{ error }}</p>

    <section class="panel guia" aria-labelledby="guia-title">
      <div class="spread">
        <h2 id="guia-title">Como montar um experimento</h2>
        <button type="button" class="btn" :disabled="busy" @click="run(() => api.create())">Novo experimento</button>
      </div>
      <ol class="steps">
        <li v-for="s in STEPS" :key="s.n">
          <span class="n" aria-hidden="true">{{ s.n }}</span>
          <div>
            <b>{{ s.title }}</b>
            <p class="small muted">{{ s.text }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section v-for="s in sections" :key="s.key" class="lista" :aria-labelledby="`${s.key}-title`">
      <h2 :id="`${s.key}-title`">{{ s.title }}</h2>
      <p class="small muted hint">{{ s.hint }}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Experimento</th><th>Status</th><th>BU · squad</th><th>Atualizado</th><th><span class="visually-hidden">Ações</span></th></tr></thead>
          <tbody>
            <tr v-for="x in s.rows" :key="x.faroId">
              <td><NuxtLink :to="`/configuracao/${x.faroId}`"><b>{{ x.name || 'Sem nome' }}</b></NuxtLink><div class="small muted">{{ x.faroId }}<span v-if="x.legacy"> · legado</span></div></td>
              <td><span class="pill" :class="s.tone">{{ s.label }}</span></td>
              <td>{{ BU_LABEL[x.bu] }}<div class="small muted">{{ x.ownerSquad }}</div></td>
              <td>{{ fmtDate(x.updatedAt) }}</td>
              <td class="acoes">
                <NuxtLink v-if="s.key === 'draft'" class="btn small" :to="`/configuracao/${x.faroId}`">Continuar</NuxtLink>
                <button type="button" class="btn ghost small" :disabled="busy" :aria-label="`Duplicar ${x.name}`" @click="run(() => api.duplicate(x.faroId))">Duplicar</button>
              </td>
            </tr>
            <tr v-if="!s.rows.length"><td colspan="5" class="muted">{{ s.empty }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
a { color: var(--ink); }
.guia { margin-bottom: 28px; }
.guia h2 { margin: 0; }
.steps { list-style: none; margin: 18px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; }
.steps li { display: flex; gap: 12px; align-items: flex-start; }
.steps p { margin: 2px 0 0; }
.n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-weight: 800; display: grid; place-items: center; font-size: 14px; }
.lista { margin-bottom: 28px; }
.lista h2 { margin: 0 0 2px; }
.hint { margin: 0 0 10px; }
.acoes { display: flex; gap: 8px; justify-content: flex-end; white-space: nowrap; }
.acoes .btn { color: var(--on-brand); }
.acoes .btn.ghost { color: var(--ink); }
</style>
