import { round2 } from "./money";
import { statements, type TbRow } from "./model";
import type { AssetWork } from "./subledger";

export interface TaxAdjustmentInput {
  label: string;
  amount: number;
  kind: "add" | "deduct" | "loss_bf";
}

export interface TaxComputation {
  accountingProfit: number;
  depreciationAddBack: number;
  capitalAllowance: number;
  allowanceNote: string;
  registerDepreciation: number;
  assessable: number;
  tax: number;
  lossCarried: number;
  firstBand: number;
  upperBand: number;
  added: number;
  deducted: number;
  lossBrought: number;
  lossUsed: number;
}

const TWO_TIER_BAND = 2_000_000;
const LOWER_RATE = 0.0825;
const UPPER_RATE = 0.165;

/** Draft Hong Kong profits tax for a corporation that elects the two-tiered rate. */
export function profitsTax(
  rows: TbRow[],
  assetRows: AssetWork[] = [],
  adjustments: TaxAdjustmentInput[] = [],
): TaxComputation {
  const report = statements(rows);
  const depreciationAddBack = round2(
    rows
      .filter((row) => row.account.type === "expense" && /depreciat/i.test(row.account.name))
      .reduce((sum, row) => sum + row.balance, 0),
  );
  const registerDepreciation = round2(assetRows.reduce((sum, row) => sum + row.depreciation, 0));
  let capitalAllowance = 0;
  const notes: string[] = [];
  if (assetRows.length > 0) {
    for (const row of assetRows) {
      capitalAllowance = round2(capitalAllowance + row.allowance);
      notes.push(`${row.asset.name}: ${row.note}`);
    }
    if (Math.abs(registerDepreciation - depreciationAddBack) >= 0.02) {
      notes.push(
        `The register computes depreciation of ${registerDepreciation.toLocaleString("en-HK")}. The books have charged ${depreciationAddBack.toLocaleString("en-HK")}. The add-back follows the books.`,
      );
    }
  } else {
    for (const row of rows) {
      if (row.account.type !== "asset" || row.debit <= 0) continue;
      if (row.account.flow !== "investing" && !/property|plant|equipment|machinery/i.test(row.account.name)) continue;
      if (/property|building|leasehold/i.test(row.account.name)) {
        const allowance = round2(row.debit * 0.04);
        capitalAllowance = round2(capitalAllowance + allowance);
        notes.push(`${row.account.name}: commercial building allowance at 4% of cost, taken from the account in the absence of a fixed asset register`);
      } else {
        const initial = round2(row.debit * 0.6);
        const annual = round2((row.debit - initial) * 0.2);
        capitalAllowance = round2(capitalAllowance + initial + annual);
        notes.push(`${row.account.name}: plant and machinery, taken from the account in the absence of a fixed asset register`);
      }
    }
  }
  const added = round2(
    adjustments.filter((item) => item.kind === "add").reduce((sum, item) => sum + item.amount, 0),
  );
  const deducted = round2(
    adjustments.filter((item) => item.kind === "deduct").reduce((sum, item) => sum + item.amount, 0),
  );
  const lossBrought = round2(
    adjustments.filter((item) => item.kind === "loss_bf").reduce((sum, item) => sum + item.amount, 0),
  );
  const beforeLoss = round2(report.incomeTotal + depreciationAddBack - capitalAllowance + added - deducted);
  const lossUsed = beforeLoss > 0 ? round2(Math.min(lossBrought, beforeLoss)) : 0;
  const assessable = round2(beforeLoss - lossUsed);
  const profit = Math.max(0, assessable);
  const firstBand = round2(Math.min(profit, TWO_TIER_BAND));
  const upperBand = round2(profit - firstBand);
  const currentLoss = beforeLoss < 0 ? round2(-beforeLoss) : 0;
  return {
    accountingProfit: report.incomeTotal,
    depreciationAddBack,
    capitalAllowance,
    allowanceNote: notes.join(" ") || "No qualifying expenditure in the year.",
    registerDepreciation,
    assessable,
    tax: round2(firstBand * LOWER_RATE + upperBand * UPPER_RATE),
    lossCarried: round2(currentLoss + (lossBrought - lossUsed)),
    firstBand,
    upperBand,
    added,
    deducted,
    lossBrought,
    lossUsed,
  };
}

export function taxNarrative(entityName: string, tax: TaxComputation): string {
  const head = tax.assessable >= 0 ? `assessable profits of ${tax.assessable.toLocaleString("en-HK")}` : `a tax loss of ${Math.abs(tax.assessable).toLocaleString("en-HK")}`;
  return [
    `${entityName}: draft profits tax computation, not a BIR51.`,
    `Accounting profit/(loss) ${tax.accountingProfit.toLocaleString("en-HK")}.`,
    `Depreciation of ${tax.depreciationAddBack.toLocaleString("en-HK")} is added back.`,
    `Capital allowances of ${tax.capitalAllowance.toLocaleString("en-HK")} are deducted.`,
    tax.added ? `Other additions ${tax.added.toLocaleString("en-HK")}.` : "",
    tax.deducted ? `Other deductions ${tax.deducted.toLocaleString("en-HK")}.` : "",
    tax.lossBrought ? `Loss brought forward ${tax.lossBrought.toLocaleString("en-HK")}, of which ${tax.lossUsed.toLocaleString("en-HK")} is used.` : "",
    `The result is ${head}. Tax at the two-tiered rates is ${tax.tax.toLocaleString("en-HK")}.`,
    tax.lossCarried ? `Loss carried forward ${tax.lossCarried.toLocaleString("en-HK")}.` : "",
    tax.allowanceNote,
  ]
    .filter(Boolean)
    .join(" ");
}
