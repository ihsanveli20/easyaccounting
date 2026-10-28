"use client";

import React, { useState, useMemo, useRef, ChangeEvent } from "react";
import {
  Scale,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  RotateCcw,
  Sparkles,
  Filter,
  Printer,
  ChevronRight,
  ArrowRight,
  Layers,
  Building2,
  Calendar,
  FileCheck2,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ExternalTransaction,
  InternalTransaction,
  ReconciliationPair,
  ReconciliationStatus,
} from "../types/reconciliation";
import { CompanyDetail, AccountRecord } from "../types/accounting";
import { formatCurrency, normalizeForSearch, parseExcelDate, parseTurkishAmount } from "../utils/excel";
import { parseSheetToRows } from "../utils/detailParser";
import {
  runReconciliation,
  exportReconciliationToExcel,
  extractEInvoiceNumbers,
  extractRefOrDocNo,
  SAMPLE_RECONCILIATION_EXTERNAL,
  SAMPLE_RECONCILIATION_INTERNAL,
} from "../utils/reconciliationEngine";
import * as XLSX from "xlsx";

interface ReconciliationViewProps {
  companies: CompanyDetail[];
  summaryRecords?: AccountRecord[];
}

export default function ReconciliationView({
  companies,
  summaryRecords = [],
}: ReconciliationViewProps) {
  // External Statement (Firmanın gönderdiği ekstreler - PDF veya Excel)
  const [externalTransactions, setExternalTransactions] = useState<ExternalTransaction[]>([]);
  const [uploadedPdfFiles, setUploadedPdfFiles] = useState<{ name: string; pages: number; txCount: number }[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);

  // Internal Statement (Bizim Luca'dan çektiğimiz ekstre / muavin - çoklu dosya desteği)
  const [internalTransactions, setInternalTransactions] = useState<InternalTransaction[]>([]);
  const [uploadedLucaFiles, setUploadedLucaFiles] = useState<{
    name: string;
    pages?: number;
    txCount: number;
    type: "excel" | "pdf";
  }[]>([]);
  const [selectedInternalCompanyName, setSelectedInternalCompanyName] = useState<string>("");
  const [lucaFileName, setLucaFileName] = useState<string>("");
  const [isProcessingLuca, setIsProcessingLuca] = useState(false);
  const [lucaError, setLucaError] = useState<string | null>(null);
  const [isDraggingLuca, setIsDraggingLuca] = useState(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<ReconciliationStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const lucaInputRef = useRef<HTMLInputElement>(null);

  // Handle uploading 1 or multiple PDF files (external statements)
  const handlePdfUpload = async (files: FileList | File[]) => {
    setPdfError(null);
    setIsProcessingPdf(true);

    try {
      const formData = new FormData();
      let hasPdf = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith(".pdf")) {
          formData.append("files", file);
          hasPdf = true;
        } else if (file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)) {
          // If company sent Excel statement
          await parseExternalExcelFile(file);
        }
      }

      if (hasPdf) {
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });

        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || "PDF dosyaları okunamadı.");
        }

        setUploadedPdfFiles((prev) => [...prev, ...(json.files || [])]);
        setExternalTransactions((prev) => [...prev, ...(json.transactions || [])]);
      }
    } catch (err: any) {
      setPdfError(err.message || "PDF yüklenirken bir hata oluştu.");
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Helper to extract External transaction from Excel row with flexible column mapping
  const extractExternalTxFromRow = (
    r: Record<string, any>,
    fileName: string,
    idx: number
  ): ExternalTransaction | null => {
    // 1. Date matching (Prefer transaction/doc date over due date 'vade')
    let rawDate = "";
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (norm.includes("evrak tarihi") || norm.includes("islem tarihi")) {
        rawDate = r[k];
        break;
      }
    }
    if (!rawDate) {
      for (const k of Object.keys(r)) {
        const norm = normalizeForSearch(k);
        if (norm.includes("tarih") && !norm.includes("vade")) {
          rawDate = r[k];
          break;
        }
      }
    }
    if (!rawDate && Object.values(r).length > 0) {
      rawDate = Object.values(r)[0];
    }
    const dateVal = parseExcelDate(rawDate);
    if (!dateVal) return null;

    // 2. Amounts matching
    let rawDebit = 0;
    let rawCredit = 0;
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (norm === "borc" || norm.includes("borc tutar") || norm.includes("borc tl")) {
        rawDebit = r[k];
      } else if (norm === "alacak" || norm.includes("alacak tutar") || norm.includes("alacak tl")) {
        rawCredit = r[k];
      }
    }
    const debit = parseTurkishAmount(rawDebit);
    const credit = parseTurkishAmount(rawCredit);
    if (debit === 0 && credit === 0) return null;

    // 3. Document Number (Prioritize Referans No / Evrak No / Fatura No)
    let docNo = "";
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (
        norm.includes("referans no") ||
        norm.includes("evrak no") ||
        norm.includes("fatura no") ||
        norm.includes("belge no") ||
        norm.includes("ref no")
      ) {
        const val = String(r[k] || "").trim();
        if (val) {
          docNo = val;
          break;
        }
      }
    }
    if (!docNo) {
      for (const k of Object.keys(r)) {
        const norm = normalizeForSearch(k);
        if (norm.includes("mira no") || norm.includes("sira no") || norm.includes("fis no")) {
          const val = String(r[k] || "").trim();
          if (val) {
            docNo = val;
            break;
          }
        }
      }
    }

    // 4. Description & Type
    let desc = "";
    let txType = "Ekstre Hareketi";
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (norm.includes("aciklama") || norm.includes("islem aciklamasi")) {
        desc = String(r[k] || "").trim();
      } else if (norm.includes("evrak tipi") || norm.includes("islem tipi")) {
        txType = String(r[k] || "").trim();
      }
    }

    let year: number | undefined;
    const ym = dateVal.match(/\d{4}/);
    if (ym) year = parseInt(ym[0], 10);

    // Extract clean 16-character e-fatura number or slip/ref code if embedded in docNo or description
    const eInvsDoc = extractEInvoiceNumbers(docNo);
    if (eInvsDoc.length > 0) {
      docNo = eInvsDoc[0];
    } else {
      const eInvsDesc = extractEInvoiceNumbers(desc);
      if (eInvsDesc.length > 0 && (!docNo || /^\d{1,6}$/.test(docNo))) {
        docNo = eInvsDesc[0];
      } else {
        const refOrDoc = extractRefOrDocNo(docNo, desc, year);
        if (refOrDoc && (!docNo || docNo === "-" || /^\d{1,6}$/.test(docNo))) {
          docNo = refOrDoc;
        }
      }
    }

    return {
      id: `ext-xl-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      date: dateVal,
      year,
      docNo: docNo || undefined,
      type: txType || "Ekstre Hareketi",
      description: desc || "İşlem",
      debit,
      credit,
      sourceFile: fileName,
    };
  };

  // Parse External Excel if company sent .xlsx/.xls/.csv instead of PDF
  const parseExternalExcelFile = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary", cellDates: false });
          const parsed: ExternalTransaction[] = [];

          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const { rows } = parseSheetToRows(sheet);
            rows.forEach((r, idx) => {
              const tx = extractExternalTxFromRow(r, file.name, idx);
              if (tx) parsed.push(tx);
            });
          });

          setExternalTransactions((prev) => [...prev, ...parsed]);
          setUploadedPdfFiles((prev) => [
            ...prev,
            { name: file.name, pages: 1, txCount: parsed.length },
          ]);
        } catch {
          // ignore
        }
        resolve();
      };
      reader.readAsBinaryString(file);
    });
  };

  // Helper to extract Luca transaction from row with flexible column name matching
  const extractLucaTxFromRow = (
    r: Record<string, any>,
    fileName: string,
    idx: number
  ): InternalTransaction | null => {
    // 1. Date matching
    let rawDate = "";
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (norm.includes("evrak tarihi") || norm.includes("islem tarihi")) {
        rawDate = r[k];
        break;
      }
    }
    if (!rawDate) {
      for (const k of Object.keys(r)) {
        const norm = normalizeForSearch(k);
        if (norm.includes("tarih") && !norm.includes("vade")) {
          rawDate = r[k];
          break;
        }
      }
    }
    if (!rawDate && Object.values(r).length > 0) {
      rawDate = Object.values(r)[0];
    }
    const dateVal = parseExcelDate(rawDate);
    if (!dateVal) return null;

    // 2. Amounts matching
    let rawDebit = 0;
    let rawCredit = 0;
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (norm === "borc" || norm.includes("borc tutar") || norm.includes("borc tl")) {
        rawDebit = r[k];
      } else if (norm === "alacak" || norm.includes("alacak tutar") || norm.includes("alacak tl")) {
        rawCredit = r[k];
      }
    }
    const debit = parseTurkishAmount(rawDebit);
    const credit = parseTurkishAmount(rawCredit);
    if (debit === 0 && credit === 0) return null;

    // 3. Document Number - Prioritize true Invoice/Evrak No (NY22026000003416) over journal Fiş No
    let docNo = "";
    // First pass: Evrak No, Fatura No, Referans No
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (
        norm.includes("evrak no") ||
        norm.includes("fatura no") ||
        norm.includes("referans no") ||
        norm.includes("belge no") ||
        norm.includes("ref no")
      ) {
        const val = String(r[k] || "").trim();
        if (val) {
          docNo = val;
          break;
        }
      }
    }
    // Second pass fallback: Fiş No / Yevmiye No (only if no Evrak No found)
    if (!docNo) {
      for (const k of Object.keys(r)) {
        const norm = normalizeForSearch(k);
        if (norm.includes("fis no") || norm.includes("yevmiye no")) {
          const val = String(r[k] || "").trim();
          if (val) {
            docNo = val;
            break;
          }
        }
      }
    }

    // 4. Description
    let desc = "";
    for (const k of Object.keys(r)) {
      const norm = normalizeForSearch(k);
      if (
        norm.includes("fis aciklama") ||
        norm.includes("aciklama") ||
        norm.includes("islem aciklamasi") ||
        norm.includes("hesap adi")
      ) {
        desc = String(r[k] || "").trim();
        break;
      }
    }

    let year: number | undefined;
    const ym = dateVal.match(/\d{4}/);
    if (ym) year = parseInt(ym[0], 10);

    // Extract clean 16-character e-fatura number or slip/ref code if embedded in docNo or description
    const eInvsDoc = extractEInvoiceNumbers(docNo);
    if (eInvsDoc.length > 0) {
      docNo = eInvsDoc[0];
    } else {
      const eInvsDesc = extractEInvoiceNumbers(desc);
      if (eInvsDesc.length > 0 && (!docNo || /^\d{1,6}$/.test(docNo))) {
        docNo = eInvsDesc[0];
      } else {
        const refOrDoc = extractRefOrDocNo(docNo, desc, year);
        if (refOrDoc && (!docNo || docNo === "-" || /^\d{1,6}$/.test(docNo))) {
          docNo = refOrDoc;
        }
      }
    }

    return {
      id: `int-xl-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      date: dateVal,
      year,
      docNo: docNo || undefined,
      type: "Luca Hareketi",
      description: desc || "Luca Kaydı",
      debit,
      credit,
      sourceFile: fileName,
    };
  };

  // Parse a single Luca Excel file (.xlsx, .xls, .csv)
  const parseLucaExcelFile = (file: File): Promise<InternalTransaction[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary", cellDates: false });
          const txs: InternalTransaction[] = [];

          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const { rows } = parseSheetToRows(sheet);
            rows.forEach((r, idx) => {
              const tx = extractLucaTxFromRow(r, file.name, idx);
              if (tx) txs.push(tx);
            });
          });

          resolve(txs);
        } catch {
          resolve([]);
        }
      };
      reader.onerror = () => resolve([]);
      reader.readAsBinaryString(file);
    });
  };

  // Handle uploading 1 or MULTIPLE Luca files (Excel or PDF or mix)
  const handleLucaFilesUpload = async (files: FileList | File[]) => {
    setLucaError(null);
    setIsProcessingLuca(true);

    try {
      const pdfFiles: File[] = [];
      const excelFiles: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".pdf")) {
          pdfFiles.push(file);
        } else if (lower.match(/\.(xlsx|xls|csv)$/)) {
          excelFiles.push(file);
        }
      }

      const newTransactions: InternalTransaction[] = [];
      const newFilesInfo: {
        name: string;
        pages?: number;
        txCount: number;
        type: "excel" | "pdf";
      }[] = [];

      // 1. Process all Excel files
      for (const ef of excelFiles) {
        const txs = await parseLucaExcelFile(ef);
        newTransactions.push(...txs);
        newFilesInfo.push({
          name: ef.name,
          pages: 1,
          txCount: txs.length,
          type: "excel",
        });
      }

      // 2. Process all PDF files via API
      if (pdfFiles.length > 0) {
        const formData = new FormData();
        pdfFiles.forEach((f) => formData.append("files", f));

        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || "Luca PDF dosyaları okunamadı.");
        }

        if (json.transactions) {
          const pdfTxs: InternalTransaction[] = json.transactions.map((t: any) => ({
            id: t.id,
            date: t.date,
            year: t.year,
            docNo: t.docNo,
            type: t.type || "Luca Hareketi",
            description: t.description,
            debit: t.debit,
            credit: t.credit,
            balance: t.balance,
            sourceFile: t.sourceFile,
          }));
          newTransactions.push(...pdfTxs);
        }

        if (json.files) {
          json.files.forEach((f: any) => {
            newFilesInfo.push({
              name: f.name,
              pages: f.pages,
              txCount: f.txCount,
              type: "pdf",
            });
          });
        }
      }

      if (newTransactions.length === 0 && files.length > 0) {
        setLucaError("Seçilen dosyalarda geçerli işlem satırı tespit edilemedi.");
      }

      setInternalTransactions((prev) => {
        const combined = [...prev, ...newTransactions];
        return combined.sort((a, b) => {
          const keyA = a.date.split(".").reverse().join("");
          const keyB = b.date.split(".").reverse().join("");
          return keyA.localeCompare(keyB);
        });
      });

      setUploadedLucaFiles((prev) => [...prev, ...newFilesInfo]);

      if (!selectedInternalCompanyName) {
        if (newFilesInfo.length === 1) {
          setSelectedInternalCompanyName(newFilesInfo[0].name.replace(/\.[^/.]+$/, ""));
          setLucaFileName(newFilesInfo[0].name);
        } else if (newFilesInfo.length > 1) {
          setSelectedInternalCompanyName(`${newFilesInfo.length} Luca Dosyası`);
          setLucaFileName(`${newFilesInfo.length} Dosya`);
        }
      }
    } catch (err: any) {
      setLucaError(err.message || "Luca dosyaları yüklenirken hata oluştu.");
    } finally {
      setIsProcessingLuca(false);
    }
  };

  // Remove individual Luca file
  const handleRemoveLucaFile = (fileName: string) => {
    setUploadedLucaFiles((prev) => prev.filter((f) => f.name !== fileName));
    setInternalTransactions((prev) => prev.filter((t) => t.sourceFile !== fileName));
  };

  // Remove individual External file
  const handleRemoveExternalFile = (fileName: string) => {
    setUploadedPdfFiles((prev) => prev.filter((f) => f.name !== fileName));
    setExternalTransactions((prev) => prev.filter((t) => t.sourceFile !== fileName));
  };

  // Select internal company from loaded companies in tab 2
  const handleSelectInternalCompany = (compName: string) => {
    setSelectedInternalCompanyName(compName);
    const targetComp = companies.find((c) => c.name === compName);
    if (targetComp) {
      const internals: InternalTransaction[] = targetComp.transactions.map((t) => {
        let year: number | undefined;
        const ym = t.date.match(/\d{4}/);
        if (ym) year = parseInt(ym[0], 10);

        return {
          id: t.id,
          date: t.date,
          year,
          docNo: t.docNo,
          type: t.type,
          description: t.description,
          debit: t.debit,
          credit: t.credit,
          balance: t.balance,
          sourceFile: targetComp.sourceFile || "Sistem Muavin Kaydı",
        };
      });
      setInternalTransactions(internals);
      setLucaFileName(targetComp.name);
      setUploadedLucaFiles([
        {
          name: targetComp.sourceFile || `${targetComp.name}.xlsx`,
          pages: 1,
          txCount: internals.length,
          type: "excel",
        },
      ]);
    }
  };

  // Load realistic sample reconciliation data
  const loadSampleReconciliation = () => {
    setExternalTransactions(SAMPLE_RECONCILIATION_EXTERNAL);
    setUploadedPdfFiles([
      { name: "Firma_2024_Ekstre.pdf", pages: 3, txCount: 5 },
      { name: "Firma_2025_Ekstre.pdf", pages: 4, txCount: 4 },
    ]);
    setInternalTransactions(SAMPLE_RECONCILIATION_INTERNAL);
    setSelectedInternalCompanyName("Anadolu Dağıtım Ltd. (Luca Kayıtları)");
    setLucaFileName("Luca_Muavin_2024_2025.xlsx");
    setUploadedLucaFiles([
      { name: "Luca_2024_Muavin.xlsx", pages: 1, txCount: 4, type: "excel" },
      { name: "Luca_2025_Muavin.xlsx", pages: 1, txCount: 3, type: "excel" },
    ]);
    setPdfError(null);
    setLucaError(null);
  };

  // Clear all reconciliation data
  const handleResetReconciliation = () => {
    setExternalTransactions([]);
    setUploadedPdfFiles([]);
    setInternalTransactions([]);
    setUploadedLucaFiles([]);
    setSelectedInternalCompanyName("");
    setLucaFileName("");
    setPdfError(null);
    setLucaError(null);
  };

  // Run reconciliation algorithm
  const { pairs, summary } = useMemo(() => {
    return runReconciliation(externalTransactions, internalTransactions);
  }, [externalTransactions, internalTransactions]);

  // Extract all distinct years available in the datasets
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    pairs.forEach((p) => {
      if (p.external?.year) years.add(String(p.external.year));
      if (p.internal?.year) years.add(String(p.internal.year));
    });
    return Array.from(years).sort();
  }, [pairs]);

  // Filtered reconciliation pairs
  const filteredPairs = useMemo(() => {
    const q = normalizeForSearch(searchQuery);

    return pairs.filter((p) => {
      // 1. Status Filter
      if (statusFilter !== "all" && p.status !== statusFilter) {
        return false;
      }

      // 2. Year Filter
      if (yearFilter !== "all") {
        const extY = p.external?.year ? String(p.external.year) : "";
        const intY = p.internal?.year ? String(p.internal.year) : "";
        if (extY !== yearFilter && intY !== yearFilter) {
          return false;
        }
      }

      // 3. Search query
      if (q) {
        const extDesc = normalizeForSearch(p.external?.description || "");
        const extDoc = normalizeForSearch(p.external?.docNo || "");
        const intDesc = normalizeForSearch(p.internal?.description || "");
        const intDoc = normalizeForSearch(p.internal?.docNo || "");
        const extAmt = String(p.external?.debit || p.external?.credit || "");
        const intAmt = String(p.internal?.debit || p.internal?.credit || "");

        const matches =
          extDesc.includes(q) ||
          extDoc.includes(q) ||
          intDesc.includes(q) ||
          intDoc.includes(q) ||
          extAmt.includes(q) ||
          intAmt.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [pairs, statusFilter, yearFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* Error notification banner */}
      {pdfError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Hata: </span>
            {pdfError}
          </div>
          <button
            onClick={() => setPdfError(null)}
            className="text-rose-500 hover:text-rose-700 p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. DUAL UPLOAD / SETUP BOXES (PDF Ekstreler vs Luca Listesi)              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Box: External Statements (Firmadan Gelen Ekstreler - Çoklu PDF / Yıllar) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingExternal(true);
          }}
          onDragLeave={() => setIsDraggingExternal(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingExternal(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handlePdfUpload(e.dataTransfer.files);
            }
          }}
          className={`bg-white border-2 border-dashed rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between transition-all ${
            isDraggingExternal
              ? "border-rose-500 bg-rose-50/40"
              : "border-rose-200 hover:border-rose-400"
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    1. Firmanın Bize Gönderdiği Ekstreler
                  </h3>
                  <p className="text-xs text-slate-500">
                    Birden fazla PDF (yıla göre) veya tek bir çok sayfalı PDF yükleyin
                  </p>
                </div>
              </div>

              {externalTransactions.length > 0 && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  {externalTransactions.length} Hareket
                </span>
              )}
            </div>

            {/* List of uploaded PDF files */}
            {uploadedPdfFiles.length > 0 && (
              <div className="mb-4 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {uploadedPdfFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-rose-50/60 border border-rose-200 text-xs text-slate-700 group"
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0 mr-2">
                      <FileCheck2 className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="font-medium truncate" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-500">
                        {f.pages} Sayfa •{" "}
                        <strong className="text-rose-700">{f.txCount} İşlem</strong>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveExternalFile(f.name);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded-md transition-colors"
                        title="Bu dosyayı kaldır"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Area */}
            <div
              onClick={() => pdfInputRef.current?.click()}
              className="py-5 px-4 rounded-2xl bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-rose-300 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
            >
              <input
                ref={pdfInputRef}
                type="file"
                multiple
                accept=".pdf, .xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handlePdfUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="hidden"
              />
              <UploadCloud className="w-6 h-6 text-rose-500" />
              <span className="text-xs font-semibold text-slate-800">
                {isProcessingPdf
                  ? "PDF Dosyaları Çözümleniyor..."
                  : "+ PDF veya Excel Ekstrelerini Seçin / Sürükleyin"}
              </span>
              <span className="text-[11px] text-slate-400">
                (Birden fazla PDF seçebilirsiniz: 2024.pdf, 2025.pdf vb.)
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-4">
            <span>
              {externalTransactions.length > 0
                ? `${uploadedPdfFiles.length} dosya yüklendi`
                : "Henüz firma ekstresi yüklenmedi"}
            </span>
            {externalTransactions.length > 0 && (
              <button
                onClick={() => {
                  setExternalTransactions([]);
                  setUploadedPdfFiles([]);
                }}
                className="text-rose-600 hover:underline flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Ekstreleri Temizle
              </button>
            )}
          </div>
        </div>

        {/* Right Box: Our Luca Records (Bizim Luca'dan Çektiğimiz Kayıtlar - Çoklu Dosya Destekli) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingLuca(true);
          }}
          onDragLeave={() => setIsDraggingLuca(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingLuca(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleLucaFilesUpload(e.dataTransfer.files);
            }
          }}
          className={`bg-white border-2 border-dashed rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between transition-all ${
            isDraggingLuca
              ? "border-sky-500 bg-sky-50/40"
              : "border-sky-200 hover:border-sky-400"
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    2. Bizim Luca'dan Çektiğimiz Liste
                  </h3>
                  <p className="text-xs text-slate-500">
                    Luca'dan aldığınız 1 veya birden fazla Excel / PDF dosyasını yükleyin
                  </p>
                </div>
              </div>

              {internalTransactions.length > 0 && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  {internalTransactions.length} Kayıt
                </span>
              )}
            </div>

            {/* Quick Option 1: Select from already loaded companies */}
            {companies.length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mevcut Yüklenen Firmalardan Hızlıca Seç:
                </label>
                <select
                  value={selectedInternalCompanyName}
                  onChange={(e) => handleSelectInternalCompany(e.target.value)}
                  className="w-full text-xs font-medium py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-slate-800"
                >
                  <option value="">(Seçiniz...)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} {c.code ? `(${c.code})` : ""} - {c.transactions.length} Kayıt
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* List of uploaded Luca files */}
            {uploadedLucaFiles.length > 0 && (
              <div className="mb-3 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {uploadedLucaFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-sky-50/60 border border-sky-200 text-xs text-slate-700 group"
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0 mr-2">
                      {f.type === "pdf" ? (
                        <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span className="font-medium truncate" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-sky-700 bg-white/80 px-2 py-0.5 rounded-md border border-sky-200">
                        {f.txCount} Kayıt
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveLucaFile(f.name);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded-md transition-colors"
                        title="Bu dosyayı kaldır"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Option 2: Upload new Luca Excel or PDF (Multiple support) */}
            <div
              onClick={() => lucaInputRef.current?.click()}
              className="py-5 px-4 rounded-2xl bg-slate-50 hover:bg-sky-50/40 border border-slate-200 hover:border-sky-300 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
            >
              <input
                ref={lucaInputRef}
                type="file"
                multiple
                accept=".xlsx, .xls, .csv, .pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleLucaFilesUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="hidden"
              />
              <UploadCloud className="w-6 h-6 text-sky-500" />
              <span className="text-xs font-semibold text-slate-800">
                {isProcessingLuca
                  ? "Luca Dosyaları Çözümleniyor..."
                  : "+ Luca Excel veya PDF Dosyalarını Seçin / Sürükleyin"}
              </span>
              <span className="text-[11px] text-slate-400">
                (Birden fazla dosya seçebilirsiniz: 2024_muavin.xlsx, 2025_muavin.xlsx vb.)
              </span>
            </div>

            {/* Error Message for Luca upload if any */}
            {lucaError && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{lucaError}</span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-4">
            <span className="truncate">
              {internalTransactions.length > 0
                ? `${uploadedLucaFiles.length > 0 ? `${uploadedLucaFiles.length} Luca dosyası yüklendi` : selectedInternalCompanyName || "Luca Verileri Yüklendi"}`
                : "Henüz Luca verisi seçilmedi"}
            </span>
            {internalTransactions.length > 0 && (
              <button
                onClick={() => {
                  setInternalTransactions([]);
                  setUploadedLucaFiles([]);
                  setSelectedInternalCompanyName("");
                  setLucaFileName("");
                  setLucaError(null);
                }}
                className="text-rose-600 hover:underline flex items-center gap-1 font-medium shrink-0 ml-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Luca Kayıtlarını Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Demo helper action bar */}
      {externalTransactions.length === 0 && internalTransactions.length === 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950">
                Elinizde henüz hazır ekstre yok mu?
              </h4>
              <p className="text-xs text-amber-800">
                2024 ve 2025 yıllarını içeren hazır örnek ekstre ve Luca mizan verisiyle mutabakat farklarını hemen test edin.
              </p>
            </div>
          </div>
          <button
            onClick={loadSampleReconciliation}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-sm shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>Örnek Mutabakat Verisi Yükle</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. RECONCILIATION SUMMARY DASHBOARD (Mutabakat Durum Özeti)               */}
      {/* ========================================================================= */}
      {(externalTransactions.length > 0 || internalTransactions.length > 0) && (
        <>
          {/* Big Highlight Status Card */}
          <div
            className={`p-5 sm:p-6 rounded-3xl border shadow-sm transition-all ${
              summary.isFullyReconciled
                ? "bg-gradient-to-br from-emerald-500/10 via-white to-teal-50 border-emerald-300"
                : "bg-gradient-to-br from-rose-500/10 via-white to-amber-50 border-rose-300"
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 ${
                    summary.isFullyReconciled
                      ? "bg-emerald-600 shadow-emerald-500/20"
                      : "bg-rose-600 shadow-rose-500/20"
                  }`}
                >
                  {summary.isFullyReconciled ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <Scale className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                      {summary.isFullyReconciled
                        ? "Cari Hesap Birebir Mutabık!"
                        : "Mutabakat Farkı ve Eksik Kayıtlar Var!"}
                    </h2>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        summary.isFullyReconciled
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-rose-100 text-rose-800 border-rose-300"
                      }`}
                    >
                      {summary.isFullyReconciled ? "Tam Eşleşme" : "Uyuşmazlık Mevcut"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {summary.isFullyReconciled
                      ? "Firmanın gönderdiği ekstre ile Luca kayıtlarımızdaki tüm tutarlar ve bakiyeler kuruşu kuruşuna eşleşiyor."
                      : `Aşağıdaki tabloda bizde eksik olan (${summary.missingInLucaCount}), firmada eksik olan (${summary.missingInExternalCount}) veya tutar farkı (${summary.amountMismatchCount}) bulunan kayıtları inceleyebilirsiniz.`}
                  </p>
                </div>
              </div>

              {/* Balances Comparison Pillar */}
              <div className="flex flex-wrap items-center gap-3 border-t lg:border-t-0 pt-3 lg:pt-0">
                <div className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Firma Ekstre Sonu Bakiyesi
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                    {formatCurrency(Math.abs(summary.externalBalance))}
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">
                    {summary.externalBalance > 0
                      ? "Borç Bakiyesi (B)"
                      : summary.externalBalance < 0
                      ? "Alacak Bakiyesi (A)"
                      : "0,00 ₺ (Kapalı)"}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Bizim Luca Bakiyemiz
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                    {formatCurrency(Math.abs(summary.internalBalance))}
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">
                    {summary.internalBalance < 0
                      ? "Alacak Bakiyesi (A)"
                      : summary.internalBalance > 0
                      ? "Borç Bakiyesi (B)"
                      : "0,00 ₺ (Kapalı)"}
                  </span>
                </div>

                <div
                  className={`px-4 py-2.5 rounded-2xl border shadow-2xs ${
                    Math.abs(summary.netDiscrepancy) <= 0.05
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-rose-50 border-rose-300"
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Net Mutabakat Farkı
                  </div>
                  <div
                    className={`text-lg sm:text-xl font-extrabold tabular-nums ${
                      Math.abs(summary.netDiscrepancy) <= 0.05
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {formatCurrency(Math.abs(summary.netDiscrepancy))}
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      Math.abs(summary.netDiscrepancy) <= 0.05
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {Math.abs(summary.netDiscrepancy) <= 0.05
                      ? "✓ Tam Mutabık (Fark Yok)"
                      : summary.netDiscrepancy > 0
                      ? "Firma Ekstresinde Fazla / Bizde Eksik"
                      : "Bizim Luca'da Fazla / Firmada Eksik"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1: Bizde Eksik (Luca'da Olmayanlar) */}
            <div
              onClick={() => setStatusFilter("missing_in_luca")}
              className={`p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                statusFilter === "missing_in_luca"
                  ? "border-rose-500 ring-2 ring-rose-500/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                  Bizde Eksik (Luca'da Yok)
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              </div>
              <div className="text-2xl font-bold text-rose-700 tracking-tight">
                {summary.missingInLucaCount} Kayıt
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Firma ekstresinde var, Luca'ya işlenmemiş
              </div>
            </div>

            {/* 2: Firmada Eksik (Ekstrede Olmayanlar) */}
            <div
              onClick={() => setStatusFilter("missing_in_external")}
              className={`p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                statusFilter === "missing_in_external"
                  ? "border-amber-500 ring-2 ring-amber-500/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  Firmada Eksik (Ekstrede Yok)
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              </div>
              <div className="text-2xl font-bold text-amber-700 tracking-tight">
                {summary.missingInExternalCount} Kayıt
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Bizde işlenmiş, firmanın ekstresinde yok
              </div>
            </div>

            {/* 3: Tutar Farkı Olanlar */}
            <div
              onClick={() => setStatusFilter("amount_mismatch")}
              className={`p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                statusFilter === "amount_mismatch"
                  ? "border-orange-500 ring-2 ring-orange-500/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold text-orange-700 uppercase tracking-wider">
                  Tutar Uyuşmazlığı
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              </div>
              <div className="text-2xl font-bold text-orange-700 tracking-tight">
                {summary.amountMismatchCount} Kayıt
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Evrak no aynı fakat tutar farklı
              </div>
            </div>

            {/* 4: Tam Eşleşenler */}
            <div
              onClick={() => setStatusFilter("matched")}
              className={`p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                statusFilter === "matched"
                  ? "border-emerald-500 ring-2 ring-emerald-500/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                  Tam Eşleşenler
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-2xl font-bold text-emerald-700 tracking-tight">
                {summary.matchedCount} Kayıt
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Tarih, evrak no ve tutar birebir aynı
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. TOOLBAR: FILTERS, YEAR, SEARCH & EXPORT                                */}
          {/* ========================================================================= */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Fatura No, Açıklama veya Tutara göre filtreleyin..."
                  className="w-full pl-10 pr-9 py-2 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-slate-800 placeholder-slate-400 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                    statusFilter === "all"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Tümü ({pairs.length})
                </button>
                <button
                  onClick={() => setStatusFilter("missing_in_luca")}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                    statusFilter === "missing_in_luca"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  🔴 Bizde Eksik ({summary.missingInLucaCount})
                </button>
                <button
                  onClick={() => setStatusFilter("missing_in_external")}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                    statusFilter === "missing_in_external"
                      ? "bg-amber-600 text-white shadow-2xs"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  🟡 Firmada Eksik ({summary.missingInExternalCount})
                </button>
                <button
                  onClick={() => setStatusFilter("amount_mismatch")}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                    statusFilter === "amount_mismatch"
                      ? "bg-orange-600 text-white shadow-2xs"
                      : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                  }`}
                >
                  🟠 Tutar Farkı ({summary.amountMismatchCount})
                </button>
                <button
                  onClick={() => setStatusFilter("matched")}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                    statusFilter === "matched"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  🟢 Eşleşenler ({summary.matchedCount})
                </button>
              </div>

              {/* Year Filter */}
              {availableYears.length > 1 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-slate-500 font-medium">Yıl:</span>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="all">Tüm Yıllar</option>
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr} Yılı
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    exportReconciliationToExcel(
                      filteredPairs,
                      summary,
                      selectedInternalCompanyName || "Firma"
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                  title="Fark ve eşleşme listesini Excel raporu olarak indir"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Rapor İndir (Excel)</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                  title="Mutabakat tablosunu yazdır"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Yazdır</span>
                </button>
              </div>
            </div>
          </div>

          {/* Reciprocal matching rule notification pill */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-sky-50/60 border border-sky-100 rounded-xl px-3.5 py-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sky-800">⚖️ Çift Taraflı Muhasebe Kuralı:</span>
              <span className="text-slate-700">
                Onlardaki <strong className="text-emerald-700">Alacak (A)</strong> = Bizde <strong className="text-rose-700">Borç (B)</strong> &bull; Onlardaki <strong className="text-rose-700">Borç (B)</strong> = Bizde <strong className="text-emerald-700">Alacak (A)</strong> olarak birebir eşleşir.
              </span>
            </div>
            <span className="text-slate-400 hidden sm:inline">Toplam {filteredPairs.length} satır</span>
          </div>

          {/* ========================================================================= */}
          {/* 4. UNIFIED COMPARISON & DISCREPANCY TABLE                                */}
          {/* ========================================================================= */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider select-none text-[11px]">
                    <th className="py-3 px-3 text-center w-10 text-slate-400">#</th>
                    <th className="py-3 px-3 w-40 text-center">Mutabakat Durumu</th>
                    <th className="py-3 px-3 border-l border-slate-200 bg-rose-50/40 text-rose-900" colSpan={4}>
                      📄 Firmanın Gönderdiği Ekstre (PDF / Excel)
                    </th>
                    <th className="py-3 px-3 border-l border-slate-200 bg-sky-50/40 text-sky-900" colSpan={4}>
                      📑 Bizim Luca Kayıtlarımız
                    </th>
                    <th className="py-3 px-3 border-l border-slate-200 text-right w-28">Fark (TL)</th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] select-none">
                    <th></th>
                    <th></th>
                    {/* External columns */}
                    <th className="py-2 px-2.5 border-l border-slate-200 w-24">Tarih</th>
                    <th className="py-2 px-2.5 w-28">Evrak No</th>
                    <th className="py-2 px-2.5">Açıklama</th>
                    <th className="py-2 px-2.5 text-right w-24">Tutar (TL)</th>
                    {/* Luca columns */}
                    <th className="py-2 px-2.5 border-l border-slate-200 w-24">Tarih</th>
                    <th className="py-2 px-2.5 w-28">Evrak No</th>
                    <th className="py-2 px-2.5">Açıklama</th>
                    <th className="py-2 px-2.5 text-right w-24">Tutar (TL)</th>
                    {/* Diff */}
                    <th className="py-2 px-2.5 border-l border-slate-200 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPairs.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 px-4 text-center">
                        <div className="max-w-xs mx-auto flex flex-col items-center">
                          <CheckCircle2 className="w-8 h-8 text-slate-300 mb-2" />
                          <p className="text-sm font-semibold text-slate-800">
                            Filtreye uygun kayıt bulunamadı
                          </p>
                          <p className="text-xs text-slate-500 mt-1 mb-3">
                            Arama kriterini değiştirin veya tümünü listeleyin.
                          </p>
                          <button
                            onClick={() => {
                              setStatusFilter("all");
                              setSearchQuery("");
                              setYearFilter("all");
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                          >
                            Filtreleri Temizle
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredPairs.map((p, idx) => {
                      // Status styling
                      let rowBg = "hover:bg-slate-50/70";
                      let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";

                      if (p.status === "missing_in_luca") {
                        rowBg = "bg-rose-50/30 hover:bg-rose-50/60";
                        badgeClass = "bg-rose-100 text-rose-800 border-rose-300";
                      } else if (p.status === "missing_in_external") {
                        rowBg = "bg-amber-50/30 hover:bg-amber-50/60";
                        badgeClass = "bg-amber-100 text-amber-800 border-amber-300";
                      } else if (p.status === "amount_mismatch") {
                        rowBg = "bg-orange-50/30 hover:bg-orange-50/60";
                        badgeClass = "bg-orange-100 text-orange-800 border-orange-300";
                      } else if (p.status === "matched") {
                        badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
                      }

                      const extAmount = p.external ? (p.external.debit > 0 ? p.external.debit : p.external.credit) : 0;
                      const intAmount = p.internal ? (p.internal.debit > 0 ? p.internal.debit : p.internal.credit) : 0;

                      return (
                        <tr key={p.id} className={`${rowBg} transition-colors`}>
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Status Badge */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${badgeClass}`}
                              title={p.note}
                            >
                              {p.statusLabel}
                            </span>
                          </td>

                          {/* External PDF Details */}
                          <td className="py-2.5 px-2.5 border-l border-slate-200 font-mono text-slate-700 whitespace-nowrap">
                            {p.external?.date || <span className="text-slate-300 font-sans italic">Yok</span>}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono font-medium text-slate-800 whitespace-nowrap">
                            {p.external?.docNo || <span className="text-slate-300 font-sans italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2.5 text-slate-800 truncate max-w-[200px]" title={p.external?.description}>
                            {p.external?.description || <span className="text-slate-300 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {p.external ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{formatCurrency(extAmount)}</span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                                    p.external.debit > 0
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  }`}
                                  title={p.external.debit > 0 ? "Firma Borç (B)" : "Firma Alacak (A)"}
                                >
                                  {p.external.debit > 0 ? "B" : "A"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-sans font-normal">-</span>
                            )}
                          </td>

                          {/* Internal Luca Details */}
                          <td className="py-2.5 px-2.5 border-l border-slate-200 font-mono text-slate-700 whitespace-nowrap">
                            {p.internal?.date || <span className="text-rose-500 font-sans font-semibold">Luca'da Yok!</span>}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono font-medium text-slate-800 whitespace-nowrap">
                            {p.internal?.docNo || <span className="text-slate-300 font-sans italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2.5 text-slate-800 truncate max-w-[200px]" title={p.internal?.description}>
                            {p.internal?.description || <span className="text-slate-300 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {p.internal ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{formatCurrency(intAmount)}</span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                                    p.internal.debit > 0
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  }`}
                                  title={p.internal.debit > 0 ? "Bizde Borç (B)" : "Bizde Alacak (A)"}
                                >
                                  {p.internal.debit > 0 ? "B" : "A"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-rose-500 font-sans font-semibold">0,00 ₺</span>
                            )}
                          </td>

                          {/* Difference Amount */}
                          <td className="py-2.5 px-2.5 border-l border-slate-200 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            {p.difference && Math.abs(p.difference) > 0.05 ? (
                              <span
                                className={
                                  p.difference > 0 ? "text-rose-600" : "text-amber-600"
                                }
                              >
                                {p.difference > 0 ? "+" : ""}
                                {formatCurrency(p.difference)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-normal">0,00 ₺</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
