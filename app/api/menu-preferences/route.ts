import { NextResponse, connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const PREFS_STATUS = "user_menu_preferences";
const PREFS_IDENTIFIER = "__USER_MENU_PREFS_V1__";
const TMP_FILE = path.join(os.tmpdir(), "easy_accounting_menu_prefs_v1.json");

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function getSupabaseServerClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qcndlfastbrezugknkho.supabase.co";

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export interface StoredMenuPrefsPayload {
  order: string[];
  hiddenIds: string[];
  startInLauncher: boolean;
  hideSidebarInLauncher: boolean;
  sidebarHidden: boolean;
  sidebarCollapsed: boolean;
}

const DEFAULT_PREFS: StoredMenuPrefsPayload = {
  order: [],
  hiddenIds: [],
  startInLauncher: false,
  hideSidebarInLauncher: false,
  sidebarHidden: false,
  sidebarCollapsed: false,
};

function normalizePrefs(raw: Partial<StoredMenuPrefsPayload> | null | undefined): StoredMenuPrefsPayload {
  return {
    order: Array.isArray(raw?.order) ? raw.order : [],
    hiddenIds: Array.isArray(raw?.hiddenIds) ? raw.hiddenIds : [],
    startInLauncher: Boolean(raw?.startInLauncher ?? false),
    hideSidebarInLauncher: Boolean(raw?.hideSidebarInLauncher ?? false),
    sidebarHidden: Boolean(raw?.sidebarHidden ?? false),
    sidebarCollapsed: Boolean(raw?.sidebarCollapsed ?? false),
  };
}

async function readTmpMap(): Promise<Record<string, StoredMenuPrefsPayload>> {
  try {
    const raw = await fs.readFile(TMP_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeTmpMap(map: Record<string, StoredMenuPrefsPayload>): Promise<void> {
  try {
    await fs.writeFile(TMP_FILE, JSON.stringify(map, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") || "default").trim() || "default";

  const supabase = getSupabaseServerClient();

  if (supabase) {
    // 1. Try dedicated `user_menu_preferences` table
    try {
      const { data, error } = await supabase
        .from("user_menu_preferences")
        .select("*")
        .eq("user_id", userId)
        .limit(1);

      if (!error && data && data.length > 0) {
        const row = data[0];
        return NextResponse.json(
          {
            success: true,
            source: "supabase_table",
            preferences: normalizePrefs({
              order: row.menu_order,
              hiddenIds: row.hidden_menu_ids,
              startInLauncher: row.start_in_launcher,
              hideSidebarInLauncher: row.hide_sidebar_in_launcher,
              sidebarHidden: row.sidebar_hidden,
              sidebarCollapsed: row.sidebar_collapsed,
            }),
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    } catch {
      // fallback to proposals
    }

    // 2. Fallback: `proposals` cloud store
    try {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, proposal_number")
        .eq("status", PREFS_STATUS)
        .order("id", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const raw: string = data[0].proposal_number || "";
        const sepIdx = raw.indexOf("::");
        if (sepIdx !== -1) {
          const map = JSON.parse(raw.substring(sepIdx + 2)) as Record<
            string,
            StoredMenuPrefsPayload
          >;
          if (map && map[userId]) {
            return NextResponse.json(
              {
                success: true,
                source: "supabase_cloud",
                preferences: normalizePrefs(map[userId]),
              },
              { headers: NO_STORE_HEADERS }
            );
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const tmpMap = await readTmpMap();
  if (tmpMap[userId]) {
    return NextResponse.json(
      {
        success: true,
        source: "local_cache",
        preferences: normalizePrefs(tmpMap[userId]),
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      source: "default",
      preferences: DEFAULT_PREFS,
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      preferences?: Partial<StoredMenuPrefsPayload>;
    };
    const userId = (body.userId || "default").trim() || "default";
    const prefs = normalizePrefs(body.preferences);

    const tmpMap = await readTmpMap();
    tmpMap[userId] = prefs;
    await writeTmpMap(tmpMap);

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        {
          success: true,
          source: "local_cache",
          preferences: prefs,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // 1. Try saving to dedicated `user_menu_preferences` table
    try {
      const { error: upsertErr } = await supabase
        .from("user_menu_preferences")
        .upsert(
          {
            user_id: userId,
            menu_order: prefs.order,
            hidden_menu_ids: prefs.hiddenIds,
            sidebar_hidden: prefs.sidebarHidden,
            sidebar_collapsed: prefs.sidebarCollapsed,
            start_in_launcher: prefs.startInLauncher,
            hide_sidebar_in_launcher: prefs.hideSidebarInLauncher,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (!upsertErr) {
        return NextResponse.json(
          {
            success: true,
            source: "supabase_table",
            preferences: prefs,
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    } catch {
      // fallback to proposals cloud store
    }

    // 2. Fallback: save into `proposals` table so it works immediately without waiting for SQL migration
    let existingMap: Record<string, StoredMenuPrefsPayload> = {};
    const { data: existingRows } = await supabase
      .from("proposals")
      .select("id, proposal_number")
      .eq("status", PREFS_STATUS)
      .order("id", { ascending: false })
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      const raw: string = existingRows[0].proposal_number || "";
      const sepIdx = raw.indexOf("::");
      if (sepIdx !== -1) {
        try {
          existingMap = JSON.parse(raw.substring(sepIdx + 2)) || {};
        } catch {
          existingMap = {};
        }
      }
    }

    existingMap[userId] = prefs;
    const packedValue = `${PREFS_IDENTIFIER}::${JSON.stringify(existingMap)}`;
    const payload = {
      customer_id: null,
      proposal_number: packedValue,
      status: PREFS_STATUS,
      total_amount: 0,
    };

    if (existingRows && existingRows.length > 0) {
      const { error: updateErr } = await supabase
        .from("proposals")
        .update(payload)
        .eq("id", existingRows[0].id);

      if (!updateErr) {
        return NextResponse.json(
          {
            success: true,
            source: "supabase_cloud",
            preferences: prefs,
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    } else {
      const { error: insertErr } = await supabase.from("proposals").insert(payload);
      if (!insertErr) {
        return NextResponse.json(
          {
            success: true,
            source: "supabase_cloud",
            preferences: prefs,
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Menü ayarları Supabase bulutuna yazılamadı.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ayarlar kaydedilemedi.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

