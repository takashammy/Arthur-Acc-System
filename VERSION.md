# Arthur Accounting System — v1.0

Checkpoint of the working Hong Kong practice OS, 11 November 2026.

AI prepares the books, the tax working, and the company-secretarial pack. A person reviews and approves. Auth is off so the books open straight onto the practice.

## In this release

- Double-entry ledger, trial balance, profit and loss, balance sheet, cash flow
- Excel journal import with defect checks
- Bank statement import and reconciliation
- Trade receivables, trade payables, and the fixed asset register
- Payroll and Mandatory Provident Fund (2026 rules)
- Inventory at weighted average cost
- Right-of-use assets and lease liabilities
- Consolidated trial balance with eliminations
- Supporting documents, with local invoice extraction
- Draft profits tax computation and BIR51 working
- Statutory registers, NAR1 working, and the compliance calendar
- Review: submit, review, sign, release
- Client portal and read-only auditor access, including an audit file and an iXBRL draft
- Period close checks

## Schema

Migrations `0001` to `0007` are in `migrations/`.

## Not in v1.0

VPS deploy and backups. Full Inland Revenue Department iXBRL. Payroll beyond monthly mandatory MPF.
