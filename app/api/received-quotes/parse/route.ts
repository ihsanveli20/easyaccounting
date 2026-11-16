import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  cleanSupplierFromFileName,
  detectCurrency,
  normalizeQuoteText,
  normalizeUnitLabel,
  parseFlexibleNumber,
  parseQuoteTextToDocument,
} from "../../../utils/receivedQuotesParser";
import { QuoteFileType, ReceivedQuoteItem } from "../../../types/receivedQuotes";

// Polyfills required by pdfjs-dist inside pdf-parse v2 on Node.js
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    invertSelf() { return this; }
    transformPoint(p: { x?: number; y?: number } = { x: 0, y: 0 }) {
      return { x: p.x ?? 0, y: p.y ?? 0, z: 0, w: 1 };
    }
  };
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as Record<string, unknown>).Path2D = class Path2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    rect() {}
  };
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseExcelBufferToQuote(buffer: Buffer, fileName: string) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return parseQuoteTextToDocument("", fileName, "excel");
  }

  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  // Detect supplier & metadata from top rows
  let supplierName = "";
  let quoteNo = "";
  let quoteDate = "";
  let allText = "";

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const rowStr = (rows[r] || []).map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
    allText += rowStr + "\n";
    if (!rowStr) continue;

    if (!supplierName) {
      const m = rowStr.match(/(?:tedarikci|tedarikçi|firma|satıcı|satici|gönderen)\s*[:\-]\s*(.+)/i);
      if (m && m[1]?.trim().length >= 3) {
        supplierName = m[1].trim();
      } else if (/(a\.ş\.|a\.s\.|ltd\.|şti\.|sti\.|san\.|tic\.)/i.test(rowStr) && rowStr.length <= 90) {
        supplierName = rowStr;
      }
    }
    if (!quoteNo) {
      const nm = rowStr.match(/(?:teklif\s*no|ref|belge\s*no)\s*[:\-]?\s*([A-Z0-9\-\/]{3,25})/i);
      if (nm) quoteNo = nm[1].trim();
    }
    if (!quoteDate) {
      const dm = rowStr.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
      if (dm) quoteDate = dm[1];
    }
  }

  if (!supplierName) {
    supplierName = cleanSupplierFromFileName(fileName);
  }

  // Find header row
  let headerRowIdx = -1;
  let colName = -1;
  let colQty = -1;
  let colUnit = -1;
  let colUnitPrice = -1;
  let colVat = -1;
  let colTotal = -1;
  let colBrand = -1;
  let colSku = -1;

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    const normCells = row.map((c) => normalizeQuoteText(String(c ?? "")));

    let foundName = -1;
    let foundPrice = -1;
    let foundQty = -1;
    let foundUnit = -1;
    let foundVat = -1;
    let foundTotal = -1;
    let foundBrand = -1;
    let foundSku = -1;

    normCells.forEach((cell, cIdx) => {
      if (!cell) return;
      if (
        foundName === -1 &&
        /(urun|malzeme|aciklama|kalem|hizmet|cins|description|product|item|adi)/.test(cell) &&
        !/(kod|sku)/.test(cell)
      ) {
        foundName = cIdx;
      } else if (foundSku === -1 && /(kod|sku|stok kodu|urun kodu)/.test(cell)) {
        foundSku = cIdx;
      } else if (foundBrand === -1 && /(marka|brand)/.test(cell)) {
        foundBrand = cIdx;
      } else if (foundQty === -1 && /(miktar|adet|qty|quantity)/.test(cell)) {
        foundQty = cIdx;
      } else if (foundUnit === -1 && /(birim$|olcu|unit)/.test(cell) && !/fiyat/.test(cell)) {
        foundUnit = cIdx;
      } else if (foundUnit === -1 && cell === "birim") {
        foundUnit = cIdx;
      } else if (foundPrice === -1 && /(birim fiyat|b\.fiyat|fiyat|unit price|price)/.test(cell)) {
        foundPrice = cIdx;
      } else if (foundVat === -1 && /(kdv|vat)/.test(cell)) {
        foundVat = cIdx;
      } else if (foundTotal === -1 && /(tutar|toplam|total|amount)/.test(cell)) {
        foundTotal = cIdx;
      }
    });

    if (foundName !== -1 && (foundPrice !== -1 || foundTotal !== -1)) {
      headerRowIdx = r;
      colName = foundName;
      colQty = foundQty;
      colUnit = foundUnit;
      colUnitPrice = foundPrice;
      colVat = foundVat;
      colTotal = foundTotal;
      colBrand = foundBrand;
      colSku = foundSku;
      break;
    }
  }

  // Fallback if no explicit header found: guess columns from first data-like row
  if (headerRowIdx === -1) {
    const rawCsvText = rows
      .map((r) => (r || []).map((c) => String(c ?? "").trim()).filter(Boolean).join("  "))
      .filter(Boolean)
      .join("\n");
    return parseQuoteTextToDocument(rawCsvText, fileName, "excel");
  }

  const items: ReceivedQuoteItem[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = String(row[colName] ?? "").trim();
    if (!name) continue;
    const normName = normalizeQuoteText(name);
    if (/^(ara toplam|genel toplam|toplam|kdv|iskonto|not)/.test(normName)) continue;

    const quantity = colQty !== -1 ? parseFlexibleNumber(row[colQty]) || 1 : 1;
    const unit = colUnit !== -1 ? normalizeUnitLabel(String(row[colUnit] ?? "Adet")) : "Adet";
    let unitPrice = colUnitPrice !== -1 ? parseFlexibleNumber(row[colUnitPrice]) : 0;
    const vatRate = colVat !== -1 ? parseFlexibleNumber(row[colVat]) : 20;
    let lineTotal = colTotal !== -1 ? parseFlexibleNumber(row[colTotal]) : 0;

    if (unitPrice <= 0 && lineTotal > 0 && quantity > 0) {
      unitPrice = round2(lineTotal / quantity);
    }
    if (lineTotal <= 0 && unitPrice > 0 && quantity > 0) {
      lineTotal = round2(unitPrice * quantity);
    }
    if (unitPrice <= 0 && lineTotal <= 0) continue;

    const lineTotalWithVat = round2(lineTotal * (1 + vatRate / 100));
    allText += `${name} ${quantity} ${unit} ${unitPrice} ${lineTotal}\n`;

    items.push({
      id: `rq-xl-${Date.now()}-${r}`,
      name,
      normalizedName: normName,
      sku: colSku !== -1 ? String(row[colSku] ?? "").trim() || undefined : undefined,
      brand: colBrand !== -1 ? String(row[colBrand] ?? "").trim() || undefined : undefined,
      quantity,
      unit,
      unitPrice: round2(unitPrice),
      vatRate,
      lineTotal: round2(lineTotal),
      lineTotalWithVat,
    });
  }

  const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));
  const vatTotal = round2(items.reduce((s, it) => s + (it.lineTotalWithVat - it.lineTotal), 0));
  const grandTotal = round2(items.reduce((s, it) => s + it.lineTotalWithVat, 0));
  const currency = detectCurrency(allText);

  return {
    fileName,
    fileType: "excel" as QuoteFileType,
    supplierName,
    quoteNo: quoteNo || undefined,
    quoteDate: quoteDate || undefined,
    currency,
    subtotal,
    vatTotal,
    grandTotal,
    items,
    rawText: allText.trim(),
    parseStatus: items.length > 0 ? ("parsed" as const) : ("needs_review" as const),
    parseNote:
      items.length > 0
        ? `Excel tablosundan ${items.length} kalem aktarıldı.`
        : "Excel tablosundan kalem okunamadı; manuel düzenleyebilirsiniz.",
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfModule = await import("pdf-parse");
  const PDFParseCtor = (pdfModule as unknown as { PDFParse?: new (opts: { data: Buffer }) => { getText: () => Promise<{ text?: string }>; destroy?: () => Promise<void> } }).PDFParse;
  if (typeof PDFParseCtor === "function") {
    const parser = new PDFParseCtor({ data: buffer });
    try {
      const res = await parser.getText();
      return res?.text || "";
    } finally {
      if (typeof parser.destroy === "function") {
        await parser.destroy().catch(() => {});
      }
    }
  }
  const legacyFn = (pdfModule as unknown as { default?: (b: Buffer) => Promise<{ text?: string }> }).default;
  if (typeof legacyFn === "function") {
    const res = await legacyFn(buffer);
    return res?.text || "";
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // 1. JSON payload (from client-side image OCR or scanned PDF OCR)
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        fileName?: string;
        fileType?: QuoteFileType;
        rawText?: string;
      };
      const fileName = body.fileName || "Teklif";
      const fileType = body.fileType || "image";
      const rawText = body.rawText || "";
      const parsed = parseQuoteTextToDocument(rawText, fileName, fileType);
      return NextResponse.json({ success: true, quote: parsed });
    }

    // 2. Multipart FormData (PDF or Excel files)
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Yüklenecek dosya bulunamadı." },
        { status: 400 }
      );
    }

    const results = [];
    for (const file of files) {
      const fileName = file.name || "teklif";
      const lowerName = fileName.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv")) {
        const parsed = parseExcelBufferToQuote(buffer, fileName);
        results.push({ ...parsed, fileSize: file.size, needsClientOcr: false });
      } else if (lowerName.endsWith(".pdf")) {
        let text = "";
        try {
          text = await extractPdfText(buffer);
        } catch (err) {
          console.warn("PDF text extraction warning:", err);
        }

        if (!text || text.trim().length < 20) {
          results.push({
            fileName,
            fileType: "pdf" as QuoteFileType,
            fileSize: file.size,
            supplierName: cleanSupplierFromFileName(fileName),
            currency: "TRY" as const,
            subtotal: 0,
            vatTotal: 0,
            grandTotal: 0,
            items: [],
            parseStatus: "needs_review" as const,
            parseNote: "Taranmış PDF tespit edildi, tarayıcı OCR çalıştırılıyor...",
            needsClientOcr: true,
          });
        } else {
          const parsed = parseQuoteTextToDocument(text, fileName, "pdf");
          results.push({ ...parsed, fileSize: file.size, needsClientOcr: false });
        }
      } else {
        results.push({
          fileName,
          fileType: "image" as QuoteFileType,
          fileSize: file.size,
          supplierName: cleanSupplierFromFileName(fileName),
          currency: "TRY" as const,
          subtotal: 0,
          vatTotal: 0,
          grandTotal: 0,
          items: [],
          parseStatus: "needs_review" as const,
          needsClientOcr: true,
        });
      }
    }

    return NextResponse.json({ success: true, quotes: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Teklif dosyası ayrıştırılamadı.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

