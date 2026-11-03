import { SupplierQuote, MarketPriceResult } from "../types/accounting";

const STORAGE_KEY = "easy_accounting_supplier_quotes_v1";

export const DEFAULT_SUPPLIER_QUOTES: SupplierQuote[] = [
  // 1. Karkas Tuğla 19*19*13,5
  {
    id: "sq-1",
    supplierName: "Kilsan Tuğla Fabrika Satış",
    productName: "19*19*13,5 KARKAS TUĞLA PALETLİ KİLSAN",
    productCode: "TUG-001",
    unit: "Adet",
    unitPrice: 9.8,
    discountPercent: 5,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 1.2,
    paymentTerm: "cash",
    minOrderQuantity: 1000,
    leadTimeDays: 2,
    notes: "Palet depozitosu hariçtir. Fabrika sahasından yükleme.",
    sourceType: "factory",
    sourceUrl: "https://www.kilsan.com.tr",
    updatedAt: "2026-11-02",
  },
  {
    id: "sq-2",
    supplierName: "Mar Yapı & Toptan Malzeme A.Ş.",
    productName: "19*19*13,5 KARKAS TUĞLA PALETLİ KİLSAN",
    productCode: "TUG-001",
    unit: "Adet",
    unitPrice: 11.4,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0,
    paymentTerm: "30_days",
    minOrderQuantity: 500,
    leadTimeDays: 1,
    notes: "Şantiye sahasına nakliye dahildir. Vinçli indirme.",
    sourceType: "supplier",
    updatedAt: "2026-11-01",
  },
  {
    id: "sq-3",
    supplierName: "Anadolu İnşaat Depoları",
    productName: "19*19*13,5 KARKAS TUĞLA PALETLİ KİLSAN",
    productCode: "TUG-001",
    unit: "Adet",
    unitPrice: 10.5,
    discountPercent: 2,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0.8,
    paymentTerm: "cash",
    minOrderQuantity: 800,
    leadTimeDays: 3,
    notes: "Nakit ödemede iskonto geçerlidir.",
    sourceType: "supplier",
    updatedAt: "2026-10-28",
  },

  // 2. Oyak Çimento 32.5 50KG
  {
    id: "sq-4",
    supplierName: "Oyak Çimento Bölge Dağıtım Bayisi",
    productName: "OYAK ÇİMENTO 32.5 50KG",
    productCode: "CIM-001",
    unit: "Adet",
    unitPrice: 152.0,
    discountPercent: 4,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 8.0,
    paymentTerm: "cash",
    minOrderQuantity: 50,
    leadTimeDays: 1,
    notes: "Nakit ödeme. Kamyon bazında sevk edilir.",
    sourceType: "supplier",
    updatedAt: "2026-11-02",
  },
  {
    id: "sq-5",
    supplierName: "Nuh Yapı & Çimento A.Ş.",
    productName: "OYAK ÇİMENTO 32.5 50KG",
    productCode: "CIM-001",
    unit: "Adet",
    unitPrice: 165.0,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0,
    paymentTerm: "60_days",
    minOrderQuantity: 40,
    leadTimeDays: 2,
    notes: "60 gün çekli vade imkanı. Nakliye fiyata dahildir.",
    sourceType: "supplier",
    updatedAt: "2026-10-30",
  },
  {
    id: "sq-6",
    supplierName: "Marmara Toptan Yapı Market",
    productName: "OYAK ÇİMENTO 32.5 50KG",
    productCode: "CIM-001",
    unit: "Adet",
    unitPrice: 149.0,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 12.0,
    paymentTerm: "cash",
    minOrderQuantity: 30,
    leadTimeDays: 1,
    notes: "Depo teslim peşin fiyat.",
    sourceType: "supplier",
    updatedAt: "2026-11-03",
  },

  // 3. Perdah Kum
  {
    id: "sq-7",
    supplierName: "Marmara Madencilik & Agrega A.Ş.",
    productName: "PERDAH KUM",
    productCode: "KUM-001",
    unit: "m³",
    unitPrice: 475.0,
    discountPercent: 5,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 60.0,
    paymentTerm: "cash",
    minOrderQuantity: 6,
    leadTimeDays: 1,
    notes: "En az 6m³ damperli kamyon sevkiyatı. Bekleme 2 saati aşarsa ilave ücret.",
    sourceType: "supplier",
    updatedAt: "2026-11-02",
  },
  {
    id: "sq-8",
    supplierName: "Boğaziçi Kum & Çakıl Ocağı",
    productName: "PERDAH KUM",
    productCode: "KUM-001",
    unit: "m³",
    unitPrice: 510.0,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0,
    paymentTerm: "30_days",
    minOrderQuantity: 10,
    leadTimeDays: 1,
    notes: "Nakliye dahil şantiye döküm.",
    sourceType: "supplier",
    updatedAt: "2026-10-29",
  },

  // 4. Tuğla 19*19*8,5
  {
    id: "sq-9",
    supplierName: "Kilsan Tuğla Fabrika Satış",
    productName: "19*19*8,5 KARKAS TUĞLA PALETLİ KİLSAN",
    productCode: "TUG-002",
    unit: "Adet",
    unitPrice: 7.9,
    discountPercent: 3,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 1.1,
    paymentTerm: "cash",
    minOrderQuantity: 1200,
    leadTimeDays: 2,
    notes: "Fabrika teslim.",
    sourceType: "factory",
    updatedAt: "2026-11-02",
  },
  {
    id: "sq-10",
    supplierName: "Mar Yapı & Toptan Malzeme A.Ş.",
    productName: "19*19*8,5 KARKAS TUĞLA PALETLİ KİLSAN",
    productCode: "TUG-002",
    unit: "Adet",
    unitPrice: 9.3,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0,
    paymentTerm: "30_days",
    minOrderQuantity: 600,
    leadTimeDays: 1,
    notes: "Nakliye dahil.",
    sourceType: "supplier",
    updatedAt: "2026-11-01",
  },

  // 5. 25*20*25 Tuğla
  {
    id: "sq-11",
    supplierName: "Kilsan Tuğla Fabrika Satış",
    productName: "25*20*25 TUĞLA",
    productCode: "TUG-003",
    unit: "Adet",
    unitPrice: 17.5,
    discountPercent: 5,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 1.8,
    paymentTerm: "cash",
    minOrderQuantity: 800,
    leadTimeDays: 2,
    notes: "Fabrika teslim.",
    sourceType: "factory",
    updatedAt: "2026-11-02",
  },
  {
    id: "sq-12",
    supplierName: "Anadolu İnşaat Depoları",
    productName: "25*20*25 TUĞLA",
    productCode: "TUG-003",
    unit: "Adet",
    unitPrice: 19.8,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0,
    paymentTerm: "30_days",
    minOrderQuantity: 400,
    leadTimeDays: 1,
    notes: "Nakliye fiyata dahildir.",
    sourceType: "supplier",
    updatedAt: "2026-10-31",
  },
];

/**
 * Calculates net effective unit cost considering discounts, shipping, and VAT
 */
export function calculateNetUnitCost(
  quote: SupplierQuote,
  options: {
    vatIncluded?: boolean;
    includeShipping?: boolean;
  } = {}
): number {
  const { vatIncluded = false, includeShipping = true } = options;

  let base = quote.unitPrice || 0;

  // Apply discount if any
  if (quote.discountPercent && quote.discountPercent > 0) {
    base = base * (1 - quote.discountPercent / 100);
  }

  // Add unit shipping if enabled
  if (includeShipping && quote.shippingCostPerUnit) {
    base += quote.shippingCostPerUnit;
  }

  // Handle VAT
  const rate = quote.vatRate !== undefined ? quote.vatRate : 20;
  if (vatIncluded && !quote.vatIncluded) {
    // Add VAT
    base = base * (1 + rate / 100);
  } else if (!vatIncluded && quote.vatIncluded) {
    // Strip VAT
    base = base / (1 + rate / 100);
  }

  return Math.round(base * 100) / 100;
}

/**
 * Get stored supplier quotes from localStorage with default fallbacks
 */
export function getStoredSupplierQuotes(): SupplierQuote[] {
  if (typeof window === "undefined") return DEFAULT_SUPPLIER_QUOTES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Could not read supplier quotes from localStorage:", err);
  }
  return DEFAULT_SUPPLIER_QUOTES;
}

/**
 * Save supplier quotes to localStorage
 */
export function saveStoredSupplierQuotes(quotes: SupplierQuote[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
  } catch (err) {
    console.warn("Could not save supplier quotes to localStorage:", err);
  }
}

/**
 * Normalizes string for fuzzy product matching
 */
export function normalizeProductText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[iİıI]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filter and find all matching quotes for a product
 */
export function findQuotesForProduct(
  searchQuery: string,
  quotes: SupplierQuote[]
): SupplierQuote[] {
  if (!searchQuery.trim()) return quotes;

  const normalizedQuery = normalizeProductText(searchQuery);
  const queryTokens = normalizedQuery.split(" ").filter((t) => t.length > 1);

  return quotes.filter((q) => {
    const normName = normalizeProductText(q.productName);
    const normCode = normalizeProductText(q.productCode || "");
    const normSupplier = normalizeProductText(q.supplierName);

    if (queryTokens.length === 0) return true;

    // Check if all tokens match or if exact substring matches
    if (normName.includes(normalizedQuery) || normSupplier.includes(normalizedQuery)) {
      return true;
    }

    // Match if at least 60% of tokens match
    const matchedTokens = queryTokens.filter(
      (t) => normName.includes(t) || normCode.includes(t) || normSupplier.includes(t)
    );
    return matchedTokens.length >= Math.ceil(queryTokens.length * 0.6);
  });
}
