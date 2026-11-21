import { createClient } from "@supabase/supabase-js";

export interface StoredPushSubscription {
  id?: string;
  user_id: string;
  user_name?: string | null;
  phone?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  updated_at?: string;
}

const globalForPush = globalThis as unknown as {
  __inMemoryPushSubs?: Map<string, StoredPushSubscription>;
};

function getMemoryStore(): Map<string, StoredPushSubscription> {
  if (!globalForPush.__inMemoryPushSubs) {
    globalForPush.__inMemoryPushSubs = new Map();
  }
  return globalForPush.__inMemoryPushSubs;
}

export function getSupabasePushClient() {
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

function isTableMissing(msg: string): boolean {
  const l = (msg || "").toLowerCase();
  return (
    l.includes("does not exist") ||
    l.includes("could not find the table") ||
    l.includes("schema cache")
  );
}

export async function listPushSubscriptions(): Promise<{
  subscriptions: StoredPushSubscription[];
  tableMissing: boolean;
}> {
  const supabase = getSupabasePushClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, user_name, phone, endpoint, p256dh, auth, updated_at")
      .order("updated_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      return { subscriptions: data, tableMissing: false };
    }
    if (error && isTableMissing(error.message)) {
      return {
        subscriptions: Array.from(getMemoryStore().values()),
        tableMissing: true,
      };
    }
  }

  return {
    subscriptions: Array.from(getMemoryStore().values()),
    tableMissing: false,
  };
}

export async function upsertPushSubscription(
  sub: StoredPushSubscription
): Promise<{ ok: boolean; tableMissing: boolean; error?: string }> {
  getMemoryStore().set(sub.endpoint, {
    ...sub,
    updated_at: new Date().toISOString(),
  });

  const supabase = getSupabasePushClient();
  if (!supabase) return { ok: true, tableMissing: false };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: sub.user_id || "anonymous",
      user_name: sub.user_name || null,
      phone: sub.phone || null,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return {
      ok: true,
      tableMissing: isTableMissing(error.message),
      error: error.message,
    };
  }
  return { ok: true, tableMissing: false };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  getMemoryStore().delete(endpoint);
  const supabase = getSupabasePushClient();
  if (!supabase) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

