"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Award,
  Building2,
  Download,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { QuoteCurrency, ReceivedQuoteDocument } from "../types/receivedQuotes";
import { buildComparisonMatrix, normalizeQuoteText } from "../utils/receivedQuotesParser";

const PRODUCT_SHEETS_STORAGE_KEY = "easy_accounting_product_quote_sheets_v1";

export interface ProductQuoteSupplierEntry {
  unitPrice: string;
  shipping: string;
}

export interface ProductQuoteSheet {
  id: string;
  productName: string;
  unitLabel: string;
  requestedQty: string;
  vatRate: string;
  currency: QuoteCurrency;
  suppliers: string[];
  entries: Record<string, ProductQuoteSupplierEntry>;
}

export function parseLocaleNumber(raw: string): number {
  const cleaned = (raw || "").trim().replace(/\s+/g, "");
  if (!cleaned) return 0;

  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }

  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const lastPart = parts[parts.length - 1];
    // e.g. "2.000" or "1.250.000" -> thousands separator
    if (lastPart.length === 3 && parts.slice(1).every((p) => p.length === 3)) {
      const num = Number(cleaned.replace(/\./g, ""));
      return Number.isFinite(num) ? num : 0;
    }
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatMoneyValue(amount: number, currency: QuoteCurrency): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
  return `${symbol}${amount.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function readInitialProductSheets(): ProductQuoteSheet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRODUCT_SHEETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Remove legacy demo card ("akas, barış, günerler") if present
      return parsed.filter(
        (s: ProductQuoteSheet) => !(typeof s?.id === "string" && s.id.startsWith("ps-demo-"))
      );
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

interface ProductQuoteCardsProps {
  quotes: ReceivedQuoteDocument[];
}

export default function ProductQuoteCards({ quotes }: ProductQuoteCardsProps) {
  const [sheets, setSheets] = useState<ProductQuoteSheet[]>(readInitialProductSheets);

  // Quick Add Product form
  const [newProductName, setNewProductName] = useState("");
  const [newUnitLabel, setNewUnitLabel] = useState("1 adet");
  const [newRequestedQty, setNewRequestedQty] = useState("1");
  const [newVatRate, setNewVatRate] = useState("20");

  // Quick Add Global Firm
  const [newGlobalFirm, setNewGlobalFirm] = useState("");

  // Per-card new firm input
  const [cardFirmInputs, setCardFirmInputs] = useState<Record<string, string>>({});

  const persistSheets = (next: ProductQuoteSheet[]) => {
    setSheets(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(PRODUCT_SHEETS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
    }
  };

  const allKnownSuppliers = useMemo(() => {
    const seen = new Set<string>();
    for (const s of sheets) {
      for (const sup of s.suppliers) {
        if (sup.trim()) seen.add(sup.trim());
      }
    }
    if (seen.size === 0) {
      return ["Firma 1", "Firma 2"];
    }
    return Array.from(seen);
  }, [sheets]);

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProductName.trim();
    if (!name) return;

    const unit = newUnitLabel.trim() || name;
    const entries: Record<string, ProductQuoteSupplierEntry> = {};
    for (const sup of allKnownSuppliers) {
      entries[sup] = { unitPrice: "", shipping: "" };
    }

    const created: ProductQuoteSheet = {
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productName: name,
      unitLabel: unit,
      requestedQty: newRequestedQty.trim() || "1",
      vatRate: newVatRate.trim() || "20",
      currency: "TRY",
      suppliers: [...allKnownSuppliers],
      entries,
    };

    persistSheets([created, ...sheets]);
    setNewProductName("");
  };

  const handleAddGlobalFirm = (e: React.FormEvent) => {
    e.preventDefault();
    const firm = newGlobalFirm.trim();
    if (!firm) return;

    if (sheets.length === 0) {
      const created: ProductQuoteSheet = {
        id: `ps-${Date.now()}`,
        productName: "Yeni Ürün",
        unitLabel: "1 adet",
        requestedQty: "1",
        vatRate: "20",
        currency: "TRY",
        suppliers: [firm],
        entries: { [firm]: { unitPrice: "", shipping: "" } },
      };
      persistSheets([created]);
      setNewGlobalFirm("");
      return;
    }

    const next = sheets.map((s) => {
      if (s.suppliers.includes(firm)) return s;
      return {
        ...s,
        suppliers: [...s.suppliers, firm],
        entries: {
          ...s.entries,
          [firm]: { unitPrice: "", shipping: "" },
        },
      };
    });
    persistSheets(next);
    setNewGlobalFirm("");
  };

  const handleAddFirmToSheet = (sheetId: string) => {
    const firm = (cardFirmInputs[sheetId] || "").trim();
    if (!firm) return;

    const next = sheets.map((s) => {
      if (s.id !== sheetId) return s;
      if (s.suppliers.includes(firm)) return s;
      return {
        ...s,
        suppliers: [...s.suppliers, firm],
        entries: {
          ...s.entries,
          [firm]: { unitPrice: "", shipping: "" },
        },
      };
    });
    persistSheets(next);
    setCardFirmInputs((prev) => ({ ...prev, [sheetId]: "" }));
  };

  const handleRenameFirmInSheet = (sheetId: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    const next = sheets.map((s) => {
      if (s.id !== sheetId) return s;
      if (s.suppliers.includes(trimmed)) return s;
      const newSuppliers = s.suppliers.map((sup) => (sup === oldName ? trimmed : sup));
      const newEntries: Record<string, ProductQuoteSupplierEntry> = {};
      for (const sup of newSuppliers) {
        if (sup === trimmed) {
          newEntries[trimmed] = s.entries[oldName] || { unitPrice: "", shipping: "" };
        } else {
          newEntries[sup] = s.entries[sup] || { unitPrice: "", shipping: "" };
        }
      }
      return { ...s, suppliers: newSuppliers, entries: newEntries };
    });
    persistSheets(next);
  };

  const handleRemoveFirmFromSheet = (sheetId: string, firmName: string) => {
    const next = sheets.map((s) => {
      if (s.id !== sheetId) return s;
      const newSuppliers = s.suppliers.filter((sup) => sup !== firmName);
      const newEntries = { ...s.entries };
      delete newEntries[firmName];
      return { ...s, suppliers: newSuppliers, entries: newEntries };
    });
    persistSheets(next);
  };

  const handleUpdateSheetField = (
    sheetId: string,
    field: "productName" | "unitLabel" | "requestedQty" | "vatRate" | "currency",
    value: string
  ) => {
    const next = sheets.map((s) => {
      if (s.id !== sheetId) return s;
      return { ...s, [field]: value };
    });
    persistSheets(next);
  };

  const handleUpdateCell = (
    sheetId: string,
    firmName: string,
    field: "unitPrice" | "shipping",
    value: string
  ) => {
    const next = sheets.map((s) => {
      if (s.id !== sheetId) return s;
      const prevEntry = s.entries[firmName] || { unitPrice: "", shipping: "" };
      return {
        ...s,
        entries: {
          ...s.entries,
          [firmName]: {
            ...prevEntry,
            [field]: value,
          },
        },
      };
    });
    persistSheets(next);
  };

  const handleDeleteSheet = (sheetId: string) => {
    persistSheets(sheets.filter((s) => s.id !== sheetId));
  };

  const isShippingItemName = (name: string) =>
    /(nakliye|sevkiyat|kargo|tasima|taşıma|ulasim|ulaşım)/i.test(normalizeQuoteText(name));

  const mergeQuotesIntoSheets = (
    baseSheets: ProductQuoteSheet[],
    sourceQuotes: ReceivedQuoteDocument[]
  ): ProductQuoteSheet[] => {
    if (sourceQuotes.length === 0) return baseSheets;

    // 1. Compute shipping cost per quote from any shipping/nakliye line items
    const shippingByQuoteId: Record<string, number> = {};
    const productOnlyQuotes: ReceivedQuoteDocument[] = sourceQuotes.map((q) => {
      let shipSum = 0;
      const nonShippingItems = q.items.filter((it) => {
        if (isShippingItemName(it.name)) {
          shipSum += it.lineTotal > 0 ? it.lineTotal : it.unitPrice * (it.quantity || 1);
          return false;
        }
        return true;
      });
      shippingByQuoteId[q.id] = Math.round(shipSum * 100) / 100;
      return { ...q, items: nonShippingItems };
    });

    const matrix = buildComparisonMatrix(productOnlyQuotes);
    if (matrix.length === 0) return baseSheets;

    const quoteSuppliers = sourceQuotes.map((q) => q.supplierName);
    const nextSheets = [...baseSheets];

    for (let idx = 0; idx < matrix.length; idx++) {
      const row = matrix[idx];
      const existingIdx = nextSheets.findIndex(
        (s) => normalizeQuoteText(s.productName) === normalizeQuoteText(row.displayName)
      );

      let firstQty = 1;
      let firstVat = 20;
      let foundSample = false;
      const newEntries: Record<string, ProductQuoteSupplierEntry> = {};

      for (const q of productOnlyQuotes) {
        const cell = row.cells[q.id];
        const shipVal = shippingByQuoteId[q.id] || 0;
        if (cell) {
          newEntries[q.supplierName] = {
            unitPrice: cell.effectiveUnitPrice ? String(cell.effectiveUnitPrice) : "",
            shipping: shipVal > 0 ? String(shipVal) : "",
          };
          if (!foundSample) {
            firstQty = cell.item.quantity || 1;
            firstVat = cell.item.vatRate ?? 20;
            foundSample = true;
          }
        }
      }

      if (existingIdx >= 0) {
        const existing = nextSheets[existingIdx];
        const mergedSuppliers = Array.from(new Set([...existing.suppliers, ...quoteSuppliers]));
        nextSheets[existingIdx] = {
          ...existing,
          suppliers: mergedSuppliers,
          entries: {
            ...existing.entries,
            ...newEntries,
          },
        };
      } else {
        const entriesWithDefaults: Record<string, ProductQuoteSupplierEntry> = {};
        for (const sup of quoteSuppliers) {
          entriesWithDefaults[sup] = newEntries[sup] || { unitPrice: "", shipping: "" };
        }
        nextSheets.unshift({
          id: `ps-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          productName: row.displayName,
          unitLabel: `1 ${row.canonicalUnit || "adet"}`,
          requestedQty: String(firstQty),
          vatRate: String(firstVat),
          currency: sourceQuotes[0]?.currency || "TRY",
          suppliers: quoteSuppliers,
          entries: entriesWithDefaults,
        });
      }
    }

    return nextSheets;
  };

  const syncedQuoteIdsRef = useRef<Set<string>>(new Set(quotes.map((q) => q.id)));

  useEffect(() => {
    const newQuotes = quotes.filter((q) => !syncedQuoteIdsRef.current.has(q.id));
    if (newQuotes.length === 0) return;
    newQuotes.forEach((q) => syncedQuoteIdsRef.current.add(q.id));
    const quotesWithItems = newQuotes.filter((q) => q.items.length > 0);
    if (quotesWithItems.length === 0) return;

    setSheets((prev) => {
      const merged = mergeQuotesIntoSheets(prev, quotesWithItems);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PRODUCT_SHEETS_STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore storage errors
        }
      }
      return merged;
    });
  }, [quotes]);

  const handleImportFromUploadedQuotes = () => {
    if (quotes.length === 0) return;
    const merged = mergeQuotesIntoSheets(sheets, quotes);
    persistSheets(merged);
  };

  const computeSheetTotals = (sheet: ProductQuoteSheet) => {
    const qty = parseLocaleNumber(sheet.requestedQty);
    const vat = parseLocaleNumber(sheet.vatRate);

    const totals: Record<string, number> = {};
    let minPositiveTotal = Infinity;
    let bestSupplier: string | null = null;
    let maxTotal = 0;

    for (const sup of sheet.suppliers) {
      const entry = sheet.entries[sup] || { unitPrice: "", shipping: "" };
      const unitPrice = parseLocaleNumber(entry.unitPrice);
      const shipping = parseLocaleNumber(entry.shipping);

      let total = 0;
      if (unitPrice > 0 || shipping > 0) {
        total = (unitPrice * qty + shipping) * (1 + vat / 100);
      }
      totals[sup] = total;

      if (total > 0 && total < minPositiveTotal) {
        minPositiveTotal = total;
        bestSupplier = sup;
      }
      if (total > maxTotal) {
        maxTotal = total;
      }
    }

    return {
      totals,
      bestSupplier,
      minPositiveTotal: Number.isFinite(minPositiveTotal) ? minPositiveTotal : 0,
      maxTotal,
    };
  };

  const handleExportProductSheetsExcel = () => {
    if (sheets.length === 0) return;
    const wb = XLSX.utils.book_new();
    const aoa: (string | number)[][] = [];

    for (const sheet of sheets) {
      const { totals } = computeSheetTotals(sheet);
      aoa.push([sheet.productName, ...sheet.suppliers]);
      aoa.push([
        sheet.unitLabel || sheet.productName,
        ...sheet.suppliers.map((s) => parseLocaleNumber(sheet.entries[s]?.unitPrice || "")),
      ]);
      aoa.push([
        "nakliye",
        ...sheet.suppliers.map((s) => parseLocaleNumber(sheet.entries[s]?.shipping || "")),
      ]);
      aoa.push(["istenen miktar", parseLocaleNumber(sheet.requestedQty)]);
      aoa.push(["kdv (%)", parseLocaleNumber(sheet.vatRate)]);
      aoa.push(["total", ...sheet.suppliers.map((s) => Math.round((totals[s] || 0) * 100) / 100)]);
      aoa.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "Urun Bazli Karsilastirma");
    XLSX.writeFile(
      wb,
      `Urun_Bazli_Teklif_Karsilastirma_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (
    <div className="p-5 space-y-6">
      {/* Top Action Bar: Add Product & Add Firm */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50/90 border border-slate-200 rounded-2xl p-4">
        {/* Add Product Form */}
        <form onSubmit={handleAddProduct} className="lg:col-span-7 space-y-2">
          <div className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
            <PackagePlus className="w-4 h-4 text-indigo-600" />
            <span>Yeni Ürün Ekle</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Ürün adı (örn: Paletli Tuğla)"
              className="col-span-2 sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              value={newUnitLabel}
              onChange={(e) => setNewUnitLabel(e.target.value)}
              placeholder="Birim (örn: 1 palet)"
              className="col-span-1 sm:col-span-3 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              value={newRequestedQty}
              onChange={(e) => setNewRequestedQty(e.target.value)}
              placeholder="Miktar"
              title="İstenen Miktar"
              className="col-span-1 sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="col-span-1 sm:col-span-1 relative">
              <input
                type="text"
                value={newVatRate}
                onChange={(e) => setNewVatRate(e.target.value)}
                placeholder="20"
                title="KDV %"
                className="w-full pl-2 pr-5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                %
              </span>
            </div>
            <button
              type="submit"
              className="col-span-1 sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ürün Ekle</span>
            </button>
          </div>
        </form>

        {/* Add Global Firm + Import/Export */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-4">
          <form onSubmit={handleAddGlobalFirm} className="space-y-2">
            <div className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span>Tüm Ürünlere Firma Ekle</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newGlobalFirm}
                onChange={(e) => setNewGlobalFirm(e.target.value)}
                placeholder="Firma adı (örn: Akas, Barış)"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Firma Ekle</span>
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {quotes.length > 0 && (
              <button
                type="button"
                onClick={handleImportFromUploadedQuotes}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Yüklenen Tekliflerden Aktar</span>
              </button>
            )}
            {sheets.length > 0 && (
              <button
                type="button"
                onClick={handleExportProductSheetsExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel İndir</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Product-by-Product Comparison Tables */}
      {sheets.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <p className="text-sm font-bold text-slate-600">
            Henüz ürün karşılaştırma tablosu yok.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Yukarıdan ürün ve firma ekleyerek ürün bazlı teklif kıyaslamaya başlayabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sheets.map((sheet) => {
            const { totals, bestSupplier, minPositiveTotal, maxTotal } =
              computeSheetTotals(sheet);
            const savings =
              bestSupplier && maxTotal > minPositiveTotal
                ? maxTotal - minPositiveTotal
                : 0;

            return (
              <div
                key={sheet.id}
                className="rounded-2xl border border-slate-300 bg-white shadow-sm overflow-hidden"
              >
                {/* Card Title Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-100/80 border-b border-slate-200">
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
                    <input
                      type="text"
                      value={sheet.productName}
                      onChange={(e) =>
                        handleUpdateSheetField(sheet.id, "productName", e.target.value)
                      }
                      className="px-2.5 py-1 rounded-lg border border-transparent hover:border-slate-300 focus:border-indigo-500 bg-transparent focus:bg-white text-sm font-black text-slate-900 focus:outline-none min-w-[180px]"
                      placeholder="Ürün Adı"
                    />
                    {bestSupplier && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                        <Award className="w-3.5 h-3.5" />
                        En Uygun: {bestSupplier} (
                        {formatMoneyValue(minPositiveTotal, sheet.currency)})
                        {savings > 0 && (
                          <span className="text-emerald-700">
                            • {formatMoneyValue(savings, sheet.currency)} tasarruf
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Add firm directly to this product */}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={cardFirmInputs[sheet.id] || ""}
                        onChange={(e) =>
                          setCardFirmInputs((prev) => ({
                            ...prev,
                            [sheet.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddFirmToSheet(sheet.id);
                          }
                        }}
                        placeholder="+ Firma ekle"
                        className="w-28 sm:w-32 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddFirmToSheet(sheet.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                        title="Bu ürüne firma ekle"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <select
                      value={sheet.currency}
                      onChange={(e) =>
                        handleUpdateSheetField(sheet.id, "currency", e.target.value)
                      }
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700"
                    >
                      <option value="TRY">₺ TRY</option>
                      <option value="USD">$ USD</option>
                      <option value="EUR">€ EUR</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteSheet(sheet.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Ürünü sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Excel-style Product Comparison Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-300">
                        <th className="py-2.5 px-3 text-left font-bold text-slate-500 w-44 min-w-[150px] border-r border-slate-300">
                          Kalem / Detay
                        </th>
                        {sheet.suppliers.map((sup) => {
                          const isBest = bestSupplier === sup;
                          return (
                            <th
                              key={sup}
                              className={`py-2 px-3 text-left font-extrabold min-w-[150px] border-r border-slate-300 last:border-r-0 ${
                                isBest ? "bg-emerald-50 text-emerald-900" : "text-slate-900"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <input
                                  type="text"
                                  defaultValue={sup}
                                  onBlur={(e) =>
                                    handleRenameFirmInSheet(sheet.id, sup, e.target.value)
                                  }
                                  className="w-full bg-transparent font-extrabold focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFirmFromSheet(sheet.id, sup)}
                                  className="p-0.5 rounded text-slate-400 hover:text-rose-600 shrink-0"
                                  title={`${sup} firmasını çıkar`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {/* Row 1: Birim / Ürün Fiyatı (e.g. 1 palet) */}
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 px-3 font-bold text-slate-800 bg-slate-50/60 border-r border-slate-300">
                          <input
                            type="text"
                            value={sheet.unitLabel}
                            onChange={(e) =>
                              handleUpdateSheetField(sheet.id, "unitLabel", e.target.value)
                            }
                            placeholder="1 palet"
                            className="w-full bg-transparent font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5"
                          />
                        </td>
                        {sheet.suppliers.map((sup) => {
                          const val = sheet.entries[sup]?.unitPrice ?? "";
                          const isBest = bestSupplier === sup;
                          return (
                            <td
                              key={sup}
                              className={`p-1 border-r border-slate-200 last:border-r-0 ${
                                isBest ? "bg-emerald-50/40" : ""
                              }`}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                value={val}
                                onChange={(e) =>
                                  handleUpdateCell(sheet.id, sup, "unitPrice", e.target.value)
                                }
                                placeholder="0,00"
                                className="w-full text-right font-semibold text-slate-900 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white bg-transparent focus:outline-none tabular-nums"
                              />
                            </td>
                          );
                        })}
                      </tr>

                      {/* Row 2: Nakliye */}
                      <tr className="border-b border-slate-200">
                        <td className="py-2 px-4 font-bold text-slate-700 bg-slate-50/60 border-r border-slate-300">
                          nakliye
                        </td>
                        {sheet.suppliers.map((sup) => {
                          const val = sheet.entries[sup]?.shipping ?? "";
                          const isBest = bestSupplier === sup;
                          return (
                            <td
                              key={sup}
                              className={`p-1 border-r border-slate-200 last:border-r-0 ${
                                isBest ? "bg-emerald-50/40" : ""
                              }`}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                value={val}
                                onChange={(e) =>
                                  handleUpdateCell(sheet.id, sup, "shipping", e.target.value)
                                }
                                placeholder="0"
                                className="w-full text-right font-semibold text-slate-900 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white bg-transparent focus:outline-none tabular-nums"
                              />
                            </td>
                          );
                        })}
                      </tr>

                      {/* Row 3: İstenen Miktar */}
                      <tr className="border-b border-slate-200 bg-slate-50/30">
                        <td className="py-2 px-4 font-bold text-slate-700 bg-slate-50/60 border-r border-slate-300">
                          istenen miktar
                        </td>
                        <td
                          colSpan={Math.max(1, sheet.suppliers.length)}
                          className="p-1"
                        >
                          <div className="flex justify-end">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sheet.requestedQty}
                              onChange={(e) =>
                                handleUpdateSheetField(
                                  sheet.id,
                                  "requestedQty",
                                  e.target.value
                                )
                              }
                              className="w-32 text-right font-bold text-slate-900 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white bg-transparent focus:outline-none tabular-nums"
                            />
                          </div>
                        </td>
                      </tr>

                      {/* Row 4: KDV */}
                      <tr className="border-b border-slate-300 bg-slate-50/30">
                        <td className="py-2 px-4 font-bold text-slate-700 bg-slate-50/60 border-r border-slate-300">
                          kdv
                        </td>
                        <td
                          colSpan={Math.max(1, sheet.suppliers.length)}
                          className="p-1"
                        >
                          <div className="flex items-center justify-end gap-1 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sheet.vatRate}
                              onChange={(e) =>
                                handleUpdateSheetField(sheet.id, "vatRate", e.target.value)
                              }
                              className="w-24 text-right font-bold text-slate-900 px-2 py-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white bg-transparent focus:outline-none tabular-nums"
                            />
                            <span className="font-bold text-slate-600">%</span>
                          </div>
                        </td>
                      </tr>

                      {/* Row 5: Total */}
                      <tr className="bg-slate-100/70">
                        <td className="py-2.5 px-4 font-black text-slate-900 border-r border-slate-300">
                          total
                        </td>
                        {sheet.suppliers.map((sup) => {
                          const total = totals[sup] || 0;
                          const isBest = bestSupplier === sup;
                          return (
                            <td
                              key={sup}
                              className={`py-2.5 px-3 text-right font-black border-r border-slate-300 last:border-r-0 tabular-nums ${
                                isBest
                                  ? "bg-emerald-100/80 text-emerald-900"
                                  : "text-slate-900"
                              }`}
                            >
                              <div className="flex items-center justify-end gap-2">
                                {isBest && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                                    EN UYGUN
                                  </span>
                                )}
                                <span className="text-sm sm:text-base">
                                  {total === 0
                                    ? "0"
                                    : formatMoneyValue(total, sheet.currency)}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
