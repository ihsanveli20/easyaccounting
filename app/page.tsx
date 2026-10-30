"use client";

import React, { useState, useMemo, useRef, useEffect, ChangeEvent } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  UploadCloud,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  FileCheck2,
  AlertCircle,
  Settings2,
  RotateCcw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Scale,
  Users,
  Layers,
  ChevronRight,
  Building2,
  Calculator,
  FileText,
  Package,
  Menu,
  PanelLeftClose,
  PanelLeft,
  ShieldCheck,
} from "lucide-react";
import {
  AccountRecord,
  ColumnMapping,
  CompanyDetail,
} from "./types/accounting";
import {
  SAMPLE_DATA,
  SAMPLE_COMPANY_DETAILS,
  detectColumns,
  formatCurrency,
  normalizeForSearch,
  parseTurkishAmount,
  exportToExcel,
  downloadTemplate,
} from "./utils/excel";
import CompanyDetailView from "./components/CompanyDetailView";
import DetailedCalculator from "./components/DetailedCalculator";
import ReconciliationView from "./components/ReconciliationView";
import PriceQuoteView from "./components/PriceQuoteView";

export default function Home() {
  // Navigation Tab: "summary" = Hesap Planı / Bakiye Listesi, "details" = Firma Detay Hareketleri, "calculator" = Ayrıntılı Hesap Makinesi, "reconciliation" = Ekstre & Luca Mutabakat, "quote" = Fiyat Teklifi, "stock-tracking" = Ürün Stok Takibi
  const [activeTab, setActiveTab] = useState<
    "summary" | "details" | "calculator" | "reconciliation" | "quote" | "stock-tracking"
  >("summary");

  // Sidebar Layout State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Summary State (Hesap Planı & Mizan)
  const [records, setRecords] = useState<AccountRecord[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [balanceFilter, setBalanceFilter] = useState<
    "all" | "debit" | "credit" | "zero"
  >("all");
  const [sortField, setSortField] = useState<"name" | "debit" | "credit" | "balance">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);

  // Raw file info for mapping overrides (Summary)
  const [allHeaders, setAllHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    codeCol: "",
    nameCol: "",
    debitCol: "",
    creditCol: "",
    balanceCol: "__auto__",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detailed Companies State (Firma Detay Listesi)
  const [companies, setCompanies] = useState<CompanyDetail[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Restore saved sessions if available (client-side only)
  useEffect(() => {
    try {
      const savedSummary = localStorage.getItem("hesap_plani_records");
      if (savedSummary) {
        const parsed = JSON.parse(savedSummary);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecords(parsed);
          setFileName(localStorage.getItem("hesap_plani_filename") || "Kayıtlı_Liste.xlsx");
        }
      }
      const savedDetails = localStorage.getItem("hesap_plani_companies");
      if (savedDetails) {
        const parsed = JSON.parse(savedDetails);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCompanies(parsed);
        }
      }
    } catch {
      // Storage quota or parsing ignore
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    try {
      if (records.length > 0) {
        localStorage.setItem("hesap_plani_records", JSON.stringify(records));
        localStorage.setItem("hesap_plani_filename", fileName);
      }
    } catch {
      // Ignore storage errors
    }
  }, [records, fileName]);

  useEffect(() => {
    try {
      if (companies.length > 0) {
        localStorage.setItem("hesap_plani_companies", JSON.stringify(companies));
      }
    } catch {
      // Ignore storage errors
    }
  }, [companies]);

  // Jump from a summary row straight to company detail
  const handleGoToCompanyDetail = (companyName: string, companyCode?: string) => {
    const existing = companies.find(
      (c) =>
        (companyCode && c.code === companyCode) ||
        normalizeForSearch(c.name) === normalizeForSearch(companyName)
    );

    if (existing) {
      setSelectedCompanyId(existing.id);
    } else {
      // Check if sample detail data has this company
      const sampleMatch = SAMPLE_COMPANY_DETAILS.find(
        (s) =>
          (companyCode && s.code === companyCode) ||
          normalizeForSearch(s.name) === normalizeForSearch(companyName)
      );

      if (sampleMatch) {
        setCompanies((prev) => [...prev, sampleMatch]);
        setSelectedCompanyId(sampleMatch.id);
      } else {
        const newComp: CompanyDetail = {
          id: `comp-${Date.now()}`,
          code: companyCode,
          name: companyName,
          transactions: [],
          totalDebit: 0,
          totalCredit: 0,
          balance: 0,
        };
        setCompanies((prev) => [...prev, newComp]);
        setSelectedCompanyId(newComp.id);
      }
    }

    setActiveTab("details");
  };

  // Process rows with given mapping (Summary)
  const processRawRows = (
    rows: Record<string, any>[],
    mapping: ColumnMapping,
    customFileName?: string
  ) => {
    try {
      const parsedRecords: AccountRecord[] = [];

      rows.forEach((row, idx) => {
        const rawName = mapping.nameCol ? row[mapping.nameCol] : "";
        const nameStr = rawName !== undefined && rawName !== null ? String(rawName).trim() : "";

        if (!nameStr && !row[mapping.debitCol] && !row[mapping.creditCol]) {
          return;
        }

        const debit = mapping.debitCol ? parseTurkishAmount(row[mapping.debitCol]) : 0;
        const credit = mapping.creditCol ? parseTurkishAmount(row[mapping.creditCol]) : 0;

        let balance = 0;
        if (mapping.balanceCol && mapping.balanceCol !== "__auto__" && row[mapping.balanceCol] !== undefined) {
          balance = parseTurkishAmount(row[mapping.balanceCol]);
        } else {
          balance = debit - credit;
        }

        const codeVal = mapping.codeCol ? row[mapping.codeCol] : undefined;

        parsedRecords.push({
          id: `rec-${idx}-${Date.now()}`,
          code: codeVal !== undefined && codeVal !== null ? String(codeVal).trim() : undefined,
          name: nameStr || `Hesap ${idx + 1}`,
          debit,
          credit,
          balance,
          raw: row,
        });
      });

      if (parsedRecords.length === 0) {
        setErrorMsg("Yüklenen dosyada geçerli veri satırı bulunamadı. Lütfen sütunları kontrol edin.");
        return;
      }

      setRecords(parsedRecords);
      if (customFileName) setFileName(customFileName);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(`Veriler işlenirken hata oluştu: ${err?.message || "Bilinmeyen hata"}`);
    }
  };

  // Read Excel File (Summary)
  const handleFile = (file: File) => {
    setErrorMsg(null);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: false });

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error("Excel dosyasında çalışma sayfası bulunamadı.");
        }

        const worksheet = workbook.Sheets[sheetName];

        const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        if (!sheetData || sheetData.length === 0) {
          throw new Error("Excel dosyası boş görünüyor.");
        }

        let bestHeaderRowIndex = 0;
        let maxMatches = -1;

        const headerKeywords = [
          "ad", "adi", "adı", "unvan", "isim", "borc", "borç", "alacak", "bakiye",
          "kod", "hesap", "cari", "tutar", "musteri", "müşteri", "açıklama"
        ];

        for (let r = 0; r < Math.min(sheetData.length, 10); r++) {
          const row = sheetData[r];
          if (!Array.isArray(row)) continue;

          let matches = 0;
          row.forEach((cell) => {
            const str = normalizeForSearch(String(cell || ""));
            if (headerKeywords.some((kw) => str.includes(kw))) {
              matches++;
            }
          });

          if (matches > maxMatches) {
            maxMatches = matches;
            bestHeaderRowIndex = r;
          }
        }

        const rawHeaders = (sheetData[bestHeaderRowIndex] || []).map((h, i) =>
          h !== undefined && h !== null && String(h).trim() !== ""
            ? String(h).trim()
            : `Sütun_${i + 1}`
        );

        const rows: Record<string, any>[] = [];
        for (let r = bestHeaderRowIndex + 1; r < sheetData.length; r++) {
          const rowArray = sheetData[r];
          if (!rowArray || rowArray.length === 0) continue;

          const hasContent = rowArray.some(
            (c) => c !== undefined && c !== null && String(c).trim() !== ""
          );
          if (!hasContent) continue;

          const rowObj: Record<string, any> = {};
          rawHeaders.forEach((colName, colIdx) => {
            rowObj[colName] = rowArray[colIdx] ?? "";
          });
          rows.push(rowObj);
        }

        const detected = detectColumns(rawHeaders);
        setAllHeaders(rawHeaders);
        setRawRows(rows);
        setColumnMapping(detected);

        processRawRows(rows, detected, file.name);
      } catch (err: any) {
        setErrorMsg(`Dosya okunurken bir hata oluştu: ${err?.message || "Geçersiz dosya biçimi"}`);
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setErrorMsg("Dosya okuma başarısız oldu. Lütfen tekrar deneyin.");
      setIsProcessing(false);
    };

    reader.readAsBinaryString(file);
  };

  // Drag & drop handlers
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
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Load sample demo data for both Summary & Details
  const loadSampleData = () => {
    setRecords(SAMPLE_DATA);
    setFileName("Örnek_Hesap_Plani_Listesi.xlsx");
    setErrorMsg(null);
    setSearchQuery("");
    setBalanceFilter("all");
    setAllHeaders(["Hesap Kodu", "Hesap Adı", "Borç", "Alacak", "Bakiye"]);
    setColumnMapping({
      codeCol: "Hesap Kodu",
      nameCol: "Hesap Adı",
      debitCol: "Borç",
      creditCol: "Alacak",
      balanceCol: "Bakiye",
    });

    // Also populate companies detail data with sample if empty
    if (companies.length === 0) {
      setCompanies(SAMPLE_COMPANY_DETAILS);
    }
  };

  // Clear data
  const resetAll = () => {
    setRecords([]);
    setFileName("");
    setSearchQuery("");
    setErrorMsg(null);
    setAllHeaders([]);
    setRawRows([]);
    try {
      localStorage.removeItem("hesap_plani_records");
      localStorage.removeItem("hesap_plani_filename");
    } catch {
      // ignore
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Sorting helper
  const handleSort = (field: "name" | "debit" | "credit" | "balance") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };

  // Filtering & Sorting (Summary)
  const filteredAndSortedRecords = useMemo(() => {
    const normalizedQuery = normalizeForSearch(searchQuery);

    let result = records.filter((item) => {
      if (normalizedQuery) {
        const normName = normalizeForSearch(item.name);
        const normCode = item.code ? normalizeForSearch(item.code) : "";
        const matchesName = normName.includes(normalizedQuery);
        const matchesCode = normCode.includes(normalizedQuery);
        if (!matchesName && !matchesCode) return false;
      }

      if (balanceFilter === "debit") {
        return item.balance > 0.001;
      }
      if (balanceFilter === "credit") {
        return item.balance < -0.001;
      }
      if (balanceFilter === "zero") {
        return Math.abs(item.balance) <= 0.001;
      }

      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name, "tr");
      } else {
        comparison = a[sortField] - b[sortField];
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [records, searchQuery, balanceFilter, sortField, sortDirection]);

  // Overall Totals
  const totalStats = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    let balanceSum = 0;

    records.forEach((r) => {
      debitSum += r.debit;
      creditSum += r.credit;
      balanceSum += r.balance;
    });

    return {
      totalCount: records.length,
      filteredCount: filteredAndSortedRecords.length,
      debitSum,
      creditSum,
      balanceSum,
    };
  }, [records, filteredAndSortedRecords]);

  // Filtered Totals
  const filteredStats = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    let balanceSum = 0;

    filteredAndSortedRecords.forEach((r) => {
      debitSum += r.debit;
      creditSum += r.credit;
      balanceSum += r.balance;
    });

    return { debitSum, creditSum, balanceSum };
  }, [filteredAndSortedRecords]);

  // Highlight search term in text
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

  // Sidebar Navigation Items
  const navItems = [
    {
      id: "summary" as const,
      name: "Hesap Planı & Bakiyeler",
      shortName: "Hesap Planı",
      description: "Mizan & Bakiye Listesi",
      icon: FileSpreadsheet,
      activeBg: "bg-emerald-600 text-white shadow-md shadow-emerald-600/25",
      badge: records.length > 0 ? records.length : null,
      badgeStyle: "bg-white/20 text-white",
      tag: null,
    },
    {
      id: "details" as const,
      name: "Firma Detay Hareketleri",
      shortName: "Firma Detay",
      description: "Muavin Defteri & Ekstre",
      icon: Layers,
      activeBg: "bg-indigo-600 text-white shadow-md shadow-indigo-600/25",
      badge: companies.length > 0 ? companies.length : null,
      badgeStyle: "bg-white/20 text-white",
      tag: companies.length === 0 ? "YENİ" : null,
    },
    {
      id: "calculator" as const,
      name: "Ayrıntılı Hesap Makinesi",
      shortName: "Hesap Makinesi",
      description: "Fişli Hesap, KDV & Stopaj",
      icon: Calculator,
      activeBg: "bg-slate-900 text-white shadow-md shadow-slate-900/25",
      badge: null,
      badgeStyle: "",
      tag: "PRO",
    },
    {
      id: "reconciliation" as const,
      name: "Ekstre Karşılaştırma",
      shortName: "Mutabakat",
      description: "PDF Ekstre vs Luca Mizan",
      icon: Scale,
      activeBg: "bg-rose-600 text-white shadow-md shadow-rose-600/25",
      badge: null,
      badgeStyle: "",
      tag: "MUTABAKAT",
    },
    {
      id: "quote" as const,
      name: "Fiyat Teklifi",
      shortName: "Fiyat Teklifi",
      description: "Kurumsal Form & Yazdır",
      icon: FileText,
      activeBg: "bg-blue-600 text-white shadow-md shadow-blue-600/25",
      badge: null,
      badgeStyle: "",
      tag: "YAZDIR",
    },
    {
      id: "stock-tracking" as const,
      name: "Ürün Stok Takibi",
      shortName: "Ürün Stok Takibi",
      description: "Stok Kontrolü & Yönetimi",
      icon: Package,
      activeBg: "bg-blue-600 text-white shadow-md shadow-blue-600/25",
      badge: null,
      badgeStyle: "",
      tag: "ÇOK YAKINDA",
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50/60 font-sans">
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-Over Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col lg:hidden transition-transform duration-300 ease-in-out no-print ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-emerald-600/20 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                <span>Hesap & Cari</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  PRO
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Ön Muhasebe & Mizan</p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 py-4 px-3 overflow-y-auto no-scrollbar space-y-1.5">
          <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Ana Menü
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${isActive
                    ? item.activeBg
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold truncate ${isActive ? "text-white" : "text-slate-800"
                          }`}
                      >
                        {item.name}
                      </div>
                      <div
                        className={`text-[10px] truncate ${isActive ? "text-white/80" : "text-slate-400"
                          }`}
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 pl-2">
                    {item.badge !== null && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive
                          ? item.badgeStyle
                          : "bg-slate-200/80 text-slate-700"
                          }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.tag && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                      >
                        {item.tag}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">
                Yerel & Güvenli
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Tüm veriler tarayıcınızda işlenir, sunucuya gönderilmez.
            </p>
          </div>
        </div>
      </aside>

      {/* Desktop Persistent Left Sidebar Navigation */}
      <aside
        className={`hidden lg:flex flex-col sticky top-0 h-screen z-40 bg-white border-r border-slate-200/80 transition-all duration-300 ease-in-out shrink-0 no-print select-none ${sidebarCollapsed ? "w-20" : "w-72"
          }`}
      >
        {/* Sidebar Brand Header */}
        <div
          className={`h-16 border-b border-slate-100 flex items-center px-4 ${sidebarCollapsed ? "justify-center" : "justify-between"
            }`}
        >
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-emerald-600/20 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight truncate flex items-center gap-1.5">
                  <span>Hesap & Cari</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    PRO
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  Ön Muhasebe & Mizan
                </p>
              </div>
            </div>
          ) : (
            <div
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-emerald-600/20 shrink-0 cursor-pointer"
              title="Menüyü Genişlet"
              onClick={() => setSidebarCollapsed(false)}
            >
              <Building2 className="w-5 h-5" />
            </div>
          )}

          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Menüyü Daralt"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sidebar Navigation Items */}
        <div className="flex-1 py-4 px-3 overflow-y-auto no-scrollbar space-y-1.5">
          {!sidebarCollapsed && (
            <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Ana Menü
            </div>
          )}

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              if (sidebarCollapsed) {
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={`${item.name} - ${item.description}`}
                    className={`w-full h-12 rounded-xl flex items-center justify-center relative transition-all group ${isActive
                      ? item.activeBg
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/80"
                      }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${isActive
                        ? "text-white"
                        : "group-hover:scale-110 transition-transform"
                        }`}
                    />
                    {item.badge !== null && (
                      <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold bg-emerald-500 text-white flex items-center justify-center ring-2 ring-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                    {item.tag && (
                      <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all group ${isActive
                    ? item.activeBg
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600 group-hover:bg-white group-hover:text-slate-900 group-hover:shadow-xs"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold truncate ${isActive ? "text-white" : "text-slate-800"
                          }`}
                      >
                        {item.name}
                      </div>
                      <div
                        className={`text-[10px] truncate ${isActive ? "text-white/80" : "text-slate-400"
                          }`}
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 pl-2">
                    {item.badge !== null && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive
                          ? item.badgeStyle
                          : "bg-slate-200/80 text-slate-700"
                          }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.tag && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                      >
                        {item.tag}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Status */}
        <div className="p-3 border-t border-slate-100">
          {!sidebarCollapsed ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">
                  Yerel & Güvenli
                </span>
              </div>
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <div className="flex justify-between">
                  <span>Hesap Kaydı:</span>
                  <span className="font-semibold text-slate-700">
                    {records.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Firma Sayısı:</span>
                  <span className="font-semibold text-slate-700">
                    {companies.length}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Menüyü Genişlet"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xs no-print">
          <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8 min-h-14 py-2 sm:h-16 sm:py-0 flex items-center justify-between gap-3">
            {/* Left: Mobile hamburger + Desktop collapse icon + Active Tab Title */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                title="Menüyü Aç"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Desktop collapse toggle */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex p-2 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                title={sidebarCollapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
              >
                {sidebarCollapsed ? (
                  <PanelLeft className="w-5 h-5" />
                ) : (
                  <PanelLeftClose className="w-5 h-5" />
                )}
              </button>

              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white shadow-md transition-all shrink-0 ${activeTab === "summary"
                  ? "bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-500/20"
                  : activeTab === "details"
                    ? "bg-gradient-to-tr from-indigo-600 to-sky-500 shadow-indigo-500/20"
                    : activeTab === "calculator"
                      ? "bg-gradient-to-tr from-slate-900 to-slate-700 shadow-slate-900/20"
                      : activeTab === "reconciliation"
                        ? "bg-gradient-to-tr from-rose-600 to-amber-500 shadow-rose-500/20"
                        : activeTab === "quote"
                          ? "bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-blue-500/20"
                          : "bg-gradient-to-tr from-amber-600 to-orange-500 shadow-amber-500/20"
                  }`}
              >
                {activeTab === "summary" ? (
                  <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : activeTab === "details" ? (
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : activeTab === "calculator" ? (
                  <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                ) : activeTab === "reconciliation" ? (
                  <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : activeTab === "quote" ? (
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </div>

              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2 truncate">
                  <span>
                    {activeTab === "summary"
                      ? "Hesap Planı & Bakiyeler"
                      : activeTab === "details"
                        ? "Firma Detay Hareketleri"
                        : activeTab === "calculator"
                          ? "Ayrıntılı Hesap Makinesi"
                          : activeTab === "reconciliation"
                            ? "Ekstre & Luca Karşılaştırma"
                            : activeTab === "quote"
                              ? "Fiyat Teklifi"
                              : "Ürün Stok Takibi"}
                  </span>
                  <span
                    className={`hidden sm:inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${activeTab === "summary"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                      : activeTab === "details"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200/60"
                        : activeTab === "calculator"
                          ? "bg-slate-900 text-emerald-400 border-slate-700"
                          : activeTab === "reconciliation"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : activeTab === "quote"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                  >
                    {activeTab === "summary"
                      ? "Mizan & Bakiyeler"
                      : activeTab === "details"
                        ? "Muavin & Ekstre"
                        : activeTab === "calculator"
                          ? "Hesap & Stopaj"
                          : activeTab === "reconciliation"
                            ? "Mutabakat"
                            : activeTab === "quote"
                              ? "Teklif & Yazdır"
                              : "Çok Yakında"}
                  </span>
                </h1>
                <p className="text-xs text-slate-500 hidden md:block truncate">
                  {activeTab === "summary"
                    ? "Excel mizanını yükleyin, isim veya hesap adına göre anında arayın"
                    : activeTab === "details"
                      ? "Firmalara ait fiş, fatura ve detaylı hareketleri görüntüleyin"
                      : activeTab === "calculator"
                        ? "Fişli muhasebe hesap makinesi, KDV & tevkifat, vade farkı ve stopaj araçları"
                        : activeTab === "reconciliation"
                          ? "Firma PDF ekstreleri ile Luca mizanını karşılaştırın, eksik ve uyuşmayanları bulun"
                          : activeTab === "quote"
                            ? "Fiyat teklifi oluşturun, otomatik KDV ve toplamlar hesaplayıp yazdırın"
                            : "Stok giriş-çıkışları, depo mevcudu ve kritik stok seviyelerini takip edin"}
                </p>
              </div>
            </div>

            {/* Right Action buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {activeTab === "summary" ? (
                <>
                  <button
                    onClick={downloadTemplate}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors border border-slate-200"
                    title="Örnek sütun formatına sahip boş şablon indir"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Şablon</span>
                  </button>

                  {records.length === 0 ? (
                    <button
                      onClick={loadSampleData}
                      className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 rounded-lg transition-colors border border-emerald-200 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">Örnek Veri ile Dene</span>
                      <span className="sm:hidden">Örnek Veri</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        onClick={() => setShowMappingModal(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors border border-slate-200"
                        title="Sütun eşleştirmesini değiştir"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden md:inline">Sütun Eşleştir</span>
                      </button>
                      <button
                        onClick={() =>
                          exportToExcel(
                            filteredAndSortedRecords,
                            `Filtrelenmis_${fileName || "Hesap_Listesi"}`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/80 rounded-lg transition-colors border border-emerald-300"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-700" />
                        <span className="hidden sm:inline">Dışa Aktar</span>
                        <span>({filteredAndSortedRecords.length})</span>
                      </button>
                      <button
                        onClick={resetAll}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                        title="Listeyi temizle"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Temizle</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  {companies.length === 0 && (
                    <button
                      onClick={() => setCompanies(SAMPLE_COMPANY_DETAILS)}
                      className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="hidden sm:inline">Örnek Detay Yükle</span>
                      <span className="sm:hidden">Örnek</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex-1 flex flex-col gap-4 sm:gap-6">
          {/* ========================================================================= */}
          {/* TAB 1: SUMMARY ACCOUNT LIST (HESAP PLANI & BAKİYELER)                      */}
          {/* ========================================================================= */}
          {activeTab === "summary" && (
            <>
              {/* Error notification banner */}
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

              {/* Upload Zone (If no data loaded yet) */}
              {records.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full max-w-2xl border-2 border-dashed rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 ${isDragging
                      ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
                      : "border-slate-300 hover:border-emerald-500 bg-white/70 hover:bg-white shadow-sm"
                      }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-emerald-100 to-teal-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-inner">
                      <UploadCloud className="w-8 h-8 animate-pulse" />
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 mb-2">
                      Excel Mizan / Bakiye Listenizi Yükleyin
                    </h2>
                    <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
                      .xlsx, .xls veya .csv formatındaki hesap planı veya cari bakiye mizan dosyanızı sürükleyip bırakın veya seçin.
                    </p>

                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-md shadow-emerald-600/25 transition-all">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Dosya Seçin</span>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Ad / Unvan Sütunu
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Borç Tutarı
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Alacak Tutarı
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                        Bakiye
                      </span>
                    </div>
                  </div>

                  {/* Quick Helper Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full mt-6">
                    <div
                      onClick={loadSampleData}
                      className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 mb-0.5 group-hover:text-emerald-700 transition-colors">
                            Örnek Veri ile Hemen İncele
                          </h3>
                          <p className="text-xs text-slate-500">
                            17 adet hazır cari hesap ve bakiyelerle arama özelliğini anında test edin.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={downloadTemplate}
                      className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 group-hover:scale-110 transition-transform">
                          <Download className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 mb-0.5">
                            Hazır Excel Şablonu Al
                          </h3>
                          <p className="text-xs text-slate-500">
                            Doğru sütun başlıklarına sahip standart şablonu bilgisayarınıza indirin.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loaded Data View (Summary) */}
              {records.length > 0 && (
                <>
                  {/* File Info & Active Mapping Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white/80 border border-slate-200/80 rounded-2xl shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {fileName}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                            {records.length} Kayıt
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>
                            Ad Sütunu: <strong className="text-slate-700">{columnMapping.nameCol || "Algılandı"}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Borç: <strong className="text-slate-700">{columnMapping.debitCol || "-"}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Alacak: <strong className="text-slate-700">{columnMapping.creditCol || "-"}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                    </div>
                  </div>

                  {/* Metric KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                    {/* Card 1: Kayıt Sayısı */}
                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2">
                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider">
                          Kayıt Sayısı
                        </span>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
                          {totalStats.filteredCount}
                          {totalStats.filteredCount !== totalStats.totalCount && (
                            <span className="text-[11px] sm:text-xs font-normal text-slate-400 ml-1 sm:ml-1.5">
                              / {totalStats.totalCount}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                          {searchQuery ? "Kriterlere uygun" : "Toplam kayıt"}
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Toplam Borç */}
                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2">
                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider">
                          Toplam Borç
                        </span>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-sm sm:text-2xl font-bold text-blue-700 tracking-tight tabular-nums truncate" title={formatCurrency(filteredStats.debitSum)}>
                          {formatCurrency(filteredStats.debitSum)}
                        </div>
                        <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                          Listelenen borç
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Toplam Alacak */}
                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2">
                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider">
                          Toplam Alacak
                        </span>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                          <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-sm sm:text-2xl font-bold text-emerald-700 tracking-tight tabular-nums truncate" title={formatCurrency(filteredStats.creditSum)}>
                          {formatCurrency(filteredStats.creditSum)}
                        </div>
                        <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                          Listelenen alacak
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Net Bakiye */}
                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2">
                        <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider">
                          Net Bakiye
                        </span>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                          <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      </div>
                      <div>
                        <div
                          className={`text-sm sm:text-2xl font-bold tracking-tight tabular-nums truncate ${filteredStats.balanceSum > 0.001
                            ? "text-blue-700"
                            : filteredStats.balanceSum < -0.001
                              ? "text-emerald-700"
                              : "text-slate-700"
                            }`}
                          title={formatCurrency(Math.abs(filteredStats.balanceSum))}
                        >
                          {formatCurrency(Math.abs(filteredStats.balanceSum))}
                        </div>
                        <div className="text-[10px] sm:text-xs font-medium mt-0.5 sm:mt-1 truncate">
                          {filteredStats.balanceSum > 0.001 ? (
                            <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                              Borç Bakiyesi
                            </span>
                          ) : filteredStats.balanceSum < -0.001 ? (
                            <span className="text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">
                              Alacak Bakiyesi
                            </span>
                          ) : (
                            <span className="text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                              Dengede (0 ₺)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Search and Filters Toolbar */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      {/* Search Bar */}
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="İsim veya hesap adına göre arayın... (Örn: Çınar, Kasa, Demir, A.Ş.)"
                          className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 placeholder-slate-400 transition-all"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
                            title="Aramayı temizle"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Filter Chips */}
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth pb-1 sm:pb-0 text-xs flex-nowrap">
                        <button
                          onClick={() => setBalanceFilter("all")}
                          className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${balanceFilter === "all"
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200/80 text-slate-600"
                            }`}
                        >
                          Tümü ({records.length})
                        </button>
                        <button
                          onClick={() => setBalanceFilter("debit")}
                          className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${balanceFilter === "debit"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-blue-50 hover:bg-blue-100/80 text-blue-700"
                            }`}
                        >
                          Borçlular
                        </button>
                        <button
                          onClick={() => setBalanceFilter("credit")}
                          className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${balanceFilter === "credit"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700"
                            }`}
                        >
                          Alacaklılar
                        </button>
                        <button
                          onClick={() => setBalanceFilter("zero")}
                          className={`px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 ${balanceFilter === "zero"
                            ? "bg-slate-700 text-white shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200/80 text-slate-600"
                            }`}
                        >
                          Sıfır Bakiye
                        </button>
                      </div>
                    </div>

                    {/* Status info if search query or filter active */}
                    {(searchQuery || balanceFilter !== "all") && (
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                        <span>
                          Arama sonucu: <strong>{filteredAndSortedRecords.length}</strong> kayıt listeleniyor.
                        </span>
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setBalanceFilter("all");
                          }}
                          className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Filtreleri Sıfırla
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Table Container */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
                    <div className="sm:hidden px-3.5 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 italic flex items-center justify-between">
                      <span>⟵ Sağa kaydırabilirsiniz ⟶</span>
                      <span className="font-semibold">{filteredAndSortedRecords.length} Kayıt</span>
                    </div>
                    <div className="overflow-x-auto no-scrollbar sm:overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[660px]">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider select-none">
                            <th className="py-3.5 px-4 w-12 text-center text-slate-400">#</th>
                            {records.some((r) => r.code) && (
                              <th className="py-3.5 px-4 w-32">Hesap Kodu</th>
                            )}
                            <th
                              onClick={() => handleSort("name")}
                              className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors"
                            >
                              <div className="flex items-center gap-1.5">
                                <span>Hesap / Cari Adı</span>
                                {sortField === "name" ? (
                                  sortDirection === "asc" ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => handleSort("debit")}
                              className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors w-40"
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <span>Borç Tutarı</span>
                                {sortField === "debit" ? (
                                  sortDirection === "asc" ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                                  ) : (
                                    <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => handleSort("credit")}
                              className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors w-40"
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <span>Alacak Tutarı</span>
                                {sortField === "credit" ? (
                                  sortDirection === "asc" ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => handleSort("balance")}
                              className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors w-44"
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <span>Bakiye Tutarı</span>
                                {sortField === "balance" ? (
                                  sortDirection === "asc" ? (
                                    <ArrowUp className="w-3.5 h-3.5 text-purple-600" />
                                  ) : (
                                    <ArrowDown className="w-3.5 h-3.5 text-purple-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                            </th>
                            <th className="py-3.5 px-4 text-center w-36">Bakiye Türü</th>
                            <th className="py-3.5 px-4 text-center w-28">Detay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {filteredAndSortedRecords.length === 0 ? (
                            <tr>
                              <td
                                colSpan={records.some((r) => r.code) ? 8 : 7}
                                className="py-12 px-4 text-center"
                              >
                                <div className="max-w-xs mx-auto flex flex-col items-center">
                                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                                    <Search className="w-6 h-6" />
                                  </div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    Eşleşen kayıt bulunamadı
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1 mb-4">
                                    &quot;{searchQuery}&quot; araması ile eşleşen isim veya hesap bulunamadı.
                                  </p>
                                  <button
                                    onClick={() => {
                                      setSearchQuery("");
                                      setBalanceFilter("all");
                                    }}
                                    className="px-3.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                                  >
                                    Aramayı Temizle
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredAndSortedRecords.map((item, index) => {
                              const isDebitBalance = item.balance > 0.001;
                              const isCreditBalance = item.balance < -0.001;
                              const isZero = Math.abs(item.balance) <= 0.001;

                              return (
                                <tr
                                  key={item.id}
                                  className="hover:bg-slate-50/80 transition-colors group"
                                >
                                  <td className="py-3 px-4 text-center text-xs text-slate-400 font-mono">
                                    {index + 1}
                                  </td>
                                  {records.some((r) => r.code) && (
                                    <td className="py-3 px-4 font-mono text-xs text-slate-600 font-medium">
                                      {item.code ? (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100">
                                          {item.code}
                                        </span>
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                  )}
                                  <td className="py-3 px-4 font-medium text-slate-900">
                                    <span
                                      onClick={() => handleGoToCompanyDetail(item.name, item.code)}
                                      className="cursor-pointer hover:text-indigo-600 hover:underline"
                                      title="Firmanın hareket detaylarına git"
                                    >
                                      {highlightMatch(item.name, searchQuery)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                                    {item.debit > 0 ? (
                                      formatCurrency(item.debit)
                                    ) : (
                                      <span className="text-slate-300">0,00 ₺</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                                    {item.credit > 0 ? (
                                      formatCurrency(item.credit)
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
                                      {formatCurrency(Math.abs(item.balance))}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {isDebitBalance && (
                                      <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
                                        Borçlu (B)
                                      </span>
                                    )}
                                    {isCreditBalance && (
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
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      onClick={() => handleGoToCompanyDetail(item.name, item.code)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200/60 shadow-2xs"
                                      title="Bu firmanın detaylı hareketlerini görüntüle"
                                    >
                                      <span>Detay</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {/* Table Footer with filtered totals */}
                        {filteredAndSortedRecords.length > 0 && (
                          <tfoot className="bg-slate-100/80 border-t-2 border-slate-300 font-semibold text-slate-900 text-xs">
                            <tr>
                              <td className="py-3.5 px-4 text-center text-slate-500">
                                ∑
                              </td>
                              {records.some((r) => r.code) && <td></td>}
                              <td className="py-3.5 px-4">
                                TOPLAM ({filteredAndSortedRecords.length} Hesap)
                              </td>
                              <td className="py-3.5 px-4 text-right tabular-nums text-blue-700">
                                {formatCurrency(filteredStats.debitSum)}
                              </td>
                              <td className="py-3.5 px-4 text-right tabular-nums text-emerald-700">
                                {formatCurrency(filteredStats.creditSum)}
                              </td>
                              <td className="py-3.5 px-4 text-right tabular-nums text-purple-700">
                                {formatCurrency(Math.abs(filteredStats.balanceSum))}
                              </td>
                              <td className="py-3.5 px-4 text-center text-slate-500 text-[11px]">
                                {filteredStats.balanceSum > 0
                                  ? "Borç Bakiyesi"
                                  : filteredStats.balanceSum < 0
                                    ? "Alacak Bakiyesi"
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
            </>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: DETAILED COMPANY LEDGERS (FİRMA DETAY HAREKETLERİ & EKSTRELER)      */}
          {/* ========================================================================= */}
          {activeTab === "details" && (
            <CompanyDetailView
              companies={companies}
              setCompanies={setCompanies}
              selectedCompanyId={selectedCompanyId}
              setSelectedCompanyId={setSelectedCompanyId}
              summaryRecords={records}
              onSwitchToSummary={() => setActiveTab("summary")}
            />
          )}

          {/* ========================================================================= */}
          {/* TAB 3: DETAILED ACCOUNTING CALCULATOR (AYRINTILI HESAP MAKİNESİ)          */}
          {/* ========================================================================= */}
          {activeTab === "calculator" && <DetailedCalculator />}

          {/* ========================================================================= */}
          {/* TAB 4: RECONCILIATION & DISCREPANCY (PDF EKSTRE VS LUCA MUTABAKAT)        */}
          {/* ========================================================================= */}
          {activeTab === "reconciliation" && (
            <ReconciliationView
              companies={companies}
              summaryRecords={records}
            />
          )}

          {/* ========================================================================= */}
          {/* TAB 5: PRICE QUOTATION SHEET (FİYAT TEKLİFİ)                               */}
          {/* ========================================================================= */}
          {activeTab === "quote" && <PriceQuoteView />}

          {/* ========================================================================= */}
          {/* TAB 6: STOCK TRACKING (ÜRÜN STOK TAKİBİ - ÇOK YAKINDA)                    */}
          {/* ========================================================================= */}
          {activeTab === "stock-tracking" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4 max-w-xl mx-auto shadow-xs my-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
                <Package className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Ürün Stok Takibi Modülü</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Stok giriş-çıkışları, depo mevcudu, kritik stok uyarıları ve ürün maliyet takibi özellikleri çok yakında burada kullanıma açılacaktır.
                </p>
              </div>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800">
                Geliştirme Aşamasında
              </span>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200/80 bg-white/60 py-4 text-center text-xs text-slate-400 no-print mt-auto">
          <div className="max-w-[1600px] w-full mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              Hesap Planı, Mizan & Firma Detay Hareketleri Görüntüleyici
            </span>
            <span className="text-slate-400">
              Tüm işlemler tarayıcınızda yerel olarak gerçekleşir, verileriniz dış sunuculara aktarılmaz.
            </span>
          </div>
        </footer>
      </div>

      {/* Sütun Eşleştirme Modal (Summary) */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Sütun Eşleştirme Ayarları
                </h3>
              </div>
              <button
                onClick={() => setShowMappingModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Excel dosyanızdaki sütun başlıkları otomatik olarak algılandı. Gerekirse aşağıdaki açılır kutulardan eşleştirmeyi düzeltebilirsiniz.
            </p>

            <div className="space-y-3.5">
              {/* Name Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  İsim / Hesap Adı Sütunu <span className="text-rose-500">*</span>
                </label>
                <select
                  value={columnMapping.nameCol}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({ ...prev, nameCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                >
                  <option value="">Seçiniz...</option>
                  {allHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Code Column (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hesap Kodu Sütunu <span className="text-slate-400 font-normal">(İsteğe bağlı)</span>
                </label>
                <select
                  value={columnMapping.codeCol}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({ ...prev, codeCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                >
                  <option value="">(Yok / Kullanma)</option>
                  {allHeaders.map((h) => (
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
                  value={columnMapping.debitCol}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({ ...prev, debitCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                >
                  <option value="">(Yok)</option>
                  {allHeaders.map((h) => (
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
                  value={columnMapping.creditCol}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({ ...prev, creditCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                >
                  <option value="">(Yok)</option>
                  {allHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Balance Column */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bakiye Sütunu
                </label>
                <select
                  value={columnMapping.balanceCol}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({ ...prev, balanceCol: e.target.value }))
                  }
                  className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                >
                  <option value="__auto__">✨ Otomatik Hesapla (Borç - Alacak)</option>
                  {allHeaders.map((h) => (
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
                onClick={() => {
                  processRawRows(rawRows, columnMapping);
                  setShowMappingModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
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
