import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export interface GlobalSearchResultItem {
  id: string;
  category: "product" | "customer" | "contact" | "proposal" | "sale" | "transaction";
  title: string;
  subtitle: string;
  targetTab: string;
  badge: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ success: true, results: [] });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ success: true, results: [] });
  }

  const pattern = `%${q}%`;
  const results: GlobalSearchResultItem[] = [];

  try {
    const [prodRes, custRes, contRes, propRes, salesRes, txRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, unit_of_measure")
        .or(`name.ilike.${pattern},sku.ilike.${pattern}`)
        .limit(8),
      supabase.from("customers").select("id, name").ilike("name", pattern).limit(8),
      supabase
        .from("contacts")
        .select("id, code, name, tax_number, phone")
        .or(`name.ilike.${pattern},code.ilike.${pattern},tax_number.ilike.${pattern}`)
        .limit(8),
      supabase
        .from("proposals")
        .select("id, proposal_number, total_amount, status")
        .ilike("proposal_number", pattern)
        .limit(8),
      supabase
        .from("sales_records")
        .select("id, product_name, customer_name, quantity, unit, sale_date")
        .or(`product_name.ilike.${pattern},customer_name.ilike.${pattern}`)
        .limit(8),
      supabase
        .from("account_transactions")
        .select("id, document_no, description, transaction_date, tl_debit, tl_credit")
        .or(`document_no.ilike.${pattern},description.ilike.${pattern}`)
        .limit(8),
    ]);

    for (const p of prodRes.data || []) {
      results.push({
        id: `prod-${p.id}`,
        category: "product",
        title: p.name,
        subtitle: `Kod: ${p.sku || "-"} • Birim: ${p.unit_of_measure || "Adet"}`,
        targetTab: "stock-tracking",
        badge: "Ürün",
      });
    }

    for (const c of contRes.data || []) {
      results.push({
        id: `cont-${c.id}`,
        category: "contact",
        title: c.name,
        subtitle: `Cari Kodu: ${c.code} • VKN: ${c.tax_number || "-"}`,
        targetTab: "current-accounts",
        badge: "Cari Hesap",
      });
    }

    for (const cu of custRes.data || []) {
      results.push({
        id: `cust-${cu.id}`,
        category: "customer",
        title: cu.name,
        subtitle: "Kayıtlı Müşteri / Firma",
        targetTab: "current-accounts",
        badge: "Müşteri",
      });
    }

    for (const pr of propRes.data || []) {
      results.push({
        id: `prop-${pr.id}`,
        category: "proposal",
        title: `Teklif: ${pr.proposal_number}`,
        subtitle: `Tutar: ${Number(pr.total_amount || 0).toLocaleString("tr-TR")} TL • Durum: ${pr.status}`,
        targetTab: "proposal-history",
        badge: "Teklif",
      });
    }

    for (const s of salesRes.data || []) {
      results.push({
        id: `sale-${s.id}`,
        category: "sale",
        title: `${s.product_name} (${s.quantity} ${s.unit})`,
        subtitle: `Firma: ${s.customer_name} • Tarih: ${s.sale_date}`,
        targetTab: "sales-records",
        badge: "Satış",
      });
    }

    for (const t of txRes.data || []) {
      const amt = t.tl_debit > 0 ? t.tl_debit : t.tl_credit;
      results.push({
        id: `tx-${t.id}`,
        category: "transaction",
        title: `${t.document_no || "Belgesiz"} — ${t.description}`,
        subtitle: `Tarih: ${t.transaction_date} • Tutar: ${Number(amt || 0).toLocaleString("tr-TR")} TL`,
        targetTab: "current-accounts",
        badge: "İşlem / Fatura",
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      results,
      error: err instanceof Error ? err.message : "Arama hatası",
    });
  }
}

