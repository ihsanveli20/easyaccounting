import * as XLSX from "xlsx";
import {
  CompanyDetail,
  DetailColumnMapping,
  TransactionItem,
} from "../types/accounting";
import {
  detectDetailColumns,
  normalizeForSearch,
  parseExcelDate,
  parseTurkishAmount,
} from "./excel";

export interface ParseDetailResult {
  companies: CompanyDetail[];
  headers: string[];
  rawRows: Record<string, any>[];
  detectedMapping: DetailColumnMapping;
  fileName: string;
}

// Infer transaction type if not explicitly provided
function inferTransactionType(desc: string, docNo: string, debit: number, credit: number): string {
  const norm = normalizeForSearch(`${desc} ${docNo}`);
  if (norm.includes("devir")) return "Devir Fişi";
  if (norm.includes("sat") && (norm.includes("fat") || norm.includes("ftr"))) return "Satış Faturası";
  if (norm.includes("al") && (norm.includes("fat") || norm.includes("ftr"))) return "Alış Faturası";
  if (norm.includes("ftr") || norm.includes("fatura")) {
    return debit > 0 ? "Satış Faturası" : "Alış Faturası";
  }
  if (norm.includes("havale") || norm.includes("eft") || norm.includes("bnk") || norm.includes("banka")) {
    return debit > 0 ? "Banka Tediye" : "Banka Havalesi / Tahsilat";
  }
  if (norm.includes("kasa") || norm.includes("nakit") || norm.includes("ksa")) {
    return debit > 0 ? "Kasa Tahsilat" : "Kasa Tediye";
  }
  if (norm.includes("cek") || norm.includes("çek") || norm.includes("senet")) return "Çek / Senet";
  if (norm.includes("mahsup") || norm.includes("mhs")) return "Mahsup Fişi";
  if (norm.includes("dekont")) return "Banka Dekontu";
  if (norm.includes("tahsilat")) return "Tahsilat";
  if (norm.includes("odeme") || norm.includes("ödeme")) return "Ödeme";

  return debit > 0 ? "Borç Hareketi" : credit > 0 ? "Alacak Hareketi" : "Hareket";
}

// Convert a single sheet into structured raw rows and headers
export function parseSheetToRows(sheet: XLSX.WorkSheet): {
  headers: string[];
  rows: Record<string, any>[];
} {
  const sheetData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  if (!sheetData || sheetData.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerKeywords = [
    "tarih", "date", "cari", "firma", "hesap", "borc", "borç", "alacak",
    "bakiye", "evrak", "fis", "fiş", "belge", "aciklama", "açıklama", "unvan", "kod"
  ];

  let bestHeaderRowIndex = 0;
  let maxMatches = -1;

  for (let r = 0; r < Math.min(sheetData.length, 12); r++) {
    const row = sheetData[r];
    if (!Array.isArray(row)) continue;

    let matches = 0;
    row.forEach((cell) => {
      const str = normalizeForSearch(String(cell || ""));
      if (headerKeywords.some((kw) => str.includes(kw))) {
        matches++;
      }
    });

    if (matches > maxMatches) {
      maxMatches = matches;
      bestHeaderRowIndex = r;
    }
  }

  const rawHeaders = (sheetData[bestHeaderRowIndex] || []).map((h, i) =>
    h !== undefined && h !== null && String(h).trim() !== ""
      ? String(h).trim()
      : `Sütun_${i + 1}`
  );

  const rows: Record<string, any>[] = [];
  for (let r = bestHeaderRowIndex + 1; r < sheetData.length; r++) {
    const rowArray = sheetData[r];
    if (!rowArray || rowArray.length === 0) continue;

    const hasContent = rowArray.some(
      (c) => c !== undefined && c !== null && String(c).trim() !== ""
    );
    if (!hasContent) continue;

    const rowObj: Record<string, any> = {};
    rawHeaders.forEach((colName, colIdx) => {
      rowObj[colName] = rowArray[colIdx] ?? "";
    });
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

export interface ParsedCompositeDesc {
  date?: string;
  invoiceNo?: string;
  docNo?: string;
  cleanDesc: string;
  wasSplit: boolean;
}

/**
 * Splits composite description strings often found in Turkish accounting/excel files
 * Examples:
 * - "11/01/2024-YLD2024000000649-YILDIZ İNŞAAT TAAH. TİC. VE SAN. LTD.ŞTİ."
 * - "11/01/2024 - YLD2024000000649 - YILDIZ İNŞAAT TAAH. TİC. VE SAN. LTD.ŞTİ."
 * - "11.01.2024-YLD2024000000649-YILDIZ..."
 * - "YLD2024000000649-11/01/2024-YILDIZ..."
 * - "11/01/2024-YLD2024000000649"
 */
export function splitCompositeDescription(rawDesc: any): ParsedCompositeDesc {
  if (rawDesc === null || rawDesc === undefined) {
    return { cleanDesc: "", wasSplit: false };
  }
  const str = String(rawDesc).trim();
  if (!str) {
    return { cleanDesc: "", wasSplit: false };
  }

  // Date pattern: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY, YYYY-MM-DD
  const datePattern = "(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}[./-]\\d{1,2}[./-]\\d{1,2})";
  // Doc / Invoice pattern: alphanumeric, dashes, dots (e.g. YLD2024000000649, FTR-0012, etc.)
  const docPattern = "(?:[A-Za-z0-9_.-]+)";

  // Pattern 1: Date - InvoiceNo - Description
  // e.g. "11/01/2024-YLD2024000000649-YILDIZ İNŞAAT TAAH. TİC. VE SAN. LTD.ŞTİ."
  const case1 = new RegExp(`^(${datePattern})\\s*[-–—]\\s*(${docPattern})\\s*[-–—]\\s*(.+)$`);
  const m1 = str.match(case1);
  if (m1) {
    const rawDate = m1[1].trim();
    const docNo = m1[2].trim();
    const cleanDesc = m1[3].trim();
    const parsedDate = parseExcelDate(rawDate);
    return {
      date: parsedDate || rawDate,
      invoiceNo: docNo,
      docNo,
      cleanDesc: cleanDesc || str,
      wasSplit: true,
    };
  }

  // Pattern 2: InvoiceNo - Date - Description
  // e.g. "YLD2024000000649-11/01/2024-YILDIZ İNŞAAT..."
  const case2 = new RegExp(`^(${docPattern})\\s*[-–—]\\s*(${datePattern})\\s*[-–—]\\s*(.+)$`);
  const m2 = str.match(case2);
  if (m2) {
    const docNo = m2[1].trim();
    const rawDate = m2[2].trim();
    const cleanDesc = m2[3].trim();
    const parsedDate = parseExcelDate(rawDate);
    return {
      date: parsedDate || rawDate,
      invoiceNo: docNo,
      docNo,
      cleanDesc: cleanDesc || str,
      wasSplit: true,
    };
  }

  // Pattern 3: Date - InvoiceNo (Only 2 segments)
  // e.g. "11/01/2024-YLD2024000000649"
  const case3 = new RegExp(`^(${datePattern})\\s*[-–—]\\s*(${docPattern})$`);
  const m3 = str.match(case3);
  if (m3) {
    const rawDate = m3[1].trim();
    const docNo = m3[2].trim();
    const parsedDate = parseExcelDate(rawDate);
    return {
      date: parsedDate || rawDate,
      invoiceNo: docNo,
      docNo,
      cleanDesc: docNo,
      wasSplit: true,
    };
  }

  // Pattern 4: Standalone 16-character Turkish e-Fatura number (3 letters + 13 numbers)
  const efMatch = str.match(/\b([A-Za-z]{3}\d{13})\b/);
  if (efMatch) {
    const inv = efMatch[1];
    const dMatch = str.match(new RegExp(`\\b(${datePattern})\\b`));
    let clean = str.replace(inv, "");
    let fDate: string | undefined;
    if (dMatch) {
      fDate = parseExcelDate(dMatch[1]);
      clean = clean.replace(dMatch[0], "");
    }
    clean = clean
      .replace(/^[\s-–—/:]+/, "")
      .replace(/[\s-–—/:]+$/, "")
      .replace(/\s*[-–—/:]+\s*[-–—/:]+\s*/g, " - ")
      .trim();

    return {
      date: fDate,
      invoiceNo: inv,
      docNo: inv,
      cleanDesc: clean || inv,
      wasSplit: true,
    };
  }

  return { cleanDesc: str, wasSplit: false };
}

// Group raw rows into CompanyDetail array using the mapping
export function buildCompaniesFromRows(
  rows: Record<string, any>[],
  mapping: DetailColumnMapping,
  defaultCompanyName?: string
): CompanyDetail[] {
  const companyMap = new Map<
    string,
    {
      code?: string;
      name: string;
      items: TransactionItem[];
      totalDebit: number;
      totalCredit: number;
    }
  >();

  const shouldSplit = mapping.autoSplitDescription !== false;

  rows.forEach((row, idx) => {
    let rawCompany = mapping.companyCol && row[mapping.companyCol]
      ? String(row[mapping.companyCol]).trim()
      : "";

    const companyCode = mapping.codeCol && row[mapping.codeCol]
      ? String(row[mapping.codeCol]).trim()
      : undefined;

    let dateVal = mapping.dateCol ? parseExcelDate(row[mapping.dateCol]) : "";
    let docNo = mapping.docNoCol ? String(row[mapping.docNoCol] || "").trim() : "";
    let desc = mapping.descCol ? String(row[mapping.descCol] || "").trim() : "";
    const debit = mapping.debitCol ? parseTurkishAmount(row[mapping.debitCol]) : 0;
    const credit = mapping.creditCol ? parseTurkishAmount(row[mapping.creditCol]) : 0;

    // Skip completely empty transaction rows
    if (!dateVal && !docNo && !desc && debit === 0 && credit === 0) {
      return;
    }

    let invoiceNo: string | undefined = undefined;

    // Auto-split composite description if enabled (e.g. "11/01/2024-YLD2024000000649-YILDIZ İNŞAAT...")
    if (shouldSplit && desc) {
      const parsedDesc = splitCompositeDescription(desc);
      if (parsedDesc.wasSplit) {
        if (!dateVal && parsedDesc.date) {
          dateVal = parsedDesc.date;
        }
        if (parsedDesc.invoiceNo) {
          invoiceNo = parsedDesc.invoiceNo;
        }
        if (!docNo && (parsedDesc.invoiceNo || parsedDesc.docNo)) {
          docNo = (parsedDesc.invoiceNo || parsedDesc.docNo)!;
        }
        if (parsedDesc.cleanDesc) {
          desc = parsedDesc.cleanDesc;
        }
      }
    }

    // Also check if rawCompany was mapped to the composite description column
    if (shouldSplit && rawCompany) {
      const parsedComp = splitCompositeDescription(rawCompany);
      if (parsedComp.wasSplit) {
        if (!dateVal && parsedComp.date) dateVal = parsedComp.date;
        if (!docNo && (parsedComp.invoiceNo || parsedComp.docNo)) docNo = (parsedComp.invoiceNo || parsedComp.docNo)!;
        if (!invoiceNo && parsedComp.invoiceNo) invoiceNo = parsedComp.invoiceNo;
        if (parsedComp.cleanDesc) rawCompany = parsedComp.cleanDesc;
      }
    }

    let companyName = rawCompany;
    if (!companyName) {
      companyName = defaultCompanyName || "Genel Detay Listesi";
    }

    let type = mapping.typeCol ? String(row[mapping.typeCol] || "").trim() : "";
    if (!type) {
      type = inferTransactionType(desc, docNo || invoiceNo || "", debit, credit);
    }

    const key = (companyCode ? `${companyCode}___` : "") + companyName;

    if (!companyMap.has(key)) {
      companyMap.set(key, {
        code: companyCode,
        name: companyName,
        items: [],
        totalDebit: 0,
        totalCredit: 0,
      });
    }

    const group = companyMap.get(key)!;
    group.totalDebit += debit;
    group.totalCredit += credit;

    group.items.push({
      id: `tx-${idx}-${Date.now()}`,
      date: dateVal,
      docNo: docNo || undefined,
      invoiceNo: invoiceNo || (docNo ? docNo : undefined),
      type: type || undefined,
      description: desc || (docNo ? `Belge: ${docNo}` : "İşlem"),
      debit,
      credit,
      balance: 0, // Will be calculated after all items are added
      raw: row,
    });
  });

  const result: CompanyDetail[] = [];

  companyMap.forEach((val) => {
    // Calculate running balance for company
    let runningBalance = 0;
    const sortedItems = [...val.items];

    sortedItems.forEach((item) => {
      runningBalance += item.debit - item.credit;
      item.balance = runningBalance;
    });

    const lastItem = sortedItems[sortedItems.length - 1];

    result.push({
      id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: val.code,
      name: val.name,
      transactions: sortedItems,
      totalDebit: val.totalDebit,
      totalCredit: val.totalCredit,
      balance: runningBalance,
      lastDate: lastItem?.date || undefined,
    });
  });

  return result;
}

// Master parser for an uploaded Excel File
export function parseDetailExcelFile(file: File): Promise<ParseDetailResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: false });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error("Excel dosyasında çalışma sayfası bulunamadı.");
        }

        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const { headers, rows } = parseSheetToRows(firstSheet);

        if (rows.length === 0) {
          throw new Error("Yüklenen dosyada geçerli veri satırı bulunamadı.");
        }

        const detected = detectDetailColumns(headers);

        // Clean file name to use as company name fallback
        const cleanName = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[_-]/g, " ")
          .trim();

        // Check if file has multiple sheets, each sheet might be a company
        let allCompanies: CompanyDetail[] = [];

        if (workbook.SheetNames.length > 1 && !detected.companyCol) {
          // Multi-sheet workbook where sheet names are company names!
          workbook.SheetNames.forEach((sheetName) => {
            const sh = workbook.Sheets[sheetName];
            const parsed = parseSheetToRows(sh);
            if (parsed.rows.length > 0) {
              const sheetMapping = detectDetailColumns(parsed.headers);
              const compList = buildCompaniesFromRows(parsed.rows, sheetMapping, sheetName);
              allCompanies.push(...compList);
            }
          });
        }

        if (allCompanies.length === 0) {
          allCompanies = buildCompaniesFromRows(rows, detected, cleanName);
        }

        // Set sourceFile on each
        allCompanies.forEach((c) => {
          c.sourceFile = file.name;
        });

        resolve({
          companies: allCompanies,
          headers,
          rawRows: rows,
          detectedMapping: detected,
          fileName: file.name,
        });
      } catch (err: any) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Dosya okuma başarısız oldu."));
    };

    reader.readAsBinaryString(file);
  });
}
