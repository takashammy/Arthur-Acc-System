/**
 * Drizzle schema outline for Arthur Accounting System.
 * Will be wired to Postgres once drizzle-orm and postgres deps are installed.
 * Matches the minimum viable data model from the handoff.
 */

import { pgTable, text, timestamp, integer, numeric, boolean, jsonb, uuid } from 'drizzle-orm/pg-core';

// Placeholder — real imports after npm install completes
export const firms = pgTable('firms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nameZh: text('name_zh'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmId: uuid('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  nameZh: text('name_zh'),
  brn: text('brn'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  name: text('name').notNull(),
  nameZh: text('name_zh'),
  crNumber: text('cr_number'),
  baseCurrency: text('base_currency').notNull().default('HKD'),
  fiscalYearEndMonth: integer('fiscal_year_end_month').notNull().default(3),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const periods = pgTable('periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: text('status').notNull().default('open'), // open | locked | closed
  lockedAt: timestamp('locked_at'),
  lockedBy: text('locked_by'),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  code: text('code').notNull(),
  nameEn: text('name_en').notNull(),
  nameZh: text('name_zh'),
  type: text('type').notNull(), // asset | liability | equity | revenue | expense | contra_*
  currency: text('currency').notNull().default('HKD'),
  isActive: boolean('is_active').notNull().default(true),
  parentId: uuid('parent_id'),
});

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  periodId: uuid('period_id').references(() => periods.id).notNull(),
  voucherNumber: text('voucher_number').notNull(),
  date: timestamp('date').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('draft'), // draft | pending_approval | posted | reversed
  createdBy: text('created_by').notNull(),
  postedAt: timestamp('posted_at'),
  postedBy: text('posted_by'),
  evidenceLinkId: uuid('evidence_link_id'),
});

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id).notNull(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  debit: numeric('debit', { precision: 18, scale: 2 }).notNull().default('0'),
  credit: numeric('credit', { precision: 18, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull(),
  fxRate: numeric('fx_rate', { precision: 18, scale: 8 }).notNull().default('1'),
  baseDebit: numeric('base_debit', { precision: 18, scale: 2 }).notNull().default('0'),
  baseCredit: numeric('base_credit', { precision: 18, scale: 2 }).notNull().default('0'),
  dimensionId: uuid('dimension_id'),
  description: text('description'),
  evidenceLinkId: uuid('evidence_link_id'),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
