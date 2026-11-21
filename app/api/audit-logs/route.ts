import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface SystemAuditEntry {
  id: string;
  user_id?: string | null;
  user_name: string;
  action: string;
  module: string;
  entity_type: string;
  entity_id?: string | null;
  record_label: string;
  details?: string | null;
  created_at: string;
}

const globalAudit = globalThis as unknown as {
  __inMemoryAuditLogs?: SystemAuditEntry[];
};

function getMemAudit(): SystemAuditEntry[] {
  if (!globalAudit.__inMemoryAuditLogs) {
    globalAudit.__inMemoryAuditLogs = [];
  }
  return globalAudit.__inMemoryAuditLogs;
}

function getSupabaseServer() {
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

export async function GET() {
  const supabase = getSupabaseServer();
  const mem = getMemAudit();

  if (supabase) {
    const [sysRes, cariRes] = await Promise.all([
      supabase
        .from("system_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("cari_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const combined: SystemAuditEntry[] = [];
    const tableMissing = Boolean(sysRes.error && isTableMissing(sysRes.error.message));

    if (!sysRes.error && Array.isArray(sysRes.data)) {
      combined.push(...sysRes.data);
    } else {
      combined.push(...mem);
    }

    if (!cariRes.error && Array.isArray(cariRes.data)) {
      for (const c of cariRes.data) {
        combined.push({
          id: `cari-${c.id}`,
          user_name: c.performed_by || "Sistem",
          action: c.action,
          module: "current-accounts",
          entity_type: c.entity_type,
          entity_id: c.entity_id,
          record_label: c.details || c.entity_type,
          details: c.details,
          created_at: c.created_at,
        });
      }
    }

    combined.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({
      success: true,
      tableMissing,
      logs: combined.slice(0, 250),
    });
  }

  return NextResponse.json({
    success: true,
    tableMissing: false,
    logs: mem,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entry: SystemAuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: body.user_id || null,
      user_name: String(body.user_name || "Kullanıcı"),
      action: String(body.action || "CREATE"),
      module: String(body.module || "system"),
      entity_type: String(body.entity_type || "record"),
      entity_id: body.entity_id ? String(body.entity_id) : null,
      record_label: String(body.record_label || ""),
      details: body.details ? String(body.details) : null,
      created_at: new Date().toISOString(),
    };

    getMemAudit().unshift(entry);

    const supabase = getSupabaseServer();
    if (supabase) {
      await supabase
        .from("system_audit_logs")
        .insert([
          {
            user_id: entry.user_id,
            user_name: entry.user_name,
            action: entry.action,
            module: entry.module,
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            record_label: entry.record_label,
            details: entry.details,
          },
        ])
        .then(() => {}, () => {});
    }

    return NextResponse.json({ success: true, log: entry });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Audit log hatası" },
      { status: 500 }
    );
  }
}

