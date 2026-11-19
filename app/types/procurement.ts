export type ProcurementCurrency = "TRY" | "USD" | "EUR";

export type ProcurementComparisonStatus =
  | "draft"
  | "collecting"
  | "compared"
  | "completed";

export type QuoteSourceType = "pdf" | "image" | "text" | "manual";

export type ShippingMode = "per_order" | "per_item" | "included" | "free";

export type PricingMode = "unit" | "total";

export type MatchConfidence = "exact" | "suggested" | "unmatched" | "confirmed";

export interface ProcurementNeedItem {
  id: string;
  name: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface ProcurementQuoteLineItem {
  id: string;
  matchedNeedId: string | null;
  matchConfidence: MatchConfidence;
  suggestedNeedId?: string | null;
  suggestedScore?: number;
  rawProductName: string;
  description?: string;
  pricingMode: PricingMode;
  offeredQuantity: number | null;
  minOrderQuantity?: number | null;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
  discountRate: number;
  discountAmount: number;
  itemShippingAmount: number;
  vatRate: number | null;
  vatIncluded: boolean;
}

export interface ProcurementSupplierQuote {
  id: string;
  comparisonId: string;
  supplierName: string;
  quoteDate?: string;
  quoteNo?: string;
  currency: ProcurementCurrency;
  paymentTerms?: string;
  deliveryDuration?: string;
  validityPeriod?: string;
  sourceType: QuoteSourceType;
  originalFileName?: string;
  originalFileMime?: string;
  originalFileDataUrl?: string;
  rawText?: string;
  shippingMode: ShippingMode;
  orderShippingAmount: number;
  shippingVatRate: number | null;
  shippingVatIncluded: boolean;
  approved: boolean;
  aiExtractionNotes: string[];
  items: ProcurementQuoteLineItem[];
  createdAt: string;
}

export interface ProcurementComparison {
  id: string;
  title: string;
  projectName: string;
  requestDate: string;
  description?: string;
  companyName?: string;
  status: ProcurementComparisonStatus;
  needs: ProcurementNeedItem[];
  quotes: ProcurementSupplierQuote[];
  createdAt: string;
  updatedAt: string;
}

export type NeedFulfillmentStatus = "full" | "partial" | "excess" | "missing";

export interface EvaluatedCellResult {
  needId: string;
  quoteId: string;
  supplierName: string;
  currency: ProcurementCurrency;
  hasOffer: boolean;
  fulfillmentStatus: NeedFulfillmentStatus;
  offeredQuantity: number;
  coveredQuantity: number;
  missingQuantity: number;
  minOrderQuantity: number | null;
  moqWarning: boolean;
  effectiveUnitPriceNet: number;
  productNetTotal: number;
  allocatedShippingNet: number;
  subtotalNet: number;
  vatRateUsed: number | null;
  missingVatRate: boolean;
  vatTotal: number;
  grandTotal: number;
  diffFromBestAmount: number;
  diffFromBestPct: number;
  savingsVsWorstAmount: number;
  savingsVsWorstPct: number;
  isBestForNeed: boolean;
}

export interface EvaluatedNeedComparison {
  need: ProcurementNeedItem;
  cells: Record<string, EvaluatedCellResult>; // keyed by quoteId
  bestQuoteId: string | null;
  bestSupplierName: string | null;
  bestGrandTotal: number;
  worstGrandTotal: number;
}

export interface EvaluatedSupplierTotal {
  quoteId: string;
  supplierName: string;
  currency: ProcurementCurrency;
  coveredNeedsCount: number;
  totalNeedsCount: number;
  fullyCoversAllNeeds: boolean;
  productNetTotal: number;
  shippingNetTotal: number;
  subtotalNet: number;
  vatTotal: number;
  grandTotal: number;
  hasMissingVat: boolean;
  diffFromBestAmount: number;
  diffFromBestPct: number;
  isBestOverall: boolean;
}

export interface SplitAllocationSlice {
  needId: string;
  needName: string;
  unit: string;
  quoteId: string;
  supplierName: string;
  allocatedQty: number;
  unitPriceNet: number;
  productNetTotal: number;
  shippingNetAllocated: number;
  vatTotal: number;
  grandTotal: number;
}

export interface SplitStrategySummary {
  possible: boolean;
  slices: SplitAllocationSlice[];
  totalGrandTotal: number;
  bestSingleSupplierTotal: number;
  savingsVsBestSingle: number;
  note: string;
}

export interface ComparisonEvaluationReport {
  comparisonId: string;
  approvedQuoteCount: number;
  totalQuoteCount: number;
  needCount: number;
  needComparisons: EvaluatedNeedComparison[];
  supplierTotals: EvaluatedSupplierTotal[];
  bestOverallQuoteId: string | null;
  bestOverallSupplierName: string | null;
  lowestGrandTotal: number;
  highestGrandTotal: number;
  potentialSavings: number;
  splitStrategy: SplitStrategySummary;
  warnings: string[];
}

