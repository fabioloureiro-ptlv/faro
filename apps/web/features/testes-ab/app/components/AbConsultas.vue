<script setup lang="ts">
// Aba "Consultas": as consultas BigQuery que alimentam a tela, o que o roadmap injeta nelas e a última execução.
import { reactive } from 'vue';
import { useAsyncData } from '#imports';
import { fmtData, fmtDataHora, fmtInt } from '../composables/format';
import { mensagemDeErro, useTestesAbApi } from '../composables/useTestesAbApi';

const api = useTestesAbApi();
const { data, error } = await useAsyncData('ab-consultas', () => api.consultas());

const sql = reactive<Record<string, { texto?: string; aberto: boolean; busy?: boolean; erro?: string; copiado?: boolean }>>({});
const st = (id: string) => (sql[id] ??= { aberto: false });

async function carregar(id: string) {
  const s = st(id);
  if (s.texto) return s.texto;
  s.busy = true;
  s.erro = undefined;
  try {
    s.texto = await api.sql(id);
    return s.texto;
  } catch (e) {
    s.erro = mensagemDeErro(e, 'Não foi possível ler a consulta.');
    return undefined;
  } finally {
    s.busy = false;
  }
}

async function ver(id: string) {
  const s = st(id);
  s.aberto = !s.aberto;
  if (s.aberto) await carregar(id);
}

async function copiar(id: string) {
  const texto = await carregar(id);
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    st(id).copiado = true;
    setTimeout(() => (st(id).copiado = false), 2000);
  } catch {
    st(id).erro = 'O navegador não deixou copiar; abra a consulta e copie na mão.';
  }
}
</script>

<template>
  <p v-if="error" class="err" role="alert">{{ mensagemDeErro(error) }}</p>
  <template v-else-if="data">
    <p class="lead">
      As consultas que o sync roda no BigQuery, como estão no repositório, e o que a última execução disse de cada uma. A consulta de resultados também alimenta o painel de
      Acompanhamento; a lista “Rodando no DY” desta aba lê o mesmo snapshot.
    </p>

    <h3 class="ab-rotulo">O que o roadmap injeta na consulta de resultados</h3>
    <div class="ab-scroll">
      <table class="ab-metricas">
        <thead>
          <tr><th>Campanha</th><th>Início da leitura</th><th>Fim da leitura</th><th>Controle</th><th>Norte</th><th>Teste</th></tr>
        </thead>
        <tbody>
          <tr v-for="o in data.injetado" :key="o.campanha">
            <td>{{ o.campanha }}</td>
            <td class="num">{{ o.inicio ? fmtData(o.inicio, true) : '—' }}</td>
            <td class="num">{{ o.fim ? fmtData(o.fim, true) : '—' }}</td>
            <td class="small">{{ o.controle ?? '—' }}</td>
            <td class="ab-mono small">{{ o.norte }}</td>
            <td class="small"><NuxtLink :to="{ query: { aba: 'roadmap' }, hash: `#teste-${o.teste}` }" class="ab-link" :title="o.testeNome ?? undefined">#{{ o.teste }}</NuxtLink></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-for="c in data.consultas" :key="c.id" class="ab-card ab-consulta">
      <div class="ab-consulta-topo">
        <div>
          <b>{{ c.nome }}</b> <code class="small">{{ c.arquivo }}</code>
          <span class="ab-chip">{{ c.custo }}</span>
        </div>
        <span v-if="c.ultimaExecucao" class="ab-pill s-ok">ok</span>
        <span v-else-if="!c.salva" class="ab-pill s-pendente">consulta não salva</span>
        <span v-else class="ab-pill d-volume_baixo">sem execução</span>
      </div>
      <p class="small">{{ c.descricao }}</p>
      <p v-if="c.ultimaExecucao" class="small muted">
        Última execução: dados até {{ fmtData(c.ultimaExecucao.dadosAte, true) }} · buscado em {{ fmtDataHora(c.ultimaExecucao.geradoEm) }}
        <template v-if="c.ultimaExecucao.linhas != null"> · {{ fmtInt(c.ultimaExecucao.linhas) }} linhas</template>
        <template v-if="c.ultimaExecucao.versao"> · {{ c.ultimaExecucao.versao }}</template>
      </p>
      <p v-else-if="!c.salva" class="small muted">
        Esta consulta ainda não foi salva em <code>{{ c.arquivo }}</code> (veja <code>data/queries/roadmap/README.md</code>); sem ela, o que depende dela não aparece nesta tela.
      </p>
      <div class="row">
        <button type="button" class="btn ghost small" :disabled="!c.salva || st(c.id).busy" @click="ver(c.id)">{{ st(c.id).aberto ? 'Ocultar SQL' : 'Ver SQL' }}</button>
        <button type="button" class="btn ghost small" :disabled="!c.salva || st(c.id).busy" @click="copiar(c.id)">{{ st(c.id).copiado ? 'Copiado' : 'Copiar' }}</button>
      </div>
      <p v-if="st(c.id).erro" class="err" role="alert">{{ st(c.id).erro }}</p>
      <pre v-if="st(c.id).aberto && st(c.id).texto" class="ab-sql" tabindex="0">{{ st(c.id).texto }}</pre>
    </div>
  </template>
</template>
