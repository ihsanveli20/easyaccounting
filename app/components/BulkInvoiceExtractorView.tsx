"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  Upload,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Trash2,
  Plus,
  Search,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Table as TableIcon,
  X,
  Building2,
  Calendar,
  Hash,
  Package,
  RefreshCw,
} from "lucide-react";

export interface InvoiceLineItem {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  netAmount: number;
  totalAmount: number;
}

export interface InvoiceDocumentRecord {
  id: string;
  fileName: string;
  fileType: "xml" | "pdf" | "image";
  buyerName: string;
  buyerTaxId: string;
  sellerName: string;
  invoiceDate: string;
  invoiceNo: string;
  currency: string;
  items: InvoiceLineItem[];
  subtotalAmount: number;
  totalVatAmount: number;
  grandTotalAmount: number;
  imagePreviewUrl?: string;
  rawTextSnippet?: string;
  parseNote?: string;
}

const STORAGE_KEY = "easy_accounting_bulk_invoices_v1";

const DEMO_INVOICES: InvoiceDocumentRecord[] = [
  {
    id: "demo-xml-1",
    fileName: "GIB2026000001452_efatura.xml",
    fileType: "xml",
    buyerName: "ANADOLU GIDA VE MARKETÇİLİK TİC. A.Ş.",
    buyerTaxId: "1234567890",
    sellerName: "ÖZBEREKET ET VE SÜT ÜRÜNLERİ LTD. ŞTİ.",
    invoiceDate: "2026-11-05",
    invoiceNo: "GIB2026000001452",
    currency: "TRY",
    items: [
      {
        id: "demo-item-1",
        productName: "Dana Karkas Et (Yerli Besi)",
        quantity: 450,
        unit: "Kg",
        unitPrice: 410,
        vatRate: 1,
        vatAmount: 1845,
        netAmount: 184500,
        totalAmount: 186345,
      },
      {
        id: "demo-item-2",
        productName: "Kuzu Pirzola Vakumlu Paket",
        quantity: 80,
        unit: "Kg",
        unitPrice: 620,
        vatRate: 1,
        vatAmount: 496,
        netAmount: 49600,
        totalAmount: 50096,
      },
    ],
    subtotalAmount: 234100,
    totalVatAmount: 2341,
    grandTotalAmount: 236441,
    parseNote: "UBL-TR e-Fatura XML şablonundan otomatik aktarıldı.",
  },
  {
    id: "demo-pdf-2",
    fileName: "Marmara_Ambalaj_Fatura_Kasim.pdf",
    fileType: "pdf",
    buyerName: "BEREKET KURBAN ORGANİZASYON LTD. ŞTİ.",
    buyerTaxId: "9876543210",
    sellerName: "MARMARA ENDÜSTRİYEL AMBALAJ SAN. A.Ş.",
    invoiceDate: "2026-11-07",
    invoiceNo: "MAR2026000008914",
    currency: "TRY",
    items: [
      {
        id: "demo-item-3",
        productName: "Gıdaya Uygun Vakum Poşeti (30x40 cm)",
        quantity: 50,
        unit: "Paket",
        unitPrice: 380,
        vatRate: 20,
        vatAmount: 3800,
        netAmount: 19000,
        totalAmount: 22800,
      },
      {
        id: "demo-item-4",
        productName: "Hisse Dağıtım Karton Kolisi (Baskılı)",
        quantity: 1000,
        unit: "Adet",
        unitPrice: 24.5,
        vatRate: 20,
        vatAmount: 4900,
        netAmount: 24500,
        totalAmount: 29400,
      },
    ],
    subtotalAmount: 43500,
    totalVatAmount: 8700,
    grandTotalAmount: 52200,
    parseNote: "e-Arşiv PDF faturasından otomatik ayrıştırıldı.",
  },
  {
    id: "demo-img-3",
    fileName: "Soguk_Hava_Depo_Fis_Foto.jpg",
    fileType: "image",
    buyerName: "AHMET YILMAZ (ŞAHIS FİRMASI)",
    buyerTaxId: "24681357902",
    sellerName: "KUZEY SOĞUK HAVA DEPOLAMA HİZMETLERİ A.Ş.",
    invoiceDate: "2026-11-08",
    invoiceNo: "KZY2026000000319",
    currency: "TRY",
    items: [
      {
        id: "demo-item-5",
        productName: "Soğuk Hava Deposu Günlük Muhafaza ve Şoklama Hizmeti",
        quantity: 5,
        unit: "Gün",
        unitPrice: 6500,
        vatRate: 20,
        vatAmount: 6500,
        netAmount: 32500,
        totalAmount: 39000,
      },
    ],
    subtotalAmount: 32500,
    totalVatAmount: 6500,
    grandTotalAmount: 39000,
    parseNote: "Fotoğraf faturası örneği.",
  },
];

function recalcDocumentTotals(doc: InvoiceDocumentRecord): InvoiceDocumentRecord {
  const items = doc.items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const rate = Number(item.vatRate) || 0;
    const netAmount = Number((qty * price).toFixed(2));
    const vatAmount = Number(((netAmount * rate) / 100).toFixed(2));
    const totalAmount = Number((netAmount + vatAmount).toFixed(2));
    return {
      ...item,
      quantity: qty,
      unitPrice: price,
      vatRate: rate,
      netAmount,
      vatAmount,
      totalAmount,
    };
  });

  const subtotalAmount = Number(
    items.reduce((sum, i) => sum + i.netAmount, 0).toFixed(2)
  );
  const totalVatAmount = Number(
    items.reduce((sum, i) => sum + i.vatAmount, 0).toFixed(2)
  );
  const grandTotalAmount = Number(
    items.reduce((sum, i) => sum + i.totalAmount, 0).toFixed(2)
  );

  return {
    ...doc,
    items,
    subtotalAmount,
    totalVatAmount,
    grandTotalAmount,
  };
}

function formatCurrency(amount: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency === "TL" ? "TRY" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export default function BulkInvoiceExtractorView() {
  const [documents, setDocuments] = useState<InvoiceDocumentRecord[]>([]);
  const [viewMode, setViewMode] = useState<"flat-table" | "grouped-cards">("flat-table");
  const [searchTerm, setSearchTerm] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<"all" | "xml" | "pdf" | "image">("all");
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load saved invoices from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDocuments(parsed);
        }
      }
    } catch (e) {
      console.warn("Could not read saved invoices:", e);
    }
  }, []);

  // Persist to localStorage (excluding huge base64 image previews if they exceed quota)
  useEffect(() => {
    try {
      const serializable = documents.map((d) => ({
        ...d,
        imagePreviewUrl:
          d.imagePreviewUrl && d.imagePreviewUrl.length < 350000
            ? d.imagePreviewUrl
            : undefined,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.warn("Could not persist invoices to localStorage:", e);
    }
  }, [documents]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    setIsUploading(true);
    setStatusBanner({
      type: "info",
      message: `${filesArray.length} adet dosya (XML / PDF / Fotoğraf) işleniyor...`,
    });

    try {
      // Pre-generate local preview URLs for image files
      const imagePreviewsMap: Record<string, string> = {};
      for (const file of filesArray) {
        if (
          file.type.startsWith("image/") ||
          /\.(jpg|jpeg|png|webp)$/i.test(file.name)
        ) {
          imagePreviewsMap[file.name] = await readFileAsDataUrl(file);
        }
      }

      const formData = new FormData();
      filesArray.forEach((f) => formData.append("files", f));

      const response = await fetch("/api/parse-invoices", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Faturalar ayrıştırılamadı.");
      }

      const newDocs: InvoiceDocumentRecord[] = (data.documents || []).map(
        (doc: InvoiceDocumentRecord) => ({
          ...doc,
          imagePreviewUrl: imagePreviewsMap[doc.fileName] || doc.imagePreviewUrl,
        })
      );

      setDocuments((prev) => [...newDocs, ...prev]);

      const errCount = Array.isArray(data.errors) ? data.errors.length : 0;
      if (errCount > 0) {
        setStatusBanner({
          type: "error",
          message: `${newDocs.length} dosya başarıyla eklendi, ${errCount} dosyada uyarı oluştu: ${data.errors
            .map((e: { fileName: string; message: string }) => `${e.fileName} (${e.message})`)
            .join(", ")}`,
        });
      } else {
        const totalLines = newDocs.reduce((acc, d) => acc + d.items.length, 0);
        setStatusBanner({
          type: "success",
          message: `${newDocs.length} adet fatura belgesi ve toplam ${totalLines} kalem başarıyla tabloya aktarıldı.`,
        });
      }
    } catch (err: unknown) {
      setStatusBanner({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Dosyalar yüklenirken bir hata meydana geldi.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleLoadDemo = () => {
    setDocuments((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const toAdd = DEMO_INVOICES.filter((d) => !existingIds.has(d.id));
      return [...toAdd, ...prev];
    });
    setStatusBanner({
      type: "success",
      message: "Örnek XML, PDF ve Fotoğraf fatura verileri tabloya yüklendi.",
    });
  };

  const handleAddBlankInvoice = () => {
    const today = new Date().toISOString().slice(0, 10);
    const newDoc: InvoiceDocumentRecord = {
      id: `manual-${Date.now()}`,
      fileName: "Manuel_Fatura_Girisi.xml",
      fileType: "xml",
      buyerName: "YENİ ALICI FİRMA / KİŞİ",
      buyerTaxId: "",
      sellerName: "",
      invoiceDate: today,
      invoiceNo: `FAT2026${Math.floor(100000 + Math.random() * 900000)}`,
      currency: "TRY",
      items: [
        {
          id: `item-${Date.now()}`,
          productName: "Yeni Ürün / Hizmet Kalemi",
          quantity: 1,
          unit: "Adet",
          unitPrice: 1000,
          vatRate: 20,
          vatAmount: 200,
          netAmount: 1000,
          totalAmount: 1200,
        },
      ],
      subtotalAmount: 1000,
      totalVatAmount: 200,
      grandTotalAmount: 1200,
      parseNote: "Manuel oluşturuldu.",
    };
    setDocuments((prev) => [newDoc, ...prev]);
  };

  const updateDocumentHeader = (
    docId: string,
    field: keyof Pick<
      InvoiceDocumentRecord,
      "buyerName" | "buyerTaxId" | "sellerName" | "invoiceDate" | "invoiceNo"
    >,
    value: string
  ) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, [field]: value } : doc))
    );
  };

  const updateLineItem = (
    docId: string,
    itemId: string,
    field: keyof InvoiceLineItem,
    value: string | number
  ) => {
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id !== docId) return doc;
        const updatedItems = doc.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            [field]:
              field === "productName" || field === "unit"
                ? String(value)
                : Number(value) || 0,
          };
        });
        return recalcDocumentTotals({ ...doc, items: updatedItems });
      })
    );
  };

  const addLineItemToDoc = (docId: string) => {
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id !== docId) return doc;
        const newItem: InvoiceLineItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productName: "Yeni Kalem",
          quantity: 1,
          unit: "Adet",
          unitPrice: 0,
          vatRate: 20,
          vatAmount: 0,
          netAmount: 0,
          totalAmount: 0,
        };
        return recalcDocumentTotals({ ...doc, items: [...doc.items, newItem] });
      })
    );
  };

  const deleteLineItem = (docId: string, itemId: string) => {
    setDocuments((prev) =>
      prev
        .map((doc) => {
          if (doc.id !== docId) return doc;
          const remaining = doc.items.filter((i) => i.id !== itemId);
          if (remaining.length === 0) return null;
          return recalcDocumentTotals({ ...doc, items: remaining });
        })
        .filter((d): d is InvoiceDocumentRecord => d !== null)
    );
  };

  const deleteDocument = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (previewDocId === docId) setPreviewDocId(null);
  };

  const clearAllDocuments = () => {
    setDocuments([]);
    localStorage.removeItem(STORAGE_KEY);
    setStatusBanner({
      type: "info",
      message: "Listedeki tüm faturalar temizlendi.",
    });
  };

  const filteredDocuments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return documents.filter((doc) => {
      if (fileTypeFilter !== "all" && doc.fileType !== fileTypeFilter) {
        return false;
      }
      if (!q) return true;
      const headerMatch =
        doc.buyerName.toLowerCase().includes(q) ||
        doc.invoiceNo.toLowerCase().includes(q) ||
        doc.invoiceDate.toLowerCase().includes(q) ||
        doc.sellerName.toLowerCase().includes(q) ||
        doc.fileName.toLowerCase().includes(q);
      const itemMatch = doc.items.some((i) =>
        i.productName.toLowerCase().includes(q)
      );
      return headerMatch || itemMatch;
    });
  }, [documents, searchTerm, fileTypeFilter]);

  const flatRows = useMemo(() => {
    const rows: {
      doc: InvoiceDocumentRecord;
      item: InvoiceLineItem;
      itemIndex: number;
    }[] = [];
    filteredDocuments.forEach((doc) => {
      doc.items.forEach((item, idx) => {
        const q = searchTerm.trim().toLowerCase();
        if (
          !q ||
          doc.buyerName.toLowerCase().includes(q) ||
          doc.invoiceNo.toLowerCase().includes(q) ||
          doc.invoiceDate.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q)
        ) {
          rows.push({ doc, item, itemIndex: idx });
        }
      });
    });
    return rows;
  }, [filteredDocuments, searchTerm]);

  const summaryStats = useMemo(() => {
    const docCount = filteredDocuments.length;
    const itemCount = flatRows.length;
    const totalNet = flatRows.reduce((s, r) => s + r.item.netAmount, 0);
    const totalVat = flatRows.reduce((s, r) => s + r.item.vatAmount, 0);
    const totalGrand = flatRows.reduce((s, r) => s + r.item.totalAmount, 0);
    return { docCount, itemCount, totalNet, totalVat, totalGrand };
  }, [filteredDocuments, flatRows]);

  const handleExportToExcel = () => {
    if (flatRows.length === 0) return;

    // 1. Detailed Line Items Sheet
    const detailRows = flatRows.map(({ doc, item }, index) => ({
      "Sıra No": index + 1,
      "Kaynak Türü":
        doc.fileType === "xml"
          ? "XML"
          : doc.fileType === "pdf"
          ? "PDF"
          : "Fotoğraf",
      "Dosya Adı": doc.fileName,
      "Alıcı Firma / Kişi": doc.buyerName,
      "Alıcı VKN / TCKN": doc.buyerTaxId || "-",
      "Satıcı Firma": doc.sellerName || "-",
      "Fatura Tarihi": doc.invoiceDate,
      "Fatura No": doc.invoiceNo,
      "Ürün / Hizmet Adı": item.productName,
      Miktar: item.quantity,
      Birim: item.unit,
      "Birim Fiyat": item.unitPrice,
      "KDV Oranı (%)": item.vatRate,
      "KDV Tutarı": item.vatAmount,
      "KDV Hariç Tutar": item.netAmount,
      "Toplam Tutar (KDV Dahil)": item.totalAmount,
      "Para Birimi": doc.currency || "TRY",
    }));

    // Append a summary row at the bottom of the detailed sheet
    detailRows.push({
      "Sıra No": detailRows.length + 1,
      "Kaynak Türü": "TOPLAM",
      "Dosya Adı": "",
      "Alıcı Firma / Kişi": `TOPLAM (${summaryStats.docCount} Fatura / ${summaryStats.itemCount} Kalem)`,
      "Alıcı VKN / TCKN": "",
      "Satıcı Firma": "",
      "Fatura Tarihi": "",
      "Fatura No": "",
      "Ürün / Hizmet Adı": "GENEL TOPLAM",
      Miktar: flatRows.reduce((s, r) => s + r.item.quantity, 0),
      Birim: "",
      "Birim Fiyat": 0,
      "KDV Oranı (%)": 0,
      "KDV Tutarı": Number(summaryStats.totalVat.toFixed(2)),
      "KDV Hariç Tutar": Number(summaryStats.totalNet.toFixed(2)),
      "Toplam Tutar (KDV Dahil)": Number(summaryStats.totalGrand.toFixed(2)),
      "Para Birimi": "TRY",
    });

    // 2. Invoice Summary Sheet
    const invoiceSummaryRows = filteredDocuments.map((doc, idx) => ({
      "Sıra No": idx + 1,
      "Kaynak Türü":
        doc.fileType === "xml"
          ? "XML"
          : doc.fileType === "pdf"
          ? "PDF"
          : "Fotoğraf",
      "Dosya Adı": doc.fileName,
      "Alıcı Firma / Kişi": doc.buyerName,
      "Alıcı VKN / TCKN": doc.buyerTaxId || "-",
      "Satıcı Firma": doc.sellerName || "-",
      "Fatura Tarihi": doc.invoiceDate,
      "Fatura No": doc.invoiceNo,
      "Kalem Sayısı": doc.items.length,
      "Ara Toplam (KDV Hariç)": doc.subtotalAmount,
      "Toplam KDV": doc.totalVatAmount,
      "Genel Toplam (KDV Dahil)": doc.grandTotalAmount,
      "Para Birimi": doc.currency || "TRY",
    }));

    const workbook = XLSX.utils.book_new();
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    detailSheet["!cols"] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 28 },
      { wch: 34 },
      { wch: 15 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 36 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 20 },
      { wch: 10 },
    ];

    const summarySheet = XLSX.utils.json_to_sheet(invoiceSummaryRows);
    summarySheet["!cols"] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 28 },
      { wch: 34 },
      { wch: 15 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 20 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(workbook, detailSheet, "Fatura Kalemleri");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Fatura Özeti");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Toplu_Fatura_Listesi_${dateStr}.xlsx`);
  };

  const previewDoc = useMemo(
    () => documents.find((d) => d.id === previewDocId) || null,
    [documents, previewDocId]
  );

  const renderFileTypeBadge = (type: "xml" | "pdf" | "image") => {
    if (type === "xml") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <FileCode2 className="w-3 h-3" />
          XML
        </span>
      );
    }
    if (type === "pdf") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <FileText className="w-3 h-3" />
          PDF
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <ImageIcon className="w-3 h-3" />
        FOTO
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Upload & Action Hero Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 text-white shadow-sm">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Toplu Fatura Aktarım & Excel Merkezi (XML / PDF / Fotoğraf)
                </h2>
                <p className="text-xs text-slate-500">
                  e-Fatura / e-Arşiv XML, PDF ve Fotoğraf faturalarınızı toplu yükleyin;{" "}
                  <strong className="text-slate-700">
                    Alıcı Firma/Kişi, Fatura Tarihi & No, Ürün Adı, Miktar, Birim Fiyat, KDV ve Toplam Tutar
                  </strong>{" "}
                  bilgilerini görüntüleyip tek tıkla Excel&apos;e indirin.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Örnek Faturalar Yükle
            </button>
            <button
              type="button"
              onClick={handleAddBlankInvoice}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Manuel Fatura Ekle
            </button>
            <button
              type="button"
              onClick={handleExportToExcel}
              disabled={flatRows.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Excel&apos;e Aktar / İndir (.xlsx)
            </button>
          </div>
        </div>

        {/* Drag and Drop Bulk Upload Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFilesUpload(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
            dragActive
              ? "border-indigo-500 bg-indigo-50/70"
              : "border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/20"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,text/xml,application/xml,application/pdf,image/*"
            onChange={(e) => {
              if (e.target.files) handleFilesUpload(e.target.files);
            }}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-2">
              <span className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <FileCode2 className="w-5 h-5" />
              </span>
              <span className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
                <FileText className="w-5 h-5" />
              </span>
              <span className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                <ImageIcon className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-1">
              <p className="text-sm font-bold text-slate-800">
                {isUploading
                  ? "Faturalar okunuyor ve kalemler ayrıştırılıyor..."
                  : "XML, PDF ve Fotoğraf Faturalarınızı Buraya Sürükleyin veya Tıklayıp Toplu Seçin"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Birden fazla <strong>.xml</strong> (UBL e-Fatura/e-Arşiv),{" "}
                <strong>.pdf</strong> ve <strong>.jpg / .png</strong> dosyasını aynı anda seçebilirsiniz.
              </p>
            </div>
            <span className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold shadow-xs">
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Dosyaları Seç (Toplu Yükle)
                </>
              )}
            </span>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusBanner && (
          <div
            className={`mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-xs font-medium border ${
              statusBanner.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : statusBanner.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-indigo-50 border-indigo-200 text-indigo-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="p-1 hover:bg-black/5 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Toplam Fatura
          </span>
          <p className="text-xl font-black text-slate-900 mt-1">
            {summaryStats.docCount}{" "}
            <span className="text-xs font-medium text-slate-500">Belge</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Toplam Kalem
          </span>
          <p className="text-xl font-black text-indigo-600 mt-1">
            {summaryStats.itemCount}{" "}
            <span className="text-xs font-medium text-slate-500">Satır</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            KDV Hariç Ara Toplam
          </span>
          <p className="text-lg font-bold text-slate-800 mt-1">
            {formatCurrency(summaryStats.totalNet)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Toplam KDV Tutarı
          </span>
          <p className="text-lg font-bold text-amber-600 mt-1">
            {formatCurrency(summaryStats.totalVat)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-emerald-50/70 rounded-xl border border-emerald-200 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Genel Toplam Tutar
          </span>
          <p className="text-lg font-black text-emerald-800 mt-1">
            {formatCurrency(summaryStats.totalGrand)}
          </p>
        </div>
      </div>

      {/* Filter, Search & View Mode Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Alıcı firma/kişi, fatura no, tarih veya ürün adı ara..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 bg-slate-50/60"
            />
          </div>

          <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 text-xs">
            {(
              [
                { id: "all", label: "Tümü" },
                { id: "xml", label: "XML" },
                { id: "pdf", label: "PDF" },
                { id: "image", label: "Fotoğraf" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFileTypeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  fileTypeFilter === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("flat-table")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                viewMode === "flat-table"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Excel Tablo Görünümü
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grouped-cards")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                viewMode === "grouped-cards"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Fatura Kartları ({filteredDocuments.length})
            </button>
          </div>

          {documents.length > 0 && (
            <button
              type="button"
              onClick={clearAllDocuments}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
              title="Tüm Listeyi Temizle"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {flatRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Henüz Yüklü Fatura Bulunmuyor
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Yukarıdaki alana <strong>XML, PDF veya Fotoğraf</strong> faturalarınızı toplu olarak sürükleyip bırakabilir veya hemen test etmek için örnek verileri yükleyebilirsiniz.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Örnek Faturaları Yükle
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Bilgisayardan Dosya Seç
            </button>
          </div>
        </div>
      ) : viewMode === "flat-table" ? (
        /* VIEW 1: Flat Excel-like Table (Editable inline) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Excel Önizleme & Canlı Düzenleme Tablosu
              </h3>
              <p className="text-[11px] text-slate-500">
                Hücrelerin üzerine tıklayarak Alıcı Firma, Tarih, Fatura No, Ürün Adı, Miktar, Birim Fiyat ve KDV bilgilerini doğrudan düzenleyebilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportToExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Bu Tabloyu Excel İndir (.xlsx)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-2.5 w-20">Tür</th>
                  <th className="py-3 px-3 min-w-[210px]">Alıcı Firma / Kişi</th>
                  <th className="py-3 px-3 min-w-[155px]">Fatura Tarihi & No</th>
                  <th className="py-3 px-3 min-w-[220px]">Kalem / Ürün Adı</th>
                  <th className="py-3 px-2.5 w-24 text-right">Miktar</th>
                  <th className="py-3 px-2 w-20">Birim</th>
                  <th className="py-3 px-3 w-32 text-right">Birim Fiyat</th>
                  <th className="py-3 px-2.5 w-20 text-right">KDV %</th>
                  <th className="py-3 px-3 w-28 text-right">KDV Tutarı</th>
                  <th className="py-3 px-3 w-36 text-right">Toplam Tutar</th>
                  <th className="py-3 px-3 w-24 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-xs">
                {flatRows.map(({ doc, item }, idx) => (
                  <tr
                    key={`${doc.id}-${item.id}`}
                    className="hover:bg-indigo-50/30 transition-colors group"
                  >
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-2.5">
                      <div className="flex flex-col items-start gap-1">
                        {renderFileTypeBadge(doc.fileType)}
                        <span
                          className="text-[10px] text-slate-400 truncate max-w-[85px]"
                          title={doc.fileName}
                        >
                          {doc.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={doc.buyerName}
                        onChange={(e) =>
                          updateDocumentHeader(doc.id, "buyerName", e.target.value)
                        }
                        className="w-full font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg px-2 py-1 focus:outline-none"
                        placeholder="Alıcı Firma / Kişi"
                      />
                      {doc.sellerName && (
                        <div className="px-2 text-[10px] text-slate-400 truncate">
                          Satıcı: {doc.sellerName}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          value={doc.invoiceNo}
                          onChange={(e) =>
                            updateDocumentHeader(doc.id, "invoiceNo", e.target.value)
                          }
                          className="w-full font-mono text-[11px] font-bold text-indigo-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1.5 py-0.5 focus:outline-none"
                          placeholder="Fatura No"
                        />
                        <input
                          type="date"
                          value={doc.invoiceDate}
                          onChange={(e) =>
                            updateDocumentHeader(doc.id, "invoiceDate", e.target.value)
                          }
                          className="w-full text-[11px] text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1.5 py-0.5 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) =>
                          updateLineItem(
                            doc.id,
                            item.id,
                            "productName",
                            e.target.value
                          )
                        }
                        className="w-full font-medium text-slate-900 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg px-2 py-1 focus:outline-none"
                        placeholder="Ürün / Hizmet Adı"
                      />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <input
                        type="number"
                        step="any"
                        value={item.quantity}
                        onChange={(e) =>
                          updateLineItem(doc.id, item.id, "quantity", e.target.value)
                        }
                        className="w-20 text-right font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg px-2 py-1 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) =>
                          updateLineItem(doc.id, item.id, "unit", e.target.value)
                        }
                        className="w-16 text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg px-1.5 py-1 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateLineItem(doc.id, item.id, "unitPrice", e.target.value)
                        }
                        className="w-28 text-right font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg px-2 py-1 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="inline-flex items-center">
                        <span className="text-slate-400 mr-0.5">%</span>
                        <input
                          type="number"
                          step="any"
                          value={item.vatRate}
                          onChange={(e) =>
                            updateLineItem(doc.id, item.id, "vatRate", e.target.value)
                          }
                          className="w-12 text-right font-semibold text-amber-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg px-1 py-1 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-amber-700">
                      {formatCurrency(item.vatAmount, doc.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="font-bold text-emerald-700">
                        {formatCurrency(item.totalAmount, doc.currency)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Matrah: {formatCurrency(item.netAmount, doc.currency)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewDocId(doc.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Fatura Detayı / Görsel Önizleme"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => addLineItemToDoc(doc.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="Bu Faturaya Yeni Kalem Ekle"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLineItem(doc.id, item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Bu Kalemi Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-xs">
                  <td colSpan={9} className="py-3 px-4 text-right uppercase tracking-wider">
                    Tablo Genel Toplamı ({summaryStats.docCount} Fatura / {summaryStats.itemCount} Kalem):
                  </td>
                  <td className="py-3 px-3 text-right text-amber-300">
                    {formatCurrency(summaryStats.totalVat)}
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-300 text-sm">
                    {formatCurrency(summaryStats.totalGrand)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW 2: Grouped Cards by Invoice Document */
        <div className="space-y-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                  <div>
                    <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 mb-1">
                      <Building2 className="w-3 h-3" />
                      Alıcı Firma / Kişi
                    </label>
                    <input
                      type="text"
                      value={doc.buyerName}
                      onChange={(e) =>
                        updateDocumentHeader(doc.id, "buyerName", e.target.value)
                      }
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 mb-1">
                      <Hash className="w-3 h-3" />
                      Fatura No
                    </label>
                    <input
                      type="text"
                      value={doc.invoiceNo}
                      onChange={(e) =>
                        updateDocumentHeader(doc.id, "invoiceNo", e.target.value)
                      }
                      className="w-full text-xs font-mono font-bold text-indigo-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 mb-1">
                      <Calendar className="w-3 h-3" />
                      Fatura Tarihi
                    </label>
                    <input
                      type="date"
                      value={doc.invoiceDate}
                      onChange={(e) =>
                        updateDocumentHeader(doc.id, "invoiceDate", e.target.value)
                      }
                      className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {renderFileTypeBadge(doc.fileType)}
                  <button
                    type="button"
                    onClick={() => setPreviewDocId(doc.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Belge / Foto İncele
                  </button>
                  <button
                    type="button"
                    onClick={() => addLineItemToDoc(doc.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Kalem Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDocument(doc.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card Line Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 bg-slate-50/40">
                      <th className="py-2 px-4">Ürün / Hizmet Adı</th>
                      <th className="py-2 px-3 text-right w-24">Miktar</th>
                      <th className="py-2 px-3 w-24">Birim</th>
                      <th className="py-2 px-3 text-right w-32">Birim Fiyat</th>
                      <th className="py-2 px-3 text-right w-24">KDV (%)</th>
                      <th className="py-2 px-3 text-right w-32">KDV Tutarı</th>
                      <th className="py-2 px-4 text-right w-36">Toplam Tutar</th>
                      <th className="py-2 px-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doc.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            value={item.productName}
                            onChange={(e) =>
                              updateLineItem(
                                doc.id,
                                item.id,
                                "productName",
                                e.target.value
                              )
                            }
                            className="w-full font-medium text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-2 py-1 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(doc.id, item.id, "quantity", e.target.value)
                            }
                            className="w-20 text-right font-semibold bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-2 py-1 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) =>
                              updateLineItem(doc.id, item.id, "unit", e.target.value)
                            }
                            className="w-20 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-2 py-1 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateLineItem(doc.id, item.id, "unitPrice", e.target.value)
                            }
                            className="w-28 text-right font-semibold bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-2 py-1 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={item.vatRate}
                            onChange={(e) =>
                              updateLineItem(doc.id, item.id, "vatRate", e.target.value)
                            }
                            className="w-16 text-right font-semibold text-amber-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-2 py-1 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {formatCurrency(item.vatAmount, doc.currency)}
                        </td>
                        <td className="py-2 px-4 text-right font-bold text-emerald-700">
                          {formatCurrency(item.totalAmount, doc.currency)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => deleteLineItem(doc.id, item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Card Footer Totals */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs">
                <span className="text-slate-500">
                  Dosya: <strong className="text-slate-700">{doc.fileName}</strong>
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-slate-600">
                    Ara Toplam: <strong>{formatCurrency(doc.subtotalAmount, doc.currency)}</strong>
                  </span>
                  <span className="text-amber-700">
                    KDV: <strong>{formatCurrency(doc.totalVatAmount, doc.currency)}</strong>
                  </span>
                  <span className="text-emerald-700 font-bold">
                    Genel Toplam: {formatCurrency(doc.grandTotalAmount, doc.currency)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Photo / Document Side-by-Side Inspector & Quick Editor */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                {renderFileTypeBadge(previewDoc.fileType)}
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {previewDoc.fileName}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {previewDoc.parseNote || "Belge önizleme ve hızlı veri düzenleme ekranı"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDocId(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left Column: Image Preview or Extracted Text Snippet */}
              <div className="bg-slate-100 rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-center min-h-[320px]">
                {previewDoc.imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewDoc.imagePreviewUrl}
                    alt={previewDoc.fileName}
                    className="max-h-[480px] w-auto object-contain rounded-lg shadow-sm"
                  />
                ) : previewDoc.rawTextSnippet ? (
                  <div className="w-full h-full">
                    <span className="text-[11px] font-bold uppercase text-slate-500 block mb-2">
                      PDF Ham Metin Önizlemesi
                    </span>
                    <pre className="text-[11px] text-slate-700 bg-white p-3 rounded-lg border border-slate-200 whitespace-pre-wrap max-h-[420px] overflow-y-auto font-mono">
                      {previewDoc.rawTextSnippet}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center text-slate-500 p-6">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                    <p className="text-xs font-semibold">
                      {previewDoc.fileType === "xml"
                        ? "UBL-TR XML Fatura Verisi Doğrudan Ayrıştırıldı"
                        : "Görsel / Metin Önizlemesi"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Sağ taraftaki alanlardan fatura başlık ve kalem bilgilerini düzenleyebilirsiniz.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Editable Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Alıcı Firma / Kişi Unvanı
                    </label>
                    <input
                      type="text"
                      value={previewDoc.buyerName}
                      onChange={(e) =>
                        updateDocumentHeader(
                          previewDoc.id,
                          "buyerName",
                          e.target.value
                        )
                      }
                      className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Fatura No
                    </label>
                    <input
                      type="text"
                      value={previewDoc.invoiceNo}
                      onChange={(e) =>
                        updateDocumentHeader(
                          previewDoc.id,
                          "invoiceNo",
                          e.target.value
                        )
                      }
                      className="w-full text-xs font-mono font-bold border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Fatura Tarihi
                    </label>
                    <input
                      type="date"
                      value={previewDoc.invoiceDate}
                      onChange={(e) =>
                        updateDocumentHeader(
                          previewDoc.id,
                          "invoiceDate",
                          e.target.value
                        )
                      }
                      className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      Fatura Kalemleri ({previewDoc.items.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => addLineItemToDoc(previewDoc.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Kalem Ekle
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {previewDoc.items.map((item, i) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-400">
                            Kalem #{i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteLineItem(previewDoc.id, item.id)}
                            className="text-rose-500 hover:text-rose-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Sil
                          </button>
                        </div>
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(e) =>
                            updateLineItem(
                              previewDoc.id,
                              item.id,
                              "productName",
                              e.target.value
                            )
                          }
                          placeholder="Ürün / Hizmet Adı"
                          className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                        />
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500">
                              Miktar
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(
                                  previewDoc.id,
                                  item.id,
                                  "quantity",
                                  e.target.value
                                )
                              }
                              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500">
                              Birim
                            </label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) =>
                                updateLineItem(
                                  previewDoc.id,
                                  item.id,
                                  "unit",
                                  e.target.value
                                )
                              }
                              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500">
                              Birim Fiyat
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateLineItem(
                                  previewDoc.id,
                                  item.id,
                                  "unitPrice",
                                  e.target.value
                                )
                              }
                              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500">
                              KDV (%)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={item.vatRate}
                              onChange={(e) =>
                                updateLineItem(
                                  previewDoc.id,
                                  item.id,
                                  "vatRate",
                                  e.target.value
                                )
                              }
                              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/80">
                          <span className="text-slate-500">
                            KDV: <strong>{formatCurrency(item.vatAmount)}</strong>
                          </span>
                          <span className="text-emerald-700 font-bold">
                            Toplam: {formatCurrency(item.totalAmount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800">
                Fatura Genel Toplamı:{" "}
                <span className="text-emerald-700">
                  {formatCurrency(previewDoc.grandTotalAmount, previewDoc.currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDocId(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
              >
                Tamam / Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

