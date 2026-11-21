-- ============================================================================
-- DIŞ SİSTEM ENTEGRASYONLARI - MERKEZİ ENTEGRASYON YÖNETİMİ (Supabase SQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT UNIQUE NOT NULL, -- odoo | nes | turmob | bank | whatsapp_business | email
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- connected | pending | error | syncing | disabled
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
  sync_direction TEXT NOT NULL DEFAULT 'pull', -- pull | push | bidirectional
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  encrypted_secrets TEXT, -- AES-256-GCM şifreli hassas kimlik bilgileri (asla frontend'e dönülmez)
  last_sync_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  synced_record_count INTEGER NOT NULL DEFAULT 0,
  error_record_count INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.external_id_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- product | contact | invoice | payment | stock | order
  local_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_code TEXT,
  match_method TEXT NOT NULL DEFAULT 'manual', -- uuid | tax_number | sku | manual
  match_status TEXT NOT NULL DEFAULT 'matched', -- matched | pending_approval | conflict
  synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (provider_key, entity_type, local_id),
  UNIQUE (provider_key, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'pull',
  entity_types TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | success | partial | failed | cancelled
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  finished_at TIMESTAMPTZ,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  triggered_by TEXT
);

CREATE TABLE IF NOT EXISTS public.integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info', -- info | warn | error
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  record_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.integration_error_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL,
  job_id UUID REFERENCES public.integration_sync_jobs(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  record_ref TEXT,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_int_logs_provider ON public.integration_logs (provider_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_int_jobs_provider ON public.integration_sync_jobs (provider_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_int_err_provider ON public.integration_error_queue (provider_key, resolved);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'integration_connections',
    'external_id_mappings',
    'integration_sync_jobs',
    'integration_logs',
    'integration_error_queue'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all %s" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow all %s" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

