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

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase env variables missing", products: [] },
      { status: 200 }
    );
  }

  try {
    const { data, error, count } = await supabase
      .from("products")
      .select("*", { count: "exact" })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, products: [] },
        { status: 200 }
      );
    }

    const mapped = (data || []).map(mapSupabaseToProductItem);

    return NextResponse.json({
      success: true,
      hasData: mapped.length > 0,
      count: count ?? mapped.length,
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
