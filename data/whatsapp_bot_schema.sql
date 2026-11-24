-- ============================================================================
-- WHATSAPP BUSINESS BOT MODÜLÜ (Supabase SQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_bot_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  is_active BOOLEAN NOT NULL DEFAULT false,
  phone_number_id TEXT,
  waba_id TEXT,
  verify_token TEXT,
  encrypted_access_token TEXT, -- AES-256-GCM şifreli Meta Permanent Access Token
  welcome_message TEXT DEFAULT 'Merhaba! Anadolu Yapı WhatsApp destek hattına hoş geldiniz. Fiyat teklifi, ürün bilgisi veya cari bakiye için mesaj yazabilirsiniz.',
  fallback_message TEXT DEFAULT 'Mesajınız alındı. Müşteri temsilcimiz en kısa sürede size dönüş yapacaktır.',
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  notify_push_on_incoming BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.whatsapp_bot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains', -- contains | exact | starts_with
  reply_text TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'text', -- text | check_balance | create_quote_lead | handoff_human
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.whatsapp_bot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id TEXT,
  direction TEXT NOT NULL, -- inbound | outbound
  phone TEXT NOT NULL,
  contact_name TEXT,
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'received', -- received | sent | delivered | read | failed
  matched_rule_id UUID REFERENCES public.whatsapp_bot_rules(id) ON DELETE SET NULL,
  is_bot_reply BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wa_bot_msg_phone ON public.whatsapp_bot_messages (phone, created_at DESC);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_bot_settings',
    'whatsapp_bot_rules',
    'whatsapp_bot_messages'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all %s" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow all %s" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

