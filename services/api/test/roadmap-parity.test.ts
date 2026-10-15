/**
 * E8 — paridade com fixtures/nexus-results.json para "Nexus | Nova Home do App". Só roda com snapshot
 * real (data/snapshots/roadmap/latest.json, gerado por npm run job:sync-roadmap); senão, skip.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExperimentSchema, MetricDefinitionSchema, resultsResponseSchema, type Experiment, type MetricDefinition, type ResultsResponse } from '@faro/contracts';
import metricsCatalog from '@faro/contracts/fixtures/metrics-catalog.json' with { type: 'json' };
import nexusFixture from '@faro/contracts/fixtures/nexus.json' with { type: 'json' };
import nexusResults from '@faro/contracts/fixtures/nexus-results.json' with { type: 'json' };
import { buildResults } from '../src/resultados/roadmap/adapter.ts';
import { REPO_ROOT, SNAPSHOT_DIR } from '../src/resultados/roadmap/paths.ts';
import { loadRoadmapSnapshot } from '../src/resultados/roadmap/source.ts';

const latest = resolve(REPO_ROOT, SNAPSHOT_DIR, 'latest.json');
const VALUE_TOL = 0.005; // 0,5% (MET-17)
const PROB_TOL = 0.02;
const hasSnapshot = existsSync(latest);

describe.skipIf(!hasSnapshot)('paridade roadmap × fixtures/nexus-results.json (E8, MET-17)', () => {
  const snap = hasSnapshot ? loadRoadmapSnapshot(REPO_ROOT) : undefined;
  const catalog: MetricDefinition[] = (metricsCatalog as unknown[]).map((m) => MetricDefinitionSchema.parse(m));
  const fixture = resultsResponseSchema.parse(nexusResults);
  const nexus = ExperimentSchema.parse(nexusFixture.experiment) as Experiment;
  const real = snap ? (buildResults(snap, nexus, catalog) as ResultsResponse | undefined) : undefined;

  it.skipIf(!real)('o snapshot tem a campanha do Nexus', () => {
    expect(real).toBeDefined();
  });

  it.skipIf(!real)('valores por variante dentro de 0,5%; probBetter das proporções com tolerância 0,02', () => {
    const diffs: string[] = [];
    const info: string[] = [];
    for (const f of fixture.results.filter((x) => x.platform === 'all' && x.grain === 'user' && x.value != null)) {
      const r = real!.results.find((x) => x.metricId === f.metricId && x.variantKey === f.variantKey);
      if (!r || r.value == null) {
        // Valor 0 na fixture é "sem dado no visualizador": ausência no snapshot é informativa, não falha.
        if (f.value === 0) info.push(`${f.metricId}/${f.variantKey}: sem dado nas duas fontes`);
        else diffs.push(`${f.metricId}/${f.variantKey}: ausente no snapshot`);
        continue;
      }
      const rel = f.value === 0 ? Math.abs(r.value) : Math.abs(r.value - f.value!) / Math.abs(f.value!);
      if (rel > VALUE_TOL) diffs.push(`${f.metricId}/${f.variantKey}: valor ${r.value} × fixture ${f.value} (${(rel * 100).toFixed(2)}%)`);
      const m = catalog.find((x) => x.id === f.metricId);
      if (m?.kind === 'proportion' && f.probBetter != null && r.probBetter != null) {
        if (Math.sign(r.deltaRelative ?? 0) !== Math.sign(f.deltaRelative ?? 0)) diffs.push(`${f.metricId}: sinal do delta difere`);
        if (Math.abs(r.probBetter - f.probBetter) > PROB_TOL) diffs.push(`${f.metricId}: probBetter ${r.probBetter} × ${f.probBetter}`);
      }
    }
    // Deltas de métricas 'mean' não entram: o método do visualizador (CUPED/controle pós-rollout) é documentado em METODO.md.
    if (info.length) console.log('sem dado nas duas fontes:\n' + info.join('\n'));
    if (diffs.length) console.log('diferenças de paridade:\n' + diffs.join('\n'));
    expect(diffs).toEqual([]);
  });
});
