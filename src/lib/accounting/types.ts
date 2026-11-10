/**
 * Arthur Accounting System — Core Domain Types & Invariants
 * Hong Kong-first firm OS. AI proposes, domain service validates, human approves.
 *
 * Accounting invariants that MUST be enforced by tests and domain services:
 * 1. Debits = credits per journal entry (transaction currency AND base currency).
 * 2. Posted entries are immutable; corrections are reversing entries only.
 * 3. No posting to locked/closed periods.
 * 4. Every line has entity, account, currency, amount, FX rate, dimension.
 * 5. Manual journals above threshold require approval + reason code.
 * 6. Every posting links to evidence or documented reason.
 * 7. Audit log is append-only.
 * 8. Reports read posted entries only.
 */

export type CurrencyCode = 'HKD' | 'USD' | 'CNY' | 'EUR' | 'GBP' | string;

export type PeriodStatus = 'open' | 'locked' | 'closed';

export type JournalStatus = 'draft' | 'pending_approval' | 'posted' | 'reversed';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense'
  | 'contra_asset'
  | 'contra_liability';

export interface Firm {
  id: string;
  name: string;
  nameZh?: string;
  createdAt: Date;
}

export interface Client {
  id: string;
  firmId: string;
  name: string;
  nameZh?: string;
  brn?: string; // Business Registration Number
  createdAt: Date;
}

export interface Entity {
  id: string;
  clientId: string;
  name: string;
  nameZh?: string;
  crNumber?: string; // Company Registry number
  baseCurrency: CurrencyCode;
  fiscalYearEndMonth: number; // 1-12
  createdAt: Date;
}

export interface Period {
  id: string;
  entityId: string;
  fiscalYear: number;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  lockedAt?: Date;
  lockedBy?: string;
}

export interface Account {
  id: string;
  entityId: string;
  code: string;
  nameEn: string;
  nameZh?: string;
  type: AccountType;
  currency: CurrencyCode;
  isActive: boolean;
  parentId?: string;
}

export interface JournalEntry {
  id: string;
  entityId: string;
  periodId: string;
  voucherNumber: string;
  date: Date;
  reason: string;
  status: JournalStatus;
  createdBy: string;
  postedAt?: Date;
  postedBy?: string;
  evidenceLinkId?: string;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number; // always >= 0
  credit: number; // always >= 0
  currency: CurrencyCode;
  fxRate: number; // to entity base currency
  baseDebit: number;
  baseCredit: number;
  dimensionId?: string;
  description?: string;
  evidenceLinkId?: string;
}

export interface AuditEvent {
  id: string;
  entityId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  timestamp: Date;
}

/**
 * Domain service contract — LLM never writes directly to DB.
 * All mutations go through these functions which enforce invariants.
 */
export interface LedgerService {
  postJournal(entry: Omit<JournalEntry, 'id' | 'status'> & { lines: Omit<JournalLine, 'id' | 'journalEntryId'>[] }): Promise<JournalEntry>;
  reverseJournal(journalId: string, reason: string, actorId: string): Promise<JournalEntry>;
  lockPeriod(periodId: string, actorId: string): Promise<Period>;
  getTrialBalance(entityId: string, periodId: string): Promise<TrialBalanceLine[]>;
}

export interface TrialBalanceLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
}
