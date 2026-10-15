import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { Experiment, FaroEvent } from '@faro/contracts';
import { FaroEventSchema } from '@faro/contracts';
import { formatFaroId } from '@faro/config-core';
import type { Db } from '../db/client.ts';
import { domainEvents, experimentAudit, experiments, faroIdCounters } from '../db/schema.ts';

type Row = typeof experiments.$inferSelect;
/** Transação ou banco: as duas expõem a mesma API de consulta. */
export type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export function toExperiment(r: Row): Experiment {
  return {
    faroId: r.faroId,
    name: r.name,
    bu: r.bu,
    ownerSquad: r.ownerSquad,
    ownerEmail: r.ownerEmail,
    status: r.status,
    ...(r.templateId ? { templateId: r.templateId } : {}),
    design: r.design,
    audience: r.audience,
    allocation: r.allocation,
    ...(r.overlap ? { overlap: r.overlap } : {}),
    ...(r.dy ? { dy: r.dy } : {}),
    ...(r.decision ? { decision: r.decision } : {}),
    legacy: r.legacy,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

function toRow(e: Experiment): Row {
  return {
    faroId: e.faroId,
    name: e.name,
    bu: e.bu,
    ownerSquad: e.ownerSquad,
    ownerEmail: e.ownerEmail,
    status: e.status,
    templateId: e.templateId ?? null,
    design: e.design,
    audience: e.audience,
    allocation: e.allocation,
    overlap: e.overlap ?? null,
    dy: e.dy ?? null,
    decision: e.decision ?? null,
    legacy: e.legacy ?? false,
    dyCampaignId: e.dy?.campaignId ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** Próximo faroId do ano, atômico (upsert no contador). */
export async function nextFaroId(tx: Tx, year: number): Promise<string> {
  const [row] = await tx
    .insert(faroIdCounters)
    .values({ year, last: 1 })
    .onConflictDoUpdate({ target: faroIdCounters.year, set: { last: sql`${faroIdCounters.last} + 1` } })
    .returning();
  return formatFaroId(year, row!.last);
}

/** Garante que o contador do ano está pelo menos em `seq` (usado no seed de fixtures). */
export async function bumpCounter(tx: Tx, year: number, seq: number): Promise<void> {
  await tx
    .insert(faroIdCounters)
    .values({ year, last: seq })
    .onConflictDoUpdate({ target: faroIdCounters.year, set: { last: sql`greatest(${faroIdCounters.last}, ${seq})` } });
}

export async function insertExperiment(tx: Tx, e: Experiment): Promise<void> {
  await tx.insert(experiments).values(toRow(e));
}

export async function updateExperiment(tx: Tx, e: Experiment): Promise<void> {
  const { faroId: _id, createdAt: _c, ...rest } = toRow(e);
  await tx.update(experiments).set(rest).where(eq(experiments.faroId, e.faroId));
}

export async function getExperiment(tx: Tx, faroId: string): Promise<Experiment | undefined> {
  const [row] = await tx.select().from(experiments).where(eq(experiments.faroId, faroId));
  return row ? toExperiment(row) : undefined;
}

export async function findByCampaignId(tx: Tx, campaignId: string): Promise<Experiment | undefined> {
  const [row] = await tx.select().from(experiments).where(eq(experiments.dyCampaignId, campaignId));
  return row ? toExperiment(row) : undefined;
}

export async function listExperiments(tx: Tx): Promise<Experiment[]> {
  return (await tx.select().from(experiments).orderBy(desc(experiments.updatedAt))).map(toExperiment);
}

export async function appendEvent(tx: Tx, event: FaroEvent): Promise<void> {
  const ev = FaroEventSchema.parse(event);
  await tx.insert(domainEvents).values({ type: ev.type, faroId: ev.faroId, event: ev, occurredAt: ev.occurredAt });
}

export async function hasEvent(tx: Tx, faroId: string, type: FaroEvent['type']): Promise<boolean> {
  const rows = await tx
    .select({ id: domainEvents.id })
    .from(domainEvents)
    .where(and(eq(domainEvents.faroId, faroId), eq(domainEvents.type, type)))
    .limit(1);
  return rows.length > 0;
}

export async function listEvents(tx: Tx, opts: { afterId?: number; faroId?: string } = {}) {
  const conds = [];
  if (opts.afterId) conds.push(gt(domainEvents.id, opts.afterId));
  if (opts.faroId) conds.push(eq(domainEvents.faroId, opts.faroId));
  const rows = await tx
    .select()
    .from(domainEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(domainEvents.id))
    .limit(500);
  return rows.map((r) => ({ id: r.id, ...r.event }));
}

export async function appendAudit(
  tx: Tx,
  entries: { faroId: string; field: string; before: unknown; after: unknown; author: string; at: string }[],
): Promise<void> {
  if (entries.length) await tx.insert(experimentAudit).values(entries);
}

export async function listAudit(tx: Tx, faroId: string) {
  const rows = await tx.select().from(experimentAudit).where(eq(experimentAudit.faroId, faroId)).orderBy(asc(experimentAudit.id));
  return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}
