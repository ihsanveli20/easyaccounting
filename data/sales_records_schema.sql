-- ============================================================================
-- SATIŞ KAYITLARI TABLOSU (Supabase)
-- ============================================================================
-- Bu SQL'i Supabase SQL Editor'de çalıştırarak "Satış Kayıtları" modülü için
-- gerekli tabloyu ve erişim politikalarını oluşturabilirsiniz.

CREATE TABLE IF NOT EXISTS public.sales_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Adet',
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sales_records_sale_date
  ON public.sales_records (sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_records_customer_name
  ON public.sales_records (customer_name);

CREATE INDEX IF NOT EXISTS idx_sales_records_product_name
  ON public.sales_records (product_name);

-- RLS Politikaları (Uygulama içi okuma/yazma/güncelleme/silme)
ALTER TABLE public.sales_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read sales_records" ON public.sales_records;
CREATE POLICY "Allow read sales_records"
  ON public.sales_records
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert sales_records" ON public.sales_records;
CREATE POLICY "Allow insert sales_records"
  ON public.sales_records
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update sales_records" ON public.sales_records;
CREATE POLICY "Allow update sales_records"
  ON public.sales_records
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete sales_records" ON public.sales_records;
CREATE POLICY "Allow delete sales_records"
  ON public.sales_records
  FOR DELETE
  USING (true);

