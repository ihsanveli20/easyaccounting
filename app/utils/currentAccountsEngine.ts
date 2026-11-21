import {
  AccountTransaction,
  AccountTransactionType,
  CariPermissionKey,
  CollectionPaymentRecord,
  ContactAgingAndRiskSummary,
  ContactBalanceSummary,
  ContactCard,
  LedgerRow,
  PaymentMethodType,
  PdfComparisonMatchRow,
  PdfExternalLine,
  PdfMatchCategory,
  PdfStatementComparisonReport,
} from "../types/currentAccounts";
import { cleanDocNo } from "./reconciliationEngine";
import { parseFlexibleNumber } from "./receivedQuotesParser";

export function toCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

export function fromCents(c: number): number {
  return Math.round(c) / 100;
}

export function round2(n: number): number {
  return fromCents(toCents(n));
}

export const TRANSACTION_TYPE_LABELS: Record<AccountTransactionType, string> = {
  opening: "Açılış Bakiyesi",
  purchase_invoice: "Alış Faturası",
  sales_invoice: "Satış Faturası",
  collection: "Tahsilat",
  payment: "Ödeme",
  debit_note: "Borç Dekontu",
  credit_note: "Alacak Dekontu",
  return: "İade",
  discount: "İskonto",
  transfer: "Virman",
  offset: "Mahsup",
  other: "Diğer",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  cash: "Nakit",
  bank_transfer: "Banka Havalesi / EFT",
  credit_card: "Kredi Kartı",
  check: "Çek",
  promissory_note: "Senet",
  other: "Diğer",
};

export const CONTACT_TYPE_LABELS: Record<ContactCard["contact_type"], string> = {
  customer: "Müşteri",
  supplier: "Tedarikçi",
  both: "Müşteri & Tedarikçi",
  other: "Diğer",
};

export function getDirectionLabel(netBalance: number): "Borç" | "Alacak" | "Sıfır" {
  const cents = toCents(netBalance);
  if (cents > 0) return "Borç";
  if (cents < 0) return "Alacak";
  return "Sıfır";
}

export function getCariPermissionsForRole(roleName: string): Set<CariPermissionKey> {
  const r = (roleName || "").toLowerCase();
  if (r.includes("admin") || r.includes("yönetici")) {
    return new Set<CariPermissionKey>([
      "cari_view",
      "cari_create",
      "cari_edit",
      "cari_deactivate",
      "tx_view",
      "tx_create",
      "collect",
      "pay",
      "statement_export",
      "reconciliation_create",
      "reconciliation_approve",
      "risk_edit",
      "report_view",
    ]);
  }
  if (r.includes("satış") || r.includes("sales")) {
    return new Set<CariPermissionKey>([
      "cari_view",
      "cari_create",
      "cari_edit",
      "tx_view",
      "collect",
      "statement_export",
      "reconciliation_create",
      "report_view",
    ]);
  }
  if (r.includes("satın") || r.includes("purchas")) {
    return new Set<CariPermissionKey>([
      "cari_view",
      "cari_create",
      "tx_view",
      "pay",
      "statement_export",
      "reconciliation_create",
      "report_view",
    ]);
  }
  if (r.includes("izleyici") || r.includes("viewer")) {
    return new Set<CariPermissionKey>(["cari_view", "tx_view", "statement_export", "report_view"]);
  }
  return new Set<CariPermissionKey>([
    "cari_view",
    "cari_create",
    "tx_view",
    "tx_create",
    "collect",
    "pay",
    "statement_export",
    "reconciliation_create",
    "report_view",
  ]);
}

export function findDuplicateContact(
  contacts: ContactCard[],
  candidate: { id?: string; code?: string; tax_number?: string | null }
): string | null {
  const codeNorm = (candidate.code || "").trim().toLowerCase();
  const taxNorm = (candidate.tax_number || "").trim();

  for (const c of contacts) {
    if (candidate.id && c.id === candidate.id) continue;
    if (codeNorm && c.code.trim().toLowerCase() === codeNorm) {
      return `Bu cari kodu (${c.code}) "${c.name}" kartında zaten kullanılıyor.`;
    }
    if (taxNorm && (c.tax_number || "").trim() === taxNorm) {
      return `Bu Vergi/TCKN (${taxNorm}) "${c.name}" kartında zaten kayıtlı.`;
    }
  }
  return null;
}

export function computeChronologicalLedger(
  transactions: AccountTransaction[],
  openingBalance = 0
): LedgerRow[] {
  const sorted = [...transactions].sort((a, b) => {
    const d = a.transaction_date.localeCompare(b.transaction_date);
    if (d !== 0) return d;
    return a.created_at.localeCompare(b.created_at);
  });

  const todayMs = new Date().setHours(0, 0, 0, 0);
  let runningCents = toCents(openingBalance);

  return sorted.map((tx) => {
    const effDebit = tx.is_cancelled ? 0 : toCents(tx.tl_debit || tx.debit);
    const effCredit = tx.is_cancelled ? 0 : toCents(tx.tl_credit || tx.credit);
    runningCents += effDebit - effCredit;

    let overdueDays = 0;
    let isOverdue = false;
    if (!tx.is_cancelled && tx.due_date) {
      const dueMs = new Date(tx.due_date).setHours(0, 0, 0, 0);
      if (dueMs < todayMs) {
        overdueDays = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
        isOverdue = overdueDays > 0;
      }
    }

    const bal = fromCents(runningCents);
    return {
      ...tx,
      runningBalance: bal,
      runningDirection: getDirectionLabel(bal),
      isOverdue,
      overdueDays,
    };
  });
}

export function computeContactBalance(
  contactId: string,
  transactions: AccountTransaction[],
  collectionsPayments: CollectionPaymentRecord[]
): ContactBalanceSummary {
  const activeTx = transactions.filter((t) => t.contact_id === contactId && !t.is_cancelled);
  let debitCents = 0;
  let creditCents = 0;
  let lastTxDate: string | null = null;

  for (const t of activeTx) {
    debitCents += toCents(t.tl_debit || t.debit);
    creditCents += toCents(t.tl_credit || t.credit);
    if (!lastTxDate || t.transaction_date > lastTxDate) {
      lastTxDate = t.transaction_date;
    }
  }

  let lastCollectionDate: string | null = null;
  let lastPaymentDate: string | null = null;

  for (const cp of collectionsPayments) {
    if (cp.contact_id !== contactId || cp.is_cancelled) continue;
    if (cp.kind === "collection") {
      if (!lastCollectionDate || cp.transaction_date > lastCollectionDate) {
        lastCollectionDate = cp.transaction_date;
      }
    } else {
      if (!lastPaymentDate || cp.transaction_date > lastPaymentDate) {
        lastPaymentDate = cp.transaction_date;
      }
    }
  }

  const netCents = debitCents - creditCents;
  const netBalance = fromCents(netCents);

  return {
    contactId,
    totalDebit: fromCents(debitCents),
    totalCredit: fromCents(creditCents),
    netBalance,
    absBalance: Math.abs(netBalance),
    direction: getDirectionLabel(netBalance),
    lastTransactionDate: lastTxDate,
    lastCollectionDate,
    lastPaymentDate,
    transactionCount: activeTx.length,
  };
}

export function computeAgingAndRisk(
  contact: ContactCard,
  transactions: AccountTransaction[]
): ContactAgingAndRiskSummary {
  const activeTx = transactions
    .filter((t) => t.contact_id === contact.id && !t.is_cancelled)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  const todayMs = new Date().setHours(0, 0, 0, 0);

  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const t of activeTx) {
    totalDebitCents += toCents(t.tl_debit || t.debit);
    totalCreditCents += toCents(t.tl_credit || t.credit);
  }

  const netCents = totalDebitCents - totalCreditCents;
  const currentRisk = Math.max(0, fromCents(netCents));
  const riskLimit = contact.risk_limit || 0;
  const availableRiskLimit = riskLimit > 0 ? round2(riskLimit - currentRisk) : 0;
  const riskExceeded = riskLimit > 0 && currentRisk > riskLimit;

  // FIFO allocation of credits against debits (or debits against credits) for aging
  let notDueCents = 0;
  let d1_30 = 0;
  let d31_60 = 0;
  let d61_90 = 0;
  let d90Plus = 0;
  let overdueReceivableCents = 0;
  let overduePayableCents = 0;

  let remainingCreditPool = totalCreditCents;
  for (const t of activeTx) {
    const deb = toCents(t.tl_debit || t.debit);
    if (deb <= 0) continue;

    const covered = Math.min(deb, remainingCreditPool);
    remainingCreditPool -= covered;
    const openAmt = deb - covered;
    if (openAmt <= 0) continue;

    const dueStr = t.due_date || t.transaction_date;
    const dueMs = new Date(dueStr).setHours(0, 0, 0, 0);
    const diffDays = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      notDueCents += openAmt;
    } else {
      overdueReceivableCents += openAmt;
      if (diffDays <= 30) d1_30 += openAmt;
      else if (diffDays <= 60) d31_60 += openAmt;
      else if (diffDays <= 90) d61_90 += openAmt;
      else d90Plus += openAmt;
    }
  }

  // Overdue payables if supplier net balance < 0
  if (netCents < 0) {
    let remainingDebitPool = totalDebitCents;
    for (const t of activeTx) {
      const cred = toCents(t.tl_credit || t.credit);
      if (cred <= 0) continue;
      const covered = Math.min(cred, remainingDebitPool);
      remainingDebitPool -= covered;
      const openAmt = cred - covered;
      if (openAmt <= 0) continue;
      const dueStr = t.due_date || t.transaction_date;
      const dueMs = new Date(dueStr).setHours(0, 0, 0, 0);
      if (dueMs < todayMs) {
        overduePayableCents += openAmt;
      }
    }
  }

  const overdueRatio = currentRisk > 0 ? fromCents(overdueReceivableCents) / currentRisk : 0;
  const paymentPerformanceScore = Math.max(0, Math.min(100, Math.round(100 - overdueRatio * 60)));

  return {
    notDue: fromCents(notDueCents),
    days1to30: fromCents(d1_30),
    days31to60: fromCents(d31_60),
    days61to90: fromCents(d61_90),
    days90Plus: fromCents(d90Plus),
    overdueReceivable: fromCents(overdueReceivableCents),
    overduePayable: fromCents(overduePayableCents),
    riskLimit,
    currentRisk,
    availableRiskLimit,
    riskExceeded,
    avgCollectionDays: contact.payment_term_days || 0,
    paymentPerformanceScore,
  };
}

// ---------------------------------------------------------------------------
// PDF Statement Parsing & Comparison Engine (Read-Only Analysis)
// ---------------------------------------------------------------------------

function normalizeIsoDate(rawDate: string): string {
  const m = rawDate.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return rawDate;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yyyy}-${mm}-${dd}`;
}

export function parseExternalPdfStatementText(rawText: string): PdfExternalLine[] {
  const lines = (rawText || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed: PdfExternalLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
    if (!dateMatch) continue;

    const normDate = normalizeIsoDate(dateMatch[1]);
    const rest = line.replace(dateMatch[0], " ").trim();

    // Extract numbers at the right side (e.g. debit, credit, balance)
    const numMatches = rest.match(/(\d[\d.,]*)/g) || [];
    const amounts = numMatches
      .map((n) => parseFlexibleNumber(n))
      .filter((n) => n > 0 && n < 1e9);

    if (amounts.length === 0) continue;

    const lower = rest.toLocaleLowerCase("tr-TR");
    const isCreditHint = /(tahsilat|odeme|ödeme|alacak|havale|eft|dekont|nakit)/i.test(lower);
    const primaryAmount = amounts[0];
    const debit = isCreditHint ? 0 : primaryAmount;
    const credit = isCreditHint ? primaryAmount : 0;

    const docMatch = rest.match(/\b([A-Z]{1,5}[-_/]?\d{3,16})\b/i);
    const docNo = docMatch ? docMatch[1] : "";

    parsed.push({
      id: `ext-${i}-${Date.now()}`,
      date: normDate,
      documentNo: docNo,
      description: rest.slice(0, 120),
      debit,
      credit,
      balance: amounts.length >= 2 ? amounts[amounts.length - 1] : undefined,
      currency: "TRY",
    });
  }

  return parsed;
}

export function compareContactWithPdfLines(
  contactId: string,
  internalTransactions: AccountTransaction[],
  externalLines: PdfExternalLine[]
): PdfStatementComparisonReport {
  const activeInternal = internalTransactions.filter(
    (t) => t.contact_id === contactId && !t.is_cancelled
  );
  const usedInternalIds = new Set<string>();
  const rows: PdfComparisonMatchRow[] = [];

  for (const ext of externalLines) {
    const extAmt = ext.debit > 0 ? ext.debit : ext.credit;
    const extCleanDoc = cleanDocNo(ext.documentNo);

    let bestMatch: AccountTransaction | null = null;
    let bestScore = 0;
    let bestCategory: PdfMatchCategory = "only_external";
    let note = "";

    for (const intl of activeInternal) {
      if (usedInternalIds.has(intl.id)) continue;
      const intlAmt = intl.debit > 0 ? intl.debit : intl.credit;
      const intlCleanDoc = cleanDocNo(intl.document_no || "");

      const sameDoc = Boolean(extCleanDoc && intlCleanDoc && extCleanDoc === intlCleanDoc);
      const sameDate = ext.date === intl.transaction_date;
      const sameAmt = Math.abs(extAmt - intlAmt) < 0.05;

      let score = 0;
      if (sameDoc) score += 50;
      if (sameDate) score += 25;
      if (sameAmt) score += 25;

      if (score > bestScore && score >= 50) {
        bestScore = score;
        bestMatch = intl;

        if (sameDoc && sameDate && sameAmt) {
          bestCategory = "exact";
          note = "Belge no, tarih ve tutar tam eşleşti.";
        } else if (sameDoc && sameDate && !sameAmt) {
          bestCategory = "amount_diff";
          note = `Tutar farkı: Sistem ${intlAmt.toFixed(2)}, Ekstre ${extAmt.toFixed(2)}`;
        } else if (sameDoc && !sameDate && sameAmt) {
          bestCategory = "date_diff";
          note = `Tarih farkı: Sistem ${intl.transaction_date}, Ekstre ${ext.date}`;
        } else if (!sameDoc && sameDate && sameAmt) {
          bestCategory = "doc_diff";
          note = "Tarih ve tutar eşleşiyor, belge numarası farklı.";
        } else {
          bestCategory = "desc_diff";
          note = "Kısmi eşleşme (açıklama/detay farkı).";
        }
      }
    }

    if (bestMatch) {
      usedInternalIds.add(bestMatch.id);
      rows.push({
        id: `cmp-${ext.id}-${bestMatch.id}`,
        category: bestCategory,
        internalTx: bestMatch,
        externalLine: ext,
        confidenceScore: bestScore,
        note,
      });
    } else {
      rows.push({
        id: `cmp-ext-${ext.id}`,
        category: "only_external",
        externalLine: ext,
        confidenceScore: 0,
        note: "Karşı taraf ekstresinde var, sistemde bulunamadı.",
      });
    }
  }

  for (const intl of activeInternal) {
    if (!usedInternalIds.has(intl.id)) {
      rows.push({
        id: `cmp-int-${intl.id}`,
        category: "only_internal",
        internalTx: intl,
        confidenceScore: 0,
        note: "Sistemde var, karşı taraf ekstresinde görünmüyor.",
      });
    }
  }

  const internalDebitTotal = round2(
    activeInternal.reduce((s, t) => s + (t.tl_debit || t.debit), 0)
  );
  const internalCreditTotal = round2(
    activeInternal.reduce((s, t) => s + (t.tl_credit || t.credit), 0)
  );
  const externalDebitTotal = round2(externalLines.reduce((s, l) => s + l.debit, 0));
  const externalCreditTotal = round2(externalLines.reduce((s, l) => s + l.credit, 0));

  const internalClosing = round2(internalDebitTotal - internalCreditTotal);
  const externalClosing = round2(externalDebitTotal - externalCreditTotal);

  return {
    contactId,
    rows,
    exactCount: rows.filter((r) => r.category === "exact").length,
    diffCount: rows.filter((r) =>
      ["amount_diff", "date_diff", "doc_diff", "desc_diff"].includes(r.category)
    ).length,
    onlyExternalCount: rows.filter((r) => r.category === "only_external").length,
    onlyInternalCount: rows.filter((r) => r.category === "only_internal").length,
    internalDebitTotal,
    internalCreditTotal,
    externalDebitTotal,
    externalCreditTotal,
    closingBalanceDifference: round2(internalClosing - externalClosing),
  };
}

