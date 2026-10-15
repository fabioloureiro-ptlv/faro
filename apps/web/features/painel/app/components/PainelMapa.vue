<script setup lang="ts">
import { BU_LABEL, STATUS_LABEL, formatDayMonth, type TimeMap, type TimeMapBar } from '../domain';

defineProps<{ map: TimeMap }>();

const ROW_HEIGHT = 30;
const OVERLAP_F = { baixo: 'baixa', medio: 'média', alto: 'alta' } as const;

function describe(b: TimeMapBar): string {
  const parts = [
    b.name,
    STATUS_LABEL[b.status],
    `${formatDayMonth(b.startDate)} a ${formatDayMonth(b.endDate)}`,
  ];
  if (b.faded) parts.push(`outra BU: ${BU_LABEL[b.bu]}`);
  if (b.overlap) {
    parts.push(`sobreposição ${OVERLAP_F[b.overlap]}${b.overlapUnresolved ? ' sem decisão' : ' resolvida'}`);
  }
  return parts.join(' · ');
}

function barStyle(b: TimeMapBar) {
  return { left: `${b.left}%`, width: `${b.width}%`, top: `${b.row * ROW_HEIGHT + 4}px` };
}
</script>

<template>
  <div class="mapa" role="region" aria-label="Mapa temporal por página" tabindex="0">
    <div class="linha cabecalho">
      <div class="rotulo" />
      <div class="trilha">
        <span v-for="t in map.ticks" :key="t.label" class="tick" :style="{ left: `${t.left}%` }">{{
          t.label
        }}</span>
        <span v-if="map.todayLeft !== undefined" class="hoje-rotulo" :style="{ left: `${map.todayLeft}%` }">
          hoje
        </span>
      </div>
    </div>

    <div v-for="lane in map.lanes" :key="lane.pageId" class="linha">
      <div class="rotulo">{{ lane.pageName }}</div>
      <div class="trilha" :style="{ height: `${lane.rows * ROW_HEIGHT + 8}px` }">
        <span
          v-for="t in map.ticks"
          :key="t.label"
          class="grade"
          :style="{ left: `${t.left}%` }"
          aria-hidden="true"
        />
        <span
          v-if="map.todayLeft !== undefined"
          class="hoje"
          :style="{ left: `${map.todayLeft}%` }"
          aria-hidden="true"
        />
        <NuxtLink
          v-for="b in lane.bars"
          :key="b.faroId"
          :to="`/painel/${b.faroId}`"
          class="barra"
          :class="[
            `s-${b.status}`,
            {
              planejada: b.planned,
              esmaecida: b.faded,
              [`ov-${b.overlap}`]: !!b.overlap,
              pendente: b.overlapUnresolved,
              'corte-ini': b.clippedStart,
              'corte-fim': b.clippedEnd,
            },
          ]"
          :style="barStyle(b)"
          :title="describe(b)"
          :aria-label="describe(b)"
        >
          <span v-if="b.overlapUnresolved" class="alerta" aria-hidden="true">!</span>
          <span v-if="b.faded" class="bu">{{ BU_LABEL[b.bu] }} ·</span>
          {{ b.name }}
        </NuxtLink>
      </div>
    </div>

    <p v-if="map.lanes.length === 0" class="vazio">Nenhum teste nessa janela.</p>
  </div>

  <ul class="legenda" aria-label="Legenda">
    <li><span class="amostra s-rodando" />Rodando</li>
    <li><span class="amostra s-configurado_no_dy" />Configurado no DY</li>
    <li><span class="amostra planejada" />Planejado (antes do DY)</li>
    <li><span class="amostra s-decidido" />Decidido</li>
    <li><span class="amostra s-encerrado" />Encerrado</li>
    <li><span class="amostra ov-alto pendente" />Sobreposição alta sem decisão</li>
    <li><span class="amostra ov-alto" />Sobreposição alta resolvida</li>
    <li><span class="amostra ov-medio" />Sobreposição média</li>
    <li><span class="amostra esmaecida s-rodando" />Outra BU que cruza</li>
  </ul>
</template>

<style scoped>
.mapa {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
.linha {
  display: grid;
  grid-template-columns: 140px minmax(860px, 1fr);
  border-bottom: 1px solid var(--line);
}
.linha:last-of-type {
  border-bottom: 0;
}
.rotulo {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: 8px 10px;
  font-weight: 600;
  font-size: 13.5px;
}
.trilha {
  position: relative;
  min-height: 38px;
}
.cabecalho .trilha {
  height: 30px;
}
.tick,
.hoje-rotulo {
  position: absolute;
  top: 7px;
  font-size: 12px;
  color: var(--muted);
  transform: translateX(4px);
  white-space: nowrap;
}
.hoje-rotulo {
  color: var(--risk);
  font-weight: 700;
  transform: translateX(-50%);
}
.grade,
.hoje {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.hoje {
  width: 2px;
  background: var(--risk);
  z-index: 1;
}
.barra {
  position: absolute;
  height: 22px;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12.5px;
  line-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: none;
  color: var(--on-brand);
  background: var(--brand);
  z-index: 1;
}
.barra:hover,
.barra:focus-visible {
  z-index: 3;
  filter: brightness(1.08);
}
.s-configurado_no_dy {
  background: var(--brand-soft);
  color: var(--ink);
  border: 1px solid var(--brand);
}
.s-decidido {
  background: var(--ok);
  color: var(--surface);
}
.s-encerrado {
  background: var(--line);
  color: var(--muted);
}
.planejada {
  background: transparent;
  color: var(--ink);
  border: 1.5px dashed var(--muted);
}
.esmaecida {
  opacity: 0.4;
}
.ov-medio {
  outline: 2px solid var(--warn);
  outline-offset: 1px;
}
.ov-alto {
  outline: 2px solid var(--risk);
  outline-offset: 1px;
}
.pendente {
  outline-style: dashed;
  outline-width: 2.5px;
}
.corte-ini {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.corte-fim {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.alerta {
  display: inline-block;
  width: 15px;
  height: 15px;
  line-height: 15px;
  text-align: center;
  border-radius: 50%;
  background: var(--risk);
  color: var(--surface);
  font-weight: 800;
  font-size: 11px;
  margin-right: 4px;
}
.bu {
  font-weight: 700;
}
.vazio {
  padding: 24px;
  color: var(--muted);
  text-align: center;
  margin: 0;
}
.legenda {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  font-size: 13px;
  color: var(--muted);
}
.legenda li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.amostra {
  display: inline-block;
  width: 28px;
  height: 12px;
  border-radius: 4px;
  background: var(--brand);
}
.amostra.ov-alto,
.amostra.ov-medio {
  background: var(--surface);
}
</style>
