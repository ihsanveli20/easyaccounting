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

export interface ProductItem {
  id: string;
  code?: string; // Ürün Kodu / Stok Kodu (örn: URN-001)
  name: string; // Ürün / Malzeme Cinsi
  unit: string; // Birim (Adet, Ton, Kg, m², vb.)
  unitPrice: number; // Birim Fiyatı (₺)
  category?: string; // Kategori
  stockQuantity?: number; // Stok Miktarı
  updatedAt?: string; // Son Güncellenme Tarihi
}

export interface Customer {
  id: number;
  name: string;
  created_at?: string;
}

export interface SavedProposalItem {
  id: number;
  proposal_id: number;
  product_id: number | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at?: string;
  product?: {
    id: number;
    name: string;
    unit_of_measure?: string;
    internal_reference?: string;
    sale_price?: string | number;
  } | null;
}

export interface SavedProposal {
  id: number;
  customer_id: number | null;
  proposal_number: string;
  raw_proposal_number?: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  total_amount: number;
  created_at: string;
  customer?: { id: number; name: string } | null;
  items?: SavedProposalItem[];
  metadata?: {
    notes?: string;
    vatRate?: number;
    vatNote?: string;
    formTitle?: string;
    preparedBy?: string;
    quoteDate?: string;
    customerName?: string;
    customItems?: Array<{
      materialName: string;
      unit: string;
    }>;
  } | null;
}

export interface UserRole {
  id: number;
  name: "admin" | "sales" | "viewer" | "purchasing" | "user" | string;
  description?: string;
  created_at?: string;
}

export interface UserProfile {
  id: string; // uuid from auth.users
  email: string;
  full_name?: string;
  role_id: number;
  user_name?: string | null;
  created_at?: string;
  updated_at?: string;
  roles?: UserRole | null;
}

export type AppMenuId =
  | "summary"
  | "details"
  | "calculator"
  | "reconciliation"
  | "invoice-extractor"
  | "invoice-comparison"
  | "quote"
  | "proposal-history"
  | "proposal-comparison"
  | "stock-tracking"
  | "kurban-reporting"
  | "admin-users";

export * from "./kurban";

export interface MenuItemDefinition {
  id: AppMenuId;
  name: string;
  shortName: string;
  description: string;
  category: "accounting" | "sales" | "admin";
}

export interface RoleMenuPermissions {
  [roleName: string]: AppMenuId[];
}

export interface UserMenuPermissions {
  [userIdOrEmail: string]: {
    custom: boolean;
    allowedMenus: AppMenuId[];
  };
}

export interface AppPermissionsConfig {
  rolePermissions: RoleMenuPermissions;
  userPermissions: UserMenuPermissions;
}

export interface SupplierQuote {
  id: string;
  supplierName: string;
  productName: string;
  productCode?: string;
  unit: string;
  unitPrice: number; // Liste veya baz birim fiyat (₺)
  discountPercent?: number; // İskonto (%)
  vatRate?: number; // KDV (%) varsayılan 20
  vatIncluded?: boolean; // Fiyat KDV dahil mi?
  shippingCostPerUnit?: number; // Birim başına nakliye/lojistik maliyeti
  paymentTerm?: "cash" | "30_days" | "60_days" | "90_days" | "credit_card" | string; // Vade koşulu
  minOrderQuantity?: number; // Min sipariş miktarı
  leadTimeDays?: number; // Teslimat süresi (gün)
  notes?: string;
  sourceType: "supplier" | "market_web" | "factory" | "manual";
  sourceUrl?: string;
  updatedAt: string;
}

export interface MarketPriceResult {
  id: string;
  title: string;
  source: string; // e.g. "Akakçe", "Cimri", "Koçtaş Pro", "Hepsiburada"
  price: number;
  currency: string;
  unit?: string;
  url?: string;
  inStock?: boolean;
  shippingInfo?: string;
  lastUpdated: string;
}

