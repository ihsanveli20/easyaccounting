-- ============================================================================
-- KULLANICI MENÜ & GÖRÜNÜM AYARLARI TABLOSU (Supabase)
-- ============================================================================
-- Bu SQL'i Supabase SQL Editor'de çalıştırarak kullanıcı bazlı menü
-- sıralaması, gizli modüller, yan menü gizleme ve başlatıcı tercihlerini
-- kalıcı olarak saklayabilirsiniz.

CREATE TABLE IF NOT EXISTS public.user_menu_preferences (
  user_id TEXT PRIMARY KEY,
  menu_order TEXT[] NOT NULL DEFAULT '{}',
  hidden_menu_ids TEXT[] NOT NULL DEFAULT '{}',
  sidebar_hidden BOOLEAN NOT NULL DEFAULT false,
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  start_in_launcher BOOLEAN NOT NULL DEFAULT false,
  hide_sidebar_in_launcher BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- RLS Politikaları (Uygulama içi okuma/yazma için)
ALTER TABLE public.user_menu_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read user_menu_preferences" ON public.user_menu_preferences;
CREATE POLICY "Allow read user_menu_preferences"
  ON public.user_menu_preferences
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert user_menu_preferences" ON public.user_menu_preferences;
CREATE POLICY "Allow insert user_menu_preferences"
  ON public.user_menu_preferences
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update user_menu_preferences" ON public.user_menu_preferences;
CREATE POLICY "Allow update user_menu_preferences"
  ON public.user_menu_preferences
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

