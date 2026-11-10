# Arthur Accounting System

Hong Kong-first AI Accounting Firm Operating System.

AI prepares bookkeeping, management accounts, profits-tax computations, and company-secretarial drafts. Humans review and approve. Internal firm OS for V1; white-label later.

## V1 Beachhead
- Ledger core (double-entry, COA, TB/P&L/BS, audit log)
- Excel importer (management account templates)
- Document AI + evidence linking
- Client PWA (EN/TC)
- Approval inbox
- Profits tax + BIR51 pack
- Company secretarial (registers, NAR1)
- Audit partner portal

## Stack
- Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui
- Postgres + Drizzle ORM
- Better Auth (MFA)
- Python AI worker (PaddleOCR + optional VLM API)
- Docker Compose on single VPS
- Target infra cost: < USD 100/month

## Accounting Invariants (enforced)
1. Debits = credits (txn + base currency)
2. Posted entries immutable (reversals only)
3. No post to locked periods
4. Every line has entity/account/currency/FX/dimension
5. Threshold journals need approval + reason
6. Evidence or documented reason required
7. Audit log append-only
8. Reports from posted entries only

## Getting started
```bash
npm install
npm run dev
```

See `src/lib/accounting/` for domain types, invariant enforcement, the reconstructed Harbour Trade / Harbour Rental books (`model.ts`), and the Excel journal importer (`excel.ts`).

The importer accepts `.xlsx` / `.csv` general journals:

- signed amounts (debit positive, credit negative)
- Excel serial dates (1899-12-30 epoch)
- header detection, with a fallback column order of date / voucher / account / description / amount
- reused voucher numbers that contain more than one balanced entry are blocked
- multi-date vouchers are warned
- unbalanced vouchers are blocked

Sample books in `model.ts` are posted journals that reconstruct the management-account figures (trade profit 6,366.34 and net assets 16,366.34; rental loss 56,000.00 with cash 1,288,000). Reports must keep current-year result separate from opening equity.

## Build order
1. Foundation (auth, firm, client, entity, period, RBAC)
2. Ledger core + invariants
3. Excel importer + fixture validation
4. Report engine
5. Bank module
6. ...
