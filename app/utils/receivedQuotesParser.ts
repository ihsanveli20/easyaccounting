import {
  ComparisonCellData,
  ComparisonMatrixRow,
  QuoteCurrency,
  QuoteFileType,
  ReceivedQuoteDocument,
  ReceivedQuoteItem,
} from "../types/receivedQuotes";

export function normalizeQuoteText(text: string): string {
  return (text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/İ/gi, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUnitLabel(unit?: string): string {
  const raw = normalizeQuoteText(unit || "adet");
  if (!raw) return "Adet";
  if (["ad", "adet", "adt", "pcs", "pc", "ea", "parca"].includes(raw)) return "Adet";
  if (["kg", "kilo", "kilogram", "kgs"].includes(raw)) return "Kg";
  if (["gr", "gram", "g"].includes(raw)) return "Gr";
  if (["ton", "mt", "t"].includes(raw)) return "Ton";
  if (["lt", "l", "litre", "liter"].includes(raw)) return "Lt";
  if (["m", "mt", "metre", "meter", "mtr"].includes(raw)) return "Metre";
  if (["m2", "metrekare"].includes(raw)) return "m²";
  if (["m3", "metrekup"].includes(raw)) return "m³";
  if (["kutu", "box", "pkt", "paket"].includes(raw)) return "Paket";
  if (["koli", "ctn"].includes(raw)) return "Koli";
  if (["set", "takim", "tkm"].includes(raw)) return "Takım";
  if (["saat", "hr", "hrs"].includes(raw)) return "Saat";
  if (["gun", "day"].includes(raw)) return "Gün";
  return unit?.trim() || "Adet";
}

/**
 * Parses numbers in both Turkish ("1.250,50") and International ("1,250.50") formats.
 */
export function parseFlexibleNumber(input: unknown): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input !== "string") return 0;

  let s = input
    .replace(/[₺$€£%\s]/g, "")
    .replace(/TL|TRY|USD|EUR/gi, "")
    .trim();

  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Turkish: 1.250,50
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,250.50
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Decide if comma is decimal or thousands separator
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = s.replace(",", ".");
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Could be 1,250 (thousands) or 1,250 (3-decimal unit price) -> treat 3 digits after comma with small integer as decimal only if needed; default decimal if <=3? Better: thousands if >= 1000 pattern and no decimal context, else decimal
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      // 1.250.000
      s = s.replace(/\./g, "");
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1 && parts[0] !== "0") {
      // Likely Turkish thousands separator like "1.250" -> 1250
      s = s.replace(/\./g, "");
    }
  }

  const parsed = Number.parseFloat(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function detectCurrency(text: string): QuoteCurrency {
  const upper = (text || "").toUpperCase();
  const usdHits = (upper.match(/USD|\$/g) || []).length;
  const eurHits = (upper.match(/EUR|€/g) || []).length;
  const tryHits = (upper.match(/TRY|₺|\bTL\b/g) || []).length;
  if (usdHits > eurHits && usdHits > tryHits) return "USD";
  if (eurHits > usdHits && eurHits > tryHits) return "EUR";
  return "TRY";
}

export function cleanSupplierFromFileName(fileName: string): string {
  return (fileName || "Tedarikçi Teklifi")
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(teklif|fiyat|proforma|quote|quotation|rev\d*|v\d+)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "Tedarikçi Teklifi";
}

export function recalculateQuoteTotals(
  doc: ReceivedQuoteDocument
): ReceivedQuoteDocument {
  let subtotal = 0;
  let vatTotal = 0;
  let grandTotal = 0;

  const updatedItems = (doc.items || []).map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const discount = Number(item.discountRate) || 0;
    const vatRate = Number(item.vatRate) || 0;
    const netUnit = price * (1 - discount / 100);
    const lineTotal =
      item.lineTotal > 0 && qty === 0 ? item.lineTotal : round2(qty * netUnit);
    const lineVat = round2(lineTotal * (vatRate / 100));
    const lineTotalWithVat = round2(lineTotal + lineVat);

    subtotal += lineTotal;
    vatTotal += lineVat;
    grandTotal += lineTotalWithVat;

    return {
      ...item,
      normalizedName: normalizeQuoteText(item.name),
      unit: normalizeUnitLabel(item.unit),
      lineTotal,
      lineTotalWithVat,
    };
  });

  if (updatedItems.length === 0) {
    return {
      ...doc,
      items: updatedItems,
    };
  }

  return {
    ...doc,
    items: updatedItems,
    subtotal: round2(subtotal),
    vatTotal: round2(vatTotal),
    grandTotal: round2(grandTotal),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const KNOWN_UNITS_REGEX =
  /^(adet|ad|adt|kg|kilo|gr|gram|ton|lt|l|litre|m|mt|metre|mtr|m2|m3|kutu|pkt|paket|koli|set|takim|takım|saat|gun|gün|pcs|pc|ea)$/i;

/**
 * Parses raw text (from PDF or Image OCR) into a structured ReceivedQuoteDocument payload.
 */
export function parseQuoteTextToDocument(
  rawText: string,
  fileName: string,
  fileType: QuoteFileType
): Omit<ReceivedQuoteDocument, "id" | "createdAt"> {
  const lines = (rawText || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const currency = detectCurrency(rawText);

  // 1. Extract metadata
  let supplierName = "";
  let quoteNo = "";
  let quoteDate = "";
  let validUntil = "";
  let paymentTerms = "";
  let deliveryTerms = "";
  let detectedGrandTotal = 0;
  let detectedSubtotal = 0;
  let detectedVatTotal = 0;

  for (let i = 0; i < Math.min(lines.length, 35); i++) {
    const line = lines[i];
    const lower = normalizeQuoteText(line);

    if (!supplierName) {
      const explicitSup = line.match(
        /(?:tedarikci|tedarikçi|firma|gonderen|gönderen|satici|satıcı|teklif veren)\s*[:\-]\s*(.+)/i
      );
      if (explicitSup && explicitSup[1]?.trim().length >= 3) {
        supplierName = explicitSup[1].trim();
      } else if (
        /(a\.ş\.|a\.s\.|ltd\.|şti\.|sti\.|san\.|tic\.|limited|anonim)/i.test(line) &&
        !/(sayin|sayın|alici|alıcı|musteri|müşteri)/i.test(lower) &&
        line.length <= 90
      ) {
        supplierName = line;
      }
    }

    if (!quoteNo) {
      const noMatch = line.match(
        /(?:teklif\s*no|belge\s*no|ref(?:erans)?\s*no|quote\s*no)\s*[:\-#]?\s*([A-Z0-9\-\/]{3,25})/i
      );
      if (noMatch) quoteNo = noMatch[1].trim();
    }

    if (!quoteDate) {
      const dateMatch = line.match(
        /(?:tarih|date|teklif tarihi)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i
      );
      if (dateMatch) quoteDate = dateMatch[1];
    }

    if (!validUntil) {
      const valMatch = line.match(
        /(?:gecerlilik|geçerlilik|opsiyon|son tarih|valid until)\s*[:\-]?\s*(.{3,40})/i
      );
      if (valMatch) validUntil = valMatch[1].trim();
    }

    if (!paymentTerms) {
      const payMatch = line.match(/(?:odeme|ödeme|vade)\s*(?:kosulu|koşulu|şekli|sekli)?\s*[:\-]\s*(.+)/i);
      if (payMatch) paymentTerms = payMatch[1].trim();
    }

    if (!deliveryTerms) {
      const delMatch = line.match(/(?:teslim|teslimat)\s*(?:süresi|suresi|şekli|sekli|yeri)?\s*[:\-]\s*(.+)/i);
      if (delMatch) deliveryTerms = delMatch[1].trim();
    }
  }

  if (!supplierName) {
    supplierName = cleanSupplierFromFileName(fileName);
  }

  // 2. Scan for summary totals
  for (const line of lines) {
    const lower = normalizeQuoteText(line);
    const numMatches = line.match(/(\d[\d.,]*)/g);
    const lastNum = numMatches ? parseFlexibleNumber(numMatches[numMatches.length - 1]) : 0;
    if (lastNum <= 0) continue;

    if (/(genel toplam|odenecek tutar|grand total|toplam tutar)/i.test(lower)) {
      detectedGrandTotal = lastNum;
    } else if (/(ara toplam|mal hizmet toplam|net toplam|subtotal)/i.test(lower)) {
      detectedSubtotal = lastNum;
    } else if (/kdv\s*(toplam|tutari|tutarı)?/i.test(lower) && !/haric|hariç|dahil/i.test(lower)) {
      detectedVatTotal = lastNum;
    }
  }

  // 3. Extract line items
  const items: ReceivedQuoteItem[] = [];
  const skipLineRegex =
    /^(ara toplam|genel toplam|toplam|kdv|iskonto|indirim|vergi|sayin|sayın|teklif|tarih|adres|tel|telefon|faks|eposta|e-posta|iban|banka|vade|odeme|ödeme|teslim|notlar|aciklama|açıklama|sıra|sira no|malzeme|ürün|urun|hizmet|birim fiyat)/i;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.length < 5) continue;
    const normLine = normalizeQuoteText(line);
    if (skipLineRegex.test(normLine)) continue;
    if (/(genel toplam|ara toplam|toplam kdv|banka hesap|iban\s*:)/i.test(normLine)) continue;

    // Strategy A: Tab/pipe or multi-space delimited columns
    const cols = line
      .split(/\t|\s*\|\s*|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);

    let parsedItem: ReceivedQuoteItem | null = null;

    if (cols.length >= 3) {
      parsedItem = tryParseColumnsToItem(cols, idx);
    }

    // Strategy B: Regex trailing numbers on single-space OCR/PDF lines
    // e.g. "12mm İnşaat Demiri 100 Kg 28,50 20 2.850,00" or "Laptop Dell 2 Adet 25.000,00 50.000,00"
    if (!parsedItem) {
      parsedItem = tryParseInlineTextToItem(line, idx);
    }

    if (parsedItem && parsedItem.name.length >= 2 && (parsedItem.unitPrice > 0 || parsedItem.lineTotal > 0)) {
      items.push(parsedItem);
    }
  }

  const subtotal =
    items.length > 0
      ? round2(items.reduce((acc, it) => acc + it.lineTotal, 0))
      : detectedSubtotal;
  const vatTotal =
    items.length > 0
      ? round2(items.reduce((acc, it) => acc + (it.lineTotalWithVat - it.lineTotal), 0))
      : detectedVatTotal;
  const grandTotal =
    items.length > 0
      ? round2(items.reduce((acc, it) => acc + it.lineTotalWithVat, 0))
      : detectedGrandTotal || round2(subtotal + vatTotal);

  return {
    fileName,
    fileType,
    supplierName,
    quoteNo: quoteNo || undefined,
    quoteDate: quoteDate || undefined,
    validUntil: validUntil || undefined,
    currency,
    paymentTerms: paymentTerms || undefined,
    deliveryTerms: deliveryTerms || undefined,
    subtotal,
    vatTotal,
    grandTotal,
    items,
    rawText,
    parseStatus: items.length > 0 ? "parsed" : "needs_review",
    parseNote:
      items.length > 0
        ? `${items.length} kalem otomatik ayrıştırıldı.`
        : "Kalemler tam ayrıştırılamadı; 'İncele / Düzenle' üzerinden ekleyebilir veya düzeltebilirsiniz.",
  };
}

function tryParseColumnsToItem(cols: string[], idx: number): ReceivedQuoteItem | null {
  // Remove leading row number like "1" or "1."
  const cleanedCols = [...cols];
  if (/^\d{1,3}[.)]?$/.test(cleanedCols[0]) && cleanedCols.length >= 4) {
    cleanedCols.shift();
  }

  // Find numeric columns from the right
  const numericIndices: number[] = [];
  let unit = "Adet";
  let unitIdx = -1;

  for (let i = 0; i < cleanedCols.length; i++) {
    const c = cleanedCols[i];
    if (KNOWN_UNITS_REGEX.test(normalizeQuoteText(c))) {
      unit = normalizeUnitLabel(c);
      unitIdx = i;
    } else if (/^[₺$€£%]?\s*\d[\d.,]*\s*(?:₺|TL|TRY|USD|EUR|%)?$/i.test(c)) {
      numericIndices.push(i);
    }
  }

  if (numericIndices.length < 2) return null;

  // Name is everything before first numeric/unit column
  const firstMetaIdx = Math.min(
    numericIndices[0],
    unitIdx !== -1 ? unitIdx : numericIndices[0]
  );
  const nameParts = cleanedCols.slice(0, Math.max(1, firstMetaIdx));
  const name = nameParts.join(" ").trim();
  if (!name || /^\d+$/.test(name)) return null;

  const nums = numericIndices.map((i) => ({
    raw: cleanedCols[i],
    val: parseFlexibleNumber(cleanedCols[i]),
    isPercent: cleanedCols[i].includes("%"),
  }));

  return buildItemFromTrailingTokens(name, unit, nums, idx);
}

function tryParseInlineTextToItem(line: string, idx: number): ReceivedQuoteItem | null {
  // Strip leading row index like "1) " or "1. "
  const stripped = line.replace(/^\s*\d{1,3}[.)]\s+/, "").trim();
  const tokens = stripped.split(/\s+/);
  if (tokens.length < 3) return null;

  // Walk backwards collecting numeric tokens & optional unit token
  const trailingNums: { raw: string; val: number; isPercent: boolean }[] = [];
  let unit = "Adet";
  let cutIndex = tokens.length;

  for (let i = tokens.length - 1; i >= 1; i--) {
    const tok = tokens[i];
    if (/^[₺$€£%]?\d[\d.,]*(?:[₺$€£%]|TL|TRY|USD|EUR)?$/i.test(tok)) {
      trailingNums.unshift({
        raw: tok,
        val: parseFlexibleNumber(tok),
        isPercent: tok.includes("%"),
      });
      cutIndex = i;
    } else if (KNOWN_UNITS_REGEX.test(normalizeQuoteText(tok)) && trailingNums.length >= 1) {
      unit = normalizeUnitLabel(tok);
      cutIndex = i;
    } else if (/^(TL|TRY|USD|EUR|₺|\$|€)$/i.test(tok) && trailingNums.length >= 1) {
      cutIndex = i;
    } else {
      break;
    }
  }

  if (trailingNums.length < 2) return null;

  const name = tokens.slice(0, cutIndex).join(" ").trim();
  if (!name || name.length < 2) return null;

  return buildItemFromTrailingTokens(name, unit, trailingNums, idx);
}

function buildItemFromTrailingTokens(
  name: string,
  unit: string,
  nums: { raw: string; val: number; isPercent: boolean }[],
  idx: number
): ReceivedQuoteItem | null {
  if (nums.length < 2) return null;

  let quantity = 1;
  let unitPrice = 0;
  let vatRate = 20;
  let lineTotal = 0;

  if (nums.length === 2) {
    // [qty, unitPrice] OR [unitPrice, total]
    const [a, b] = nums.map((n) => n.val);
    if (a > 0 && b > 0) {
      if (a <= 10000 && Number.isInteger(a) && b >= a) {
        quantity = a;
        unitPrice = b;
        lineTotal = round2(quantity * unitPrice);
      } else {
        quantity = 1;
        unitPrice = a;
        lineTotal = b;
      }
    }
  } else if (nums.length === 3) {
    // [qty, unitPrice, total] OR [qty, unitPrice, vat%]
    const [a, b, c] = nums;
    quantity = a.val > 0 ? a.val : 1;
    unitPrice = b.val;
    if (c.isPercent || [0, 1, 8, 10, 18, 20].includes(c.val)) {
      vatRate = c.val;
      lineTotal = round2(quantity * unitPrice);
    } else {
      lineTotal = c.val > 0 ? c.val : round2(quantity * unitPrice);
    }
  } else {
    // >= 4: [qty, unitPrice, vat%, total] or similar
    quantity = nums[0].val > 0 ? nums[0].val : 1;
    unitPrice = nums[1].val;
    const maybeVat = nums.find((n, i) => i >= 2 && i < nums.length - 1 && (n.isPercent || [0, 1, 8, 10, 18, 20].includes(n.val)));
    if (maybeVat) vatRate = maybeVat.val;
    lineTotal = nums[nums.length - 1].val || round2(quantity * unitPrice);
  }

  if (unitPrice <= 0 && lineTotal > 0 && quantity > 0) {
    unitPrice = round2(lineTotal / quantity);
  }
  if (lineTotal <= 0 && unitPrice > 0 && quantity > 0) {
    lineTotal = round2(quantity * unitPrice);
  }
  if (unitPrice <= 0 && lineTotal <= 0) return null;

  const lineTotalWithVat = round2(lineTotal * (1 + vatRate / 100));

  return {
    id: `rq-item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    normalizedName: normalizeQuoteText(name),
    quantity,
    unit,
    unitPrice: round2(unitPrice),
    vatRate,
    lineTotal: round2(lineTotal),
    lineTotalWithVat,
  };
}

/**
 * Computes Jaccard + substring token similarity between two normalized item names.
 */
function itemNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const tokensA = new Set(a.split(" ").filter((t) => t.length >= 2));
  const tokensB = new Set(b.split(" ").filter((t) => t.length >= 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Builds an item-by-item comparison matrix across all uploaded quotes.
 */
export function buildComparisonMatrix(
  quotes: ReceivedQuoteDocument[]
): ComparisonMatrixRow[] {
  const groups: {
    key: string;
    displayName: string;
    normalizedName: string;
    canonicalUnit: string;
    entries: { quote: ReceivedQuoteDocument; item: ReceivedQuoteItem }[];
  }[] = [];

  for (const quote of quotes) {
    for (const item of quote.items) {
      const norm = item.normalizedName || normalizeQuoteText(item.name);
      const unit = normalizeUnitLabel(item.unit);

      // Find best matching existing group that doesn't already have this quoteId
      let bestGroup: (typeof groups)[number] | null = null;
      let bestScore = 0;

      for (const g of groups) {
        if (g.entries.some((e) => e.quote.id === quote.id)) continue;
        const sim = itemNameSimilarity(norm, g.normalizedName);
        if (sim >= 0.55 && sim > bestScore) {
          bestScore = sim;
          bestGroup = g;
        }
      }

      if (bestGroup) {
        bestGroup.entries.push({ quote, item });
      } else {
        groups.push({
          key: `${norm}__${groups.length}`,
          displayName: item.name,
          normalizedName: norm,
          canonicalUnit: unit,
          entries: [{ quote, item }],
        });
      }
    }
  }

  return groups.map((g) => {
    const unitPrices = g.entries
      .map((e) => e.item.unitPrice)
      .filter((p) => p > 0);
    const lowestUnitPrice = unitPrices.length > 0 ? Math.min(...unitPrices) : 0;
    const highestUnitPrice = unitPrices.length > 0 ? Math.max(...unitPrices) : 0;
    const avgUnitPrice =
      unitPrices.length > 0
        ? round2(unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length)
        : 0;

    const cells: Record<string, ComparisonCellData> = {};
    let lowestQuoteId: string | undefined;
    let lowestSupplierName: string | undefined;

    for (const { quote, item } of g.entries) {
      const isLowest = lowestUnitPrice > 0 && item.unitPrice === lowestUnitPrice;
      const isHighest =
        unitPrices.length > 1 && highestUnitPrice > lowestUnitPrice && item.unitPrice === highestUnitPrice;
      const diffFromLowestPct =
        lowestUnitPrice > 0 && item.unitPrice > lowestUnitPrice
          ? round2(((item.unitPrice - lowestUnitPrice) / lowestUnitPrice) * 100)
          : 0;

      if (isLowest && !lowestQuoteId) {
        lowestQuoteId = quote.id;
        lowestSupplierName = quote.supplierName;
      }

      cells[quote.id] = {
        quoteId: quote.id,
        supplierName: quote.supplierName,
        item,
        effectiveUnitPrice: item.unitPrice,
        effectiveLineTotal: item.lineTotal,
        isLowestUnitPrice: isLowest,
        isHighestUnitPrice: isHighest,
        diffFromLowestPct,
      };
    }

    const spreadPct =
      lowestUnitPrice > 0 && highestUnitPrice > lowestUnitPrice
        ? round2(((highestUnitPrice - lowestUnitPrice) / lowestUnitPrice) * 100)
        : 0;

    return {
      key: g.key,
      displayName: g.displayName,
      canonicalUnit: g.canonicalUnit,
      cells,
      matchedQuoteCount: g.entries.length,
      lowestQuoteId,
      lowestSupplierName,
      lowestUnitPrice,
      highestUnitPrice,
      avgUnitPrice,
      spreadPct,
    };
  });
}

