export interface AccountRecord {
  id: string;
  code?: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
  raw?: Record<string, any>;
}

export interface ColumnMapping {
  codeCol: string;
  nameCol: string;
  debitCol: string;
  creditCol: string;
  balanceCol: string; // can be "__auto__"
}

export interface TransactionItem {
  id: string;
  date: string; // Formatted date e.g. "15.01.2026" or string
  docNo?: string; // Fiş/Evrak No
  invoiceNo?: string; // Fatura No (Örn: YLD2024000000649)
  type?: string; // İşlem Türü: Satış Faturası, Havale, Tahsilat vs.
  description: string; // Açıklama
  debit: number; // Borç
  credit: number; // Alacak
  balance: number; // Yürüyen bakiye
  raw?: Record<string, any>;
}

export interface CompanyDetail {
  id: string;
  code?: string;
  name: string;
  transactions: TransactionItem[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
  lastDate?: string;
  sourceFile?: string;
}

export interface DetailColumnMapping {
  companyCol: string; // Firma Adı sütunu
  codeCol: string; // Cari / Hesap Kodu sütunu (opsiyonel)
  dateCol: string; // Tarih sütunu
  docNoCol: string; // Fiş / Belge No sütunu
  typeCol: string; // İşlem / Hareket Türü sütunu
  descCol: string; // Açıklama sütunu
  debitCol: string; // Borç sütunu
  creditCol: string; // Alacak sütunu
  balanceCol: string; // Bakiye sütunu ("__auto__" destekli)
  autoSplitDescription?: boolean; // Açıklamadaki Tarih-FaturaNo-Açıklama formatını otomatik böl
}
