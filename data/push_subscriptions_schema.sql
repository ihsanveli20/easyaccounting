-- ============================================================================
-- WEB PUSH ABONELİK TABLOSU (Supabase)
-- ============================================================================
-- Bu SQL'i Supabase SQL Editor'de çalıştırarak kullanıcı cihazlarının Web Push
-- aboneliklerini kalıcı olarak saklayabilirsiniz.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  user_name TEXT,
  phone TEXT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON public.push_subscriptions (phone);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Allow read push_subscriptions"
  ON public.push_subscriptions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Allow insert push_subscriptions"
  ON public.push_subscriptions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Allow update push_subscriptions"
  ON public.push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Allow delete push_subscriptions"
  ON public.push_subscriptions FOR DELETE USING (true);

