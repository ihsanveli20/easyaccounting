-- ============================================================================
-- CARİ HESAP VE MÜŞTERİ / TEDARİKÇİ YÖNETİM MODÜLÜ (Supabase SQL)
-- ============================================================================
-- Mevcut customers, proposals, sales_records tablolarıyla çakışmaz.
-- Odoo ve harici muhasebe sistemleriyle entegrasyon için external_id alanları içerir.

-- 1. KASA, BANKA VE ÖDEME YÖNTEMLERİ
CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  iban TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 2. CARİ KATEGORİLERİ
CREATE TABLE IF NOT EXISTS public.contact_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT 'indigo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. CARİ KARTLARI (Müşteri / Tedarikçi / Her İkisi / Diğer)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'both', -- customer | supplier | both | other
  company_type TEXT NOT NULL DEFAULT 'limited', -- individual | limited | incorporated | other
  tax_office TEXT,
  tax_number TEXT,
  authorized_person TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  country TEXT NOT NULL DEFAULT 'Türkiye',
  city TEXT,
  district TEXT,
  address TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_term_days INTEGER NOT NULL DEFAULT 0,
  risk_limit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  external_source TEXT, -- örn: 'odoo', 'luca'
  external_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_code ON public.contacts (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_tax_number
  ON public.contacts (tax_number)
  WHERE tax_number IS NOT NULL AND length(trim(tax_number)) > 0;
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON public.contacts (contact_type);

-- 4. CARİ ADRESLER (Ek Fatura / Sevkiyat / Şube Adresleri)
CREATE TABLE IF NOT EXISTS public.contact_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  address_type TEXT NOT NULL DEFAULT 'shipping', -- billing | shipping | branch
  title TEXT NOT NULL,
  country TEXT DEFAULT 'Türkiye',
  city TEXT,
  district TEXT,
  full_address TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. CARİ HESAP HAREKETLERİ (Defter-i Kebir / Ledger)
-- Finansal hareketler iz bırakmadan silinmez; iptal ve ters kayıt kullanılır.
CREATE TABLE IF NOT EXISTS public.account_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  document_date DATE,
  due_date DATE,
  document_no TEXT,
  transaction_type TEXT NOT NULL, -- opening | purchase_invoice | sales_invoice | collection | payment | debit_note | credit_note | return | discount | transfer | offset | other
  description TEXT NOT NULL DEFAULT '',
  debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  exchange_rate NUMERIC(14, 6) NOT NULL DEFAULT 1,
  tl_debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tl_credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  related_doc_type TEXT,
  related_doc_id TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  reversed_transaction_id UUID REFERENCES public.account_transactions(id),
  idempotency_key TEXT UNIQUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_acc_tx_contact_date
  ON public.account_transactions (contact_id, transaction_date ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_acc_tx_due_date
  ON public.account_transactions (due_date);

-- 6. TAHSİLAT VE ÖDEME KAYITLARI
CREATE TABLE IF NOT EXISTS public.collections_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- collection (tahsilat) | payment (ödeme)
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  exchange_rate NUMERIC(14, 6) NOT NULL DEFAULT 1,
  tl_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL, -- cash | bank_transfer | credit_card | check | promissory_note | other
  account_name TEXT, -- Kasa veya Banka hesabı adı
  reference_no TEXT,
  description TEXT,
  attachment_name TEXT,
  attachment_url TEXT,
  linked_transaction_id UUID REFERENCES public.account_transactions(id),
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cp_ref_active
  ON public.collections_payments (contact_id, kind, reference_no)
  WHERE reference_no IS NOT NULL AND length(trim(reference_no)) > 0 AND is_cancelled = false;

-- 7. CARİ MUTABAKAT KAYITLARI VE EŞLEŞTİRME SONUÇLARI
CREATE TABLE IF NOT EXISTS public.reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  balance_date DATE NOT NULL,
  system_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  system_direction TEXT NOT NULL DEFAULT 'Borç', -- Borç | Alacak | Sıfır
  counterparty_amount NUMERIC(14, 2),
  counterparty_direction TEXT,
  difference_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  difference_note TEXT,
  status TEXT NOT NULL DEFAULT 'preparing', -- preparing | sent | approved | rejected | difference_reported | awaiting_reply
  shared_via TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES public.reconciliation_records(id) ON DELETE CASCADE,
  match_category TEXT NOT NULL, -- exact | amount_diff | date_diff | doc_diff | desc_diff | only_external | only_internal
  internal_tx_id UUID REFERENCES public.account_transactions(id) ON DELETE SET NULL,
  external_date TEXT,
  external_doc_no TEXT,
  external_desc TEXT,
  external_debit NUMERIC(14, 2) DEFAULT 0,
  external_credit NUMERIC(14, 2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. CARİ BELGELERİ VE GÖRÜŞME NOTLARI
CREATE TABLE IF NOT EXISTS public.contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'note', -- call | meeting | email | whatsapp | note
  content TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. DENETİM İZİ (AUDIT LOG)
CREATE TABLE IF NOT EXISTS public.cari_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  performed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- RLS POLİTİKALARI
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'cash_accounts', 'bank_accounts', 'payment_methods', 'contact_categories',
    'contacts', 'contact_addresses', 'account_transactions', 'collections_payments',
    'reconciliation_records', 'reconciliation_matches', 'contact_documents',
    'contact_notes', 'cari_audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all %s" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow all %s" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

