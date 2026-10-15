// E8 — superfície pública da fonte roadmap para outros pacotes do monorepo (hoje: testes do
// front, que montam os números-chave sobre o ResultsResponse real das consultas do roadmap).
export { buildResults, type BuildOptions } from './adapter.ts';
export { createResultsSource, snapshotFromRows } from './source.ts';
export type { RoadmapSnapshot, SnapshotMeta } from './types.ts';
