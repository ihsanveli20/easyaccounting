import {
  ComparisonFileFormat,
  InvoiceDirection,
  StandardInvoiceDocument,
  StandardInvoiceLine,
} from "../types/invoiceComparison";

export const MAX_INVOICE_FILE_BYTES = 4 * 1024 * 1024; // 4 MB per file

const DANGEROUS_XML_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /<!DOCTYPE\b/i,
    reason: "XML dosyasında DOCTYPE bildirimi güvenlik nedeniyle engellendi (XXE koruması).",
  },
  {
    pattern: /<!ENTITY\b/i,
    reason: "XML dosyasında ENTITY tanımı güvenlik nedeniyle engellendi (XXE koruması).",
  },
  {
    pattern: /\b(?:SYSTEM|PUBLIC)\s+["'](?:file|http|https|ftp|php|expect|gopher):/i,
    reason: "XML dosyasında harici kaynak referansı (XXE) tespit edildi ve engellendi.",
  },
  {
    pattern: /<\s*script\b/i,
    reason: "Dosyada çalıştırılabilir script etiketi tespit edildi ve engellendi.",
  },
];

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function detectFileFormat(
  fileName: string,
  mimeType?: string
): ComparisonFileFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml") || (mimeType && mimeType.includes("xml"))) {
    return "xml";
  }
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    return "pdf";
  }
  if (lower.endsWith(".json") || (mimeType && mimeType.includes("json"))) {
    return "json";
  }
  return null;
}

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function getUtf8ByteLength(text: string): number {
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(text, "utf8");
  }
  if (textEncoder) {
    return textEncoder.encode(text).length;
  }
  return text.length * 2;
}

export function validateXmlSecurity(xmlText: string): { safe: boolean; error?: string } {
  if (!xmlText || !xmlText.trim()) {
    return { safe: false, error: "XML dosyası boş." };
  }
  if (getUtf8ByteLength(xmlText) > MAX_INVOICE_FILE_BYTES) {
    return { safe: false, error: "XML dosyası 4 MB sınırını aşıyor." };
  }
  for (const check of DANGEROUS_XML_PATTERNS) {
    if (check.pattern.test(xmlText)) {
      return { safe: false, error: check.reason };
    }
  }
  if (!xmlText.includes("<") || !xmlText.includes(">")) {
    return { safe: false, error: "Geçerli XML etiket yapısı bulunamadı." };
  }
  return { safe: true };
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 25) return null;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) continue;
      clean[key] = sanitizeJsonValue(val, depth + 1);
    }
    return clean;
  }
  return value;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .trim();
}

function extractXmlTagValue(xml: string, tagPattern: string): string {
  const regex = new RegExp(
    `<(?:[a-zA-Z0-9_]+:)?${tagPattern}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagPattern}>`,
    "i"
  );
  const match = xml.match(regex);
  return match ? decodeXmlEntities(match[1]) : "";
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

export function parseNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null;
  }
  const str = String(val).trim();
  if (!str) return null;
  let cleaned = str.replace(/[^\d.,\-]/g, "").trim();
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    cleaned = cleaned.replace(",", ".");
  } else if (lastDot > -1) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function standardizeRawUnit(codeOrText?: string | null): string {
  if (!codeOrText) return "";
  const raw = codeOrText.trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    C62: "Adet",
    NIU: "Adet",
    EA: "Adet",
    H87: "Adet",
    AD: "Adet",
    "AD.": "Adet",
    ADT: "Adet",
    ADET: "Adet",
    KGM: "Kg",
    KG: "Kg",
    "KG.": "Kg",
    KILO: "Kg",
    KİLO: "Kg",
    KILOGRAM: "Kg",
    KİLOGRAM: "Kg",
    GRM: "Gr",
    GR: "Gr",
    "GR.": "Gr",
    G: "Gr",
    GRAM: "Gr",
    TNE: "Ton",
    TON: "Ton",
    LTR: "Lt",
    LT: "Lt",
    "LT.": "Lt",
    LİTRE: "Lt",
    LITRE: "Lt",
    MLT: "Ml",
    ML: "Ml",
    BX: "Kutu",
    KT: "Kutu",
    KUTU: "Kutu",
    PK: "Paket",
    PA: "Paket",
    PKT: "Paket",
    PAKET: "Paket",
    CT: "Koli",
    KOLI: "Koli",
    KOLİ: "Koli",
    BG: "Torba",
    TORBA: "Torba",
    CS: "Kasa",
    KASA: "Kasa",
    MTR: "Mt",
    MT: "Mt",
    MTK: "m²",
    MTQ: "m³",
  };
  return map[upper] || raw;
}

function normalizeDateString(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const dmy = trimmed.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const ymd = trimmed.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  return trimmed;
}

let monotonicIdCounter = 0;

function makeId(prefix: string, seedIndex = 0): string {
  monotonicIdCounter = (monotonicIdCounter + 1) % 1000000000;
  return `${prefix}-${Date.now().toString(36)}-${monotonicIdCounter.toString(36)}-${seedIndex}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function parseXmlPartyName(partyBlock: string): string {
  if (!partyBlock) return "";
  const partyNameBlock = extractXmlTagValue(partyBlock, "PartyName");
  const name = extractXmlTagValue(partyNameBlock || partyBlock, "Name");
  if (name) return name;

  const personBlock = extractXmlTagValue(partyBlock, "Person");
  if (personBlock) {
    const first = extractXmlTagValue(personBlock, "FirstName");
    const middle = extractXmlTagValue(personBlock, "MiddleName");
    const last = extractXmlTagValue(personBlock, "FamilyName");
    return [first, middle, last].filter(Boolean).join(" ").trim();
  }
  return "";
}

/**
 * Parse XML invoice (UBL-TR or structured invoice XML).
 * Never mutates original product name / description; missing fields stay empty/null.
 */
export function parseInvoiceXmlSecure(
  xmlText: string,
  fileName: string,
  direction: InvoiceDirection,
  fileSizeBytes: number
): StandardInvoiceDocument {
  const sec = validateXmlSecurity(xmlText);
  if (!sec.safe) {
    throw new Error(sec.error || "Güvenlik doğrulaması başarısız.");
  }

  const strippedXml = xmlText
    .replace(
      /<(?:[a-zA-Z0-9_]+:)?AdditionalDocumentReference[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?AdditionalDocumentReference>/gi,
      ""
    )
    .replace(
      /<(?:[a-zA-Z0-9_]+:)?Signature[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?Signature>/gi,
      ""
    );

  const invoiceId = makeId("cmp-inv");
  const beforeSupplier =
    strippedXml.split(/<(?:[a-zA-Z0-9_]+:)?AccountingSupplierParty/i)[0] ||
    strippedXml;

  const invoiceNo =
    extractXmlTagValue(beforeSupplier, "ID") ||
    extractXmlTagValue(strippedXml, "InvoiceNumber") ||
    extractXmlTagValue(strippedXml, "FaturaNo") ||
    "";

  const invoiceDate = normalizeDateString(
    extractXmlTagValue(beforeSupplier, "IssueDate") ||
      extractXmlTagValue(strippedXml, "IssueDate") ||
      extractXmlTagValue(strippedXml, "FaturaTarihi") ||
      ""
  );

  const rawCurrency =
    extractXmlTagValue(beforeSupplier, "DocumentCurrencyCode") ||
    extractXmlTagValue(strippedXml, "Currency") ||
    "";
  const currency = rawCurrency === "TRL" || rawCurrency === "TRY" ? "₺" : rawCurrency || "₺";

  const supplierBlock =
    extractXmlTagValue(strippedXml, "AccountingSupplierParty") ||
    extractXmlTagValue(strippedXml, "SellerSupplierParty") ||
    extractXmlTagValue(strippedXml, "Supplier");
  const customerBlock =
    extractXmlTagValue(strippedXml, "AccountingCustomerParty") ||
    extractXmlTagValue(strippedXml, "BuyerCustomerParty") ||
    extractXmlTagValue(strippedXml, "Customer");

  const sellerName =
    parseXmlPartyName(supplierBlock) || extractXmlTagValue(strippedXml, "SellerName");
  const buyerName =
    parseXmlPartyName(customerBlock) || extractXmlTagValue(strippedXml, "BuyerName");

  const lineBlocks = extractAllXmlBlocks(strippedXml, "(?:InvoiceLine|Line|ItemLine|Kalem)");
  const items: StandardInvoiceLine[] = [];

  lineBlocks.forEach((lineXml, idx) => {
    const itemBlock = extractXmlTagValue(lineXml, "Item");
    const originalProductName =
      extractXmlTagValue(itemBlock || lineXml, "Name") ||
      extractXmlTagValue(lineXml, "ProductName") ||
      extractXmlTagValue(lineXml, "UrunAdi") ||
      "";
    const descParts = [
      extractXmlTagValue(itemBlock || lineXml, "Description"),
      extractXmlTagValue(lineXml, "Note"),
      extractXmlTagValue(itemBlock, "BrandName"),
      extractXmlTagValue(itemBlock, "ModelName"),
    ]
      .filter(Boolean)
      .filter((part, pIdx, arr) => arr.indexOf(part) === pIdx);
    const originalDescription = descParts.join(" | ");

    const qtyMatch = lineXml.match(
      /<(?:[a-zA-Z0-9_]+:)?(?:InvoicedQuantity|Quantity|Miktar)([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?(?:InvoicedQuantity|Quantity|Miktar)>/i
    );
    const qtyAttr = qtyMatch ? qtyMatch[1] : "";
    const unitCodeMatch = qtyAttr.match(/unitCode=["']([^"']+)["']/i);
    const xmlUnitTag =
      extractXmlTagValue(lineXml, "Unit") || extractXmlTagValue(lineXml, "Birim");
    const unit = standardizeRawUnit(unitCodeMatch ? unitCodeMatch[1] : xmlUnitTag);
    const quantity = qtyMatch ? parseNullableNumber(decodeXmlEntities(qtyMatch[2])) : null;

    const netAmount = parseNullableNumber(
      extractXmlTagValue(lineXml, "LineExtensionAmount") ||
        extractXmlTagValue(lineXml, "NetAmount") ||
        extractXmlTagValue(lineXml, "SatirToplami")
    );

    const priceBlock = extractXmlTagValue(lineXml, "Price");
    const unitPrice = parseNullableNumber(
      extractXmlTagValue(priceBlock || lineXml, "PriceAmount") ||
        extractXmlTagValue(lineXml, "UnitPrice") ||
        extractXmlTagValue(lineXml, "BirimFiyat")
    );

    const taxTotalBlock = extractXmlTagValue(lineXml, "TaxTotal");
    const taxSubtotalBlock = extractXmlTagValue(taxTotalBlock, "TaxSubtotal");
    const vatRate = parseNullableNumber(
      extractXmlTagValue(taxSubtotalBlock || taxTotalBlock || itemBlock || lineXml, "Percent") ||
        extractXmlTagValue(lineXml, "VatRate") ||
        extractXmlTagValue(lineXml, "KdvOrani")
    );
    const vatAmount = parseNullableNumber(
      extractXmlTagValue(taxTotalBlock || taxSubtotalBlock || lineXml, "TaxAmount") ||
        extractXmlTagValue(lineXml, "VatAmount") ||
        extractXmlTagValue(lineXml, "KdvTutari")
    );

    const lineGrandTotal =
      netAmount !== null && vatAmount !== null
        ? Number((netAmount + vatAmount).toFixed(2))
        : netAmount;

    items.push({
      id: makeId("cmp-line", idx),
      invoiceId,
      direction,
      lineNo: idx + 1,
      originalProductName,
      originalDescription,
      quantity,
      unit,
      unitPrice,
      vatRate,
      vatAmount,
      lineTotal: netAmount,
      lineGrandTotal,
    });
  });

  const monetaryBlock = extractXmlTagValue(strippedXml, "LegalMonetaryTotal");
  const subtotalAmount = parseNullableNumber(
    extractXmlTagValue(monetaryBlock, "TaxExclusiveAmount") ||
      extractXmlTagValue(monetaryBlock, "LineExtensionAmount")
  );
  const grandTotalAmount = parseNullableNumber(
    extractXmlTagValue(monetaryBlock, "PayableAmount") ||
      extractXmlTagValue(monetaryBlock, "TaxInclusiveAmount")
  );
  const withoutLines = strippedXml.replace(
    /<(?:[a-zA-Z0-9_]+:)?InvoiceLine[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?InvoiceLine>/gi,
    ""
  );
  const headerTaxBlock = extractXmlTagValue(withoutLines, "TaxTotal");
  const totalVatAmount = parseNullableNumber(
    extractXmlTagValue(headerTaxBlock, "TaxAmount")
  );

  const parseWarnings: string[] = [];
  if (items.length === 0) {
    parseWarnings.push("XML dosyasında InvoiceLine / kalem etiketi bulunamadı.");
  }

  return {
    id: invoiceId,
    direction,
    fileName,
    fileFormat: "xml",
    fileSizeBytes,
    invoiceNo,
    invoiceDate,
    sellerName,
    buyerName,
    currency,
    subtotalAmount,
    totalVatAmount,
    grandTotalAmount,
    items,
    parseWarnings,
  };
}

function pickJsonField(obj: Record<string, unknown>, keys: string[]): unknown {
  const lowerMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    lowerMap.set(k.toLocaleLowerCase("tr-TR").replace(/[_\s-]+/g, ""), v);
  }
  for (const key of keys) {
    const norm = key.toLocaleLowerCase("tr-TR").replace(/[_\s-]+/g, "");
    if (lowerMap.has(norm)) {
      const val = lowerMap.get(norm);
      if (val !== undefined && val !== null && val !== "") return val;
    }
  }
  return undefined;
}

function extractPartyNameFromJsonField(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const candidate = pickJsonField(obj, [
      "name",
      "unvan",
      "title",
      "firma",
      "companyName",
      "ad",
    ]);
    if (typeof candidate === "string") return candidate.trim();
  }
  return "";
}

function mapJsonInvoiceObject(
  rawObj: Record<string, unknown>,
  fileName: string,
  direction: InvoiceDirection,
  fileSizeBytes: number,
  docIndex: number
): StandardInvoiceDocument {
  const invoiceId = makeId("cmp-inv", docIndex);
  const invoiceNo = String(
    pickJsonField(rawObj, [
      "invoiceNo",
      "invoiceNumber",
      "faturaNo",
      "faturaNumarasi",
      "belgeNo",
      "id",
    ]) ?? ""
  ).trim();

  const invoiceDate = normalizeDateString(
    String(
      pickJsonField(rawObj, [
        "invoiceDate",
        "issueDate",
        "faturaTarihi",
        "duzenlemeTarihi",
        "date",
        "tarih",
      ]) ?? ""
    )
  );

  const sellerName =
    extractPartyNameFromJsonField(
      pickJsonField(rawObj, [
        "sellerName",
        "seller",
        "supplierName",
        "supplier",
        "saticiFirma",
        "satici",
        "duzenleyen",
      ])
    ) || "";

  const buyerName =
    extractPartyNameFromJsonField(
      pickJsonField(rawObj, [
        "buyerName",
        "buyer",
        "customerName",
        "customer",
        "aliciFirma",
        "alici",
        "musteri",
      ])
    ) || "";

  const rawCur = String(
    pickJsonField(rawObj, ["currency", "paraBirimi", "doviz"]) ?? "₺"
  ).trim();
  const currency = rawCur === "TRY" || rawCur === "TRL" || rawCur === "TL" ? "₺" : rawCur || "₺";

  const rawItemsCandidate = pickJsonField(rawObj, [
    "items",
    "lines",
    "invoiceLines",
    "kalemler",
    "urunler",
    "products",
    "satirlar",
  ]);
  const rawItems = Array.isArray(rawItemsCandidate) ? rawItemsCandidate : [];

  const items: StandardInvoiceLine[] = rawItems
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((itemObj, idx) => {
      const originalProductName = String(
        pickJsonField(itemObj, [
          "productName",
          "name",
          "urunAdi",
          "urun",
          "malHizmet",
          "title",
          "kalemAdi",
        ]) ?? ""
      ).trim();

      const originalDescription = String(
        pickJsonField(itemObj, [
          "description",
          "aciklama",
          "urunAciklamasi",
          "productDescription",
          "not",
          "note",
          "detay",
        ]) ?? ""
      ).trim();

      const quantity = parseNullableNumber(
        pickJsonField(itemObj, ["quantity", "miktar", "qty", "adet"])
      );
      const unit = standardizeRawUnit(
        String(
          pickJsonField(itemObj, ["unit", "birim", "olcuBirimi", "unitCode", "uom"]) ?? ""
        )
      );
      const unitPrice = parseNullableNumber(
        pickJsonField(itemObj, ["unitPrice", "birimFiyat", "price", "fiyat"])
      );
      const vatRate = parseNullableNumber(
        pickJsonField(itemObj, ["vatRate", "kdvOrani", "kdv", "taxRate"])
      );
      const vatAmount = parseNullableNumber(
        pickJsonField(itemObj, ["vatAmount", "kdvTutari", "taxAmount"])
      );
      const lineTotal = parseNullableNumber(
        pickJsonField(itemObj, [
          "lineTotal",
          "netAmount",
          "total",
          "satirToplami",
          "malHizmetTutari",
          "tutar",
          "totalAmount",
        ])
      );
      const lineGrandTotal =
        parseNullableNumber(
          pickJsonField(itemObj, ["lineGrandTotal", "grossTotal", "kdvDahilToplam"])
        ) ??
        (lineTotal !== null && vatAmount !== null
          ? Number((lineTotal + vatAmount).toFixed(2))
          : lineTotal);

      return {
        id: makeId("cmp-line", idx),
        invoiceId,
        direction,
        lineNo: idx + 1,
        originalProductName,
        originalDescription,
        quantity,
        unit,
        unitPrice,
        vatRate,
        vatAmount,
        lineTotal,
        lineGrandTotal,
      };
    });

  const subtotalAmount = parseNullableNumber(
    pickJsonField(rawObj, ["subtotalAmount", "subtotal", "araToplam", "matrah"])
  );
  const totalVatAmount = parseNullableNumber(
    pickJsonField(rawObj, ["totalVatAmount", "vatTotal", "toplamKdv", "kdvToplam"])
  );
  const grandTotalAmount = parseNullableNumber(
    pickJsonField(rawObj, [
      "grandTotalAmount",
      "grandTotal",
      "genelToplam",
      "payableAmount",
      "odenecekTutar",
      "totalAmount",
    ])
  );

  const parseWarnings: string[] = [];
  if (items.length === 0) {
    parseWarnings.push("JSON faturasında ürün kalemi dizisi bulunamadı.");
  }

  return {
    id: invoiceId,
    direction,
    fileName,
    fileFormat: "json",
    fileSizeBytes,
    invoiceNo,
    invoiceDate,
    sellerName,
    buyerName,
    currency,
    subtotalAmount,
    totalVatAmount,
    grandTotalAmount,
    items,
    parseWarnings,
  };
}

/**
 * Parse JSON file supporting single invoice, invoice array, or wrapper objects.
 */
export function parseInvoiceJsonSecure(
  jsonText: string,
  fileName: string,
  direction: InvoiceDirection,
  fileSizeBytes: number
): StandardInvoiceDocument[] {
  if (!jsonText || !jsonText.trim()) {
    throw new Error("JSON dosyası boş.");
  }
  if (getUtf8ByteLength(jsonText) > MAX_INVOICE_FILE_BYTES) {
    throw new Error("JSON dosyası 4 MB sınırını aşıyor.");
  }

  const parsedRaw = JSON.parse(jsonText);
  const sanitized = sanitizeJsonValue(parsedRaw);

  let invoiceObjects: Record<string, unknown>[] = [];
  if (Array.isArray(sanitized)) {
    invoiceObjects = sanitized.filter(
      (x): x is Record<string, unknown> => Boolean(x && typeof x === "object")
    );
  } else if (sanitized && typeof sanitized === "object") {
    const obj = sanitized as Record<string, unknown>;
    const listCandidate = pickJsonField(obj, [
      "invoices",
      "faturalar",
      "documents",
      "data",
    ]);
    if (Array.isArray(listCandidate)) {
      invoiceObjects = listCandidate.filter(
        (x): x is Record<string, unknown> => Boolean(x && typeof x === "object")
      );
    } else {
      invoiceObjects = [obj];
    }
  }

  if (invoiceObjects.length === 0) {
    throw new Error("JSON dosyasında geçerli fatura nesnesi bulunamadı.");
  }

  return invoiceObjects.map((obj, idx) =>
    mapJsonInvoiceObject(obj, fileName, direction, fileSizeBytes, idx)
  );
}

function stripRightColumnMetadata(line: string): string {
  return line
    .replace(
      /\b(?:Özelleştirme\s*No|Ozellestirme\s*No|Senaryo|Fatura\s*Tipi|Fatura\s*No|Fatura\s*Numaras[ıi]|Fatura\s*Tarihi|Düzenleme\s*Tarihi|Duzenleme\s*Tarihi|Düzenleme\s*Zaman[ıi]|İrsaliye\s*No|Irsaliye\s*No|İrsaliye\s*Tarihi|Sipariş\s*No|Siparis\s*No|Sipariş\s*Tarihi|ETTN|e-Fatura|e-Arşiv\s*Fatura|E-FATURA|E-ARŞİV)\s*[:.]?.*$/i,
      ""
    )
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, "")
    .trim();
}

function extractSayinBuyer(lines: string[], rawText: string): string {
  const sayinIdx = lines.findIndex((l) =>
    /\b(SAYIN|SAY[Iİ1]N|Say[ıi]n|ALICI)\b/i.test(l)
  );

  if (sayinIdx !== -1) {
    const sayinLine = lines[sayinIdx];
    const afterMatch = sayinLine.match(
      /\b(?:SAYIN|SAY[Iİ1]N|Say[ıi]n|ALICI)\b\s*[:.\-]?\s*(.*)$/i
    );
    const sameLinePart = stripRightColumnMetadata(afterMatch ? afterMatch[1] : "");
    const parts: string[] = [];

    if (
      sameLinePart.length > 2 &&
      !/^(VKN|TCKN|VERGİ|VERGI|TEL|ADRES|WEB|E-POSTA)/i.test(sameLinePart)
    ) {
      parts.push(sameLinePart);
    }

    for (let i = sayinIdx + 1; i < Math.min(sayinIdx + 6, lines.length); i++) {
      const cleaned = stripRightColumnMetadata(lines[i]);
      if (!cleaned || cleaned.length < 2) continue;
      if (
        /^(VKN|TCKN|Vergi\s*Dairesi|Vergi\s*No|T\.?C\.?\s*Kimlik|Adres|Mah\.|Cad\.|Sok\.|No\s*:|Tel|Telefon|E-Posta|Web|Sıra\s*No|Sira\s*No|Mal\s*Hizmet|Açıklama|Miktar)/i.test(
          cleaned
        ) ||
        /\b\d+(?:[.,]\d+)?\s*(?:KG|GR|LT|ML|ADET|TON|PAKET|KOLİ)\b/i.test(cleaned) ||
        (/^\d{1,3}\s+/.test(cleaned) && /%|\d+[.,]\d{2}/.test(cleaned))
      ) {
        if (parts.length > 0) break;
        continue;
      }
      parts.push(cleaned);
      if (
        parts.length >= 2 ||
        /(A\.?\s*Ş\.?|LTD\.?|ŞTİ\.?|BELEDİYESİ|KURUMU|BAKANLIĞI)\s*$/i.test(cleaned)
      ) {
        break;
      }
    }

    const combined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (combined) return combined;
  }

  const fallback = rawText.match(
    /\b(?:SAYIN|Say[ıi]n)\b\s*[:.\-]?\s*([^\r\n]+)/i
  );
  return fallback ? stripRightColumnMetadata(fallback[1]) : "";
}

/**
 * Parse text extracted from PDF / OCR without fabricating missing values.
 */
export function parseInvoicePdfText(
  rawText: string,
  fileName: string,
  direction: InvoiceDirection,
  fileSizeBytes: number
): StandardInvoiceDocument {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const invoiceId = makeId("cmp-inv");

  let invoiceNo = "";
  const gibMatch = rawText.match(/\b([A-Z0-9]{3}20\d{11})\b/);
  if (gibMatch) {
    invoiceNo = gibMatch[1];
  } else {
    const fnMatch = rawText.match(
      /(?:Fatura\s*No|Fatura\s*Numaras[ıi]|Belge\s*No)\s*[:.]?\s*([A-Z0-9\-/]{4,24})/i
    );
    if (fnMatch) invoiceNo = fnMatch[1].trim();
  }

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

  const buyerName = extractSayinBuyer(lines, rawText);
  let sellerName = "";
  const sayinIdx = lines.findIndex((l) =>
    /\b(SAYIN|SAY[Iİ1]N|Say[ıi]n|ALICI)\b/i.test(l)
  );
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    if (sayinIdx !== -1 && i >= sayinIdx) break;
    const candidate = stripRightColumnMetadata(lines[i]);
    if (
      /(A\.?\s*Ş\.?|LTD\.?|ŞTİ\.?|SAN\.?|TİC\.?|PAZARLAMA|GIDA|İNŞAAT|TARIM|HAYVANCILIK|MARKET|ET\b)/i.test(
        candidate
      )
    ) {
      sellerName = candidate;
      break;
    }
  }

  const unitRegex =
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?)\s*(KG|Kg|kg|KGM|Kilogram|KİLOGRAM|GR|Gr|gr|GRM|Gram|GRAM|G\b|TON|Ton|LT|Lt|lt|LTR|Litre|LİTRE|ML|Ml|ml|Adet|ADET|C62|NIU|Koli|KOLİ|Paket|PAKET|Kutu|KUTU|Torba|TORBA|Kasa|KASA|Mt|MT)\b/;

  const items: StandardInvoiceLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /^(Mal\s*Hizmet\s*Toplam|Toplam\s*İskonto|Toplam\s*Iskonto|Hesaplanan\s*KDV|Vergiler\s*Dahil|Ödenecek\s*Tutar|Odenecek\s*Tutar|Genel\s*Toplam|Ara\s*Toplam|Yalnız|Yalniz|Not\s*:|IBAN|TR\d{2}|Sıra\s*No|Sira\s*No\s*Mal)/i.test(
        line
      )
    ) {
      continue;
    }

    const qtyUnitMatch = line.match(unitRegex);
    if (!qtyUnitMatch || qtyUnitMatch.index === undefined) continue;

    const quantity = parseNullableNumber(qtyUnitMatch[1]);
    if (quantity === null || quantity <= 0) continue;

    const unit = standardizeRawUnit(qtyUnitMatch[2]);
    const beforeQty = line.slice(0, qtyUnitMatch.index).trim();
    const afterQty = line.slice(qtyUnitMatch.index + qtyUnitMatch[0].length).trim();

    const originalProductName = beforeQty
      .replace(/^\s*\d{1,3}\s+/, "")
      .replace(/^[|\-–—:\s]+/, "")
      .replace(/[|\-–—:\s]+$/, "")
      .trim();

    let originalDescription = "";
    // Check if description is explicitly annotated after "Açıklama:" or in next line
    const descInlineMatch = line.match(/(?:Açıklama|Aciklama)\s*[:\-]\s*(.+)$/i);
    if (descInlineMatch) {
      originalDescription = descInlineMatch[1].trim();
    } else if (i + 1 < lines.length && !unitRegex.test(lines[i + 1])) {
      const nextLine = lines[i + 1];
      if (
        nextLine.length >= 3 &&
        nextLine.length <= 160 &&
        !/^(Mal\s*Hizmet\s*Toplam|Toplam|Hesaplanan\s*KDV|Vergiler|Ödenecek|Genel\s*Toplam|Yalnız|IBAN|Açıklama\s*ve|Notlar)/i.test(
          nextLine
        ) &&
        !/^[\d.,\s₺TL%]+$/.test(nextLine)
      ) {
        if (/^(?:Açıklama|Aciklama)\s*[:\-]/i.test(nextLine)) {
          originalDescription = nextLine.replace(/^(?:Açıklama|Aciklama)\s*[:\-]\s*/i, "").trim();
        } else if (!originalProductName) {
          originalDescription = nextLine;
        } else if (
          /\b(?:kg|gr|gram|lt|yağlı|yagli|beyaz|fıçı|ispir|vakum|ambalaj|marka|tip)\b/i.test(
            nextLine
          )
        ) {
          originalDescription = nextLine;
        }
      }
    }

    let vatRate: number | null = null;
    const vatRateExplicitMatch =
      afterQty.match(/%\s*(\d{1,2}(?:[.,]\d{1,2})?)/) ||
      afterQty.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if (vatRateExplicitMatch) {
      const rateVal = parseNullableNumber(vatRateExplicitMatch[1]);
      if (rateVal !== null && rateVal >= 0 && rateVal <= 100) {
        vatRate = rateVal;
      }
    }

    const afterWithoutPercent = afterQty
      .replace(/%\s*\d{1,2}(?:[.,]\d{1,2})?/g, " ")
      .replace(/\d{1,2}(?:[.,]\d{1,2})?\s*%/g, " ");

    const numberTokens =
      afterWithoutPercent.match(
        /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?/g
      ) || [];
    const parsedNums = numberTokens
      .map((t) => parseNullableNumber(t))
      .filter((n): n is number => n !== null && n >= 0);

    let unitPrice: number | null = null;
    let vatAmount: number | null = null;
    let lineTotal: number | null = null;

    if (parsedNums.length > 0) {
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
            lineTotal = candidateNet;
            matchedPair = true;
            if (vatRate !== null) {
              const expectedVat = (lineTotal * vatRate) / 100;
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
            }
            break;
          }
        }
        if (matchedPair) break;
      }

      if (!matchedPair) {
        const nonZeroNums = parsedNums.filter((n) => n > 0);
        if (nonZeroNums.length >= 2) {
          unitPrice = nonZeroNums[0];
          lineTotal = nonZeroNums[nonZeroNums.length - 1];
        } else if (nonZeroNums.length === 1) {
          lineTotal = nonZeroNums[0];
          if (quantity > 0) {
            unitPrice = Number((lineTotal / quantity).toFixed(4));
          }
        }
      }
    }

    if (vatAmount === null && lineTotal !== null && vatRate !== null) {
      vatAmount = Number(((lineTotal * vatRate) / 100).toFixed(2));
    }

    const lineGrandTotal =
      lineTotal !== null && vatAmount !== null
        ? Number((lineTotal + vatAmount).toFixed(2))
        : lineTotal;

    if (originalProductName || originalDescription || lineTotal !== null || unitPrice !== null) {
      items.push({
        id: makeId("cmp-line", items.length),
        invoiceId,
        direction,
        lineNo: items.length + 1,
        originalProductName,
        originalDescription,
        quantity,
        unit,
        unitPrice: unitPrice !== null ? Number(unitPrice.toFixed(4)) : null,
        vatRate,
        vatAmount: vatAmount !== null ? Number(vatAmount.toFixed(2)) : null,
        lineTotal: lineTotal !== null ? Number(lineTotal.toFixed(2)) : null,
        lineGrandTotal: lineGrandTotal !== null ? Number(lineGrandTotal.toFixed(2)) : null,
      });
    }
  }

  const subtotalMatch = rawText.match(
    /(?:Mal\s*Hizmet\s*Toplam\s*Tutar[ıi]|Ara\s*Toplam|Matrah)\s*[:.]?\s*([\d.,]+)/i
  );
  const vatTotalMatch = rawText.match(
    /(?:Hesaplanan\s*KDV|Toplam\s*KDV|KDV\s*Tutar[ıi])\s*(?:\([^)]*\))?\s*[:.]?\s*([\d.,]+)/i
  );
  const grandTotalMatch = rawText.match(
    /(?:Ödenecek\s*Tutar|Odenecek\s*Tutar|Vergiler\s*Dahil\s*Toplam\s*Tutar|Genel\s*Toplam)\s*[:.]?\s*([\d.,]+)/i
  );

  const subtotalAmount = subtotalMatch ? parseNullableNumber(subtotalMatch[1]) : null;
  const totalVatAmount = vatTotalMatch ? parseNullableNumber(vatTotalMatch[1]) : null;
  const grandTotalAmount = grandTotalMatch ? parseNullableNumber(grandTotalMatch[1]) : null;

  const parseWarnings: string[] = [];
  if (lines.length === 0) {
    parseWarnings.push("PDF metin katmanı boş — taranmış belge OCR işlemi gerekli.");
  } else if (items.length === 0) {
    parseWarnings.push("PDF içinde standart kalem satırı tespit edilemedi.");
  }

  return {
    id: invoiceId,
    direction,
    fileName,
    fileFormat: "pdf",
    fileSizeBytes,
    invoiceNo,
    invoiceDate,
    sellerName,
    buyerName,
    currency: "₺",
    subtotalAmount,
    totalVatAmount,
    grandTotalAmount,
    items,
    parseWarnings,
    needsClientOcr: lines.length === 0,
  };
}
