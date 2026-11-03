import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createClient } from "@supabase/supabase-js";
import {
  AppPermissionsConfig,
  DEFAULT_PERMISSIONS_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
} from "../../utils/permissions";

const SYSTEM_CONFIG_IDENTIFIER = "__APP_PERMISSIONS_CONFIG__";
const LOCAL_DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_PERMISSIONS_FILE = path.join(LOCAL_DATA_DIR, "permissions.json");
const TMP_PERMISSIONS_FILE = path.join(os.tmpdir(), "easy_permissions.json");

function getSupabaseServerClient() {
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

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * 1. Load permissions from Supabase proposals table
 */
async function loadPermissionsFromSupabase(): Promise<AppPermissionsConfig | null> {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("proposals")
      .select("id, proposal_number")
      .eq("status", "system_permissions")
      .order("id", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const raw = data[0].proposal_number;
    const separatorIndex = raw.indexOf("::");
    if (separatorIndex === -1) return null;

    const jsonStr = raw.substring(separatorIndex + 2);
    const parsed = JSON.parse(jsonStr);
    if (parsed && (parsed.rolePermissions || parsed.userPermissions)) {
      return {
        rolePermissions: {
          ...DEFAULT_ROLE_PERMISSIONS,
          ...(parsed.rolePermissions || {}),
        },
        userPermissions: parsed.userPermissions || {},
      };
    }
  } catch (err) {
    console.warn("Could not load permissions from Supabase:", err);
  }
  return null;
}

/**
 * 2. Save permissions to Supabase proposals table
 */
async function savePermissionsToSupabase(config: AppPermissionsConfig): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return false;

    const packedValue = `${SYSTEM_CONFIG_IDENTIFIER}::${JSON.stringify(config)}`;
    const payload = {
      customer_id: null,
      proposal_number: packedValue,
      status: "system_permissions",
      total_amount: 0,
    };

    const { data: existing } = await supabase
      .from("proposals")
      .select("id")
      .eq("status", "system_permissions")
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: updateErr } = await supabase
        .from("proposals")
        .update(payload)
        .eq("id", existing[0].id);

      if (!updateErr) return true;
      console.warn("Supabase update error:", updateErr);
    } else {
      const { error: insertErr } = await supabase
        .from("proposals")
        .insert(payload);

      if (!insertErr) return true;
      console.warn("Supabase insert error:", insertErr);
    }
  } catch (err) {
    console.warn("Supabase permissions save error:", err);
  }
  return false;
}

/**
 * Read from local or tmp file cache safely
 */
async function loadPermissionsFromFile(): Promise<AppPermissionsConfig | null> {
  // Try tmpdir first (updated in serverless)
  try {
    const tmpData = await fs.readFile(TMP_PERMISSIONS_FILE, "utf-8");
    const parsed = JSON.parse(tmpData);
    if (parsed && (parsed.rolePermissions || parsed.userPermissions)) {
      return {
        rolePermissions: {
          ...DEFAULT_ROLE_PERMISSIONS,
          ...(parsed.rolePermissions || {}),
        },
        userPermissions: parsed.userPermissions || {},
      };
    }
  } catch {
    // TMP file doesn't exist or is invalid
  }

  // Try local bundled data dir (works locally or if bundled in Vercel)
  try {
    const localData = await fs.readFile(LOCAL_PERMISSIONS_FILE, "utf-8");
    const parsed = JSON.parse(localData);
    if (parsed && (parsed.rolePermissions || parsed.userPermissions)) {
      return {
        rolePermissions: {
          ...DEFAULT_ROLE_PERMISSIONS,
          ...(parsed.rolePermissions || {}),
        },
        userPermissions: parsed.userPermissions || {},
      };
    }
  } catch {
    // Local data file doesn't exist
  }

  return null;
}

/**
 * Save to tmp and local file cache safely without throwing on read-only environments
 */
async function savePermissionsToFile(config: AppPermissionsConfig): Promise<void> {
  const jsonContent = JSON.stringify(config, null, 2);

  // 1. Write to os.tmpdir() - ALWAYS writable on Vercel / AWS Lambda
  try {
    await fs.writeFile(TMP_PERMISSIONS_FILE, jsonContent, "utf-8");
  } catch (err) {
    console.warn("Could not write to tmpdir:", err);
  }

  // 2. Try writing to process.cwd()/data - works in local dev, fails safely on Vercel
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    await fs.writeFile(LOCAL_PERMISSIONS_FILE, jsonContent, "utf-8");
  } catch {
    // Expected on Vercel read-only filesystem (EROFS); do not throw
  }
}

/**
 * Resolve effective permissions with hierarchy: Supabase -> File -> Default
 */
async function getEffectivePermissions(): Promise<AppPermissionsConfig> {
  // 1. Supabase (Primary cloud source)
  const fromSupabase = await loadPermissionsFromSupabase();
  if (fromSupabase) {
    // Update local cache asynchronously
    savePermissionsToFile(fromSupabase).catch(() => {});
    return fromSupabase;
  }

  // 2. Local / Tmp file cache
  const fromFile = await loadPermissionsFromFile();
  if (fromFile) {
    return fromFile;
  }

  // 3. Fallback to default
  return DEFAULT_PERMISSIONS_CONFIG;
}

export async function GET() {
  try {
    const permissions = await getEffectivePermissions();
    return NextResponse.json({
      success: true,
      permissions,
    });
  } catch (err: any) {
    console.warn("GET /api/permissions error:", err);
    return NextResponse.json({
      success: true,
      permissions: DEFAULT_PERMISSIONS_CONFIG,
      fallback: true,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rolePermissions, userPermissions } = body;

    const current = await getEffectivePermissions();

    // Admin safety check: ensure admin always retains admin-users
    const updatedRolePermissions = {
      ...current.rolePermissions,
      ...(rolePermissions || {}),
    };
    if (
      updatedRolePermissions.admin &&
      !updatedRolePermissions.admin.includes("admin-users")
    ) {
      updatedRolePermissions.admin.push("admin-users");
    }

    const updatedConfig: AppPermissionsConfig = {
      rolePermissions: updatedRolePermissions,
      userPermissions: userPermissions !== undefined ? userPermissions : current.userPermissions,
    };

    // 1. Save to Supabase (cloud persistence across all users and serverless instances)
    await savePermissionsToSupabase(updatedConfig);

    // 2. Save to local/tmp files safely (never throws on read-only environments)
    await savePermissionsToFile(updatedConfig);

    return NextResponse.json({
      success: true,
      message: "Menü yetkileri başarıyla güncellendi ve kaydedildi.",
      permissions: updatedConfig,
    });
  } catch (err: any) {
    console.error("POST /api/permissions error:", err);
    // Never crash the client on serverless errors
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Yetki ayarları kaydedilemedi.",
      },
      { status: 500 }
    );
  }
}
