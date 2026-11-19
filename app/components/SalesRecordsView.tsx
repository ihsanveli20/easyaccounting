"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Building2,
  Calendar,
  Check,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  Edit3,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { ProductItem } from "../types/accounting";

export interface SalesRecordItem {
  id: string;
  product_name: string;
  customer_name: string;
  quantity: number;
  unit: string;
  sale_date: string; // YYYY-MM-DD
  notes?: string | null;
  is_official_recorded?: boolean;
  created_at?: string;
}

interface SalesRecordsViewProps {
  products?: ProductItem[];
  companyNames?: string[];
}

const LOCAL_STORAGE_KEY = "easy_accounting_sales_records_v1";
const UNIT_OPTIONS = ["Adet", "Palet", "Kg", "Ton", "Paket", "Koli", "m²", "m³", "Sefer"];

const SUPABASE_SQL_SNIPPET = `CREATE TABLE IF NOT EXISTS public.sales_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Adet',
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  is_official_recorded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);`;

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export default function SalesRecordsView({
  products = [],
  companyNames = [],
}: SalesRecordsViewProps) {
  const [records, setRecords] = useState<SalesRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [tableMissing, setTableMissing] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Supabase customer list
  const [supabaseCustomers, setSupabaseCustomers] = useState<string[]>([]);

  // New record form state
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("Adet");
  const [saleDate, setSaleDate] = useState(getTodayDateString);
  const [notes, setNotes] = useState("");
  const [isOfficialRecorded, setIsOfficialRecorded] = useState(false);

  // Dropdown visibility
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);
  const productBoxRef = useRef<HTMLDivElement>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [officialFilter, setOfficialFilter] = useState<"all" | "official" | "pending">("all");

  // Editing row state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<SalesRecordItem>>({});

  const saveLocalFallback = (next: SalesRecordItem[]) => {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const readLocalFallback = (): SalesRecordItem[] => {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [salesRes, custRes] = await Promise.all([
          fetch("/api/sales-records"),
          fetch("/api/customers"),
        ]);

        const salesData = await salesRes.json();
        const custData = await custRes.json();

        if (!active) return;

        if (custData?.success && Array.isArray(custData.customers)) {
          setSupabaseCustomers(
            custData.customers
              .map((c: { name?: string }) => (c.name || "").trim())
              .filter(Boolean)
          );
        }

        if (salesData?.success && Array.isArray(salesData.records)) {
          setRecords(salesData.records);
          saveLocalFallback(salesData.records);
          setTableMissing(false);
        } else {
          if (salesData?.tableMissing) {
            setTableMissing(true);
          }
          setRecords(readLocalFallback());
        }
      } catch {
        if (active) {
          setRecords(readLocalFallback());
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Combined unique firm options (Supabase customers + Excel companies + past sales)
  const allFirmOptions = useMemo(() => {
    const set = new Set<string>();
    supabaseCustomers.forEach((c) => c && set.add(c));
    companyNames.forEach((c) => c && set.add(c));
    records.forEach((r) => r.customer_name && set.add(r.customer_name));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr-TR"));
  }, [supabaseCustomers, companyNames, records]);

  const filteredFirmOptions = useMemo(() => {
    const q = customerName.trim().toLocaleLowerCase("tr-TR");
    if (!q) return allFirmOptions.slice(0, 40);
    return allFirmOptions
      .filter((f) => f.toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 40);
  }, [allFirmOptions, customerName]);

  // Combined unique product suggestions (Product catalog + past sales)
  const allProductOptions = useMemo(() => {
    const map = new Map<string, { name: string; unit?: string }>();
    products.forEach((p) => {
      if (p.name) {
        map.set(p.name.toLocaleLowerCase("tr-TR"), {
          name: p.name,
          unit: p.unit || "Adet",
        });
      }
    });
    records.forEach((r) => {
      if (r.product_name) {
        const key = r.product_name.toLocaleLowerCase("tr-TR");
        if (!map.has(key)) {
          map.set(key, { name: r.product_name, unit: r.unit || "Adet" });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "tr-TR")
    );
  }, [products, records]);

  const filteredProductOptions = useMemo(() => {
    const q = productName.trim().toLocaleLowerCase("tr-TR");
    if (!q) return allProductOptions.slice(0, 30);
    return allProductOptions
      .filter((p) => p.name.toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 30);
  }, [allProductOptions, productName]);

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const pName = productName.trim();
    const cName = customerName.trim();
    const qtyNum = Number(String(quantity).replace(",", "."));

    if (!pName) {
      setErrorMsg("Lütfen ürün adını girin.");
      return;
    }
    if (!cName) {
      setErrorMsg("Lütfen kime satıldığını (firma/kişi) girin veya seçin.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setErrorMsg("Lütfen geçerli bir miktar girin.");
      return;
    }

    setIsSaving(true);
    const payload = {
      product_name: pName,
      customer_name: cName,
      quantity: qtyNum,
      unit: unit.trim() || "Adet",
      sale_date: saleDate || getTodayDateString(),
      notes: notes.trim() || null,
      is_official_recorded: isOfficialRecorded,
    };

    try {
      const res = await fetch("/api/sales-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data?.success && data.record) {
        const next = [data.record, ...records];
        setRecords(next);
        saveLocalFallback(next);
        setTableMissing(false);
      } else {
        if (data?.tableMissing) setTableMissing(true);
        const localRec: SalesRecordItem = {
          id: `local-${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString(),
        };
        const next = [localRec, ...records];
        setRecords(next);
        saveLocalFallback(next);
      }

      // Reset product & quantity for fast next entry (keep date)
      setProductName("");
      setQuantity("1");
      setNotes("");
      setIsOfficialRecorded(false);
    } catch {
      const localRec: SalesRecordItem = {
        id: `local-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
      };
      const next = [localRec, ...records];
      setRecords(next);
      saveLocalFallback(next);
      setProductName("");
      setQuantity("1");
      setNotes("");
      setIsOfficialRecorded(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const pName = (editDraft.product_name || "").trim();
    const cName = (editDraft.customer_name || "").trim();
    const qtyNum = Number(editDraft.quantity);

    if (!pName || !cName || !Number.isFinite(qtyNum) || qtyNum <= 0) return;

    const updatedPayload = {
      id,
      product_name: pName,
      customer_name: cName,
      quantity: qtyNum,
      unit: (editDraft.unit || "Adet").trim(),
      sale_date: editDraft.sale_date || getTodayDateString(),
      notes: editDraft.notes || null,
      is_official_recorded: Boolean(editDraft.is_official_recorded),
    };

    const next = records.map((r) => (r.id === id ? { ...r, ...updatedPayload } : r));
    setRecords(next);
    saveLocalFallback(next);
    setEditingId(null);

    if (!id.startsWith("local-")) {
      try {
        await fetch("/api/sales-records", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedPayload),
        });
      } catch {
        // ignore network error; already saved locally
      }
    }
  };

  const handleToggleOfficial = async (rec: SalesRecordItem) => {
    const nextVal = !rec.is_official_recorded;
    const next = records.map((r) =>
      r.id === rec.id ? { ...r, is_official_recorded: nextVal } : r
    );
    setRecords(next);
    saveLocalFallback(next);

    if (!rec.id.startsWith("local-")) {
      try {
        await fetch("/api/sales-records", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rec.id, is_official_recorded: nextVal }),
        });
      } catch {
        // ignore network error; already saved locally
      }
    }
  };

  const handleDeleteRecord = async (id: string) => {
    const next = records.filter((r) => r.id !== id);
    setRecords(next);
    saveLocalFallback(next);

    if (!id.startsWith("local-")) {
      try {
        await fetch(`/api/sales-records?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        // ignore
      }
    }
  };

  const filteredRecords = useMemo(() => {
    const todayStr = getTodayDateString();
    const now = new Date();

    return records.filter((r) => {
      if (dateFilter === "today" && r.sale_date !== todayStr) return false;
      if (dateFilter === "week") {
        const d = new Date(r.sale_date);
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 7 || diffDays < -1) return false;
      }
      if (dateFilter === "month") {
        if (!r.sale_date.startsWith(todayStr.slice(0, 7))) return false;
      }

      if (officialFilter === "official" && !r.is_official_recorded) return false;
      if (officialFilter === "pending" && r.is_official_recorded) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
        const hit =
          r.product_name.toLocaleLowerCase("tr-TR").includes(q) ||
          r.customer_name.toLocaleLowerCase("tr-TR").includes(q) ||
          (r.notes || "").toLocaleLowerCase("tr-TR").includes(q);
        if (!hit) return false;
      }

      return true;
    });
  }, [records, dateFilter, officialFilter, searchQuery]);

  const stats = useMemo(() => {
    const uniqueCustomers = new Set(filteredRecords.map((r) => r.customer_name)).size;
    const uniqueProducts = new Set(filteredRecords.map((r) => r.product_name)).size;
    const officialCount = filteredRecords.filter((r) => r.is_official_recorded).length;
    const pendingCount = filteredRecords.length - officialCount;
    return {
      totalRecords: filteredRecords.length,
      uniqueCustomers,
      uniqueProducts,
      officialCount,
      pendingCount,
    };
  }, [filteredRecords]);

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;
    const rows = filteredRecords.map((r) => ({
      "Satış Tarihi": formatDisplayDate(r.sale_date),
      "Ürün Adı": r.product_name,
      "Kime (Firma)": r.customer_name,
      "Miktar": r.quantity,
      "Birim": r.unit,
      "Resmî Sisteme İşlendi": r.is_official_recorded ? "Evet" : "Hayır",
      "Not": r.notes || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Satis Kayitlari");
    XLSX.writeFile(wb, `Satis_Kayitlari_${getTodayDateString()}.xlsx`);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SNIPPET);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Supabase Table Notice if missing */}
      {tableMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <div className="font-bold">
                Supabase &quot;sales_records&quot; tablosu henüz oluşturulmamış
              </div>
              <p className="text-amber-700 mt-0.5">
                Kayıtlar şu an tarayıcı hafızasında tutuluyor. Kalıcı bulut kaydı için{" "}
                <code>data/sales_records_schema.sql</code> dosyasını Supabase SQL Editor&apos;de çalıştırın.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopySql}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shrink-0 transition-colors"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSql ? "Kopyalandı" : "SQL Kopyala"}</span>
          </button>
        </div>
      )}

      {/* Quick Add Sale Form */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold mb-1.5">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Hızlı Satış Defteri</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Satış Kaydı Ekle
            </h2>
            <p className="text-xs text-slate-500">
              Kime, hangi ürünü, ne kadar ve ne zaman sattığınızı hızlıca kaydedin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold">
              {stats.totalRecords} Kayıt
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 font-bold">
              {stats.uniqueCustomers} Firma
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 font-bold">
              {stats.officialCount} Resmî İşlenen
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 font-bold">
              {stats.pendingCount} Bekleyen
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAddRecord} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Product Name with suggestions */}
          <div ref={productBoxRef} className="sm:col-span-4 relative">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Ürün Adı *
            </label>
            <div className="relative">
              <Package className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={productName}
                onFocus={() => setProductDropdownOpen(true)}
                onChange={(e) => {
                  setProductName(e.target.value);
                  setProductDropdownOpen(true);
                }}
                placeholder="Ürün adı yazın veya seçin..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {productDropdownOpen && filteredProductOptions.length > 0 && (
              <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1">
                {filteredProductOptions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setProductName(p.name);
                      if (p.unit && UNIT_OPTIONS.includes(p.unit)) {
                        setUnit(p.unit);
                      }
                      setProductDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center justify-between gap-2"
                  >
                    <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {p.unit || "Adet"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer Name with Supabase + manual entry */}
          <div ref={customerBoxRef} className="sm:col-span-4 relative">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Kime (Firma / Müşteri) *
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={customerName}
                onFocus={() => setCustomerDropdownOpen(true)}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setCustomerDropdownOpen(true);
                }}
                placeholder="Firma seçin veya manuel yazın..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {customerDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1">
                {customerName.trim() &&
                  !filteredFirmOptions.some(
                    (f) =>
                      f.toLocaleLowerCase("tr-TR") ===
                      customerName.trim().toLocaleLowerCase("tr-TR")
                  ) && (
                    <button
                      type="button"
                      onClick={() => setCustomerDropdownOpen(false)}
                      className="w-full text-left px-3 py-2 text-xs bg-emerald-50 text-emerald-800 font-bold border-b border-emerald-100"
                    >
                      + Manuel kullan: &quot;{customerName.trim()}&quot;
                    </button>
                  )}
                {filteredFirmOptions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">
                    Listede eşleşme yok — yazdığınız firma adı manuel kaydedilecek.
                  </div>
                ) : (
                  filteredFirmOptions.map((firm) => (
                    <button
                      key={firm}
                      type="button"
                      onClick={() => {
                        setCustomerName(firm);
                        setCustomerDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-indigo-50 truncate"
                    >
                      {firm}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Quantity + Unit */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Ne Kadar *
            </label>
            <div className="flex items-center">
              <input
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-1/2 px-2.5 py-2.5 rounded-l-xl border border-r-0 border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-1/2 px-1.5 py-2.5 rounded-r-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sale Date */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Ne Zaman *
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full pl-8 pr-2 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Optional Note + Official Status + Submit */}
          <div className="sm:col-span-6">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsiyonel kısa not (ör: şantiye teslim, plaka, vb.)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="sm:col-span-3 flex items-center">
            <label className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer select-none hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={isOfficialRecorded}
                onChange={(e) => setIsOfficialRecorded(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-700">
                Resmî Sisteme İşlendi
              </span>
            </label>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full h-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Satışı Kaydet</span>
            </button>
          </div>
        </form>
      </div>

      {/* Records List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-black text-slate-900">
              Satış Kayıtları ({filteredRecords.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ürün veya firma ara..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
              {(
                [
                  ["all", "Tümü"],
                  ["today", "Bugün"],
                  ["week", "7 Gün"],
                  ["month", "Bu Ay"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDateFilter(key)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    dateFilter === key
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
              {(
                [
                  ["all", "Tümü"],
                  ["pending", "Bekleyen"],
                  ["official", "Resmî İşlendi"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOfficialFilter(key)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    officialFilter === key
                      ? key === "pending"
                        ? "bg-amber-500 text-white"
                        : "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredRecords.length > 0 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel İndir</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Kayıtlar yükleniyor...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Gösterilecek satış kaydı bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4 w-32">Tarih</th>
                  <th className="py-3 px-4">Ürün Adı</th>
                  <th className="py-3 px-4">Kime (Firma)</th>
                  <th className="py-3 px-4 text-right w-36">Miktar</th>
                  <th className="py-3 px-4 text-center w-36">Resmî Durum</th>
                  <th className="py-3 px-4">Not</th>
                  <th className="py-3 px-4 text-right w-24">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((rec) => {
                  const isEditing = editingId === rec.id;
                  if (isEditing) {
                    return (
                      <tr key={rec.id} className="bg-amber-50/40">
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            value={editDraft.sale_date || ""}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, sale_date: e.target.value })
                            }
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={editDraft.product_name || ""}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, product_name: e.target.value })
                            }
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={editDraft.customer_name || ""}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, customer_name: e.target.value })
                            }
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              value={editDraft.quantity ?? ""}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  quantity: Number(e.target.value),
                                })
                              }
                              className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-right"
                            />
                            <select
                              value={editDraft.unit || "Adet"}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, unit: e.target.value })
                              }
                              className="px-1.5 py-1 rounded-lg border border-slate-300 bg-white text-xs"
                            >
                              {UNIT_OPTIONS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(editDraft.is_official_recorded)}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  is_official_recorded: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-emerald-600"
                            />
                            <span>İşlendi</span>
                          </label>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={editDraft.notes || ""}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, notes: e.target.value })
                            }
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(rec.id)}
                              className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                              title="Kaydet"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300"
                              title="İptal"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                        {formatDisplayDate(rec.sale_date)}
                      </td>
                      <td className="py-3 px-4 font-extrabold text-slate-900">
                        {rec.product_name}
                      </td>
                      <td className="py-3 px-4 font-bold text-indigo-700">
                        {rec.customer_name}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                        {rec.quantity.toLocaleString("tr-TR")} {rec.unit}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleOfficial(rec)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                            rec.is_official_recorded
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                          }`}
                          title="Resmî sisteme işlenme durumunu değiştir"
                        >
                          {rec.is_official_recorded ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Resmî İşlendi</span>
                            </>
                          ) : (
                            <span>Bekliyor</span>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{rec.notes || "—"}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(rec.id);
                              setEditDraft({ ...rec });
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Düzenle"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(rec.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

