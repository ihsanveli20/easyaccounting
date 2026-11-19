-- ============================================================================
-- SATIN ALMA YÖNETİMİ - TEKLİF TOPLAMA VE KARŞILAŞTIRMA ŞEMASI (Supabase)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.procurement_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT '',
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  company_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.procurement_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES public.procurement_comparisons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Adet',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.procurement_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES public.procurement_comparisons(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  quote_date DATE,
  quote_no TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_terms TEXT,
  delivery_duration TEXT,
  validity_period TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  original_file_name TEXT,
  original_file_mime TEXT,
  original_file_url TEXT,
  raw_text TEXT,
  shipping_mode TEXT NOT NULL DEFAULT 'per_order',
  order_shipping_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  shipping_vat_rate NUMERIC(5, 2),
  shipping_vat_included BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.procurement_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.procurement_quotes(id) ON DELETE CASCADE,
  matched_need_id UUID REFERENCES public.procurement_needs(id) ON DELETE SET NULL,
  match_confidence TEXT NOT NULL DEFAULT 'unmatched',
  raw_product_name TEXT NOT NULL,
  description TEXT,
  pricing_mode TEXT NOT NULL DEFAULT 'unit',
  offered_quantity NUMERIC(14, 3),
  min_order_quantity NUMERIC(14, 3),
  unit TEXT NOT NULL DEFAULT 'Adet',
  unit_price NUMERIC(14, 2),
  line_total NUMERIC(14, 2),
  discount_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  item_shipping_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5, 2),
  vat_included BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_proc_needs_comp ON public.procurement_needs (comparison_id);
CREATE INDEX IF NOT EXISTS idx_proc_quotes_comp ON public.procurement_quotes (comparison_id);
CREATE INDEX IF NOT EXISTS idx_proc_items_quote ON public.procurement_quote_items (quote_id);

