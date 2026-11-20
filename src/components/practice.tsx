import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { subscribe } from "@/lib/accounting/nav";
import { AuditorPage } from "@/routes/auditor";
import { BankPage } from "@/routes/bank";
import { ClientPage } from "@/routes/client";
import { ClosePage } from "@/routes/close";
import { DocumentsPage } from "@/routes/documents";
import { GroupPage } from "@/routes/group";
import { ImportPage } from "@/routes/import";
import { Home } from "@/routes/index";
import { JournalsPage } from "@/routes/journals";
import { LeasesPage } from "@/routes/leases";
import { LedgersPage } from "@/routes/ledgers";
import { PayrollPage } from "@/routes/payroll";
import { ReportsPage } from "@/routes/reports";
import { ReviewPage } from "@/routes/review";
import { SecretarialPage } from "@/routes/secretarial";
import { StockPage } from "@/routes/stock";
import { TaxPage } from "@/routes/tax";

const PAGES: Record<string, () => ReactNode> = {
  "/": Home,
  "/journals": JournalsPage,
  "/reports": ReportsPage,
  "/import": ImportPage,
  "/bank": BankPage,
  "/ledgers": LedgersPage,
  "/payroll": PayrollPage,
  "/stock": StockPage,
  "/leases": LeasesPage,
  "/group": GroupPage,
  "/documents": DocumentsPage,
  "/tax": TaxPage,
  "/secretarial": SecretarialPage,
  "/close": ClosePage,
  "/review": ReviewPage,
  "/client": ClientPage,
  "/auditor": AuditorPage,
};

export function Practice() {
  const url = useRouterState({ select: (state) => state.location.pathname });
  const [screen, setScreen] = useState(url);
  useEffect(() => subscribe(setScreen), []);
  useEffect(() => {
    setScreen(url);
  }, [url]);
  const Page = PAGES[screen] ?? Home;
  if (screen === "/client" || screen === "/auditor") return <Page />;
  return (
    <Shell path={screen}>
      <Page />
    </Shell>
  );
}
