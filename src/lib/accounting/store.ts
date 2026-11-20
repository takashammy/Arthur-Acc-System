import { create } from "zustand";
import type { Account, AccountType, Entity, Journal, Period } from "./model";
import type { ImportVoucher } from "./excel";
import {
  addRequestFn,
  createAssetFn,
  createInvoiceFn,
  fulfillRequestFn,
  importBankFn,
  importVouchersFn,
  linkDocumentFn,
  loadLedger,
  openDocumentFn,
  postJournalFn,
  reverseJournalFn,
  addAccountFn,
  setAccountTypeFn,
  setPeriodFn,
  setReviewFn,
  settleInvoiceFn,
  uploadDocumentFn,
  type AuditEvent,
  type BankLine,
  type ClientRequest,
  type DocumentFile,
  type EvidenceLink,
  type FirmRole,
  type Officer,
  type PaySlip,
  type PostPayload,
  type Review,
  type StockItem,
  type Employee,
  type EliminationRow,
  type Lease,
  type TaxAdjustment,
  type EntityPaper,
} from "./ledger.functions";
import {
  acceptProposalFn,
  addEliminationFn,
  addEmployeeFn,
  addLeaseFn,
  addStockFn,
  closeYearFn,
  createCompanyFn,
  moveStockFn,
  postLeaseMonthFn,
  recogniseLeaseFn,
  refineProposalFn,
  removeAdjustmentFn,
  removeOfficerFn,
  runPayrollFn,
  saveAdjustmentFn,
  saveOfficerFn,
  setAssetWdvFn,
  setRoleFn,
  matchBankFn,
  savePaperFn,
} from "./operations.functions";
import { readInvoiceText, type InvoiceRead } from "./extract";
import { isImage, readImageText } from "./ocr";
import type { FixedAsset, Invoice, InvoiceKind, Settlement } from "./subledger";

interface LedgerState {
  firmName: string;
  role: FirmRole;
  ownerId: string | null;
  entities: Entity[];
  accounts: Account[];
  journals: Journal[];
  periods: Period[];
  audit: AuditEvent[];
  bankLines: BankLine[];
  documents: DocumentFile[];
  links: EvidenceLink[];
  officers: Officer[];
  invoices: Invoice[];
  settlements: Settlement[];
  assets: FixedAsset[];
  reviews: Review[];
  requests: ClientRequest[];
  employees: Employee[];
  paySlips: PaySlip[];
  stock: StockItem[];
  leases: Lease[];
  eliminations: EliminationRow[];
  taxAdjustments: TaxAdjustment[];
  papers: EntityPaper[];
  activeEntityId: string;
  hydrated: boolean;
  error: string | null;
  load: () => Promise<void>;
  setEntity: (id: string) => void;
  postJournal: (input: PostPayload) => Promise<string | null>;
  lockPeriod: (entityId: string) => Promise<string | null>;
  unlockPeriod: (entityId: string) => Promise<string | null>;
  importVouchers: (
    entityId: string,
    vouchers: ImportVoucher[],
    nameToId: Map<string, string>,
    mode?: "all" | "clean",
  ) => Promise<{ posted: string[]; skipped: string[] }>;
  importBank: (
    entityId: string,
    rows: { date: string; description: string; amount: number }[],
  ) => Promise<string | null>;
  uploadDocument: (input: {
    entityId: string;
    filename: string;
    mime: string;
    body: string;
    journalId?: string;
  }) => Promise<{ error: string | null; documentId: string | null }>;
  linkDocument: (documentId: string, journalId: string) => Promise<string | null>;
  openDocument: (documentId: string) => Promise<void>;
  inspectDocument: (documentId: string) => Promise<InvoiceRead>;
  createInvoice: (input: {
    entityId: string;
    kind: InvoiceKind;
    party: string;
    number: string;
    invoiceDate: string;
    dueDate: string;
    amount: number;
    documentId?: string;
  }) => Promise<string | null>;
  settleInvoice: (invoiceId: string, date: string, amount: number) => Promise<string | null>;
  createAsset: (input: {
    entityId: string;
    name: string;
    category: FixedAsset["category"];
    acquired: string;
    cost: number;
    fund: "cash" | "director";
    taxWdv: number | null;
  }) => Promise<string | null>;
  setReview: (
    entityId: string,
    action: "submit" | "return" | "review" | "sign" | "release",
    note?: string,
  ) => Promise<string | null>;
  addRequest: (entityId: string, title: string, detail?: string) => Promise<string | null>;
  fulfillRequest: (input: { requestId: string; filename: string; mime: string; body: string }) => Promise<string | null>;
  addEmployee: (entityId: string, name: string, monthlyPay: number) => Promise<string | null>;
  runPayroll: (entityId: string, paidOn: string) => Promise<string | null>;
  addStock: (entityId: string, sku: string, name: string, unitCost: number) => Promise<string | null>;
  moveStock: (itemId: string, kind: "in" | "out", qty: number, unitCost: number, date: string) => Promise<string | null>;
  addLease: (input: { entityId: string; name: string; started: string; months: number; payment: number; annualRate: number }) => Promise<string | null>;
  recogniseLease: (leaseId: string) => Promise<string | null>;
  postLeaseMonth: (leaseId: string, date: string) => Promise<string | null>;
  addElimination: (input: { debitCode: string; creditCode: string; amount: number; reason: string; eliminatedOn: string }) => Promise<string | null>;
  addCompany: (input: { name: string; crNumber: string; yearEnd: string; incorporated?: string; registeredOffice?: string }) => Promise<string | null>;
  reverseJournal: (journalId: string) => Promise<string | null>;
  addAccount: (input: { entityId: string; code: string; name: string; type: AccountType }) => Promise<string | null>;
  setAccountType: (accountId: string, type: AccountType) => Promise<string | null>;
  setRole: (role: FirmRole, resume?: boolean) => Promise<string | null>;
  savePaper: (paper: EntityPaper) => Promise<string | null>;
  matchBank: (lineId: string, journalId: string) => Promise<string | null>;
  setAssetWdv: (assetId: string, taxWdv: number) => Promise<string | null>;
  closeYear: (entityId: string) => Promise<string | null>;
  saveAdjustment: (input: { entityId: string; label: string; amount: number; kind: TaxAdjustment["kind"] }) => Promise<string | null>;
  removeAdjustment: (id: string) => Promise<string | null>;
  saveOfficer: (input: { id?: string; entityId: string; role: "director" | "shareholder" | "secretary"; name: string; detail: string; appointed: string }) => Promise<string | null>;
  removeOfficer: (id: string) => Promise<string | null>;
  acceptProposal: (input: {
    entityId: string;
    party: string;
    date: string;
    amount: number;
    debitAccountId: string;
    creditAccountId: string;
    rationale: string;
    source: string;
    documentId?: string;
  }) => Promise<string | null>;
  refineProposal: (input: { text: string; kind: string; accounts: { code: string; name: string; type: string }[] }) => Promise<
    | { ok: true; debitCode: string; creditCode: string; confidence: string; rationale: string }
    | { ok: false; error: string }
  >;
}

const ENTITY_KEY = "arthur.entity";

function rememberedEntity(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(ENTITY_KEY) ?? "";
}

function rememberEntity(id: string) {
  if (typeof localStorage === "undefined" || !id) return;
  localStorage.setItem(ENTITY_KEY, id);
}

function apply(
  snapshot: Awaited<ReturnType<typeof loadLedger>>,
  currentId: string,
): Partial<LedgerState> {
  const active =
    snapshot.entities.some((entity) => entity.id === currentId)
      ? currentId
      : snapshot.entities[0]?.id ?? currentId;
  return {
    firmName: snapshot.firmName,
    role: snapshot.role,
    entities: snapshot.entities,
    accounts: snapshot.accounts,
    journals: snapshot.journals,
    periods: snapshot.periods,
    audit: snapshot.audit,
    bankLines: snapshot.bankLines,
    documents: snapshot.documents,
    links: snapshot.links,
    officers: snapshot.officers,
    invoices: snapshot.invoices,
    settlements: snapshot.settlements,
    assets: snapshot.assets,
    reviews: snapshot.reviews,
    requests: snapshot.requests,
    employees: snapshot.employees,
    paySlips: snapshot.paySlips,
    stock: snapshot.stock,
    leases: snapshot.leases,
    eliminations: snapshot.eliminations,
    taxAdjustments: snapshot.taxAdjustments,
    papers: snapshot.papers,
    activeEntityId: active,
    hydrated: true,
    error: null,
  };
}

export const useLedger = create<LedgerState>()((set, get) => ({
  firmName: "",
  role: "preparer",
  ownerId: null,
  entities: [],
  accounts: [],
  journals: [],
  periods: [],
  audit: [],
  bankLines: [],
  documents: [],
  links: [],
  officers: [],
  invoices: [],
  settlements: [],
  assets: [],
  reviews: [],
  requests: [],
  employees: [],
  paySlips: [],
  stock: [],
  leases: [],
  eliminations: [],
  taxAdjustments: [],
  papers: [],
  activeEntityId: "",
  hydrated: false,
  error: null,
  load: async () => {
    try {
      const snapshot = await loadLedger();
      const active = get().activeEntityId || rememberedEntity();
      set(apply(snapshot, active));
      rememberEntity(useLedger.getState().activeEntityId);
    } catch (err) {
      set({ hydrated: true, error: err instanceof Error ? err.message : "Could not load the books." });
    }
  },
  setEntity: (id) => {
    rememberEntity(id);
    set({ activeEntityId: id });
  },
  postJournal: async (input) => {
    const result = await postJournalFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  lockPeriod: async (entityId) => {
    const result = await setPeriodFn({ data: { entityId, status: "locked" } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  unlockPeriod: async (entityId) => {
    const result = await setPeriodFn({ data: { entityId, status: "open" } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  importVouchers: async (entityId, vouchers, nameToId, mode = "all") => {
    const result = await importVouchersFn({
      data: { entityId, vouchers, nameToId: Object.fromEntries(nameToId), mode },
    });
    set(apply(result.snapshot, get().activeEntityId));
    return { posted: result.posted, skipped: result.skipped };
  },
  importBank: async (entityId, rows) => {
    const result = await importBankFn({ data: { entityId, rows } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  uploadDocument: async (input) => {
    const result = await uploadDocumentFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return { error: result.error, documentId: result.documentId ?? null };
  },
  linkDocument: async (documentId, journalId) => {
    const result = await linkDocumentFn({ data: { documentId, journalId } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  openDocument: async (documentId) => {
    const file = await openDocumentFn({ data: { documentId } });
    if (!file) return;
    const binary = atob(file.body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  inspectDocument: async (documentId) => {
    const file = await openDocumentFn({ data: { documentId } });
    if (!file) return { party: null, date: null, amount: null, note: "That file is not on this company." };
    if (isImage(file.mime, file.filename)) {
      const binary = atob(file.body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      try {
        const text = await readImageText(new Blob([bytes], { type: file.mime || "image/png" }));
        return readInvoiceText(text);
      } catch {
        return { party: null, date: null, amount: null, note: "Could not read the photo. Type the supplier, date, and total below." };
      }
    }
    const binary = atob(file.body);
    return readInvoiceText(binary);
  },
  createInvoice: async (input) => {
    const result = await createInvoiceFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  settleInvoice: async (invoiceId, date, amount) => {
    const result = await settleInvoiceFn({ data: { invoiceId, date, amount } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  createAsset: async (input) => {
    const result = await createAssetFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  setReview: async (entityId, action, note) => {
    const result = await setReviewFn({ data: { entityId, action, note } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addRequest: async (entityId, title, detail) => {
    const result = await addRequestFn({ data: { entityId, title, detail } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  fulfillRequest: async (input) => {
    const result = await fulfillRequestFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addEmployee: async (entityId, name, monthlyPay) => {
    const result = await addEmployeeFn({ data: { entityId, name, monthlyPay } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  runPayroll: async (entityId, paidOn) => {
    const result = await runPayrollFn({ data: { entityId, paidOn } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addStock: async (entityId, sku, name, unitCost) => {
    const result = await addStockFn({ data: { entityId, sku, name, unitCost } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  moveStock: async (itemId, kind, qty, unitCost, date) => {
    const result = await moveStockFn({ data: { itemId, kind, qty, unitCost, date } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addLease: async (input) => {
    const result = await addLeaseFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  recogniseLease: async (leaseId) => {
    const result = await recogniseLeaseFn({ data: { leaseId } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  postLeaseMonth: async (leaseId, date) => {
    const result = await postLeaseMonthFn({ data: { leaseId, date } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addElimination: async (input) => {
    const result = await addEliminationFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addCompany: async (input) => {
    const result = await createCompanyFn({ data: input });
    const active = result.entityId ?? get().activeEntityId;
    rememberEntity(active);
    set(apply(result.snapshot, active));
    return result.error;
  },
  reverseJournal: async (journalId) => {
    const result = await reverseJournalFn({ data: { journalId } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  addAccount: async (input) => {
    const result = await addAccountFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  setAccountType: async (accountId, type) => {
    const result = await setAccountTypeFn({ data: { accountId, type } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  setRole: async (role, resume = false) => {
    const result = await setRoleFn({ data: { role, resume } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  savePaper: async (paper) => {
    const result = await savePaperFn({ data: { paper } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  matchBank: async (lineId, journalId) => {
    const result = await matchBankFn({ data: { lineId, journalId } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  setAssetWdv: async (assetId, taxWdv) => {
    const result = await setAssetWdvFn({ data: { assetId, taxWdv } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  closeYear: async (entityId) => {
    const result = await closeYearFn({ data: { entityId } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  saveAdjustment: async (input) => {
    const result = await saveAdjustmentFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  removeAdjustment: async (id) => {
    const result = await removeAdjustmentFn({ data: { id } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  saveOfficer: async (input) => {
    const result = await saveOfficerFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  removeOfficer: async (id) => {
    const result = await removeOfficerFn({ data: { id } });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error;
  },
  acceptProposal: async (input) => {
    const result = await acceptProposalFn({ data: input });
    set(apply(result.snapshot, get().activeEntityId));
    return result.error ?? (result.voucher ? null : null);
  },
  refineProposal: async (input) => refineProposalFn({ data: input }),
}));
