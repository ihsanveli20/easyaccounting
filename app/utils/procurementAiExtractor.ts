import {
  ProcurementCurrency,
  ProcurementNeedItem,
  ProcurementQuoteLineItem,
  ProcurementSupplierQuote,
  QuoteSourceType,
  ShippingMode,
} from "../types/procurement";
import {
  normalizeProcurementUnit,
  round2,
  suggestNeedMatch,
} from "./procurementEngine";
import {
  detectCurrency,
  parseFlexibleNumber,
  parseQuoteTextToDocument,
} from "./receivedQuotesParser";

export interface AiExtractionOutput {
  supplierName: string;
  quoteDate?: string;
  quoteNo?: string;
  currency: ProcurementCurrency;
  paymentTerms?: string;
  deliveryDuration?: string;
  validityPeriod?: string;
  shippingMode: ShippingMode;
  orderShippingAmount: number;
  shippingVatRate: number | null;
  shippingVatIncluded: boolean;
  vatIncluded: boolean;
  documentVatRate: number | null;
  items: Array<{
    rawProductName: string;
    description?: string;
    pricingMode: "unit" | "total";
    offeredQuantity: number | null;
    minOrderQuantity?: number | null;
    unit: string;
    unitPrice: number | null;
    lineTotal: number | null;
    discountRate: number;
    discountAmount: number;
    vatRate: number | null;
    vatIncluded: boolean;
  }>;
}

/**
 * Rule-based deterministic extractor for Turkish procurement quotes (WhatsApp text, PDFs, OCR).
 * Never fabricates missing fields: leaves unknown VAT rates or dates as null/undefined.
 */
export function extractStructuredQuoteFromText(
  rawText: string,
  fileName: string,
  needs: ProcurementNeedItem[]
): AiExtractionOutput {
  const text = rawText || "";
  const lower = text.toLocaleLowerCase("tr-TR");
  const currency = detectCurrency(text);

  // Explicit VAT inclusion detection (never guess if not stated)
  let vatIncluded = false;
  if (/\bkdv\s*dahil(?:dir)?\b/i.test(lower) && !/\bkdv\s*dahil\s*de[gğ]il/i.test(lower)) {
    vatIncluded = true;
  }

  // Explicit VAT rate detection (only if explicitly written in text, e.g. "%20 KDV" or "KDV %10")
  let documentVatRate: number | null = null;
  const vatRateMatch =
    text.match(/kdv\s*(?:oran[ıi])?\s*[:%]?\s*(\d{1,2})\s*%?/i) ||
    text.match(/%\s*(\d{1,2})\s*kdv/i);
  if (vatRateMatch) {
    const r = Number(vatRateMatch[1]);
    if ([0, 1, 8, 10, 18, 20].includes(r)) {
      documentVatRate = r;
    }
  }

  // Shipping detection (e.g. "nakliye 1.500 TL", "nakliye dahil", "nakliye ücretsiz")
  let shippingMode: ShippingMode = "per_order";
  let orderShippingAmount = 0;

  if (/\bnakliye\s*(?:[uü]cretsiz|bedelsiz|bizden)\b/i.test(lower)) {
    shippingMode = "free";
  } else if (/\bnakliye\s*dahil\b/i.test(lower)) {
    shippingMode = "included";
  } else {
    const shipMatch = text.match(
      /nakliye(?:\s*bedeli|\s*[uü]creti)?\s*[:=\-]?\s*[₺$€£]?\s*(\d[\d.,]*)\s*(?:₺|TL|TRY|USD|EUR|\$|€)?/i
    );
    if (shipMatch) {
      orderShippingAmount = parseFlexibleNumber(shipMatch[1]);
    }
  }

  // Payment, delivery, validity
  const deliveryMatch = text.match(
    /(?:teslim(?:at)?\s*(?:s[uü]resi)?)\s*[:\-]\s*([^\n.;]{2,50})/i
  );
  const validityMatch = text.match(
    /(?:ge[cç]erlilik|opsiyon)\s*(?:s[uü]resi)?\s*[:\-]\s*([^\n.;]{2,50})/i
  );

  // Base document parse via existing parser
  const parsedDoc = parseQuoteTextToDocument(text, fileName, "pdf");

  const items: AiExtractionOutput["items"] = [];

  for (const it of parsedDoc.items) {
    const normName = it.name.toLocaleLowerCase("tr-TR");
    // Skip shipping line items if we already captured them as orderShippingAmount
    if (/(nakliye|sevkiyat|kargo|ta[sş][ıi]ma)/i.test(normName)) {
      if (orderShippingAmount === 0) {
        orderShippingAmount = it.lineTotal > 0 ? it.lineTotal : it.unitPrice || 0;
        shippingMode = "per_order";
      }
      continue;
    }

    // Check if the text explicitly mentions "toplam" for this item
    const isTotalPriced =
      /\btoplam\b/i.test(normName) ||
      (it.quantity > 1 && it.lineTotal > 0 && it.unitPrice === round2(it.lineTotal / it.quantity));

    items.push({
      rawProductName: it.name,
      pricingMode: isTotalPriced && it.quantity > 1 && /\btoplam\b/i.test(lower) ? "total" : "unit",
      offeredQuantity: it.quantity > 0 ? it.quantity : null,
      minOrderQuantity: null,
      unit: normalizeProcurementUnit(it.unit),
      unitPrice: it.unitPrice > 0 ? it.unitPrice : null,
      lineTotal: it.lineTotal > 0 ? it.lineTotal : null,
      discountRate: it.discountRate || 0,
      discountAmount: 0,
      vatRate: documentVatRate,
      vatIncluded,
    });
  }

  // If no items were found by line parser, try matching against needs in short WhatsApp sentences
  // e.g. "Tuğla paleti 1.000 TL, nakliye 1.500 TL. Fiyatlara KDV dahil değildir."
  if (items.length === 0) {
    const segments = text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const seg of segments) {
      if (/(nakliye|kdv|teslim|ge[cç]erlilik|vade|[oö]deme)/i.test(seg)) continue;
      const m = seg.match(
        /^(.+?)\s*[:=\-]?\s*[₺$€£]?\s*(\d[\d.,]*)\s*(?:₺|TL|TRY|USD|EUR|\$|€)\b/i
      );
      if (m) {
        const rawName = m[1].trim();
        const price = parseFlexibleNumber(m[2]);
        if (rawName.length >= 2 && price > 0) {
          const matchRes = suggestNeedMatch(rawName, needs);
          const matchedNeed = needs.find((n) => n.id === (matchRes.matchedNeedId || matchRes.suggestedNeedId));
          const detectedUnit = /\bpalet/i.test(rawName)
            ? "Palet"
            : /\btorba/i.test(rawName)
              ? "Torba"
              : /\bton\b/i.test(rawName)
                ? "Ton"
                : matchedNeed?.unit || "Adet";
          items.push({
            rawProductName: rawName,
            pricingMode: "unit",
            offeredQuantity: 1,
            minOrderQuantity: null,
            unit: detectedUnit,
            unitPrice: price,
            lineTotal: price,
            discountRate: 0,
            discountAmount: 0,
            vatRate: documentVatRate,
            vatIncluded,
          });
        }
      }
    }
  }

  return {
    supplierName:
      parsedDoc.supplierName && parsedDoc.supplierName !== "Tedarikçi Teklifi"
        ? parsedDoc.supplierName
        : "",
    quoteDate: parsedDoc.quoteDate,
    quoteNo: parsedDoc.quoteNo,
    currency,
    paymentTerms: parsedDoc.paymentTerms,
    deliveryDuration: deliveryMatch?.[1]?.trim() || parsedDoc.deliveryTerms,
    validityPeriod: validityMatch?.[1]?.trim() || parsedDoc.validUntil,
    shippingMode,
    orderShippingAmount,
    shippingVatRate: documentVatRate,
    shippingVatIncluded: vatIncluded,
    vatIncluded,
    documentVatRate,
    items,
  };
}

/**
 * Converts an AiExtractionOutput into a draft ProcurementSupplierQuote with
 * match suggestions and explicit missing-field notes (approved = false until user confirms).
 */
export function buildDraftQuoteFromExtraction(
  extraction: AiExtractionOutput,
  options: {
    comparisonId: string;
    sourceType: QuoteSourceType;
    needs: ProcurementNeedItem[];
    rawText?: string;
    originalFileName?: string;
    originalFileMime?: string;
    originalFileDataUrl?: string;
    usedAi?: boolean;
  }
): ProcurementSupplierQuote {
  const notes: string[] = [];

  if (!extraction.supplierName) {
    notes.push("Firma adı teklifte bulunamadı; lütfen manuel girin.");
  }
  if (extraction.documentVatRate === null) {
    notes.push("KDV oranı metinde açıkça belirtilmemiş; lütfen her kalem için KDV oranını doğrulayın.");
  }
  if (extraction.items.length === 0) {
    notes.push("Teklif kalemi otomatik ayrıştırılamadı; orijinal belgeye bakarak kalem ekleyin.");
  }

  const items: ProcurementQuoteLineItem[] = extraction.items.map((it, idx) => {
    const match = suggestNeedMatch(it.rawProductName, options.needs);
    if (match.matchConfidence === "suggested") {
      const candidate = options.needs.find((n) => n.id === match.suggestedNeedId);
      notes.push(
        `"${it.rawProductName}" ürünü için "${candidate?.name}" eşleşmesi önerildi (onayınız bekleniyor).`
      );
    } else if (match.matchConfidence === "unmatched" && options.needs.length > 0) {
      notes.push(`"${it.rawProductName}" ürünü ihtiyaç listesiyle otomatik eşleşmedi.`);
    }

    return {
      id: `pqi-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      matchedNeedId: match.matchConfidence === "exact" ? match.matchedNeedId : null,
      matchConfidence: match.matchConfidence,
      suggestedNeedId: match.suggestedNeedId,
      suggestedScore: match.score,
      rawProductName: it.rawProductName,
      description: it.description,
      pricingMode: it.pricingMode,
      offeredQuantity: it.offeredQuantity,
      minOrderQuantity: it.minOrderQuantity ?? null,
      unit: normalizeProcurementUnit(it.unit),
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      discountRate: it.discountRate || 0,
      discountAmount: it.discountAmount || 0,
      itemShippingAmount: 0,
      vatRate: it.vatRate,
      vatIncluded: it.vatIncluded,
    };
  });

  if (options.usedAi) {
    notes.unshift("Yapay zekâ ile analiz edildi. Karşılaştırmaya dahil etmeden önce değerleri onaylayın.");
  }

  return {
    id: `pq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    comparisonId: options.comparisonId,
    supplierName: extraction.supplierName || "",
    quoteDate: extraction.quoteDate,
    quoteNo: extraction.quoteNo,
    currency: extraction.currency,
    paymentTerms: extraction.paymentTerms,
    deliveryDuration: extraction.deliveryDuration,
    validityPeriod: extraction.validityPeriod,
    sourceType: options.sourceType,
    originalFileName: options.originalFileName,
    originalFileMime: options.originalFileMime,
    originalFileDataUrl: options.originalFileDataUrl,
    rawText: options.rawText,
    shippingMode: extraction.shippingMode,
    orderShippingAmount: extraction.orderShippingAmount || 0,
    shippingVatRate: extraction.shippingVatRate,
    shippingVatIncluded: extraction.shippingVatIncluded,
    approved: false, // Rule 5.7: Must be approved by user before entering comparison!
    aiExtractionNotes: notes,
    items,
    createdAt: new Date().toISOString(),
  };
}

