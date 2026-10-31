import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ProductItem } from "../types/accounting";
import { parseTurkishAmount } from "./excel";

// Fallback hardcoded defaults from .env.local to ensure 100% reliability in client bundles
const DEFAULT_SUPABASE_URL = "https://qcndlfastbrezugknkho.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";

export function getSupabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_KEY;

  return { url, key, isConfigured: Boolean(url && key) };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  try {
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: false },
    });
    return supabaseInstance;
  } catch (err) {
    console.warn("Supabase client creation error:", err);
    return null;
  }
}

/**
 * Maps a generic row from Supabase products table into our application ProductItem
 */
export function mapSupabaseToProductItem(row: any): ProductItem {
  let category: string | undefined = undefined;
  if (row.category) {
    category = String(row.category);
  } else if (Array.isArray(row.tags) && row.tags.length > 0) {
    category = String(row.tags[0]);
  } else if (typeof row.tags === "string" && row.tags.trim()) {
    category = row.tags;
  }

  // Parse price safely supporting Turkish formatted strings ("1.326,00") and numbers
  let price = 0;
  if (row.sale_price !== null && row.sale_price !== undefined) {
    price = typeof row.sale_price === "number" ? row.sale_price : parseTurkishAmount(row.sale_price);
  } else if (row.unit_price !== null && row.unit_price !== undefined) {
    price = typeof row.unit_price === "number" ? row.unit_price : parseTurkishAmount(row.unit_price);
  } else if (row.price !== null && row.price !== undefined) {
    price = typeof row.price === "number" ? row.price : parseTurkishAmount(row.price);
  } else if (row.cost_price !== null && row.cost_price !== undefined) {
    price = typeof row.cost_price === "number" ? row.cost_price : parseTurkishAmount(row.cost_price);
  }

  // Parse unit safely from unit_of_measure, unit, uom, birim
  const unit =
    row.unit_of_measure || row.unit || row.uom || row.birim || "Adet";

  // Parse stock quantity supporting Turkish number format
  let stock: number | undefined = undefined;
  if (row.stock_quantity !== undefined && row.stock_quantity !== null && row.stock_quantity !== "") {
    stock = typeof row.stock_quantity === "number" ? row.stock_quantity : parseTurkishAmount(row.stock_quantity);
  } else if (row.stock !== undefined && row.stock !== null && row.stock !== "") {
    stock = typeof row.stock === "number" ? row.stock : parseTurkishAmount(row.stock);
  }

  // Format date
  let updatedAt: string | undefined = undefined;
  if (row.updated_at) {
    try {
      updatedAt = new Date(row.updated_at).toLocaleDateString("tr-TR");
    } catch {}
  } else if (row.created_at) {
    try {
      updatedAt = new Date(row.created_at).toLocaleDateString("tr-TR");
    } catch {}
  }

  return {
    id: String(row.id || Math.random().toString(36).substring(2, 9)),
    code: row.code || row.product_code || row.sku || row.barcode || undefined,
    name: String(row.name || row.title || row.product_name || "İsimsiz Ürün").trim(),
    unit: String(unit).trim() || "Adet",
    unitPrice: isNaN(price) ? 0 : price,
    category: category ? category.trim() : undefined,
    stockQuantity: stock !== undefined && !isNaN(stock) ? stock : undefined,
    updatedAt,
  };
}

/**
 * Fetch ALL products directly from Supabase products table (with batch pagination over 1000 limit)
 */
export async function fetchProductsFromSupabase(): Promise<{
  products: ProductItem[];
  count: number;
  source: "supabase" | "error" | "not_configured";
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      products: [],
      count: 0,
      source: "not_configured",
      error: "Supabase istemcisi yapılandırılamadı.",
    };
  }

  try {
    // 1. Get exact total count
    const { count, error: countErr } = await client
      .from("products")
      .select("id", { count: "exact", head: true });

    if (countErr) {
      console.warn("Supabase count query error:", countErr.message);
      return {
        products: [],
        count: 0,
        source: "error",
        error: countErr.message,
      };
    }

    const totalCount = count || 0;
    if (totalCount === 0) {
      return {
        products: [],
        count: 0,
        source: "supabase",
      };
    }

    // 2. Fetch in parallel batches of 1000
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
          client
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
    return {
      products: mapped,
      count: mapped.length,
      source: "supabase",
    };
  } catch (err: any) {
    console.warn("Supabase fetch exception:", err);
    return {
      products: [],
      count: 0,
      source: "error",
      error: err.message || "Bilinmeyen bağlantı hatası",
    };
  }
}
