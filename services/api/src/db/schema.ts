import { bigserial, boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { Allocation, Audience, Decision, Design, DyLink, ExperimentStatus, FaroEvent, OverlapDecision } from '@faro/contracts';

export const experiments = pgTable('experiments', {
  faroId: text('faro_id').primaryKey(),
  name: text('name').notNull(),
  bu: text('bu').notNull().$type<'ecom' | 'saude' | 'fintech' | 'servicos' | 'ecossistema'>(),
  ownerSquad: text('owner_squad').notNull(),
  ownerEmail: text('owner_email').notNull(),
  status: text('status').notNull().$type<ExperimentStatus>(),
  templateId: text('template_id'),
  design: jsonb('design').notNull().$type<Design>(),
  audience: jsonb('audience').notNull().$type<Audience>(),
  allocation: jsonb('allocation').notNull().$type<Allocation>(),
  overlap: jsonb('overlap').$type<OverlapDecision[]>(),
  dy: jsonb('dy').$type<DyLink>(),
  decision: jsonb('decision').$type<Decision>(),
  legacy: boolean('legacy').notNull().default(false),
  dyCampaignId: text('dy_campaign_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
});

export const faroIdCounters = pgTable('faro_id_counters', {
  year: integer('year').primaryKey(),
  last: integer('last').notNull(),
});

export const experimentAudit = pgTable('experiment_audit', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  faroId: text('faro_id').notNull(),
  field: text('field').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  author: text('author').notNull(),
  at: timestamp('at', { withTimezone: true, mode: 'string' }).notNull(),
});

export const domainEvents = pgTable('domain_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  type: text('type').notNull().$type<FaroEvent['type']>(),
  faroId: text('faro_id').notNull(),
  event: jsonb('event').notNull().$type<FaroEvent>(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
});

export const metricRequests = pgTable('metric_requests', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  metricId: text('metric_id').notNull().unique(),
  definition: jsonb('definition').notNull(),
  requestedBy: text('requested_by').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'string' }).notNull(),
});
