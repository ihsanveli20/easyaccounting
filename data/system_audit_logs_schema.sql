-- ============================================================================
-- MERKEZİ İŞLEM GEÇMİŞİ (SYSTEM AUDIT LOG) TABLOSU (Supabase SQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT 'Sistem',
  action TEXT NOT NULL, -- CREATE | UPDATE | DELETE | CANCEL | APPROVE | SYNC
  module TEXT NOT NULL, -- sales-records | quote | current-accounts | integrations | stock-tracking
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  record_label TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sys_audit_created ON public.system_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_audit_module ON public.system_audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_sys_audit_user ON public.system_audit_logs (user_name);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read system_audit_logs" ON public.system_audit_logs;
CREATE POLICY "Allow read system_audit_logs"
  ON public.system_audit_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert system_audit_logs" ON public.system_audit_logs;
CREATE POLICY "Allow insert system_audit_logs"
  ON public.system_audit_logs FOR INSERT WITH CHECK (true);

