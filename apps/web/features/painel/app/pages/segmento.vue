<script setup lang="ts">
// Tela /segmento: o catálogo de segmentos. Cada segmento tem uma query (uma linha por cliente,
// com cuid) e, quando faz sentido, parâmetros (ex.: dias de inadimplência). Aqui dá para ver a
// query e contar a volumetria real no BigQuery com o valor do parâmetro escolhido. O catálogo
// é versionado em data/models/audiences/catalog.json.
import { reactive } from 'vue';
import { useAsyncData, useHead } from '#imports';
import { defaultAudienceParams } from '@faro/contracts';
import { ApiError, useFaroApi, type PackageCheck } from '~~/features/configuracao/app/composables/useFaroApi';

useHead({ title: 'Segmentos' });

const api = useFaroApi();
const REPO_SQLS = 'https://github.com/fabioloureiro-ptlv/faro/tree/main/data/models/audiences';

const { data: catalogo, refresh } = await useAsyncData('segmentos', () => api.audiencesFull());

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

// ---- Incluir novo segmento: cola o pacote que a skill criar-segmento-faro entrega ----
const EXEMPLO_PACOTE = `{
  "versao": 1,
  "segmento": {
    "id": "sem-compra",
    "name": "Clientes sem compra",
    "descricao": "Clientes cuja última compra foi há mais de N dias",
    "dyAttribute": "faro_aud_sem_compra",
    "parameters": [
      { "name": "dias_sem_compra", "label": "Dias sem compra (mais de)", "type": "integer", "default": 180, "min": 1, "max": 1825, "unit": "dias" }
    ]
  },
  "sql": [
    "SELECT public_id AS cuid, chv_cliente",
    "FROM \`petlove-dataeng-prod-01.dw_corporativo.dim_cliente\`",
    "WHERE public_id IS NOT NULL",
    "  AND dt_ultima_compra < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @dias_sem_compra DAY)"
  ]
}`;
const novo = reactive({
  aberto: false,
  texto: '',
  conferido: '', // texto que passou na conferência: mudou o texto, confere de novo
  busy: '' as '' | 'check' | 'add',
  erro: '',
  resultado: null as PackageCheck | null,
  adicionado: '',
});
const STATUS_LABEL = { ok: 'OK', erro: 'Erro', aviso: 'Atenção', pulado: 'Não conferido' } as const;
const podeAdicionar = () => !!novo.resultado?.ok && novo.conferido === novo.texto && !novo.busy;

function lerPacote(): unknown | undefined {
  novo.erro = '';
  try {
    return JSON.parse(novo.texto);
  } catch {
    novo.erro = 'Isso não é um JSON válido. Cole exatamente o que a skill entregou.';
    return undefined;
  }
}

async function conferir() {
  const pacote = lerPacote();
  novo.adicionado = '';
  if (pacote === undefined) return;
  novo.busy = 'check';
  novo.resultado = null;
  try {
    novo.resultado = await api.segmentPackageCheck(pacote);
    novo.conferido = novo.texto;
  } catch (e) {
    novo.erro = e instanceof ApiError ? e.message : 'Não foi possível conferir o pacote.';
  } finally {
    novo.busy = '';
  }
}

async function adicionar() {
  const pacote = lerPacote();
  if (pacote === undefined || !podeAdicionar()) return;
  novo.busy = 'add';
  try {
    const r = await api.segmentPackageAdd(pacote);
    novo.adicionado = r.shortcut.name;
    novo.texto = '';
    novo.conferido = '';
    novo.resultado = null;
    novo.aberto = false;
    await refresh();
  } catch (e) {
    novo.erro = e instanceof ApiError ? [e.message, ...(e.body.details ?? []).map((d) => d.message)].join(' ') : 'Não foi possível adicionar o segmento.';
  } finally {
    novo.busy = '';
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
      <div class="topo-linha">
        <h1>Segmentos</h1>
        <button type="button" class="primario" :aria-expanded="novo.aberto" aria-controls="novo-segmento" @click="novo.aberto = !novo.aberto">
          {{ novo.aberto ? 'Fechar' : '+ Incluir novo segmento' }}
        </button>
      </div>
      <p class="sub">
        Cada segmento tem uma query (uma linha por cliente, com <code>cuid</code>) e, quando faz sentido, parâmetros. As queries ficam em
        <a :href="REPO_SQLS" target="_blank" rel="noopener">data/models/audiences</a>.
      </p>
    </header>

    <p v-if="novo.adicionado" role="status" class="sucesso">Segmento <strong>{{ novo.adicionado }}</strong> adicionado ao catálogo. Já aparece na etapa de Público do wizard.</p>

    <section v-if="novo.aberto" id="novo-segmento" class="card nova" aria-labelledby="nova-title">
      <h2 id="nova-title">Incluir novo segmento</h2>
      <ol class="passos">
        <li>No Claude Code, rode a skill <code>criar-segmento-faro</code> e descreva o público.</li>
        <li>Copie o pacote em JSON que a skill entrega no final.</li>
        <li>Cole abaixo e confira. O Faro roda a query no BigQuery e só libera se ela devolver <code>cuid</code> e uma linha por cliente.</li>
      </ol>
      <label class="campo" for="novo-json">
        <span>Pacote do segmento (JSON)</span>
        <textarea id="novo-json" v-model="novo.texto" rows="10" spellcheck="false" placeholder="Cole aqui o JSON da skill" />
      </label>
      <details class="exemplo">
        <summary>Ver o formato do pacote</summary>
        <pre>{{ EXEMPLO_PACOTE }}</pre>
        <p class="meta">
          <code>sql</code> pode ser texto ou uma lista de linhas. Todo <code>@parametro</code> usado na query precisa estar em <code>parameters</code>, e o
          contrário também. <code>share</code> é opcional: sem ele, o Faro calcula pela contagem.
        </p>
      </details>
      <div class="acoes-form">
        <button type="button" :disabled="!novo.texto.trim() || !!novo.busy" @click="conferir">
          {{ novo.busy === 'check' ? 'Conferindo no BigQuery…' : 'Conferir pacote' }}
        </button>
        <button type="button" class="primario" :disabled="!podeAdicionar()" @click="adicionar">
          {{ novo.busy === 'add' ? 'Adicionando…' : 'Adicionar ao catálogo' }}
        </button>
        <span v-if="novo.resultado?.ok && novo.conferido !== novo.texto" class="meta">O texto mudou: confira de novo.</span>
      </div>
      <p v-if="novo.erro" role="alert" class="erro">{{ novo.erro }}</p>
      <ul v-if="novo.resultado" class="verificacoes" aria-label="Verificações do pacote">
        <li v-for="x in novo.resultado.verificacoes" :key="x.id" :class="x.status">
          <span class="selo">{{ STATUS_LABEL[x.status] }}</span>
          <span><strong>{{ x.rotulo }}</strong><template v-if="x.detalhe"> — {{ x.detalhe }}</template></span>
        </li>
      </ul>
      <p v-if="novo.resultado?.ok" class="sucesso">
        Pronto para entrar: <strong>{{ novo.resultado.resumo?.name }}</strong>, atributo DY <code>{{ novo.resultado.resumo?.dyAttribute }}</code>.
      </p>
    </section>

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
      Os segmentos incluídos por aqui ficam no servidor da API (<code>services/api/.data</code>), fora do catálogo versionado. Para versionar um deles,
      mova a query para <code>data/models/audiences/</code> e a entrada para <code>catalog.json</code>.
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
.topo-linha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.nova {
  margin-bottom: 20px;
}
.passos {
  margin: 8px 0 14px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.campo {
  display: block;
}
.campo span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.campo textarea {
  width: 100%;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  resize: vertical;
}
.exemplo {
  margin-top: 10px;
}
.exemplo summary {
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
}
.acoes-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.verificacoes {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.verificacoes li {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 14px;
}
.selo {
  flex: none;
  min-width: 96px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand-soft);
}
.verificacoes .ok .selo {
  background: var(--ok-soft);
  color: var(--ok);
}
.verificacoes .erro .selo {
  background: var(--risk-soft);
  color: var(--risk);
}
.verificacoes .aviso .selo {
  background: var(--warn-soft);
  color: var(--warn);
}
.sucesso {
  color: var(--ok);
  margin: 12px 0 0;
}
.rodape {
  margin: 20px 0 0;
  color: var(--muted);
  font-size: 13.5px;
  max-width: 80ch;
}
</style>
