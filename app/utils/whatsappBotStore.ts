import { createClient } from "@supabase/supabase-js";
import { decryptSecrets, encryptSecrets } from "./integrationCrypto";
import { formatPhoneNumberForWhatsApp } from "./whatsapp";

export interface WhatsAppBotSettings {
  id: string;
  is_active: boolean;
  phone_number_id: string;
  waba_id: string;
  verify_token: string;
  has_access_token?: boolean;
  encrypted_access_token?: string | null;
  welcome_message: string;
  fallback_message: string;
  auto_reply_enabled: boolean;
  ai_reply_enabled: boolean;
  notify_push_on_incoming: boolean;
  updated_at?: string;
}

export interface WhatsAppBotRule {
  id: string;
  keyword: string;
  match_type: "contains" | "exact" | "starts_with";
  reply_text: string;
  action_type: "text" | "check_balance" | "create_quote_lead" | "handoff_human";
  is_active: boolean;
  priority: number;
  created_at: string;
}

export interface WhatsAppBotMessage {
  id: string;
  wa_message_id?: string | null;
  direction: "inbound" | "outbound";
  phone: string;
  contact_name?: string | null;
  message_text: string;
  message_type: string;
  status: string;
  matched_rule_id?: string | null;
  is_bot_reply: boolean;
  created_at: string;
}

const DEFAULT_SETTINGS: WhatsAppBotSettings = {
  id: "default",
  is_active: false,
  phone_number_id: "",
  waba_id: "",
  verify_token: "anadolu_yapi_wa_bot_2026",
  has_access_token: false,
  welcome_message:
    "Merhaba! Anadolu Yapı WhatsApp destek hattına hoş geldiniz. Fiyat teklifi, ürün bilgisi veya cari bakiye için mesaj yazabilirsiniz.",
  fallback_message:
    "Mesajınız alındı. Müşteri temsilcimiz en kısa sürede size dönüş yapacaktır.",
  auto_reply_enabled: true,
  ai_reply_enabled: false,
  notify_push_on_incoming: true,
};

const DEFAULT_RULES: WhatsAppBotRule[] = [
  {
    id: "rule-default-1",
    keyword: "merhaba,selam,iyi günler",
    match_type: "contains",
    reply_text:
      "Merhaba! Size nasıl yardımcı olabiliriz?\n1️⃣ Fiyat teklifi için *teklif*\n2️⃣ Güncel bakiye için *bakiye*\n3️⃣ Adres & iletişim için *adres* yazabilirsiniz.",
    action_type: "text",
    is_active: true,
    priority: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule-default-2",
    keyword: "bakiye,cari,borç,ekstre",
    match_type: "contains",
    reply_text:
      "Güncel cari hesap bakiyeniz sistemden kontrol ediliyor...",
    action_type: "check_balance",
    is_active: true,
    priority: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule-default-3",
    keyword: "teklif,fiyat,palet,tuğla,çimento,demir",
    match_type: "contains",
    reply_text:
      "Fiyat teklifi talebiniz satış ekibimize iletildi. İhtiyaç duyduğunuz ürün ve miktarı yazarsanız hemen fiyat paylaşalım.",
    action_type: "create_quote_lead",
    is_active: true,
    priority: 3,
    created_at: new Date().toISOString(),
  },
];

const globalWa = globalThis as unknown as {
  __waBotMem?: {
    settings: WhatsAppBotSettings;
    rules: WhatsAppBotRule[];
    messages: WhatsAppBotMessage[];
  };
};

function getMem() {
  if (!globalWa.__waBotMem) {
    globalWa.__waBotMem = {
      settings: { ...DEFAULT_SETTINGS },
      rules: [...DEFAULT_RULES],
      messages: [],
    };
  }
  return globalWa.__waBotMem;
}

export function getSupabaseWaClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qcndlfastbrezugknkho.supabase.co";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isTableMissing(msg?: string): boolean {
  const l = (msg || "").toLowerCase();
  return (
    l.includes("does not exist") ||
    l.includes("could not find the table") ||
    l.includes("schema cache")
  );
}

export async function loadWhatsAppBotState(): Promise<{
  settings: WhatsAppBotSettings;
  rules: WhatsAppBotRule[];
  messages: WhatsAppBotMessage[];
  tableMissing: boolean;
}> {
  const mem = getMem();
  const supabase = getSupabaseWaClient();

  if (supabase) {
    const [sRes, rRes, mRes] = await Promise.all([
      supabase.from("whatsapp_bot_settings").select("*").eq("id", "default").maybeSingle(),
      supabase.from("whatsapp_bot_rules").select("*").order("priority", { ascending: true }),
      supabase
        .from("whatsapp_bot_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

    if (sRes.error && isTableMissing(sRes.error.message)) {
      return {
        settings: { ...mem.settings, encrypted_access_token: undefined },
        rules: mem.rules,
        messages: mem.messages,
        tableMissing: true,
      };
    }

    const dbSettings: WhatsAppBotSettings = sRes.data
      ? {
          ...DEFAULT_SETTINGS,
          ...sRes.data,
          has_access_token: Boolean(sRes.data.encrypted_access_token),
          encrypted_access_token: undefined,
        }
      : { ...mem.settings, encrypted_access_token: undefined };

    const rules =
      !rRes.error && Array.isArray(rRes.data) && rRes.data.length > 0
        ? rRes.data
        : mem.rules;

    const messages = !mRes.error && Array.isArray(mRes.data) ? mRes.data : mem.messages;

    return { settings: dbSettings, rules, messages, tableMissing: false };
  }

  return {
    settings: { ...mem.settings, encrypted_access_token: undefined },
    rules: mem.rules,
    messages: mem.messages,
    tableMissing: false,
  };
}

export async function getRawAccessToken(): Promise<{
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
}> {
  const mem = getMem();
  const supabase = getSupabaseWaClient();

  if (supabase) {
    const { data } = await supabase
      .from("whatsapp_bot_settings")
      .select("phone_number_id, encrypted_access_token, verify_token")
      .eq("id", "default")
      .maybeSingle();

    if (data) {
      const dec = decryptSecrets(data.encrypted_access_token);
      return {
        phoneNumberId: data.phone_number_id || mem.settings.phone_number_id || "",
        accessToken: dec.accessToken || "",
        verifyToken: data.verify_token || mem.settings.verify_token || "",
      };
    }
  }

  const dec = decryptSecrets(mem.settings.encrypted_access_token);
  return {
    phoneNumberId: mem.settings.phone_number_id || "",
    accessToken: dec.accessToken || "",
    verifyToken: mem.settings.verify_token || "",
  };
}

export async function saveBotSettings(params: {
  settings: Partial<WhatsAppBotSettings>;
  newAccessToken?: string;
  actor?: string;
}): Promise<WhatsAppBotSettings> {
  const mem = getMem();
  const supabase = getSupabaseWaClient();

  let encryptedToken = mem.settings.encrypted_access_token || null;
  if (supabase) {
    const { data } = await supabase
      .from("whatsapp_bot_settings")
      .select("encrypted_access_token")
      .eq("id", "default")
      .maybeSingle();
    if (data?.encrypted_access_token) {
      encryptedToken = data.encrypted_access_token;
    }
  }

  if (params.newAccessToken && params.newAccessToken.trim().length > 0) {
    encryptedToken = encryptSecrets({ accessToken: params.newAccessToken.trim() });
  }

  const merged: WhatsAppBotSettings = {
    ...mem.settings,
    ...params.settings,
    id: "default",
    encrypted_access_token: encryptedToken,
    has_access_token: Boolean(encryptedToken),
    updated_at: new Date().toISOString(),
  };

  mem.settings = merged;

  if (supabase) {
    await supabase.from("whatsapp_bot_settings").upsert({
      id: "default",
      is_active: merged.is_active,
      phone_number_id: merged.phone_number_id,
      waba_id: merged.waba_id,
      verify_token: merged.verify_token,
      encrypted_access_token: encryptedToken,
      welcome_message: merged.welcome_message,
      fallback_message: merged.fallback_message,
      auto_reply_enabled: merged.auto_reply_enabled,
      ai_reply_enabled: merged.ai_reply_enabled,
      notify_push_on_incoming: merged.notify_push_on_incoming,
      updated_by: params.actor || "Admin",
      updated_at: merged.updated_at,
    });
  }

  return { ...merged, encrypted_access_token: undefined };
}

export async function saveBotMessage(
  msg: Omit<WhatsAppBotMessage, "id" | "created_at">
): Promise<WhatsAppBotMessage> {
  const entry: WhatsAppBotMessage = {
    ...msg,
    id: `wamsg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
  };

  const mem = getMem();
  mem.messages.unshift(entry);

  const supabase = getSupabaseWaClient();
  if (supabase) {
    const { data } = await supabase
      .from("whatsapp_bot_messages")
      .insert([
        {
          wa_message_id: entry.wa_message_id || null,
          direction: entry.direction,
          phone: entry.phone,
          contact_name: entry.contact_name || null,
          message_text: entry.message_text,
          message_type: entry.message_type,
          status: entry.status,
          matched_rule_id: entry.matched_rule_id || null,
          is_bot_reply: entry.is_bot_reply,
        },
      ])
      .select()
      .single();
    if (data) return data;
  }

  return entry;
}

export async function sendWhatsAppCloudText(params: {
  toPhone: string;
  text: string;
}): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const { phoneNumberId, accessToken } = await getRawAccessToken();
  if (!phoneNumberId || !accessToken) {
    return {
      ok: false,
      error: "Meta Phone Number ID veya Access Token tanımlanmamış.",
    };
  }

  const cleanPhone = formatPhoneNumberForWhatsApp(params.toPhone);
  if (!cleanPhone) {
    return { ok: false, error: "Geçersiz telefon numarası." };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: params.text },
        }),
      }
    );

    const data = await res.json();
    if (res.ok && data?.messages?.[0]?.id) {
      return { ok: true, waMessageId: data.messages[0].id };
    }
    return {
      ok: false,
      error: data?.error?.message || `Meta API HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "WhatsApp API gönderim hatası.",
    };
  }
}

export function matchBotRule(
  incomingText: string,
  rules: WhatsAppBotRule[]
): WhatsAppBotRule | null {
  const norm = (incomingText || "").trim().toLocaleLowerCase("tr-TR");
  if (!norm) return null;

  const activeRules = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of activeRules) {
    const keywords = rule.keyword
      .split(",")
      .map((k) => k.trim().toLocaleLowerCase("tr-TR"))
      .filter(Boolean);

    for (const kw of keywords) {
      if (rule.match_type === "exact" && norm === kw) return rule;
      if (rule.match_type === "starts_with" && norm.startsWith(kw)) return rule;
      if (rule.match_type === "contains" && norm.includes(kw)) return rule;
    }
  }
  return null;
}

export function getMemRulesStore() {
  return getMem().rules;
}

