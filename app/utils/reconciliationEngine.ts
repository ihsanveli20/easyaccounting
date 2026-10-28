import * as XLSX from "xlsx";
import {
  ExternalTransaction,
  InternalTransaction,
  ReconciliationPair,
  ReconciliationSummary,
  ReconciliationStatus,
} from "../types/reconciliation";
import { formatCurrency, normalizeForSearch } from "./excel";

// Clean and normalize document/invoice numbers (e.g., "FTR-2024-00101" -> "FTR2024101")
export function cleanDocNo(doc?: string): string {
  if (!doc) return "";
  return doc
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .replace(/^0+/, "");
}

// Extract any 16-character Turkish E-Fatura / E-Arşiv numbers from any text
// (e.g. NYP2025000001876, NY22026000003416, GIB2024000012345)
export function extractEInvoiceNumbers(text?: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b([A-Za-z]{1,4}[A-Za-z0-9](?:20\d{2})\d{9})\b/gi) || [];
  return Array.from(new Set(matches.map((m) => m.toUpperCase())));
}

// Extract reference number, slip code or invoice number from text (e.g. 8489, NYP2025000001876, etc.)
export function extractRefOrDocNo(docNo?: string, desc?: string, year?: number): string | undefined {
  // 1. E-Invoice 16-chars (highest priority)
  const eInvsDoc = extractEInvoiceNumbers(docNo);
  if (eInvsDoc.length > 0) return eInvsDoc[0];
  const eInvsDesc = extractEInvoiceNumbers(desc);
  if (eInvsDesc.length > 0) return eInvsDesc[0];

  // 2. Check for composite pattern: DATE-CODE-NAME (e.g. 04/08/2025-8489-NUR YAPI...)
  const textToCheck = `${docNo || ""} ${desc || ""}`;
  const compositeMatch = textToCheck.match(
    /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[-_/]([A-Za-z0-9]{3,16})[-_/]/
  );
  if (compositeMatch) {
    const code = compositeMatch[1].trim();
    if (code && code !== String(year)) {
      return code.toUpperCase();
    }
  }

  // 3. Clean docNo if given and not just '-'
  if (docNo) {
    const clean = docNo.replace(/[^a-zA-Z0-9]/g, "").trim();
    if (clean && clean.length >= 3 && clean !== String(year)) {
      const delim = docNo.match(/\b([A-Za-z]{1,6}(?:[-_/][A-Za-z0-9]+)+)\b/);
      if (delim) return delim[1].toUpperCase();
      if (clean.length >= 3 && clean.length <= 16) {
        return clean.toUpperCase();
      }
    }
  }

  // 4. Look in description after removing dates and amounts
  if (desc) {
    let cleanDesc = desc
      .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
      .replace(/[-–]?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}\b/g, " ");

    // Keyword match (e.g., "Tahsilat 8489", "Slip 8489", "Ref 8489", "Dekont 8489", etc.)
    const kwMatch = cleanDesc.match(
      /(?:tahsilat|tediye|havale|eft|pos|slip|dekont|fis|fiş|belge|ref|no|nolu)\s*:?[-_#]?\s*([A-Za-z0-9]{3,12})\b/i
    );
    if (kwMatch && kwMatch[1] !== String(year)) {
      return kwMatch[1].toUpperCase();
    }

    // Isolated 4-10 digit numbers
    const numMatches = cleanDesc.match(/\b(\d{4,10})\b/g);
    if (numMatches) {
      const valid = numMatches.find((n) => n !== String(year) && !/^05\d{2}/.test(n));
      if (valid) return valid;
    }
  }

  return undefined;
}

// Convert DD.MM.YYYY to Date object
function parseDateStrToTime(dStr: string): number {
  if (!dStr) return 0;
  const parts = dStr.split(".");
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    return new Date(y, m, d).getTime();
  }
  return 0;
}

// Core reconciliation matching algorithm (Reciprocal Double-Entry: Onlardaki Alacak = Bizde Borç, Onlardaki Borç = Bizde Alacak)
export function runReconciliation(
  externalList: ExternalTransaction[],
  internalList: InternalTransaction[]
): { pairs: ReconciliationPair[]; summary: ReconciliationSummary } {
  const pairs: ReconciliationPair[] = [];
  const matchedInternalIds = new Set<string>();

  // Clone lists
  const externals = [...externalList];
  const internals = [...internalList];

  // 1. Pass: Match by exact Document/Invoice Number, Reference Slip No, or Shared E-Invoice
  externals.forEach((ext) => {
    const extRef = extractRefOrDocNo(ext.docNo, ext.description, ext.year);
    const extDocClean = cleanDocNo(ext.docNo || extRef);
    const extEInvoices = [
      ...extractEInvoiceNumbers(ext.docNo),
      ...extractEInvoiceNumbers(ext.description),
    ];

    // Find matching internal with same cleaned doc number, embedded e-fatura or substring
    const intMatch = internals.find((intItem) => {
      if (matchedInternalIds.has(intItem.id)) return false;

      const intRef = extractRefOrDocNo(intItem.docNo, intItem.description, intItem.year);
      const intDocClean = cleanDocNo(intItem.docNo || intRef);
      const intEInvoices = [
        ...extractEInvoiceNumbers(intItem.docNo),
        ...extractEInvoiceNumbers(intItem.description),
      ];

      const extNet = ext.debit - ext.credit;
      const intReciprocalNet = intItem.credit - intItem.debit;
      const isExactAmount = Math.abs(extNet - intReciprocalNet) <= 0.05;
      const isCloseAmount =
        Math.abs(extNet - intReciprocalNet) <= 1000 ||
        (Math.abs(extNet) > 0 &&
          Math.abs(extNet - intReciprocalNet) / Math.abs(extNet) <= 0.25);

      // A) Shared 16-character E-Fatura number (e.g. NYP2025000001876 in docNo or description)
      if (extEInvoices.length > 0 && intEInvoices.length > 0) {
        const hasCommonEInvoice = extEInvoices.some((inv) =>
          intEInvoices.includes(inv)
        );
        if (hasCommonEInvoice) return true;
      }

      // B) Matching reference / slip code (e.g. "8489" in both)
      if (extRef && intRef && extRef === intRef) {
        // Must be in reciprocal direction or reasonably close
        if (isExactAmount || isCloseAmount || (extNet * intReciprocalNet > 0)) {
          return true;
        }
      }

      if (!extDocClean && !extRef && extEInvoices.length === 0) return false;
      if (!intDocClean && !intRef && intEInvoices.length === 0) return false;

      // C) Exact cleaned doc number match
      if (extDocClean && intDocClean && extDocClean === intDocClean) return true;

      // D) Substring match (e.g. "02052025NYP2025000001876NURYAPI" contains "NYP2025000001876")
      if (
        extDocClean &&
        intDocClean &&
        extDocClean.length >= 4 &&
        intDocClean.includes(extDocClean) &&
        (isExactAmount || isCloseAmount)
      ) {
        return true;
      }

      if (
        extDocClean &&
        intDocClean &&
        intDocClean.length >= 4 &&
        extDocClean.includes(intDocClean) &&
        (isExactAmount || isCloseAmount)
      ) {
        return true;
      }

      // E) Description contains docNo or vice versa
      if (extDocClean && extDocClean.length >= 4) {
        const intDescClean = cleanDocNo(intItem.description);
        if (intDescClean.includes(extDocClean) && (isExactAmount || isCloseAmount)) {
          return true;
        }
      }

      if (intDocClean && intDocClean.length >= 4) {
        const extDescClean = cleanDocNo(ext.description);
        if (extDescClean.includes(intDocClean) && (isExactAmount || isCloseAmount)) {
          return true;
        }
      }

      // F) Suffix match for e-invoices (e.g. 000003416 or 3416 matches NY22026000003416)
      if (
        extDocClean &&
        intDocClean &&
        extDocClean.length >= 8 &&
        intDocClean.length >= 4 &&
        extDocClean.endsWith(intDocClean) &&
        (isExactAmount || isCloseAmount)
      ) {
        return true;
      }

      if (
        extDocClean &&
        intDocClean &&
        intDocClean.length >= 8 &&
        extDocClean.length >= 4 &&
        intDocClean.endsWith(extDocClean) &&
        (isExactAmount || isCloseAmount)
      ) {
        return true;
      }

      return false;
    });

    if (intMatch) {
      matchedInternalIds.add(intMatch.id);

      // Reciprocal matching rule:
      // Onlardaki Alacak (ext.credit) == Bizdeki Borç (intMatch.debit)
      // Onlardaki Borç (ext.debit) == Bizdeki Alacak (intMatch.credit)
      const extNet = ext.debit - ext.credit;
      const intReciprocalNet = intMatch.credit - intMatch.debit;
      const reciprocalDiff = Math.abs(extNet - intReciprocalNet);

      // Fallback check if user uploaded same-perspective lists
      const directDiff = Math.abs((ext.debit - ext.credit) - (intMatch.debit - intMatch.credit));

      // Displayed matched doc label
      const intRef = extractRefOrDocNo(intMatch.docNo, intMatch.description, intMatch.year);
      const displayDoc =
        extEInvoices[0] ||
        extRef ||
        intRef ||
        ext.docNo ||
        intMatch.docNo ||
        "Belge";

      if (reciprocalDiff <= 0.05 || directDiff <= 0.05) {
        // Exact match!
        pairs.push({
          id: `pair-${ext.id}-${intMatch.id}`,
          status: "matched",
          statusLabel: "Birebir Eşleşti (Evrak No & Tutar)",
          matchScore: 100,
          external: ext,
          internal: intMatch,
          difference: 0,
          note: `Evrak / Slip no (${displayDoc}) ve karşılıklı borç/alacak tutarları birebir uyuşuyor.`,
        });
      } else {
        // Amount mismatch!
        const diff = extNet - intReciprocalNet;
        pairs.push({
          id: `pair-${ext.id}-${intMatch.id}`,
          status: "amount_mismatch",
          statusLabel: "Tutar Uyuşmazlığı",
          matchScore: 80,
          external: ext,
          internal: intMatch,
          difference: diff,
          note: `Evrak / Slip no (${displayDoc}) eşleşti fakat tutar farkı var (${formatCurrency(
            Math.abs(diff)
          )}).`,
        });
      }
      return;
    }

    // 2. Pass: Match by Date and Exact Reciprocal Amount (within 7 days)
    const extNet = ext.debit - ext.credit;
    const extTime = parseDateStrToTime(ext.date);

    const dateAndAmountMatch = internals.find((intItem) => {
      if (matchedInternalIds.has(intItem.id)) return false;
      const intReciprocalNet = intItem.credit - intItem.debit;
      if (Math.abs(extNet - intReciprocalNet) > 0.05) return false;

      // Check date within 7 days (for banking, weekend & transmission delays)
      if (extTime && intItem.date) {
        const intTime = parseDateStrToTime(intItem.date);
        const diffDays = Math.abs(extTime - intTime) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
      }
      return false;
    });

    if (dateAndAmountMatch) {
      matchedInternalIds.add(dateAndAmountMatch.id);
      pairs.push({
        id: `pair-${ext.id}-${dateAndAmountMatch.id}`,
        status: "matched",
        statusLabel: "Tarih ve Tutar ile Eşleşti",
        matchScore: 90,
        external: ext,
        internal: dateAndAmountMatch,
        difference: 0,
        note: `Tarih (${ext.date}) ve tutar (${formatCurrency(
          Math.abs(extNet)
        )}) karşılıklı borç/alacak olarak eşleşti.`,
      });
      return;
    }

    // 2.5 Pass: Match by Exact Reciprocal Amount if within 35 days (cross month-end delays)
    const periodAmountMatch = internals.find((intItem) => {
      if (matchedInternalIds.has(intItem.id)) return false;
      const intReciprocalNet = intItem.credit - intItem.debit;
      if (Math.abs(extNet - intReciprocalNet) > 0.05) return false;

      if (extTime && intItem.date) {
        const intTime = parseDateStrToTime(intItem.date);
        const diffDays = Math.abs(extTime - intTime) / (1000 * 60 * 60 * 24);
        return diffDays <= 35;
      }
      return false;
    });

    if (periodAmountMatch) {
      matchedInternalIds.add(periodAmountMatch.id);
      pairs.push({
        id: `pair-${ext.id}-${periodAmountMatch.id}`,
        status: "matched",
        statusLabel: "Tutar ile Eşleşti (Tarih Yakın)",
        matchScore: 80,
        external: ext,
        internal: periodAmountMatch,
        difference: 0,
        note: `Firma tarihi (${ext.date}) ile Luca tarihi (${periodAmountMatch.date}) farklı ancak tutar (${formatCurrency(
          Math.abs(extNet)
        )}) birebir eşleşti.`,
      });
      return;
    }

    // If not matched, it is missing in Luca!
    pairs.push({
      id: `pair-missing-in-luca-${ext.id}`,
      status: "missing_in_luca",
      statusLabel: "Bizde Eksik (Luca'da Yok)",
      matchScore: 0,
      external: ext,
      internal: undefined,
      difference: ext.debit - ext.credit,
      note: "Firma ekstresinde mevcut fakat bizim Luca kayıtlarımızda bulunamadı.",
    });
  });

  // 3. Find remaining unmatched internals (Missing in External / Firmada Eksik)
  internals.forEach((intItem) => {
    if (!matchedInternalIds.has(intItem.id)) {
      pairs.push({
        id: `pair-missing-in-ext-${intItem.id}`,
        status: "missing_in_external",
        statusLabel: "Firmada Eksik (Ekstrede Yok)",
        matchScore: 0,
        external: undefined,
        internal: intItem,
        difference: -(intItem.credit - intItem.debit),
        note: "Bizim Luca kayıtlarımızda var fakat firmanın gönderdiği ekstrede yok.",
      });
    }
  });

  // Sort pairs: Unmatched and Discrepancies first, then matched
  const statusPriority: Record<ReconciliationStatus, number> = {
    missing_in_luca: 1,
    missing_in_external: 2,
    amount_mismatch: 3,
    matched: 4,
  };

  pairs.sort((a, b) => {
    const pA = statusPriority[a.status];
    const pB = statusPriority[b.status];
    if (pA !== pB) return pA - pB;

    // Secondary sort by date
    const dateA = a.external?.date || a.internal?.date || "";
    const dateB = b.external?.date || b.internal?.date || "";
    return dateB.localeCompare(dateA);
  });

  // Compute Totals and Summaries (Reciprocal Accounting)
  let extDeb = 0;
  let extCred = 0;
  externalList.forEach((e) => {
    extDeb += e.debit;
    extCred += e.credit;
  });
  const extBal = extDeb - extCred; // Firma Bakiye: >0 Borçlu (Firma says we owe them), <0 Alacaklı

  let intDeb = 0;
  let intCred = 0;
  internalList.forEach((i) => {
    intDeb += i.debit;
    intCred += i.credit;
  });
  const intBal = intDeb - intCred; // Luca Bakiye: <0 Alacaklı (We owe them), >0 Borçlu (They owe us)

  const matchedCount = pairs.filter((p) => p.status === "matched").length;
  const missingInLucaCount = pairs.filter((p) => p.status === "missing_in_luca").length;
  const missingInExternalCount = pairs.filter((p) => p.status === "missing_in_external").length;
  const amountMismatchCount = pairs.filter((p) => p.status === "amount_mismatch").length;

  // In reciprocal accounting:
  // When both agree we owe X TL: extBal = +X, intBal = -X -> extBal + intBal = 0!
  const netDiscrepancy = extBal + intBal;

  const summary: ReconciliationSummary = {
    externalTotalDebit: extDeb,
    externalTotalCredit: extCred,
    externalBalance: extBal,
    internalTotalDebit: intDeb,
    internalTotalCredit: intCred,
    internalBalance: intBal,
    netDiscrepancy,
    matchedCount,
    missingInLucaCount,
    missingInExternalCount,
    amountMismatchCount,
    totalItems: pairs.length,
    isFullyReconciled: Math.abs(netDiscrepancy) <= 0.05 && missingInLucaCount === 0 && missingInExternalCount === 0,
  };

  return { pairs, summary };
}

// Export comprehensive reconciliation report to Excel
export function exportReconciliationToExcel(
  pairs: ReconciliationPair[],
  summary: ReconciliationSummary,
  companyName = "Firma"
) {
  const rows: any[] = [];

  pairs.forEach((p, idx) => {
    rows.push({
      "Sıra": idx + 1,
      "Mutabakat Durumu": p.statusLabel,
      "Fark (TL)": p.difference !== undefined ? p.difference : 0,
      "Açıklama / Not": p.note || "",
      // External side
      "Firma Ekstre Tarih": p.external?.date || "-",
      "Firma Evrak No": p.external?.docNo || "-",
      "Firma İşlem Türü": p.external?.type || "-",
      "Firma Açıklama": p.external?.description || "-",
      "Firma Borç (TL)": p.external?.debit || 0,
      "Firma Alacak (TL)": p.external?.credit || 0,
      "Firma Dosyası": p.external?.sourceFile || "-",
      // Luca side
      "Luca Kayıt Tarih": p.internal?.date || "-",
      "Luca Evrak No": p.internal?.docNo || "-",
      "Luca İşlem Türü": p.internal?.type || "-",
      "Luca Açıklama": p.internal?.description || "-",
      "Luca Borç (TL)": p.internal?.debit || 0,
      "Luca Alacak (TL)": p.internal?.credit || 0,
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 14 },
    { wch: 36 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 32 },
    { wch: 15 },
    { wch: 15 },
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 32 },
    { wch: 15 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mutabakat Karşılaştırması");

  const clean = companyName.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ]/g, "_");
  const fileName = `${clean}_Cari_Mutabakat_Raporu_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Realistic sample reconciliation dataset (External PDF statement vs Luca records)
export const SAMPLE_RECONCILIATION_EXTERNAL: ExternalTransaction[] = [
  {
    id: "ext-1",
    date: "04.01.2024",
    year: 2024,
    docNo: "DVR-2024-01",
    type: "Devir Fişi",
    description: "2023 Yılından Devreden Alacak Bakiyesi",
    debit: 0,
    credit: 15000,
    balance: -15000,
    sourceFile: "Firma_2024_Ekstre.pdf",
  },
  {
    id: "ext-2",
    date: "15.01.2024",
    year: 2024,
    docNo: "FTR-2024-00105",
    type: "Satış Faturası",
    description: "Ocak Ayı 1. Parti Hammadde Sevkiyatı",
    debit: 35000,
    credit: 0,
    balance: 20000,
    sourceFile: "Firma_2024_Ekstre.pdf",
  },
  {
    id: "ext-3",
    date: "28.01.2024",
    year: 2024,
    docNo: "BNK-00412",
    type: "Banka Havalesi",
    description: "Garanti Bankası Fatura Bedeli Havalesi",
    debit: 0,
    credit: 20000,
    balance: 0,
    sourceFile: "Firma_2024_Ekstre.pdf",
  },
  {
    id: "ext-4",
    date: "12.02.2024",
    year: 2024,
    docNo: "FTR-2024-00180",
    type: "Satış Faturası",
    description: "Şubat Ayı Ek Malzeme Faturası (BİZDE EKSİK)",
    debit: 14500,
    credit: 0,
    balance: 14500,
    sourceFile: "Firma_2024_Ekstre.pdf",
  },
  {
    id: "ext-5",
    date: "05.03.2024",
    year: 2024,
    docNo: "FTR-2024-00214",
    type: "Satış Faturası",
    description: "Mart Ayı Sevkiyatı (Tutar Farkı)",
    debit: 28500, // Luca has 28000
    credit: 0,
    balance: 43000,
    sourceFile: "Firma_2024_Ekstre.pdf",
  },
  {
    id: "ext-6",
    date: "10.01.2025",
    year: 2025,
    docNo: "FTR-2025-00018",
    type: "Satış Faturası",
    description: "2025 Yılı Sözleşmeli Yıllık Bakım Faturası",
    debit: 45000,
    credit: 0,
    balance: 88000,
    sourceFile: "Firma_2025_Ekstre.pdf",
  },
  {
    id: "ext-7",
    date: "22.01.2025",
    year: 2025,
    docNo: "BNK-00890",
    type: "Banka Tahsilatı",
    description: "İş Bankası Ara Hakediş Ödemesi",
    debit: 0,
    credit: 40000,
    balance: 48000,
    sourceFile: "Firma_2025_Ekstre.pdf",
  },
  {
    id: "ext-8",
    date: "14.02.2025",
    year: 2025,
    docNo: "FTR-2025-00085",
    type: "Satış Faturası",
    description: "Yedek Parça ve Donanım Teslim Faturası",
    debit: 12200,
    credit: 0,
    balance: 60200,
    sourceFile: "Firma_2025_Ekstre.pdf",
  },
  {
    id: "ext-9",
    date: "01.03.2025",
    year: 2025,
    docNo: "BNK-01050",
    type: "Banka EFT",
    description: "Firma Tarafından Gönderilen İade Tutarı (BİZDE EKSİK)",
    debit: 0,
    credit: 7500,
    balance: 52700,
    sourceFile: "Firma_2025_Ekstre.pdf",
  },
];

export const SAMPLE_RECONCILIATION_INTERNAL: InternalTransaction[] = [
  {
    id: "int-1",
    date: "04.01.2024",
    year: 2024,
    docNo: "DVR-2024-01",
    type: "Devir Fişi",
    description: "2023 Yılından Devreden Bakiye (Borç)",
    debit: 15000,
    credit: 0,
    balance: 15000,
    sourceFile: "Luca_Mizan_2024.xlsx",
  },
  {
    id: "int-2",
    date: "15.01.2024",
    year: 2024,
    docNo: "FTR-2024-00105",
    type: "Alış Faturası",
    description: "Ocak Ayı 1. Parti Hammadde Alımı (Alacak)",
    debit: 0,
    credit: 35000,
    balance: -20000,
    sourceFile: "Luca_Mizan_2024.xlsx",
  },
  {
    id: "int-3",
    date: "28.01.2024",
    year: 2024,
    docNo: "BNK-00412",
    type: "Banka Tediye",
    description: "Tedarikçi Firma Fatura Havalesi (Borç)",
    debit: 20000,
    credit: 0,
    balance: 0,
    sourceFile: "Luca_Mizan_2024.xlsx",
  },
  // Note: ext-4 (FTR-2024-00180) is MISSING in Luca!
  {
    id: "int-5",
    date: "05.03.2024",
    year: 2024,
    docNo: "FTR-2024-00214",
    type: "Alış Faturası",
    description: "Mart Ayı Malzeme Alımı Faturası (Tutar Farkı)",
    debit: 0,
    credit: 28000, // 500 TL diff (Firma has 28500 debit)
    balance: -28000,
    sourceFile: "Luca_Mizan_2024.xlsx",
  },
  {
    id: "int-extra",
    date: "20.03.2024",
    year: 2024,
    docNo: "MHS-2024-00031",
    type: "Mahsup Fişi",
    description: "Firmaya Gönderilen Fiyat Farkı İade Faturası (FİRMADA EKSİK)",
    debit: 3200,
    credit: 0,
    balance: -24800,
    sourceFile: "Luca_Mizan_2024.xlsx",
  },
  {
    id: "int-6",
    date: "10.01.2025",
    year: 2025,
    docNo: "FTR-2025-00018",
    type: "Alış Faturası",
    description: "2025 Yıllık Bakım Sözleşmesi Faturası (Alacak)",
    debit: 0,
    credit: 45000,
    balance: -69800,
    sourceFile: "Luca_Mizan_2025.xlsx",
  },
  {
    id: "int-7",
    date: "22.01.2025",
    year: 2025,
    docNo: "BNK-00890",
    type: "Banka Tediye",
    description: "İş Bankası Hesabımızdan Yapılan Hakediş Ödemesi (Borç)",
    debit: 40000,
    credit: 0,
    balance: -29800,
    sourceFile: "Luca_Mizan_2025.xlsx",
  },
  {
    id: "int-8",
    date: "14.02.2025",
    year: 2025,
    docNo: "FTR-2025-00085",
    type: "Alış Faturası",
    description: "Yedek Parça Donanım Faturası (Alacak)",
    debit: 0,
    credit: 12200,
    balance: -42000,
    sourceFile: "Luca_Mizan_2025.xlsx",
  },
  // Note: ext-9 is MISSING in Luca!
];
