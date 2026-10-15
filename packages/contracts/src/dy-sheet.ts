// Ficha de configuração do DY (CFG-11): um bloco por campo do console.
import { z } from 'zod';
import { FaroIdSchema } from './schemas.ts';

export const DySheetBlockSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Valor exato a colar no console. Nunca texto que o operador precise inventar. */
  value: z.string(),
  hint: z.string().optional(),
});

export const DySheetSchema = z.object({
  faroId: FaroIdSchema,
  generatedAt: z.iso.datetime({ offset: true }),
  blocks: z.array(DySheetBlockSchema).min(1),
});

export type DySheetBlock = z.infer<typeof DySheetBlockSchema>;
export type DySheet = z.infer<typeof DySheetSchema>;
