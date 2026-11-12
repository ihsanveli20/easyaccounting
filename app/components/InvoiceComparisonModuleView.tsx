"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  GitCompareArrows,
  UploadCloud,
  FileCode2,
  FileText,
  FileJson,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Search,
  Download,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  X,
  ShieldCheck,
  BookOpen,
  Link2,
  RotateCcw,
  Loader2,
  Layers,
  Info,
  ArrowRightLeft,
  FolderOpen,
  ChevronLeft,
} from "lucide-react";
import {
  CentralProductCard,
  ComparisonFileFormat,
  ComparisonReportPayload,
  InvoiceDirection,
  LearnedMappingRule,
  ProductComparisonRow,
  StandardInvoiceDocument,
  StandardInvoiceLine,
} from "../types/invoiceComparison";
import {
  buildLearnedRuleSignature,
  ManualOverrideMap,
  normalizeTurkishAscii,
  runInvoiceProductComparison,
} from "../utils/productMatchingEngine";
import {
  detectFileFormat,
  MAX_INVOICE_FILE_BYTES,
  parseInvoiceJsonSecure,
  parseInvoiceXmlSecure,
} from "../utils/invoiceFileParser";
import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
} from "../workers/invoiceComparison.worker";
import {
  exportComparisonDomToPdf,
  exportComparisonToExcel,
  exportComparisonToJson,
} from "../utils/invoiceComparisonExport";
import { useAuth } from "../context/AuthContext";

const COMPARISON_PAGE_SIZE = 50;
const REVIEW_PAGE_SIZE = 50;
const PREVIEW_INVOICE_CAP = 100;
const SESSION_STORAGE_MAX_INVOICES = 200;
const WORKER_LINE_THRESHOLD = 400;

async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;
  if (!items || items.length === 0) {
    return Array.from(dataTransfer.files || []);
  }

  const collected: File[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readEntry = async (entry: any): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (f: File) => {
            collected.push(f);
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise<void>((resolve) => {
        const readBatch = () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reader.readEntries(async (entries: any[]) => {
            if (!entries || entries.length === 0) {
              resolve();
              return;
            }
            for (const sub of entries) {
              await readEntry(sub);
            }
            readBatch();
          }, () => resolve());
        };
        readBatch();
      });
    }
  };

  let usedEntries = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) {
      usedEntries = true;
      await readEntry(entry);
    }
  }

  if (usedEntries && collected.length > 0) {
    return collected;
  }
  return Array.from(dataTransfer.files || []);
}

function formatTL(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "-";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatQty(val: number | null | undefined, unit = ""): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "-";
  const numStr = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(val);
  return unit ? `${numStr} ${unit}` : numStr;
}

function makeSessionStorageKey(userId: string | undefined): string {
  return `easy_invoice_cmp_transient_${userId || "anon"}_v1`;
}

function makeLearnedRulesStorageKey(userId: string | undefined): string {
  return `easy_invoice_cmp_learned_rules_${userId || "anon"}_v1`;
}

function buildScenarioDemoInvoices(): {
  incoming: StandardInvoiceDocument[];
  outgoing: StandardInvoiceDocument[];
} {
  const in1Id = "demo-in-1";
  const in2Id = "demo-in-2";
  const out1Id = "demo-out-1";
  const out2Id = "demo-out-2";

  const incoming: StandardInvoiceDocument[] = [
    {
      id: in1Id,
      direction: "incoming",
      fileName: "Marmara_Sut_Gida_Alis_Faturasi.xml",
      fileFormat: "xml",
      fileSizeBytes: 8420,
      invoiceNo: "MRM2026000001014",
      invoiceDate: "2026-10-12",
      sellerName: "MARMARA SÜT VE PEYNİRCİLİK A.Ş.",
      buyerName: "ŞİRKETİMİZ GIDA TİC. A.Ş.",
      currency: "₺",
      subtotalAmount: 105000,
      totalVatAmount: 1050,
      grandTotalAmount: 106050,
      parseWarnings: [],
      items: [
        {
          id: "demo-in-l1",
          invoiceId: in1Id,
          direction: "incoming",
          lineNo: 1,
          originalProductName: "",
          originalDescription: "5 KG Tam Yağlı Beyaz Peynir",
          quantity: 100,
          unit: "Teneke",
          unitPrice: 750,
          vatRate: 1,
          vatAmount: 750,
          lineTotal: 75000,
          lineGrandTotal: 75750,
        },
        {
          id: "demo-in-l2",
          invoiceId: in1Id,
          direction: "incoming",
          lineNo: 2,
          originalProductName: "Fıçı Peynir",
          originalDescription: "Salamura inek sütü peyniri",
          quantity: 80,
          unit: "Kg",
          unitPrice: 185,
          vatRate: 1,
          vatAmount: 148,
          lineTotal: 14800,
          lineGrandTotal: 14948,
        },
        {
          id: "demo-in-l3",
          invoiceId: in1Id,
          direction: "incoming",
          lineNo: 3,
          originalProductName: "T. Yağlı Beyaz Peynir",
          originalDescription: "Trakya klasik olgunlaştırılmış beyaz peynir",
          quantity: 10,
          unit: "Adet",
          unitPrice: 95,
          vatRate: 1,
          vatAmount: 9.5,
          lineTotal: 950,
          lineGrandTotal: 959.5,
        },
      ],
    },
    {
      id: in2Id,
      direction: "incoming",
      fileName: "Anadolu_Bakliyat_Zeytinyagi_Alis.json",
      fileFormat: "json",
      fileSizeBytes: 3180,
      invoiceNo: "ANB2026000004421",
      invoiceDate: "2026-10-15",
      sellerName: "ANADOLU TARIM VE BAKLİYAT LTD. ŞTİ.",
      buyerName: "ŞİRKETİMİZ GIDA TİC. A.Ş.",
      currency: "₺",
      subtotalAmount: 55000,
      totalVatAmount: 550,
      grandTotalAmount: 55550,
      parseWarnings: [],
      items: [
        {
          id: "demo-in-l4",
          invoiceId: in2Id,
          direction: "incoming",
          lineNo: 1,
          originalProductName: "İspir Fasulyesi",
          originalDescription: "2026 mahsulü özel İspir şeker fasulye",
          quantity: 200,
          unit: "Kg",
          unitPrice: 150,
          vatRate: 1,
          vatAmount: 300,
          lineTotal: 30000,
          lineGrandTotal: 30300,
        },
        {
          id: "demo-in-l5",
          invoiceId: in2Id,
          direction: "incoming",
          lineNo: 2,
          originalProductName: "Natürel Sızma Zeytinyağı",
          originalDescription: "Soğuk sıkım 5 LT teneke",
          quantity: 100,
          unit: "Lt",
          unitPrice: 250,
          vatRate: 1,
          vatAmount: 250,
          lineTotal: 25000,
          lineGrandTotal: 25250,
        },
      ],
    },
  ];

  const outgoing: StandardInvoiceDocument[] = [
    {
      id: out1Id,
      direction: "outgoing",
      fileName: "Giden_Satis_Faturasi_Kasim_01.xml",
      fileFormat: "xml",
      fileSizeBytes: 7910,
      invoiceNo: "SAT2026000008812",
      invoiceDate: "2026-10-20",
      sellerName: "ŞİRKETİMİZ GIDA TİC. A.Ş.",
      buyerName: "HEDEF MARKET ZİNCİRİ A.Ş.",
      currency: "₺",
      subtotalAmount: 109500,
      totalVatAmount: 1095,
      grandTotalAmount: 110595,
      parseWarnings: [],
      items: [
        {
          id: "demo-out-l1",
          invoiceId: out1Id,
          direction: "outgoing",
          lineNo: 1,
          originalProductName: "Beyaz Peynir",
          originalDescription: "Tam Yağlı Beyaz Peynir dökme satış",
          quantity: 350000,
          unit: "Gr",
          unitPrice: 0.18,
          vatRate: 1,
          vatAmount: 630,
          lineTotal: 63000,
          lineGrandTotal: 63630,
        },
        {
          id: "demo-out-l2",
          invoiceId: out1Id,
          direction: "outgoing",
          lineNo: 2,
          originalProductName: "10 Adet x 500 Gram Tam Yağlı Peynir",
          originalDescription: "Vakumlu paket beyaz peynir kolisi",
          quantity: 1,
          unit: "Koli",
          unitPrice: 1200,
          vatRate: 1,
          vatAmount: 12,
          lineTotal: 1200,
          lineGrandTotal: 1212,
        },
        {
          id: "demo-out-l3",
          invoiceId: out1Id,
          direction: "outgoing",
          lineNo: 3,
          originalProductName: "5 KG Peynir",
          originalDescription: "Ambalajlı 5 KG peynir",
          quantity: 10,
          unit: "Teneke",
          unitPrice: 920,
          vatRate: 1,
          vatAmount: 92,
          lineTotal: 9200,
          lineGrandTotal: 9292,
        },
      ],
    },
    {
      id: out2Id,
      direction: "outgoing",
      fileName: "Giden_Satis_Bakliyat_Zeytinyagi.pdf",
      fileFormat: "pdf",
      fileSizeBytes: 5120,
      invoiceNo: "SAT2026000008845",
      invoiceDate: "2026-10-25",
      sellerName: "ŞİRKETİMİZ GIDA TİC. A.Ş.",
      buyerName: "BOĞAZİÇİ RESTORAN İŞLETMECİLİĞİ LTD. ŞTİ.",
      currency: "₺",
      subtotalAmount: 46500,
      totalVatAmount: 465,
      grandTotalAmount: 46965,
      parseWarnings: [],
      items: [
        {
          id: "demo-out-l4",
          invoiceId: out2Id,
          direction: "outgoing",
          lineNo: 1,
          originalProductName: "Fasulye",
          originalDescription: "1. sınıf kuru fasulye",
          quantity: 120,
          unit: "Kg",
          unitPrice: 200,
          vatRate: 1,
          vatAmount: 240,
          lineTotal: 24000,
          lineGrandTotal: 24240,
        },
        {
          id: "demo-out-l5",
          invoiceId: out2Id,
          direction: "outgoing",
          lineNo: 2,
          originalProductName: "Sızma Z.Yağı",
          originalDescription: "Natürel sızma zeytinyağı",
          quantity: 75,
          unit: "Lt",
          unitPrice: 300,
          vatRate: 1,
          vatAmount: 225,
          lineTotal: 22500,
          lineGrandTotal: 22725,
        },
      ],
    },
  ];

  return { incoming, outgoing };
}

// Geçici olarak Fatura Karşılaştırma ve Analiz modülünü sunucu hatası ekranıyla devre dışı bırakmak için true yapın.
const INVOICE_COMPARISON_SERVER_ERROR_MODE = true;

function InvoiceComparisonServerErrorScreen() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 shadow-lg p-6 sm:p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200/80 dark:border-red-900/60 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/40 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300 mb-3">
          <span>HTTP 503</span>
          <span className="text-red-300 dark:text-red-700">•</span>
          <span>Sunucu Yanıt Vermiyor</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Sunucu Bağlantı Hatası
        </h2>

        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Fatura Karşılaştırma ve Analiz servisine şu anda ulaşılamıyor. Sunucu kaynaklı geçici bir kesinti nedeniyle bu ekranda işlem yapılamamaktadır.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 text-left text-xs text-slate-500 dark:text-slate-400 font-mono space-y-1">
          <div>Durum: 503 Service Unavailable</div>
          <div>Servis: invoice-comparison-engine</div>
          <div>Açıklama: Uzak sunucu isteğe zamanında yanıt vermedi. Lütfen daha sonra tekrar deneyin.</div>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceComparisonModuleView() {
  if (INVOICE_COMPARISON_SERVER_ERROR_MODE) {
    return <InvoiceComparisonServerErrorScreen />;
  }

  return <InvoiceComparisonModuleContent />;
}

function InvoiceComparisonModuleContent() {
  const { user } = useAuth();
  const userId = user?.id;

  // Ephemeral uploaded documents (NOT stored permanently in Supabase!)
  const [incomingInvoices, setIncomingInvoices] = useState<StandardInvoiceDocument[]>([]);
  const [outgoingInvoices, setOutgoingInvoices] = useState<StandardInvoiceDocument[]>([]);
  const [analysisStarted, setAnalysisStarted] = useState<boolean>(false);

  // User decisions & learned mapping rules (user-isolated)
  const [learnedRules, setLearnedRules] = useState<LearnedMappingRule[]>([]);
  const [manualOverrides, setManualOverrides] = useState<ManualOverrideMap>({});
  const [userCreatedCards, setUserCreatedCards] = useState<CentralProductCard[]>([]);

  // Upload & export status
  const [uploadingSide, setUploadingSide] = useState<InvoiceDirection | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    side: InvoiceDirection;
    done: number;
    total: number;
  } | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [compareProgress, setCompareProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [workerReport, setWorkerReport] = useState<ComparisonReportPayload | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [banner, setBanner] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);

  // Filters, pagination & navigation state inside module
  const [activeSubTab, setActiveSubTab] = useState<
    "comparison" | "review" | "learned_rules"
  >("comparison");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "matched" | "needs_approval" | "unmatched" | "only_incoming" | "only_outgoing"
  >("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [comparisonPage, setComparisonPage] = useState<number>(1);
  const [reviewPage, setReviewPage] = useState<number>(1);

  // Modal state for creating new central card or manual pairing
  const [newCardModalOpen, setNewCardModalOpen] = useState<boolean>(false);
  const [newCardTitle, setNewCardTitle] = useState<string>("");
  const [newCardUnit, setNewCardUnit] = useState<string>("KG");
  const [pendingAssignLine, setPendingAssignLine] = useState<StandardInvoiceLine | null>(null);

  // Manual pairing (Incoming line + Outgoing line = same product)
  const [pairIncomingLineId, setPairIncomingLineId] = useState<string>("");
  const [pairOutgoingLineId, setPairOutgoingLineId] = useState<string>("");
  const [pairTargetCardName, setPairTargetCardName] = useState<string>("");
  const [pairIncomingSearch, setPairIncomingSearch] = useState<string>("");
  const [pairOutgoingSearch, setPairOutgoingSearch] = useState<string>("");

  const incomingInputRef = useRef<HTMLInputElement | null>(null);
  const outgoingInputRef = useRef<HTMLInputElement | null>(null);
  const incomingFolderInputRef = useRef<HTMLInputElement | null>(null);
  const outgoingFolderInputRef = useRef<HTMLInputElement | null>(null);
  const pdfReportRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerReqIdRef = useRef<number>(0);
  const compareReqIdRef = useRef<number>(0);

  // Restore transient session workspace & user-scoped learned rules asynchronously
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const rulesRaw = localStorage.getItem(makeLearnedRulesStorageKey(userId));
        if (rulesRaw) {
          const parsed = JSON.parse(rulesRaw);
          if (Array.isArray(parsed)) setLearnedRules(parsed);
        }
      } catch {
        // ignore
      }

      try {
        const sessionRaw = sessionStorage.getItem(makeSessionStorageKey(userId));
        if (sessionRaw) {
          const parsed = JSON.parse(sessionRaw);
          if (Array.isArray(parsed.incoming)) setIncomingInvoices(parsed.incoming);
          if (Array.isArray(parsed.outgoing)) setOutgoingInvoices(parsed.outgoing);
          if (parsed.analysisStarted) setAnalysisStarted(true);
          if (parsed.manualOverrides) setManualOverrides(parsed.manualOverrides);
          if (Array.isArray(parsed.userCreatedCards)) {
            setUserCreatedCards(parsed.userCreatedCards);
          }
        }
      } catch {
        // ignore
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        makeLearnedRulesStorageKey(userId),
        JSON.stringify(learnedRules)
      );
    } catch {
      // ignore
    }
  }, [learnedRules, userId]);

  useEffect(() => {
    try {
      const totalDocs = incomingInvoices.length + outgoingInvoices.length;
      if (totalDocs > SESSION_STORAGE_MAX_INVOICES) {
        sessionStorage.removeItem(makeSessionStorageKey(userId));
        return;
      }
      sessionStorage.setItem(
        makeSessionStorageKey(userId),
        JSON.stringify({
          incoming: incomingInvoices,
          outgoing: outgoingInvoices,
          analysisStarted,
          manualOverrides,
          userCreatedCards,
        })
      );
    } catch {
      // ignore
    }
  }, [
    incomingInvoices,
    outgoingInvoices,
    analysisStarted,
    manualOverrides,
    userCreatedCards,
    userId,
  ]);

  // Cleanup Web Worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const getOrCreateWorker = (): Worker | null => {
    if (typeof Worker === "undefined") return null;
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL("../workers/invoiceComparison.worker.ts", import.meta.url)
        );
      } catch {
        return null;
      }
    }
    return workerRef.current;
  };

  const showMessage = (type: "info" | "success" | "error", text: string) => {
    setBanner({ type, text });
    if (type !== "info") {
      setTimeout(() => {
        setBanner((prev) => (prev?.text === text ? null : prev));
      }, 6000);
    }
  };

  // Optional client-side scanned PDF OCR helper using Tesseract CDN + pdf.js CDN if PDF text layer was empty
  const tryClientPdfOcr = async (
    file: File,
    direction: InvoiceDirection
  ): Promise<StandardInvoiceDocument | null> => {
    try {
      // Dynamically load Tesseract from CDN only when scanned PDF has zero text
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if (!win.Tesseract) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("OCR kütüphanesi yüklenemedi."));
          document.head.appendChild(s);
        });
      }
      if (!win.pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs";
          s.type = "module";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("PDF görsel oluşturucu yüklenemedi."));
          document.head.appendChild(s);
        }).catch(() => {});
      }

      if (!win.pdfjsLib || !win.Tesseract) return null;

      const bytes = await file.arrayBuffer();
      const pdfDoc = await win.pdfjsLib.getDocument({ data: bytes }).promise;
      let combinedText = "";
      const pagesToRead = Math.min(pdfDoc.numPages || 1, 3);
      for (let p = 1; p <= pagesToRead; p++) {
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        const ocrRes = await win.Tesseract.recognize(dataUrl, "tur+eng");
        combinedText += `\n${ocrRes?.data?.text || ""}`;
      }

      if (!combinedText.trim()) return null;

      const res = await fetch("/api/invoice-comparison/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: combinedText,
          fileName: file.name,
          direction,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.documents?.[0] || null;
    } catch {
      return null;
    }
  };

  // Parse XML/JSON files locally inside Web Worker (handles 10,000+ XML files without freezing UI or server)
  const parseLocalFilesWithWorker = (
    localFiles: File[],
    direction: InvoiceDirection
  ): Promise<{
    documents: StandardInvoiceDocument[];
    errors: Array<{ fileName: string; message: string }>;
  }> => {
    return new Promise((resolve, reject) => {
      const worker = getOrCreateWorker();
      if (!worker) {
        // Fallback: chunked async on main thread
        (async () => {
          const docs: StandardInvoiceDocument[] = [];
          const errs: Array<{ fileName: string; message: string }> = [];
          const CHUNK = 25;
          for (let i = 0; i < localFiles.length; i += CHUNK) {
            const slice = localFiles.slice(i, i + CHUNK);
            await Promise.all(
              slice.map(async (file) => {
                const fmt = detectFileFormat(file.name, file.type);
                if (!fmt || fmt === "pdf") return;
                if (file.size > MAX_INVOICE_FILE_BYTES) {
                  errs.push({ fileName: file.name, message: "Dosya boyutu 4 MB sınırını aşıyor." });
                  return;
                }
                try {
                  const text = await file.text();
                  if (fmt === "xml") {
                    docs.push(parseInvoiceXmlSecure(text, file.name, direction, file.size));
                  } else {
                    docs.push(...parseInvoiceJsonSecure(text, file.name, direction, file.size));
                  }
                } catch (e: unknown) {
                  errs.push({
                    fileName: file.name,
                    message: e instanceof Error ? e.message : "Ayrıştırma hatası.",
                  });
                }
              })
            );
            setUploadProgress({
              side: direction,
              done: Math.min(localFiles.length, i + slice.length),
              total: localFiles.length,
            });
            await new Promise((r) => setTimeout(r, 0));
          }
          resolve({ documents: docs, errors: errs });
        })().catch(reject);
        return;
      }

      const requestId = ++workerReqIdRef.current;
      const handleMsg = (event: MessageEvent<WorkerResponseMessage>) => {
        const msg = event.data;
        if (msg.requestId !== requestId) return;
        if (msg.type === "parse_progress") {
          setUploadProgress({ side: direction, done: msg.done, total: msg.total });
        } else if (msg.type === "parse_done") {
          worker.removeEventListener("message", handleMsg);
          worker.removeEventListener("error", handleErr);
          resolve({ documents: msg.documents, errors: msg.errors });
        } else if (msg.type === "error") {
          worker.removeEventListener("message", handleMsg);
          worker.removeEventListener("error", handleErr);
          reject(new Error(msg.message));
        }
      };
      const handleErr = (err: ErrorEvent) => {
        worker.removeEventListener("message", handleMsg);
        worker.removeEventListener("error", handleErr);
        reject(new Error(err.message || "Worker hatası"));
      };

      worker.addEventListener("message", handleMsg);
      worker.addEventListener("error", handleErr);
      worker.postMessage({
        type: "parse_files",
        requestId,
        files: localFiles,
        direction,
      } satisfies WorkerRequestMessage);
    });
  };

  // Handle batch file uploads per side (Incoming / Outgoing)
  const handleUploadFiles = async (
    filesList: FileList | File[],
    direction: InvoiceDirection
  ) => {
    const rawFiles = Array.from(filesList);
    if (rawFiles.length === 0) return;

    const localFiles: File[] = [];
    const pdfFiles: File[] = [];
    const errorMessages: string[] = [];

    for (const f of rawFiles) {
      const fmt = detectFileFormat(f.name, f.type);
      if (fmt === "xml" || fmt === "json") {
        localFiles.push(f);
      } else if (fmt === "pdf") {
        pdfFiles.push(f);
      } else if (!f.name.startsWith(".")) {
        errorMessages.push(`${f.name}: Desteklenmeyen dosya türü.`);
      }
    }

    const totalCount = localFiles.length + pdfFiles.length;
    if (totalCount === 0) {
      if (errorMessages.length > 0) {
        showMessage("error", errorMessages.slice(0, 3).join(" | "));
      }
      return;
    }

    setUploadingSide(direction);
    setUploadProgress({ side: direction, done: 0, total: totalCount });
    showMessage(
      "info",
      `${totalCount.toLocaleString("tr-TR")} dosya (${direction === "incoming" ? "Gelen" : "Giden"}) okunuyor...`
    );

    const parsedDocs: StandardInvoiceDocument[] = [];

    try {
      // 1. Parse all XML & JSON files locally in Web Worker (super fast for 13,000+ XMLs)
      if (localFiles.length > 0) {
        const localRes = await parseLocalFilesWithWorker(localFiles, direction);
        for (const d of localRes.documents) parsedDocs.push(d);
        for (const e of localRes.errors) {
          errorMessages.push(`${e.fileName}: ${e.message}`);
        }
      }

      // 2. Parse PDF files (if any) via server endpoint in concurrent batches of 4
      if (pdfFiles.length > 0) {
        const PDF_BATCH = 4;
        for (let i = 0; i < pdfFiles.length; i += PDF_BATCH) {
          const slice = pdfFiles.slice(i, i + PDF_BATCH);
          await Promise.all(
            slice.map(async (file) => {
              const fd = new FormData();
              fd.append("files", file);
              fd.append("direction", direction);

              const res = await fetch("/api/invoice-comparison/parse", {
                method: "POST",
                body: fd,
              });
              const raw = await res.text();
              let data: {
                documents?: StandardInvoiceDocument[];
                errors?: Array<{ fileName: string; message: string }>;
                error?: string;
              };
              try {
                data = JSON.parse(raw);
              } catch {
                errorMessages.push(`${file.name}: Sunucudan geçersiz yanıt (HTTP ${res.status}).`);
                return;
              }

              if (!res.ok) {
                errorMessages.push(`${file.name}: ${data.error || "Yükleme hatası"}`);
                return;
              }

              if (Array.isArray(data.errors) && data.errors.length > 0) {
                data.errors.forEach((e) => errorMessages.push(`${e.fileName}: ${e.message}`));
              }

              if (Array.isArray(data.documents)) {
                for (const doc of data.documents) {
                  if (doc.needsClientOcr && doc.fileFormat === "pdf") {
                    const ocrDoc = await tryClientPdfOcr(file, direction);
                    parsedDocs.push(ocrDoc || doc);
                  } else {
                    parsedDocs.push(doc);
                  }
                }
              }
            })
          );
          setUploadProgress({
            side: direction,
            done: localFiles.length + Math.min(pdfFiles.length, i + slice.length),
            total: totalCount,
          });
        }
      }

      if (parsedDocs.length > 0) {
        if (direction === "incoming") {
          setIncomingInvoices((prev) => prev.concat(parsedDocs));
        } else {
          setOutgoingInvoices((prev) => prev.concat(parsedDocs));
        }
      }

      if (errorMessages.length > 0) {
        const previewErrs = errorMessages.slice(0, 3).join(" | ");
        const extra =
          errorMessages.length > 3 ? ` (+${errorMessages.length - 3} diğer hata)` : "";
        showMessage(
          "error",
          `${parsedDocs.length.toLocaleString("tr-TR")} fatura okundu. Hatalar (${errorMessages.length}): ${previewErrs}${extra}`
        );
      } else {
        showMessage(
          "success",
          `${parsedDocs.length.toLocaleString("tr-TR")} ${direction === "incoming" ? "Gelen (Alış)" : "Giden (Satış)"} fatura analiz alanına yüklendi.`
        );
      }
    } catch (err: unknown) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "Dosyalar yüklenirken hata oluştu."
      );
    } finally {
      setUploadingSide(null);
      setUploadProgress(null);
      if (direction === "incoming") {
        if (incomingInputRef.current) incomingInputRef.current.value = "";
        if (incomingFolderInputRef.current) incomingFolderInputRef.current.value = "";
      }
      if (direction === "outgoing") {
        if (outgoingInputRef.current) outgoingInputRef.current.value = "";
        if (outgoingFolderInputRef.current) outgoingFolderInputRef.current.value = "";
      }
    }
  };

  // Clear all transient uploaded invoices and current comparison session securely
  const handleClearTransientAnalysis = () => {
    setIncomingInvoices([]);
    setOutgoingInvoices([]);
    setAnalysisStarted(false);
    setManualOverrides({});
    setUserCreatedCards([]);
    setExpandedRowId(null);
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setCompanyFilter("all");
    setFamilyFilter("all");
    setStatusFilter("all");
    try {
      sessionStorage.removeItem(makeSessionStorageKey(userId));
    } catch {
      // ignore
    }
    showMessage(
      "info",
      "Geçici yüklenen tüm faturalar ve analiz verileri bellekten güvenli şekilde temizlendi."
    );
  };

  const handleLoadTestScenario = () => {
    const demo = buildScenarioDemoInvoices();
    setIncomingInvoices(demo.incoming);
    setOutgoingInvoices(demo.outgoing);
    setManualOverrides({});
    setAnalysisStarted(true);
    showMessage(
      "success",
      "Örnek test faturaları yüklendi ve çok katmanlı eşleştirme analizi başlatıldı."
    );
  };

  // All companies & dates available for dynamic filtering
  const allUploadedInvoices = useMemo(
    () => [...incomingInvoices, ...outgoingInvoices],
    [incomingInvoices, outgoingInvoices]
  );

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    allUploadedInvoices.forEach((inv) => {
      if (inv.sellerName) set.add(inv.sellerName);
      if (inv.buyerName) set.add(inv.buyerName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [allUploadedInvoices]);

  // Apply date & company pre-filter on invoices before running comparison
  const filteredIncomingInvoices = useMemo(() => {
    return incomingInvoices.filter((inv) => {
      if (dateFrom && inv.invoiceDate && inv.invoiceDate < dateFrom) return false;
      if (dateTo && inv.invoiceDate && inv.invoiceDate > dateTo) return false;
      if (
        companyFilter !== "all" &&
        inv.sellerName !== companyFilter &&
        inv.buyerName !== companyFilter
      ) {
        return false;
      }
      return true;
    });
  }, [incomingInvoices, dateFrom, dateTo, companyFilter]);

  const filteredOutgoingInvoices = useMemo(() => {
    return outgoingInvoices.filter((inv) => {
      if (dateFrom && inv.invoiceDate && inv.invoiceDate < dateFrom) return false;
      if (dateTo && inv.invoiceDate && inv.invoiceDate > dateTo) return false;
      if (
        companyFilter !== "all" &&
        inv.sellerName !== companyFilter &&
        inv.buyerName !== companyFilter
      ) {
        return false;
      }
      return true;
    });
  }, [outgoingInvoices, dateFrom, dateTo, companyFilter]);

  const totalFilteredLines = useMemo(() => {
    let total = 0;
    for (const inv of filteredIncomingInvoices) total += inv.items.length;
    for (const inv of filteredOutgoingInvoices) total += inv.items.length;
    return total;
  }, [filteredIncomingInvoices, filteredOutgoingInvoices]);

  const syncReport = useMemo(() => {
    if (!analysisStarted || totalFilteredLines > WORKER_LINE_THRESHOLD) {
      return null;
    }
    return runInvoiceProductComparison({
      incomingInvoices: filteredIncomingInvoices,
      outgoingInvoices: filteredOutgoingInvoices,
      learnedRules,
      manualOverrides,
      userCreatedCards,
    });
  }, [
    analysisStarted,
    totalFilteredLines,
    filteredIncomingInvoices,
    filteredOutgoingInvoices,
    learnedRules,
    manualOverrides,
    userCreatedCards,
  ]);

  // Run multi-layer comparison engine in Web Worker for large (10,000+ invoice) sets
  useEffect(() => {
    if (!analysisStarted || totalFilteredLines <= WORKER_LINE_THRESHOLD) {
      return;
    }

    const reqId = ++compareReqIdRef.current;
    const worker = getOrCreateWorker();
    if (!worker) {
      const result = runInvoiceProductComparison({
        incomingInvoices: filteredIncomingInvoices,
        outgoingInvoices: filteredOutgoingInvoices,
        learnedRules,
        manualOverrides,
        userCreatedCards,
      });
      const fallbackTimer = window.setTimeout(() => {
        if (compareReqIdRef.current === reqId) {
          setWorkerReport(result);
          setIsComparing(false);
          setCompareProgress(null);
        }
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const startTimer = window.setTimeout(() => {
      if (compareReqIdRef.current === reqId) {
        setIsComparing(true);
        setCompareProgress({ processed: 0, total: totalFilteredLines });
      }
    }, 0);

    const workerReqId = ++workerReqIdRef.current;
    const handleMsg = (event: MessageEvent<WorkerResponseMessage>) => {
      const msg = event.data;
      if (msg.requestId !== workerReqId) return;
      if (compareReqIdRef.current !== reqId) {
        worker.removeEventListener("message", handleMsg);
        worker.removeEventListener("error", handleErr);
        return;
      }
      if (msg.type === "compare_progress") {
        setCompareProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === "compare_done") {
        window.clearTimeout(startTimer);
        worker.removeEventListener("message", handleMsg);
        worker.removeEventListener("error", handleErr);
        setWorkerReport(msg.report);
        setIsComparing(false);
        setCompareProgress(null);
      } else if (msg.type === "error") {
        window.clearTimeout(startTimer);
        worker.removeEventListener("message", handleMsg);
        worker.removeEventListener("error", handleErr);
        setIsComparing(false);
        setCompareProgress(null);
        showMessage("error", msg.message);
      }
    };
    const handleErr = (err: ErrorEvent) => {
      window.clearTimeout(startTimer);
      worker.removeEventListener("message", handleMsg);
      worker.removeEventListener("error", handleErr);
      setIsComparing(false);
      setCompareProgress(null);
      showMessage("error", err.message || "Karşılaştırma sırasında worker hatası.");
    };

    worker.addEventListener("message", handleMsg);
    worker.addEventListener("error", handleErr);
    worker.postMessage({
      type: "compare",
      requestId: workerReqId,
      incomingInvoices: filteredIncomingInvoices,
      outgoingInvoices: filteredOutgoingInvoices,
      learnedRules,
      manualOverrides,
      userCreatedCards,
    } satisfies WorkerRequestMessage);

    return () => {
      window.clearTimeout(startTimer);
      worker.removeEventListener("message", handleMsg);
      worker.removeEventListener("error", handleErr);
    };
  }, [
    analysisStarted,
    totalFilteredLines,
    filteredIncomingInvoices,
    filteredOutgoingInvoices,
    learnedRules,
    manualOverrides,
    userCreatedCards,
  ]);

  const report = useMemo(() => {
    if (!analysisStarted) return null;
    if (totalFilteredLines <= WORKER_LINE_THRESHOLD) return syncReport;
    return workerReport;
  }, [analysisStarted, totalFilteredLines, syncReport, workerReport]);

  const uniqueFamilies = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    report.comparisonRows.forEach((r) => {
      if (r.canonicalFamily) set.add(r.canonicalFamily);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [report]);

  // Filtered comparison table rows
  const filteredComparisonRows = useMemo(() => {
    if (!report) return [];
    const q = normalizeTurkishAscii(searchQuery.trim());
    return report.comparisonRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (familyFilter !== "all" && row.canonicalFamily !== familyFilter) return false;
      if (q) {
        const inCardName = normalizeTurkishAscii(row.productName).includes(q);
        const inVarieties = row.varieties.some((v) =>
          normalizeTurkishAscii(v).includes(q)
        );
        const inLines = [...row.incomingLines, ...row.outgoingLines].some(
          (l) =>
            normalizeTurkishAscii(l.originalProductName).includes(q) ||
            normalizeTurkishAscii(l.originalDescription).includes(q)
        );
        if (!inCardName && !inVarieties && !inLines) return false;
      }
      return true;
    });
  }, [report, statusFilter, familyFilter, searchQuery]);

  const totalComparisonPages = Math.max(
    1,
    Math.ceil(filteredComparisonRows.length / COMPARISON_PAGE_SIZE)
  );
  const paginatedComparisonRows = useMemo(() => {
    const safePage = Math.min(comparisonPage, totalComparisonPages);
    const start = (safePage - 1) * COMPARISON_PAGE_SIZE;
    return filteredComparisonRows.slice(start, start + COMPARISON_PAGE_SIZE);
  }, [filteredComparisonRows, comparisonPage, totalComparisonPages]);

  const allReviewItems = useMemo(() => {
    if (!report) return [];
    return [...report.suspiciousAssignments, ...report.unmatchedLines];
  }, [report]);

  const totalReviewPages = Math.max(
    1,
    Math.ceil(allReviewItems.length / REVIEW_PAGE_SIZE)
  );
  const paginatedReviewItems = useMemo(() => {
    const safePage = Math.min(reviewPage, totalReviewPages);
    const start = (safePage - 1) * REVIEW_PAGE_SIZE;
    return allReviewItems.slice(start, start + REVIEW_PAGE_SIZE);
  }, [allReviewItems, reviewPage, totalReviewPages]);

  const filteredPairingIncomingOptions = useMemo(() => {
    if (activeSubTab !== "review") return [];
    const q = normalizeTurkishAscii(pairIncomingSearch.trim());
    const result: Array<{ id: string; label: string }> = [];
    for (const inv of incomingInvoices) {
      const invRef = inv.invoiceNo || inv.fileName;
      for (const l of inv.items) {
        const text = l.originalProductName || l.originalDescription || "";
        if (q) {
          const hay = normalizeTurkishAscii(`${invRef} ${text}`);
          if (!hay.includes(q)) continue;
        }
        result.push({ id: l.id, label: `[${invRef}] ${text}` });
        if (result.length >= 200) return result;
      }
    }
    return result;
  }, [activeSubTab, incomingInvoices, pairIncomingSearch]);

  const filteredPairingOutgoingOptions = useMemo(() => {
    if (activeSubTab !== "review") return [];
    const q = normalizeTurkishAscii(pairOutgoingSearch.trim());
    const result: Array<{ id: string; label: string }> = [];
    for (const inv of outgoingInvoices) {
      const invRef = inv.invoiceNo || inv.fileName;
      for (const l of inv.items) {
        const text = l.originalProductName || l.originalDescription || "";
        if (q) {
          const hay = normalizeTurkishAscii(`${invRef} ${text}`);
          if (!hay.includes(q)) continue;
        }
        result.push({ id: l.id, label: `[${invRef}] ${text}` });
        if (result.length >= 200) return result;
      }
    }
    return result;
  }, [activeSubTab, outgoingInvoices, pairOutgoingSearch]);

  // Save a learned mapping rule from a user decision
  const recordLearnedRule = (
    line: StandardInvoiceLine,
    targetCardId: string,
    targetCardName: string
  ) => {
    const signatureKey = buildLearnedRuleSignature(line);
    const now = new Date().toISOString();
    setLearnedRules((prev) => {
      const idx = prev.findIndex((r) => r.signatureKey === signatureKey);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          targetCentralProductId: targetCardId,
          targetCentralProductName: targetCardName,
          updatedAt: now,
          usageCount: copy[idx].usageCount + 1,
        };
        return copy;
      }
      return [
        {
          id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          signatureKey,
          sourceNameSample: line.originalProductName || "(Boş Ürün Adı)",
          sourceDescriptionSample: line.originalDescription || "",
          targetCentralProductId: targetCardId,
          targetCentralProductName: targetCardName,
          createdAt: now,
          updatedAt: now,
          usageCount: 1,
        },
        ...prev,
      ];
    });
  };

  // User Actions: Approve / Reject / Map to Existing Card / Create New Card / Manual Pair
  const handleApproveSuggestion = (
    line: StandardInvoiceLine,
    targetCardId: string | null | undefined,
    targetCardName: string
  ) => {
    const slug =
      normalizeTurkishAscii(targetCardName).replace(/[^a-z0-9]+/g, "-") || "custom";
    const cardId = targetCardId || `card-usr-${slug}`;
    setManualOverrides((prev) => ({
      ...prev,
      [line.id]: {
        action: "approved",
        targetCentralProductId: cardId,
        targetCentralProductName: targetCardName,
        customReason: `Kullanıcı "${targetCardName}" eşleştirmesini onayladı (öğrenilmiş kural kaydedildi).`,
      },
    }));
    recordLearnedRule(line, cardId, targetCardName);
    showMessage("success", `Eşleştirme onaylandı ve "${targetCardName}" kuralı öğrenildi.`);
  };

  const handleRejectAssignment = (line: StandardInvoiceLine) => {
    setManualOverrides((prev) => ({
      ...prev,
      [line.id]: {
        action: "rejected",
        customReason: "Kullanıcı eşleştirmeyi reddetti; ayrı kalem olarak tutuldu.",
      },
    }));
    showMessage("info", "Eşleştirme reddedildi ve kalem ayrıldı.");
  };

  const handleReassignLineToCard = (
    line: StandardInvoiceLine,
    cardId: string,
    cardName: string
  ) => {
    setManualOverrides((prev) => ({
      ...prev,
      [line.id]: {
        action: "manual_mapped",
        targetCentralProductId: cardId,
        targetCentralProductName: cardName,
        customReason: `Kullanıcı tarafından manuel olarak "${cardName}" kartına bağlandı.`,
      },
    }));
    recordLearnedRule(line, cardId, cardName);
    showMessage("success", `Kalem "${cardName}" kartına bağlandı ve öğrenildi.`);
  };

  const handleCreateNewCardForLine = () => {
    const cleanTitle = newCardTitle.trim();
    if (!cleanTitle) return;
    const newCardId = `card-custom-${Date.now().toString(36)}`;
    const created: CentralProductCard = {
      id: newCardId,
      canonicalName: cleanTitle,
      canonicalFamily: cleanTitle.toLocaleLowerCase("tr-TR").split(" ").pop() || "",
      baseUnit: newCardUnit,
      unitFamily:
        newCardUnit === "KG"
          ? "mass"
          : newCardUnit === "LT"
          ? "volume"
          : "count",
      varieties: [],
      aliases: pendingAssignLine
        ? [pendingAssignLine.originalProductName || pendingAssignLine.originalDescription].filter(
            Boolean
          )
        : [],
      createdBy: "user",
    };

    setUserCreatedCards((prev) => [...prev, created]);
    if (pendingAssignLine) {
      handleReassignLineToCard(pendingAssignLine, newCardId, cleanTitle);
    }
    setNewCardModalOpen(false);
    setNewCardTitle("");
    setPendingAssignLine(null);
  };

  const handleManualPairTwoLines = () => {
    if (!pairIncomingLineId || !pairOutgoingLineId || !pairTargetCardName.trim()) {
      showMessage(
        "error",
        "Lütfen bir gelen kalem, bir giden kalem ve ortak merkezi ürün adı seçin."
      );
      return;
    }

    const allInLines = incomingInvoices.flatMap((i) => i.items);
    const allOutLines = outgoingInvoices.flatMap((i) => i.items);
    const inLine = allInLines.find((l) => l.id === pairIncomingLineId);
    const outLine = allOutLines.find((l) => l.id === pairOutgoingLineId);
    if (!inLine || !outLine) return;

    const targetName = pairTargetCardName.trim();
    const existingCard = report?.centralProducts.find(
      (c) => c.canonicalName.toLocaleLowerCase("tr-TR") === targetName.toLocaleLowerCase("tr-TR")
    );
    const cardId = existingCard?.id || `card-pair-${Date.now().toString(36)}`;

    if (!existingCard) {
      setUserCreatedCards((prev) => [
        ...prev,
        {
          id: cardId,
          canonicalName: targetName,
          canonicalFamily: targetName.toLocaleLowerCase("tr-TR").split(" ").pop() || "",
          baseUnit: "KG",
          unitFamily: "mass",
          varieties: [],
          aliases: [
            inLine.originalProductName || inLine.originalDescription,
            outLine.originalProductName || outLine.originalDescription,
          ].filter(Boolean),
          createdBy: "user",
        },
      ]);
    }

    setManualOverrides((prev) => ({
      ...prev,
      [inLine.id]: {
        action: "manual_mapped",
        targetCentralProductId: cardId,
        targetCentralProductName: targetName,
        customReason: `İki kalem kullanıcı tarafından manuel olarak "${targetName}" ürününde birleştirildi.`,
      },
      [outLine.id]: {
        action: "manual_mapped",
        targetCentralProductId: cardId,
        targetCentralProductName: targetName,
        customReason: `İki kalem kullanıcı tarafından manuel olarak "${targetName}" ürününde birleştirildi.`,
      },
    }));

    recordLearnedRule(inLine, cardId, targetName);
    recordLearnedRule(outLine, cardId, targetName);
    setPairIncomingLineId("");
    setPairOutgoingLineId("");
    setPairTargetCardName("");
    showMessage(
      "success",
      `Seçilen iki kalem "${targetName}" merkezi ürün kartında birleştirildi ve kural öğrenildi.`
    );
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsExportingPdf(true);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (!pdfReportRef.current) {
        throw new Error("PDF şablonu oluşturulamadı.");
      }
      await exportComparisonDomToPdf(pdfReportRef.current);
      showMessage("success", "PDF karşılaştırma raporu indirildi.");
    } catch (err: unknown) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "PDF oluşturulurken hata oluştu."
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const formatBadge = (fmt: ComparisonFileFormat) => {
    if (fmt === "xml") {
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
          XML
        </span>
      );
    }
    if (fmt === "pdf") {
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 border border-rose-200">
          PDF
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200">
        JSON
      </span>
    );
  };

  const invoiceById = useMemo(() => {
    const map = new Map<string, StandardInvoiceDocument>();
    allUploadedInvoices.forEach((inv) => map.set(inv.id, inv));
    return map;
  }, [allUploadedInvoices]);

  return (
    <div className="space-y-6 pb-16">
      {/* Header & Security Notice */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-500/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Geçici Analiz Modülü • Kalıcı Fatura Kaydı Oluşturulmaz</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <GitCompareArrows className="w-6 h-6 text-indigo-400 shrink-0" />
              <span>Fatura Karşılaştırma ve Analiz</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              XML, PDF ve JSON formatındaki gelen (alış) ve giden (satış) faturaları toplu
              yükleyin; farklı ürün isimleri, boş adı açıklama olan kalemler, kısaltmalar,
              özel çeşitler ve ölçü birimlerini çok katmanlı anlamsal eşleştirme ile analiz edin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadTestScenario}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Örnek Test Faturaları Yükle</span>
            </button>
            {(incomingInvoices.length > 0 || outgoingInvoices.length > 0) && (
              <button
                type="button"
                onClick={handleClearTransientAnalysis}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold shadow-md transition-colors"
                title="Yüklenen geçici dosyaları ve analiz oturumunu temizle"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Geçici Verileri Temizle</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {banner && (
        <div
          className={`rounded-2xl px-4 py-3 border text-xs font-medium flex items-center justify-between gap-3 ${
            banner.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-indigo-50 border-indigo-200 text-indigo-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === "error" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : banner.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <Info className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 hover:bg-black/5 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 1: DUAL EPHEMERAL FILE UPLOAD PANELS (INCOMING & OUTGOING)       */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* INCOMING (ALIŞ) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                Alış / Tedarik
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Gelen Faturalar (Alış)
              </h3>
              <p className="text-xs text-slate-500">
                Çoklu XML, PDF veya JSON faturalarınızı buraya bırakın.
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-black text-blue-700 font-mono">
                {incomingInvoices.length}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">Fatura Yüklendi</div>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const droppedFiles = await collectFilesFromDataTransfer(e.dataTransfer);
              if (droppedFiles.length > 0) {
                handleUploadFiles(droppedFiles, "incoming");
              }
            }}
            onClick={() => incomingInputRef.current?.click()}
            className="border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 hover:bg-blue-50/70 rounded-2xl p-6 text-center cursor-pointer transition-all"
          >
            <input
              ref={incomingInputRef}
              type="file"
              multiple
              accept=".xml,.pdf,.json,application/xml,text/xml,application/pdf,application/json"
              onChange={(e) =>
                e.target.files && handleUploadFiles(e.target.files, "incoming")
              }
              className="hidden"
            />
            <input
              ref={incomingFolderInputRef}
              type="file"
              {...({
                webkitdirectory: "",
                directory: "",
              } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) =>
                e.target.files && handleUploadFiles(e.target.files, "incoming")
              }
              className="hidden"
            />
            {uploadingSide === "incoming" ? (
              <div className="flex flex-col items-center gap-2 text-blue-700 w-full max-w-xs mx-auto">
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-xs font-bold">
                  Gelen faturalar ayrıştırılıyor...
                  {uploadProgress?.side === "incoming"
                    ? ` (${uploadProgress.done.toLocaleString("tr-TR")} / ${uploadProgress.total.toLocaleString("tr-TR")})`
                    : ""}
                </span>
                {uploadProgress?.side === "incoming" && uploadProgress.total > 0 && (
                  <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-150"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((uploadProgress.done / uploadProgress.total) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-slate-800">
                  Gelen Fatura Dosyalarını veya Klasörünü Sürükleyin
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <FileCode2 className="w-3 h-3 text-indigo-600" /> XML
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3 text-rose-600" /> PDF
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <FileJson className="w-3 h-3 text-amber-600" /> JSON
                  </span>
                  <span>(Max 4 MB / Dosya)</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    incomingFolderInputRef.current?.click();
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 text-[11px] font-bold shadow-2xs"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Klasör Seç (10.000+ XML)</span>
                </button>
              </div>
            )}
          </div>

          {incomingInvoices.length > 0 && (
            <div className="space-y-1.5">
              {incomingInvoices.length > PREVIEW_INVOICE_CAP && (
                <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg font-medium">
                  Toplam <strong>{incomingInvoices.length.toLocaleString("tr-TR")}</strong> gelen fatura yüklendi (performans için ilk {PREVIEW_INVOICE_CAP} gösteriliyor).
                </div>
              )}
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {incomingInvoices.slice(0, PREVIEW_INVOICE_CAP).map((inv) => (
                <div
                  key={inv.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                      {formatBadge(inv.fileFormat)}
                      <span className="truncate">{inv.invoiceNo || inv.fileName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {inv.sellerName || "Satıcı Belirtilmemiş"} •{" "}
                      {inv.invoiceDate || "Tarih Yok"} •{" "}
                      <strong>{inv.items.length} kalem</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setIncomingInvoices((prev) => prev.filter((x) => x.id !== inv.id))
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 rounded shrink-0"
                    title="Faturayı geçici listeden çıkar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* OUTGOING (SATIŞ) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Satış / Çıkış
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Giden Faturalar (Satış)
              </h3>
              <p className="text-xs text-slate-500">
                Çoklu XML, PDF veya JSON satış faturalarınızı buraya bırakın.
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-black text-emerald-700 font-mono">
                {outgoingInvoices.length.toLocaleString("tr-TR")}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">Fatura Yüklendi</div>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const droppedFiles = await collectFilesFromDataTransfer(e.dataTransfer);
              if (droppedFiles.length > 0) {
                handleUploadFiles(droppedFiles, "outgoing");
              }
            }}
            onClick={() => outgoingInputRef.current?.click()}
            className="border-2 border-dashed border-emerald-200 hover:border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-6 text-center cursor-pointer transition-all"
          >
            <input
              ref={outgoingInputRef}
              type="file"
              multiple
              accept=".xml,.pdf,.json,application/xml,text/xml,application/pdf,application/json"
              onChange={(e) =>
                e.target.files && handleUploadFiles(e.target.files, "outgoing")
              }
              className="hidden"
            />
            <input
              ref={outgoingFolderInputRef}
              type="file"
              {...({
                webkitdirectory: "",
                directory: "",
              } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) =>
                e.target.files && handleUploadFiles(e.target.files, "outgoing")
              }
              className="hidden"
            />
            {uploadingSide === "outgoing" ? (
              <div className="flex flex-col items-center gap-2 text-emerald-700 w-full max-w-xs mx-auto">
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-xs font-bold">
                  Giden faturalar ayrıştırılıyor...
                  {uploadProgress?.side === "outgoing"
                    ? ` (${uploadProgress.done.toLocaleString("tr-TR")} / ${uploadProgress.total.toLocaleString("tr-TR")})`
                    : ""}
                </span>
                {uploadProgress?.side === "outgoing" && uploadProgress.total > 0 && (
                  <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-150"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((uploadProgress.done / uploadProgress.total) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-slate-800">
                  Giden Fatura Dosyalarını veya Klasörünü Sürükleyin
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <FileCode2 className="w-3 h-3 text-indigo-600" /> XML
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3 text-rose-600" /> PDF
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <FileJson className="w-3 h-3 text-amber-600" /> JSON
                  </span>
                  <span>(Max 4 MB / Dosya)</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    outgoingFolderInputRef.current?.click();
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 text-[11px] font-bold shadow-2xs"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Klasör Seç (10.000+ XML)</span>
                </button>
              </div>
            )}
          </div>

          {outgoingInvoices.length > 0 && (
            <div className="space-y-1.5">
              {outgoingInvoices.length > PREVIEW_INVOICE_CAP && (
                <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-medium">
                  Toplam <strong>{outgoingInvoices.length.toLocaleString("tr-TR")}</strong> giden fatura yüklendi (performans için ilk {PREVIEW_INVOICE_CAP} gösteriliyor).
                </div>
              )}
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {outgoingInvoices.slice(0, PREVIEW_INVOICE_CAP).map((inv) => (
                <div
                  key={inv.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                      {formatBadge(inv.fileFormat)}
                      <span className="truncate">{inv.invoiceNo || inv.fileName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {inv.buyerName || "Alıcı Belirtilmemiş"} •{" "}
                      {inv.invoiceDate || "Tarih Yok"} •{" "}
                      <strong>{inv.items.length} kalem</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOutgoingInvoices((prev) => prev.filter((x) => x.id !== inv.id))
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 rounded shrink-0"
                    title="Faturayı geçici listeden çıkar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start / Re-run Comparison Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            Yüklenen dosyalar:{" "}
            <strong>{incomingInvoices.length.toLocaleString("tr-TR")} Gelen</strong> /{" "}
            <strong>{outgoingInvoices.length.toLocaleString("tr-TR")} Giden</strong> •{" "}
            <strong>{learnedRules.length}</strong> öğrenilmiş eşleştirme kuralı aktif.
          </span>
          {isComparing && compareProgress && compareProgress.total > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
              <Loader2 className="w-3 h-3 animate-spin" />
              Eşleştiriliyor:{" "}
              {Math.min(
                100,
                Math.round((compareProgress.processed / compareProgress.total) * 100)
              )}
              %
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={
              isComparing ||
              (incomingInvoices.length === 0 && outgoingInvoices.length === 0)
            }
            onClick={() => {
              setAnalysisStarted(true);
              showMessage(
                "info",
                "Çok katmanlı semantik eşleştirme ve ölçü birimi analizi başlatıldı..."
              );
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-40 text-white text-xs font-bold shadow-md transition-all"
          >
            {isComparing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitCompareArrows className="w-4 h-4" />
            )}
            <span>
              {isComparing
                ? "Analiz Çalışıyor..."
                : analysisStarted
                ? "Karşılaştırmayı Yeniden Çalıştır"
                : "Karşılaştırmayı Başlat"}
            </span>
          </button>

          {report && (
            <>
              <button
                type="button"
                onClick={() =>
                  exportComparisonToExcel(report, allUploadedInvoices)
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                title="6 çalışma sayfalı detaylı Excel raporu indir"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel İndir (.xlsx)</span>
              </button>
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-60"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 text-rose-400" />
                )}
                <span>{isExportingPdf ? "PDF Hazırlanıyor..." : "PDF İndir"}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportComparisonToJson(report, allUploadedInvoices)
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>JSON</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* STEP 2 & 3: RESULTS DASHBOARD, TABS & COMPARISON TABLE                */}
      {/* ===================================================================== */}
      {report && (
        <div className="space-y-5">
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Gelen Fatura
              </div>
              <div className="text-xl font-black text-blue-700 font-mono mt-1">
                {report.summary.incomingInvoiceCount}
              </div>
              <div className="text-[11px] text-slate-500">
                {report.summary.totalIncomingLines} kalem
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Giden Fatura
              </div>
              <div className="text-xl font-black text-emerald-700 font-mono mt-1">
                {report.summary.outgoingInvoiceCount}
              </div>
              <div className="text-[11px] text-slate-500">
                {report.summary.totalOutgoingLines} kalem
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-emerald-700">
                Eşleşen Ürün
              </div>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">
                {report.summary.matchedProductCount}
              </div>
              <div className="text-[11px] text-slate-500">Alış & Satış bağlı</div>
            </div>
            <div className="bg-white rounded-2xl border border-amber-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-amber-700">
                İncelenecek (Şüpheli)
              </div>
              <div className="text-xl font-black text-amber-600 font-mono mt-1">
                {report.summary.needsReviewCount}
              </div>
              <div className="text-[11px] text-slate-500">Kullanıcı onayı bekliyor</div>
            </div>
            <div className="bg-white rounded-2xl border border-rose-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-rose-700">
                Eşleşmeyen Kalem
              </div>
              <div className="text-xl font-black text-rose-600 font-mono mt-1">
                {report.summary.unmatchedLineCount}
              </div>
              <div className="text-[11px] text-slate-500">Tek taraflı / ayrı</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Toplam Gelen Tutar
              </div>
              <div className="text-base font-black text-slate-900 font-mono mt-1">
                {formatTL(report.summary.totalIncomingAmount)}
              </div>
              <div className="text-[11px] text-slate-500">Net alış tutarı</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Toplam Giden Tutar
              </div>
              <div className="text-base font-black text-indigo-700 font-mono mt-1">
                {formatTL(report.summary.totalOutgoingAmount)}
              </div>
              <div className="text-[11px] text-slate-500">Net satış tutarı</div>
            </div>
          </div>

          {/* Sub-module View Switcher */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("comparison")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeSubTab === "comparison"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Ürün Karşılaştırma Tablosu ({report.comparisonRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("review")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeSubTab === "review"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>
                Onay & Manuel Eşleştirme ({report.summary.needsReviewCount + report.summary.unmatchedLineCount})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("learned_rules")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeSubTab === "learned_rules"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Öğrenilmiş Kurallar ({learnedRules.length})</span>
            </button>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SUBTAB 1: COMPARISON TABLE + FILTERS + INLINE ITEM BREAKDOWN    */}
          {/* --------------------------------------------------------------- */}
          {activeSubTab === "comparison" && (
            <div className="space-y-4">
              {/* Filter & Search Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {(
                    [
                      { id: "all", label: `Tümü (${report.comparisonRows.length})` },
                      {
                        id: "matched",
                        label: `Eşleşen Ürünler (${report.summary.matchedProductCount})`,
                      },
                      {
                        id: "needs_approval",
                        label: `Şüpheli Eşleşmeler (${
                          report.comparisonRows.filter((r) => r.status === "needs_approval")
                            .length
                        })`,
                      },
                      {
                        id: "unmatched",
                        label: `Eşleşmeyenler (${
                          report.comparisonRows.filter((r) => r.status === "unmatched").length
                        })`,
                      },
                      {
                        id: "only_incoming",
                        label: `Sadece Gelenlerde (${report.summary.onlyIncomingCount})`,
                      },
                      {
                        id: "only_outgoing",
                        label: `Sadece Gidenlerde (${report.summary.onlyOutgoingCount})`,
                      },
                    ] as const
                  ).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(chip.id);
                        setComparisonPage(1);
                        setExpandedRowId(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                        statusFilter === chip.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  <div className="relative lg:col-span-2">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setComparisonPage(1);
                        setExpandedRowId(null);
                      }}
                      placeholder="Ürün adı, açıklama veya çeşit ara..."
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setComparisonPage(1);
                    }}
                    title="Başlangıç Fatura Tarihi"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setComparisonPage(1);
                    }}
                    title="Bitiş Fatura Tarihi"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <select
                      value={companyFilter}
                      onChange={(e) => {
                        setCompanyFilter(e.target.value);
                        setComparisonPage(1);
                      }}
                      className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none"
                    >
                      <option value="all">Tüm Firmalar ({uniqueCompanies.length})</option>
                      {uniqueCompanies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {uniqueFamilies.length > 0 && (
                      <select
                        value={familyFilter}
                        onChange={(e) => {
                          setFamilyFilter(e.target.value);
                          setComparisonPage(1);
                        }}
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none"
                        title="Ürün Çeşidine / Ailesine Göre Filtrele"
                      >
                        <option value="all">Tüm Çeşitler</option>
                        {uniqueFamilies.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[11px] tracking-wider">
                        <th className="py-3 px-3 w-8"></th>
                        <th className="py-3 px-3">Merkezi Ürün Kartı</th>
                        <th className="py-3 px-3 text-right">Gelen Miktar</th>
                        <th className="py-3 px-3 text-right">Gelen Tutar</th>
                        <th className="py-3 px-3 text-right">Giden Miktar</th>
                        <th className="py-3 px-3 text-right">Giden Tutar</th>
                        <th className="py-3 px-3 text-right">Miktar Farkı</th>
                        <th className="py-3 px-3 text-right">Tutar Farkı</th>
                        <th className="py-3 px-3 text-right">Ort. Birim Fiyat</th>
                        <th className="py-3 px-3 text-center">Güven & Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredComparisonRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-slate-400">
                            Seçilen filtrelere uyan ürün karşılaştırması bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        paginatedComparisonRows.map((row: ProductComparisonRow) => {
                          const isExpanded = expandedRowId === row.centralProductId;
                          return (
                            <React.Fragment key={row.centralProductId}>
                              <tr
                                onClick={() =>
                                  setExpandedRowId(isExpanded ? null : row.centralProductId)
                                }
                                className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                              >
                                <td className="py-3 px-3 text-slate-400">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-indigo-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                                    <span>{row.productName}</span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                      {row.baseUnit}
                                    </span>
                                    {row.unitConflictWarning && (
                                      <span
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200"
                                        title={`Farklı birimler rastgele toplanmadı: ${row.unitBreakdownLabel}`}
                                      >
                                        Birim Farkı
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {row.incomingLines.length} gelen / {row.outgoingLines.length}{" "}
                                    giden kalem
                                    {row.varieties.length > 0 && (
                                      <span className="ml-1.5 text-indigo-700 font-semibold">
                                        • Çeşit: {row.varieties.join(", ")}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-blue-700">
                                  {row.incomingLines.length > 0
                                    ? formatQty(row.incomingQuantity, row.baseUnit)
                                    : "-"}
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-slate-800">
                                  {row.incomingLines.length > 0
                                    ? formatTL(row.incomingAmount)
                                    : "-"}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                                  {row.outgoingLines.length > 0
                                    ? formatQty(row.outgoingQuantity, row.baseUnit)
                                    : "-"}
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-slate-800">
                                  {row.outgoingLines.length > 0
                                    ? formatTL(row.outgoingAmount)
                                    : "-"}
                                </td>
                                <td
                                  className={`py-3 px-3 text-right font-mono font-bold ${
                                    row.quantityDifference > 0
                                      ? "text-indigo-700"
                                      : row.quantityDifference < 0
                                      ? "text-rose-600"
                                      : "text-slate-600"
                                  }`}
                                >
                                  {row.unitConflictWarning
                                    ? row.unitBreakdownLabel
                                    : formatQty(row.quantityDifference, row.baseUnit)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700">
                                  {formatTL(row.amountDifference)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-600">
                                  <div>Alış: {formatTL(row.incomingUnitPriceAvg)}</div>
                                  <div>Satış: {formatTL(row.outgoingUnitPriceAvg)}</div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      row.status === "matched"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : row.status === "needs_approval"
                                        ? "bg-amber-50 text-amber-800 border-amber-300"
                                        : row.status === "unmatched"
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    %{row.confidenceScore} •{" "}
                                    {row.status === "matched"
                                      ? "Eşleşti"
                                      : row.status === "needs_approval"
                                      ? "Onay Bekliyor"
                                      : row.status === "unmatched"
                                      ? "İnceleme"
                                      : row.status === "only_incoming"
                                      ? "Yalnızca Gelen"
                                      : "Yalnızca Giden"}
                                  </span>
                                </td>
                              </tr>

                              {/* Expanded Invoice Lines & Match Reasoning Panel */}
                              {isExpanded && (
                                <tr className="bg-slate-50/80">
                                  <td colSpan={10} className="p-4 border-t border-slate-200">
                                    <div className="space-y-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <div className="font-bold text-slate-800">
                                          Eşleştirme Analizi ve Orijinal Fatura Kalemleri (Orijinal metinler korunur)
                                        </div>
                                        {row.reasonSummary.length > 0 && (
                                          <div className="text-[11px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                                            {row.reasonSummary.join(" | ")}
                                          </div>
                                        )}
                                      </div>

                                      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                                        <table className="w-full text-[11px] border-collapse">
                                          <thead>
                                            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                                              <th className="py-2 px-2.5 text-left">Yön</th>
                                              <th className="py-2 px-2.5 text-left">Fatura No / Tarih</th>
                                              <th className="py-2 px-2.5 text-left">Firma</th>
                                              <th className="py-2 px-2.5 text-left">Orijinal Ürün Adı</th>
                                              <th className="py-2 px-2.5 text-left">Orijinal Açıklama</th>
                                              <th className="py-2 px-2.5 text-right">Miktar & Birim</th>
                                              <th className="py-2 px-2.5 text-right">Normalize</th>
                                              <th className="py-2 px-2.5 text-right">Net Tutar</th>
                                              <th className="py-2 px-2.5 text-left">Karar / İşlem</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {[...row.incomingLines, ...row.outgoingLines]
                                              .slice(0, 200)
                                              .map((line) => {
                                                const inv = invoiceById.get(line.invoiceId);
                                                const asg = row.assignments.find(
                                                  (a) => a.lineId === line.id
                                                );
                                                return (
                                                  <tr key={line.id} className="hover:bg-slate-50">
                                                    <td className="py-2 px-2.5">
                                                      <span
                                                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                                          line.direction === "incoming"
                                                            ? "bg-blue-100 text-blue-800"
                                                            : "bg-emerald-100 text-emerald-800"
                                                        }`}
                                                      >
                                                        {line.direction === "incoming"
                                                          ? "GELEN"
                                                          : "GİDEN"}
                                                      </span>
                                                    </td>
                                                    <td className="py-2 px-2.5 font-mono">
                                                      <div>{inv?.invoiceNo || inv?.fileName}</div>
                                                      <div className="text-[10px] text-slate-400">
                                                        {inv?.invoiceDate || "-"}
                                                      </div>
                                                    </td>
                                                    <td className="py-2 px-2.5 max-w-[160px] truncate">
                                                      {line.direction === "incoming"
                                                        ? inv?.sellerName || "-"
                                                        : inv?.buyerName || "-"}
                                                    </td>
                                                    <td className="py-2 px-2.5 font-semibold text-slate-900">
                                                      {line.originalProductName || (
                                                        <span className="italic text-amber-700">
                                                          (Boş — açıklamadan tespit)
                                                        </span>
                                                      )}
                                                    </td>
                                                    <td className="py-2 px-2.5 text-slate-600">
                                                      {line.originalDescription || "-"}
                                                    </td>
                                                    <td className="py-2 px-2.5 text-right font-mono">
                                                      {formatQty(line.quantity, line.unit)}
                                                    </td>
                                                    <td className="py-2 px-2.5 text-right font-mono font-bold text-indigo-700">
                                                      {formatQty(
                                                        line.measurement?.normalizedQuantity,
                                                        line.measurement?.normalizedBaseUnit
                                                      )}
                                                      {line.measurement?.conversionExplanation && (
                                                        <div className="text-[9px] text-slate-400 font-normal">
                                                          {line.measurement.conversionExplanation}
                                                        </div>
                                                      )}
                                                    </td>
                                                    <td className="py-2 px-2.5 text-right font-mono">
                                                      {formatTL(line.lineTotal)}
                                                    </td>
                                                    <td className="py-2 px-2.5">
                                                      <div className="flex flex-wrap items-center gap-1">
                                                        <select
                                                          value=""
                                                          onChange={(e) => {
                                                            const targetId = e.target.value;
                                                            if (!targetId) return;
                                                            if (targetId === "__NEW__") {
                                                              setPendingAssignLine(line);
                                                              setNewCardTitle(
                                                                line.features?.effectiveName || ""
                                                              );
                                                              setNewCardUnit(
                                                                line.measurement?.normalizedBaseUnit ||
                                                                  "KG"
                                                              );
                                                              setNewCardModalOpen(true);
                                                              return;
                                                            }
                                                            const target = report.centralProducts.find(
                                                              (c) => c.id === targetId
                                                            );
                                                            if (target) {
                                                              handleReassignLineToCard(
                                                                line,
                                                                target.id,
                                                                target.canonicalName
                                                              );
                                                            }
                                                          }}
                                                          className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 bg-white max-w-[140px]"
                                                        >
                                                          <option value="">Kart Değiştir...</option>
                                                          {report.centralProducts.map((c) => (
                                                            <option key={c.id} value={c.id}>
                                                              {c.canonicalName}
                                                            </option>
                                                          ))}
                                                          <option value="__NEW__">
                                                            + Yeni Merkezi Ürün Aç
                                                          </option>
                                                        </select>
                                                        {asg && asg.approvalStatus === "needs_approval" && (
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleApproveSuggestion(
                                                                line,
                                                                asg.suggestedProductId,
                                                                asg.suggestedProductName ||
                                                                  row.productName
                                                              );
                                                            }}
                                                            className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold"
                                                          >
                                                            Öneriyi Onayla
                                                          </button>
                                                        )}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                );
                                              }
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredComparisonRows.length > COMPARISON_PAGE_SIZE && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">
                      Toplam{" "}
                      <strong>{filteredComparisonRows.length.toLocaleString("tr-TR")}</strong>{" "}
                      ürün kartından{" "}
                      <strong>
                        {((comparisonPage - 1) * COMPARISON_PAGE_SIZE + 1).toLocaleString("tr-TR")}
                        –
                        {Math.min(
                          comparisonPage * COMPARISON_PAGE_SIZE,
                          filteredComparisonRows.length
                        ).toLocaleString("tr-TR")}
                      </strong>{" "}
                      arası gösteriliyor
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={comparisonPage <= 1}
                        onClick={() => setComparisonPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-semibold"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Önceki</span>
                      </button>
                      <span className="px-2 font-mono font-bold text-slate-800">
                        {comparisonPage} / {totalComparisonPages}
                      </span>
                      <button
                        type="button"
                        disabled={comparisonPage >= totalComparisonPages}
                        onClick={() =>
                          setComparisonPage((p) => Math.min(totalComparisonPages, p + 1))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-semibold"
                      >
                        <span>Sonraki</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* SUBTAB 2: USER APPROVAL, REJECT & MANUAL PAIRING QUEUE          */}
          {/* --------------------------------------------------------------- */}
          {activeSubTab === "review" && (
            <div className="space-y-5">
              {/* Manual Pairing Tool: Two specific lines = Same Product */}
              <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    İki Ürün Kalemini Manuel Olarak Aynı Ürün Tanımla & Kural Öğret
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Gelen Fatura Kalemi
                    </label>
                    <input
                      type="text"
                      value={pairIncomingSearch}
                      onChange={(e) => setPairIncomingSearch(e.target.value)}
                      placeholder="Gelen kalem filtrele..."
                      className="w-full px-2.5 py-1.5 mb-1 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-400"
                    />
                    <select
                      value={pairIncomingLineId}
                      onChange={(e) => setPairIncomingLineId(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                    >
                      <option value="">Seçiniz... (İlk {filteredPairingIncomingOptions.length})</option>
                      {filteredPairingIncomingOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Giden Fatura Kalemi
                    </label>
                    <input
                      type="text"
                      value={pairOutgoingSearch}
                      onChange={(e) => setPairOutgoingSearch(e.target.value)}
                      placeholder="Giden kalem filtrele..."
                      className="w-full px-2.5 py-1.5 mb-1 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-400"
                    />
                    <select
                      value={pairOutgoingLineId}
                      onChange={(e) => setPairOutgoingLineId(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                    >
                      <option value="">Seçiniz... (İlk {filteredPairingOutgoingOptions.length})</option>
                      {filteredPairingOutgoingOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Ortak Merkezi Ürün Kartı Adı
                    </label>
                    <input
                      type="text"
                      value={pairTargetCardName}
                      onChange={(e) => setPairTargetCardName(e.target.value)}
                      placeholder="Örn: Beyaz Peynir veya İspir Fasulyesi"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleManualPairTwoLines}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Birleştir & Öğret</span>
                  </button>
                </div>
              </div>

              {/* Suspicious & Unmatched Review Queue */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>
                      Şüpheli Eşleşmeler ve İnceleme Gerektiren Kalemler (
                      {report.suspiciousAssignments.length + report.unmatchedLines.length})
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-200">
                  {allReviewItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Tüm kalemler yüksek güvenle eşleştirildi veya onaylandı.
                    </div>
                  ) : (
                    paginatedReviewItems.map(
                      ({ line, invoice, assignment }) => (
                        <div
                          key={line.id}
                          className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  line.direction === "incoming"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {line.direction === "incoming" ? "GELEN" : "GİDEN"}
                              </span>
                              <span className="font-bold text-slate-900">
                                {line.originalProductName || "(Ürün Adı Boş)"}
                              </span>
                              {line.originalDescription && (
                                <span className="text-slate-500 italic">
                                  ({line.originalDescription})
                                </span>
                              )}
                              <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {formatQty(line.quantity, line.unit)} →{" "}
                                {formatQty(
                                  line.measurement?.normalizedQuantity,
                                  line.measurement?.normalizedBaseUnit
                                )}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                Güven: %{assignment.confidenceScore}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600">
                              Fatura: <strong>{invoice.invoiceNo || invoice.fileName}</strong> •{" "}
                              {assignment.matchReason}
                            </div>
                            {assignment.suggestedProductName && (
                              <div className="text-[11px] text-indigo-700 font-semibold">
                                Önerilen Eşleşme: &quot;{assignment.suggestedProductName}&quot;
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {assignment.suggestedProductName && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleApproveSuggestion(
                                    line,
                                    assignment.suggestedProductId,
                                    assignment.suggestedProductName!
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                              >
                                <Check className="w-3 h-3" />
                                <span>Onayla</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRejectAssignment(line)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold"
                            >
                              <X className="w-3 h-3" />
                              <span>Reddet</span>
                            </button>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                if (val === "__NEW__") {
                                  setPendingAssignLine(line);
                                  setNewCardTitle(line.features?.effectiveName || "");
                                  setNewCardUnit(
                                    line.measurement?.normalizedBaseUnit || "KG"
                                  );
                                  setNewCardModalOpen(true);
                                  return;
                                }
                                const card = report.centralProducts.find((c) => c.id === val);
                                if (card) {
                                  handleReassignLineToCard(line, card.id, card.canonicalName);
                                }
                              }}
                              className="px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white"
                            >
                              <option value="">Farklı Karta Bağla...</option>
                              {report.centralProducts.slice(0, 300).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.canonicalName}
                                </option>
                              ))}
                              <option value="__NEW__">+ Yeni Merkezi Ürün Oluştur</option>
                            </select>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>
                {allReviewItems.length > REVIEW_PAGE_SIZE && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">
                      Toplam{" "}
                      <strong>{allReviewItems.length.toLocaleString("tr-TR")}</strong>{" "}
                      inceleme kaleminden{" "}
                      <strong>
                        {((reviewPage - 1) * REVIEW_PAGE_SIZE + 1).toLocaleString("tr-TR")}
                        –
                        {Math.min(
                          reviewPage * REVIEW_PAGE_SIZE,
                          allReviewItems.length
                        ).toLocaleString("tr-TR")}
                      </strong>{" "}
                      arası gösteriliyor
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={reviewPage <= 1}
                        onClick={() => setReviewPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-semibold"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Önceki</span>
                      </button>
                      <span className="px-2 font-mono font-bold text-slate-800">
                        {reviewPage} / {totalReviewPages}
                      </span>
                      <button
                        type="button"
                        disabled={reviewPage >= totalReviewPages}
                        onClick={() =>
                          setReviewPage((p) => Math.min(totalReviewPages, p + 1))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-semibold"
                      >
                        <span>Sonraki</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* SUBTAB 3: USER-LEARNED MAPPING RULES                            */}
          {/* --------------------------------------------------------------- */}
          {activeSubTab === "learned_rules" && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-indigo-50/60 border-b border-indigo-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-indigo-950">
                    Kullanıcı Onaylı Öğrenilmiş Eşleştirme Kuralları
                  </h4>
                  <p className="text-[11px] text-indigo-700">
                    Yalnızca sizin hesabınız için eşleştirme kurallarını saklar; fatura veya
                    kalem verisi kaydetmez.
                  </p>
                </div>
                {learnedRules.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setLearnedRules([]);
                      showMessage("info", "Öğrenilmiş eşleştirme kuralları temizlendi.");
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Kuralları Sıfırla</span>
                  </button>
                )}
              </div>

              {learnedRules.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Henüz onaylanmış öğrenilmiş kural yok. Onayladığınız her eşleştirme sonraki
                  analizlerde otomatik olarak %99 güvenle uygulanır.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {learnedRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          &quot;{rule.sourceNameSample}&quot;{" "}
                          {rule.sourceDescriptionSample && (
                            <span className="font-normal text-slate-500">
                              ({rule.sourceDescriptionSample})
                            </span>
                          )}{" "}
                          →{" "}
                          <span className="text-indigo-700">
                            {rule.targetCentralProductName}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Kullanım: {rule.usageCount} kez • Güncelleme:{" "}
                          {new Date(rule.updatedAt).toLocaleString("tr-TR")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setLearnedRules((prev) => prev.filter((r) => r.id !== rule.id))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hidden Printable DOM for High-Resolution Turkish PDF Export (rendered only during PDF export, max 500 rows) */}
          {isExportingPdf && (
            <div className="fixed -left-[9999px] top-0 w-[210mm] bg-white z-[-1]">
            <div ref={pdfReportRef} className="p-8 bg-white text-slate-900 font-sans space-y-5">
              <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-end">
                <div>
                  <h1 className="text-lg font-black uppercase">
                    GELEN - GİDEN FATURA ÜRÜN KARŞILAŞTIRMA RAPORU
                  </h1>
                  <p className="text-xs text-slate-600">
                    Geçici Dosya Analizi Çıktısı • Tarih:{" "}
                    {new Date(report.generatedAt).toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div>Gelen: {report.summary.incomingInvoiceCount} Fatura</div>
                  <div>Giden: {report.summary.outgoingInvoiceCount} Fatura</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="p-2 border border-slate-300 rounded">
                  <div className="text-[10px] text-slate-500">Eşleşen Ürün</div>
                  <div className="font-bold text-sm">{report.summary.matchedProductCount}</div>
                </div>
                <div className="p-2 border border-slate-300 rounded">
                  <div className="text-[10px] text-slate-500">Şüpheli / Onay</div>
                  <div className="font-bold text-sm">{report.summary.needsReviewCount}</div>
                </div>
                <div className="p-2 border border-slate-300 rounded">
                  <div className="text-[10px] text-slate-500">Toplam Alış</div>
                  <div className="font-bold text-sm">
                    {formatTL(report.summary.totalIncomingAmount)}
                  </div>
                </div>
                <div className="p-2 border border-slate-300 rounded">
                  <div className="text-[10px] text-slate-500">Toplam Satış</div>
                  <div className="font-bold text-sm">
                    {formatTL(report.summary.totalOutgoingAmount)}
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-400 text-[10px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-400 p-1.5 text-left">Ürün</th>
                    <th className="border border-slate-400 p-1.5 text-right">Gelen Miktar</th>
                    <th className="border border-slate-400 p-1.5 text-right">Gelen Tutar</th>
                    <th className="border border-slate-400 p-1.5 text-right">Giden Miktar</th>
                    <th className="border border-slate-400 p-1.5 text-right">Giden Tutar</th>
                    <th className="border border-slate-400 p-1.5 text-right">Miktar Farkı</th>
                    <th className="border border-slate-400 p-1.5 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComparisonRows.slice(0, 500).map((row) => (
                    <tr key={row.centralProductId}>
                      <td className="border border-slate-300 p-1.5 font-semibold">
                        {row.productName}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right">
                        {row.incomingLines.length > 0
                          ? formatQty(row.incomingQuantity, row.baseUnit)
                          : "-"}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right">
                        {row.incomingLines.length > 0 ? formatTL(row.incomingAmount) : "-"}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right">
                        {row.outgoingLines.length > 0
                          ? formatQty(row.outgoingQuantity, row.baseUnit)
                          : "-"}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right">
                        {row.outgoingLines.length > 0 ? formatTL(row.outgoingAmount) : "-"}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-bold">
                        {row.unitConflictWarning
                          ? row.unitBreakdownLabel
                          : formatQty(row.quantityDifference, row.baseUnit)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center">
                        %{row.confidenceScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredComparisonRows.length > 500 && (
                <p className="text-[10px] text-slate-500 mt-2">
                  Not: PDF çıktısı performans amacıyla ilk 500 ürünü içerir; tüm{" "}
                  {filteredComparisonRows.length.toLocaleString("tr-TR")} satır için Excel İndir seçeneğini kullanın.
                </p>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Modal: Create New Central Product Card */}
      {newCardModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>Yeni Merkezi Ürün Kartı Oluştur</span>
              </h4>
              <button
                type="button"
                onClick={() => setNewCardModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Merkezi Ürün Adı
                </label>
                <input
                  type="text"
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  placeholder="Örn: İspir Şeker Fasulyesi"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Temel Ölçü Birimi
                </label>
                <select
                  value={newCardUnit}
                  onChange={(e) => setNewCardUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                >
                  <option value="KG">KG (Kilogram)</option>
                  <option value="LT">LT (Litre)</option>
                  <option value="ADET">ADET</option>
                  <option value="PAKET">PAKET</option>
                  <option value="KOLİ">KOLİ</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNewCardModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCreateNewCardForLine}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
              >
                Oluştur ve Bağla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
