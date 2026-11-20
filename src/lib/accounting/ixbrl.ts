import type { Statements } from "./model";

function tag(name: string, value: number) {
  return `<ix:nonFraction name="hk:${name}" contextRef="CY" unitRef="HKD" decimals="2">${value.toFixed(2)}</ix:nonFraction>`;
}

/** A working inline-XBRL draft. It is not an Inland Revenue Department filing. */
export function draftIxbrl(input: { entityName: string; crNumber: string; yearEnd: string; report: Statements }) {
  const lines = (title: string, rows: { name: string; amount: number }[], totalName: string, total: number) =>
    `<h2>${title}</h2><table>${rows
      .map((row) => `<tr><td>${row.name}</td><td>${tag(row.name.replace(/[^A-Za-z0-9]/g, ""), row.amount)}</td></tr>`)
      .join("")}<tr><td>${totalName}</td><td>${tag(totalName.replace(/[^A-Za-z0-9]/g, ""), total)}</td></tr></table>`;
  return `<!DOCTYPE html>
<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL">
<head><meta charset="utf-8"><title>${input.entityName} — iXBRL draft</title></head>
<body>
<p>Working draft only. This is not a file accepted by the Inland Revenue Department.</p>
<p>${input.entityName} · CR ${input.crNumber} · Year ended ${input.yearEnd}</p>
${lines("Profit and loss", input.report.income, "ProfitOrLoss", input.report.incomeTotal)}
${lines("Assets", input.report.assets, "Assets", input.report.assetTotal)}
${lines("Liabilities", input.report.liabilities, "Liabilities", input.report.liabilityTotal)}
${lines("Equity", input.report.equity, "Equity", input.report.equityTotal)}
</body></html>`;
}

export function downloadIxbrl(filename: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
