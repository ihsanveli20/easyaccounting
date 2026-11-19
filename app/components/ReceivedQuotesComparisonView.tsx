"use client";

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  UploadCloud,
  X,
} from "lucide-react";
import {
  QuoteCurrency,
  QuoteFileType,
  ReceivedQuoteDocument,
  ReceivedQuoteItem,
} from "../types/receivedQuotes";
import {
  buildComparisonMatrix,
  normalizeQuoteText,
  normalizeUnitLabel,
  parseQuoteTextToDocument,
  recalculateQuoteTotals,
} from "../utils/receivedQuotesParser";
import ProductQuoteCards from "./ProductQuoteCards";

const STORAGE_KEY = "easy_accounting_received_quotes_v1";

interface TesseractLike {
  recognize: (
    image: File | Blob | string,
    langs: string,
    opts?: { logger?: (m: { status?: string; progress?: number }) => void }
  ) => Promise<{ data?: { text?: string } }>;
}

interface PdfJsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
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

function formatMoney(amount: number, currency: QuoteCurrency = "TRY"): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
  return `${symbol}${(Number(amount) || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function createDemoQuotes(): ReceivedQuoteDocument[] {
  const now = new Date().toISOString();
  const q1 = recalculateQuoteTotals({
    id: `demo-q1-${Date.now()}`,
    fileName: "Anadolu_Yapi_Teklif.pdf",
    fileType: "pdf",
    supplierName: "Anadolu Yapı Malzemeleri A.Ş.",
    quoteNo: "AYM-2026-412",
    quoteDate: "2026-11-10",
    currency: "TRY",
    paymentTerms: "30 Gün Vade",
    deliveryTerms: "Depo Teslim (2 İş Günü)",
    subtotal: 0,
    vatTotal: 0,
    grandTotal: 0,
    parseStatus: "parsed",
    parseNote: "Örnek PDF teklifi",
    createdAt: now,
    items: [
      {
        id: "dq1-1",
        name: "12mm Nervürlü İnşaat Demiri",
        normalizedName: "12mm nervurlu insaat demiri",
        quantity: 2000,
        unit: "Kg",
        unitPrice: 28.5,
        vatRate: 20,
        lineTotal: 57000,
        lineTotalWithVat: 68400,
      },
      {
        id: "dq1-2",
        name: "CEM II 42.5 Çimento 50 Kg Torba",
        normalizedName: "cem ii 42.5 cimento 50 kg torba",
        quantity: 150,
        unit: "Adet",
        unitPrice: 195,
        vatRate: 20,
        lineTotal: 29250,
        lineTotalWithVat: 35100,
      },
      {
        id: "dq1-3",
        name: "13.5x19x19 Yatay Delikli Tuğla",
        normalizedName: "13.5x19x19 yatay delikli tugla",
        quantity: 3000,
        unit: "Adet",
        unitPrice: 8.4,
        vatRate: 20,
        lineTotal: 25200,
        lineTotalWithVat: 30240,
      },
    ],
  });

  const q2 = recalculateQuoteTotals({
    id: `demo-q2-${Date.now() + 1}`,
    fileName: "Marmara_Tedarik_Fiyat_Listesi.xlsx",
    fileType: "excel",
    supplierName: "Marmara Endüstriyel Tedarik Ltd.",
    quoteNo: "MET-8891",
    quoteDate: "2026-11-12",
    currency: "TRY",
    paymentTerms: "Peşin / Havale",
    deliveryTerms: "Şantiye Teslim (Ücretsiz Nakliye)",
    subtotal: 0,
    vatTotal: 0,
    grandTotal: 0,
    parseStatus: "parsed",
    parseNote: "Örnek Excel teklifi",
    createdAt: now,
    items: [
      {
        id: "dq2-1",
        name: "12mm İnşaat Demiri Nervürlü",
        normalizedName: "12mm insaat demiri nervurlu",
        quantity: 2000,
        unit: "Kg",
        unitPrice: 27.2,
        vatRate: 20,
        lineTotal: 54400,
        lineTotalWithVat: 65280,
      },
      {
        id: "dq2-2",
        name: "CEM II 42.5 Çimento 50 Kg",
        normalizedName: "cem ii 42.5 cimento 50 kg",
        quantity: 150,
        unit: "Adet",
        unitPrice: 204,
        vatRate: 20,
        lineTotal: 30600,
        lineTotalWithVat: 36720,
      },
      {
        id: "dq2-3",
        name: "13.5x19x19 Delikli Tuğla",
        normalizedName: "13.5x19x19 delikli tugla",
        quantity: 3000,
        unit: "Adet",
        unitPrice: 7.9,
        vatRate: 20,
        lineTotal: 23700,
        lineTotalWithVat: 28440,
      },
    ],
  });

  const q3 = recalculateQuoteTotals({
    id: `demo-q3-${Date.now() + 2}`,
    fileName: "Kuzey_Insaat_WhatsApp_Teklif.jpg",
    fileType: "image",
    supplierName: "Kuzey İnşaat & Nalburiye",
    quoteNo: "KZN-104",
    quoteDate: "2026-11-14",
    currency: "TRY",
    paymentTerms: "15 Gün Çek / Havale",
    deliveryTerms: "1 Günde Teslim",
    subtotal: 0,
    vatTotal: 0,
    grandTotal: 0,
    parseStatus: "parsed",
    parseNote: "Örnek görsel teklifi",
    createdAt: now,
    items: [
      {
        id: "dq3-1",
        name: "12mm Nervürlü İnşaat Demiri",
        normalizedName: "12mm nervurlu insaat demiri",
        quantity: 2000,
        unit: "Kg",
        unitPrice: 29.1,
        vatRate: 20,
        lineTotal: 58200,
        lineTotalWithVat: 69840,
      },
      {
        id: "dq3-2",
        name: "CEM II 42.5 Çimento 50 Kg Torba",
        normalizedName: "cem ii 42.5 cimento 50 kg torba",
        quantity: 150,
        unit: "Adet",
        unitPrice: 188,
        vatRate: 20,
        lineTotal: 28200,
        lineTotalWithVat: 33840,
      },
      {
        id: "dq3-3",
        name: "13.5x19x19 Yatay Delikli Tuğla",
        normalizedName: "13.5x19x19 yatay delikli tugla",
        quantity: 3000,
        unit: "Adet",
        unitPrice: 8.6,
        vatRate: 20,
        lineTotal: 25800,
        lineTotalWithVat: 30960,
      },
    ],
  });

  return [q1, q2, q3];
}

function readInitialQuotes(): ReceivedQuoteDocument[] {
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

export default function ReceivedQuotesComparisonView() {
  const [quotes, setQuotes] = useState<ReceivedQuoteDocument[]>(readInitialQuotes);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"products" | "summary" | "matrix" | "optimal">("products");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyMultiMatched, setOnlyMultiMatched] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const persistQuotes = (next: ReceivedQuoteDocument[]) => {
    setQuotes(next);
    if (typeof window !== "undefined") {
      try {
        // Avoid storing huge base64 data URLs in localStorage
        const compact = next.map((q) => ({
          ...q,
          previewUrl:
            q.previewUrl && q.previewUrl.startsWith("blob:") ? undefined : q.previewUrl,
        }));
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      } catch {
        // ignore storage quota errors
      }
    }
  };

  const runImageOcr = async (file: File): Promise<string> => {
    await loadScriptOnce(
      "tesseract-cdn-script",
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
    const win = window as unknown as { Tesseract?: TesseractLike };
    if (!win.Tesseract) {
      throw new Error("Görsel OCR motoru (Tesseract) başlatılamadı.");
    }

    const res = await win.Tesseract.recognize(file, "tur+eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          const pct = Math.round(m.progress * 100);
          setProgressText(`Görsel okunuyor (OCR %${pct}): ${file.name}`);
        }
      },
    });
    return res?.data?.text || "";
  };

  const runScannedPdfOcr = async (file: File): Promise<string> => {
    await loadScriptOnce(
      "tesseract-cdn-script",
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
    await loadScriptOnce(
      "pdfjs-cdn-script",
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
    );

    const win = window as unknown as {
      Tesseract?: TesseractLike;
      pdfjsLib?: PdfJsLike;
    };
    if (!win.pdfjsLib || !win.Tesseract) return "";

    win.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const buf = await file.arrayBuffer();
    const pdf = await win.pdfjsLib.getDocument({ data: buf }).promise;
    const maxPages = Math.min(pdf.numPages, 5);
    let combined = "";

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      setProgressText(`Taranmış PDF okunuyor (Sayfa ${pageNum}/${maxPages}): ${file.name}`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      const ocrRes = await win.Tesseract.recognize(dataUrl, "tur+eng");
      combined += `\n${ocrRes?.data?.text || ""}`;
    }

    return combined;
  };

  const processUploadedFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);
    const newlyAdded: ReceivedQuoteDocument[] = [];

    try {
      const serverFiles: File[] = [];
      const imageFiles: File[] = [];

      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (
          f.type.startsWith("image/") ||
          /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(lower)
        ) {
          imageFiles.push(f);
        } else if (/\.(pdf|xlsx|xls|csv)$/i.test(lower)) {
          serverFiles.push(f);
        } else {
          setErrorMsg(
            `Desteklenmeyen dosya türü atlandı: ${f.name}. Lütfen PDF, Excel veya Görsel yükleyin.`
          );
        }
      }

      // 1. Process PDF & Excel files via server API
      if (serverFiles.length > 0) {
        setProgressText(`${serverFiles.length} adet PDF / Excel dosyası ayrıştırılıyor...`);
        const formData = new FormData();
        serverFiles.forEach((f) => formData.append("files", f));

        const res = await fetch("/api/received-quotes/parse", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data?.success && Array.isArray(data.quotes)) {
          for (let i = 0; i < data.quotes.length; i++) {
            const q = data.quotes[i];
            const originalFile = serverFiles[i];
            if (q.needsClientOcr && originalFile && originalFile.name.toLowerCase().endsWith(".pdf")) {
              try {
                const ocrText = await runScannedPdfOcr(originalFile);
                const parsed = parseQuoteTextToDocument(ocrText, originalFile.name, "pdf");
                newlyAdded.push(
                  recalculateQuoteTotals({
                    ...parsed,
                    id: `rq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    fileSize: originalFile.size,
                    createdAt: new Date().toISOString(),
                  })
                );
                continue;
              } catch {
                // fallback to server empty result for manual editing
              }
            }

            newlyAdded.push(
              recalculateQuoteTotals({
                ...q,
                id: `rq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                createdAt: new Date().toISOString(),
              })
            );
          }
        } else if (data?.error) {
          setErrorMsg(data.error);
        }
      }

      // 2. Process Image files via Tesseract OCR + visual preview
      for (const imgFile of imageFiles) {
        setProgressText(`Görsel teklif okunuyor: ${imgFile.name}...`);
        const previewUrl = URL.createObjectURL(imgFile);
        let rawText = "";
        try {
          rawText = await runImageOcr(imgFile);
        } catch (ocrErr) {
          console.warn("Image OCR warning:", ocrErr);
        }

        const parsed = parseQuoteTextToDocument(rawText, imgFile.name, "image");
        newlyAdded.push(
          recalculateQuoteTotals({
            ...parsed,
            id: `rq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            fileSize: imgFile.size,
            previewUrl,
            createdAt: new Date().toISOString(),
          })
        );
      }

      if (newlyAdded.length > 0) {
        const updated = [...quotes, ...newlyAdded];
        persistQuotes(updated);
        // Automatically open editor if any uploaded quote had 0 parsed items
        const needsReview = newlyAdded.find((q) => q.items.length === 0);
        if (needsReview) {
          setEditingQuoteId(needsReview.id);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Dosyalar işlenirken bir hata oluştu."
      );
    } finally {
      setIsProcessing(false);
      setProgressText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddManualQuote = () => {
    const newQuote = recalculateQuoteTotals({
      id: `rq-manual-${Date.now()}`,
      fileName: "Manuel_Teklif",
      fileType: "manual",
      supplierName: `Tedarikçi ${quotes.length + 1}`,
      quoteNo: `TEK-${quotes.length + 1}`,
      quoteDate: new Date().toISOString().split("T")[0],
      currency: "TRY",
      subtotal: 0,
      vatTotal: 0,
      grandTotal: 0,
      items: [
        {
          id: `rq-mitem-${Date.now()}`,
          name: "Örnek Ürün / Kalem",
          normalizedName: "ornek urun kalem",
          quantity: 1,
          unit: "Adet",
          unitPrice: 0,
          vatRate: 20,
          lineTotal: 0,
          lineTotalWithVat: 0,
        },
      ],
      parseStatus: "needs_review",
      createdAt: new Date().toISOString(),
    });
    persistQuotes([...quotes, newQuote]);
    setEditingQuoteId(newQuote.id);
  };

  const handleDeleteQuote = (id: string) => {
    const target = quotes.find((q) => q.id === id);
    if (target?.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(target.previewUrl);
    }
    const next = quotes.filter((q) => q.id !== id);
    persistQuotes(next);
    if (editingQuoteId === id) setEditingQuoteId(null);
  };

  const handleUpdateQuote = (updated: ReceivedQuoteDocument) => {
    const recalculated = recalculateQuoteTotals({
      ...updated,
      parseStatus: updated.items.length > 0 ? "parsed" : "needs_review",
    });
    persistQuotes(quotes.map((q) => (q.id === recalculated.id ? recalculated : q)));
  };

  const editingQuote = useMemo(
    () => quotes.find((q) => q.id === editingQuoteId) || null,
    [quotes, editingQuoteId]
  );

  // Build comparison matrix & summary metrics
  const matrixRows = useMemo(() => buildComparisonMatrix(quotes), [quotes]);

  const filteredMatrixRows = useMemo(() => {
    const q = normalizeQuoteText(searchQuery);
    return matrixRows.filter((row) => {
      if (onlyMultiMatched && row.matchedQuoteCount < 2) return false;
      if (!q) return true;
      return normalizeQuoteText(row.displayName).includes(q);
    });
  }, [matrixRows, searchQuery, onlyMultiMatched]);

  const summaryStats = useMemo(() => {
    const validTotals = quotes.filter((q) => q.grandTotal > 0);
    const sorted = [...validTotals].sort((a, b) => a.grandTotal - b.grandTotal);
    const lowestQuote = sorted[0] || null;
    const highestQuote = sorted[sorted.length - 1] || null;

    const totalSpread =
      lowestQuote && highestQuote && highestQuote.grandTotal > lowestQuote.grandTotal
        ? highestQuote.grandTotal - lowestQuote.grandTotal
        : 0;

    // Optimal split total (net without VAT across lowest item unit prices * qty)
    let optimalNetTotal = 0;
    for (const row of matrixRows) {
      if (row.lowestQuoteId && row.cells[row.lowestQuoteId]) {
        optimalNetTotal += row.cells[row.lowestQuoteId].effectiveLineTotal;
      }
    }

    return {
      lowestQuote,
      highestQuote,
      totalSpread,
      optimalNetTotal,
      multiMatchedCount: matrixRows.filter((r) => r.matchedQuoteCount >= 2).length,
    };
  }, [quotes, matrixRows]);

  const handleExportExcel = () => {
    if (quotes.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Supplier Summary
    const summaryData = quotes.map((q) => ({
      "Tedarikçi Firma": q.supplierName,
      "Dosya Adı": q.fileName,
      Format: q.fileType.toUpperCase(),
      "Teklif No": q.quoteNo || "-",
      Tarih: q.quoteDate || "-",
      "Kalem Sayısı": q.items.length,
      "Para Birimi": q.currency,
      "Ara Toplam": q.subtotal,
      "KDV Toplam": q.vatTotal,
      "Genel Toplam": q.grandTotal,
      "Ödeme Koşulu": q.paymentTerms || "-",
      "Teslimat": q.deliveryTerms || "-",
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, "Teklif Özeti");

    // Sheet 2: Item Comparison Matrix
    const matrixData = matrixRows.map((row) => {
      const obj: Record<string, string | number> = {
        "Ürün / Malzeme": row.displayName,
        Birim: row.canonicalUnit,
        "En Uygun Tedarikçi": row.lowestSupplierName || "-",
        "En Düşük Birim Fiyat": row.lowestUnitPrice || 0,
        "En Yüksek Birim Fiyat": row.highestUnitPrice || 0,
        "Fiyat Farkı (%)": row.spreadPct,
      };
      for (const q of quotes) {
        const cell = row.cells[q.id];
        obj[`${q.supplierName} (Birim)`] = cell ? cell.effectiveUnitPrice : "-";
        obj[`${q.supplierName} (Toplam)`] = cell ? cell.effectiveLineTotal : "-";
      }
      return obj;
    });
    const ws2 = XLSX.utils.json_to_sheet(matrixData);
    XLSX.utils.book_append_sheet(wb, ws2, "Kalem Matrisi");

    // Sheet 3: All Raw Items
    const allItemsData = quotes.flatMap((q) =>
      q.items.map((it) => ({
        "Tedarikçi Firma": q.supplierName,
        "Dosya": q.fileName,
        "Ürün / Malzeme": it.name,
        Miktar: it.quantity,
        Birim: it.unit,
        "Birim Fiyat": it.unitPrice,
        "KDV %": it.vatRate,
        "Net Tutar": it.lineTotal,
        "KDV Dahil Tutar": it.lineTotalWithVat,
      }))
    );
    const ws3 = XLSX.utils.json_to_sheet(allItemsData);
    XLSX.utils.book_append_sheet(wb, ws3, "Tüm Kalemler");

    XLSX.writeFile(
      wb,
      `Gelen_Teklif_Karsilastirma_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const renderFileTypeBadge = (type: QuoteFileType) => {
    if (type === "pdf") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
          <FileText className="w-3 h-3" /> PDF
        </span>
      );
    }
    if (type === "excel") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
          <FileSpreadsheet className="w-3 h-3" /> EXCEL
        </span>
      );
    }
    if (type === "image") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
          <ImageIcon className="w-3 h-3" /> GÖRSEL
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
        MANUEL
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Upload & Action Panel */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200/70 text-indigo-700 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Çoklu Format Teklif Analiz Merkezi</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Gelen Teklifleri Yükle &amp; Karşılaştır
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Tedarikçilerden gelen <strong>PDF, Excel (.xlsx/.xls/.csv) ve Görsel (.png/.jpg)</strong> teklifleri aynı anda birden fazla dosya olarak yükleyin; kalem bazında en uygun fiyatı görün.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => persistQuotes([...quotes, ...createDemoQuotes()])}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Örnek Tekliflerle Dene</span>
            </button>

            <button
              type="button"
              onClick={handleAddManualQuote}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manuel Teklif Ekle</span>
            </button>

            {quotes.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel İndir</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    persistQuotes([]);
                    setEditingQuoteId(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Temizle</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Multi-file Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              processUploadedFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-7 sm:p-9 text-center transition-all ${isDragging
            ? "border-indigo-500 bg-indigo-50/70 scale-[1.005]"
            : "border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/30"
            }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                processUploadedFiles(e.target.files);
              }
            }}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-2.5">
              <Loader2 className="w-9 h-9 text-indigo-600 animate-spin" />
              <div className="text-sm font-bold text-slate-800">
                {progressText || "Teklifler işleniyor..."}
              </div>
              <div className="text-xs text-slate-500">
                PDF metinleri, Excel tabloları ve görsel OCR kalemleri analiz ediliyor.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-1">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-sm sm:text-base font-extrabold text-slate-800">
                Teklif Dosyalarını Buraya Sürükleyin veya Seçin (Çoklu Seçim)
              </div>
              <div className="text-xs text-slate-500 max-w-xl">
                Aynı anda birden fazla <strong>PDF</strong>, <strong>Excel (.xlsx / .xls / .csv)</strong> ve <strong>Görsel (PNG / JPG / WhatsApp Ekran Görüntüsü)</strong> yükleyebilirsiniz.
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Uploaded Quotes Grid */}
      {quotes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {quotes.map((q) => {
            const isLowest = summaryStats.lowestQuote?.id === q.id && quotes.length > 1;
            const isEditing = editingQuoteId === q.id;
            return (
              <div
                key={q.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition-all flex flex-col justify-between gap-3 ${isLowest
                  ? "border-emerald-400 ring-2 ring-emerald-500/15"
                  : isEditing
                    ? "border-indigo-400 ring-2 ring-indigo-500/15"
                    : "border-slate-200"
                  }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {renderFileTypeBadge(q.fileType)}
                      {isLowest && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white">
                          <Award className="w-3 h-3" /> EN EKONOMİK
                        </span>
                      )}
                      {q.items.length === 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Kalem Kontrolü Gerekli
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuote(q.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Teklifi kaldır"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 truncate">
                      {q.supplierName}
                    </h3>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {q.fileName} {q.quoteNo ? `• #${q.quoteNo}` : ""}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Genel Toplam ({q.items.length} Kalem)
                    </div>
                    <div className="text-lg font-black text-slate-900">
                      {formatMoney(q.grandTotal, q.currency)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingQuoteId(isEditing ? null : q.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${isEditing
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700"
                      }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditing ? "Editörü Kapat" : "İncele / Düzenle"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Split Inspector / Editor for Selected Quote */}
      {editingQuote && (
        <div className="bg-white rounded-3xl border border-indigo-200 shadow-lg p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              {renderFileTypeBadge(editingQuote.fileType)}
              <h3 className="text-base font-extrabold text-slate-900">
                Teklif İnceleme &amp; Kalem Düzenleyici — {editingQuote.supplierName}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setEditingQuoteId(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Visual preview or raw OCR/PDF text */}
            {(editingQuote.previewUrl || editingQuote.rawText) && (
              <div className="lg:col-span-4 space-y-3">
                {editingQuote.previewUrl && (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                    <div className="px-3 py-2 text-[11px] font-bold text-slate-600 border-b border-slate-200 bg-white">
                      Yüklenen Görsel Önizleme
                    </div>
                    <img
                      src={editingQuote.previewUrl}
                      alt={editingQuote.fileName}
                      className="w-full max-h-[420px] object-contain"
                    />
                  </div>
                )}

                {editingQuote.rawText && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600 mb-1.5">
                      Dosyadan Okunan Ham Metin
                    </div>
                    <pre className="text-[11px] text-slate-600 whitespace-pre-wrap max-h-56 overflow-y-auto font-mono leading-relaxed">
                      {editingQuote.rawText}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Right: Metadata + Editable Line Items */}
            <div
              className={
                editingQuote.previewUrl || editingQuote.rawText
                  ? "lg:col-span-8 space-y-4"
                  : "lg:col-span-12 space-y-4"
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Tedarikçi Firma Adı
                  </label>
                  <input
                    type="text"
                    value={editingQuote.supplierName}
                    onChange={(e) =>
                      handleUpdateQuote({ ...editingQuote, supplierName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Teklif No
                  </label>
                  <input
                    type="text"
                    value={editingQuote.quoteNo || ""}
                    onChange={(e) =>
                      handleUpdateQuote({ ...editingQuote, quoteNo: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Para Birimi
                  </label>
                  <select
                    value={editingQuote.currency}
                    onChange={(e) =>
                      handleUpdateQuote({
                        ...editingQuote,
                        currency: e.target.value as QuoteCurrency,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Ödeme / Vade Koşulu
                  </label>
                  <input
                    type="text"
                    value={editingQuote.paymentTerms || ""}
                    placeholder="Örn: 30 gün vade / peşin"
                    onChange={(e) =>
                      handleUpdateQuote({ ...editingQuote, paymentTerms: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Teslimat Koşulu
                  </label>
                  <input
                    type="text"
                    value={editingQuote.deliveryTerms || ""}
                    placeholder="Örn: Şantiye teslim / 2 iş günü"
                    onChange={(e) =>
                      handleUpdateQuote({ ...editingQuote, deliveryTerms: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Editable Line Items */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3">Ürün / Malzeme Adı</th>
                      <th className="py-2.5 px-2 w-20">Miktar</th>
                      <th className="py-2.5 px-2 w-24">Birim</th>
                      <th className="py-2.5 px-2 w-28">Birim Fiyat</th>
                      <th className="py-2.5 px-2 w-20">KDV %</th>
                      <th className="py-2.5 px-3 text-right">Net Tutar</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editingQuote.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const items = editingQuote.items.map((it) =>
                                it.id === item.id ? { ...it, name: e.target.value } : it
                              );
                              handleUpdateQuote({ ...editingQuote, items });
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const qty = Number(e.target.value) || 0;
                              const items = editingQuote.items.map((it) =>
                                it.id === item.id ? { ...it, quantity: qty } : it
                              );
                              handleUpdateQuote({ ...editingQuote, items });
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-right"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => {
                              const items = editingQuote.items.map((it) =>
                                it.id === item.id
                                  ? { ...it, unit: normalizeUnitLabel(e.target.value) }
                                  : it
                              );
                              handleUpdateQuote({ ...editingQuote, items });
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const price = Number(e.target.value) || 0;
                              const items = editingQuote.items.map((it) =>
                                it.id === item.id ? { ...it, unitPrice: price } : it
                              );
                              handleUpdateQuote({ ...editingQuote, items });
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-right"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={item.vatRate}
                            onChange={(e) => {
                              const vat = Number(e.target.value) || 0;
                              const items = editingQuote.items.map((it) =>
                                it.id === item.id ? { ...it, vatRate: vat } : it
                              );
                              handleUpdateQuote({ ...editingQuote, items });
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-right"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                          {formatMoney(item.lineTotal, editingQuote.currency)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const items = editingQuote.items.filter((it) => it.id !== item.id);
                              handleUpdateQuote({ ...editingQuote, items });
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const newItem: ReceivedQuoteItem = {
                      id: `rq-add-${Date.now()}`,
                      name: "Yeni Kalem",
                      normalizedName: "yeni kalem",
                      quantity: 1,
                      unit: "Adet",
                      unitPrice: 0,
                      vatRate: 20,
                      lineTotal: 0,
                      lineTotalWithVat: 0,
                    };
                    handleUpdateQuote({
                      ...editingQuote,
                      items: [...editingQuote.items, newItem],
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Kalem Ekle</span>
                </button>

                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-4">
                  <span>
                    Ara Toplam: <strong>{formatMoney(editingQuote.subtotal, editingQuote.currency)}</strong>
                  </span>
                  <span>
                    KDV: <strong>{formatMoney(editingQuote.vatTotal, editingQuote.currency)}</strong>
                  </span>
                  <span className="text-sm text-slate-900">
                    Genel Toplam: <strong>{formatMoney(editingQuote.grandTotal, editingQuote.currency)}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Section */}
      <div className="space-y-4">
        {/* KPI Cards (when uploaded/manual quotes exist) */}
        {quotes.length >= 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Yüklenen Teklif Sayısı
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{quotes.length} Firma</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {matrixRows.length} kalem ({summaryStats.multiMatchedCount} ortak eşleşen)
              </div>
            </div>

            <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                <Award className="w-3.5 h-3.5" /> En Uygun Toplam Teklif
              </div>
              <div className="text-2xl font-black text-emerald-900 mt-1">
                {summaryStats.lowestQuote
                  ? formatMoney(summaryStats.lowestQuote.grandTotal, summaryStats.lowestQuote.currency)
                  : "-"}
              </div>
              <div className="text-xs font-semibold text-emerald-700 truncate mt-0.5">
                {summaryStats.lowestQuote?.supplierName || "-"}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-indigo-600" /> En Pahalıya Göre Tasarruf
              </div>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {formatMoney(summaryStats.totalSpread, summaryStats.lowestQuote?.currency || "TRY")}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {summaryStats.highestQuote && quotes.length > 1
                  ? `En yüksek: ${summaryStats.highestQuote.supplierName}`
                  : "Karşılaştırma için en az 2 teklif yükleyin"}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-600" /> Kalem Bazlı En İyi Toplam (Net)
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {formatMoney(summaryStats.optimalNetTotal, summaryStats.lowestQuote?.currency || "TRY")}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Her kalemi en ucuz firmadan alma maliyeti
              </div>
            </div>
          </div>
        )}

        {/* Sub-tab Switcher */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50/70">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveSubTab("products")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${activeSubTab === "products"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
              >
                Ürün Bazlı Karşılaştırma
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab("matrix")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${activeSubTab === "matrix"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
              >
                Kalem Bazlı Fiyat Matrisi ({matrixRows.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab("summary")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${activeSubTab === "summary"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
              >
                Tedarikçi Genel Özeti ({quotes.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab("optimal")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${activeSubTab === "optimal"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
              >
                Karma Sipariş Önerisi
              </button>
            </div>

            {activeSubTab === "matrix" && quotes.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Kalem ara..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyMultiMatched}
                    onChange={(e) => setOnlyMultiMatched(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Sadece Ortak Kalemler</span>
                </label>
              </div>
            )}
          </div>

          {/* Sub-tab 0: Product-by-Product Comparison Cards */}
          {activeSubTab === "products" && <ProductQuoteCards quotes={quotes} />}

          {/* Empty state for file-based sub-tabs when no quotes uploaded */}
          {activeSubTab !== "products" && quotes.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">
              Bu görünüm için yukarıdan en az bir PDF, Excel, Görsel veya Manuel teklif ekleyin.
            </div>
          )}

          {quotes.length > 0 && (
            <>
            {/* Sub-tab 1: Item Comparison Matrix */}
            {activeSubTab === "matrix" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4 min-w-[220px]">Ürün / Malzeme</th>
                      <th className="py-3 px-3">Birim</th>
                      {quotes.map((q) => (
                        <th key={q.id} className="py-3 px-4 min-w-[170px] border-l border-slate-200">
                          <div className="font-extrabold text-slate-900 truncate max-w-[180px]">
                            {q.supplierName}
                          </div>
                          <div className="text-[10px] font-normal text-slate-500">
                            {q.fileType.toUpperCase()} • {q.currency}
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-4 border-l border-slate-200">Fark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMatrixRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={quotes.length + 3}
                          className="py-10 text-center text-slate-400 font-medium"
                        >
                          Gösterilecek kalem bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      filteredMatrixRows.map((row) => (
                        <tr key={row.key} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <div>{row.displayName}</div>
                            {row.lowestSupplierName && row.matchedQuoteCount > 1 && (
                              <div className="text-[10px] font-semibold text-emerald-600 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                En uygun: {row.lowestSupplierName}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-semibold">
                            {row.canonicalUnit}
                          </td>
                          {quotes.map((q) => {
                            const cell = row.cells[q.id];
                            if (!cell) {
                              return (
                                <td
                                  key={q.id}
                                  className="py-3 px-4 border-l border-slate-100 text-slate-300 text-center"
                                >
                                  —
                                </td>
                              );
                            }
                            return (
                              <td
                                key={q.id}
                                className={`py-3 px-4 border-l border-slate-100 ${cell.isLowestUnitPrice && row.matchedQuoteCount > 1
                                  ? "bg-emerald-50/80"
                                  : cell.isHighestUnitPrice && row.matchedQuoteCount > 1
                                    ? "bg-rose-50/70"
                                    : ""
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`font-black text-sm ${cell.isLowestUnitPrice && row.matchedQuoteCount > 1
                                      ? "text-emerald-700"
                                      : cell.isHighestUnitPrice && row.matchedQuoteCount > 1
                                        ? "text-rose-700"
                                        : "text-slate-900"
                                      }`}
                                  >
                                    {formatMoney(cell.effectiveUnitPrice, q.currency)}
                                  </span>
                                  {cell.diffFromLowestPct > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                                      +%{cell.diffFromLowestPct}
                                    </span>
                                  )}
                                  {cell.isLowestUnitPrice && row.matchedQuoteCount > 1 && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                                      EN UCUZ
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {cell.item.quantity} {cell.item.unit} ={" "}
                                  <strong>{formatMoney(cell.effectiveLineTotal, q.currency)}</strong>
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-3 px-4 border-l border-slate-100 font-bold text-slate-700">
                            {row.spreadPct > 0 ? `%${row.spreadPct}` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab 2: Supplier Summary Comparison */}
            {activeSubTab === "summary" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4">Tedarikçi Firma</th>
                      <th className="py-3 px-3">Format</th>
                      <th className="py-3 px-3 text-center">Kalem</th>
                      <th className="py-3 px-3 text-right">Ara Toplam</th>
                      <th className="py-3 px-3 text-right">KDV</th>
                      <th className="py-3 px-4 text-right">Genel Toplam</th>
                      <th className="py-3 px-4 text-right">En Düşüğe Fark</th>
                      <th className="py-3 px-4">Ödeme / Teslimat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...quotes]
                      .sort((a, b) => a.grandTotal - b.grandTotal)
                      .map((q) => {
                        const lowestTotal = summaryStats.lowestQuote?.grandTotal || 0;
                        const diff =
                          lowestTotal > 0 && q.grandTotal > lowestTotal
                            ? q.grandTotal - lowestTotal
                            : 0;
                        const diffPct =
                          lowestTotal > 0 && diff > 0
                            ? Math.round((diff / lowestTotal) * 1000) / 10
                            : 0;
                        const isWinner = summaryStats.lowestQuote?.id === q.id && quotes.length > 1;
                        return (
                          <tr
                            key={q.id}
                            className={isWinner ? "bg-emerald-50/60" : "hover:bg-slate-50"}
                          >
                            <td className="py-3 px-4 font-extrabold text-slate-900">
                              <div className="flex items-center gap-2">
                                <span>{q.supplierName}</span>
                                {isWinner && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                    EN UYGUN
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-normal text-slate-500">
                                {q.fileName}
                              </div>
                            </td>
                            <td className="py-3 px-3">{renderFileTypeBadge(q.fileType)}</td>
                            <td className="py-3 px-3 text-center font-bold">{q.items.length}</td>
                            <td className="py-3 px-3 text-right font-semibold">
                              {formatMoney(q.subtotal, q.currency)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-600">
                              {formatMoney(q.vatTotal, q.currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-sm text-slate-900">
                              {formatMoney(q.grandTotal, q.currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold">
                              {diff > 0 ? (
                                <span className="text-rose-600">
                                  +{formatMoney(diff, q.currency)} (+%{diffPct})
                                </span>
                              ) : (
                                <span className="text-emerald-600">En İyi Fiyat</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <div>{q.paymentTerms || "-"}</div>
                              <div className="text-[11px] text-slate-400">
                                {q.deliveryTerms || ""}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab 3: Optimal Split Recommendation */}
            {activeSubTab === "optimal" && (
              <div className="p-5 space-y-4">
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-emerald-800">
                      Karma Sipariş Stratejisi (Kalem Bazlı En İyi Tedarikçi)
                    </div>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Her kalemi en düşük birim fiyatı veren tedarikçiden aldığınızda toplam net maliyet:{" "}
                      <strong>
                        {formatMoney(
                          summaryStats.optimalNetTotal,
                          summaryStats.lowestQuote?.currency || "TRY"
                        )}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">Ürün / Malzeme</th>
                        <th className="py-2.5 px-3">Önerilen Tedarikçi</th>
                        <th className="py-2.5 px-3 text-right">Miktar</th>
                        <th className="py-2.5 px-3 text-right">En Düşük Birim Fiyat</th>
                        <th className="py-2.5 px-4 text-right">Net Tutar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matrixRows.map((row) => {
                        const bestCell = row.lowestQuoteId
                          ? row.cells[row.lowestQuoteId]
                          : undefined;
                        if (!bestCell) return null;
                        return (
                          <tr key={row.key} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-bold text-slate-900">
                              {row.displayName}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-emerald-700">
                              {bestCell.supplierName}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {bestCell.item.quantity} {bestCell.item.unit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                              {formatMoney(bestCell.effectiveUnitPrice)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-black text-slate-900">
                              {formatMoney(bestCell.effectiveLineTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </>
          )}
          </div>
        </div>
    </div>
  );
}

