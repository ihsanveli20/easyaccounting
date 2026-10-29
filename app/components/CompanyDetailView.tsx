"use client";

import React, { useState, useMemo, useRef, ChangeEvent } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  AlertCircle,
  Settings2,
  RotateCcw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Scale,
  Users,
  Building2,
  Calendar,
  Printer,
  Plus,
  ChevronRight,
  ArrowLeft,
  FileCheck2,
  Trash2,
  Layers,
  Receipt,
  FileText,
} from "lucide-react";
import {
  CompanyDetail,
  DetailColumnMapping,
  TransactionItem,
  AccountRecord,
} from "../types/accounting";
import {
  formatCurrency,
  normalizeForSearch,
  exportCompanyStatementToExcel,
  exportAllDetailsToExcel,
  downloadDetailTemplate,
  SAMPLE_COMPANY_DETAILS,
} from "../utils/excel";
import {
  parseDetailExcelFile,
  buildCompaniesFromRows,
  splitCompositeDescription,
} from "../utils/detailParser";

interface CompanyDetailViewProps {
  companies: CompanyDetail[];
  setCompanies: React.Dispatch<React.SetStateAction<CompanyDetail[]>>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  summaryRecords?: AccountRecord[];
  onSwitchToSummary?: () => void;
}

export default function CompanyDetailView({
  companies,
  setCompanies,
  selectedCompanyId,
  setSelectedCompanyId,
  summaryRecords = [],
  onSwitchToSummary,
}: CompanyDetailViewProps) {
  // Search & Filter for Companies List
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "debit" | "credit" | "zero">("all");
  const [companySortField, setCompanySortField] = useState<"name" | "balance" | "count">("name");
  const [companySortDir, setCompanySortDir] = useState<"asc" | "desc">("asc");

  // Search & Filter for Inside Selected Company Transactions
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("all");
  const [txStartDate, setTxStartDate] = useState<string>("");
  const [txEndDate, setTxEndDate] = useState<string>("");

  // Upload & File State
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string>("");

  // Mapping override modal state
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [detailHeaders, setDetailHeaders] = useState<string[]>([]);
  const [detailRawRows, setDetailRawRows] = useState<Record<string, any>[]>([]);
  const [detailMapping, setDetailMapping] = useState<DetailColumnMapping>({
    companyCol: "",
    codeCol: "",
    dateCol: "",
    docNoCol: "",
    typeCol: "",
    descCol: "",
    debitCol: "",
    creditCol: "",
    balanceCol: "__auto__",
    autoSplitDescription: true,
  });
  const [splitNotification, setSplitNotification] = useState<string | null>(null);

  // New Transaction Modal State
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [newTxDate, setNewTxDate] = useState(new Date().toLocaleDateString("tr-TR"));
  const [newTxDocNo, setNewTxDocNo] = useState("");
  const [newTxType, setNewTxType] = useState("Satış Faturası");
  const [newTxDesc, setNewTxDesc] = useState("");
  const [newTxDebit, setNewTxDebit] = useState("");
  const [newTxCredit, setNewTxCredit] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected company object
  const activeCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Handle Detail Excel Upload
  const handleDetailFile = async (file: File) => {
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const result = await parseDetailExcelFile(file);

      if (result.companies.length === 0) {
        throw new Error("Yüklenen dosyada geçerli firma veya hareket verisi bulunamadı.");
      }

      setDetailHeaders(result.headers);
      setDetailRawRows(result.rawRows);
      setDetailMapping(result.detectedMapping);
      setLastUploadedFileName(result.fileName);

      // Merge with existing companies or replace if requested
      setCompanies((prev) => {
        const merged = [...prev];
        result.companies.forEach((newComp) => {
          const existingIdx = merged.findIndex(
            (c) =>
              (newComp.code && c.code === newComp.code) ||
              normalizeForSearch(c.name) === normalizeForSearch(newComp.name)
          );
          if (existingIdx >= 0) {
            // Replace or append
            merged[existingIdx] = newComp;
          } else {
            merged.push(newComp);
          }
        });
        return merged;
      });

      // If only 1 company was parsed, select it automatically!
      if (result.companies.length === 1) {
        setSelectedCompanyId(result.companies[0].id);
      }
    } catch (err: any) {
      setErrorMsg(`Detay dosya okunamadı: ${err?.message || "Bilinmeyen hata"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleDetailFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleDetailFile(e.target.files[0]);
    }
  };

  // Load Sample Detailed Data
  const loadSampleDetailData = () => {
    setCompanies(SAMPLE_COMPANY_DETAILS);
    setLastUploadedFileName("Ornek_Firma_Muavin_Hareketleri.xlsx");
    setErrorMsg(null);
    setCompanySearchQuery("");
  };

  // Clear all detail records
  const clearAllDetails = () => {
    setCompanies([]);
    setSelectedCompanyId(null);
    setLastUploadedFileName("");
    setCompanySearchQuery("");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Apply custom mapping override
  const handleApplyCustomMapping = () => {
    try {
      const reParsed = buildCompaniesFromRows(
        detailRawRows,
        detailMapping,
        lastUploadedFileName ? lastUploadedFileName.replace(/\.[^/.]+$/, "") : "Detay Listesi"
      );
      if (reParsed.length === 0) {
        setErrorMsg("Seçilen sütun eşleştirmesi ile geçerli veri satırı oluşturulamadı.");
        return;
      }
      setCompanies(reParsed);
      setShowMappingModal(false);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(`Eşleştirme hatası: ${err?.message}`);
    }
  };

  // Split composite description (e.g. 11/01/2024-YLD2024000000649-YILDIZ İNŞAAT...)
  const handleSplitCompositeDescriptions = () => {
    let affectedCount = 0;
    setCompanies((prev) =>
      prev.map((comp) => {
        let changed = false;
        const newTransactions = comp.transactions.map((tx) => {
          const parsed = splitCompositeDescription(tx.description);
          if (parsed.wasSplit) {
            changed = true;
            affectedCount++;
            return {
              ...tx,
              date: (!tx.date || tx.date === "-") && parsed.date ? parsed.date : (parsed.date || tx.date),
              docNo: tx.docNo || parsed.docNo,
              invoiceNo: parsed.invoiceNo || tx.invoiceNo || parsed.docNo,
              description: parsed.cleanDesc || tx.description,
            };
          }
          return tx;
        });

        if (changed) {
          const lastItem = newTransactions[newTransactions.length - 1];
          return {
            ...comp,
            transactions: newTransactions,
            lastDate: lastItem?.date || comp.lastDate,
          };
        }
        return comp;
      })
    );

    if (affectedCount > 0) {
      setSplitNotification(
        `✓ Toplam ${affectedCount} adet hareketin açıklaması Tarih, Fatura No ve Açıklama olarak ayrı sütunlara başarıyla ayrıştırıldı.`
      );
    } else {
      setSplitNotification(
        "Mevcut hareketler kontrol edildi. Tüm kayıtlar zaten ayrıştırılmış veya ayrıştırılacak birleşik açıklama formatı bulunamadı."
      );
    }

    setTimeout(() => {
      setSplitNotification(null);
    }, 6000);
  };

  // Add Manual Transaction to Active Company
  const handleAddTransaction = () => {
    if (!activeCompany) return;

    const debitNum = parseFloat(newTxDebit.replace(",", ".")) || 0;
    const creditNum = parseFloat(newTxCredit.replace(",", ".")) || 0;

    if (!newTxDesc.trim() && !newTxDocNo.trim()) {
      alert("Lütfen açıklama veya fatura/evrak numarası giriniz.");
      return;
    }

    if (debitNum === 0 && creditNum === 0) {
      alert("Lütfen borç veya alacak tutarı giriniz.");
      return;
    }

    const parsedDesc = splitCompositeDescription(newTxDesc);
    const finalDate = parsedDesc.wasSplit && parsedDesc.date ? parsedDesc.date : (newTxDate.trim() || new Date().toLocaleDateString("tr-TR"));
    const finalDocNo = newTxDocNo.trim() || (parsedDesc.wasSplit ? (parsedDesc.invoiceNo || parsedDesc.docNo) : undefined);
    const finalDesc = parsedDesc.wasSplit && parsedDesc.cleanDesc ? parsedDesc.cleanDesc : (newTxDesc.trim() || (finalDocNo ? `Belge: ${finalDocNo}` : "İşlem"));

    const newTx: TransactionItem = {
      id: `tx-manual-${Date.now()}`,
      date: finalDate,
      docNo: finalDocNo,
      invoiceNo: parsedDesc.invoiceNo || finalDocNo,
      type: newTxType,
      description: finalDesc,
      debit: debitNum,
      credit: creditNum,
      balance: 0,
    };

    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== activeCompany.id) return c;

        const updatedTxList = [...c.transactions, newTx];
        let running = 0;
        let totDeb = 0;
        let totCred = 0;

        updatedTxList.forEach((t) => {
          totDeb += t.debit;
          totCred += t.credit;
          running += t.debit - t.credit;
          t.balance = running;
        });

        return {
          ...c,
          transactions: updatedTxList,
          totalDebit: totDeb,
          totalCredit: totCred,
          balance: running,
          lastDate: newTx.date,
        };
      })
    );

    // Reset modal form
    setNewTxDocNo("");
    setNewTxDesc("");
    setNewTxDebit("");
    setNewTxCredit("");
    setShowAddTxModal(false);
  };

  // Delete a transaction
  const handleDeleteTransaction = (txId: string) => {
    if (!activeCompany) return;
    if (!confirm("Bu işlem hareketini silmek istediğinize emin misiniz?")) return;

    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== activeCompany.id) return c;

        const updated = c.transactions.filter((t) => t.id !== txId);
        let running = 0;
        let totDeb = 0;
        let totCred = 0;

        updated.forEach((t) => {
          totDeb += t.debit;
          totCred += t.credit;
          running += t.debit - t.credit;
          t.balance = running;
        });

        return {
          ...c,
          transactions: updated,
          totalDebit: totDeb,
          totalCredit: totCred,
          balance: running,
        };
      })
    );
  };

  // Delete an entire company
  const handleDeleteCompany = (e: React.MouseEvent, compId: string) => {
    e.stopPropagation();
    if (!confirm("Bu firmayı ve tüm hareketlerini detay listesinden silmek istediğinize emin misiniz?")) {
      return;
    }
    setCompanies((prev) => prev.filter((c) => c.id !== compId));
    if (selectedCompanyId === compId) {
      setSelectedCompanyId(null);
    }
  };

  // Highlight helper
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    const normText = normalizeForSearch(text);
    const normQ = normalizeForSearch(query);

    const index = normText.indexOf(normQ);
    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);

    return (
      <>
        {before}
        <mark className="bg-amber-200 text-amber-950 font-semibold px-1 rounded">
          {match}
        </mark>
        {after}
      </>
    );
  };

  // Filter & Sort Companies
  const filteredAndSortedCompanies = useMemo(() => {
    const q = normalizeForSearch(companySearchQuery);

    let result = companies.filter((c) => {
      // Search by company name or code
      if (q) {
        const normName = normalizeForSearch(c.name);
        const normCode = c.code ? normalizeForSearch(c.code) : "";
        if (!normName.includes(q) && !normCode.includes(q)) {
          return false;
        }
      }

      // Filter by balance
      if (balanceFilter === "debit") return c.balance > 0.001;
      if (balanceFilter === "credit") return c.balance < -0.001;
      if (balanceFilter === "zero") return Math.abs(c.balance) <= 0.001;

      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (companySortField === "name") {
        comparison = a.name.localeCompare(b.name, "tr");
      } else if (companySortField === "balance") {
        comparison = a.balance - b.balance;
      } else if (companySortField === "count") {
        comparison = a.transactions.length - b.transactions.length;
      }
      return companySortDir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [companies, companySearchQuery, balanceFilter, companySortField, companySortDir]);

  // Filter active company's transactions
  const filteredTransactions = useMemo(() => {
    if (!activeCompany) return [];

    const q = normalizeForSearch(txSearchQuery);

    return activeCompany.transactions.filter((t) => {
      // Text search in description, docNo, invoiceNo, date, or type
      if (q) {
        const normDesc = normalizeForSearch(t.description || "");
        const normDoc = normalizeForSearch(t.docNo || "");
        const normInv = normalizeForSearch(t.invoiceNo || "");
        const normDate = normalizeForSearch(t.date || "");
        const normType = normalizeForSearch(t.type || "");
        if (
          !normDesc.includes(q) &&
          !normDoc.includes(q) &&
          !normInv.includes(q) &&
          !normDate.includes(q) &&
          !normType.includes(q)
        ) {
          return false;
        }
      }

      // Type filter
      if (txTypeFilter !== "all") {
        const normT = normalizeForSearch(t.type || "");
        if (txTypeFilter === "invoice" && !normT.includes("fat")) return false;
        if (txTypeFilter === "payment" && !normT.includes("hav") && !normT.includes("eft") && !normT.includes("tah") && !normT.includes("ode") && !normT.includes("ted")) return false;
        if (txTypeFilter === "cash" && !normT.includes("kas")) return false;
      }

      // Date filter
      if (txStartDate && t.date && t.date < txStartDate) return false;
      if (txEndDate && t.date && t.date > txEndDate) return false;

      return true;
    });
  }, [activeCompany, txSearchQuery, txTypeFilter, txStartDate, txEndDate]);

  // Totals for filtered transactions
  const activeCompanyFilteredTotals = useMemo(() => {
    let deb = 0;
    let cred = 0;
    filteredTransactions.forEach((t) => {
      deb += t.debit;
      cred += t.credit;
    });
    return {
      debitSum: deb,
      creditSum: cred,
      balance: deb - cred,
    };
  }, [filteredTransactions]);

  // Overall totals across all loaded companies
  const overallCompanyStats = useMemo(() => {
    let totalTx = 0;
    let totalDeb = 0;
    let totalCred = 0;
    let totalBal = 0;

    companies.forEach((c) => {
      totalTx += c.transactions.length;
      totalDeb += c.totalDebit;
      totalCred += c.totalCredit;
      totalBal += c.balance;
    });

    return {
      totalCompanies: companies.length,
      totalTransactions: totalTx,
      totalDebit: totalDeb,
      totalCredit: totalCred,
      netBalance: totalBal,
    };
  }, [companies]);

  // Type badge styling helper
  const getTypeBadgeClass = (typeStr?: string) => {
    if (!typeStr) return "bg-slate-100 text-slate-700 border-slate-200";
    const norm = normalizeForSearch(typeStr);
    if (norm.includes("sat") && norm.includes("fat")) {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }
    if (norm.includes("al") && norm.includes("fat")) {
      return "bg-purple-50 text-purple-700 border-purple-200";
    }
    if (norm.includes("hav") || norm.includes("eft") || norm.includes("bnk") || norm.includes("tah")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (norm.includes("kas") || norm.includes("nak")) {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (norm.includes("cek") || norm.includes("çek") || norm.includes("senet")) {
      return "bg-teal-50 text-teal-700 border-teal-200";
    }
    if (norm.includes("devir")) {
      return "bg-slate-100 text-slate-700 border-slate-200";
    }
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Uyarı: </span>
            {errorMsg}
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE 1: NO COMPANY SELECTED -> SHOW UPLOAD AREA & COMPANY LIST WITH SEARCH */}
      {/* ========================================================================= */}
      {!activeCompany ? (
        <>
          {/* Detailed File Upload Zone (Shown if no data or as an expandable section) */}
          {companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-2xl border-2 border-dashed rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]"
                    : "border-slate-300 hover:border-indigo-500 bg-white/70 hover:bg-white shadow-sm"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-indigo-100 to-sky-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-inner">
                  <UploadCloud className="w-8 h-8 animate-pulse" />
                </div>

                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  Firma Detaylı Hareket & Muavin Listesini Yükleyin
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
                  Her bir firmaya ait tarih, fatura no, işlem türü, açıklama, borç ve alacak içeren detaylı Excel dosyanızı (.xlsx, .xls) yükleyin.
                </p>

                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md shadow-indigo-600/25 transition-all">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Detay Excel Dosyası Seçin</span>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    Firma / Cari Adı
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    İşlem Tarihi
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Belge / Fiş No
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    Borç & Alacak
                  </span>
                </div>
              </div>

              {/* Action Helper Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full mt-6">
                <div
                  onClick={loadSampleDetailData}
                  className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-0.5 group-hover:text-indigo-700 transition-colors">
                        Örnek Firma Detayları ile İncele
                      </h3>
                      <p className="text-xs text-slate-500">
                        10 farklı firmanın fatura, havale ve kasa hareketlerinden oluşan örnek ekstreleri anında yükleyin.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  onClick={downloadDetailTemplate}
                  className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 group-hover:scale-110 transition-transform">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-0.5">
                        Örnek Detay Şablonu Al
                      </h3>
                      <p className="text-xs text-slate-500">
                        Doğru sütun başlıklarına sahip standart Firma Hareketleri / Muavin Excel şablonunu indirin.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* File Info Bar with Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white/80 border border-slate-200/80 rounded-2xl shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">
                        {lastUploadedFileName || "Yüklenen Firma Detayları"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                        {companies.length} Firma
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                        {overallCompanyStats.totalTransactions} Toplam Hareket
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      İstediğiniz firmanın üzerine tıklayarak tarih bazlı ekstre ve fiş detaylarını inceleyebilirsiniz.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSplitCompositeDescriptions}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 shadow-2xs"
                    title="Açıklama sütunundaki '11/01/2024-YLD...-Firma' formatını Tarih, Fatura No ve Açıklama olarak ayrı sütunlara böl"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Açıklamayı Sütunlara Böl</span>
                  </button>
                  <button
                    onClick={() => setShowMappingModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                    title="Sütun eşleştirmelerini düzenle"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Sütun Eşleştir</span>
                  </button>
                  <button
                    onClick={() => exportAllDetailsToExcel(companies)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                    title="Tüm firmaların detay listesini Excel olarak indir (Ayrıştırılmış Sütunlarla)"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline">Tüm Detayları İndir</span>
                  </button>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200">
                    <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                    <span>Farklı Dosya Yükle</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={clearAllDetails}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                    title="Detay listesini sıfırla"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Temizle</span>
                  </button>
                </div>
              </div>

              {/* Split Notification Banner */}
              {splitNotification && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900 text-xs sm:text-sm animate-fadeIn shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{splitNotification}</span>
                  </div>
                  <button
                    onClick={() => setSplitNotification(null)}
                    className="p-1 rounded-md text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Firma Sayısı
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Building2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight">
                      {filteredAndSortedCompanies.length}
                      {filteredAndSortedCompanies.length !== companies.length && (
                        <span className="text-xs font-normal text-slate-400 ml-1.5">
                          / {companies.length}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {overallCompanyStats.totalTransactions} detaylı hareket kaydı
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Toplam Borç Hareketi
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-bold text-blue-700 tracking-tight tabular-nums">
                      {formatCurrency(overallCompanyStats.totalDebit)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Faturalandırılan / borç toplamı
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Toplam Alacak Hareketi
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-bold text-emerald-700 tracking-tight tabular-nums">
                      {formatCurrency(overallCompanyStats.totalCredit)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Tahsilat / alacak toplamı
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Net Bakiye Toplamı
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                      <Scale className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div
                      className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums ${
                        overallCompanyStats.netBalance > 0.001
                          ? "text-blue-700"
                          : overallCompanyStats.netBalance < -0.001
                          ? "text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      {formatCurrency(Math.abs(overallCompanyStats.netBalance))}
                    </div>
                    <div className="text-xs font-medium mt-1">
                      {overallCompanyStats.netBalance > 0.001 ? (
                        <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          Net Borç Bakiyesi
                        </span>
                      ) : overallCompanyStats.netBalance < -0.001 ? (
                        <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Net Alacak Bakiyesi
                        </span>
                      ) : (
                        <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          Dengede
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Company Search and Filters Bar */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* Search input */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={companySearchQuery}
                      onChange={(e) => setCompanySearchQuery(e.target.value)}
                      placeholder="Firma arayın... (Örn: Anadolu, Demir Çelik, 120.01, Boğaziçi)"
                      className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 placeholder-slate-400 transition-all"
                    />
                    {companySearchQuery && (
                      <button
                        onClick={() => setCompanySearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                        title="Aramayı temizle"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth pb-1 sm:pb-0 text-xs flex-nowrap">
                    <button
                      onClick={() => setBalanceFilter("all")}
                      className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${
                        balanceFilter === "all"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200/80 text-slate-600"
                      }`}
                    >
                      Tümü ({companies.length})
                    </button>
                    <button
                      onClick={() => setBalanceFilter("debit")}
                      className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${
                        balanceFilter === "debit"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-blue-50 hover:bg-blue-100/80 text-blue-700"
                      }`}
                    >
                      Borçlular
                    </button>
                    <button
                      onClick={() => setBalanceFilter("credit")}
                      className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${
                        balanceFilter === "credit"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700"
                      }`}
                    >
                      Alacaklılar
                    </button>
                    <button
                      onClick={() => setBalanceFilter("zero")}
                      className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${
                        balanceFilter === "zero"
                          ? "bg-slate-700 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200/80 text-slate-600"
                      }`}
                    >
                      Sıfır Bakiye
                    </button>
                  </div>
                </div>

                {/* Filter info indicator */}
                {(companySearchQuery || balanceFilter !== "all") && (
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>
                      Arama sonucu: <strong>{filteredAndSortedCompanies.length}</strong> firma listeleniyor.
                    </span>
                    <button
                      onClick={() => {
                        setCompanySearchQuery("");
                        setBalanceFilter("all");
                      }}
                      className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Filtreleri Sıfırla
                    </button>
                  </div>
                )}
              </div>

              {/* Companies Table / Grid */}
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
                <div className="sm:hidden px-3.5 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 italic flex items-center justify-between">
                  <span>⟵ Sağa kaydırabilirsiniz ⟶</span>
                  <span className="font-semibold">{filteredAndSortedCompanies.length} Firma</span>
                </div>
                <div className="overflow-x-auto no-scrollbar sm:overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[680px]">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider select-none">
                        <th className="py-3.5 px-4 w-12 text-center text-slate-400">#</th>
                        {companies.some((c) => c.code) && (
                          <th className="py-3.5 px-4 w-32">Cari Kodu</th>
                        )}
                        <th
                          onClick={() => {
                            if (companySortField === "name") {
                              setCompanySortDir((p) => (p === "asc" ? "desc" : "asc"));
                            } else {
                              setCompanySortField("name");
                              setCompanySortDir("asc");
                            }
                          }}
                          className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Firma / Cari Adı</span>
                            {companySortField === "name" ? (
                              companySortDir === "asc" ? (
                                <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => {
                            if (companySortField === "count") {
                              setCompanySortDir((p) => (p === "asc" ? "desc" : "asc"));
                            } else {
                              setCompanySortField("count");
                              setCompanySortDir("desc");
                            }
                          }}
                          className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100/80 transition-colors w-28"
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <span>Hareket</span>
                            {companySortField === "count" ? (
                              companySortDir === "asc" ? (
                                <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th className="py-3.5 px-4 text-right w-36">Toplam Borç</th>
                        <th className="py-3.5 px-4 text-right w-36">Toplam Alacak</th>
                        <th
                          onClick={() => {
                            if (companySortField === "balance") {
                              setCompanySortDir((p) => (p === "asc" ? "desc" : "asc"));
                            } else {
                              setCompanySortField("balance");
                              setCompanySortDir("desc");
                            }
                          }}
                          className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors w-40"
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Son Bakiye</span>
                            {companySortField === "balance" ? (
                              companySortDir === "asc" ? (
                                <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th className="py-3.5 px-4 text-center w-32">Durum</th>
                        <th className="py-3.5 px-4 text-center w-28">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredAndSortedCompanies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={companies.some((c) => c.code) ? 9 : 8}
                            className="py-12 px-4 text-center"
                          >
                            <div className="max-w-xs mx-auto flex flex-col items-center">
                              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                                <Search className="w-6 h-6" />
                              </div>
                              <p className="text-sm font-semibold text-slate-800">
                                Aranan kriterde firma bulunamadı
                              </p>
                              <p className="text-xs text-slate-500 mt-1 mb-4">
                                "{companySearchQuery}" araması ile eşleşen firma bulunamadı.
                              </p>
                              <button
                                onClick={() => {
                                  setCompanySearchQuery("");
                                  setBalanceFilter("all");
                                }}
                                className="px-3.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                              >
                                Aramayı Temizle
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedCompanies.map((comp, idx) => {
                          const isDebit = comp.balance > 0.001;
                          const isCredit = comp.balance < -0.001;
                          const isZero = Math.abs(comp.balance) <= 0.001;

                          return (
                            <tr
                              key={comp.id}
                              onClick={() => setSelectedCompanyId(comp.id)}
                              className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                            >
                              <td className="py-3.5 px-4 text-center text-xs text-slate-400 font-mono">
                                {idx + 1}
                              </td>
                              {companies.some((c) => c.code) && (
                                <td className="py-3.5 px-4 font-mono text-xs text-slate-600 font-medium">
                                  {comp.code ? (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100">
                                      {comp.code}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              )}
                              <td className="py-3.5 px-4 font-medium text-slate-900 group-hover:text-indigo-900">
                                <div className="flex items-center gap-2">
                                  <span>{highlightMatch(comp.name, companySearchQuery)}</span>
                                  {comp.lastDate && (
                                    <span className="text-[11px] text-slate-400 font-normal hidden lg:inline">
                                      (Son işlem: {comp.lastDate})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-800">
                                  {comp.transactions.length} İşlem
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right tabular-nums text-slate-700">
                                {comp.totalDebit > 0 ? (
                                  formatCurrency(comp.totalDebit)
                                ) : (
                                  <span className="text-slate-300">0,00 ₺</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right tabular-nums text-slate-700">
                                {comp.totalCredit > 0 ? (
                                  formatCurrency(comp.totalCredit)
                                ) : (
                                  <span className="text-slate-300">0,00 ₺</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right tabular-nums font-semibold">
                                <span
                                  className={
                                    isDebit
                                      ? "text-blue-700"
                                      : isCredit
                                      ? "text-emerald-700"
                                      : "text-slate-400 font-normal"
                                  }
                                >
                                  {formatCurrency(Math.abs(comp.balance))}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {isDebit && (
                                  <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
                                    Borçlu (B)
                                  </span>
                                )}
                                {isCredit && (
                                  <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                    Alacaklı (A)
                                  </span>
                                )}
                                {isZero && (
                                  <span className="inline-block px-2 py-0.5 text-xs text-slate-500 rounded bg-slate-100">
                                    Kapalı
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedCompanyId(comp.id);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-2xs"
                                    title="Detay ekstreyi görüntüle"
                                  >
                                    <span>Detay</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteCompany(e, comp.id)}
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="Bu firmayı sil"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
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
        </>
      ) : (
        /* ========================================================================= */
        /* CASE 2: COMPANY SELECTED -> SHOW DETAILED STATEMENT & LEDGER TRANSACTIONS */
        /* ========================================================================= */
        <>
          {/* Top Return & Switcher Navigation */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-white/90 border border-slate-200/80 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <button
                onClick={() => setSelectedCompanyId(null)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">‹ Tüm Firmalara Dön</span>
                <span className="sm:hidden">‹ Firmalar</span>
              </button>

              <div className="h-5 w-px bg-slate-200 shrink-0"></div>

              {/* Company Switcher dropdown */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-xs font-medium text-slate-500 hidden md:inline shrink-0">
                  Firma:
                </span>
                <select
                  value={activeCompany.id}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full sm:max-w-xs truncate"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""} - {c.transactions.length} İşlem
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={handleSplitCompositeDescriptions}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 shadow-2xs"
                title="Açıklama sütunundaki '11/01/2024-YLD...-Firma' formatını Tarih, Fatura No ve Açıklama olarak ayrı sütunlara böl"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Açıklamayı Sütunlara Böl</span>
                <span className="sm:hidden">Sütunlara Böl</span>
              </button>
              <button
                onClick={() => setShowAddTxModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ekle</span>
              </button>
              <button
                onClick={() => exportCompanyStatementToExcel(activeCompany)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                title="Ekstreyi Excel olarak indir"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel</span>
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                title="Ekstreyi yazdır veya PDF olarak kaydet"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">Yazdır / PDF</span>
              </button>
            </div>
          </div>

          {/* Active Company Split Notification Banner */}
          {splitNotification && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900 text-xs sm:text-sm animate-fadeIn shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{splitNotification}</span>
              </div>
              <button
                onClick={() => setSplitNotification(null)}
                className="p-1 rounded-md text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Company Profile & Financial Balance Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-indigo-50/20 to-slate-50 border border-slate-200/80 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                      {activeCompany.name}
                    </h2>
                    {activeCompany.code && (
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-mono font-semibold">
                        {activeCompany.code}
                      </span>
                    )}
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                      Cari Hesap Ekstresi
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                    <span>
                      Toplam <strong>{activeCompany.transactions.length}</strong> işlem kaydı
                    </span>
                    {activeCompany.lastDate && (
                      <>
                        <span>•</span>
                        <span>
                          Son Hareket Tarihi: <strong>{activeCompany.lastDate}</strong>
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Balance Summary Counters */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 border-t lg:border-t-0 pt-3 lg:pt-0">
                <div className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Toplam Borç
                  </div>
                  <div className="text-base sm:text-lg font-bold text-blue-700 tabular-nums">
                    {formatCurrency(activeCompany.totalDebit)}
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Toplam Alacak
                  </div>
                  <div className="text-base sm:text-lg font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(activeCompany.totalCredit)}
                  </div>
                </div>

                <div className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Güncel Bakiye
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-lg sm:text-xl font-extrabold tabular-nums ${
                        activeCompany.balance > 0.001
                          ? "text-blue-700"
                          : activeCompany.balance < -0.001
                          ? "text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      {formatCurrency(Math.abs(activeCompany.balance))}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        activeCompany.balance > 0.001
                          ? "bg-blue-100 text-blue-800"
                          : activeCompany.balance < -0.001
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {activeCompany.balance > 0.001
                        ? "Borçlu (B)"
                        : activeCompany.balance < -0.001
                        ? "Alacaklı (A)"
                        : "Dengede"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar for Company Transactions */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Inside Statement */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Ekstrede ara... (Açıklama, Fiş/Evrak No, İşlem Türü)"
                  className="w-full pl-10 pr-9 py-2 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 placeholder-slate-400 transition-all"
                />
                {txSearchQuery && (
                  <button
                    onClick={() => setTxSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Transaction Type Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth text-xs pb-1 sm:pb-0 flex-nowrap">
                <button
                  onClick={() => setTxTypeFilter("all")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap shrink-0 ${
                    txTypeFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Tümü ({activeCompany.transactions.length})
                </button>
                <button
                  onClick={() => setTxTypeFilter("invoice")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap shrink-0 ${
                    txTypeFilter === "invoice"
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                >
                  Faturalar
                </button>
                <button
                  onClick={() => setTxTypeFilter("payment")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap shrink-0 ${
                    txTypeFilter === "payment"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  Tahsilat & Ödemeler
                </button>
                <button
                  onClick={() => setTxTypeFilter("cash")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap shrink-0 ${
                    txTypeFilter === "cash"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  Kasa İşlemleri
                </button>
                <div className="h-4 w-px bg-slate-200 mx-1 shrink-0"></div>
                <button
                  onClick={handleSplitCompositeDescriptions}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all shadow-2xs whitespace-nowrap shrink-0"
                  title="Açıklama sütunundaki '11/01/2024-YLD2024...-Firma' formatını Tarih, Fatura No ve Açıklama olarak ayrı sütunlara böl"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Açıklamayı Sütunlara Böl</span>
                </button>
              </div>
            </div>

            {/* Sub-bar with count */}
            {(txSearchQuery || txTypeFilter !== "all") && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>
                  Filtrelenen sonuç: <strong>{filteredTransactions.length}</strong> hareket listeleniyor.
                </span>
                <button
                  onClick={() => {
                    setTxSearchQuery("");
                    setTxTypeFilter("all");
                  }}
                  className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Filtreyi Temizle
                </button>
              </div>
            )}
          </div>

          {/* Detailed Statement Table (Cari Ekstre / Muavin Çizelgesi) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="sm:hidden px-3.5 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 italic flex items-center justify-between">
              <span>⟵ Sağa kaydırarak ekstre detayını inceleyin ⟶</span>
              <span className="font-semibold">{filteredTransactions.length} İşlem</span>
            </div>
            <div className="overflow-x-auto no-scrollbar sm:overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[780px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider select-none">
                    <th className="py-3.5 px-4 w-12 text-center text-slate-400">#</th>
                    <th className="py-3.5 px-4 w-32">İşlem Tarihi</th>
                    <th className="py-3.5 px-4 w-44">Fatura No</th>
                    <th className="py-3.5 px-4 w-36">İşlem Türü</th>
                    <th className="py-3.5 px-4">Açıklama</th>
                    <th className="py-3.5 px-4 text-right w-36">Borç (TL)</th>
                    <th className="py-3.5 px-4 text-right w-36">Alacak (TL)</th>
                    <th className="py-3.5 px-4 text-right w-40">Yürüyen Bakiye</th>
                    <th className="py-3.5 px-4 text-center w-24">Bakiye Yönü</th>
                    <th className="py-3.5 px-4 text-center w-12">Sil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 px-4 text-center">
                        <div className="max-w-xs mx-auto flex flex-col items-center">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                            <Search className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            Eşleşen hareket bulunamadı
                          </p>
                          <p className="text-xs text-slate-500 mt-1 mb-4">
                            Arama kriterine uygun işlem veya evrak kaydı yok.
                          </p>
                          <button
                            onClick={() => {
                              setTxSearchQuery("");
                              setTxTypeFilter("all");
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                          >
                            Filtreleri Temizle
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx, idx) => {
                      const isDebitBalance = tx.balance > 0.001;
                      const isCreditBalance = tx.balance < -0.001;
                      const isZero = Math.abs(tx.balance) <= 0.001;

                      return (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50/80 transition-colors group"
                        >
                          <td className="py-3 px-4 text-center text-xs text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 text-slate-700 text-xs font-medium whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold">{tx.date || "-"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 font-medium whitespace-nowrap">
                            {tx.invoiceNo || tx.docNo ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100/80 shadow-2xs">
                                <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                <span>{highlightMatch(tx.invoiceNo || tx.docNo || "", txSearchQuery)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getTypeBadgeClass(
                                tx.type
                              )}`}
                            >
                              {tx.type || "İşlem"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-900 text-sm">
                            {highlightMatch(tx.description, txSearchQuery)}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                            {tx.debit > 0 ? (
                              formatCurrency(tx.debit)
                            ) : (
                              <span className="text-slate-300">0,00 ₺</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                            {tx.credit > 0 ? (
                              formatCurrency(tx.credit)
                            ) : (
                              <span className="text-slate-300">0,00 ₺</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-semibold">
                            <span
                              className={
                                isDebitBalance
                                  ? "text-blue-700"
                                  : isCreditBalance
                                  ? "text-emerald-700"
                                  : "text-slate-400 font-normal"
                              }
                            >
                              {formatCurrency(Math.abs(tx.balance))}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isDebitBalance && (
                              <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                                (B) Borç
                              </span>
                            )}
                            {isCreditBalance && (
                              <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                (A) Alacak
                              </span>
                            )}
                            {isZero && (
                              <span className="inline-block px-2 py-0.5 text-[11px] text-slate-400 rounded bg-slate-100">
                                Sıfır
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                              title="Bu hareketi sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {/* Table Footer with Summary */}
                {filteredTransactions.length > 0 && (
                  <tfoot className="bg-slate-100/80 border-t-2 border-slate-300 font-semibold text-slate-900 text-xs">
                    <tr>
                      <td className="py-3.5 px-4 text-center text-slate-500">∑</td>
                      <td colSpan={4} className="py-3.5 px-4">
                        TOPLAM ({filteredTransactions.length} Hareket)
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-blue-700">
                        {formatCurrency(activeCompanyFilteredTotals.debitSum)}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-emerald-700">
                        {formatCurrency(activeCompanyFilteredTotals.creditSum)}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-purple-700">
                        {formatCurrency(Math.abs(activeCompanyFilteredTotals.balance))}
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-500 text-[11px]">
                        {activeCompanyFilteredTotals.balance > 0
                          ? "Borçlu"
                          : activeCompanyFilteredTotals.balance < 0
                          ? "Alacaklı"
                          : "Dengede"}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD NEW TRANSACTION */}
      {/* ========================================================================= */}
      {showAddTxModal && activeCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Yeni Hareket Ekle
                </h3>
              </div>
              <button
                onClick={() => setShowAddTxModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              <strong>{activeCompany.name}</strong> firması için yeni bir fatura, dekont veya tahsilat kaydı ekleyin.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarih
                  </label>
                  <input
                    type="text"
                    value={newTxDate}
                    onChange={(e) => setNewTxDate(e.target.value)}
                    placeholder="GG.AA.YYYY"
                    className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fiş / Evrak No
                  </label>
                  <input
                    type="text"
                    value={newTxDocNo}
                    onChange={(e) => setNewTxDocNo(e.target.value)}
                    placeholder="FTR-2026-..."
                    className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  İşlem Türü
                </label>
                <select
                  value={newTxType}
                  onChange={(e) => setNewTxType(e.target.value)}
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="Satış Faturası">Satış Faturası</option>
                  <option value="Alış Faturası">Alış Faturası</option>
                  <option value="Banka Havalesi">Banka Havalesi / EFT</option>
                  <option value="Kasa Tahsilat">Kasa Tahsilatı</option>
                  <option value="Kasa Tediye">Kasa Tediyesi</option>
                  <option value="Çek / Senet">Çek / Senet</option>
                  <option value="Mahsup Fişi">Mahsup Fişi</option>
                  <option value="Devir Fişi">Devir Fişi</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Açıklama <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTxDesc}
                  onChange={(e) => setNewTxDesc(e.target.value)}
                  placeholder="İşlem açıklaması girin..."
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Borç Tutarı (TL)
                  </label>
                  <input
                    type="text"
                    value={newTxDebit}
                    onChange={(e) => setNewTxDebit(e.target.value)}
                    placeholder="0,00"
                    className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-blue-700 font-bold text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alacak Tutarı (TL)
                  </label>
                  <input
                    type="text"
                    value={newTxCredit}
                    onChange={(e) => setNewTxCredit(e.target.value)}
                    placeholder="0,00"
                    className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-emerald-700 font-bold text-right"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleAddTransaction}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
              >
                Kaydet ve Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DETAIL COLUMN MAPPING SETTINGS */}
      {/* ========================================================================= */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Detay Dosyası Sütun Eşleştirme
                </h3>
              </div>
              <button
                onClick={() => setShowMappingModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Yüklediğiniz detaylı hareket Excel dosyasındaki sütun başlıkları otomatik algılandı. Gerekirse aşağıdaki açılır kutulardan eşleştirmeyi düzeltebilirsiniz.
            </p>

            {/* Smart Description Splitting Feature Card */}
            <div className="p-3 bg-indigo-50/80 border border-indigo-200/80 rounded-xl space-y-2 mb-4">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                <div className="text-xs text-indigo-950 leading-relaxed">
                  <span className="font-semibold">Akıllı Açıklama Ayrıştırma: </span>
                  Excel açıklama sütununda birleşik bulunan formatlar (Örn: <code className="bg-white px-1.5 py-0.5 rounded text-indigo-700 font-mono text-[11px] border border-indigo-200">11/01/2024-YLD2024000000649-YILDIZ İNŞAAT...</code>) otomatik olarak <strong>İşlem Tarihi</strong>, <strong>Fatura No</strong> ve <strong>Firma Açıklaması</strong> sütunlarına ayrıştırılır.
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-indigo-900 font-medium pt-1">
                <input
                  type="checkbox"
                  checked={detailMapping.autoSplitDescription !== false}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, autoSplitDescription: e.target.checked }))
                  }
                  className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Birleşik açıklamaları otomatik ayrı sütunlara böl (Tarih - Fatura No - Açıklama)</span>
              </label>
            </div>

            <div className="space-y-3.5">
              {/* Company Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Firma / Cari Adı Sütunu
                </label>
                <select
                  value={detailMapping.companyCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, companyCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Dosya Adını / Sayfa Adını Firma Olarak Kullan)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Code Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cari / Hesap Kodu Sütunu <span className="text-slate-400 font-normal">(İsteğe bağlı)</span>
                </label>
                <select
                  value={detailMapping.codeCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, codeCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Yok / Kullanma)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  İşlem Tarihi Sütunu
                </label>
                <select
                  value={detailMapping.dateCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, dateCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Yok / Otomatik Açıklamadan Çıkar)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Doc No Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fatura / Evrak No Sütunu
                </label>
                <select
                  value={detailMapping.docNoCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, docNoCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Yok / Otomatik Açıklamadan Çıkar)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  İşlem Türü Sütunu <span className="text-slate-400 font-normal">(Fatura, Havale, vb.)</span>
                </label>
                <select
                  value={detailMapping.typeCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, typeCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">✨ Otomatik Belirle (Açıklamadan / Tutardan)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Açıklama Sütunu
                </label>
                <select
                  value={detailMapping.descCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, descCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Yok)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Debit Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Borç Tutarı Sütunu
                </label>
                <select
                  value={detailMapping.debitCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, debitCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Yok)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Credit Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alacak Tutarı Sütunu
                </label>
                <select
                  value={detailMapping.creditCol}
                  onChange={(e) =>
                    setDetailMapping((prev) => ({ ...prev, creditCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                >
                  <option value="">(Yok)</option>
                  {detailHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowMappingModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleApplyCustomMapping}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
              >
                Eşleştirmeyi Uygula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
