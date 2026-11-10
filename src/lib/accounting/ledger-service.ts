/**
 * Ledger posting service.
 * All journal mutations must go through this — never raw inserts.
 * Enforces every invariant before any write.
 */

import {
  assertDebitsEqualCredits,
  assertPeriodOpen,
  assertPostedImmutable,
  computeBaseAmounts,
  createAuditEvent,
} from './invariants';
import type { JournalEntry, JournalLine, Period, AuditEvent } from './types';

export interface PostJournalInput {
  entityId: string;
  periodId: string;
  voucherNumber: string;
  date: Date;
  reason: string;
  createdBy: string;
  lines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    currency: string;
    fxRate: number;
    dimensionId?: string;
    description?: string;
    evidenceLinkId?: string;
  }>;
  evidenceLinkId?: string;
}

export class LedgerService {
  /**
   * Post a new journal entry after validating all invariants.
   * In a real implementation this would open a DB transaction,
   * insert the entry + lines, write the audit event, and commit.
   */
  async postJournal(input: PostJournalInput, period: Period): Promise<{ entry: JournalEntry; audit: AuditEvent }> {
    assertPeriodOpen(period);

    const lines: Omit<JournalLine, 'id' | 'journalEntryId'>[] = input.lines.map((l) => {
      if (l.debit < 0 || l.credit < 0) {
        throw new Error('Debit and credit must be non-negative');
      }
      if (l.debit > 0 && l.credit > 0) {
        throw new Error('A line cannot have both debit and credit');
      }
      const base = computeBaseAmounts(l.debit, l.credit, l.fxRate);
      return {
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        currency: l.currency,
        fxRate: l.fxRate,
        baseDebit: base.baseDebit,
        baseCredit: base.baseCredit,
        dimensionId: l.dimensionId,
        description: l.description,
        evidenceLinkId: l.evidenceLinkId,
      };
    });

    assertDebitsEqualCredits(lines);

    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      entityId: input.entityId,
      periodId: input.periodId,
      voucherNumber: input.voucherNumber,
      date: input.date,
      reason: input.reason,
      status: 'posted',
      createdBy: input.createdBy,
      postedAt: new Date(),
      postedBy: input.createdBy,
      evidenceLinkId: input.evidenceLinkId,
    };

    const audit = createAuditEvent({
      entityId: input.entityId,
      actorId: input.createdBy,
      action: 'journal.posted',
      resourceType: 'journal_entry',
      resourceId: entry.id,
      after: { voucherNumber: entry.voucherNumber, lineCount: lines.length },
    });

    // TODO: persist entry, lines, and audit inside a transaction
    return { entry, audit };
  }

  /**
   * Create a reversing entry for a posted journal.
   * Original remains immutable.
   */
  async reverseJournal(
    original: JournalEntry,
    reason: string,
    actorId: string,
    period: Period
  ): Promise<{ entry: JournalEntry; audit: AuditEvent }> {
    assertPostedImmutable(original);
    assertPeriodOpen(period);

    const reversing: JournalEntry = {
      id: crypto.randomUUID(),
      entityId: original.entityId,
      periodId: original.periodId,
      voucherNumber: `${original.voucherNumber}-REV`,
      date: new Date(),
      reason: `Reversal of ${original.voucherNumber}: ${reason}`,
      status: 'posted',
      createdBy: actorId,
      postedAt: new Date(),
      postedBy: actorId,
    };

    const audit = createAuditEvent({
      entityId: original.entityId,
      actorId,
      action: 'journal.reversed',
      resourceType: 'journal_entry',
      resourceId: reversing.id,
      before: { originalId: original.id },
      after: { voucherNumber: reversing.voucherNumber },
    });

    return { entry: reversing, audit };
  }
}
