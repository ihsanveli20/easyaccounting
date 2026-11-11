export type InvoiceDirection = "incoming" | "outgoing";

export type ComparisonFileFormat = "xml" | "pdf" | "json";

export type ConfidenceTier = "high" | "medium" | "low";

export type MatchApprovalStatus =
  | "auto_matched"
  | "needs_approval"
  | "unmatched_review"
  | "user_approved"
  | "user_rejected"
  | "manual_mapped";

export type MatchDecisionOrigin =
  | "learned_rule"
  | "exact_or_normalized"
  | "description_extracted"
  | "semantic_nlp"
  | "manual"
  | "unmatched";

export type UnitFamily =
  | "mass"
  | "volume"
  | "count"
  | "package"
  | "length"
  | "area"
  | "other";

export interface NormalizedUnitMeasurement {
  rawUnit: string;
  standardizedUnit: string; // e.g., "KG", "LT", "ADET", "PAKET"
  unitFamily: UnitFamily;
  rawQuantity: number | null;
  packCount?: number | null; // e.g., 10 in "10 Adet x 500 Gram"
  perPackQuantity?: number | null; // e.g., 500
  perPackUnit?: string | null; // e.g., "GR"
  normalizedQuantity: number | null;
  normalizedBaseUnit: string; // "KG", "LT", "ADET", etc.
  conversionApplied: boolean;
  conversionExplanation?: string;
}

export interface ExtractedProductFeatures {
  effectiveName: string;
  detectedFromDescription: boolean;
  normalizedFullText: string;
  expandedAbbreviations: string[];
  tokens: string[];
  canonicalFamily: string; // e.g., "peynir", "fasulye", "zeytinyagi"
  varietyTokens: string[]; // Distinguishing varieties: ["ispir"], ["beyaz"], ["tam yagli"], ["kasar"]
  packagingTokens: string[]; // Packaging: ["fici"], ["teneke"], ["vakum"], ["paket"]
  brandTokens: string[];
}

export interface StandardInvoiceLine {
  id: string;
  invoiceId: string;
  direction: InvoiceDirection;
  lineNo: number;
  // Original fields MUST never be altered
  originalProductName: string;
  originalDescription: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  lineTotal: number | null; // net or line total as parsed
  lineGrandTotal: number | null; // with VAT
  // Enriched transient analysis fields
  features?: ExtractedProductFeatures;
  measurement?: NormalizedUnitMeasurement;
}

export interface StandardInvoiceDocument {
  id: string;
  direction: InvoiceDirection;
  fileName: string;
  fileFormat: ComparisonFileFormat;
  fileSizeBytes: number;
  invoiceNo: string;
  invoiceDate: string;
  sellerName: string;
  buyerName: string;
  currency: string;
  subtotalAmount: number | null;
  totalVatAmount: number | null;
  grandTotalAmount: number | null;
  items: StandardInvoiceLine[];
  parseWarnings: string[];
  needsClientOcr?: boolean;
}

export interface CentralProductCard {
  id: string;
  canonicalName: string;
  canonicalFamily: string;
  baseUnit: string;
  unitFamily: UnitFamily;
  varieties: string[];
  aliases: string[];
  createdBy: "auto" | "user";
  isSpecialVariety?: boolean;
}

export interface LineMatchAssignment {
  lineId: string;
  invoiceId: string;
  direction: InvoiceDirection;
  centralProductId: string | null;
  centralProductName: string;
  suggestedProductId?: string | null;
  suggestedProductName?: string | null;
  confidenceScore: number; // 0-100
  confidenceTier: ConfidenceTier;
  approvalStatus: MatchApprovalStatus;
  decisionOrigin: MatchDecisionOrigin;
  matchReason: string;
  conflictWarnings: string[];
  measurementNote?: string;
}

export interface LearnedMappingRule {
  id: string;
  signatureKey: string;
  sourceNameSample: string;
  sourceDescriptionSample: string;
  targetCentralProductId: string;
  targetCentralProductName: string;
  preferredBaseUnit?: string;
  unitMultiplier?: number;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export type ProductComparisonCategoryStatus =
  | "matched"
  | "needs_approval"
  | "unmatched"
  | "only_incoming"
  | "only_outgoing";

export interface ProductComparisonRow {
  centralProductId: string;
  productName: string;
  canonicalFamily: string;
  varieties: string[];
  baseUnit: string;
  unitFamily: UnitFamily;
  unitConflictWarning: boolean;
  unitBreakdownLabel: string;
  incomingQuantity: number;
  incomingAmount: number;
  incomingUnitPriceAvg: number | null;
  outgoingQuantity: number;
  outgoingAmount: number;
  outgoingUnitPriceAvg: number | null;
  quantityDifference: number; // incoming - outgoing
  amountDifference: number; // outgoing - incoming (or balance)
  confidenceScore: number;
  confidenceTier: ConfidenceTier;
  status: ProductComparisonCategoryStatus;
  incomingLines: StandardInvoiceLine[];
  outgoingLines: StandardInvoiceLine[];
  assignments: LineMatchAssignment[];
  reasonSummary: string[];
}

export interface ComparisonAnalysisSummary {
  incomingInvoiceCount: number;
  outgoingInvoiceCount: number;
  totalIncomingLines: number;
  totalOutgoingLines: number;
  matchedProductCount: number;
  unmatchedLineCount: number;
  needsReviewCount: number;
  onlyIncomingCount: number;
  onlyOutgoingCount: number;
  totalIncomingAmount: number;
  totalOutgoingAmount: number;
}

export interface ComparisonReportPayload {
  generatedAt: string;
  summary: ComparisonAnalysisSummary;
  centralProducts: CentralProductCard[];
  comparisonRows: ProductComparisonRow[];
  unmatchedLines: Array<{
    line: StandardInvoiceLine;
    invoice: StandardInvoiceDocument;
    assignment: LineMatchAssignment;
  }>;
  suspiciousAssignments: Array<{
    line: StandardInvoiceLine;
    invoice: StandardInvoiceDocument;
    assignment: LineMatchAssignment;
  }>;
}

