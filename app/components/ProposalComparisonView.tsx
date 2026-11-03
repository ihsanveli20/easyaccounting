"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Sparkles,
  Trophy,
  TrendingDown,
  TrendingUp,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertCircle,
  Filter,
  ArrowRight,
  Building,
  Truck,
  Calendar,
  Percent,
  RefreshCw,
  Copy,
  Check,
  Globe,
  Store,
  Layers,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  BadgeCheck,
  ArrowUpDown,
  Coins,
  Package,
  BookmarkPlus,
  Compass,
} from "lucide-react";
import {
  ProductItem,
  SupplierQuote,
  MarketPriceResult,
} from "../types/accounting";
import {
  DEFAULT_SUPPLIER_QUOTES,
  calculateNetUnitCost,
  getStoredSupplierQuotes,
  saveStoredSupplierQuotes,
  findQuotesForProduct,
  normalizeProductText,
} from "../utils/supplierQuotes";

interface ProposalComparisonViewProps {
  products?: ProductItem[];
  onGoToQuote?: (prefill?: {
    materialName: string;
    unit: string;
    unitPrice: number;
    quantity?: number;
  }) => void;
  onGoToHistory?: () => void;
}

const QUICK_EXAMPLES = [
  { label: "PHILIPS DST7510/80 Azur Buharlı Ütü", unit: "Adet", qty: 1, note: "UGİ Teknoloji & Diğerleri" },
  { label: "19*19*13,5 KARKAS TUĞLA PALETLİ KİLSAN", unit: "Adet", qty: 1000, note: "Fabrika & Toptancı" },
  { label: "OYAK ÇİMENTO 32.5 50KG", unit: "Adet", qty: 50, note: "Bölge Bayileri" },
  { label: "PERDAH KUM", unit: "m³", qty: 6, note: "Agrega Ocakları" },
];

export default function ProposalComparisonView({
  products = [],
  onGoToQuote,
  onGoToHistory,
}: ProposalComparisonViewProps) {
  // Navigation sub-tabs:
  // "compare" = Ürün Kıyaslama & En Uygunu Bul
  // "suppliers" = Tedarikçi Fiyat Havuzu
  // "market-pulse" = Canlı İnternet & Açık Web Arama
  const [activeSubTab, setActiveSubTab] = useState<
    "compare" | "suppliers" | "market-pulse"
  >("compare");

  // Supplier Quotes state
  const [quotes, setQuotes] = useState<SupplierQuote[]>(() =>
    getStoredSupplierQuotes()
  );

  // Search & Filter State
  const [selectedProductQuery, setSelectedProductQuery] =
    useState<string>("PHILIPS DST7510/80 Azur Buharlı Ütü");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState<boolean>(false);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedUnit, setSelectedUnit] = useState<string>("Adet");

  // Cost calculation preferences
  const [vatIncluded, setVatIncluded] = useState<boolean>(false);
  const [includeShipping, setIncludeShipping] = useState<boolean>(true);
  const [paymentFilter, setPaymentFilter] = useState<string>("all"); // "all", "cash", "30_days", "60_days"

  // Web Market Search State
  const [marketResults, setMarketResults] = useState<
    (MarketPriceResult & { badge?: string; snippet?: string })[]
  >([]);
  const [isSearchingMarket, setIsSearchingMarket] = useState<boolean>(false);
  const [marketSummary, setMarketSummary] = useState<{
    minPrice: number;
    avgPrice: number;
    maxPrice: number;
    bestSource: string;
    totalSavings?: number;
    savingsPercent?: number;
    currency: string;
  } | null>(null);

  // Add / Edit Supplier Quote Modal State
  const [quoteModalOpen, setQuoteModalOpen] = useState<boolean>(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SupplierQuote>>({
    supplierName: "",
    productName: "",
    unit: "Adet",
    unitPrice: 0,
    discountPercent: 0,
    vatRate: 20,
    vatIncluded: false,
    shippingCostPerUnit: 0,
    paymentTerm: "cash",
    notes: "",
    sourceType: "supplier",
  });

  // Toast State
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Sync quotes with localStorage
  const handleSaveQuotes = (updated: SupplierQuote[]) => {
    setQuotes(updated);
    saveStoredSupplierQuotes(updated);
  };

  // Autocomplete products from catalog + existing quotes
  const productOptions = useMemo(() => {
    const list: Array<{ name: string; unit: string; category?: string }> = [];
    const seen = new Set<string>();

    // From quotes
    quotes.forEach((q) => {
      const key = q.productName.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ name: q.productName, unit: q.unit, category: "Tedarikçi Listesi" });
      }
    });

    // From products catalog
    products.forEach((p) => {
      const key = p.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ name: p.name, unit: p.unit || "Adet", category: p.category || "Katalog" });
      }
    });

    return list;
  }, [quotes, products]);

  const filteredDropdownOptions = useMemo(() => {
    if (!selectedProductQuery.trim()) return productOptions.slice(0, 10);
    const norm = normalizeProductText(selectedProductQuery);
    return productOptions
      .filter((opt) => normalizeProductText(opt.name).includes(norm))
      .slice(0, 10);
  }, [selectedProductQuery, productOptions]);

  // Combined quotes (registered quotes + live web results matching this product)
  const allAvailableOffers = useMemo(() => {
    const registered = findQuotesForProduct(selectedProductQuery, quotes);

    // Also transform live market results into comparable offers
    const webOffers: SupplierQuote[] = marketResults.map((m) => ({
      id: `web-${m.id}`,
      supplierName: m.source,
      productName: m.title || selectedProductQuery,
      unit: m.unit || selectedUnit || "Adet",
      unitPrice: m.price,
      discountPercent: 0,
      vatRate: 20,
      vatIncluded: true,
      shippingCostPerUnit: 0,
      paymentTerm: "cash",
      notes: `${m.shippingInfo || "Canlı Web Satıcısı"} • Doğrudan Link Mevcut`,
      sourceType: "market_web",
      sourceUrl: m.url,
      updatedAt: "Bugün",
    }));

    let combined = [...registered, ...webOffers];

    if (paymentFilter !== "all") {
      combined = combined.filter((q) => q.paymentTerm === paymentFilter);
    }

    // Sort by net effective unit cost ascending
    return combined.sort((a, b) => {
      const costA = calculateNetUnitCost(a, { vatIncluded, includeShipping });
      const costB = calculateNetUnitCost(b, { vatIncluded, includeShipping });
      return costA - costB;
    });
  }, [
    selectedProductQuery,
    quotes,
    marketResults,
    paymentFilter,
    vatIncluded,
    includeShipping,
    selectedUnit,
  ]);

  // The Winning (Best) Quote
  const bestQuote = allAvailableOffers[0] || null;

  // Comparison metrics (Min, Max, Avg, Savings)
  const comparisonStats = useMemo(() => {
    if (allAvailableOffers.length === 0) return null;

    const costs = allAvailableOffers.map((q) =>
      calculateNetUnitCost(q, { vatIncluded, includeShipping })
    );
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

    // Second best cost for comparison
    const secondCost = costs.length > 1 ? costs[1] : maxCost;
    const savingsPerUnit = secondCost - minCost;
    const totalSavings = savingsPerUnit * (quantity || 1);
    const savingsPercent =
      secondCost > 0 ? Math.round((savingsPerUnit / secondCost) * 100) : 0;

    return {
      minCost,
      maxCost,
      avgCost,
      savingsPerUnit,
      totalSavings,
      savingsPercent,
      count: allAvailableOffers.length,
    };
  }, [allAvailableOffers, vatIncluded, includeShipping, quantity]);

  // Fetch Live Market Prices from API (open web and multi-store search)
  const handleFetchMarketPrices = async (targetQuery?: string) => {
    const q = (targetQuery || selectedProductQuery).trim();
    if (!q) {
      showToast("Lütfen aranacak bir ürün adı giriniz.");
      return;
    }

    setIsSearchingMarket(true);
    try {
      const res = await fetch(`/api/market-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.results) {
          setMarketResults(data.results);
          setMarketSummary(data.marketSummary);
          showToast(
            `${data.results.length} farklı online mağaza ve satıcı fiyatı bulundu!`
          );
        }
      } else {
        showToast("Piyasa fiyatları alınamadı.");
      }
    } catch (err: any) {
      console.warn("Market search error:", err);
      showToast("Bağlantı hatası oluştu.");
    } finally {
      setIsSearchingMarket(false);
    }
  };

  // Trigger market search on product select if changed
  useEffect(() => {
    if (selectedProductQuery.trim()) {
      handleFetchMarketPrices(selectedProductQuery);
    }
  }, [selectedProductQuery]);

  // Transfer Winning Price to Quote Sheet
  const handleTransferToQuote = (quoteItem: {
    name: string;
    price: number;
    unit: string;
  }) => {
    try {
      sessionStorage.setItem(
        "easy_accounting_quote_prefill",
        JSON.stringify({
          materialName: quoteItem.name,
          unit: quoteItem.unit,
          unitPrice: quoteItem.price,
          quantity: quantity || 1,
        })
      );
    } catch {}

    if (onGoToQuote) {
      onGoToQuote({
        materialName: quoteItem.name,
        unit: quoteItem.unit,
        unitPrice: quoteItem.price,
        quantity: quantity || 1,
      });
    } else {
      showToast("Fiyat teklif modülüne hazırlandı!");
    }
  };

  // Save an online market result permanently into user's supplier list
  const handleAddMarketResultToSuppliers = (m: MarketPriceResult) => {
    const newQuote: SupplierQuote = {
      id: `sq-web-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      supplierName: m.source,
      productName: m.title || selectedProductQuery,
      unit: m.unit || selectedUnit || "Adet",
      unitPrice: m.price,
      discountPercent: 0,
      vatRate: 20,
      vatIncluded: true,
      shippingCostPerUnit: 0,
      paymentTerm: "cash",
      notes: `${m.shippingInfo || "Web Satıcısı"} • Kaynak: ${m.url}`,
      sourceType: "market_web",
      sourceUrl: m.url,
      updatedAt: new Date().toISOString().split("T")[0],
    };
    const updated = [newQuote, ...quotes];
    handleSaveQuotes(updated);
    showToast(`"${m.source}" (₺${m.price.toFixed(2)}) tedarikçi listenize eklendi!`);
  };

  // Copy Price to Clipboard
  const handleCopyPrice = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast("Birim fiyat panoya kopyalandı!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Delete Quote
  const handleDeleteQuote = (id: string) => {
    if (confirm("Bu tedarikçi teklifini silmek istediğinize emin misiniz?")) {
      const updated = quotes.filter((q) => q.id !== id);
      handleSaveQuotes(updated);
      showToast("Tedarikçi fiyatı silindi.");
    }
  };

  // Save Modal Form
  const handleSaveModalForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplierName?.trim() || !formData.productName?.trim()) {
      alert("Lütfen Tedarikçi Adı ve Ürün Adını doldurunuz.");
      return;
    }

    if (editingQuoteId) {
      const updated = quotes.map((q) =>
        q.id === editingQuoteId
          ? {
              ...q,
              ...(formData as SupplierQuote),
              updatedAt: new Date().toISOString().split("T")[0],
            }
          : q
      );
      handleSaveQuotes(updated);
      showToast("Tedarikçi teklifi güncellendi.");
    } else {
      const newQuote: SupplierQuote = {
        id: `sq-${Date.now()}`,
        supplierName: formData.supplierName.trim(),
        productName: formData.productName.trim(),
        productCode: formData.productCode?.trim() || undefined,
        unit: formData.unit?.trim() || "Adet",
        unitPrice: Number(formData.unitPrice) || 0,
        discountPercent: Number(formData.discountPercent) || 0,
        vatRate: Number(formData.vatRate) || 20,
        vatIncluded: Boolean(formData.vatIncluded),
        shippingCostPerUnit: Number(formData.shippingCostPerUnit) || 0,
        paymentTerm: formData.paymentTerm || "cash",
        notes: formData.notes?.trim() || "",
        sourceType: (formData.sourceType as any) || "supplier",
        updatedAt: new Date().toISOString().split("T")[0],
      };
      handleSaveQuotes([newQuote, ...quotes]);
      showToast("Yeni tedarikçi fiyatı eklendi.");
    }

    setQuoteModalOpen(false);
    setEditingQuoteId(null);
  };

  // Open Edit Modal
  const handleOpenEdit = (q: SupplierQuote) => {
    setEditingQuoteId(q.id);
    setFormData(q);
    setQuoteModalOpen(true);
  };

  // Reset to default sample quotes
  const handleResetDefaults = () => {
    if (
      confirm(
        "Tüm fiyat listesini varsayılan örnek tedarikçi teklifleriyle sıfırlamak istiyor musunuz?"
      )
    ) {
      handleSaveQuotes(DEFAULT_SUPPLIER_QUOTES);
      showToast("Örnek tedarikçi listesi yüklendi.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/95 text-white border border-indigo-500/30 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border border-indigo-500/20 text-white p-6 sm:p-8 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold tracking-wide uppercase mb-3 backdrop-blur-md shadow-xs">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Açık Web & Google Taraması</span>
              <span className="text-emerald-400/50">•</span>
              <span className="text-[11px] font-semibold text-emerald-200">
                Mağaza Sınırı Yok • Tüm İnternet
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              Fiyat İstihbaratı & Açık Web Fiyat Karşılaştırma
            </h1>
            <p className="text-sm text-slate-300/90 leading-relaxed">
              Google&apos;da arama yapar gibi herhangi bir ürünü arayın; bağımsız e-ticaret siteleri
              (örn: UGİ Teknoloji), pazaryerleri ve toptancı tedarikçiler arasındaki tüm fiyatları
              tarayıp en uygununu saniyeler içinde bulun.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(
                selectedProductQuery + " fiyat satın al"
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/25 hover:scale-102"
            >
              <Globe className="w-4 h-4" />
              <span>Google&apos;da Doğrudan Aç</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>

            <button
              onClick={() => {
                setEditingQuoteId(null);
                setFormData({
                  supplierName: "",
                  productName: selectedProductQuery || "",
                  unit: selectedUnit || "Adet",
                  unitPrice: 0,
                  discountPercent: 0,
                  vatRate: 20,
                  vatIncluded: false,
                  shippingCostPerUnit: 0,
                  paymentTerm: "cash",
                  notes: "",
                  sourceType: "supplier",
                });
                setQuoteModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-600/25 hover:scale-102"
            >
              <Plus className="w-4 h-4" />
              <span>Özel Tedarikçi Ekle</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-white/10">
          <button
            onClick={() => setActiveSubTab("compare")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === "compare"
                ? "bg-white text-slate-950 shadow-md scale-102"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Kıyasla & En Uygunu Bul ({allAvailableOffers.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab("market-pulse")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === "market-pulse"
                ? "bg-white text-slate-950 shadow-md scale-102"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Açık Web & Online Mağazalar ({marketResults.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab("suppliers")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === "suppliers"
                ? "bg-white text-slate-950 shadow-md scale-102"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Building className="w-4 h-4 text-indigo-500" />
            <span>Kayıtlı Tedarikçi Havuzu ({quotes.length})</span>
          </button>
        </div>
      </div>

      {/* Quick Example Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1">
          <Compass className="w-3.5 h-3.5 text-indigo-400" />
          Hızlı Örnek Aramalar:
        </span>
        {QUICK_EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedProductQuery(ex.label);
              setSelectedUnit(ex.unit);
              setQuantity(ex.qty);
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedProductQuery === ex.label
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400"
            }`}
          >
            <span>{ex.label}</span>
            <span className="text-[10px] opacity-75 font-normal">
              ({ex.note})
            </span>
          </button>
        ))}
      </div>

      {/* ===================================================================== */}
      {/* 1. TAB: KIYASLA & EN UYGUNU BUL (MAIN INTELLIGENCE ENGINE)             */}
      {/* ===================================================================== */}
      {activeSubTab === "compare" && (
        <div className="space-y-6">
          {/* Search & Calculation Parameters Bar */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Product Autocomplete Picker */}
              <div className="md:col-span-5 relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  🔍 Aranacak Ürün / Model (Google Tarzı Serbest Arama)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedProductQuery}
                    onChange={(e) => {
                      setSelectedProductQuery(e.target.value);
                      setSearchDropdownOpen(true);
                    }}
                    onFocus={() => setSearchDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearchDropdownOpen(false);
                        handleFetchMarketPrices();
                      }
                    }}
                    placeholder="Örn: PHILIPS DST7510/80 Azur Buharlı Ütü, Oyak Çimento..."
                    className="w-full px-4 py-2.5 pl-10 pr-24 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />

                  <div className="absolute right-2 top-1.5 flex items-center gap-1">
                    {selectedProductQuery && (
                      <button
                        onClick={() => {
                          setSelectedProductQuery("");
                          setSearchDropdownOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleFetchMarketPrices()}
                      disabled={isSearchingMarket}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isSearchingMarket ? "animate-spin" : ""}`}
                      />
                      <span>Ara</span>
                    </button>
                  </div>
                </div>

                {/* Autocomplete Dropdown */}
                {searchDropdownOpen && filteredDropdownOptions.length > 0 && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setSearchDropdownOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredDropdownOptions.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedProductQuery(opt.name);
                            setSelectedUnit(opt.unit);
                            setSearchDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs sm:text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between group transition-colors"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                            {opt.name}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                            {opt.unit}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Quantity Input */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  📦 Miktar ({selectedUnit})
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Payment Filter */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  💳 Vade Tercihi
                </label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="all">Tüm Vadeler</option>
                  <option value="cash">Nakit / Peşin / Kredi Kartı</option>
                  <option value="30_days">30 Gün Vadeli</option>
                  <option value="60_days">60 Gün Vadeli</option>
                </select>
              </div>

              {/* Toggles (VAT & Shipping) */}
              <div className="md:col-span-3 flex items-center justify-between gap-2 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIncludeShipping(!includeShipping)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    includeShipping
                      ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Nakliye {includeShipping ? "Dahil" : "Hariç"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVatIncluded(!vatIncluded)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    vatIncluded
                      ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>KDV {vatIncluded ? "Dahil" : "Hariç"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* WINNING HERO CARD (🏆 EN UYGUN FİYAT SEÇENEĞİ)                    */}
          {/* ================================================================= */}
          {bestQuote ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border-2 border-emerald-500/50 p-6 sm:p-8 text-white shadow-2xl">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-extrabold uppercase tracking-wider mb-3">
                    <Trophy className="w-4 h-4 text-amber-400 animate-bounce" />
                    <span>🏆 TÜM İNTERNETTE & TEDARİKÇİLERDE EN UYGUN FİYAT</span>
                  </div>

                  <h2 className="text-xl sm:text-3xl font-black text-white mb-1.5 flex items-center gap-2.5">
                    {bestQuote.supplierName}
                    <BadgeCheck className="w-6 h-6 text-emerald-400" />
                  </h2>

                  <p className="text-sm font-medium text-slate-300 mb-4 max-w-xl">
                    {bestQuote.productName} •{" "}
                    <span className="text-emerald-400 font-bold">
                      {bestQuote.paymentTerm === "cash"
                        ? "Peşin / Kredi Kartı / Havale"
                        : bestQuote.paymentTerm === "30_days"
                        ? "30 Gün Vade"
                        : "60 Gün Vade"}
                    </span>
                    {bestQuote.sourceUrl && (
                      <a
                        href={bestQuote.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-white underline"
                      >
                        <span>Mağazada Aç</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>

                  {/* Savings Pill */}
                  {comparisonStats && comparisonStats.savingsPercent > 0 && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                      <TrendingDown className="w-4 h-4 text-emerald-400" />
                      <span>
                        Diğer mağaza ve satıcılara göre{" "}
                        <strong className="text-white font-extrabold">
                          %{comparisonStats.savingsPercent} daha avantajlı
                        </strong>{" "}
                        (Toplam{" "}
                        <strong className="text-white font-extrabold">
                          ₺
                          {comparisonStats.totalSavings.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          tasarruf
                        </strong>
                        )
                      </span>
                    </div>
                  )}
                </div>

                {/* Price Display & Call to Action */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                  <div className="text-left lg:text-right">
                    <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
                      En Düşük Birim Fiyat
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">
                      ₺
                      {calculateNetUnitCost(bestQuote, {
                        vatIncluded,
                        includeShipping,
                      }).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                      <span className="text-xs font-semibold text-slate-400 ml-1">
                        / {bestQuote.unit}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-semibold mt-1">
                      {quantity} {bestQuote.unit} Toplam:{" "}
                      <strong className="text-white font-bold">
                        ₺
                        {(
                          calculateNetUnitCost(bestQuote, {
                            vatIncluded,
                            includeShipping,
                          }) * quantity
                        ).toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() =>
                        handleCopyPrice(
                          bestQuote.id,
                          String(
                            calculateNetUnitCost(bestQuote, {
                              vatIncluded,
                              includeShipping,
                            })
                          )
                        )
                      }
                      className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold transition-all"
                      title="Fiyatı Kopyala"
                    >
                      {copiedId === bestQuote.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      onClick={() =>
                        handleTransferToQuote({
                          name: bestQuote.productName,
                          price: calculateNetUnitCost(bestQuote, {
                            vatIncluded,
                            includeShipping,
                          }),
                          unit: bestQuote.unit,
                        })
                      }
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-500/30 hover:scale-102 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Bu Fiyatı Teklife Aktar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Price Spread Range Bar */}
              {comparisonStats && comparisonStats.count > 1 && (
                <div className="mt-6 pt-5 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      En Düşük: ₺
                      {comparisonStats.minCost.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-slate-300 font-semibold">
                      Ortalama Fiyat: ₺
                      {comparisonStats.avgCost.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-rose-400 font-bold">
                      En Yüksek: ₺
                      {comparisonStats.maxCost.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 rounded-full"
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-800 p-8 text-center bg-slate-50/50 dark:bg-slate-900/50">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                Arama Sonucu Bekleniyor
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                &ldquo;{selectedProductQuery}&rdquo; için canlı web tarayıcısı başlatılıyor.
              </p>
              <button
                onClick={() => handleFetchMarketPrices(selectedProductQuery)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Web Fiyatlarını Tara</span>
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* ALL MATCHING OFFERS COMPARISON TABLE (NO STORE LIMITS)             */}
          {/* ================================================================= */}
          {allAvailableOffers.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Building className="w-4 h-4 text-emerald-500" />
                    <span>Tüm Mağaza & Tedarikçi Fiyat Sıralaması</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {allAvailableOffers.length} Teklif Bulundu
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    İnternet mağazaları ve tedarikçi teklifleri en düşük net birim fiyata göre sıralanmıştır.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 w-12 text-center">Sıra</th>
                      <th className="py-3 px-4">Mağaza / Tedarikçi</th>
                      <th className="py-3 px-4">Tür & Kaynak</th>
                      <th className="py-3 px-4 text-right">Birim Fiyat</th>
                      <th className="py-3 px-4 text-right">
                        {quantity} {selectedUnit} Toplam
                      </th>
                      <th className="py-3 px-4">Teslimat / Not</th>
                      <th className="py-3 px-4 text-center w-36">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {allAvailableOffers.map((q, idx) => {
                      const netCost = calculateNetUnitCost(q, {
                        vatIncluded,
                        includeShipping,
                      });
                      const totalCost = netCost * quantity;
                      const isWinner = idx === 0;

                      return (
                        <tr
                          key={q.id}
                          className={`transition-colors ${
                            isWinner
                              ? "bg-emerald-50/60 dark:bg-emerald-950/20 font-semibold"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          {/* Rank */}
                          <td className="py-3 px-4 text-center">
                            {isWinner ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-xs">
                                1
                              </span>
                            ) : (
                              <span className="font-bold text-slate-400">
                                #{idx + 1}
                              </span>
                            )}
                          </td>

                          {/* Store Name & Link */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 dark:text-slate-100">
                                {q.supplierName}
                              </span>
                              {isWinner && (
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-black text-[10px] uppercase">
                                  En Uygun
                                </span>
                              )}
                            </div>
                            {q.sourceUrl && (
                              <a
                                href={q.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                              >
                                <span>Mağaza Sayfasına Git</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </td>

                          {/* Source Type / Badge */}
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                              {q.sourceType === "market_web"
                                ? "🌐 Online Web Satıcısı"
                                : q.sourceType === "factory"
                                ? "🏭 Fabrika Doğrudan"
                                : "🏢 Kayıtlı Tedarikçi"}
                            </span>
                          </td>

                          {/* Net Unit Cost */}
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`text-sm font-black font-mono ${
                                isWinner
                                  ? "text-emerald-600 dark:text-emerald-400 text-base"
                                  : "text-slate-900 dark:text-slate-100"
                              }`}
                            >
                              ₺
                              {netCost.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </td>

                          {/* Total Cost */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            ₺
                            {totalCost.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                            })}
                          </td>

                          {/* Notes / Delivery */}
                          <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                            {q.notes || "Doğrudan Satış"}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() =>
                                  handleTransferToQuote({
                                    name: q.productName,
                                    price: netCost,
                                    unit: q.unit,
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[11px] transition-all inline-flex items-center gap-1"
                                title="Bu fiyatı teklif formuna aktar"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Teklife Aktar</span>
                              </button>

                              {q.sourceType === "market_web" && (
                                <button
                                  onClick={() =>
                                    handleAddMarketResultToSuppliers({
                                      id: q.id,
                                      title: q.productName,
                                      source: q.supplierName,
                                      price: q.unitPrice,
                                      currency: "₺",
                                      unit: q.unit,
                                      url: q.sourceUrl,
                                      shippingInfo: q.notes,
                                      lastUpdated: "Bugün",
                                    })
                                  }
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
                                  title="Bu satıcıyı tedarikçi listeme kaydet"
                                >
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. TAB: CANLI İNTERNET & AÇIK WEB MAĞAZALARI                          */}
      {/* ===================================================================== */}
      {activeSubTab === "market-pulse" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
              <div className="flex-1 max-w-xl">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
                  🌐 Tüm İnternette Aranacak Ürün
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedProductQuery}
                    onChange={(e) => setSelectedProductQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFetchMarketPrices();
                    }}
                    placeholder="Örn: PHILIPS DST7510/80 Azur Buharlı Ütü..."
                    className="w-full px-4 py-2.5 pl-10 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFetchMarketPrices()}
                  disabled={isSearchingMarket}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 transition-all"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isSearchingMarket ? "animate-spin" : ""}`}
                  />
                  <span>İnternette Tara</span>
                </button>

                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(
                    selectedProductQuery + " fiyat satın al"
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm"
                >
                  <span>Google</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Market Summary stats */}
            {marketSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    En Düşük Fiyat (🏆 En Uygun)
                  </div>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    ₺{marketSummary.minPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Ortalama Piyasa Fiyatı
                  </div>
                  <div className="text-2xl font-black text-slate-800 dark:text-slate-200 font-mono">
                    ₺{marketSummary.avgPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    En Yüksek Fiyat
                  </div>
                  <div className="text-2xl font-black text-rose-500 font-mono">
                    ₺{marketSummary.maxPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    En Avantajlı Mağaza
                  </div>
                  <div className="text-base font-black text-indigo-600 dark:text-indigo-400 truncate mt-1">
                    {marketSummary.bestSource}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Market Results List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {marketResults.map((item, idx) => {
              const isBest = idx === 0;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl bg-white dark:bg-slate-900 border p-5 shadow-sm flex flex-col justify-between transition-all ${
                    isBest
                      ? "border-2 border-emerald-500 bg-emerald-50/10 shadow-emerald-500/10 shadow-lg"
                      : "border-slate-200 dark:border-slate-800 hover:border-indigo-500"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950">
                        {item.source}
                      </span>
                      {isBest && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 uppercase flex items-center gap-1">
                          <Trophy className="w-3 h-3" />
                          <span>En Ucuz</span>
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2 line-clamp-2">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-500 mb-4 line-clamp-1">
                      {item.shippingInfo}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Birim Fiyat
                        </span>
                        <div
                          className={`text-2xl font-black font-mono ${
                            isBest
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-900 dark:text-slate-100"
                          }`}
                        >
                          ₺{item.price.toFixed(2)}
                        </div>
                      </div>

                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1"
                        >
                          <span>Mağazaya Git</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleTransferToQuote({
                            name: item.title,
                            price: item.price,
                            unit: item.unit || "Adet",
                          })
                        }
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Teklife Aktar</span>
                      </button>

                      <button
                        onClick={() => handleAddMarketResultToSuppliers(item)}
                        className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-colors flex items-center gap-1"
                        title="Bu satıcıyı tedarikçi listeme kaydet"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Kaydet</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. TAB: KAYITLI TEDARİKÇİ HAVUZU                                     */}
      {/* ===================================================================== */}
      {activeSubTab === "suppliers" && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-500" />
                <span>Kayıtlı Tedarikçi Fiyat Listesi</span>
              </h3>
              <p className="text-xs text-slate-500">
                Fabrika, toptancı ve web üzerinden eklediğiniz tüm özel birim fiyatlar.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetDefaults}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 transition-colors"
              >
                Örnek Listeyi Yükle
              </button>
              <button
                onClick={() => {
                  setEditingQuoteId(null);
                  setFormData({
                    supplierName: "",
                    productName: "",
                    unit: "Adet",
                    unitPrice: 0,
                  });
                  setQuoteModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-colors shadow-md shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Fiyat Ekle</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Tedarikçi</th>
                  <th className="py-3 px-4">Ürün / Malzeme</th>
                  <th className="py-3 px-4">Birim</th>
                  <th className="py-3 px-4 text-right">Birim Fiyat</th>
                  <th className="py-3 px-4 text-center">İskonto</th>
                  <th className="py-3 px-4 text-right">Nakliye</th>
                  <th className="py-3 px-4">Vade</th>
                  <th className="py-3 px-4">Tarih</th>
                  <th className="py-3 px-4 text-center w-24">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                      {q.supplierName}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {q.productName}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{q.unit}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      ₺
                      {q.unitPrice.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {q.discountPercent ? `-%${q.discountPercent}` : "-"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {q.shippingCostPerUnit ? `+₺${q.shippingCostPerUnit}` : "Dahil"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {q.paymentTerm === "cash"
                          ? "Nakit / Kart"
                          : q.paymentTerm === "30_days"
                          ? "30 Gün"
                          : "60 Gün"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {q.updatedAt}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(q)}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Düzenle"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(q.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT SUPPLIER QUOTE                                      */}
      {/* ===================================================================== */}
      {quoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-500" />
                <span>
                  {editingQuoteId ? "Tedarikçi Teklifini Düzenle" : "Yeni Tedarikçi Teklifi Ekle"}
                </span>
              </h3>
              <button
                onClick={() => setQuoteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalForm} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tedarikçi / Mağaza Adı *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: UGİ Teknoloji, Kilsan Tuğla, Oyak Çimento Bayisi"
                  value={formData.supplierName || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, supplierName: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ürün / Malzeme Cinsi *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: PHILIPS DST7510/80 Azur Buharlı Ütü"
                    value={formData.productName || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, productName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Birim
                  </label>
                  <input
                    type="text"
                    value={formData.unit || "Adet"}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Birim Fiyat (₺) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.unitPrice || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unitPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    İskonto (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.discountPercent || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountPercent: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nakliye / Birim (₺)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={formData.shippingCostPerUnit || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        shippingCostPerUnit: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Vade Koşulu
                  </label>
                  <select
                    value={formData.paymentTerm || "cash"}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentTerm: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    <option value="cash">Nakit / Peşin / Kredi Kartı</option>
                    <option value="30_days">30 Gün Vadeli</option>
                    <option value="60_days">60 Gün Vadeli</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    KDV Durumu
                  </label>
                  <select
                    value={formData.vatIncluded ? "included" : "excluded"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vatIncluded: e.target.value === "included",
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    <option value="included">KDV Dahil</option>
                    <option value="excluded">KDV Hariç (%20)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Özel Notlar & Kaynak Bağlantısı
                </label>
                <textarea
                  rows={2}
                  placeholder="Örn: Doğrudan web sitesi linki, kampanya detayları..."
                  value={formData.notes || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuoteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md shadow-emerald-600/20"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
