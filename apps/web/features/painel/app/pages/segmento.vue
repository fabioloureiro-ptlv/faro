<script setup lang="ts">
// Tela /segmento (pedido de produto 15/10): catálogo vivo (fixture + importados), link
// para o método no repositório e para o artefato onde o segmento novo é montado
// (texto corrido → Claude sugere a regra → volumetria → aprovação). O segmento aprovado
// lá chega aqui por importação de JSON e passa a aparecer na etapa de Público do wizard.
import { reactive, ref } from 'vue';
import { useAsyncData, useHead } from '#imports';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import { ApiError, useFaroApi } from '~~/features/configuracao/app/composables/useFaroApi';

useHead({ title: 'Segmentos · Faro' });

const api = useFaroApi();
const REPO_CATALOGO = 'https://github.com/fabioloureiro-ptlv/faro#readme';
const REPO_SQLS = 'https://github.com/fabioloureiro-ptlv/faro/tree/main/data/models/audiences';
const ARTEFATO = 'https://claude.ai/artifact/Wc1zkoyEGz3Lj3nmPETreA';
const EXEMPLO_JSON = '{ "versao": 1, "segmentos": [ { "name": "…", "rule": { … }, "clientes": 143762 } ] }';

const { data: catalogo, refresh } = await useAsyncData('segmentos', () => api.audiencesFull());

const ORIGEM_LABEL: Record<string, string> = {
  'sql-versionado': 'SQL versionado',
  regra: 'Regra (SQL gerado)',
  'sql-livre': 'SQL livre (artefato)',
  manual: 'Manual (sem regra)',
};

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const nf = (n: number) => n.toLocaleString('pt-BR');

// ---- Detalhe por linha do catálogo: ver SQL e contar volumetria ----
const aberto = ref<string | null>(null);
const detalhe = reactive<Record<string, { sql?: string; clientes?: number; busy?: 'sql' | 'count'; erro?: string }>>({});

async function verSql(id: string) {
  aberto.value = aberto.value === id ? null : id;
  const d = (detalhe[id] ??= {});
  if (aberto.value !== id || d.sql) return;
  d.busy = 'sql';
  d.erro = undefined;
  try {
    d.sql = (await api.audienceSql(id)).sql;
  } catch (e) {
    d.erro = e instanceof ApiError ? e.message : 'Falha ao buscar a query.';
  } finally {
    d.busy = undefined;
  }
}

async function contar(id: string) {
  const d = (detalhe[id] ??= {});
  d.busy = 'count';
  d.erro = undefined;
  try {
    const r = await api.audienceEstimate(id, true);
    d.sql = r.sql;
    d.clientes = r.clientes;
  } catch (e) {
    d.erro = e instanceof ApiError ? e.message : 'Falha ao contar no BigQuery.';
  } finally {
    d.busy = undefined;
  }
}

// ---- Importar do artefato ----
const texto = ref('');
const importBusy = ref(false);
const importErro = ref('');
const importado = ref<{ importados: { id: string; name: string }[]; ignorados: { name: string; motivo: string; detalhe: string }[] } | null>(null);

const MOTIVO_LABEL: Record<string, string> = {
  ja_existe: 'já está no catálogo',
  formato_invalido: 'formato inválido',
  regra_nao_suportada: 'regra não suportada',
};

async function importar() {
  importErro.value = '';
  importado.value = null;
  let payload: unknown;
  try {
    payload = JSON.parse(texto.value);
  } catch {
    importErro.value = 'Isso não é um JSON válido. Cole exatamente o que o artefato copiou.';
    return;
  }
  importBusy.value = true;
  try {
    importado.value = await api.audienceImport(payload);
    if (importado.value.importados.length) {
      texto.value = '';
      await refresh();
    }
  } catch (e) {
    importErro.value = e instanceof ApiError ? e.message : 'Falha ao importar.';
  } finally {
    importBusy.value = false;
  }
}
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <div>
        <h1>Segmentos</h1>
        <p class="sub">
          Catálogo de públicos para testes A/B — reuso vem primeiro. O método e as queries versionadas estão no
          <a :href="REPO_CATALOGO" target="_blank" rel="noopener">README do repositório</a> e em
          <a :href="REPO_SQLS" target="_blank" rel="noopener">data/models/audiences</a>.
        </p>
      </div>
      <PainelNav />
    </header>

    <section class="card" aria-labelledby="h-catalogo">
      <h2 id="h-catalogo">Catálogo atual</h2>
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Segmento</th>
              <th scope="col">Origem</th>
              <th scope="col">Participação</th>
              <th scope="col">Atributo DY</th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="s in catalogo ?? []" :key="s.id">
              <tr>
                <th scope="row">{{ s.name }}</th>
                <td>{{ ORIGEM_LABEL[s.origem] ?? s.origem }}</td>
                <td>{{ pct(s.share) }}</td>
                <td><code v-if="s.dyAttribute">{{ s.dyAttribute }}</code><span v-else class="muted">—</span></td>
                <td class="acoes">
                  <button v-if="s.origem !== 'manual'" type="button" @click="verSql(s.id)">
                    {{ aberto === s.id ? 'Fechar' : 'Ver SQL' }}
                  </button>
                  <button
                    v-if="s.origem !== 'manual'"
                    type="button"
                    :disabled="detalhe[s.id]?.busy === 'count'"
                    @click="contar(s.id)"
                  >
                    {{ detalhe[s.id]?.busy === 'count' ? 'Contando…' : 'Volumetria' }}
                  </button>
                  <span v-else class="muted">sem regra</span>
                </td>
              </tr>
              <tr v-if="aberto === s.id || detalhe[s.id]?.clientes !== undefined || detalhe[s.id]?.erro">
                <td colspan="5" class="detalhe">
                  <p v-if="detalhe[s.id]?.erro" role="alert" class="erro">{{ detalhe[s.id]?.erro }}</p>
                  <p v-if="detalhe[s.id]?.clientes !== undefined" class="volumetria">
                    <strong>{{ nf(detalhe[s.id]!.clientes!) }}</strong> clientes hoje (contagem real no BigQuery).
                  </p>
                  <pre v-if="aberto === s.id && detalhe[s.id]?.sql">{{ detalhe[s.id]?.sql }}</pre>
                  <p v-else-if="aberto === s.id && detalhe[s.id]?.busy === 'sql'" class="muted">Buscando a query…</p>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" aria-labelledby="h-novo">
      <h2 id="h-novo">Precisa de um segmento novo?</h2>
      <p class="muted">
        O segmento novo é montado no artefato:
        você descreve o público em texto corrido, o Claude sugere a regra e a query, e você confere a volumetria e
        aprova. Depois traga o resultado para cá.
      </p>
      <ol class="passos">
        <li>
          Abra o <a :href="ARTEFATO" target="_blank" rel="noopener">artefato Segmentos Faro</a> e crie e aprove o
          segmento.
        </li>
        <li>No artefato, abra <em>Exportar para o Faro</em> e copie o JSON.</li>
        <li>Cole abaixo e importe. O segmento passa a aparecer no catálogo e na etapa de Público do wizard.</li>
      </ol>

      <label class="campo" for="import-json">
        <span>JSON exportado do artefato</span>
        <textarea
          id="import-json"
          v-model="texto"
          rows="6"
          spellcheck="false"
          :placeholder="EXEMPLO_JSON"
        />
      </label>
      <div class="linha">
        <button type="button" class="aprovar" :disabled="importBusy || !texto.trim()" @click="importar">
          {{ importBusy ? 'Importando…' : 'Importar no catálogo' }}
        </button>
      </div>

      <p v-if="importErro" role="alert" class="erro">{{ importErro }}</p>
      <div v-if="importado" class="resultado" role="status">
        <p v-if="importado.importados.length" class="sucesso">
          {{ importado.importados.length === 1 ? 'Segmento importado' : `${importado.importados.length} segmentos importados` }}:
          <strong>{{ importado.importados.map((s) => s.name).join(', ') }}</strong>. Já disponível(is) na etapa de
          Público do wizard.
        </p>
        <ul v-if="importado.ignorados.length" class="ignorados">
          <li v-for="i in importado.ignorados" :key="i.name">
            <strong>{{ i.name }}</strong> — {{ MOTIVO_LABEL[i.motivo] ?? i.motivo }}<span v-if="i.motivo !== 'ja_existe'">: {{ i.detalhe }}</span>
          </li>
        </ul>
      </div>
    </section>
  </main>
</template>

<style scoped>
.pagina {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.topo {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.01em;
}
.sub {
  margin: 4px 0 20px;
  color: var(--muted);
  max-width: 78ch;
}
.sub a,
.card a {
  color: var(--brand);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px;
  margin-bottom: 20px;
}
h2 {
  margin: 0 0 10px;
  font-size: 18px;
}
.wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}
th,
td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  vertical-align: top;
}
thead th {
  font-size: 12.5px;
  color: var(--muted);
}
tbody th {
  font-weight: 600;
}
code {
  font-size: 12.5px;
  background: var(--brand-soft);
  padding: 1px 5px;
  border-radius: 4px;
}
.acoes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
button {
  font: inherit;
  font-size: 13px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.detalhe {
  background: var(--brand-soft);
}
pre {
  margin: 8px 0 0;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
}
.volumetria {
  margin: 4px 0;
}
.muted {
  color: var(--muted);
}
.erro {
  color: var(--risk);
}
.sucesso {
  color: var(--ok, #157f3d);
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
  margin: 12px 0;
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
.linha {
  display: flex;
  gap: 8px;
}
.aprovar {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
  padding: 8px 14px;
  font-weight: 600;
}
.resultado {
  margin-top: 10px;
}
.ignorados {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--muted);
  font-size: 13.5px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
