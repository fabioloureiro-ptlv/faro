// MOCK da frente 4: catálogo de métricas a partir da fixture + rascunhos em metric_requests.
import { eq } from 'drizzle-orm';
import type { MetricDefinition } from '@faro/contracts';
import type { Db } from '../db/client.ts';
import { metricRequests } from '../db/schema.ts';
import type { DraftMetricInput, MetricCatalogPort } from '../ports.ts';
import { fx } from './fixtures.ts';

export function slugMetricId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function mockMetricCatalog(db: Db, now: () => Date): MetricCatalogPort {
  const drafts = async () =>
    (await db.select().from(metricRequests)).map((r) => r.definition as MetricDefinition);
  return {
    async list() {
      return [...fx.metrics, ...(await drafts())];
    },
    async get(id) {
      const hit = fx.metrics.find((m) => m.id === id);
      if (hit) return hit;
      const [row] = await db.select().from(metricRequests).where(eq(metricRequests.metricId, id));
      return row?.definition as MetricDefinition | undefined;
    },
    async createDraft(input: DraftMetricInput, requestedBy) {
      const id = slugMetricId(input.name);
      const def: MetricDefinition = {
        id,
        name: input.name.trim(),
        section: input.section ?? 'eCom',
        kind: input.kind,
        direction: 'higher_better',
        unit: input.kind === 'proportion' ? 'percent' : 'count',
        grains: ['user'],
        definition: input.definition.trim(),
        sqlTemplateRef: `pendente:frente-04/${id}`,
        ...(input.kind === 'proportion'
          ? { baseline: input.baseline }
          : { baseline: input.baseline, cv: Math.round((input.stdDev! / input.baseline) * 100) / 100 }),
        owner: 'frente-04',
        status: 'rascunho',
      };
      await db.insert(metricRequests).values({ metricId: id, definition: def, requestedBy, requestedAt: now().toISOString() });
      return def;
    },
  };
}
