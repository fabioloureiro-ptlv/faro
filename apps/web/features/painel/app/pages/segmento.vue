<script setup lang="ts">
// Tela /segmento: o catálogo de segmentos. Cada segmento tem uma query (uma linha por cliente,
// com cuid) e, quando faz sentido, parâmetros (ex.: dias de inadimplência). Aqui dá para ver a
// query e contar a volumetria real no BigQuery com o valor do parâmetro escolhido. O catálogo
// é versionado em data/models/audiences/catalog.json.
import { reactive } from 'vue';
import { useAsyncData, useHead } from '#imports';
import { defaultAudienceParams } from '@faro/contracts';
import { ApiError, useFaroApi } from '~~/features/configuracao/app/composables/useFaroApi';

useHead({ title: 'Segmentos' });

const api = useFaroApi();
const REPO_SQLS = 'https://github.com/fabioloureiro-ptlv/faro/tree/main/data/models/audiences';

const { data: catalogo } = await useAsyncData('segmentos', () => api.audiencesFull());

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const nf = (n: number) => n.toLocaleString('pt-BR');

type Estado = { values: Record<string, number>; aberto: boolean; sql?: string; clientes?: number; gb?: number; busy?: 'sql' | 'count'; erro?: string };
const estado = reactive<Record<string, Estado>>({});
function st(id: string): Estado {
  const s = catalogo.value?.find((x) => x.id === id);
  return (estado[id] ??= { values: defaultAudienceParams(s?.parameters), aberto: false });
}

const temQuery = (s: { sqlRef?: string; sql?: string; rule?: unknown }) => !!(s.sqlRef || s.sql || s.rule);

function setParam(id: string, name: string, raw: string) {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return;
  const e = st(id);
  e.values = { ...e.values, [name]: value };
  // A contagem e a query mostradas eram de outro valor.
  e.clientes = undefined;
  e.sql = undefined;
  e.erro = undefined;
}

async function verQuery(id: string, hasParams: boolean) {
  const e = st(id);
  e.aberto = !e.aberto;
  if (!e.aberto || e.sql) return;
  e.busy = 'sql';
  e.erro = undefined;
  try {
    e.sql = (await api.audienceSql(id, hasParams ? e.values : undefined)).sql;
  } catch (err) {
    e.erro = err instanceof ApiError ? err.message : 'Falha ao buscar a query.';
  } finally {
    e.busy = undefined;
  }
}

async function contar(id: string, hasParams: boolean) {
  const e = st(id);
  e.busy = 'count';
  e.erro = undefined;
  try {
    const r = await api.audienceEstimate(id, true, hasParams ? e.values : undefined);
    e.sql = r.sql;
    e.clientes = r.clientes;
    e.gb = r.gigabytes;
  } catch (err) {
    e.erro = err instanceof ApiError ? err.message : 'Falha ao contar no BigQuery.';
  } finally {
    e.busy = undefined;
  }
}
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <h1>Segmentos</h1>
      <p class="sub">
        Cada segmento tem uma query (uma linha por cliente, com <code>cuid</code>) e, quando faz sentido, parâmetros. As queries ficam em
        <a :href="REPO_SQLS" target="_blank" rel="noopener">data/models/audiences</a>.
      </p>
    </header>

    <ul class="lista">
      <li v-for="s in catalogo ?? []" :key="s.id" class="card">
        <div class="cab">
          <div>
            <h2>{{ s.name }}</h2>
            <p class="meta">
              {{ temQuery(s) ? 'Com query' : 'Sem query: toda a base elegível' }} · {{ pct(s.share) }} da base (estimativa)
              <template v-if="s.dyAttribute"> · atributo DY <code>{{ s.dyAttribute }}</code></template>
            </p>
            <p v-if="s.origin" class="meta">Fonte: {{ s.origin.label }}.</p>
          </div>
          <div v-if="temQuery(s)" class="acoes">
            <button type="button" :aria-expanded="st(s.id).aberto" @click="verQuery(s.id, !!s.parameters?.length)">
              {{ st(s.id).aberto ? 'Fechar query' : 'Ver query' }}
            </button>
            <button type="button" class="primario" :disabled="st(s.id).busy === 'count'" @click="contar(s.id, !!s.parameters?.length)">
              {{ st(s.id).busy === 'count' ? 'Contando…' : 'Volumetria' }}
            </button>
          </div>
        </div>

        <div v-if="s.parameters?.length" class="params">
          <div v-for="p in s.parameters" :key="p.name" class="param">
            <label :for="`p-${s.id}-${p.name}`">{{ p.label }}</label>
            <input
              :id="`p-${s.id}-${p.name}`"
              type="number"
              :min="p.min"
              :max="p.max"
              :step="p.type === 'integer' ? 1 : 'any'"
              :value="st(s.id).values[p.name]"
              @change="setParam(s.id, p.name, ($event.target as HTMLInputElement).value)"
            >
            <span class="meta"><code>@{{ p.name }}</code><template v-if="p.unit"> · {{ p.unit }}</template></span>
            <p v-if="p.description" class="meta">{{ p.description }}</p>
          </div>
        </div>

        <p v-if="st(s.id).erro" role="alert" class="erro">{{ st(s.id).erro }}</p>
        <p v-if="st(s.id).clientes !== undefined" class="volumetria" role="status">
          <strong>{{ nf(st(s.id).clientes!) }}</strong> clientes hoje, com esse valor de parâmetro
          <span v-if="st(s.id).gb !== undefined" class="meta">({{ st(s.id).gb!.toLocaleString('pt-BR') }} GB processados)</span>
        </p>
        <template v-if="st(s.id).aberto">
          <pre v-if="st(s.id).sql">{{ st(s.id).sql }}</pre>
          <p v-else-if="st(s.id).busy === 'sql'" class="meta">Buscando a query…</p>
        </template>
      </li>
    </ul>

    <p class="rodape">
      Para incluir um segmento novo, adicione a query em <code>data/models/audiences/</code> e uma entrada em <code>catalog.json</code> (nome,
      <code>sqlRef</code> e, se houver, <code>parameters</code>). Ele aparece aqui e na etapa de Público do wizard sem reiniciar a API.
    </p>
  </main>
</template>

<style scoped>
.pagina {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.topo h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.01em;
}
.sub {
  margin: 4px 0 20px;
  color: var(--muted);
  max-width: 78ch;
}
a {
  color: var(--brand);
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px;
  min-width: 0;
}
.cab {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
}
h2 {
  margin: 0 0 4px;
  font-size: 18px;
}
.meta {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13.5px;
}
code {
  font-size: 12.5px;
  background: var(--brand-soft);
  padding: 1px 5px;
  border-radius: 4px;
}
.acoes {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
button {
  font: inherit;
  font-size: 13px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}
button.primario {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
  font-weight: 600;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.params {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}
.param {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 320px;
}
.param label {
  font-size: 13px;
  font-weight: 600;
}
.param input {
  width: 140px;
  font: inherit;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}
.erro {
  color: var(--risk);
  margin: 12px 0 0;
}
.volumetria {
  margin: 12px 0 0;
}
pre {
  margin: 12px 0 0;
  padding: 12px;
  background: var(--brand-soft);
  border-radius: 8px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
}
.rodape {
  margin: 20px 0 0;
  color: var(--muted);
  font-size: 13.5px;
  max-width: 80ch;
}
</style>
