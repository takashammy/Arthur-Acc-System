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

See `src/lib/accounting/` for domain types and invariant enforcement.

## Build order
1. Foundation (auth, firm, client, entity, period, RBAC)
2. Ledger core + invariants
3. Excel importer + fixture validation
4. Report engine
5. Bank module
6. ...
