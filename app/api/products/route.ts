import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mapSupabaseToProductItem } from "../../utils/supabase";

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

// In-memory cache for server responses to avoid repeated 36-request loops on fast reloads
let cachedData: any = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  // Return cache if valid and not force-refreshed
  if (!force && cachedData && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return NextResponse.json({
      success: true,
      hasData: cachedData.length > 0,
      count: cachedData.length,
      products: cachedData,
      fromCache: true,
    });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase env variables missing", products: [] },
      { status: 200 }
    );
  }

  try {
    // 1. Get exact total count
    const { count, error: countErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true });

    if (countErr) {
      return NextResponse.json(
        { success: false, error: countErr.message, products: [] },
        { status: 200 }
      );
    }

    const totalCount = count || 0;
    if (totalCount === 0) {
      cachedData = [];
      lastFetchTime = Date.now();
      return NextResponse.json({
        success: true,
        hasData: false,
        count: 0,
        products: [],
      });
    }

    // 2. Fetch all rows in batches of 1000 without hitting PostgREST 1000 limit
    const PAGE_SIZE = 1000;
    const ranges: { from: number; to: number }[] = [];
    for (let from = 0; from < totalCount; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, totalCount - 1);
      ranges.push({ from, to });
    }

    const rawRows: any[] = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < ranges.length; i += CONCURRENCY) {
      const chunk = ranges.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map((r) =>
          supabase
            .from("products")
            .select("id, name, sale_price, unit_of_measure, stock_quantity, tags")
            .range(r.from, r.to)
        )
      );

      for (const res of results) {
        if (res.data) {
          rawRows.push(...res.data);
        }
      }
    }

    const mapped = rawRows.map(mapSupabaseToProductItem);
    cachedData = mapped;
    lastFetchTime = Date.now();

    return NextResponse.json({
      success: true,
      hasData: mapped.length > 0,
      count: mapped.length,
      products: mapped,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message, products: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase bağlantısı yapılandırılamadı." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body.products)
      ? body.products
      : body.product
        ? [body.product]
        : [];

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: "Eklenecek ürün verisi bulunamadı." },
        { status: 400 }
      );
    }

    // Map to Supabase table schema
    const rowsToInsert = items.map((p: any) => ({
      name: String(p.name || "").trim(),
      sale_price: Number(p.unitPrice || p.sale_price || 0),
      unit_of_measure: String(p.unit || p.unit_of_measure || "Adet"),
      stock_quantity:
        p.stockQuantity !== undefined && p.stockQuantity !== null
          ? Number(p.stockQuantity)
          : undefined,
      tags: p.category ? [p.category] : undefined,
    }));

    const { data, error } = await supabase
      .from("products")
      .insert(rowsToInsert)
      .select();

    if (error) {
      const isRls = error.code === "42501";
      return NextResponse.json({
        success: false,
        rlsError: isRls,
        error: error.message,
        hint: isRls
          ? "Supabase RLS (Row Level Security) kuralı nedeniyle ekleme izni verilmemiş. Supabase panelinden 'products' tablosuna INSERT izni tanımlayabilirsiniz."
          : error.hint,
      });
    }

    // Invalidate server cache on new inserts
    cachedData = null;

    return NextResponse.json({
      success: true,
      count: data?.length || rowsToInsert.length,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
