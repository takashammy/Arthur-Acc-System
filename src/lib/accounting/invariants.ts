/**
 * Ledger domain service — enforces all accounting invariants.
 * Never let AI or raw SQL bypass these checks.
 */

import {
  JournalEntry,
  JournalLine,
  JournalStatus,
  Period,
  PeriodStatus,
  TrialBalanceLine,
  AuditEvent,
} from './types';

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolation';
  }
}

export function assertDebitsEqualCredits(lines: Pick<JournalLine, 'debit' | 'credit' | 'baseDebit' | 'baseCredit'>[]) {
  const txnDebit = lines.reduce((s, l) => s + l.debit, 0);
  const txnCredit = lines.reduce((s, l) => s + l.credit, 0);
  const baseDebit = lines.reduce((s, l) => s + l.baseDebit, 0);
  const baseCredit = lines.reduce((s, l) => s + l.baseCredit, 0);

  if (Math.abs(txnDebit - txnCredit) > 0.005) {
    throw new InvariantViolation(`Transaction currency out of balance: debit ${txnDebit} ≠ credit ${txnCredit}`);
  }
  if (Math.abs(baseDebit - baseCredit) > 0.005) {
    throw new InvariantViolation(`Base currency out of balance: debit ${baseDebit} ≠ credit ${baseCredit}`);
  }
}

export function assertPeriodOpen(period: Period) {
  if (period.status !== 'open') {
    throw new InvariantViolation(`Cannot post to ${period.status} period ${period.fiscalYear}`);
  }
}

export function assertPostedImmutable(entry: JournalEntry) {
  if (entry.status === 'posted') {
    throw new InvariantViolation('Posted journal entries are immutable. Create a reversing entry instead.');
  }
}

export function computeBaseAmounts(
  debit: number,
  credit: number,
  fxRate: number
): { baseDebit: number; baseCredit: number } {
  return {
    baseDebit: +(debit * fxRate).toFixed(2),
    baseCredit: +(credit * fxRate).toFixed(2),
  };
}

/**
 * Pure function that builds a trial balance from posted lines.
 * Used by both the domain service and the Excel importer validation.
 */
export function buildTrialBalance(
  lines: (JournalLine & { accountCode: string; accountName: string })[]
): TrialBalanceLine[] {
  const map = new Map<string, TrialBalanceLine>();

  for (const line of lines) {
    if (!map.has(line.accountId)) {
      map.set(line.accountId, {
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: 0,
        credit: 0,
        balance: 0,
      });
    }
    const tb = map.get(line.accountId)!;
    tb.debit += line.baseDebit;
    tb.credit += line.baseCredit;
  }

  for (const tb of map.values()) {
    tb.balance = +(tb.debit - tb.credit).toFixed(2);
  }

  return Array.from(map.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export function createAuditEvent(
  partial: Omit<AuditEvent, 'id' | 'timestamp'>
): AuditEvent {
  return {
    ...partial,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };
}
