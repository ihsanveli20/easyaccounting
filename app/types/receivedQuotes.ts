export type QuoteFileType = "pdf" | "excel" | "image" | "manual";

export type QuoteCurrency = "TRY" | "USD" | "EUR";

export interface ReceivedQuoteItem {
  id: string;
  name: string;
  normalizedName: string;
  sku?: string;
  brand?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number; // e.g. 20, 10, 1, 0
  discountRate?: number;
  lineTotal: number; // Net line total (without VAT)
  lineTotalWithVat: number;
  notes?: string;
}

export interface ReceivedQuoteDocument {
  id: string;
  fileName: string;
  fileType: QuoteFileType;
  fileSize?: number;
  previewUrl?: string; // Object URL or data URL for image/PDF preview
  supplierName: string;
  quoteNo?: string;
  quoteDate?: string;
  validUntil?: string;
  currency: QuoteCurrency;
  paymentTerms?: string;
  deliveryTerms?: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  items: ReceivedQuoteItem[];
  rawText?: string;
  parseStatus: "parsed" | "needs_review" | "error";
  parseNote?: string;
  createdAt: string;
}

export interface ComparisonCellData {
  quoteId: string;
  supplierName: string;
  item: ReceivedQuoteItem;
  effectiveUnitPrice: number;
  effectiveLineTotal: number;
  isLowestUnitPrice: boolean;
  isHighestUnitPrice: boolean;
  diffFromLowestPct: number;
}

export interface ComparisonMatrixRow {
  key: string;
  displayName: string;
  canonicalUnit: string;
  cells: Record<string, ComparisonCellData>; // keyed by quoteId
  matchedQuoteCount: number;
  lowestQuoteId?: string;
  lowestSupplierName?: string;
  lowestUnitPrice?: number;
  highestUnitPrice?: number;
  avgUnitPrice?: number;
  spreadPct: number;
}

