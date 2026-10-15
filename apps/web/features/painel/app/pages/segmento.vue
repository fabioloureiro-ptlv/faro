<script setup lang="ts">
// Tela /segmento (pedido de produto 15/10): catálogo de segmentos vivo (fixture +
// aprovados aqui), link para o método no repositório e criação de segmento novo
// com reuso-primeiro (sugestão do catálogo), preview de custo e volumetria real
// no BigQuery antes do OK. Aprovado, o segmento entra no catálogo e aparece na
// etapa de Público do wizard automaticamente (services/api/src/publico/custom.ts).
import { computed, reactive, ref } from 'vue';
import { useAsyncData, useHead } from '#imports';
import type { AudienceShortcut } from '@faro/contracts';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import { ApiError, useFaroApi } from '~~/features/configuracao/app/composables/useFaroApi';

useHead({ title: 'Segmentos · Faro' });

const api = useFaroApi();
const REPO_CATALOGO = 'https://github.com/fabioloureiro-ptlv/faro#readme';
const REPO_SQLS = 'https://github.com/fabioloureiro-ptlv/faro/tree/main/data/models/audiences';

const { data: catalogo, refresh } = await useAsyncData('segmentos', () => api.audiencesFull());

const ORIGEM_LABEL: Record<string, string> = {
  'sql-versionado': 'SQL versionado',
  regra: 'Regra (SQL gerado)',
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

// ---- Criação de segmento novo ----
type CondForm = {
  type: 'comprou' | 'propriedade' | 'evento';
  dimension: 'categoria' | 'marca' | 'item';
  values: string;
  windowDays: number;
  key: 'especie_pet' | 'clube' | 'plano_saude';
  op: 'eq' | 'neq';
  eventName: string;
  minCount: number;
};

const novoCond = (): CondForm => ({
  type: 'comprou',
  dimension: 'categoria',
  values: '',
  windowDays: 90,
  key: 'especie_pet',
  op: 'eq',
  eventName: '',
  minCount: 1,
});

const nome = ref('');
const ruleOp = ref<'and' | 'or'>('and');
const conds = ref<CondForm[]>([novoCond()]);

// Reuso-primeiro (SEG-01): antes de criar, mostramos o que já existe parecido.
// Heurística local por palavras do nome e dos valores — não é busca semântica.
const sugestoes = computed(() => {
  const termos = `${nome.value} ${conds.value.map((c) => c.values).join(' ')}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (!termos.length || !catalogo.value) return [];
  return catalogo.value.filter((s) => {
    const alvo = `${s.name} ${s.id}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return termos.some((t) => alvo.includes(t));
  });
});

function toRule() {
  const conditions = conds.value.map((c) => {
    const values = c.values
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (c.type === 'comprou') return { type: 'comprou', dimension: c.dimension, values, windowDays: c.windowDays };
    if (c.type === 'evento')
      return { type: 'evento', eventName: c.eventName.trim(), windowDays: c.windowDays, ...(c.minCount > 1 ? { minCount: c.minCount } : {}) };
    // propriedade: clube e plano_saude são flags (valor irrelevante para o gerador de SQL).
    return { type: 'propriedade', key: c.key, op: c.op, values: c.key === 'especie_pet' ? values : ['1'] };
  });
  return { op: ruleOp.value, conditions };
}

const preview = ref<{ sql: string; gigabytes: number; clientes?: number; share?: number } | null>(null);
const previewBusy = ref<false | 'sql' | 'count' | 'create'>(false);
const previewErro = ref('');
const criado = ref<AudienceShortcut | null>(null);

async function gerarPreview(run: boolean) {
  previewBusy.value = run ? 'count' : 'sql';
  previewErro.value = '';
  try {
    const r = await api.audiencePreview(toRule(), run);
    preview.value = { ...(preview.value ?? { sql: '', gigabytes: 0 }), ...r };
  } catch (e) {
    previewErro.value = e instanceof ApiError ? e.message : 'Falha ao gerar o preview.';
  } finally {
    previewBusy.value = false;
  }
}

async function aprovar() {
  if (!preview.value) return;
  previewBusy.value = 'create';
  previewErro.value = '';
  try {
    criado.value = await api.audienceCreate({
      name: nome.value.trim(),
      rule: toRule(),
      clientes: preview.value.clientes,
      share: preview.value.share,
    });
    await refresh();
    nome.value = '';
    conds.value = [novoCond()];
    preview.value = null;
  } catch (e) {
    previewErro.value = e instanceof ApiError ? e.message : 'Falha ao salvar o segmento.';
  } finally {
    previewBusy.value = false;
  }
}

// Mudou a regra ou o nome → o preview antigo não vale mais como base do OK.
function invalidar() {
  preview.value = null;
  criado.value = null;
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
      <h2 id="h-novo">Criar segmento novo</h2>
      <p class="muted">
        Descreva o público por condições; o Faro gera a query (1 linha por cliente, com <code>cuid</code> para o
        DY), estima o custo e conta a volumetria real antes de você aprovar.
      </p>

      <label class="campo">
        <span>Nome do segmento</span>
        <input v-model="nome" type="text" placeholder="ex.: Compradores de ração de gato (6 meses)" @input="invalidar" />
      </label>

      <aside v-if="sugestoes.length" class="sugestao" aria-live="polite">
        <strong>Já temos no catálogo algo parecido</strong> — reusar evita segmento duplicado:
        <ul>
          <li v-for="s in sugestoes" :key="s.id">{{ s.name }} ({{ pct(s.share) }} da base)</li>
        </ul>
      </aside>

      <fieldset class="regra">
        <legend>
          Clientes que atendem
          <select v-model="ruleOp" @change="invalidar">
            <option value="and">todas as condições</option>
            <option value="or">qualquer condição</option>
          </select>
        </legend>

        <div v-for="(c, i) in conds" :key="i" class="cond">
          <select v-model="c.type" @change="invalidar">
            <option value="comprou">Comprou</option>
            <option value="propriedade">Propriedade</option>
            <option value="evento">Evento GA4</option>
          </select>

          <template v-if="c.type === 'comprou'">
            <select v-model="c.dimension" @change="invalidar">
              <option value="categoria">categoria</option>
              <option value="marca">marca</option>
              <option value="item">item (chv_produto)</option>
            </select>
            <input v-model="c.values" type="text" placeholder="valores separados por vírgula" @input="invalidar" />
            <label class="inline">
              nos últimos
              <input v-model.number="c.windowDays" type="number" min="1" max="730" @input="invalidar" /> dias
            </label>
          </template>

          <template v-else-if="c.type === 'propriedade'">
            <select v-model="c.key" @change="invalidar">
              <option value="especie_pet">espécie do pet</option>
              <option value="clube">assinante do Clube</option>
              <option value="plano_saude">plano de saúde ativo</option>
            </select>
            <select v-model="c.op" @change="invalidar">
              <option value="eq">é</option>
              <option value="neq">não é</option>
            </select>
            <input
              v-if="c.key === 'especie_pet'"
              v-model="c.values"
              type="text"
              placeholder="cachorro, gato, passaro, roedor, reptil, peixe"
              @input="invalidar"
            />
          </template>

          <template v-else>
            <input v-model="c.eventName" type="text" placeholder="nome do evento (ex.: add_to_cart)" @input="invalidar" />
            <label class="inline">
              nos últimos
              <input v-model.number="c.windowDays" type="number" min="1" max="730" @input="invalidar" /> dias
            </label>
            <label class="inline">
              mínimo <input v-model.number="c.minCount" type="number" min="1" @input="invalidar" /> vezes
            </label>
          </template>

          <button v-if="conds.length > 1" type="button" class="remover" @click="conds.splice(i, 1); invalidar()">
            Remover
          </button>
        </div>

        <button type="button" class="add" @click="conds.push(novoCond())">+ Adicionar condição</button>
      </fieldset>

      <div class="passos">
        <button type="button" :disabled="previewBusy !== false" @click="gerarPreview(false)">
          {{ previewBusy === 'sql' ? 'Gerando…' : '1 · Gerar SQL e custo' }}
        </button>
        <button type="button" :disabled="previewBusy !== false || !preview" @click="gerarPreview(true)">
          {{ previewBusy === 'count' ? 'Contando…' : '2 · Contar volumetria' }}
        </button>
        <button
          type="button"
          class="aprovar"
          :disabled="previewBusy !== false || !preview || preview.clientes === undefined || nome.trim().length < 4"
          @click="aprovar"
        >
          {{ previewBusy === 'create' ? 'Salvando…' : '3 · Aprovar e adicionar ao catálogo' }}
        </button>
      </div>

      <p v-if="previewErro" role="alert" class="erro">{{ previewErro }}</p>

      <div v-if="preview" class="resultado">
        <p>
          Custo estimado da query: <strong>{{ preview.gigabytes.toLocaleString('pt-BR') }} GB</strong>
          <template v-if="preview.clientes !== undefined">
            · Volumetria: <strong>{{ nf(preview.clientes) }}</strong> clientes
            <template v-if="preview.share !== undefined">({{ pct(preview.share) }} da base com public_id)</template>
          </template>
        </p>
        <pre>{{ preview.sql }}</pre>
      </div>

      <p v-if="criado" class="sucesso" role="status">
        Segmento <strong>{{ criado.name }}</strong> aprovado e adicionado ao catálogo (atributo DY
        <code>{{ criado.dyAttribute }}</code>). Ele já aparece na etapa de Público ao criar um experimento.
      </p>
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
.sub a {
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
  margin-top: 10px;
}
.campo {
  display: block;
  margin: 12px 0;
  max-width: 520px;
}
.campo span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.campo input,
.cond input,
.cond select,
.regra legend select {
  font: inherit;
  font-size: 14px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
}
.campo input {
  width: 100%;
}
.sugestao {
  border: 1px solid var(--warn, #b8860b);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 10px 0;
  font-size: 13.5px;
}
.sugestao ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.regra {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  margin: 14px 0;
}
.regra legend {
  font-weight: 600;
  font-size: 14px;
  padding: 0 6px;
}
.cond {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line);
}
.cond:last-of-type {
  border-bottom: 0;
}
.cond input[type='text'] {
  flex: 1;
  min-width: 220px;
}
.cond input[type='number'] {
  width: 70px;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--muted);
}
.remover {
  color: var(--risk);
}
.add {
  margin-top: 8px;
}
.passos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.passos button {
  padding: 8px 14px;
  font-weight: 600;
}
.aprovar {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.resultado {
  margin-top: 8px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
