import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecrets } from "../../../utils/integrationCrypto";

export const maxDuration = 60;

function getSupabaseServer() {
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
  return createClient(url, key, { auth: { persistSession: false } });
}

type OdooMany2One = [number, string] | { id?: number; display_name?: string } | false | null | undefined;

interface OdooProductTemplate {
  id: number;
  name?: string;
  default_code?: string | false;
  barcode?: string | false;
  list_price?: number;
  qty_available?: number;
  uom_id?: OdooMany2One;
  categ_id?: OdooMany2One;
}

function extractMany2OneName(val: OdooMany2One, fallback = ""): string {
  if (!val) return fallback;
  if (Array.isArray(val)) return String(val[1] || fallback);
  if (typeof val === "object" && val.display_name) return String(val.display_name);
  return fallback;
}

async function odooJsonRpc(
  serverUrl: string,
  params: Record<string, unknown>,
  timeoutMs = 20000
) {
  const res = await fetch(`${serverUrl}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params,
      id: Date.now(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Odoo sunucusu HTTP ${res.status} döndürdü.`);
  }
  const data = await res.json();
  if (data?.error) {
    throw new Error(
      data.error?.data?.message || data.error?.message || "Odoo JSON-RPC hatası"
    );
  }
  return data?.result;
}

export async function POST(request: Request) {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase bağlantısı yapılandırılamadı." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const offset = Math.max(0, Number(body?.offset) || 0);
    const limit = Math.min(1000, Math.max(50, Number(body?.limit) || 500));
    const replaceAll = body?.replaceAll !== false;

    // 1. Load saved Odoo connection settings (Supabase or in-memory fallback)
    const { data: dbConn } = await supabase
      .from("integration_connections")
      .select("*")
      .eq("provider_key", "odoo")
      .maybeSingle();

    const memStore = (
      globalThis as unknown as {
        __integrationMemStore?: {
          connections?: Map<
            string,
            {
              public_config?: Record<string, string>;
              encrypted_secrets?: string | null;
              synced_record_count?: number;
            }
          >;
        };
      }
    ).__integrationMemStore;

    const conn = dbConn || memStore?.connections?.get("odoo");

    if (!conn) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Odoo bağlantısı bulunamadı. Önce Ayarlar → Dış Sistem Entegrasyonları ekranından Odoo ayarlarını kaydedin.",
        },
        { status: 400 }
      );
    }

    const pub = (conn.public_config || {}) as Record<string, string>;
    const sec = conn.encrypted_secrets
      ? decryptSecrets(String(conn.encrypted_secrets))
      : {};

    const serverUrl = (pub.serverUrl || "").trim().replace(/\/+$/, "");
    const db = (pub.database || "").trim();
    const username = (pub.username || "").trim();
    const apiKey = (sec.apiKey || "").trim();

    if (!serverUrl || !db || !username || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Odoo bağlantı bilgileri eksik (sunucu adresi, veritabanı, kullanıcı adı veya API anahtarı).",
        },
        { status: 400 }
      );
    }

    // 2. Authenticate with Odoo
    const uid = await odooJsonRpc(serverUrl, {
      service: "common",
      method: "authenticate",
      args: [db, username, apiKey, {}],
    });

    if (typeof uid !== "number" || uid <= 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Odoo kimlik doğrulaması başarısız. Kullanıcı adı, veritabanı veya API anahtarını kontrol edin.",
        },
        { status: 401 }
      );
    }

    // 3. Get total count on first chunk + fetch single page from Odoo
    let totalCount: number | null = null;
    if (offset === 0) {
      const cnt = await odooJsonRpc(serverUrl, {
        service: "object",
        method: "execute_kw",
        args: [db, uid, apiKey, "product.template", "search_count", [[["active", "=", true]]]],
      });
      if (typeof cnt === "number") totalCount = cnt;
    }

    let fields = [
      "id",
      "name",
      "default_code",
      "barcode",
      "list_price",
      "qty_available",
      "uom_id",
      "categ_id",
    ];

    let batch: OdooProductTemplate[];
    try {
      batch = (await odooJsonRpc(
        serverUrl,
        {
          service: "object",
          method: "execute_kw",
          args: [
            db,
            uid,
            apiKey,
            "product.template",
            "search_read",
            [[["active", "=", true]]],
            {
              fields,
              offset,
              limit,
              order: "id asc",
            },
          ],
        },
        25000
      )) as OdooProductTemplate[];
    } catch {
      fields = ["id", "name", "default_code", "barcode", "list_price", "uom_id", "categ_id"];
      batch = (await odooJsonRpc(
        serverUrl,
        {
          service: "object",
          method: "execute_kw",
          args: [
            db,
            uid,
            apiKey,
            "product.template",
            "search_read",
            [[["active", "=", true]]],
            {
              fields,
              offset,
              limit,
              order: "id asc",
            },
          ],
        },
        25000
      )) as OdooProductTemplate[];
    }

    const safeBatch = Array.isArray(batch) ? batch : [];

    let dbError: string | null = null;
    let deletedOld = false;

    // 4. On first chunk, clear existing products table in safe 500-ID batches ONLY after Odoo returned real data
    if (replaceAll && offset === 0 && safeBatch.length > 0) {
      for (let round = 0; round < 100; round++) {
        const { data: oldIds, error: selErr } = await supabase
          .from("products")
          .select("id")
          .limit(500);
        if (selErr) {
          dbError = `Eski ürünler okunamadı (${selErr.message})`;
          break;
        }
        if (!oldIds || oldIds.length === 0) {
          deletedOld = true;
          break;
        }
        const ids = oldIds.map((r) => r.id);
        const { error: delErr } = await supabase
          .from("products")
          .delete()
          .in("id", ids);
        if (delErr) {
          dbError = `Eski ürünler silinemedi (${delErr.message}). Supabase SQL Editor'de DELETE izni veya TRUNCATE TABLE public.products çalıştırın.`;
          break;
        }
        // Verify rows were actually deleted (RLS can silently ignore DELETE without error)
        const { count: checkAfter } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("id", ids);
        if ((checkAfter || 0) >= ids.length) {
          dbError =
            "Supabase RLS politikası 'products' tablosunda silmeye izin vermiyor. Supabase SQL Editor'de şu komutu çalıştırın: CREATE POLICY \"Allow delete products\" ON public.products FOR DELETE USING (true);";
          break;
        }
        deletedOld = true;
      }

      if (dbError) {
        return NextResponse.json(
          {
            success: false,
            error: dbError,
          },
          { status: 403 }
        );
      }
    }

    const toInsert: Array<Record<string, unknown>> = [];
    const seenInBatch = new Set<string>();
    const clientProducts: Array<{
      id: string;
      code?: string;
      name: string;
      unit: string;
      unitPrice: number;
      category?: string;
      stockQuantity: number;
      updatedAt: string;
    }> = [];

    const todayTr = new Date().toLocaleDateString("tr-TR");
    for (const p of safeBatch) {
      const name = String(p.name || "").trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seenInBatch.has(lower)) continue;
      seenInBatch.add(lower);

      const unit = extractMany2OneName(p.uom_id, "Adet");
      const category = extractMany2OneName(p.categ_id, "") || undefined;
      const unitPrice = Number(p.list_price) || 0;
      const stockQuantity = Number(p.qty_available) || 0;
      const code =
        (typeof p.default_code === "string" && p.default_code.trim()) ||
        (typeof p.barcode === "string" && p.barcode.trim()) ||
        `ODOO-${p.id}`;

      toInsert.push({
        name,
        sale_price: unitPrice,
        unit_of_measure: unit,
        stock_quantity: stockQuantity,
        ...(category ? { tags: [category] } : {}),
      });

      clientProducts.push({
        id: `odoo-${p.id}`,
        code,
        name,
        unit,
        unitPrice,
        category,
        stockQuantity,
        updatedAt: todayTr,
      });
    }

    let insertedCount = 0;
    const updatedCount = 0;

    if (toInsert.length > 0 && !(replaceAll && offset === 0 && dbError)) {
      const { data: insData, error: insErr } = await supabase
        .from("products")
        .insert(toInsert)
        .select("id");
      if (insErr) {
        dbError = dbError ? `${dbError}; ${insErr.message}` : insErr.message;
      } else {
        insertedCount = insData?.length || toInsert.length;
      }
    }

    const hasMore = safeBatch.length === limit;
    const nextOffset = offset + safeBatch.length;

    if (!hasMore) {
      const finishedAt = new Date().toISOString();
      if (memStore?.connections?.get("odoo")) {
        const memConn = memStore.connections.get("odoo")!;
        memConn.synced_record_count = nextOffset;
      }
      try {
        await supabase
          .from("integration_connections")
          .update({
            status: "connected",
            last_sync_at: finishedAt,
            last_error_message: dbError,
            synced_record_count: nextOffset,
            updated_at: finishedAt,
          })
          .eq("provider_key", "odoo");
      } catch {
        // ignore if integration tables do not exist
      }
    }

    return NextResponse.json({
      success: true,
      totalCount,
      fetchedCount: safeBatch.length,
      insertedCount,
      updatedCount,
      deletedOld,
      hasMore,
      nextOffset,
      dbWarning: dbError,
      products: clientProducts,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Odoo ürünleri çekilirken hata oluştu.",
      },
      { status: 500 }
    );
  }
}
