import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { pathToFileURL } from "url";

export const runtime = "nodejs";

// Polyfill DOMMatrix, Path2D, and ImageData for Node.js environments (required by pdfjs-dist inside pdf-parse v2)
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a;
        this.m12 = this.b;
        this.m21 = this.c;
        this.m22 = this.d;
        this.m41 = this.e;
        this.m42 = this.f;
      }
    }
    multiply() {
      return new DOMMatrixPolyfill();
    }
    inverse() {
      return new DOMMatrixPolyfill();
    }
    translate() {
      return new DOMMatrixPolyfill();
    }
    scale() {
      return new DOMMatrixPolyfill();
    }
    rotate() {
      return new DOMMatrixPolyfill();
    }
    transformPoint(p?: { x?: number; y?: number }) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 };
    }
  }
  // @ts-expect-error polyfill for pdfjs in node runtime
  globalThis.DOMMatrix = DOMMatrixPolyfill;
}

if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error polyfill for pdfjs in node runtime
  globalThis.Path2D = class Path2DPolyfill {};
}

if (typeof globalThis.ImageData === "undefined") {
  // @ts-expect-error polyfill for pdfjs in node runtime
  globalThis.ImageData = class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

let workerInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureWorker(PDFParseClass: any) {
  if (workerInitialized) return;
  try {
    const workerAbsolutePath = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs"
    );
    const workerUrl = pathToFileURL(workerAbsolutePath).href;
    if (typeof PDFParseClass.setWorker === "function") {
      PDFParseClass.setWorker(workerUrl);
    }
    workerInitialized = true;
  } catch (e) {
    console.warn("Could not set explicit PDF worker path:", e);
  }
}

export interface ExtractedInvoiceItem {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  netAmount: number;
  totalAmount: number;
}

export interface ExtractedInvoiceDocument {
  id: string;
  fileName: string;
  fileType: "xml" | "pdf" | "image";
  buyerName: string;
  buyerTaxId: string;
  sellerName: string;
  invoiceDate: string;
  invoiceNo: string;
  currency: string;
  items: ExtractedInvoiceItem[];
  subtotalAmount: number;
  totalVatAmount: number;
  grandTotalAmount: number;
  rawTextSnippet?: string;
  parseNote?: string;
}

const UNIT_CODE_MAP: Record<string, string> = {
  C62: "Adet",
  NIU: "Adet",
  EA: "Adet",
  H87: "Adet",
  KGM: "Kg",
  GRM: "Gr",
  TNE: "Ton",
  LTR: "Lt",
  MLT: "Ml",
  MTR: "Mt",
  MTK: "m²",
  MTQ: "m³",
  BX: "Kutu",
  PK: "Paket",
  PA: "Paket",
  SET: "Set",
  PR: "Çift",
  RO: "Rulo",
  BG: "Torba",
  CT: "Koli",
  CS: "Kasa",
  DAY: "Gün",
  HUR: "Saat",
  MON: "Ay",
};

function normalizeUnit(codeOrText?: string): string {
  if (!codeOrText) return "Adet";
  const upper = codeOrText.trim().toUpperCase();
  if (UNIT_CODE_MAP[upper]) return UNIT_CODE_MAP[upper];
  if (/^(ADET|AD\.?|ADT)$/i.test(upper)) return "Adet";
  if (/^(KG|KILO|KİLO|KGM)$/i.test(upper)) return "Kg";
  if (/^(LT|LITRE|LİTRE|LTR)$/i.test(upper)) return "Lt";
  if (/^(MT|METRE|MTR)$/i.test(upper)) return "Mt";
  if (/^(KOLİ|KOLI)$/i.test(upper)) return "Koli";
  if (/^(PAKET|PKT|PK)$/i.test(upper)) return "Paket";
  if (/^(KUTU|KT)$/i.test(upper)) return "Kutu";
  return codeOrText.trim();
}

function parseFlexibleNumber(val?: string | null): number {
  if (!val) return 0;
  let cleaned = val
    .replace(/[^\d.,\-]/g, "")
    .trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Turkish format: 1.234,56
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US/XML format: 1,234.56
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Only comma present: 1234,56
    cleaned = cleaned.replace(",", ".");
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function extractXmlTagValue(xml: string, tagPattern: string): string {
  const regex = new RegExp(
    `<(?:[a-zA-Z0-9_]+:)?${tagPattern}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagPattern}>`,
    "i"
  );
  const match = xml.match(regex);
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
}

function extractAllXmlBlocks(xml: string, tagPattern: string): string[] {
  const regex = new RegExp(
    `<(?:[a-zA-Z0-9_]+:)?${tagPattern}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagPattern}>`,
    "gi"
  );
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function parseXmlPartyName(partyBlock: string): { name: string; taxId: string } {
  if (!partyBlock) return { name: "", taxId: "" };
  const partyNameBlock = extractXmlTagValue(partyBlock, "PartyName");
  let name = extractXmlTagValue(partyNameBlock || partyBlock, "Name");

  if (!name) {
    const personBlock = extractXmlTagValue(partyBlock, "Person");
    if (personBlock) {
      const first = extractXmlTagValue(personBlock, "FirstName");
      const last = extractXmlTagValue(personBlock, "FamilyName");
      const middle = extractXmlTagValue(personBlock, "MiddleName");
      name = [first, middle, last].filter(Boolean).join(" ").trim();
    }
  }

  let taxId = "";
  const idBlocks = extractAllXmlBlocks(partyBlock, "PartyIdentification");
  for (const b of idBlocks) {
    const idVal = extractXmlTagValue(b, "ID");
    if (/^\d{10,11}$/.test(idVal)) {
      taxId = idVal;
      break;
    }
    if (!taxId && idVal) {
      taxId = idVal;
    }
  }

  return { name, taxId };
}

function parseInvoiceXml(xmlText: string, fileName: string): ExtractedInvoiceDocument {
  // Strip embedded <cac:AdditionalDocumentReference> binary objects so they don't bloat regexes or shadow <cbc:ID>
  const strippedHeaderXml = xmlText
    .replace(
      /<(?:[a-zA-Z0-9_]+:)?AdditionalDocumentReference[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?AdditionalDocumentReference>/gi,
      ""
    )
    .replace(
      /<(?:[a-zA-Z0-9_]+:)?Signature[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?Signature>/gi,
      ""
    );

  // Top-level Invoice No & IssueDate (before Party blocks)
  const beforeSupplier = strippedHeaderXml.split(/<(?:[a-zA-Z0-9_]+:)?AccountingSupplierParty/i)[0] || strippedHeaderXml;
  const invoiceNo =
    extractXmlTagValue(beforeSupplier, "ID") ||
    extractXmlTagValue(strippedHeaderXml, "InvoiceNumber") ||
    extractXmlTagValue(strippedHeaderXml, "FaturaNo") ||
    "BELİRTİLMEDİ";

  const invoiceDate =
    extractXmlTagValue(beforeSupplier, "IssueDate") ||
    extractXmlTagValue(strippedHeaderXml, "IssueDate") ||
    extractXmlTagValue(strippedHeaderXml, "FaturaTarihi") ||
    new Date().toISOString().slice(0, 10);

  const currency =
    extractXmlTagValue(beforeSupplier, "DocumentCurrencyCode") || "TRY";

  const customerBlock =
    extractXmlTagValue(strippedHeaderXml, "AccountingCustomerParty") ||
    extractXmlTagValue(strippedHeaderXml, "BuyerCustomerParty");
  const supplierBlock =
    extractXmlTagValue(strippedHeaderXml, "AccountingSupplierParty") ||
    extractXmlTagValue(strippedHeaderXml, "SellerSupplierParty");

  const buyer = parseXmlPartyName(customerBlock);
  const seller = parseXmlPartyName(supplierBlock);

  const lineBlocks = extractAllXmlBlocks(strippedHeaderXml, "InvoiceLine");
  const items: ExtractedInvoiceItem[] = [];

  lineBlocks.forEach((lineXml, idx) => {
    const itemBlock = extractXmlTagValue(lineXml, "Item");
    const itemName =
      extractXmlTagValue(itemBlock, "Name") ||
      extractXmlTagValue(itemBlock, "Description") ||
      extractXmlTagValue(lineXml, "Note") ||
      `Kalem #${idx + 1}`;
    const itemDesc = extractXmlTagValue(itemBlock, "Description");
    const fullProductName =
      itemDesc && itemDesc !== itemName && !itemName.includes(itemDesc)
        ? `${itemName} (${itemDesc})`
        : itemName;

    // Quantity & unitCode attribute
    const qtyMatch = lineXml.match(
      /<(?:[a-zA-Z0-9_]+:)?(?:InvoicedQuantity|Quantity)([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?(?:InvoicedQuantity|Quantity)>/i
    );
    const qtyAttr = qtyMatch ? qtyMatch[1] : "";
    const unitCodeMatch = qtyAttr.match(/unitCode=["']([^"']+)["']/i);
    const unit = normalizeUnit(unitCodeMatch ? unitCodeMatch[1] : "Adet");
    const quantity = parseFlexibleNumber(qtyMatch ? qtyMatch[2] : "1") || 1;

    const netAmount = parseFlexibleNumber(
      extractXmlTagValue(lineXml, "LineExtensionAmount")
    );

    const priceBlock = extractXmlTagValue(lineXml, "Price");
    let unitPrice = parseFlexibleNumber(
      extractXmlTagValue(priceBlock, "PriceAmount")
    );
    if (!unitPrice && netAmount > 0 && quantity > 0) {
      unitPrice = Number((netAmount / quantity).toFixed(4));
    }

    const taxTotalBlock = extractXmlTagValue(lineXml, "TaxTotal");
    const taxSubtotalBlock = extractXmlTagValue(taxTotalBlock, "TaxSubtotal");
    const vatRate = parseFlexibleNumber(
      extractXmlTagValue(taxSubtotalBlock || taxTotalBlock || itemBlock, "Percent")
    );
    let vatAmount = parseFlexibleNumber(
      extractXmlTagValue(taxTotalBlock || taxSubtotalBlock, "TaxAmount")
    );
    const effectiveNet = netAmount || Number((quantity * unitPrice).toFixed(2));
    if (!vatAmount && vatRate > 0 && effectiveNet > 0) {
      vatAmount = Number(((effectiveNet * vatRate) / 100).toFixed(2));
    }
    const totalAmount = Number((effectiveNet + vatAmount).toFixed(2));

    items.push({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      productName: fullProductName,
      quantity,
      unit,
      unitPrice,
      vatRate,
      vatAmount,
      netAmount: effectiveNet,
      totalAmount,
    });
  });

  const monetaryBlock = extractXmlTagValue(strippedHeaderXml, "LegalMonetaryTotal");
  const xmlSubtotal = parseFlexibleNumber(
    extractXmlTagValue(monetaryBlock, "LineExtensionAmount") ||
      extractXmlTagValue(monetaryBlock, "TaxExclusiveAmount")
  );
  const xmlPayable = parseFlexibleNumber(
    extractXmlTagValue(monetaryBlock, "PayableAmount") ||
      extractXmlTagValue(monetaryBlock, "TaxInclusiveAmount")
  );

  // Header TaxTotal (outside InvoiceLine)
  const withoutLines = strippedHeaderXml.replace(
    /<(?:[a-zA-Z0-9_]+:)?InvoiceLine[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?InvoiceLine>/gi,
    ""
  );
  const headerTaxBlock = extractXmlTagValue(withoutLines, "TaxTotal");
  const xmlVatTotal = parseFlexibleNumber(
    extractXmlTagValue(headerTaxBlock, "TaxAmount")
  );

  const computedSubtotal = items.reduce((s, i) => s + i.netAmount, 0);
  const computedVat = items.reduce((s, i) => s + i.vatAmount, 0);
  const computedGrand = items.reduce((s, i) => s + i.totalAmount, 0);

  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    fileType: "xml",
    buyerName: buyer.name || "Belirtilmemiş Alıcı",
    buyerTaxId: buyer.taxId,
    sellerName: seller.name || "",
    invoiceDate,
    invoiceNo,
    currency: currency === "TRL" ? "TRY" : currency,
    items,
    subtotalAmount: Number((computedSubtotal || xmlSubtotal).toFixed(2)),
    totalVatAmount: Number((computedVat || xmlVatTotal).toFixed(2)),
    grandTotalAmount: Number((computedGrand || xmlPayable).toFixed(2)),
    parseNote: "UBL-TR e-Fatura / e-Arşiv XML başarıyla ayrıştırıldı.",
  };
}

function normalizeDateString(raw: string): string {
  const trimmed = raw.trim();
  // Match DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  // Match YYYY-MM-DD
  const ymd = trimmed.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  return trimmed;
}

function parseInvoicePdfText(rawText: string, fileName: string): ExtractedInvoiceDocument {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // 1. Extract Invoice No (e.g., 16-char GIB number or "Fatura No: ...")
  let invoiceNo = "";
  const gibMatch = rawText.match(/\b([A-Z0-9]{3}20\d{11})\b/);
  if (gibMatch) {
    invoiceNo = gibMatch[1];
  } else {
    const fnMatch = rawText.match(
      /(?:Fatura\s*No|Fatura\s*Numaras[ıi]|Belge\s*No)\s*[:.]?\s*([A-Z0-9\-/]{5,24})/i
    );
    if (fnMatch) invoiceNo = fnMatch[1].trim();
  }
  if (!invoiceNo) {
    invoiceNo = fileName.replace(/\.[^.]+$/, "").slice(0, 20).toUpperCase();
  }

  // 2. Extract Invoice Date
  let invoiceDate = "";
  const dateLabelMatch = rawText.match(
    /(?:Fatura\s*Tarihi|D[üu]zenleme\s*Tarihi|Tarih)\s*[:.]?\s*(\d{1,2}[./\-]\d{1,2}[./\-]\d{4}|\d{4}[./\-]\d{1,2}[./\-]\d{1,2})/i
  );
  if (dateLabelMatch) {
    invoiceDate = normalizeDateString(dateLabelMatch[1]);
  } else {
    const anyDate = rawText.match(
      /\b(\d{2}[./]\d{2}[./]20\d{2}|20\d{2}-\d{2}-\d{2})\b/
    );
    if (anyDate) invoiceDate = normalizeDateString(anyDate[1]);
  }
  if (!invoiceDate) {
    invoiceDate = new Date().toISOString().slice(0, 10);
  }

  // 3. Extract Buyer (Alıcı Firma / Kişi) & Seller
  let buyerName = "";
  let buyerTaxId = "";
  let sellerName = "";

  const sayinIdx = lines.findIndex((l) =>
    /^(SAYIN|ALICI\s*[:]|MÜŞTERİ|MUSTERI)/i.test(l)
  );
  if (sayinIdx !== -1) {
    const inlineSayin = lines[sayinIdx]
      .replace(/^(SAYIN|ALICI|MÜŞTERİ|MUSTERI)\s*[:.]?\s*/i, "")
      .trim();
    if (inlineSayin.length > 2 && !/^(VKN|TCKN|VERGİ)/i.test(inlineSayin)) {
      buyerName = inlineSayin;
    } else {
      for (let i = sayinIdx + 1; i < Math.min(sayinIdx + 6, lines.length); i++) {
        const candidate = lines[i];
        if (
          candidate.length > 2 &&
          !/^(ETTN|FATURA|ÖZELLEŞTİRME|SENARYO|DÜZENLEME|İRSALİYE)/i.test(candidate)
        ) {
          buyerName = candidate;
          break;
        }
      }
    }
    // Look for VKN/TCKN near SAYIN
    for (let i = sayinIdx; i < Math.min(sayinIdx + 10, lines.length); i++) {
      const vknMatch = lines[i].match(/(?:VKN|TCKN|Vergi\s*No|T\.?C\.?\s*Kimlik)\s*[:./]?\s*(\d{10,11})/i) ||
        lines[i].match(/\b(\d{10,11})\b/);
      if (vknMatch) {
        buyerTaxId = vknMatch[1];
        break;
      }
    }
  }

  // Seller is usually in the first 10 lines (company title with A.Ş., LTD., ŞTİ., etc.)
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    if (sayinIdx !== -1 && i >= sayinIdx) break;
    if (
      /(A\.?\s*Ş\.?|LTD\.?|ŞTİ\.?|SAN\.?|TİC\.?|PAZARLAMA|GIDA|İNŞAAT|TEKSTİL|LOJİSTİK|OTOMOTİV|BİLİŞİM)/i.test(
        lines[i]
      )
    ) {
      sellerName = lines[i];
      break;
    }
  }

  if (!buyerName) {
    // Fallback: look for company names in text
    const companyLines = lines.filter((l) =>
      /(A\.?\s*Ş\.?|LTD\.?|ŞTİ\.?|SAN\.?|TİC\.?)/i.test(l)
    );
    if (companyLines.length >= 2) {
      sellerName = sellerName || companyLines[0];
      buyerName = companyLines[1];
    } else if (companyLines.length === 1) {
      buyerName = companyLines[0];
    } else {
      buyerName = "PDF Fatura Alıcısı";
    }
  }

  // 4. Extract Line Items from PDF text
  const items: ExtractedInvoiceItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip summary/footer lines
    if (
      /^(Mal\s*Hizmet\s*Toplam|Toplam\s*İskonto|Hesaplanan\s*KDV|Vergiler\s*Dahil|Ödenecek\s*Tutar|Genel\s*Toplam|Ara\s*Toplam|Yalnız|Not\s*:|IBAN|TR\d{2})/i.test(
        line
      )
    ) {
      continue;
    }

    // Pattern A: Standard Turkish e-Fatura table row
    // e.g. "1 DANA KARKAS ET 250 Adet 420,00 TL %1 1.050,00 TL 105.000,00 TL" or similar
    const efaturaRowMatch = line.match(
      /^(?:(\d{1,3})\s+)?(.+?)\s+(\d+(?:[.,]\d+)?)\s*(Adet|Kg|KGM|Lt|LTR|Mt|Koli|Paket|Kutu|Ton|Gr|m2|m²|Set|Çift|Gün|Saat|Ay|C62|NIU)?\s+(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2,4})|\d+(?:[.,]\d{2,4}))\s*(?:TL|TRY|₺|USD|EUR)?\s+(?:%?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%?\s+)?(?:(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))\s*(?:TL|TRY|₺|USD|EUR)?\s+)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))\s*(?:TL|TRY|₺|USD|EUR)?$/i
    );

    if (efaturaRowMatch) {
      const prodName = efaturaRowMatch[2].trim();
      if (prodName.length >= 2 && !/^(Sıra|Mal\s*Hizmet|Miktar|Birim)/i.test(prodName)) {
        const quantity = parseFlexibleNumber(efaturaRowMatch[3]) || 1;
        const unit = normalizeUnit(efaturaRowMatch[4] || "Adet");
        const unitPrice = parseFlexibleNumber(efaturaRowMatch[5]);
        const vatRate = efaturaRowMatch[6] ? parseFlexibleNumber(efaturaRowMatch[6]) : 20;
        const netFromRow = parseFlexibleNumber(efaturaRowMatch[8]);
        const netAmount = netFromRow || Number((quantity * unitPrice).toFixed(2));
        const vatFromRow = efaturaRowMatch[7]
          ? parseFlexibleNumber(efaturaRowMatch[7])
          : Number(((netAmount * vatRate) / 100).toFixed(2));
        const totalAmount = Number((netAmount + vatFromRow).toFixed(2));

        if (netAmount > 0 || unitPrice > 0) {
          items.push({
            id: `${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
            productName: prodName,
            quantity,
            unit,
            unitPrice: unitPrice || Number((netAmount / quantity).toFixed(2)),
            vatRate,
            vatAmount: vatFromRow,
            netAmount,
            totalAmount,
          });
        }
      }
    }
  }

  // Extract summary totals from PDF text if present
  const subtotalMatch = rawText.match(
    /(?:Mal\s*Hizmet\s*Toplam\s*Tutar[ıi]|Ara\s*Toplam|Matrah)\s*[:.]?\s*([\d.,]+)\s*(?:TL|TRY|₺)?/i
  );
  const vatTotalMatch = rawText.match(
    /(?:Hesaplanan\s*KDV|Toplam\s*KDV|KDV\s*Tutar[ıi])\s*(?:\([^)]*\))?\s*[:.]?\s*([\d.,]+)\s*(?:TL|TRY|₺)?/i
  );
  const grandTotalMatch = rawText.match(
    /(?:Ödenecek\s*Tutar|Vergiler\s*Dahil\s*Toplam\s*Tutar|Genel\s*Toplam)\s*[:.]?\s*([\d.,]+)\s*(?:TL|TRY|₺)?/i
  );

  const pdfSubtotal = subtotalMatch ? parseFlexibleNumber(subtotalMatch[1]) : 0;
  const pdfVatTotal = vatTotalMatch ? parseFlexibleNumber(vatTotalMatch[1]) : 0;
  const pdfGrandTotal = grandTotalMatch ? parseFlexibleNumber(grandTotalMatch[1]) : 0;

  // If no individual rows matched, create a fallback item from summary totals so user sees values and can edit
  if (items.length === 0) {
    const net = pdfSubtotal || (pdfGrandTotal > 0 && pdfVatTotal > 0 ? pdfGrandTotal - pdfVatTotal : pdfGrandTotal);
    const vat = pdfVatTotal || 0;
    const total = pdfGrandTotal || net + vat;
    const inferredRate =
      net > 0 && vat > 0 ? Math.round((vat / net) * 100) : 20;

    items.push({
      id: `${Date.now()}-0`,
      productName: "Fatura Genel Kalemi (PDF'den Aktarıldı)",
      quantity: 1,
      unit: "Adet",
      unitPrice: Number(net.toFixed(2)),
      vatRate: inferredRate,
      vatAmount: Number(vat.toFixed(2)),
      netAmount: Number(net.toFixed(2)),
      totalAmount: Number(total.toFixed(2)),
    });
  }

  const computedSubtotal = items.reduce((s, i) => s + i.netAmount, 0);
  const computedVat = items.reduce((s, i) => s + i.vatAmount, 0);
  const computedGrand = items.reduce((s, i) => s + i.totalAmount, 0);

  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    fileType: "pdf",
    buyerName,
    buyerTaxId,
    sellerName,
    invoiceDate,
    invoiceNo,
    currency: "TRY",
    items,
    subtotalAmount: Number((computedSubtotal || pdfSubtotal).toFixed(2)),
    totalVatAmount: Number((computedVat || pdfVatTotal).toFixed(2)),
    grandTotalAmount: Number((computedGrand || pdfGrandTotal).toFixed(2)),
    rawTextSnippet: lines.slice(0, 30).join("\n"),
    parseNote: "PDF fatura metni ayrıştırıldı. Kalemleri tablodan kontrol edip düzenleyebilirsiniz.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Lütfen en az bir XML, PDF veya Fotoğraf dosyası seçin." },
        { status: 400 }
      );
    }

    const documents: ExtractedInvoiceDocument[] = [];
    const errors: { fileName: string; message: string }[] = [];

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      try {
        if (lowerName.endsWith(".xml") || file.type.includes("xml")) {
          const xmlText = await file.text();
          const doc = parseInvoiceXml(xmlText, file.name);
          documents.push(doc);
        } else if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const pdfParseModule = await import("pdf-parse");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const PDFParseClass = (pdfParseModule as any).PDFParse;
          await ensureWorker(PDFParseClass);
          const parser = new PDFParseClass({ data: buffer, verbosity: 0 });
          const result = await parser.getText();
          const rawText: string = result?.text || "";
          const doc = parseInvoicePdfText(rawText, file.name);
          documents.push(doc);
        } else if (
          /\.(jpg|jpeg|png|webp|heic)$/i.test(lowerName) ||
          file.type.startsWith("image/")
        ) {
          // Image / Photo Invoice handling
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const dateInName = baseName.match(/(20\d{2}[-_.]\d{2}[-_.]\d{2}|\d{2}[-_.]\d{2}[-_.]20\d{2})/);
          const invNoInName = baseName.match(/([A-Z0-9]{3}20\d{11}|FAT[-_]?\d+|\d{6,16})/i);

          documents.push({
            id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            fileName: file.name,
            fileType: "image",
            buyerName: "Fotoğraf Fatura Alıcısı (Düzenleyiniz)",
            buyerTaxId: "",
            sellerName: "",
            invoiceDate: dateInName
              ? normalizeDateString(dateInName[1].replace(/_/g, "-"))
              : new Date().toISOString().slice(0, 10),
            invoiceNo: invNoInName
              ? invNoInName[1].toUpperCase()
              : `FOTO-${Math.floor(100000 + Math.random() * 900000)}`,
            currency: "TRY",
            items: [
              {
                id: `${Date.now()}-img-0`,
                productName: `${baseName} - Fatura Kalemi`,
                quantity: 1,
                unit: "Adet",
                unitPrice: 0,
                vatRate: 20,
                vatAmount: 0,
                netAmount: 0,
                totalAmount: 0,
              },
            ],
            subtotalAmount: 0,
            totalVatAmount: 0,
            grandTotalAmount: 0,
            parseNote:
              "Fotoğraf yüklendi. Görsel önizleme penceresinden bakarak veya OCR ile değerleri hızlıca girebilirsiniz.",
          });
        } else {
          errors.push({
            fileName: file.name,
            message: "Desteklenmeyen dosya formatı (Sadece XML, PDF ve Fotoğraf kabul edilir).",
          });
        }
      } catch (fileErr: unknown) {
        errors.push({
          fileName: file.name,
          message:
            fileErr instanceof Error
              ? fileErr.message
              : "Dosya işlenirken beklenmeyen bir hata oluştu.",
        });
      }
    }

    return NextResponse.json({
      documents,
      errors,
    });
  } catch (err: unknown) {
    console.error("Bulk Invoice Parse Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Faturalar ayrıştırılırken sunucu hatası oluştu.",
      },
      { status: 500 }
    );
  }
}

