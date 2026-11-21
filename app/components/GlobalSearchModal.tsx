"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Building2,
  FileText,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { AccountRecord, AppMenuId, ProductItem } from "../types/accounting";
import type { GlobalSearchResultItem } from "../api/global-search/route";

interface GlobalSearchModalProps {
  products?: ProductItem[];
  records?: AccountRecord[];
  onNavigateTab: (tab: AppMenuId) => void;
}

export default function GlobalSearchModal({
  products = [],
  records = [],
  onNavigateTab,
}: GlobalSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [serverResults, setServerResults] = useState<GlobalSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced server search
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data?.success && Array.isArray(data.results)) {
          setServerResults(data.results);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Also search local products & mizan records immediately
  const localResults = useMemo<GlobalSearchResultItem[]>(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (q.length < 2) return [];

    const out: GlobalSearchResultItem[] = [];
    for (const p of products) {
      if (
        p.name.toLocaleLowerCase("tr-TR").includes(q) ||
        (p.code || "").toLocaleLowerCase("tr-TR").includes(q)
      ) {
        out.push({
          id: `loc-prod-${p.id}`,
          category: "product",
          title: p.name,
          subtitle: `Stok Kodu: ${p.code || "-"} • ${p.unit || "Adet"}`,
          targetTab: "stock-tracking",
          badge: "Ürün (Katalog)",
        });
        if (out.length >= 6) break;
      }
    }

    for (const r of records) {
      if (
        r.name.toLocaleLowerCase("tr-TR").includes(q) ||
        (r.code || "").toLocaleLowerCase("tr-TR").includes(q)
      ) {
        out.push({
          id: `loc-rec-${r.id}`,
          category: "customer",
          title: r.name,
          subtitle: `Hesap Kodu: ${r.code || "-"} • Bakiye: ${r.balance.toLocaleString("tr-TR")} TL`,
          targetTab: "summary",
          badge: "Mizan / Hesap",
        });
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [query, products, records]);

  const combinedResults = useMemo(() => {
    const seen = new Set<string>();
    const merged: GlobalSearchResultItem[] = [];
    for (const item of [...serverResults, ...localResults]) {
      const key = `${item.category}:${item.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }, [serverResults, localResults]);

  const renderCategoryIcon = (cat: GlobalSearchResultItem["category"]) => {
    switch (cat) {
      case "product":
        return <Package className="w-4 h-4 text-amber-600" />;
      case "contact":
        return <Building2 className="w-4 h-4 text-indigo-600" />;
      case "customer":
        return <Users className="w-4 h-4 text-emerald-600" />;
      case "proposal":
        return <FileText className="w-4 h-4 text-purple-600" />;
      case "sale":
        return <ShoppingBag className="w-4 h-4 text-emerald-600" />;
      case "transaction":
        return <FileText className="w-4 h-4 text-rose-600" />;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition-colors"
        title="Global Arama (Ctrl+K)"
      >
        <Search className="w-3.5 h-3.5 text-slate-500" />
        <span className="hidden md:inline">Global Ara...</span>
        <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded">
          ⌘K
        </kbd>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-4 pt-16 sm:pt-24"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200 flex items-center gap-3">
                <Search className="w-5 h-5 text-indigo-600 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuery(val);
                    if (val.trim().length < 2) setServerResults([]);
                  }}
                  placeholder="Ürün, müşteri, cari hesap, fatura, teklif veya işlem no ara..."
                  className="flex-1 text-sm font-semibold text-slate-900 focus:outline-none"
                />
                {isSearching && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-[60dvh] overflow-y-auto divide-y divide-slate-100">
                {query.trim().length < 2 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Aramak için en az 2 karakter yazın (Ürün, Müşteri, Cari, Teklif No, Fatura / İşlem No).
                  </div>
                ) : combinedResults.length === 0 && !isSearching ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    &quot;{query}&quot; ile eşleşen kayıt bulunamadı.
                  </div>
                ) : (
                  combinedResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigateTab(item.targetTab as AppMenuId);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50/50 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                          {renderCategoryIcon(item.category)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {item.badge}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
