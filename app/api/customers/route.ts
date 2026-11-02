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

// In-memory cache for customer list
let cachedCustomers: any[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const search = searchParams.get("search")?.trim().toLowerCase();

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured", customers: [] },
      { status: 200 }
    );
  }

  try {
    let customerList = cachedCustomers;
    const isCacheExpired = !cachedCustomers || Date.now() - lastCacheTime > CACHE_TTL_MS;

    if (force || isCacheExpired) {
      // PostgREST max-rows is 1000, customers table has 765 rows so a single select gets all of them
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, created_at")
        .order("name", { ascending: true });

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message, customers: [] },
          { status: 200 }
        );
      }

      cachedCustomers = (data || []).map((c) => ({
        id: c.id,
        name: (c.name || "").trim(),
        created_at: c.created_at,
      }));
      lastCacheTime = Date.now();
      customerList = cachedCustomers;
    }

    let results = customerList || [];
    if (search) {
      results = results.filter((c) =>
        c.name.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      customers: results,
      totalCount: customerList?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Customer fetch error", customers: [] },
      { status: 500 }
    );
  }
}
