export type ReconciliationStatus =
  | "matched" // 🟢 Birebir Eşleşti
  | "missing_in_luca" // 🔴 Bizde Eksik (Firma Ekstresinde Var, Luca'da Yok)
  | "missing_in_external" // 🟡 Firmada Eksik (Luca'da Var, Firma Ekstresinde Yok)
  | "amount_mismatch"; // 🟠 Tutar Farkı (Belge no eşleşti fakat tutar uyuşmuyor)

export interface ExternalTransaction {
  id: string;
  date: string;
  year?: number;
  docNo?: string;
  type?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  sourceFile: string;
  page?: number;
}

export interface InternalTransaction {
  id: string;
  date: string;
  year?: number;
  docNo?: string;
  type?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  sourceFile?: string;
}

export interface ReconciliationPair {
  id: string;
  status: ReconciliationStatus;
  statusLabel: string;
  matchScore: number; // 0 to 100
  external?: ExternalTransaction;
  internal?: InternalTransaction;
  difference?: number; // Difference in amount if any
  note?: string;
}

export interface ReconciliationSummary {
  externalTotalDebit: number;
  externalTotalCredit: number;
  externalBalance: number;
  internalTotalDebit: number;
  internalTotalCredit: number;
  internalBalance: number;
  netDiscrepancy: number; // Mutabakat Farkı = externalBalance - internalBalance
  matchedCount: number;
  missingInLucaCount: number;
  missingInExternalCount: number;
  amountMismatchCount: number;
  totalItems: number;
  isFullyReconciled: boolean;
}
