// Frente 3 — catálogo de segmentos com acréscimos aprovados pelo produto.
// Os atalhos base vivem na fixture (dados versionados); os criados pela tela
// /segmento são gravados em services/api/.data/audiences-custom.json e entram
// na mesma lista — inclusive na etapa de Público do wizard (porta da frente 1).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudienceShortcutSchema, type AudienceShortcut } from '@faro/contracts';
import audiences from '@faro/contracts/fixtures/audiences.json' with { type: 'json' };

// FARO_AUDIENCES_CUSTOM_PATH existe para os testes não lerem os segmentos importados na máquina.
const CUSTOM_PATH = process.env.FARO_AUDIENCES_CUSTOM_PATH ?? fileURLToPath(new URL('../../.data/audiences-custom.json', import.meta.url));

const fixture: AudienceShortcut[] = (audiences as unknown[]).map((a) => AudienceShortcutSchema.parse(a));

export function listCustomShortcuts(): AudienceShortcut[] {
  if (!existsSync(CUSTOM_PATH)) return [];
  try {
    return (JSON.parse(readFileSync(CUSTOM_PATH, 'utf-8')) as unknown[]).map((a) => AudienceShortcutSchema.parse(a));
  } catch {
    return [];
  }
}

export function allShortcuts(): AudienceShortcut[] {
  return [...fixture, ...listCustomShortcuts()];
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
