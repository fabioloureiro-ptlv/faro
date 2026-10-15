// Frente 5 — biblioteca de templates como dados (05-templates.md, seção 5).
// Substitui o mock de dois templates fixos: a biblioteca completa vive em
// fixtures/campaign-templates.json e o wizard da frente 1 consome a visão
// aplicável (`Template`) pela mesma porta de antes (TPL-01/02 sem mudar a frente 1).
import {
  CampaignTemplateSchema,
  ReportTemplateSchema,
  type CampaignTemplate,
  type ReportTemplate,
  type Template,
} from '@faro/contracts';
import campaignTemplates from '@faro/contracts/fixtures/campaign-templates.json' with { type: 'json' };
import reportTemplate from '@faro/contracts/fixtures/report-template.json' with { type: 'json' };
import type { TemplatePort } from '../ports.ts';

const library: CampaignTemplate[] = (campaignTemplates as unknown[]).map((t) => CampaignTemplateSchema.parse(t));
const report: ReportTemplate = ReportTemplateSchema.parse(reportTemplate);

/** Visão aplicável pelo wizard (TPL-02): só o que pré-preenche o cadastro. */
function toApplied(t: CampaignTemplate): Template {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    ...(t.bu ? { bu: t.bu } : {}),
    design: t.defaults.design ?? {},
    allocation: t.defaults.allocation ?? {},
  };
}

export function listCampaignTemplates(): CampaignTemplate[] {
  return library.filter((t) => t.status === 'publicado');
}

export function getCampaignTemplate(id: string): CampaignTemplate | undefined {
  return library.find((t) => t.id === id && t.status === 'publicado');
}

export function getReportTemplate(): ReportTemplate {
  return report;
}

export function templatesPort(): TemplatePort {
  return {
    async list() {
      return listCampaignTemplates().map(toApplied);
    },
    async get(id) {
      const t = getCampaignTemplate(id);
      return t ? toApplied(t) : undefined;
    },
  };
}
