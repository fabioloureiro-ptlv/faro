<script setup lang="ts">
// Detalhe de um teste do DY: variantes, síntese, o que fazer, tabelas por device e detectabilidade (MDE).
import { fmtData, fmtDelta, fmtPct, fmtValor, rotuloStream } from '../composables/format';
import type { DetalheDy, LinhaTabela } from '../composables/types';

defineProps<{ detalhe: DetalheDy }>();

const GRUPOS: { key: LinhaTabela['grupo']; rotulo: string }[] = [
  { key: 'volume', rotulo: 'Volume' },
  { key: 'ecom', rotulo: 'eCom' },
  { key: 'clube', rotulo: 'Clube' },
  { key: 'saude', rotulo: 'Saúde' },
];
const COR_VARIANTE = ['#6e6280', '#3e6fb8', '#1e8a7a', '#8a5bb8', '#c98a2b', '#c9353c'];
const ORIGEM: Record<string, string> = { roadmap: 'datas do roadmap', detectado: 'período de split estável detectado', 'sem periodo estavel (periodo inteiro)': 'sem período estável: período inteiro' };

const linhasDo = (t: DetalheDy['tabelas'][number], g: LinhaTabela['grupo']) => t.linhas.filter((l) => l.grupo === g);
const fmtCel = (l: LinhaTabela, v: number | null | undefined) => fmtValor(v, l.formato);
</script>

<template>
  <section class="ab-det" aria-label="Detalhe do teste">
    <header>
      <h2>{{ detalhe.campanha }}</h2>
      <div class="ab-chips">
        <span class="ab-pill" :class="`d-${detalhe.status.key}`" :title="detalhe.status.dica">{{ detalhe.status.rotulo }}</span>
        <span class="ab-chip">{{ detalhe.variantes.length }} variantes</span>
        <span class="ab-chip">{{ rotuloStream(detalhe.stream) }}</span>
        <span v-if="detalhe.bu" class="ab-chip">{{ detalhe.cross ? 'Ecossistema' : detalhe.bu }}</span>
        <span v-if="detalhe.squad" class="ab-chip">{{ detalhe.squad }}</span>
        <span v-if="detalhe.objetivo" class="ab-chip">objetivo: {{ detalhe.objetivo }}</span>
        <span v-if="detalhe.excluidos" class="ab-chip t-warn">
          {{ detalhe.excluidos.quantidade.toLocaleString('pt-BR') }} {{ detalhe.unidade }} viram 2 variantes ({{ fmtPct(detalhe.excluidos.percentual) }}), excluídos
        </span>
      </div>
      <p class="small muted">
        Leitura: {{ fmtData(detalhe.leitura.inicio) }} a {{ fmtData(detalhe.leitura.fim) }}
        <template v-if="detalhe.leitura.dias"> · {{ detalhe.leitura.dias }} dias</template>
        <template v-if="detalhe.leitura.origem"> ({{ ORIGEM[detalhe.leitura.origem] ?? detalhe.leitura.origem }})</template>
        · grão {{ detalhe.grao === 'usuario' ? 'usuário' : 'sessão' }} · dados até {{ fmtData(detalhe.dadosAte) }} · export D-1
      </p>
      <p v-if="detalhe.roadmap.atrelados.length" class="small">
        No roadmap:
        <NuxtLink v-for="id in detalhe.roadmap.atrelados" :key="id" :to="{ query: { aba: 'roadmap' }, hash: `#teste-${id}` }" class="ab-link">#{{ id }}</NuxtLink>
      </p>
    </header>

    <h3 class="ab-rotulo">Variantes</h3>
    <ul class="ab-variantes">
      <li v-for="(v, i) in detalhe.variantes" :key="v.nome">
        <i class="ab-bola" :style="{ background: COR_VARIANTE[i % COR_VARIANTE.length] }" />
        <b>{{ v.nome }}</b>
        <span v-if="v.controle" class="muted small">(controle)</span>
        <span v-if="v.share != null" class="ab-chip">{{ Math.round(v.share * 100) }}%</span>
        <span v-if="v.descricao" class="small muted">{{ v.descricao }}</span>
      </li>
    </ul>

    <h3 class="ab-rotulo">Síntese</h3>
    <div class="ab-sintese">
      <p v-for="s in detalhe.sintese" :key="s.variante" class="small">
        <b>{{ s.variante }} (consolidado):</b>
        <template v-for="(i, k) in s.itens" :key="i.rotulo">
          <template v-if="k"> · </template>
          <template v-if="i.norte">métrica principal </template>{{ i.rotulo.toLowerCase() }} {{ fmtDelta(i.uplift) }}
          <span v-if="i.sig" class="muted">({{ i.sig.rotulo.toLowerCase() }}, {{ i.sig.p }}%)</span>
        </template>
      </p>
      <p v-if="!detalhe.sintese.length" class="small muted">Só há uma variante: não há comparação.</p>
    </div>

    <div class="ab-fazer" :class="`r-${detalhe.recomendacao.tom}`">
      <span class="ab-rotulo">O que fazer · grão {{ detalhe.grao === 'usuario' ? 'usuário' : 'sessão' }}, consolidado · decide {{ detalhe.norte.label.toLowerCase() }}</span>
      <b>{{ detalhe.recomendacao.titulo }}</b>
      <p class="small">{{ detalhe.recomendacao.texto }}</p>
    </div>

    <div v-for="t in detalhe.tabelas" :key="t.device" class="ab-scroll">
      <h3 class="ab-sub">{{ t.rotulo }}</h3>
      <table class="ab-metricas">
        <thead>
          <tr>
            <th>Métrica</th>
            <th>{{ t.variantes[0] }} <small class="muted">(controle)</small></th>
            <template v-for="(v, i) in t.variantes.slice(1)" :key="v">
              <th class="ab-sep" :style="{ borderLeftColor: COR_VARIANTE[(i + 1) % COR_VARIANTE.length] }">{{ v }}</th>
              <th>Δ</th>
              <th>Significância</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <template v-for="g in GRUPOS" :key="g.key">
            <template v-if="linhasDo(t, g.key).length">
              <tr class="ab-grupo-linha"><th :colspan="2 + (t.variantes.length - 1) * 3">{{ g.rotulo }}</th></tr>
              <tr v-for="l in linhasDo(t, g.key)" :key="l.chave" :class="{ norte: l.papel === 'norte' }">
                <td>
                  {{ l.rotulo }}
                  <span v-if="l.papel === 'norte'" class="ab-selo t-info">PRINCIPAL</span>
                  <span v-else-if="l.papel === 'guarda'" class="ab-selo t-warn">GUARDA</span>
                </td>
                <td class="num">{{ fmtCel(l, l.celulas[0]?.valor) }}</td>
                <template v-for="(c, i) in l.celulas.slice(1)" :key="i">
                  <td class="num ab-sep" :style="{ borderLeftColor: COR_VARIANTE[(i + 1) % COR_VARIANTE.length] }">{{ fmtCel(l, c.valor) }}</td>
                  <td class="num" :class="c.uplift == null ? '' : c.uplift >= 0 ? 'pos' : 'neg'">{{ fmtDelta(c.uplift) }}</td>
                  <td class="small"><AbSig v-if="l.grupo !== 'volume'" :sig="c.sig" curto /></td>
                </template>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>

    <h3 class="ab-rotulo">Detectabilidade hoje (MDE, 80% de poder)</h3>
    <div class="ab-scroll">
      <table class="ab-metricas ab-mde">
        <thead>
          <tr><th>Métrica</th><th v-for="v in detalhe.mde.variantes" :key="v">{{ v }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="l in detalhe.mde.linhas" :key="l.rotulo" :class="{ norte: l.norte }">
            <td>{{ l.rotulo }}</td>
            <td v-for="(v, i) in l.valores" :key="i" class="num">{{ fmtPct(v) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="small muted">Menor diferença relativa que o teste consegue detectar com a base atual. Efeito observado abaixo do MDE é ruído até prova em contrário.</p>

    <p class="small muted ab-nota">
      Saúde do teste (usuários expostos por dia e métrica norte acumulada) e a estimativa de dias que faltam dependem da consulta de série diária
      (<code>dy_daily</code>), que ainda não está salva no repositório.
    </p>

    <details class="ab-como">
      <summary>Como os números são calculados</summary>
      <ul class="small">
        <li><b>Grão usuário (decisão):</b> cada usuário entra uma vez, na variante que viu primeiro, e conta compras a partir da primeira exposição, em qualquer sessão. Quem viu duas variantes fica fora.</li>
        <li><b>Grão sessão (apoio):</b> cada sessão exposta entra uma vez e conta só compras da mesma sessão depois da exposição.</li>
        <li><b>Janela:</b> do dia seguinte ao primeiro dia com split estável até o último dia estável, limitado a D-1. Datas e controle informados no roadmap sobrescrevem.</li>
        <li><b>Significância:</b> o percentual é P(variante &gt; controle). ≥95%: melhora confirmada; 85–95: tendência de melhora; 15–85: sem tendência; 5–15: tendência de queda; ≤5%: queda confirmada. MDE = menor diferença relativa detectável hoje, com 80% de poder.</li>
        <li><b>Status:</b> decidido quando uma variante tem menos de 5% da base; volume baixo com menos de 50 transações em alguma variante; split desigual quando o split se afasta do planejado; senão, saudável.</li>
        <li>O export do GA4 chega com um dia de atraso (D-1): não compare com números intradia.</li>
      </ul>
    </details>
  </section>
</template>
