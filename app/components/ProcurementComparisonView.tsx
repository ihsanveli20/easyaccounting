"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Eye,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  ProcurementComparison,
  ProcurementCurrency,
  ProcurementNeedItem,
  ProcurementQuoteLineItem,
  ProcurementSupplierQuote,
  ShippingMode,
} from "../types/procurement";
import {
  evaluateProcurementComparison,
  normalizeProcurementName,
  normalizeProcurementUnit,
} from "../utils/procurementEngine";
import ProcurementReportView from "./ProcurementReportView";

const STORAGE_KEY = "easy_accounting_procurement_comparisons_v1";
const UNIT_OPTIONS = ["Palet", "Adet", "Torba", "Ton", "Kg", "m³", "m²", "Metre", "Paket", "Koli"];

type ScreenTab = "list" | "create" | "quotes" | "report";

interface TesseractLike {
  recognize: (
    image: File | Blob | string,
    langs: string
  ) => Promise<{ data?: { text?: string } }>;
}

function loadScriptOnce(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`${src} yüklenemedi.`));
    document.head.appendChild(script);
  });
}

function readInitialComparisons(): ProcurementComparison[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ProcurementComparisonView() {
  const [comparisons, setComparisons] = useState<ProcurementComparison[]>(readInitialComparisons);
  const [activeScreen, setActiveScreen] = useState<ScreenTab>("list");
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(
    () => readInitialComparisons()[0]?.id ?? null
  );
  const [listSearch, setListSearch] = useState("");

  // Create / Edit Comparison Form State
  const [editingComparisonId, setEditingComparisonId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formProject, setFormProject] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formDescription, setFormDescription] = useState("");
  const [formNeeds, setFormNeeds] = useState<ProcurementNeedItem[]>(() => [
    { id: "need-init-1", name: "", normalizedName: "", quantity: 1, unit: "Palet" },
  ]);

  // Quote ingestion state (Screen 3)
  const [activeQuoteMethod, setActiveQuoteMethod] = useState<"file" | "text" | "manual">("file");
  const [textQuoteInput, setTextQuoteInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState("");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [previewQuote, setPreviewQuote] = useState<ProcurementSupplierQuote | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const persistComparisons = (next: ProcurementComparison[]) => {
    setComparisons(next);
    if (typeof window !== "undefined") {
      try {
        // Omit oversized >1.5MB dataUrls if storage quota is tight
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        const compact = next.map((c) => ({
          ...c,
          quotes: c.quotes.map((q) => ({ ...q, originalFileDataUrl: undefined })),
        }));
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
        } catch {
          // ignore
        }
      }
    }
  };

  const activeComparison = useMemo(
    () => comparisons.find((c) => c.id === selectedComparisonId) || null,
    [comparisons, selectedComparisonId]
  );

  const evaluationReport = useMemo(() => {
    if (!activeComparison) return null;
    return evaluateProcurementComparison(activeComparison);
  }, [activeComparison]);

  const updateActiveComparison = (updater: (comp: ProcurementComparison) => ProcurementComparison) => {
    if (!activeComparison) return;
    const next = comparisons.map((c) =>
      c.id === activeComparison.id
        ? { ...updater(c), updatedAt: new Date().toISOString() }
        : c
    );
    persistComparisons(next);
  };

  // ---------------------------------------------------------------------------
  // Screen 2: Create / Edit Comparison Handlers
  // ---------------------------------------------------------------------------

  const openNewComparisonForm = () => {
    setEditingComparisonId(null);
    setFormTitle("");
    setFormProject("");
    setFormCompany("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormDescription("");
    setFormNeeds([
      { id: `need-${Date.now()}`, name: "", normalizedName: "", quantity: 1, unit: "Palet" },
    ]);
    setActiveScreen("create");
  };

  const openEditComparisonForm = (comp: ProcurementComparison) => {
    setEditingComparisonId(comp.id);
    setFormTitle(comp.title);
    setFormProject(comp.projectName);
    setFormCompany(comp.companyName || "");
    setFormDate(comp.requestDate);
    setFormDescription(comp.description || "");
    setFormNeeds(
      comp.needs.length > 0
        ? comp.needs
        : [{ id: "need-edit-1", name: "", normalizedName: "", quantity: 1, unit: "Palet" }]
    );
    setActiveScreen("create");
  };

  const handleSaveComparison = (e: React.FormEvent) => {
    e.preventDefault();
    const validNeeds = formNeeds
      .filter((n) => n.name.trim().length > 0 && n.quantity > 0)
      .map((n) => ({
        ...n,
        name: n.name.trim(),
        normalizedName: normalizeProcurementName(n.name),
        unit: normalizeProcurementUnit(n.unit),
      }));

    if (!formTitle.trim() || validNeeds.length === 0) return;

    const now = new Date().toISOString();
    if (editingComparisonId) {
      const next = comparisons.map((c) =>
        c.id === editingComparisonId
          ? {
              ...c,
              title: formTitle.trim(),
              projectName: formProject.trim(),
              companyName: formCompany.trim(),
              requestDate: formDate,
              description: formDescription.trim(),
              needs: validNeeds,
              updatedAt: now,
            }
          : c
      );
      persistComparisons(next);
      setSelectedComparisonId(editingComparisonId);
    } else {
      const created: ProcurementComparison = {
        id: `pc-${Date.now()}`,
        title: formTitle.trim(),
        projectName: formProject.trim(),
        companyName: formCompany.trim(),
        requestDate: formDate,
        description: formDescription.trim(),
        status: "collecting",
        needs: validNeeds,
        quotes: [],
        createdAt: now,
        updatedAt: now,
      };
      persistComparisons([created, ...comparisons]);
      setSelectedComparisonId(created.id);
    }
    setActiveScreen("quotes");
  };

  // ---------------------------------------------------------------------------
  // Screen 3: Quote Ingestion (File / Text / Manual) & Approval
  // ---------------------------------------------------------------------------

  const runClientTesseractOcr = async (file: File): Promise<string> => {
    await loadScriptOnce(
      "tesseract-cdn-script",
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
    const win = window as unknown as { Tesseract?: TesseractLike };
    if (!win.Tesseract) throw new Error("OCR motoru başlatılamadı.");
    const res = await win.Tesseract.recognize(file, "tur+eng");
    return res?.data?.text || "";
  };

  const handleFileUpload = async (fileList: FileList | File[]) => {
    if (!activeComparison) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const addedQuotes: ProcurementSupplierQuote[] = [];

      for (const file of files) {
        setAnalyzeStatus(`Analiz ediliyor: ${file.name}...`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("comparisonId", activeComparison.id);
        fd.append("needs", JSON.stringify(activeComparison.needs));

        const res = await fetch("/api/procurement/analyze", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();

        if (!data?.success) {
          setAnalyzeError(data?.error || `${file.name} analiz edilemedi.`);
          continue;
        }

        if (data.needsClientOcr) {
          setAnalyzeStatus(`Görsel OCR okunuyor: ${file.name}...`);
          const ocrText = await runClientTesseractOcr(file);
          const textRes = await fetch("/api/procurement/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rawText: ocrText || `${file.name}`,
              comparisonId: activeComparison.id,
              needs: activeComparison.needs,
              fileName: file.name,
              sourceType: data.sourceType || "image",
              originalFileMime: data.originalFileMime,
              originalFileDataUrl: data.originalFileDataUrl,
            }),
          });
          const textData = await textRes.json();
          if (textData?.success && textData.quote) {
            addedQuotes.push(textData.quote);
          }
        } else if (data.quote) {
          addedQuotes.push(data.quote);
        }
      }

      if (addedQuotes.length > 0) {
        updateActiveComparison((comp) => ({
          ...comp,
          quotes: [...addedQuotes, ...comp.quotes],
        }));
        setSelectedQuoteId(addedQuotes[0].id);
      }
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : "Dosya analizi başarısız.");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAnalyzeTextQuote = async () => {
    if (!activeComparison || !textQuoteInput.trim()) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeStatus("Teklif metni analiz ediliyor...");

    try {
      const res = await fetch("/api/procurement/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: textQuoteInput,
          comparisonId: activeComparison.id,
          needs: activeComparison.needs,
          sourceType: "text",
        }),
      });
      const data = await res.json();
      if (data?.success && data.quote) {
        updateActiveComparison((comp) => ({
          ...comp,
          quotes: [data.quote, ...comp.quotes],
        }));
        setSelectedQuoteId(data.quote.id);
        setTextQuoteInput("");
      } else {
        setAnalyzeError(data?.error || "Metin analiz edilemedi.");
      }
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : "Metin analizi hatası.");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStatus("");
    }
  };

  const handleCreateManualQuote = () => {
    if (!activeComparison) return;
    const newQuote: ProcurementSupplierQuote = {
      id: `pq-man-${Date.now()}`,
      comparisonId: activeComparison.id,
      supplierName: "",
      currency: "TRY",
      sourceType: "manual",
      shippingMode: "per_order",
      orderShippingAmount: 0,
      shippingVatRate: null,
      shippingVatIncluded: false,
      approved: false,
      aiExtractionNotes: ["Manuel teklif girişi. Kalemleri doldurup onaylayın."],
      items: activeComparison.needs.map((n, idx) => ({
        id: `pqi-man-${Date.now()}-${idx}`,
        matchedNeedId: n.id,
        matchConfidence: "confirmed",
        rawProductName: n.name,
        pricingMode: "unit",
        offeredQuantity: n.quantity,
        minOrderQuantity: null,
        unit: n.unit,
        unitPrice: null,
        lineTotal: null,
        discountRate: 0,
        discountAmount: 0,
        itemShippingAmount: 0,
        vatRate: null,
        vatIncluded: false,
      })),
      createdAt: new Date().toISOString(),
    };

    updateActiveComparison((comp) => ({
      ...comp,
      quotes: [newQuote, ...comp.quotes],
    }));
    setSelectedQuoteId(newQuote.id);
  };

  const updateQuote = (
    quoteId: string,
    updater: (q: ProcurementSupplierQuote) => ProcurementSupplierQuote
  ) => {
    updateActiveComparison((comp) => ({
      ...comp,
      quotes: comp.quotes.map((q) => (q.id === quoteId ? updater(q) : q)),
    }));
  };

  const selectedQuote = useMemo(() => {
    if (!activeComparison) return null;
    return (
      activeComparison.quotes.find((q) => q.id === selectedQuoteId) ||
      activeComparison.quotes[0] ||
      null
    );
  }, [activeComparison, selectedQuoteId]);

  const filteredComparisons = useMemo(() => {
    const q = listSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return comparisons;
    return comparisons.filter(
      (c) =>
        c.title.toLocaleLowerCase("tr-TR").includes(q) ||
        c.projectName.toLocaleLowerCase("tr-TR").includes(q)
    );
  }, [comparisons, listSearch]);

  return (
    <div className="space-y-5">
      {/* Top Module Navigation Bar (4 Required Screens) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2.5 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveScreen("list")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeScreen === "list"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Teklif Karşılaştırmaları ({comparisons.length})</span>
          </button>

          <button
            type="button"
            onClick={openNewComparisonForm}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeScreen === "create"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Yeni Karşılaştırma Oluştur</span>
          </button>

          {activeComparison && (
            <>
              <button
                type="button"
                onClick={() => setActiveScreen("quotes")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  activeScreen === "quotes"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Teklif Detayları ({activeComparison.quotes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveScreen("report")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  activeScreen === "report"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Karşılaştırma Raporu</span>
              </button>
            </>
          )}
        </div>

        {activeComparison && (
          <div className="text-xs font-bold text-slate-600 px-2 truncate max-w-[260px]">
            Aktif: <span className="text-indigo-700">{activeComparison.title}</span>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* SCREEN 1: TEKLİF KARŞILAŞTIRMALARI                                     */}
      {/* ===================================================================== */}
      {activeScreen === "list" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Satın Alma Teklif Karşılaştırmaları</h2>
              <p className="text-xs text-slate-500">
                Her karşılaştırma bir satın alma ihtiyacını ve ona bağlı tedarikçi tekliflerini içerir.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Karşılaştırma veya proje ara..."
                  className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={openNewComparisonForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Karşılaştırma</span>
              </button>
            </div>
          </div>

          {filteredComparisons.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
              <p className="text-sm font-bold text-slate-600">Henüz satın alma karşılaştırması yok.</p>
              <p className="text-xs text-slate-400">
                &quot;Yeni Karşılaştırma Oluştur&quot; ile ihtiyaç listenizi tanımlayıp firma tekliflerini yükleyebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredComparisons.map((comp) => {
                const evalRep = evaluateProcurementComparison(comp);
                const approvedCount = comp.quotes.filter((q) => q.approved).length;
                return (
                  <div
                    key={comp.id}
                    className="rounded-2xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all bg-white flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-indigo-600">
                          {comp.projectName || "Genel Proje"} • {comp.requestDate}
                        </div>
                        <h3 className="text-base font-black text-slate-900 mt-0.5">{comp.title}</h3>
                        {comp.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{comp.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditComparisonForm(comp)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="İhtiyaç listesini düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = comparisons.filter((c) => c.id !== comp.id);
                            persistComparisons(next);
                            if (selectedComparisonId === comp.id) {
                              setSelectedComparisonId(next[0]?.id ?? null);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                        {comp.needs.length} İhtiyaç Kalemi
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700">
                        {approvedCount}/{comp.quotes.length} Onaylı Teklif
                      </span>
                      {evalRep.bestOverallSupplierName && (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700">
                          En Avantajlı: {evalRep.bestOverallSupplierName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComparisonId(comp.id);
                          setActiveScreen("quotes");
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors"
                      >
                        Teklifleri Yönet
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComparisonId(comp.id);
                          setActiveScreen("report");
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors inline-flex items-center justify-center gap-1"
                      >
                        <span>Raporu Gör</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 2: YENİ KARŞILAŞTIRMA OLUŞTUR                                   */}
      {/* ===================================================================== */}
      {activeScreen === "create" && (
        <form
          onSubmit={handleSaveComparison}
          className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6"
        >
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {editingComparisonId ? "Karşılaştırmayı Düzenle" : "Yeni Satın Alma Karşılaştırması Oluştur"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Proje / şantiye bilgilerini ve ihtiyaç duyulan malzeme listesini tanımlayın.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Karşılaştırma Adı *
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Örn: Şantiye Tuğla Alımı"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Proje / Şantiye
              </label>
              <input
                type="text"
                value={formProject}
                onChange={(e) => setFormProject(e.target.value)}
                placeholder="Örn: Ümraniye Konut Projesi"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Talep Tarihi
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Şirket Adı (Rapor İçin)
              </label>
              <input
                type="text"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                placeholder="Örn: Anadolu Yapı A.Ş."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Açıklama</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Teslim yeri, özel şartlar vb."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Dynamic Needs List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">İhtiyaç Listesi</h3>
              <button
                type="button"
                onClick={() =>
                  setFormNeeds([
                    ...formNeeds,
                    {
                      id: `need-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                      name: "",
                      normalizedName: "",
                      quantity: 1,
                      unit: "Palet",
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ürün Ekle</span>
              </button>
            </div>

            <div className="space-y-2">
              {formNeeds.map((need, idx) => (
                <div key={need.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6 sm:col-span-7">
                    <input
                      type="text"
                      required
                      value={need.name}
                      onChange={(e) => {
                        const next = [...formNeeds];
                        next[idx] = { ...need, name: e.target.value };
                        setFormNeeds(next);
                      }}
                      placeholder="Ürün / Malzeme adı (örn: 13,5 cm Tuğla)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required
                      value={need.quantity}
                      onChange={(e) => {
                        const next = [...formNeeds];
                        next[idx] = { ...need, quantity: Number(e.target.value) || 0 };
                        setFormNeeds(next);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <select
                      value={need.unit}
                      onChange={(e) => {
                        const next = [...formNeeds];
                        next[idx] = { ...need, unit: e.target.value };
                        setFormNeeds(next);
                      }}
                      className="w-full px-2 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 text-right">
                    {formNeeds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormNeeds(formNeeds.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setActiveScreen("list")}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
            >
              Kaydet ve Teklif Eklemeye Geç
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 3: TEKLİF DETAYLARI (DOSYA / METİN / MANUEL + ONAY)            */}
      {/* ===================================================================== */}
      {activeScreen === "quotes" && activeComparison && (
        <div className="space-y-5">
          {/* Quote Ingestion Methods Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Tedarikçi Teklifi Ekle ({activeComparison.title})
                </h2>
                <p className="text-xs text-slate-500">
                  İhtiyaç: {activeComparison.needs.map((n) => `${n.name} (${n.quantity} ${n.unit})`).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveQuoteMethod("file")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                    activeQuoteMethod === "file" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Dosya (PDF/Görsel)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveQuoteMethod("text")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                    activeQuoteMethod === "text" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
                  }`}
                >
                  <MessageSquareText className="w-3.5 h-3.5" /> Metin Yapıştır
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuoteMethod("manual");
                    handleCreateManualQuote();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                    activeQuoteMethod === "manual" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> Manuel Giriş
                </button>
              </div>
            </div>

            {activeQuoteMethod === "file" && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 rounded-2xl p-6 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                />
                <UploadCloud className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                <div className="text-xs font-bold text-slate-800">
                  PDF, JPG, JPEG, PNG veya WEBP teklif dosyalarını seçin
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Yapay zekâ / OCR teklifi analiz eder, belirsiz alanları işaretler ve onayınıza sunar.
                </div>
              </div>
            )}

            {activeQuoteMethod === "text" && (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={textQuoteInput}
                  onChange={(e) => setTextQuoteInput(e.target.value)}
                  placeholder='Örn: "Tuğla paleti 1.000 TL, nakliye 1.500 TL. Fiyatlara KDV dahil değildir."'
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAnalyzeTextQuote}
                    disabled={isAnalyzing || !textQuoteInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Metni Analiz Et</span>
                  </button>
                </div>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{analyzeStatus || "Teklif analiz ediliyor..."}</span>
              </div>
            )}

            {analyzeError && (
              <div className="flex items-center gap-2 text-xs font-bold text-rose-700 bg-rose-50 px-3 py-2 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4" />
                <span>{analyzeError}</span>
              </div>
            )}
          </div>

          {/* Quotes Sidebar + Approval Editor */}
          {activeComparison.quotes.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Supplier Quote List */}
              <div className="lg:col-span-4 space-y-2">
                {activeComparison.quotes.map((q) => {
                  const isSel = selectedQuote?.id === q.id;
                  return (
                    <div
                      key={q.id}
                      onClick={() => setSelectedQuoteId(q.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSel
                          ? "border-indigo-500 bg-indigo-50/40 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-black text-sm text-slate-900 truncate">
                            {q.supplierName || "(Firma Adı Girilmemiş)"}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {q.sourceType.toUpperCase()} • {q.items.length} kalem
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            q.approved
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {q.approved ? "Onaylı" : "Onay Bekliyor"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right: Selected Quote Review & Approval Editor */}
              {selectedQuote && (
                <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900">
                        Teklif Kontrol &amp; Onay
                      </h3>
                      {selectedQuote.originalFileDataUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewQuote(selectedQuote)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" /> Orijinal Belgeyi Gör
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateActiveComparison((comp) => ({
                            ...comp,
                            quotes: comp.quotes.filter((q) => q.id !== selectedQuote.id),
                          }));
                        }}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50"
                        title="Teklifi Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateQuote(selectedQuote.id, (q) => ({ ...q, approved: !q.approved }))
                        }
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors ${
                          selectedQuote.approved
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "bg-indigo-600 text-white hover:bg-indigo-500"
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {selectedQuote.approved
                            ? "Onaylandı (Karşılaştırmada)"
                            : "Onayla ve Karşılaştırmaya Dahil Et"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* AI / Extraction Notes */}
                  {selectedQuote.aiExtractionNotes.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1">
                      {selectedQuote.aiExtractionNotes.map((n, i) => (
                        <div key={i} className="text-[11px] font-semibold text-amber-800">
                          • {n}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Supplier Metadata Fields */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Firma Adı *
                      </label>
                      <input
                        type="text"
                        value={selectedQuote.supplierName}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            supplierName: e.target.value,
                          }))
                        }
                        placeholder="Firma adı girin..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Para Birimi
                      </label>
                      <select
                        value={selectedQuote.currency}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            currency: e.target.value as ProcurementCurrency,
                          }))
                        }
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 font-bold bg-white"
                      >
                        <option value="TRY">TRY (₺)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Teklif Tarihi
                      </label>
                      <input
                        type="text"
                        value={selectedQuote.quoteDate || ""}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            quoteDate: e.target.value,
                          }))
                        }
                        placeholder="GG.AA.YYYY"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Nakliye Şekli
                      </label>
                      <select
                        value={selectedQuote.shippingMode}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            shippingMode: e.target.value as ShippingMode,
                          }))
                        }
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="per_order">Sipariş Başına</option>
                        <option value="per_item">Ürün Başına</option>
                        <option value="included">Nakliye Dahil</option>
                        <option value="free">Ücretsiz Nakliye</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Sipariş Nakliye Bedeli
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={selectedQuote.orderShippingAmount}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            orderShippingAmount: Number(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Nakliye KDV (%)
                      </label>
                      <input
                        type="number"
                        value={selectedQuote.shippingVatRate ?? ""}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            shippingVatRate:
                              e.target.value === "" ? null : Number(e.target.value),
                          }))
                        }
                        placeholder="Belirsiz"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Ödeme / Teslimat
                      </label>
                      <input
                        type="text"
                        value={selectedQuote.paymentTerms || ""}
                        onChange={(e) =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            paymentTerms: e.target.value,
                          }))
                        }
                        placeholder="Peşin / 30 Gün"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>

                  {/* Line Items Editor */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800">
                        Teklif Kalemleri &amp; Ürün Eşleştirme
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            items: [
                              ...q.items,
                              {
                                id: `pqi-add-${Date.now()}`,
                                matchedNeedId: activeComparison.needs[0]?.id ?? null,
                                matchConfidence: "confirmed",
                                rawProductName: "",
                                pricingMode: "unit",
                                offeredQuantity: 1,
                                minOrderQuantity: null,
                                unit: activeComparison.needs[0]?.unit || "Adet",
                                unitPrice: null,
                                lineTotal: null,
                                discountRate: 0,
                                discountAmount: 0,
                                itemShippingAmount: 0,
                                vatRate: null,
                                vatIncluded: false,
                              },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold"
                      >
                        <Plus className="w-3.5 h-3.5" /> Kalem Ekle
                      </button>
                    </div>

                    <div className="space-y-2">
                      {selectedQuote.items.map((item, idx) => {
                        const updateItem = (patch: Partial<ProcurementQuoteLineItem>) => {
                          updateQuote(selectedQuote.id, (q) => ({
                            ...q,
                            items: q.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
                          }));
                        };

                        return (
                          <div
                            key={item.id}
                            className="p-3 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                              <div className="sm:col-span-4">
                                <label className="block text-[10px] font-bold text-slate-400">
                                  Teklifteki Ürün Adı
                                </label>
                                <input
                                  type="text"
                                  value={item.rawProductName}
                                  onChange={(e) => updateItem({ rawProductName: e.target.value })}
                                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white font-semibold"
                                />
                              </div>

                              <div className="sm:col-span-4">
                                <label className="block text-[10px] font-bold text-slate-400">
                                  İhtiyaç Eşleşmesi{" "}
                                  {item.matchConfidence === "suggested" && (
                                    <span className="text-amber-600">(Öneri - Onaylayın)</span>
                                  )}
                                </label>
                                <select
                                  value={item.matchedNeedId || item.suggestedNeedId || ""}
                                  onChange={(e) =>
                                    updateItem({
                                      matchedNeedId: e.target.value || null,
                                      matchConfidence: e.target.value ? "confirmed" : "unmatched",
                                    })
                                  }
                                  className={`w-full px-2 py-1 rounded-lg border bg-white font-bold ${
                                    item.matchConfidence === "suggested" && !item.matchedNeedId
                                      ? "border-amber-400 bg-amber-50"
                                      : "border-slate-300"
                                  }`}
                                >
                                  <option value="">-- Eşleşme Seçin --</option>
                                  {activeComparison.needs.map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {n.name} ({n.quantity} {n.unit})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-slate-400">
                                  Fiyatlandırma
                                </label>
                                <select
                                  value={item.pricingMode}
                                  onChange={(e) =>
                                    updateItem({
                                      pricingMode: e.target.value as "unit" | "total",
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white font-semibold"
                                >
                                  <option value="unit">Birim Fiyat</option>
                                  <option value="total">Toplam Fiyat</option>
                                </select>
                              </div>

                              <div className="sm:col-span-1 text-right pt-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuote(selectedQuote.id, (q) => ({
                                      ...q,
                                      items: q.items.filter((_, i) => i !== idx),
                                    }))
                                  }
                                  className="p-1 text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                              <div>
                                <label className="block text-[10px] text-slate-400">Teklif Miktarı</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={item.offeredQuantity ?? ""}
                                  onChange={(e) =>
                                    updateItem({
                                      offeredQuantity:
                                        e.target.value === "" ? null : Number(e.target.value),
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-right font-bold"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400">
                                  {item.pricingMode === "total" ? "Toplam Fiyat" : "Birim Fiyat"}
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  value={
                                    item.pricingMode === "total"
                                      ? (item.lineTotal ?? "")
                                      : (item.unitPrice ?? "")
                                  }
                                  onChange={(e) => {
                                    const val =
                                      e.target.value === "" ? null : Number(e.target.value);
                                    updateItem(
                                      item.pricingMode === "total"
                                        ? { lineTotal: val }
                                        : { unitPrice: val }
                                    );
                                  }}
                                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-right font-bold"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400">İskonto (%)</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={item.discountRate}
                                  onChange={(e) =>
                                    updateItem({ discountRate: Number(e.target.value) || 0 })
                                  }
                                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-right"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400">
                                  KDV (%) {item.vatRate === null && <span className="text-rose-600">*</span>}
                                </label>
                                <input
                                  type="number"
                                  value={item.vatRate ?? ""}
                                  onChange={(e) =>
                                    updateItem({
                                      vatRate:
                                        e.target.value === "" ? null : Number(e.target.value),
                                    })
                                  }
                                  placeholder="Girin"
                                  className={`w-full px-2 py-1 rounded-lg border bg-white text-right font-bold ${
                                    item.vatRate === null ? "border-amber-400" : "border-slate-300"
                                  }`}
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400">KDV Durumu</label>
                                <select
                                  value={item.vatIncluded ? "included" : "excluded"}
                                  onChange={(e) =>
                                    updateItem({ vatIncluded: e.target.value === "included" })
                                  }
                                  className="w-full px-1.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold"
                                >
                                  <option value="excluded">KDV Hariç</option>
                                  <option value="included">KDV Dahil</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400">Min. Sipariş</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={item.minOrderQuantity ?? ""}
                                  onChange={(e) =>
                                    updateItem({
                                      minOrderQuantity:
                                        e.target.value === "" ? null : Number(e.target.value),
                                    })
                                  }
                                  placeholder="-"
                                  className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-right"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SCREEN 4: KARŞILAŞTIRMA RAPORU                                         */}
      {/* ===================================================================== */}
      {activeScreen === "report" && activeComparison && evaluationReport && (
        <ProcurementReportView
          comparison={activeComparison}
          report={evaluationReport}
          onGoToQuotes={() => setActiveScreen("quotes")}
        />
      )}

      {/* Original Document Preview Modal */}
      {previewQuote && previewQuote.originalFileDataUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                {previewQuote.sourceType === "pdf" ? (
                  <FileText className="w-4 h-4 text-rose-600" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                )}
                <span>{previewQuote.originalFileName || "Orijinal Teklif"}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQuote(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center">
              {previewQuote.sourceType === "pdf" ? (
                <iframe
                  src={previewQuote.originalFileDataUrl}
                  className="w-full h-[75vh] rounded-xl bg-white"
                  title="Orijinal Teklif PDF"
                />
              ) : (
                <img
                  src={previewQuote.originalFileDataUrl}
                  alt="Orijinal Teklif"
                  className="max-h-[75vh] object-contain rounded-xl shadow"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
