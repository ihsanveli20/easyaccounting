import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { pathToFileURL } from "url";

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
  globalThis.Path2D = class Path2DPolyfill { };
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
  needsClientOcr?: boolean;
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
  if (!codeOrText) return "Kg";
  const upper = codeOrText.trim().toUpperCase();
  if (UNIT_CODE_MAP[upper]) return UNIT_CODE_MAP[upper];
  if (/^(KG|KILO|KİLO|KILogram|KİLOGRAM|KGM|KG\.)$/i.test(upper)) return "Kg";
  if (/^(ADET|AD\.?|ADT)$/i.test(upper)) return "Adet";
  if (/^(LT|LITRE|LİTRE|LTR)$/i.test(upper)) return "Lt";
  if (/^(MT|METRE|MTR)$/i.test(upper)) return "Mt";
  if (/^(KOLİ|KOLI)$/i.test(upper)) return "Koli";
  if (/^(PAKET|PKT|PK)$/i.test(upper)) return "Paket";
  if (/^(KUTU|KT)$/i.test(upper)) return "Kutu";
  return codeOrText.trim();
}

function parseFlexibleNumber(val?: string | null): number {
  if (!val) return 0;
  let cleaned = val.replace(/[^\d.,\-]/g, "").trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Turkish format: 1.234,56 -> 1234.56
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US/XML format: 1,234.56 -> 1234.56
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Only comma present: 1234,56 or 12,500
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Could be decimal 3 digits for kg (e.g., 12,500 kg = 12.5)
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(",", ".");
    }
  } else if (lastDot > -1) {
    // Check if dot is thousands separator like "12.500" or decimal like "410.50"
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = cleaned.replace(/\./g, "");
    }
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
  const strippedHeaderXml = xmlText
    .replace(
      /<(?:[a-zA-Z0-9_]+:)?AdditionalDocumentReference[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?AdditionalDocumentReference>/gi,
      ""
    )
    .replace(
      /<(?:[a-zA-Z0-9_]+:)?Signature[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?Signature>/gi,
      ""
    );

  const beforeSupplier =
    strippedHeaderXml.split(/<(?:[a-zA-Z0-9_]+:)?AccountingSupplierParty/i)[0] ||
    strippedHeaderXml;
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
    extractXmlTagValue(beforeSupplier, "DocumentCurrencyCode") || "₺";

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

    const qtyMatch = lineXml.match(
      /<(?:[a-zA-Z0-9_]+:)?(?:InvoicedQuantity|Quantity)([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?(?:InvoicedQuantity|Quantity)>/i
    );
    const qtyAttr = qtyMatch ? qtyMatch[1] : "";
    const unitCodeMatch = qtyAttr.match(/unitCode=["']([^"']+)["']/i);
    const unit = normalizeUnit(unitCodeMatch ? unitCodeMatch[1] : "Kg");
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
    currency: currency === "TRL" ? "₺" : currency,
    items,
    subtotalAmount: Number((computedSubtotal || xmlSubtotal).toFixed(2)),
    totalVatAmount: Number((computedVat || xmlVatTotal).toFixed(2)),
    grandTotalAmount: Number((computedGrand || xmlPayable).toFixed(2)),
    parseNote: "UBL-TR e-Fatura / e-Arşiv XML başarıyla ayrıştırıldı.",
  };
}

function normalizeDateString(raw: string): string {
  const trimmed = raw.trim();
  const dmy = trimmed.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  const ymd = trimmed.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  return trimmed;
}

/**
 * Strips right-side e-Fatura metadata table fragments that often get merged onto the same line as SAYIN / Buyer Name
 */
function stripRightColumnMetadata(line: string): string {
  return line
    .replace(
      /\b(?:Özelleştirme\s*No|Ozellestirme\s*No|Senaryo|Fatura\s*Tipi|Fatura\s*No|Fatura\s*Numaras[ıi]|Fatura\s*Tarihi|Düzenleme\s*Tarihi|Duzenleme\s*Tarihi|Düzenleme\s*Zaman[ıi]|İrsaliye\s*No|Irsaliye\s*No|İrsaliye\s*Tarihi|Sipariş\s*No|Siparis\s*No|Sipariş\s*Tarihi|ETTN|e-Fatura|e-Arşiv\s*Fatura|E-FATURA|E-ARŞİV)\s*[:.]?.*$/i,
      ""
    )
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, "")
    .trim();
}

/**
 * Extracts Buyer Institution / Company starting with "SAYIN" (Fatura Alıcısı)
 */
function extractSayinBuyer(lines: string[], rawText: string): {
  buyerName: string;
  buyerTaxId: string;
} {
  let buyerName = "";
  let buyerTaxId = "";

  // 1. Find the line containing SAYIN (case-insensitive, Turkish characters & OCR tolerances like SAYİN, SAY1N)
  const sayinIdx = lines.findIndex((l) =>
    /\b(SAYIN|SAY[Iİ1]N|Say[ıi]n|ALICI)\b/i.test(l)
  );

  if (sayinIdx !== -1) {
    const sayinLine = lines[sayinIdx];
    // Extract everything after SAYIN on that same line
    const afterSayinMatch = sayinLine.match(
      /\b(?:SAYIN|SAY[Iİ1]N|Say[ıi]n|ALICI)\b\s*[:.\-]?\s*(.*)$/i
    );
    const sameLinePart = stripRightColumnMetadata(afterSayinMatch ? afterSayinMatch[1] : "");

    const buyerParts: string[] = [];
    if (
      sameLinePart.length > 2 &&
      !/^(VKN|TCKN|VERGİ|VERGI|TEL|ADRES|WEB|E-POSTA)/i.test(sameLinePart)
    ) {
      buyerParts.push(sameLinePart);
    }

    // Collect the next 1-4 lines belonging to the institution/company name under SAYIN
    for (let i = sayinIdx + 1; i < Math.min(sayinIdx + 7, lines.length); i++) {
      const cleaned = stripRightColumnMetadata(lines[i]);
      if (!cleaned || cleaned.length < 2) continue;

      // Stop if we hit address/tax/table headers
      if (
        /^(VKN|TCKN|Vergi\s*Dairesi|Vergi\s*No|T\.?C\.?\s*Kimlik|Adres|Mah\.|Mahallesi|Cad\.|Caddesi|Sok\.|Sokak|No\s*:|Tel|Telefon|Faks|E-Posta|Web\s*Sitesi|Sıra\s*No|Sira\s*No|Mal\s*Hizmet|Açıklama|Miktar)/i.test(
          cleaned
        )
      ) {
        // Still check if this line has VKN/TCKN before breaking
        const vknInStop = cleaned.match(/\b(\d{10,11})\b/);
        if (vknInStop && !buyerTaxId) {
          buyerTaxId = vknInStop[1];
        }
        if (buyerParts.length > 0) break;
        continue;
      }

      buyerParts.push(cleaned);
      // Usually institution/company title is 1 or 2 lines max
      if (buyerParts.length >= 2) break;
    }

    buyerName = buyerParts.join(" ").replace(/\s+/g, " ").trim();

    // Extract VKN/TCKN in the lines following SAYIN
    for (let i = sayinIdx; i < Math.min(sayinIdx + 12, lines.length); i++) {
      const vknMatch =
        lines[i].match(
          /(?:VKN|TCKN|Vergi\s*No|Vergi\s*Kimlik|T\.?C\.?\s*Kimlik)\s*[:./\-]?\s*(\d{10,11})/i
        ) || lines[i].match(/\b(\d{10,11})\b/);
      if (vknMatch) {
        buyerTaxId = vknMatch[1];
        break;
      }
    }
  }

  // Fallback regex over rawText if line-by-line didn't catch it
  if (!buyerName) {
    const blockMatch = rawText.match(
      /\b(?:SAYIN|Say[ıi]n)\b\s*[:.\-]?\s*([^\r\n]+)(?:\r?\n\s*([^\r\n]+))?/i
    );
    if (blockMatch) {
      const p1 = stripRightColumnMetadata(blockMatch[1] || "");
      const p2 = stripRightColumnMetadata(blockMatch[2] || "");
      const combined = [p1, p2]
        .filter(
          (p) =>
            p.length > 2 &&
            !/^(VKN|TCKN|VERGİ|ADRES|MAHALLESİ|CAD|SOKAK|TEL)/i.test(p)
        )
        .join(" ")
        .trim();
      if (combined) buyerName = combined;
    }
  }

  return { buyerName, buyerTaxId };
}

/**
 * Extracts invoice line items, prioritizing rows with KG (Kilogram) quantities as well as standard units
 */
function extractKgAndStandardLineItems(lines: string[]): ExtractedInvoiceItem[] {
  const items: ExtractedInvoiceItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip summary/footer lines and header labels
    if (
      /^(Mal\s*Hizmet\s*Toplam|Toplam\s*İskonto|Toplam\s*Iskonto|Hesaplanan\s*KDV|Vergiler\s*Dahil|Ödenecek\s*Tutar|Odenecek\s*Tutar|Genel\s*Toplam|Ara\s*Toplam|Yalnız|Yalniz|Not\s*:|IBAN|TR\d{2}|Sıra\s*No|Sira\s*No\s*Mal)/i.test(
        line
      )
    ) {
      continue;
    }

    // Look for quantity + unit (specifically prioritizing KG / Kg / KGM / Kilogram, plus Adet/Lt/Paket/Koli)
    const unitRegex =
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?)\s*(KG|Kg|kg|KGM|Kilogram|KİLOGRAM|Adet|ADET|Lt|LT|Koli|KOLİ|Paket|PAKET|Ton|TON|C62|NIU)\b/;
    const qtyUnitMatch = line.match(unitRegex);
    if (!qtyUnitMatch || qtyUnitMatch.index === undefined) continue;

    const quantity = parseFlexibleNumber(qtyUnitMatch[1]);
    if (quantity <= 0) continue;

    const rawUnit = qtyUnitMatch[2];
    const unit = normalizeUnit(rawUnit);

    // Everything before the quantity match is the row number + product name
    const beforeQty = line.slice(0, qtyUnitMatch.index).trim();
    // Everything after the quantity+unit match contains Unit Price, VAT %, VAT Amount, Line Total (and possibly next line if wrapped)
    let afterQty = line.slice(qtyUnitMatch.index + qtyUnitMatch[0].length).trim();

    // Clean product name (strip leading row index like "1 ", "2 ", product code, or "|")
    let productName = beforeQty
      .replace(/^\s*\d{1,3}\s+/, "")
      .replace(/^[|\-–—:\s]+/, "")
      .replace(/[|\-–—:\s]+$/, "")
      .trim();

    // If product name is empty or very short on this line, check the previous line
    if (productName.length < 2 && i > 0) {
      const prevLine = stripRightColumnMetadata(lines[i - 1]);
      if (
        prevLine.length >= 3 &&
        !/^(Sıra|Sira|Mal\s*Hizmet|Miktar|Birim|Fatura|SAYIN|Vergi|VKN|TCKN|ETTN)/i.test(
          prevLine
        ) &&
        !unitRegex.test(prevLine)
      ) {
        productName = prevLine.replace(/^\s*\d{1,3}\s+/, "").trim();
      }
    }

    // If afterQty has very few numbers (e.g. row wrapped onto the next line), append next line if it doesn't have its own KG unit
    if (i + 1 < lines.length && !unitRegex.test(lines[i + 1])) {
      const nextLine = lines[i + 1];
      if (
        !/^(Mal\s*Hizmet\s*Toplam|Toplam\s*İskonto|Hesaplanan\s*KDV|Vergiler\s*Dahil|Ödenecek\s*Tutar|Yalnız)/i.test(
          nextLine
        )
      ) {
        const numbersInAfter = afterQty.match(/\d+(?:[.,]\d+)?/g) || [];
        if (numbersInAfter.length < 2) {
          afterQty = `${afterQty} ${nextLine}`;
        }
      }
    }

    // Extract VAT rate if marked with % (e.g. "%1", "% 10", "%20", "1%", "%01", "%8")
    let vatRate = 1; // Default 1% for KG meat/food invoices if not explicitly found
    const vatRateExplicitMatch =
      afterQty.match(/%\s*(\d{1,2}(?:[.,]\d{1,2})?)/) ||
      afterQty.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if (vatRateExplicitMatch) {
      const parsedRate = parseFlexibleNumber(vatRateExplicitMatch[1]);
      if ([0, 1, 8, 10, 18, 20].includes(Math.round(parsedRate))) {
        vatRate = Math.round(parsedRate);
      }
    }

    // Remove the explicit "%XX" token from afterQty so we can cleanly extract monetary amounts
    const afterWithoutPercent = afterQty
      .replace(/%\s*\d{1,2}(?:[.,]\d{1,2})?/g, " ")
      .replace(/\d{1,2}(?:[.,]\d{1,2})?\s*%/g, " ");

    // Extract all number tokens from afterWithoutPercent
    const numberTokens =
      afterWithoutPercent.match(
        /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?/g
      ) || [];

    const parsedNums = numberTokens
      .map((t) => parseFlexibleNumber(t))
      .filter((n) => n >= 0);

    // Filter out standalone VAT rate numbers like 1, 10, 20 if they aren't the unit price
    let unitPrice = 0;
    let vatAmount = 0;
    let netAmount = 0;

    if (parsedNums.length > 0) {
      // Find a number in parsedNums where quantity * candidate ≈ another number in parsedNums (the line net total!)
      let matchedPair = false;
      for (let a = 0; a < parsedNums.length; a++) {
        const candidatePrice = parsedNums[a];
        if (candidatePrice <= 0) continue;
        const expectedNet = quantity * candidatePrice;
        for (let b = a + 1; b < parsedNums.length; b++) {
          const candidateNet = parsedNums[b];
          if (
            candidateNet > 0 &&
            Math.abs(candidateNet - expectedNet) / Math.max(1, expectedNet) < 0.03
          ) {
            unitPrice = candidatePrice;
            netAmount = candidateNet;
            matchedPair = true;
            // Look for VAT amount among remaining numbers between a and b or after b
            const expectedVat = (netAmount * vatRate) / 100;
            for (let c = a + 1; c < parsedNums.length; c++) {
              if (c === b) continue;
              const candVat = parsedNums[c];
              if (
                candVat > 0 &&
                Math.abs(candVat - expectedVat) / Math.max(1, expectedVat) < 0.15
              ) {
                vatAmount = candVat;
                break;
              }
            }
            break;
          }
        }
        if (matchedPair) break;
      }

      if (!matchedPair) {
        const nonZeroNums = parsedNums.filter((n) => n > 0);
        if (nonZeroNums.length >= 3) {
          unitPrice = nonZeroNums[0];
          netAmount = nonZeroNums[nonZeroNums.length - 1];
          // Check if a middle number is a valid VAT rate (1, 10, 20) when % sign was missed by OCR
          if (!vatRateExplicitMatch) {
            const possibleRate = nonZeroNums.find((n) =>
              [1, 8, 10, 18, 20].includes(n)
            );
            if (possibleRate) vatRate = possibleRate;
          }
          vatAmount = Number(((netAmount * vatRate) / 100).toFixed(2));
        } else if (nonZeroNums.length === 2) {
          unitPrice = nonZeroNums[0];
          netAmount = nonZeroNums[1];
          vatAmount = Number(((netAmount * vatRate) / 100).toFixed(2));
        } else if (nonZeroNums.length === 1) {
          unitPrice = nonZeroNums[0];
          netAmount = Number((quantity * unitPrice).toFixed(2));
          vatAmount = Number(((netAmount * vatRate) / 100).toFixed(2));
        }
      }
    }

    if (!netAmount && quantity > 0 && unitPrice > 0) {
      netAmount = Number((quantity * unitPrice).toFixed(2));
    }
    if (!unitPrice && quantity > 0 && netAmount > 0) {
      unitPrice = Number((netAmount / quantity).toFixed(2));
    }
    if (!vatAmount && netAmount > 0 && vatRate > 0) {
      vatAmount = Number(((netAmount * vatRate) / 100).toFixed(2));
    }

    const totalAmount = Number((netAmount + vatAmount).toFixed(2));

    if (quantity > 0 && (unitPrice > 0 || netAmount > 0 || unit === "Kg")) {
      items.push({
        id: `${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
        productName: productName || `Fatura Kalemi (${quantity} ${unit})`,
        quantity,
        unit,
        unitPrice: Number(unitPrice.toFixed(2)),
        vatRate,
        vatAmount: Number(vatAmount.toFixed(2)),
        netAmount: Number(netAmount.toFixed(2)),
        totalAmount,
      });
    }
  }

  return items;
}

function parseInvoicePdfText(
  rawText: string,
  fileName: string,
  fileType: "pdf" | "image" = "pdf"
): ExtractedInvoiceDocument {
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
      /(?:Fatura\s*No|Fatura\s*Numaras[ıi]|Belge\s*No|Fiş\s*No)\s*[:.]?\s*([A-Z0-9\-/]{4,24})/i
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
      /\b(\d{2}[./\-]\d{2}[./\-]20\d{2}|20\d{2}[./\-]\d{2}[./\-]\d{2})\b/
    );
    if (anyDate) invoiceDate = normalizeDateString(anyDate[1]);
  }
  if (!invoiceDate) {
    invoiceDate = new Date().toISOString().slice(0, 10);
  }

  // 3. Extract Buyer starting with SAYIN (Fatura Alıcısı)
  const { buyerName: sayinBuyer, buyerTaxId } = extractSayinBuyer(lines, rawText);
  let buyerName = sayinBuyer;
  let sellerName = "";

  const sayinIdx = lines.findIndex((l) =>
    /\b(SAYIN|SAY[Iİ1]N|Say[ıi]n|ALICI)\b/i.test(l)
  );

  // Seller is usually before SAYIN in the header
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    if (sayinIdx !== -1 && i >= sayinIdx) break;
    const candidate = stripRightColumnMetadata(lines[i]);
    if (
      /(A\.?\s*Ş\.?|LTD\.?|ŞTİ\.?|SAN\.?|TİC\.?|PAZARLAMA|GIDA|İNŞAAT|TEKSTİL|LOJİSTİK|OTOMOTİV|BİLİŞİM|TARIM|HAYVANCILIK|ET\b)/i.test(
        candidate
      )
    ) {
      sellerName = candidate;
      break;
    }
  }

  if (!buyerName) {
    const companyLines = lines
      .map((l) => stripRightColumnMetadata(l))
      .filter((l) =>
        /(KURUMU|BAKANLIĞI|MÜDÜRLÜĞÜ|BELEDİYESİ|VAKFI|DERNEĞİ|ÜNİVERSİTESİ|BAŞKANLIĞI|A\.?\s*Ş\.?|LTD\.?|ŞTİ\.?|SAN\.?|TİC\.?)/i.test(
          l
        )
      );
    if (companyLines.length >= 2) {
      sellerName = sellerName || companyLines[0];
      buyerName = companyLines[1];
    } else if (companyLines.length === 1) {
      buyerName = companyLines[0];
    } else {
      buyerName = "Belirtilmemiş Alıcı (SAYIN Bulunamadı)";
    }
  }

  // 4. Extract Line Items (prioritizing KG quantities)
  const items = extractKgAndStandardLineItems(lines);

  const subtotalMatch = rawText.match(
    /(?:Mal\s*Hizmet\s*Toplam\s*Tutar[ıi]|Ara\s*Toplam|Matrah)\s*[:.]?\s*([\d.,]+)\s*(?:TL|₺|₺)?/i
  );
  const vatTotalMatch = rawText.match(
    /(?:Hesaplanan\s*KDV|Toplam\s*KDV|KDV\s*Tutar[ıi])\s*(?:\([^)]*\))?\s*[:.]?\s*([\d.,]+)\s*(?:TL|₺|₺)?/i
  );
  const grandTotalMatch = rawText.match(
    /(?:Ödenecek\s*Tutar|Odenecek\s*Tutar|Vergiler\s*Dahil\s*Toplam\s*Tutar|Genel\s*Toplam)\s*[:.]?\s*([\d.,]+)\s*(?:TL|₺|₺)?/i
  );

  const pdfSubtotal = subtotalMatch ? parseFlexibleNumber(subtotalMatch[1]) : 0;
  const pdfVatTotal = vatTotalMatch ? parseFlexibleNumber(vatTotalMatch[1]) : 0;
  const pdfGrandTotal = grandTotalMatch ? parseFlexibleNumber(grandTotalMatch[1]) : 0;

  // Also check if there is a standalone KG mention in rawText if row matcher didn't catch a structured line
  if (items.length === 0) {
    const standaloneKgMatch = rawText.match(
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?)\s*(?:KG|Kg|kg|KGM|Kilogram)\b/
    );
    const detectedKg = standaloneKgMatch
      ? parseFlexibleNumber(standaloneKgMatch[1])
      : 1;

    const net =
      pdfSubtotal ||
      (pdfGrandTotal > 0 && pdfVatTotal > 0
        ? pdfGrandTotal - pdfVatTotal
        : pdfGrandTotal);
    const vat = pdfVatTotal || 0;
    const total = pdfGrandTotal || net + vat;
    const inferredRate = net > 0 && vat > 0 ? Math.round((vat / net) * 100) : 1;
    const calcUnitPrice =
      detectedKg > 0 && net > 0 ? Number((net / detectedKg).toFixed(2)) : Number(net.toFixed(2));

    items.push({
      id: `${Date.now()}-0`,
      productName:
        fileType === "image"
          ? "Fatura Kalemi (Görselden Okundu)"
          : "Fatura Genel Kalemi (PDF'den Aktarıldı)",
      quantity: detectedKg || 1,
      unit: "Kg",
      unitPrice: calcUnitPrice,
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
    fileType,
    buyerName,
    buyerTaxId,
    sellerName,
    invoiceDate,
    invoiceNo,
    currency: "₺",
    items,
    subtotalAmount: Number((computedSubtotal || pdfSubtotal).toFixed(2)),
    totalVatAmount: Number((computedVat || pdfVatTotal).toFixed(2)),
    grandTotalAmount: Number((computedGrand || pdfGrandTotal).toFixed(2)),
    rawTextSnippet: lines.slice(0, 45).join("\n"),
    parseNote:
      fileType === "image"
        ? "Fotoğraf OCR ile okundu (SAYIN alıcı ve KG miktarlar ayrıştırıldı)."
        : "PDF fatura metni ayrıştırıldı (SAYIN alıcı ve KG miktarlar ayrıştırıldı).",
    needsClientOcr: lines.length === 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { rawText = "", fileName = "belge.txt", fileType = "pdf" } = body;
      if (fileType === "xml") {
        return NextResponse.json({
          documents: [parseInvoiceXml(rawText, fileName)],
          errors: [],
        });
      }
      return NextResponse.json({
        documents: [parseInvoicePdfText(rawText, fileName, fileType)],
        errors: [],
      });
    }

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
          const doc = parseInvoicePdfText(rawText, file.name, "pdf");
          documents.push(doc);
        } else {
          errors.push({
            fileName: file.name,
            message:
              "Desteklenmeyen dosya formatı (Sadece XML, PDF ve Fotoğraf kabul edilir).",
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
