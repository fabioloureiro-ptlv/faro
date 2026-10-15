// Frente 3 — catálogo de segmentos.
// O catálogo oficial é um arquivo versionado (data/models/audiences/catalog.json): cada segmento
// aponta para a sua query (.sql, com parâmetros nomeados como @dias_inadimplencia). O arquivo é lido
// a cada chamada, então editar o catálogo não exige reiniciar a API. Segmentos importados por
// POST /publico/audiences/import ficam à parte, em services/api/.data/audiences-custom.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudienceShortcutSchema, type AudienceShortcut } from '@faro/contracts';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
// Os caminhos têm override por variável de ambiente para os testes não dependerem dos arquivos da máquina.
const CATALOG_PATH = process.env.FARO_AUDIENCES_CATALOG_PATH ?? join(REPO_ROOT, 'data/models/audiences/catalog.json');
const CUSTOM_PATH = process.env.FARO_AUDIENCES_CUSTOM_PATH ?? fileURLToPath(new URL('../../.data/audiences-custom.json', import.meta.url));

export function listCatalogShortcuts(): AudienceShortcut[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  } catch (e) {
    throw new Error(`Catálogo de segmentos ilegível (${CATALOG_PATH}): ${(e as Error).message}`, { cause: e });
  }
  return (raw as unknown[]).map((a) => AudienceShortcutSchema.parse(a));
}

export function listCustomShortcuts(): AudienceShortcut[] {
  if (!existsSync(CUSTOM_PATH)) return [];
  try {
    return (JSON.parse(readFileSync(CUSTOM_PATH, 'utf-8')) as unknown[]).map((a) => AudienceShortcutSchema.parse(a));
  } catch {
    return [];
  }
}

export function allShortcuts(): AudienceShortcut[] {
  return [...listCatalogShortcuts(), ...listCustomShortcuts()];
}

export function slugAudienceId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)
    .replace(/^-|-$/g, '');
}

export function addCustomShortcut(shortcut: AudienceShortcut): AudienceShortcut {
  const parsed = AudienceShortcutSchema.parse(shortcut);
  if (allShortcuts().some((s) => s.id === parsed.id || s.name.toLowerCase() === parsed.name.toLowerCase()))
    throw new Error(`já existe um segmento com esse nome/id: ${parsed.id}`);
  const custom = [...listCustomShortcuts(), parsed];
  mkdirSync(dirname(CUSTOM_PATH), { recursive: true });
  writeFileSync(CUSTOM_PATH, JSON.stringify(custom, null, 2), 'utf-8');
  return parsed;
}
