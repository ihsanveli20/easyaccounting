-- ============================================================================
-- KURBAN KESİM VE SÜREÇ TAKİP RAPORU MODÜLÜ
-- SUPABASE POSTGRESQL SCHEMA & MIGRATION
-- ============================================================================

-- 1. UUID Uzantısı
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Ana Organizasyon Kaydı (kurban_process_organizations)
CREATE TABLE IF NOT EXISTS public.kurban_process_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                             -- Örn: "2026 Yılı Kurumsal Kurban Kesim ve Tedarik Organizasyonu"
  client_company_name TEXT NOT NULL,              -- Alıcı Firma: "Anadolu Gıda & Perakende A.Ş."
  client_tax_no TEXT,
  client_tax_office TEXT,
  client_address TEXT,
  client_contact TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  target_animal_count INTEGER NOT NULL DEFAULT 350,
  status TEXT NOT NULL DEFAULT 'active',          -- 'planning', 'active', 'slaughter_stage', 'distribution', 'completed'
  description TEXT,
  general_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Taraflar (kurban_parties)
CREATE TABLE IF NOT EXISTS public.kurban_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL,                       -- 'client_buyer', 'supplier_seller', 'slaughterhouse', 'logistics_transporter', 'cold_storage'
  name TEXT NOT NULL,
  tax_id TEXT,
  tax_office TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  address TEXT,
  authorized_person TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Alım Sözleşmeleri (kurban_contracts)
CREATE TABLE IF NOT EXISTS public.kurban_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  contract_no TEXT NOT NULL,
  contract_date DATE NOT NULL,
  seller_party_id UUID REFERENCES public.kurban_parties(id) ON DELETE SET NULL,
  buyer_party_id UUID REFERENCES public.kurban_parties(id) ON DELETE SET NULL,
  seller_name TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  animal_type TEXT NOT NULL DEFAULT 'Büyükbaş Tosun',
  animal_count INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  contract_file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Kesim Yerleri (kurban_cutting_locations)
CREATE TABLE IF NOT EXISTS public.kurban_cutting_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                             -- Örn: "1. Kesimhane - Tuzla Modern Entegre Et Kombinası"
  location_code TEXT NOT NULL,                    -- "KSM-01", "KSM-02"
  city TEXT NOT NULL,
  address TEXT,
  responsible_person TEXT,
  responsible_phone TEXT,
  official_approval_no TEXT,                      -- Tarım Bakanlığı Onay No
  veterinary_name TEXT,
  daily_capacity INTEGER DEFAULT 200,
  allocated_animal_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Hayvan Kayıtları (kurban_animals)
CREATE TABLE IF NOT EXISTS public.kurban_animals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID REFERENCES public.kurban_cutting_locations(id) ON DELETE SET NULL,
  ear_tag_no TEXT NOT NULL,                      -- Küpe No: "TR34-00101"
  animal_type TEXT NOT NULL DEFAULT 'buyukbas_tosun',
  animal_type_label TEXT DEFAULT 'Büyükbaş Tosun',
  breed TEXT DEFAULT 'Simental',                 -- Irk
  gender TEXT DEFAULT 'male',                    -- Cinsiyet
  birth_date DATE,
  age_months INTEGER DEFAULT 24,
  passport_no TEXT,                              -- Pasaport No
  farm_reg_no TEXT,                              -- İşletme Kayıt No
  farm_name TEXT,                                -- Kayıtlı Olduğu İşletme
  health_doc_no TEXT,                            -- Veteriner Sağlık Raporu No
  passport_file_url TEXT,
  health_doc_file_url TEXT,
  live_weight_kg NUMERIC(8,2) DEFAULT 0,
  carcass_weight_kg NUMERIC(8,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'purchased',       -- 'purchased', 'in_transit', 'arrived_at_slaughterhouse', 'slaughtered', 'in_storage', 'delivered'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_kurban_animal_ear_tag UNIQUE (organization_id, ear_tag_no)
);

-- 7. Sevk İşlemleri (kurban_shipments)
CREATE TABLE IF NOT EXISTS public.kurban_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  destination_location_id UUID NOT NULL REFERENCES public.kurban_cutting_locations(id) ON DELETE CASCADE,
  shipment_no TEXT NOT NULL,                     -- "SVK-2026-001"
  shipment_date DATE NOT NULL,
  origin_address TEXT NOT NULL,                  -- Çıkış İşletmesi
  carrier_company TEXT,                          -- Nakliye Firması
  vehicle_plate TEXT NOT NULL,                   -- Tır Plakası
  driver_name TEXT NOT NULL,
  driver_phone TEXT,
  animal_count INTEGER NOT NULL DEFAULT 0,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  shipping_invoice_no TEXT,
  dispatch_note_no TEXT,
  vet_health_report_no TEXT,
  status TEXT NOT NULL DEFAULT 'delivered_to_slaughterhouse', -- 'planned', 'in_transit', 'delivered_to_slaughterhouse'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Sevk Edilen Hayvanlar (kurban_shipment_animals)
CREATE TABLE IF NOT EXISTS public.kurban_shipment_animals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.kurban_shipments(id) ON DELETE CASCADE,
  animal_id UUID NOT NULL REFERENCES public.kurban_animals(id) ON DELETE CASCADE,
  loaded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  unloaded_at TIMESTAMPTZ,
  CONSTRAINT uq_shipment_animal UNIQUE (shipment_id, animal_id)
);

-- 9. Kesim Oturumları (kurban_slaughter_batches)
CREATE TABLE IF NOT EXISTS public.kurban_slaughter_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID NOT NULL REFERENCES public.kurban_cutting_locations(id) ON DELETE CASCADE,
  batch_no TEXT NOT NULL,                        -- "KSM-BT-01"
  slaughter_date DATE NOT NULL,
  slaughter_time TEXT,                           -- "08:30"
  animal_count INTEGER NOT NULL DEFAULT 0,
  total_carcass_weight_kg NUMERIC(10,2) DEFAULT 0,
  responsible_person TEXT,
  butcher_team TEXT,
  veterinary_approval BOOLEAN DEFAULT true,
  official_protocol_no TEXT,                     -- Kesim Tutanağı No
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. Kesim Hayvan Detayları (kurban_slaughter_animals)
CREATE TABLE IF NOT EXISTS public.kurban_slaughter_animals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slaughter_batch_id UUID NOT NULL REFERENCES public.kurban_slaughter_batches(id) ON DELETE CASCADE,
  animal_id UUID NOT NULL REFERENCES public.kurban_animals(id) ON DELETE CASCADE,
  carcass_weight_kg NUMERIC(8,2) NOT NULL DEFAULT 0,
  bone_weight_kg NUMERIC(8,2) DEFAULT 0,
  offal_weight_kg NUMERIC(8,2) DEFAULT 0,
  slaughter_order_no INTEGER,
  veterinary_check_status TEXT DEFAULT 'passed',
  CONSTRAINT uq_slaughter_animal UNIQUE (slaughter_batch_id, animal_id)
);

-- 11. Depolama İşlemleri (kurban_storage_records)
CREATE TABLE IF NOT EXISTS public.kurban_storage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID REFERENCES public.kurban_cutting_locations(id) ON DELETE SET NULL,
  storage_company TEXT NOT NULL,                 -- Depolama Firması
  warehouse_name TEXT NOT NULL,                  -- Soğuk Hava Deposu Adı
  warehouse_address TEXT,
  entry_date DATE NOT NULL,
  exit_date DATE,
  product_type TEXT DEFAULT 'Karkas / Parçalanmış Soğuk Sığır Eti',
  stored_quantity_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_quantity_kg NUMERIC(10,2),
  entry_dispatch_no TEXT,
  exit_dispatch_no TEXT,
  invoice_no TEXT,
  invoice_date DATE,
  invoice_amount NUMERIC(12,2) DEFAULT 0,
  temperature_celsius NUMERIC(4,1) DEFAULT 4.0,
  status TEXT DEFAULT 'in_storage',              -- 'in_storage', 'partially_dispatched', 'empty'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. Fatura ve İrsaliyeler (kurban_invoices)
CREATE TABLE IF NOT EXISTS public.kurban_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID REFERENCES public.kurban_cutting_locations(id) ON DELETE SET NULL,
  invoice_type TEXT NOT NULL,                    -- 'animal_purchase', 'transport_shipping', 'slaughter_service', 'storage_service', 'sales_outgoing', 'other'
  invoice_no TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  issuer_company TEXT NOT NULL,                  -- Düzenleyen
  recipient_company TEXT NOT NULL,               -- İlgili / Alıcı
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,2) DEFAULT 1.0,             -- Canlı hayvan ve et %1 KDV
  vat_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. Çıkış ve Teslimat İşlemleri (kurban_deliveries)
CREATE TABLE IF NOT EXISTS public.kurban_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID REFERENCES public.kurban_cutting_locations(id) ON DELETE SET NULL,
  delivery_no TEXT NOT NULL,                     -- "TSL-2026-001"
  recipient_company TEXT NOT NULL,               -- Alıcı Firma
  delivery_date DATE NOT NULL,
  delivered_quantity_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivered_animal_count INTEGER DEFAULT 0,
  outgoing_invoice_no TEXT,
  dispatch_note_no TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  recipient_person TEXT NOT NULL,
  delivered_by_person TEXT NOT NULL,
  transport_type TEXT NOT NULL DEFAULT 'company_vehicle', -- 'company_vehicle', 'logistics_third_party'
  vehicle_plate TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  transport_cost NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 14. Fotoğraf ve Belgeler (kurban_documents)
CREATE TABLE IF NOT EXISTS public.kurban_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID REFERENCES public.kurban_cutting_locations(id) ON DELETE SET NULL,
  category TEXT NOT NULL,                        -- 'shipment_photo', 'slaughter_photo', 'storage_photo', 'delivery_photo', 'passport_doc', 'health_report', 'contract_doc', 'invoice_doc', 'weighing_slip'
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,                        -- Storage public URL veya Base64
  file_name TEXT,
  mime_type TEXT,
  related_entity_type TEXT,                      -- 'shipment', 'slaughter', 'storage', 'delivery', 'animal', 'invoice'
  related_entity_id UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 15. Kesim Yeri Bazlı Resmî Raporlar (kurban_reports)
CREATE TABLE IF NOT EXISTS public.kurban_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.kurban_process_organizations(id) ON DELETE CASCADE,
  cutting_location_id UUID NOT NULL REFERENCES public.kurban_cutting_locations(id) ON DELETE CASCADE,
  report_no TEXT NOT NULL UNIQUE,                -- Örn: "RAP-2026-KSM01"
  title TEXT NOT NULL,
  report_date DATE NOT NULL,
  report_period TEXT NOT NULL,                   -- "15 Mayıs - 25 Haziran 2026"
  prepared_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',          -- 'draft', 'review', 'final_approved'
  client_company_name TEXT NOT NULL,
  executive_summary TEXT,
  evaluation_notes TEXT,
  final_result_summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 16. Düzenlenebilir Rapor Bölümleri (kurban_report_sections)
CREATE TABLE IF NOT EXISTS public.kurban_report_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.kurban_reports(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,                     -- 'cover', 'general_info', 'contract', 'shipment', 'animals', 'slaughter', 'storage', 'delivery', 'evaluation', 'annexes', 'custom'
  section_title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  content_html TEXT,                             -- Kullanıcının canlı düzenlediği açıklama ve metin
  custom_notes TEXT,
  photo_ids UUID[],
  include_tables BOOLEAN DEFAULT true,
  page_break_after BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 17. Rapor Revizyonları / Geçmiş Sürümleri (kurban_report_revisions)
CREATE TABLE IF NOT EXISTS public.kurban_report_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.kurban_reports(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  saved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 18. PERFORMANS İNDEKSLERİ (300-400 Hayvan ve İlişkisel Sorgular İçin)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_kurban_animals_org_loc ON public.kurban_animals(organization_id, cutting_location_id);
CREATE INDEX IF NOT EXISTS idx_kurban_animals_ear_tag ON public.kurban_animals(ear_tag_no);
CREATE INDEX IF NOT EXISTS idx_kurban_animals_status ON public.kurban_animals(status);

CREATE INDEX IF NOT EXISTS idx_kurban_shipments_loc ON public.kurban_shipments(destination_location_id);
CREATE INDEX IF NOT EXISTS idx_kurban_slaughter_loc ON public.kurban_slaughter_batches(cutting_location_id);
CREATE INDEX IF NOT EXISTS idx_kurban_storage_loc ON public.kurban_storage_records(cutting_location_id);
CREATE INDEX IF NOT EXISTS idx_kurban_deliveries_loc ON public.kurban_deliveries(cutting_location_id);
CREATE INDEX IF NOT EXISTS idx_kurban_invoices_org ON public.kurban_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_kurban_documents_rel ON public.kurban_documents(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_kurban_reports_loc ON public.kurban_reports(cutting_location_id);
CREATE INDEX IF NOT EXISTS idx_kurban_report_sections_rep ON public.kurban_report_sections(report_id, order_index);

-- ============================================================================
-- 19. GÜVENLİK (ROW LEVEL SECURITY)
-- ============================================================================
ALTER TABLE public.kurban_process_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_cutting_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_shipment_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_slaughter_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_slaughter_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_storage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_report_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurban_report_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on kurban_process_organizations" ON public.kurban_process_organizations FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_parties" ON public.kurban_parties FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_contracts" ON public.kurban_contracts FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_cutting_locations" ON public.kurban_cutting_locations FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_animals" ON public.kurban_animals FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_shipments" ON public.kurban_shipments FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_shipment_animals" ON public.kurban_shipment_animals FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_slaughter_batches" ON public.kurban_slaughter_batches FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_slaughter_animals" ON public.kurban_slaughter_animals FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_storage_records" ON public.kurban_storage_records FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_invoices" ON public.kurban_invoices FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_deliveries" ON public.kurban_deliveries FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_documents" ON public.kurban_documents FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_reports" ON public.kurban_reports FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_report_sections" ON public.kurban_report_sections FOR ALL USING (true);
CREATE POLICY "Allow all on kurban_report_revisions" ON public.kurban_report_revisions FOR ALL USING (true);
