// Schema no dialeto MySQL (banco gerenciado do AppBuilder). O modo PGlite de dev
// local reaproveita estas MESMAS tabelas: as colunas (varchar/text/json/boolean)
// mapeiam valores de forma idêntica nos dois bancos, então todo o código de
// consulta tem um único caminho. O DDL de cada banco vive em ./migrations.
//
// Timestamps são varchar com a string ISO-8601 UTC (ex.: 2026-10-16T12:00:00.000Z):
// a API já trafega essas strings e nunca usa função de data no SQL — só ordenação,
// que em ISO-UTC é lexicográfica. Isso evita a conversão frágil ISO ↔ DATETIME do MySQL.
import { bigint, boolean, int, json, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import type { Allocation, Audience, Decision, Design, DyLink, ExperimentStatus, FaroEvent, OverlapDecision } from '@faro/contracts';

const isoTimestamp = (name: string) => varchar(name, { length: 40 });

export const experiments = mysqlTable('experiments', {
  faroId: varchar('faro_id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  bu: varchar('bu', { length: 16 }).notNull().$type<'ecom' | 'saude' | 'fintech' | 'servicos' | 'ecossistema'>(),
  ownerSquad: text('owner_squad').notNull(),
  ownerEmail: varchar('owner_email', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().$type<ExperimentStatus>(),
  templateId: varchar('template_id', { length: 64 }),
  design: json('design').notNull().$type<Design>(),
  audience: json('audience').notNull().$type<Audience>(),
  allocation: json('allocation').notNull().$type<Allocation>(),
  overlap: json('overlap').$type<OverlapDecision[]>(),
  dy: json('dy').$type<DyLink>(),
  decision: json('decision').$type<Decision>(),
  legacy: boolean('legacy').notNull().default(false),
  dyCampaignId: varchar('dy_campaign_id', { length: 64 }).unique(),
  createdAt: isoTimestamp('created_at').notNull(),
  updatedAt: isoTimestamp('updated_at').notNull(),
});

export const faroIdCounters = mysqlTable('faro_id_counters', {
  year: int('year').primaryKey(),
  last: int('last').notNull(),
});

export const experimentAudit = mysqlTable('experiment_audit', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  faroId: varchar('faro_id', { length: 32 }).notNull(),
  field: varchar('field', { length: 255 }).notNull(),
  before: json('before'),
  after: json('after'),
  author: varchar('author', { length: 255 }).notNull(),
  at: isoTimestamp('at').notNull(),
});

export const domainEvents = mysqlTable('domain_events', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  type: varchar('type', { length: 64 }).notNull().$type<FaroEvent['type']>(),
  faroId: varchar('faro_id', { length: 32 }).notNull(),
  event: json('event').notNull().$type<FaroEvent>(),
  occurredAt: isoTimestamp('occurred_at').notNull(),
});

export const metricRequests = mysqlTable('metric_requests', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  metricId: varchar('metric_id', { length: 191 }).notNull().unique(),
  definition: json('definition').notNull(),
  requestedBy: varchar('requested_by', { length: 255 }).notNull(),
  requestedAt: isoTimestamp('requested_at').notNull(),
});
