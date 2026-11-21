export type ContactType = "customer" | "supplier" | "both" | "other";

export type CompanyEntityType = "individual" | "limited" | "incorporated" | "other";

export type CariCurrency = "TRY" | "USD" | "EUR";

export type AccountTransactionType =
  | "opening"
  | "purchase_invoice"
  | "sales_invoice"
  | "collection"
  | "payment"
  | "debit_note"
  | "credit_note"
  | "return"
  | "discount"
  | "transfer"
  | "offset"
  | "other";

export type PaymentMethodType =
  | "cash"
  | "bank_transfer"
  | "credit_card"
  | "check"
  | "promissory_note"
  | "other";

export type ReconciliationWorkflowStatus =
  | "preparing"
  | "sent"
  | "approved"
  | "rejected"
  | "difference_reported"
  | "awaiting_reply";

export type CariPermissionKey =
  | "cari_view"
  | "cari_create"
  | "cari_edit"
  | "cari_deactivate"
  | "tx_view"
  | "tx_create"
  | "collect"
  | "pay"
  | "statement_export"
  | "reconciliation_create"
  | "reconciliation_approve"
  | "risk_edit"
  | "report_view";

export interface ContactCard {
  id: string;
  code: string;
  name: string;
  contact_type: ContactType;
  company_type: CompanyEntityType;
  tax_office?: string | null;
  tax_number?: string | null;
  authorized_person?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  country: string;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  currency: CariCurrency;
  payment_term_days: number;
  risk_limit: number;
  description?: string | null;
  category?: string | null;
  tags: string[];
  is_active: boolean;
  external_source?: string | null;
  external_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountTransaction {
  id: string;
  contact_id: string;
  transaction_date: string;
  document_date?: string | null;
  due_date?: string | null;
  document_no?: string | null;
  transaction_type: AccountTransactionType;
  description: string;
  debit: number;
  credit: number;
  currency: CariCurrency;
  exchange_rate: number;
  tl_debit: number;
  tl_credit: number;
  related_doc_type?: string | null;
  related_doc_id?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  is_cancelled: boolean;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  reversed_transaction_id?: string | null;
  idempotency_key?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface LedgerRow extends AccountTransaction {
  runningBalance: number;
  runningDirection: "Borç" | "Alacak" | "Sıfır";
  isOverdue: boolean;
  overdueDays: number;
}

export interface CollectionPaymentRecord {
  id: string;
  contact_id: string;
  kind: "collection" | "payment";
  transaction_date: string;
  amount: number;
  currency: CariCurrency;
  exchange_rate: number;
  tl_amount: number;
  payment_method: PaymentMethodType;
  account_name?: string | null;
  reference_no?: string | null;
  description?: string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
  linked_transaction_id?: string | null;
  is_cancelled: boolean;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface ReconciliationRecord {
  id: string;
  contact_id: string;
  start_date: string;
  end_date: string;
  balance_date: string;
  system_amount: number;
  system_direction: "Borç" | "Alacak" | "Sıfır";
  counterparty_amount?: number | null;
  counterparty_direction?: "Borç" | "Alacak" | "Sıfır" | null;
  difference_amount: number;
  difference_note?: string | null;
  status: ReconciliationWorkflowStatus;
  shared_via?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactDocumentItem {
  id: string;
  contact_id: string;
  title: string;
  file_name: string;
  file_type?: string | null;
  file_url?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface ContactNoteItem {
  id: string;
  contact_id: string;
  note_type: "call" | "meeting" | "email" | "whatsapp" | "note";
  content: string;
  created_by?: string | null;
  created_at: string;
}

export interface CariAuditLogItem {
  id: string;
  contact_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: string | null;
  performed_by?: string | null;
  created_at: string;
}

export interface ContactBalanceSummary {
  contactId: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number; // positive = Borç, negative = Alacak
  absBalance: number;
  direction: "Borç" | "Alacak" | "Sıfır";
  lastTransactionDate: string | null;
  lastCollectionDate: string | null;
  lastPaymentDate: string | null;
  transactionCount: number;
}

export interface ContactAgingAndRiskSummary {
  notDue: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90Plus: number;
  overdueReceivable: number;
  overduePayable: number;
  riskLimit: number;
  currentRisk: number;
  availableRiskLimit: number;
  riskExceeded: boolean;
  avgCollectionDays: number;
  paymentPerformanceScore: number; // 0..100
}

export type PdfMatchCategory =
  | "exact"
  | "amount_diff"
  | "date_diff"
  | "doc_diff"
  | "desc_diff"
  | "only_external"
  | "only_internal";

export interface PdfExternalLine {
  id: string;
  date: string;
  documentNo: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  currency: CariCurrency;
}

export interface PdfComparisonMatchRow {
  id: string;
  category: PdfMatchCategory;
  internalTx?: AccountTransaction;
  externalLine?: PdfExternalLine;
  confidenceScore: number;
  note: string;
}

export interface PdfStatementComparisonReport {
  contactId: string;
  rows: PdfComparisonMatchRow[];
  exactCount: number;
  diffCount: number;
  onlyExternalCount: number;
  onlyInternalCount: number;
  internalDebitTotal: number;
  internalCreditTotal: number;
  externalDebitTotal: number;
  externalCreditTotal: number;
  closingBalanceDifference: number;
}

