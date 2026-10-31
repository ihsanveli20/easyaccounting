"use client";

import React, { useState, useMemo, useRef, ChangeEvent } from "react";
import * as XLSX from "xlsx";
import {
  Package,
  UploadCloud,
  Download,
  Plus,
  Search,
  Trash2,
  Edit2,
  RotateCcw,
  Sparkles,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Boxes,
  Tag,
  Coins,
  Layers,
  FileCheck,
  Filter,
  Cloud,
  Database,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { ProductItem } from "../types/accounting";
import { parseTurkishAmount, normalizeForSearch, formatCurrency } from "../utils/excel";

export const DEFAULT_SAMPLE_PRODUCTS: ProductItem[] = [
  { id: "p1", code: "DMR-Q12", name: "Q12 Nervürlü İnşaat Demiri", unit: "Ton", unitPrice: 28500, category: "Demir & Çelik", stockQuantity: 45, updatedAt: "31.10.2026" },
  { id: "p2", code: "DMR-Q14", name: "Q14 Nervürlü İnşaat Demiri", unit: "Ton", unitPrice: 28500, category: "Demir & Çelik", stockQuantity: 30, updatedAt: "31.10.2026" },
  { id: "p3", code: "BTN-C30", name: "C30/37 Hazır Beton (Katkılı)", unit: "m³", unitPrice: 2450, category: "Hazır Beton", stockQuantity: 150, updatedAt: "31.10.2026" },
  { id: "p4", code: "BTN-C35", name: "C35/45 Hazır Beton (Katkılı)", unit: "m³", unitPrice: 2650, category: "Hazır Beton", stockQuantity: 80, updatedAt: "31.10.2026" },
  { id: "p5", code: "TGL-19", name: "19'luk Blok Tuğla (Paletli)", unit: "Adet", unitPrice: 14.5, category: "Duvar & Tuğla", stockQuantity: 8500, updatedAt: "31.10.2026" },
  { id: "p6", code: "TGL-135", name: "13.5'lik Tuğla (Paletli)", unit: "Adet", unitPrice: 11.2, category: "Duvar & Tuğla", stockQuantity: 6200, updatedAt: "31.10.2026" },
  { id: "p7", code: "CMN-50", name: "Torbalı Portland Çimento (50 Kg)", unit: "Paket", unitPrice: 195, category: "Çimento & Harç", stockQuantity: 420, updatedAt: "31.10.2026" },
  { id: "p8", code: "KUM-KB", name: "Kaba Sıva Kumu (Yıkanmış)", unit: "Ton", unitPrice: 480, category: "Agrega & Kum", stockQuantity: 65, updatedAt: "31.10.2026" },
  { id: "p9", code: "KUM-IN", name: "İnce Şap Kumu", unit: "Ton", unitPrice: 520, category: "Agrega & Kum", stockQuantity: 40, updatedAt: "31.10.2026" },
  { id: "p10", code: "YTG-10", name: "10'luk Ytong Gazbeton Blok", unit: "Adet", unitPrice: 38.5, category: "Gazbeton", stockQuantity: 1200, updatedAt: "31.10.2026" },
  { id: "p11", code: "ALC-SV", name: "Saten Alçı (30 Kg Torba)", unit: "Paket", unitPrice: 165, category: "Alçı & Boya", stockQuantity: 180, updatedAt: "31.10.2026" },
  { id: "p12", code: "BYA-SIL", name: "Silikonlu İç Cephe Boyası (15 Lt)", unit: "Adet", unitPrice: 1850, category: "Alçı & Boya", stockQuantity: 55, updatedAt: "31.10.2026" },
];

const COMMON_UNITS = [
  "Adet",
  "Ton",
  "Kg",
  "m²",
  "m³",
  "Metre",
  "Paket",
  "Koli",
  "Takım",
  "Litre",
  "Saat",
  "Gün",
  "Hizmet",
];

interface ProductManagementViewProps {
  products: ProductItem[];
  setProducts: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  onGoToQuote?: () => void;
  productSource?: "supabase" | "local" | "syncing";
  onRefreshFromSupabase?: () => Promise<void>;
}

export default function ProductManagementView({
  products,
  setProducts,
  onGoToQuote,
  productSource = "local",
  onRefreshFromSupabase,
}: ProductManagementViewProps) {
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Drag and Drop & Excel Import
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<ProductItem[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal for Add / Edit
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductItem | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    unit: "Adet",
    unitPrice: "",
    category: "",
    stockQuantity: "",
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleRefresh = async () => {
    if (onRefreshFromSupabase) {
      setIsSyncing(true);
      await onRefreshFromSupabase();
      setIsSyncing(false);
      showToast("Supabase verileri kontrol edildi ve yenilendi.");
    }
  };

  // Distinct Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    return products.filter((p) => {
      if (selectedCategory !== "all" && p.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const nameMatch = normalizeForSearch(p.name).includes(q);
      const codeMatch = p.code ? normalizeForSearch(p.code).includes(q) : false;
      const catMatch = p.category ? normalizeForSearch(p.category).includes(q) : false;
      return nameMatch || codeMatch || catMatch;
    });
  }, [products, searchQuery, selectedCategory]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = products.length;
    const catCount = categories.length;
    let totalPrice = 0;
    let totalStock = 0;
    products.forEach((p) => {
      totalPrice += p.unitPrice || 0;
      totalStock += p.stockQuantity || 0;
    });
    const avgPrice = totalCount > 0 ? totalPrice / totalCount : 0;
    return { totalCount, catCount, avgPrice, totalStock };
  }, [products, categories]);

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const headers = ["Ürün Kodu", "Ürün Adı", "Birim", "Birim Fiyatı", "Kategori", "Stok Miktarı"];
    const rows = [
      headers,
      ["DMR-Q12", "Q12 Nervürlü İnşaat Demiri", "Ton", 28500, "Demir & Çelik", 45],
      ["BTN-C30", "C30/37 Hazır Beton", "m³", 2450, "Hazır Beton", 120],
      ["TGL-19", "19'luk Tuğla (Paletli)", "Adet", 14.5, "Duvar & Tuğla", 5000],
      ["CMN-50", "Torbalı Çimento (50 Kg)", "Paket", 195, "Çimento & Harç", 350],
      ["KUM-KB", "Kaba Sıva Kumu", "Ton", 480, "Agrega & Kum", 60],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 14 },
      { wch: 35 },
      { wch: 10 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ürün Şablonu");
    XLSX.writeFile(wb, "Urun_Katalog_Sablonu.xlsx");
    showToast("Örnek Excel şablonu indirildi.");
  };

  // Export Catalog to Excel
  const handleExportCatalog = () => {
    if (products.length === 0) {
      alert("Dışa aktarılacak kayıtlı ürün bulunmuyor.");
      return;
    }
    const headers = ["Ürün Kodu", "Ürün Adı", "Birim", "Birim Fiyatı (₺)", "Kategori", "Stok Miktarı", "Son Güncelleme"];
    const rows: (string | number)[][] = [headers];
    filteredProducts.forEach((p) => {
      rows.push([
        p.code || "",
        p.name,
        p.unit,
        p.unitPrice,
        p.category || "",
        p.stockQuantity !== undefined ? p.stockQuantity : "",
        p.updatedAt || "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 14 },
      { wch: 38 },
      { wch: 10 },
      { wch: 18 },
      { wch: 20 },
      { wch: 14 },
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ürün Listesi");
    XLSX.writeFile(wb, `Urun_Katalogu_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Ürün kataloğu Excel olarak indirildi.");
  };

  // Process Excel File
  const handleFile = (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Dosya okunamadı");

        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error("Çalışma sayfası bulunamadı");

        // Convert to JSON 2D array
        const rawAoA: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rawAoA || rawAoA.length < 2) {
          throw new Error("Dosyada geçerli ürün satırı bulunamadı.");
        }

        // Find header row (first row with at least 2 non-empty text cells)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(10, rawAoA.length); i++) {
          const row = rawAoA[i];
          const textCount = row.filter((c: any) => typeof c === "string" && c.trim().length > 1).length;
          if (textCount >= 2) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rawAoA[headerRowIndex].map((h: any) => String(h || "").trim());

        // Smart column mapping indices
        let nameColIdx = -1;
        let codeColIdx = -1;
        let unitColIdx = -1;
        let priceColIdx = -1;
        let catColIdx = -1;
        let stockColIdx = -1;

        headers.forEach((h: string, idx: number) => {
          const norm = normalizeForSearch(h);
          if (nameColIdx === -1 && (norm.includes("ad") || norm.includes("urun") || norm.includes("malzeme") || norm.includes("cins") || norm.includes("aciklama") || norm.includes("item") || norm.includes("name"))) {
            nameColIdx = idx;
          } else if (codeColIdx === -1 && (norm.includes("kod") || norm.includes("code") || norm.includes("sku") || norm.includes("barkod"))) {
            codeColIdx = idx;
          } else if (unitColIdx === -1 && (norm.includes("birim") || norm.includes("olcu") || norm.includes("unit"))) {
            unitColIdx = idx;
          } else if (priceColIdx === -1 && (norm.includes("fiyat") || norm.includes("tutar") || norm.includes("price") || norm.includes("ucret") || norm.includes("bedel"))) {
            priceColIdx = idx;
          } else if (catColIdx === -1 && (norm.includes("kategori") || norm.includes("grup") || norm.includes("tur") || norm.includes("category") || norm.includes("sinif"))) {
            catColIdx = idx;
          } else if (stockColIdx === -1 && (norm.includes("stok") || norm.includes("miktar") || norm.includes("adet") || norm.includes("qty") || norm.includes("quantity"))) {
            stockColIdx = idx;
          }
        });

        // Fallbacks if not detected
        if (nameColIdx === -1) {
          // pick the first text column
          nameColIdx = headers.findIndex((h) => h.length > 0) !== -1 ? headers.findIndex((h) => h.length > 0) : 0;
        }

        const parsedProducts: ProductItem[] = [];
        const todayStr = new Date().toLocaleDateString("tr-TR");

        for (let i = headerRowIndex + 1; i < rawAoA.length; i++) {
          const row = rawAoA[i];
          if (!row || row.length === 0) continue;

          const rawName = nameColIdx >= 0 ? String(row[nameColIdx] || "").trim() : "";
          if (!rawName) continue; // skip empty name rows

          const rawCode = codeColIdx >= 0 ? String(row[codeColIdx] || "").trim() : "";
          const rawUnit = unitColIdx >= 0 ? String(row[unitColIdx] || "").trim() : "Adet";
          const rawPrice = priceColIdx >= 0 ? parseTurkishAmount(row[priceColIdx]) : 0;
          const rawCat = catColIdx >= 0 ? String(row[catColIdx] || "").trim() : "";
          const rawStock = stockColIdx >= 0 ? parseTurkishAmount(row[stockColIdx]) : undefined;

          parsedProducts.push({
            id: `prod_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
            code: rawCode || undefined,
            name: rawName,
            unit: rawUnit || "Adet",
            unitPrice: rawPrice > 0 ? rawPrice : 0,
            category: rawCat || undefined,
            stockQuantity: rawStock,
            updatedAt: todayStr,
          });
        }

        if (parsedProducts.length === 0) {
          throw new Error("Excel dosyasından geçerli ürün kaydı çıkarılamadı.");
        }

        setPreviewProducts(parsedProducts);
        setImportModalOpen(true);
      } catch (err: any) {
        alert("Excel yüklenirken hata oluştu: " + err.message);
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleApplyImport = (mode: "append" | "replace") => {
    if (previewProducts.length === 0) return;

    if (mode === "replace") {
      setProducts(previewProducts);
      showToast(`${previewProducts.length} adet ürün içe aktarıldı (Katalog yenilendi).`);
    } else {
      // Append, skipping exact duplicates by code or name
      const existingKeys = new Set(
        products.map((p) => (p.code ? p.code.toLowerCase() : p.name.toLowerCase()))
      );
      const toAdd = previewProducts.filter(
        (p) => !existingKeys.has(p.code ? p.code.toLowerCase() : p.name.toLowerCase())
      );
      setProducts((prev) => [...prev, ...toAdd]);
      showToast(`${toAdd.length} yeni ürün kataloğa eklendi (${previewProducts.length - toAdd.length} mükerrer atlandı).`);
    }
    setImportModalOpen(false);
    setPreviewProducts([]);
  };

  // Add / Edit Manual Product
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormData({
      code: "",
      name: "",
      unit: "Adet",
      unitPrice: "",
      category: "",
      stockQuantity: "",
    });
    setItemModalOpen(true);
  };

  const handleOpenEditModal = (item: ProductItem) => {
    setEditingItem(item);
    setFormData({
      code: item.code || "",
      name: item.name,
      unit: item.unit || "Adet",
      unitPrice: item.unitPrice ? String(item.unitPrice) : "",
      category: item.category || "",
      stockQuantity: item.stockQuantity !== undefined ? String(item.stockQuantity) : "",
    });
    setItemModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Lütfen ürün / malzeme adını giriniz.");
      return;
    }

    const priceNum = parseTurkishAmount(formData.unitPrice);
    const stockNum = formData.stockQuantity.trim() !== "" ? parseTurkishAmount(formData.stockQuantity) : undefined;
    const todayStr = new Date().toLocaleDateString("tr-TR");

    if (editingItem) {
      // Update
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingItem.id
            ? {
              ...p,
              code: formData.code.trim() || undefined,
              name: formData.name.trim(),
              unit: formData.unit.trim() || "Adet",
              unitPrice: priceNum,
              category: formData.category.trim() || undefined,
              stockQuantity: stockNum,
              updatedAt: todayStr,
            }
            : p
        )
      );
      showToast(`"${formData.name.trim()}" ürünü güncellendi.`);
    } else {
      // Create
      const newItem: ProductItem = {
        id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        code: formData.code.trim() || undefined,
        name: formData.name.trim(),
        unit: formData.unit.trim() || "Adet",
        unitPrice: priceNum,
        category: formData.category.trim() || undefined,
        stockQuantity: stockNum,
        updatedAt: todayStr,
      };
      setProducts((prev) => [newItem, ...prev]);
      showToast(`Yeni ürün kataloğa eklendi: "${formData.name.trim()}"`);
    }

    setItemModalOpen(false);
  };

  // Delete Item
  const handleDeleteItem = (id: string, name: string) => {
    if (confirm(`"${name}" ürününü katalogdan silmek istediğinize emin misiniz?`)) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("Ürün silindi.");
    }
  };

  // Clear Catalog
  const handleClearCatalog = () => {
    if (confirm("Katalogdaki tüm ürünleri silmek istediğinize emin misiniz?")) {
      setProducts([]);
      showToast("Tüm ürünler temizlendi.");
    }
  };

  // Load Samples
  const handleLoadSamples = () => {
    setProducts(DEFAULT_SAMPLE_PRODUCTS);
    showToast("12 adet örnek ürün başarıyla yüklendi.");
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-sm flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
        }}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* Top Banner / Actions Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold shrink-0 shadow-xs">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Ürün & Malzeme Kataloğu
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Fiyat Teklifi Entegre
              </span>

              {/* Supabase Connection & Priority Pill */}
              {productSource === "supabase" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Supabase Bulut Aktif ({products.length} Ürün Öncelikli)</span>
                  {onRefreshFromSupabase && (
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={isSyncing}
                      className="ml-1 text-emerald-700 hover:text-emerald-950 p-0.5 transition-transform"
                      title="Buluttan yeniden çek"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </span>
              ) : productSource === "syncing" || isSyncing ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-600" />
                  <span>Supabase Kontrol Ediliyor...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  <Cloud className="w-3 h-3 text-slate-500" />
                  <span>Supabase Bağlı (Tablo boş: Yerel liste aktif)</span>
                  {onRefreshFromSupabase && (
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={isSyncing}
                      className="ml-0.5 text-slate-500 hover:text-slate-800 p-0.5"
                      title="Supabase'i kontrol et"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Excel ile toplu ürün yükleyin veya manuel ekleyin. Supabase tablosunda veri olduğunda otomatik olarak öncelikli çekilir.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Excel İle İçe Aktar</span>
          </button>

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors"
            title="Örnek sütun formatına sahip boş şablon indir"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Excel Şablonu</span>
            <span className="sm:hidden">Şablon</span>
          </button>

          {products.length === 0 ? (
            <button
              onClick={handleLoadSamples}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Örnek Ürünler Yükle</span>
            </button>
          ) : (
            <button
              onClick={handleExportCatalog}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors"
              title="Katalogdaki ürünleri Excel olarak indir"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Excel İndir</span>
            </button>
          )}

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Ürün</span>
          </button>

          {onGoToQuote && (
            <button
              onClick={onGoToQuote}
              className="flex items-center gap-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors ml-auto sm:ml-0"
              title="Fiyat teklifi ekranına git ve ürünleri seç"
            >
              <span>Teklife Git</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Toplam Ürün */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Toplam Ürün
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block">
              {stats.totalCount} <span className="text-xs font-normal text-slate-500">kalem</span>
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Kategoriler */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Kategoriler
            </span>
            <span className="text-xl sm:text-2xl font-black text-indigo-600 mt-0.5 block">
              {stats.catCount} <span className="text-xs font-normal text-slate-500">grup</span>
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Ortalama Fiyat */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Ortalama Birim Fiyat
            </span>
            <span className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 block truncate">
              {formatCurrency(stats.avgPrice)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Veri Kaynağı & Teklif Entegrasyonu */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-4 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider block">
              {productSource === "supabase" ? "Veri Kaynağı: Supabase" : "Veri Kaynağı: Yerel / Import"}
            </span>
            <span className="text-xs sm:text-sm font-semibold mt-1 block">
              {productSource === "supabase" ? "Bulut Verisi Öncelikli" : "Teklif Formuna Bağlı"}
            </span>
            <span className="text-[10px] text-blue-100/90 mt-0.5 block">
              Teklifte malzeme yazarken listelenir
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
            {productSource === "supabase" ? <Database className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* Drag & Drop Import Zone (when list is empty or hovered) */}
      {products.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFile(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
            isDragging
              ? "border-blue-500 bg-blue-50/50 scale-[1.01]"
              : "border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/50"
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-slate-900">
              Excel Ürün Dosyasını Buraya Sürükleyin
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              .xlsx, .xls veya .csv formatındaki ürün ve malzeme listenizi yükleyin. Ürün Adı, Kodu, Birimi ve Fiyatı otomatik algılanacaktır.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-xs hover:bg-blue-700"
            >
              Dosya Seçin
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSamples();
              }}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-200"
            >
              Örnek Veri ile Başla
            </button>
          </div>
        </div>
      )}

      {/* Main Table Card (when products exist) */}
      {products.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ürün adı, stok kodu veya kategori ile ara..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter pills & reset */}
            <div className="flex items-center flex-wrap gap-2">
              {/* Category Dropdown */}
              {categories.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">Tüm Kategoriler ({products.length})</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c} ({products.filter((p) => p.category === c).length})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Clear Catalog button */}
              <button
                onClick={handleClearCatalog}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors ml-auto"
                title="Tüm kataloğu sıfırla"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tümünü Sil</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 w-32">Ürün Kodu</th>
                  <th className="py-3 px-4">Malzeme / Ürün Adı</th>
                  <th className="py-3 px-4 w-36">Kategori</th>
                  <th className="py-3 px-4 w-24 text-center">Birim</th>
                  <th className="py-3 px-4 w-32 text-right">Birim Fiyatı</th>
                  <th className="py-3 px-4 w-28 text-right">Mevcut Stok</th>
                  <th className="py-3 px-4 w-24 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-slate-600">Eşleşen ürün bulunamadı</p>
                      <p className="text-[11px] mt-0.5">Arama terimini değiştirmeyi veya filtreyi kaldırmayı deneyin.</p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <tr
                      key={p.id}
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      {/* Index */}
                      <td className="py-2.5 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      {/* Code */}
                      <td className="py-2.5 px-4 font-mono text-[11px] font-semibold text-slate-600">
                        {p.code ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                            {p.code}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-4 text-slate-600">
                        {p.category ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
                            {p.category}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                          {p.unit || "Adet"}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900 font-mono">
                        {formatCurrency(p.unitPrice)}
                      </td>

                      {/* Stock */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                        {p.stockQuantity !== undefined ? (
                          <span
                            className={`font-semibold ${
                              p.stockQuantity <= 10
                                ? "text-amber-600"
                                : "text-slate-700"
                            }`}
                          >
                            {p.stockQuantity.toLocaleString("tr-TR")} {p.unit}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(p.id, p.name)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Toplam {filteredProducts.length} ürün listeleniyor (Katalogda {products.length} ürün var)
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400">
                💡 Fiyat Teklifi modülünde ürün adı yazarken bu katalogdan otomatik tamamlanır.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Excel İçe Aktarma Önizleme ({previewProducts.length} Ürün Bulundu)
                </h3>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{importFileName}</span> dosyasından tespit edilen ilk 5 ürün:
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl mb-4 max-h-56">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2">Kod</th>
                    <th className="p-2">Malzeme Adı</th>
                    <th className="p-2">Birim</th>
                    <th className="p-2 text-right">Birim Fiyatı</th>
                    <th className="p-2">Kategori</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewProducts.slice(0, 5).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 font-mono text-slate-600">{p.code || "-"}</td>
                      <td className="p-2 font-semibold text-slate-900">{p.name}</td>
                      <td className="p-2">{p.unit}</td>
                      <td className="p-2 text-right font-mono font-bold">{formatCurrency(p.unitPrice)}</td>
                      <td className="p-2 text-slate-500">{p.category || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-auto">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                İptal
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyImport("append")}
                  className="px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
                >
                  Mevcut Ürünlere Ekle
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyImport("replace")}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors"
                >
                  Kataloğu Sıfırla ve Yükle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add / Edit Modal */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleSaveItem}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {editingItem ? "Ürünü Düzenle" : "Yeni Ürün Ekle"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Malzeme / Ürün Cinsi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Örn: Q12 Nervürlü İnşaat Demiri"
                  className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-medium"
                />
              </div>

              {/* Product Code & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ürün / Stok Kodu
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Örn: DMR-001"
                    className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Örn: Demir & Çelik"
                    className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                  />
                </div>
              </div>

              {/* Unit & Unit Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Birim <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-medium"
                  >
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Birim Fiyatı (₺) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                    placeholder="Örn: 28.500,00"
                    className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Stock Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mevcut Stok Miktarı <span className="text-slate-400 font-normal">(İsteğe bağlı)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                  placeholder="Örn: 50"
                  className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors"
              >
                {editingItem ? "Değişiklikleri Kaydet" : "Ürünü Ekle"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
