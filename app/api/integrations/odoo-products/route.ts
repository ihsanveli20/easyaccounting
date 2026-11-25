import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecrets } from "../../../utils/integrationCrypto";

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

interface OdooProductTemplate {
  id: number;
  name?: string;
  default_code?: string | false;
  barcode?: string | false;
  list_price?: number;
  standard_price?: number;
  qty_available?: number;
  uom_id?: [number, string] | false;
  categ_id?: [number, string] | false;
  write_date?: string;
}

async function odooJsonRpc(
  serverUrl: string,
  params: Record<string, unknown>,
  timeoutMs = 15000
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

export async function POST() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase bağlantısı yapılandırılamadı." },
      { status: 500 }
    );
  }

  try {
    // 1. Load saved Odoo connection settings
    const { data: conn, error: connErr } = await supabase
      .from("integration_connections")
      .select("*")
      .eq("provider_key", "odoo")
      .maybeSingle();

    if (connErr) {
      return NextResponse.json(
        { success: false, error: connErr.message },
        { status: 500 }
      );
    }

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
          error: "Odoo kimlik doğrulaması başarısız. Kullanıcı adı, veritabanı veya API anahtarını kontrol edin.",
        },
        { status: 401 }
      );
    }

    // 3. Fetch active products from Odoo (product.template) in batches of 500
    const fields = [
      "id",
      "name",
      "default_code",
      "barcode",
      "list_price",
      "standard_price",
      "qty_available",
      "uom_id",
      "categ_id",
      "write_date",
    ];
    const allOdooProducts: OdooProductTemplate[] = [];
    const batchSize = 500;
    const maxPages = 20; // up to 10,000 products

    for (let page = 0; page < maxPages; page++) {
      const batch = (await odooJsonRpc(
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
              offset: page * batchSize,
              limit: batchSize,
              order: "id asc",
            },
          ],
        },
        20000
      )) as OdooProductTemplate[];

      if (!Array.isArray(batch) || batch.length === 0) break;
      allOdooProducts.push(...batch);
      if (batch.length < batchSize) break;
    }

    // 4. Load existing product names from Supabase to update vs insert cleanly
    const existingByName = new Map<string, string>();
    let offset = 0;
    while (true) {
      const { data: existingRows, error: exErr } = await supabase
        .from("products")
        .select("id, name")
        .range(offset, offset + 999);
      if (exErr || !existingRows || existingRows.length === 0) break;
      for (const r of existingRows) {
        if (r.name) existingByName.set(String(r.name).trim().toLowerCase(), String(r.id));
      }
      if (existingRows.length < 1000) break;
      offset += 1000;
    }

    const toInsert: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ id: string; payload: Record<string, unknown> }> = [];
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
    for (const p of allOdooProducts) {
      const name = String(p.name || "").trim();
      if (!name) continue;
      const unit = Array.isArray(p.uom_id) && p.uom_id[1] ? String(p.uom_id[1]) : "Adet";
      const category =
        Array.isArray(p.categ_id) && p.categ_id[1] ? String(p.categ_id[1]) : undefined;
      const unitPrice = Number(p.list_price) || 0;
      const stockQuantity = Number(p.qty_available) || 0;
      const code =
        (typeof p.default_code === "string" && p.default_code.trim()) ||
        (typeof p.barcode === "string" && p.barcode.trim()) ||
        `ODOO-${p.id}`;

      const rowPayload: Record<string, unknown> = {
        name,
        sale_price: unitPrice,
        unit_of_measure: unit,
        stock_quantity: stockQuantity,
        ...(category ? { tags: [category] } : {}),
      };

      const existingId = existingByName.get(name.toLowerCase());
      if (existingId) {
        toUpdate.push({ id: existingId, payload: rowPayload });
        clientProducts.push({
          id: existingId,
          code,
          name,
          unit,
          unitPrice,
          category,
          stockQuantity,
          updatedAt: todayTr,
        });
      } else {
        toInsert.push(rowPayload);
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
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let dbError: string | null = null;

    // Batch insert new products
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { data: insData, error: insErr } = await supabase
        .from("products")
        .insert(chunk)
        .select("id");
      if (insErr) {
        dbError = insErr.message;
        break;
      }
      insertedCount += insData?.length || chunk.length;
    }

    // Batch update existing products (concurrency 20)
    for (let i = 0; i < toUpdate.length; i += 20) {
      const batch = toUpdate.slice(i, i + 20);
      const results = await Promise.all(
        batch.map((u) =>
          supabase.from("products").update(u.payload).eq("id", u.id)
        )
      );
      for (const r of results) {
        if (r.error) {
          if (!dbError) dbError = r.error.message;
        } else {
          updatedCount++;
        }
      }
    }

    // Update integration connection status & log
    const finishedAt = new Date().toISOString();
    await supabase
      .from("integration_connections")
      .update({
        status: "connected",
        last_sync_at: finishedAt,
        last_error_message: dbError,
        synced_record_count:
          (Number(conn.synced_record_count) || 0) + insertedCount + updatedCount,
        updated_at: finishedAt,
      })
      .eq("provider_key", "odoo");

    await supabase.from("integration_sync_logs").insert([
      {
        provider_key: "odoo",
        level: dbError ? "warning" : "info",
        message: `Odoo'dan ${allOdooProducts.length} ürün çekildi (${insertedCount} yeni, ${updatedCount} güncellendi).${
          dbError ? ` DB Notu: ${dbError}` : ""
        }`,
      },
    ]);

    return NextResponse.json({
      success: true,
      fetchedCount: allOdooProducts.length,
      insertedCount,
      updatedCount,
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

