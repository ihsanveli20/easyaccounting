import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function isTableMissingError(message: string): boolean {
  const lower = (message || "").toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("could not find the table") ||
    lower.includes("relation") ||
    lower.includes("schema cache")
  );
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({
      success: false,
      tableMissing: false,
      message: "Supabase bağlantısı yapılandırılmamış.",
      records: [],
    });
  }

  try {
    const { data, error } = await supabase
      .from("sales_records")
      .select("id, product_name, customer_name, quantity, unit, sale_date, notes, is_official_recorded, created_at, updated_at")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({
        success: false,
        tableMissing: isTableMissingError(error.message),
        error: error.message,
        records: [],
      });
    }

    return NextResponse.json({
      success: true,
      records: data || [],
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Bilinmeyen hata",
      records: [],
    });
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const product_name = String(body.product_name || "").trim();
    const customer_name = String(body.customer_name || "").trim();
    const quantity = Number(body.quantity);
    const unit = String(body.unit || "Adet").trim() || "Adet";
    const sale_date =
      String(body.sale_date || "").trim() || new Date().toISOString().split("T")[0];
    const notes = body.notes ? String(body.notes).trim() : null;
    const is_official_recorded = Boolean(body.is_official_recorded);

    if (!product_name || !customer_name || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { success: false, error: "Ürün adı, firma adı ve geçerli miktar zorunludur." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("sales_records")
      .insert([{ product_name, customer_name, quantity, unit, sale_date, notes, is_official_recorded }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        success: false,
        tableMissing: isTableMissingError(error.message),
        error: error.message,
      });
    }

    return NextResponse.json({ success: true, record: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Kayıt oluşturulamadı." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "Kayıt ID eksik." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.product_name !== undefined) updates.product_name = String(body.product_name).trim();
    if (body.customer_name !== undefined) updates.customer_name = String(body.customer_name).trim();
    if (body.quantity !== undefined) updates.quantity = Number(body.quantity) || 1;
    if (body.unit !== undefined) updates.unit = String(body.unit).trim() || "Adet";
    if (body.sale_date !== undefined) updates.sale_date = String(body.sale_date).trim();
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
    if (body.is_official_recorded !== undefined) updates.is_official_recorded = Boolean(body.is_official_recorded);

    const { data, error } = await supabase
      .from("sales_records")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        success: false,
        tableMissing: isTableMissingError(error.message),
        error: error.message,
      });
    }

    return NextResponse.json({ success: true, record: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Kayıt güncellenemedi." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "Kayıt ID eksik." }, { status: 400 });
    }

    const { error } = await supabase.from("sales_records").delete().eq("id", id);

    if (error) {
      return NextResponse.json({
        success: false,
        tableMissing: isTableMissingError(error.message),
        error: error.message,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Kayıt silinemedi." },
      { status: 500 }
    );
  }
}

