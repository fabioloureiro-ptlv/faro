// MOCK da frente 5: dois templates fixos.
import type { TemplatePort } from '../ports.ts';
import { fx } from './fixtures.ts';

export function mockTemplates(): TemplatePort {
  return {
    async list() {
      return fx.templates;
    },
    async get(id) {
      return fx.templates.find((t) => t.id === id);
    },
  };
}
