import type { AudienceShortcut, Experiment, MetricDefinition, MetricResult, PageCatalog, Template } from '@faro/contracts';
import metrics from '@faro/contracts/fixtures/metrics-catalog.json' with { type: 'json' };
import pages from '@faro/contracts/fixtures/pages.json' with { type: 'json' };
import audiences from '@faro/contracts/fixtures/audiences.json' with { type: 'json' };
import templates from '@faro/contracts/fixtures/templates.json' with { type: 'json' };
import nexus from '@faro/contracts/fixtures/nexus.json' with { type: 'json' };
import simulated from '@faro/contracts/fixtures/simulated.json' with { type: 'json' };

export const fx = {
  metrics: metrics as MetricDefinition[],
  pages: pages as PageCatalog,
  audiences: audiences as AudienceShortcut[],
  templates: templates as Template[],
  nexus: nexus as unknown as { experiment: Experiment; dyExport: typeof nexus.dyExport; results: MetricResult[] },
  simulated: simulated as unknown as { experiments: (Experiment & { scenario?: string })[] },
};
