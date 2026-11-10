export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-black dark:text-zinc-50">
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Arthur Accounting System
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
          Hong Kong-first AI Accounting Firm OS
        </p>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 mb-6">
          <h2 className="text-xl font-medium mb-3">Current status</h2>
          <ul className="space-y-2 text-sm">
            <li>✅ Next.js 16 + TypeScript scaffold</li>
            <li>✅ Domain types (firm → client → entity → period → COA → journal)</li>
            <li>✅ Invariant enforcement (debits=credits, period locks, immutability)</li>
            <li>✅ Ledger posting service skeleton</li>
            <li>✅ Drizzle schema outline</li>
            <li>⏳ npm install still finishing (sandbox network)</li>
            <li>🔜 Excel importer + fixture validation</li>
            <li>🔜 Auth + RBAC</li>
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
          <h2 className="text-xl font-medium mb-3">V1 beachhead</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Bookkeeping, management accounts, profits tax computation, and company
            secretarial preparation for HK private limited companies. AI proposes;
            you approve.
          </p>
        </div>
      </main>
    </div>
  );
}
