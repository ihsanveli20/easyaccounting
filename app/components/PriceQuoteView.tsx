"use client";

import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Printer,
  Plus,
  Trash2,
  Download,
  Copy,
  Calendar,
  Sparkles,
  RotateCcw,
  Building,
  User,
  CheckCircle2,
  FileText,
  Percent,
} from "lucide-react";

export interface QuoteItem {
  id: string;
  materialName: string; // MALZEME CİNSİ
  quantity: number | ""; // MİKTAR
  unit: string; // BİRİM (Adet, Kg, Mt, Paket, vb.)
  unitPrice: number | ""; // BİRİM FİYATI (₺)
  total: number; // TUTAR (₺)
}

const COMMON_UNITS = [
  "Adet",
  "Metre",
  "Kg",
  "Ton",
  "Paket",
  "Koli",
  "Takım",
  "m²",
  "m³",
  "Litre",
  "Saat",
  "Gün",
  "Hizmet",
];

// Helper to format currency (Turkish locale)
function formatCurrency(val: number): string {
  if (isNaN(val)) return "0,00 TRY";
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val) + " TRY"
  );
}

// Convert number to Turkish words (e.g. 15.450 -> "On Beş Bin Dört Yüz Elli Türk Lirası")
function numberToTurkishWords(amount: number): string {
  if (amount <= 0 || isNaN(amount)) return "Sıfır Türk Lirası";
  const birler = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
  const onlar = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"];
  const basamaklar = ["", "Bin", "Milyon", "Milyar", "Trilyon"];

  const tamKisim = Math.floor(Math.abs(amount));
  const kurusKisim = Math.round((Math.abs(amount) - tamKisim) * 100);

  function ucBasamak(n: number) {
    let res = "";
    const yuzler = Math.floor(n / 100);
    const onluk = Math.floor((n % 100) / 10);
    const birlik = n % 10;

    if (yuzler > 1) res += birler[yuzler] + " Yüz ";
    else if (yuzler === 1) res += "Yüz ";

    if (onluk > 0) res += onlar[onluk] + " ";
    if (birlik > 0) res += birler[birlik] + " ";
    return res.trim();
  }

  let strTam = "";
  let temp = tamKisim;
  let basamakIdx = 0;

  if (temp === 0) strTam = "Sıfır";
  while (temp > 0) {
    const uc = temp % 1000;
    if (uc > 0) {
      let ucStr = ucBasamak(uc);
      if (basamakIdx === 1 && uc === 1) {
        ucStr = ""; // "Bir Bin" yerine "Bin"
      }
      const basamakAdi = basamaklar[basamakIdx];
      strTam = `${ucStr} ${basamakAdi} ${strTam}`.trim();
    }
    temp = Math.floor(temp / 1000);
    basamakIdx++;
  }

  let sonuc = strTam.trim() + " Türk Lirası";
  if (kurusKisim > 0) {
    sonuc += " " + ucBasamak(kurusKisim) + " Kuruş";
  }
  return sonuc.replace(/\s+/g, " ");
}

// Generate empty row
function createEmptyRow(): QuoteItem {
  return {
    id: Math.random().toString(36).substring(2, 9),
    materialName: "",
    quantity: "",
    unit: "Adet",
    unitPrice: "",
    total: 0,
  };
}

// Sample initial rows
const SAMPLE_ITEMS: QuoteItem[] = [
  { id: "1", materialName: "Q12 Nervürlü İnşaat Demiri", quantity: 5, unit: "Ton", unitPrice: 28500, total: 142500 },
  { id: "2", materialName: "C30/37 Hazır Beton", quantity: 45, unit: "m³", unitPrice: 2450, total: 110250 },
  { id: "3", materialName: "19'luk Tuğla (Paletli)", quantity: 1200, unit: "Adet", unitPrice: 14.5, total: 17400 },
  { id: "4", materialName: "Torbalı Çimento (50 Kg)", quantity: 60, unit: "Paket", unitPrice: 195, total: 11700 },
  { id: "5", materialName: "Kaba Sıva Kumu", quantity: 18, unit: "Ton", unitPrice: 480, total: 8640 },
  { id: "6", materialName: "", quantity: "", unit: "Adet", unitPrice: "", total: 0 },
  { id: "7", materialName: "", quantity: "", unit: "Adet", unitPrice: "", total: 0 },
  { id: "8", materialName: "", quantity: "", unit: "Adet", unitPrice: "", total: 0 },
  { id: "9", materialName: "", quantity: "", unit: "Adet", unitPrice: "", total: 0 },
  { id: "10", materialName: "", quantity: "", unit: "Adet", unitPrice: "", total: 0 },
];

export default function PriceQuoteView() {
  // Today formatted as DD.MM.YYYY
  const getTodayStr = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}.${m}.${y}`;
  };

  // Header State
  const [quoteDate, setQuoteDate] = useState<string>(getTodayStr());
  const [vatNote, setVatNote] = useState<string>("Birim fiyatlara KDV dahil değildir.");
  const [customerName, setCustomerName] = useState<string>("");
  const [quoteNo, setQuoteNo] = useState<string>("");
  const [preparedBy, setPreparedBy] = useState<string>("");
  const [notes, setNotes] = useState<string>(
    "1. Fiyatlarımız teklif tarihinden itibaren 15 gün süreyle geçerlidir.\n2. Teslimat şantiye/depo teslimidir.\n3. Ödeme vadesi teslimat sonrası 30 gündür."
  );

  // KDV Rate (%20 default)
  const [vatRate, setVatRate] = useState<number>(20);

  // Rows State (starts with 10 rows matching screenshot)
  const [rows, setRows] = useState<QuoteItem[]>(() => {
    return Array.from({ length: 10 }, () => createEmptyRow());
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const lastInputRef = useRef<HTMLInputElement>(null);

  // Load saved quote from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fiyat_teklifi_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rows && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          setRows(parsed.rows);
        }
        if (parsed.quoteDate) setQuoteDate(parsed.quoteDate);
        if (parsed.vatNote !== undefined) setVatNote(parsed.vatNote);
        if (parsed.customerName) setCustomerName(parsed.customerName);
        if (parsed.quoteNo) setQuoteNo(parsed.quoteNo);
        if (parsed.preparedBy) setPreparedBy(parsed.preparedBy);
        if (parsed.notes) setNotes(parsed.notes);
        if (parsed.vatRate !== undefined) setVatRate(parsed.vatRate);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    try {
      const data = {
        rows,
        quoteDate,
        vatNote,
        customerName,
        quoteNo,
        preparedBy,
        notes,
        vatRate,
      };
      localStorage.setItem("fiyat_teklifi_data", JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [rows, quoteDate, vatNote, customerName, quoteNo, preparedBy, notes, vatRate]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Row update handlers
  const handleUpdateRow = (
    index: number,
    field: keyof QuoteItem,
    value: any
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      // Auto calculate total
      const qty = typeof row.quantity === "number" ? row.quantity : parseFloat(String(row.quantity)) || 0;
      const price = typeof row.unitPrice === "number" ? row.unitPrice : parseFloat(String(row.unitPrice)) || 0;
      row.total = Math.round(qty * price * 100) / 100;

      updated[index] = row;
      return updated;
    });
  };

  // Add 1 or multiple rows
  const handleAddRows = (count: number = 1) => {
    setRows((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => createEmptyRow()),
    ]);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        return [createEmptyRow()];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Duplicate row
  const handleDuplicateRow = (index: number) => {
    setRows((prev) => {
      const target = prev[index];
      const clone: QuoteItem = {
        ...target,
        id: Math.random().toString(36).substring(2, 9),
      };
      const updated = [...prev];
      updated.splice(index + 1, 0, clone);
      return updated;
    });
  };

  // Remove empty rows
  const handleClearEmptyRows = () => {
    const filled = rows.filter(
      (r) =>
        r.materialName.trim() !== "" ||
        (typeof r.quantity === "number" && r.quantity > 0) ||
        (typeof r.unitPrice === "number" && r.unitPrice > 0)
    );
    if (filled.length === 0) {
      setRows(Array.from({ length: 5 }, () => createEmptyRow()));
    } else {
      setRows(filled);
    }
    showToast("Boş satırlar temizlendi.");
  };

  // Reset all
  const handleReset = () => {
    if (confirm("Fiyat teklifini sıfırlamak istediğinize emin misiniz?")) {
      setRows(Array.from({ length: 10 }, () => createEmptyRow()));
      setCustomerName("");
      setQuoteNo("");
      setQuoteDate(getTodayStr());
      showToast("Teklif tablosu sıfırlandı.");
    }
  };

  // Load Sample
  const handleLoadSample = () => {
    setRows(SAMPLE_ITEMS);
    setCustomerName("ÖZDEMİR İNŞAAT VE TAAHHÜT A.Ş.");
    setQuoteNo("TEK-2026-0185");
    setPreparedBy("Teknik Satış Departmanı");
    showToast("Örnek fiyat teklifi yüklendi.");
  };

  // Enter / Tab key on last row adds a new row
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (rowIndex === rows.length - 1) {
        handleAddRows(1);
      }
    }
  };

  // Calculations
  const subtotal = rows.reduce((acc, r) => acc + (r.total || 0), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  // Print
  const handlePrint = () => {
    window.print();
  };

  // Export to Excel matching the exact format
  const handleExportExcel = () => {
    try {
      const activeRows = rows.filter(
        (r) =>
          r.materialName.trim() !== "" ||
          (typeof r.quantity === "number" && r.quantity > 0) ||
          (typeof r.unitPrice === "number" && r.unitPrice > 0)
      );
      const rowsToExport = activeRows.length > 0 ? activeRows : rows;

      const wsData: any[][] = [
        ["FİYAT TEKLİFİ", "", "", "", "", ""],
        ["TARİH", quoteDate, "", "", customerName ? "MÜŞTERİ: " + customerName : "", ""],
        [vatNote, "", "", "", quoteNo ? "TEKLİF NO: " + quoteNo : "", ""],
        ["SIRA", "MALZEME CİNSİ", "MİKTAR", "BİRİM", "BİRİM FİYATI (₺)", "TUTAR (₺)"],
      ];

      rowsToExport.forEach((r, idx) => {
        wsData.push([
          idx + 1,
          r.materialName || "",
          r.quantity !== "" ? r.quantity : "",
          r.unit || "",
          r.unitPrice !== "" ? r.unitPrice : "",
          r.total > 0 ? r.total : "",
        ]);
      });

      // Totals
      wsData.push(["", "", "", "", "Ara Toplam", subtotal]);
      wsData.push(["", "", "", "", `KDV (%${vatRate})`, vatAmount]);
      wsData.push(["", "", "", "", "TOPLAM", grandTotal]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Merges
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Title
        { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } }, // Date
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }, // Vat note
      ];

      // Col widths
      ws["!cols"] = [
        { wch: 8 },  // SIRA
        { wch: 42 }, // MALZEME CİNSİ
        { wch: 12 }, // MİKTAR
        { wch: 12 }, // BİRİM
        { wch: 18 }, // BİRİM FİYATI
        { wch: 20 }, // TUTAR
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fiyat Teklifi");

      const safeName = (customerName || "Fiyat_Teklifi")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 30);
      XLSX.writeFile(wb, `${safeName}_${quoteDate.replace(/\./g, "-")}.xlsx`);
      showToast("Excel dosyası başarıyla indirildi.");
    } catch (err: any) {
      alert("Excel oluşturulurken bir hata oluştu: " + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-sm flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Control Actions Bar (Hidden in Print) */}
      <div className="no-print bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Fiyat Teklifi Hazırlama</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Tablo & Çıktı
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Satır ekleyerek teklifinizi hazırlayın, KDV ve toplamları otomatik hesaplayın, yazdırın veya Excel'e aktarın.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Add Rows */}
          <button
            onClick={() => handleAddRows(1)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            title="Aşağıya 1 yeni satır ekle"
          >
            <Plus className="w-4 h-4" />
            <span>Satır Ekle</span>
          </button>
          <button
            onClick={() => handleAddRows(5)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-colors"
            title="Aşağıya 5 yeni satır ekle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+5 Satır</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Clean empty rows */}
          <button
            onClick={handleClearEmptyRows}
            className="px-3 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-medium border border-slate-200 transition-colors"
            title="Doldurulmamış boş satırları kaldır"
          >
            Boşları Temizle
          </button>

          {/* Sample Data */}
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
            title="Örnek inşaat / malzeme teklifi doldur"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Örnek Doldur</span>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-xs transition-colors border border-slate-200"
            title="Tabloyu Sıfırla"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            title="Excel formatında indir (.xlsx)"
          >
            <Download className="w-4 h-4" />
            <span>Excel İndir</span>
          </button>

          {/* Print / PDF Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/20 transition-all hover:scale-[1.02]"
            title="Teklifi A4 formatında yazdır veya PDF olarak kaydet"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>Yazdır / PDF Kaydet</span>
          </button>
        </div>
      </div>

      {/* Customer & Info Fields (Web Inputs, prints cleanly) */}
      <div className="no-print bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            Teklif Verilen Firma / Müşteri:
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Örn: ABC İnşaat Ltd. Şti."
            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Teklif No:
          </label>
          <input
            type="text"
            value={quoteNo}
            onChange={(e) => setQuoteNo(e.target.value)}
            placeholder="Örn: TEK-2026-001"
            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Teklif Tarihi:
          </label>
          <input
            type="text"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
            placeholder="DD.MM.YYYY"
            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-slate-400" />
            KDV Oranı:
          </label>
          <select
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value))}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 bg-white"
          >
            <option value={20}>%20 (Standart KDV)</option>
            <option value={10}>%10 KDV</option>
            <option value={1}>%1 KDV</option>
            <option value={0}>%0 (KDV Muaf / Hariç)</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* THE OFFICIAL PRICE QUOTATION SHEET (EXACT SCREENSHOT LAYOUT & PRINT READY) */}
      {/* ========================================================================= */}
      <div
        id="printable-quote"
        className="bg-white rounded-2xl shadow-sm border border-slate-300 p-6 sm:p-8 w-full print:p-0 print:border-none print:shadow-none print:rounded-none"
      >
        {/* Print-only Header: Customer & Quote No info */}
        {(customerName || quoteNo) && (
          <div className="hidden print:flex justify-between items-center pb-3 mb-2 border-b border-slate-300 text-xs">
            <div>
              {customerName && (
                <div className="font-bold text-slate-900 text-sm">
                  Sayın / Firma: {customerName}
                </div>
              )}
            </div>
            <div className="text-right text-slate-700">
              {quoteNo && <div>Teklif No: <strong>{quoteNo}</strong></div>}
            </div>
          </div>
        )}

        {/* 1. TOP TITLE BANNER (EXACT MATCH: Pastel Blue Header with Bold Centered Text) */}
        <div
          className="w-full py-2.5 px-4 text-center border-t border-x border-b-2 border-black print:border-black font-extrabold text-slate-950 text-base sm:text-lg tracking-wider select-none"
          style={{
            backgroundColor: "#a4c2f4",
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        >
          FİYAT TEKLİFİ
        </div>

        {/* 2. TOP METADATA BAR (EXACT MATCH: TARİH + BUGÜNÜN TARİHİ OTOMATİK) */}
        <div className="w-full flex border-x border-b border-black text-xs sm:text-sm">
          {/* TARİH Box */}
          <div
            className="w-24 sm:w-32 py-1.5 px-3 font-bold text-white uppercase tracking-wider flex items-center justify-center border-r border-black select-none shrink-0"
            style={{
              backgroundColor: "#1b365d",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            }}
          >
            TARİH
          </div>
          {/* Date value box */}
          <div className="flex-1 py-1.5 px-3 flex items-center justify-between text-slate-900 font-medium">
            <input
              type="text"
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-semibold text-slate-900"
              placeholder="GG.AA.YYYY"
            />
            <span className="no-print text-[11px] text-slate-400 italic shrink-0 hidden sm:inline">
              (Otomatik güncel tarih)
            </span>
          </div>
        </div>

        {/* 3. KDV DAHİL DEĞİLDİR NOTE (EXACT MATCH) */}
        <div className="w-full py-1.5 px-3 border-x border-b border-black text-xs sm:text-sm italic text-slate-800 bg-white">
          <input
            type="text"
            value={vatNote}
            onChange={(e) => setVatNote(e.target.value)}
            className="w-full bg-transparent border-none focus:outline-none italic text-slate-800"
            placeholder="Birim fiyatlara KDV dahil değildir."
          />
        </div>

        {/* 4. MAIN QUOTATION TABLE (EXACT MATCH) */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse border border-black text-xs sm:text-sm text-slate-900">
            <thead>
              <tr
                className="text-white text-xs uppercase tracking-wide font-bold select-none"
                style={{
                  backgroundColor: "#1b365d",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                <th className="border border-black py-2 px-2 w-12 text-center">SIRA</th>
                <th className="border border-black py-2 px-3 text-left">MALZEME CİNSİ</th>
                <th className="border border-black py-2 px-2 w-24 text-right">MİKTAR</th>
                <th className="border border-black py-2 px-2 w-24 text-center">BİRİM</th>
                <th className="border border-black py-2 px-3 w-36 text-right">BİRİM FİYATI (₺)</th>
                <th className="border border-black py-2 px-3 w-40 text-right">TUTAR (₺)</th>
                <th className="no-print border border-black py-2 px-1 w-16 text-center">İŞLEM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className="hover:bg-blue-50/40 transition-colors group"
                >
                  {/* SIRA */}
                  <td className="border border-black py-1.5 px-2 text-center font-bold text-slate-700 bg-slate-50/50 print:bg-transparent">
                    {idx + 1}
                  </td>

                  {/* MALZEME CİNSİ */}
                  <td className="border border-black py-1 px-2.5">
                    <input
                      type="text"
                      value={row.materialName}
                      onChange={(e) => handleUpdateRow(idx, "materialName", e.target.value)}
                      placeholder={idx === 0 ? "Malzeme / Hizmet açıklamasını girin..." : ""}
                      className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 font-medium text-slate-900 placeholder:text-slate-300"
                    />
                  </td>

                  {/* MİKTAR */}
                  <td className="border border-black py-1 px-2 text-right">
                    <input
                      type="number"
                      step="any"
                      value={row.quantity}
                      onChange={(e) =>
                        handleUpdateRow(
                          idx,
                          "quantity",
                          e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 text-right font-medium text-slate-900"
                      placeholder="0"
                    />
                  </td>

                  {/* BİRİM */}
                  <td className="border border-black py-1 px-1.5 text-center">
                    <input
                      type="text"
                      list={`units-list-${idx}`}
                      value={row.unit}
                      onChange={(e) => handleUpdateRow(idx, "unit", e.target.value)}
                      className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 text-center text-slate-800"
                      placeholder="Adet"
                    />
                    <datalist id={`units-list-${idx}`}>
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </td>

                  {/* BİRİM FİYATI (₺) */}
                  <td className="border border-black py-1 px-2.5 text-right">
                    <input
                      type="number"
                      step="any"
                      value={row.unitPrice}
                      onChange={(e) =>
                        handleUpdateRow(
                          idx,
                          "unitPrice",
                          e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "unitPrice")}
                      className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 text-right font-mono font-medium text-slate-900"
                      placeholder="0,00"
                    />
                  </td>

                  {/* TUTAR (₺) */}
                  <td className="border border-black py-1.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/30 print:bg-transparent">
                    {row.total > 0
                      ? new Intl.NumberFormat("tr-TR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(row.total) + " ₺"
                      : "-"}
                  </td>

                  {/* İŞLEM (Hidden on print) */}
                  <td className="no-print border border-black py-1 px-1 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDuplicateRow(idx)}
                        className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-blue-50"
                        title="Satırı çoğalt"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                        title="Satırı sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* 5. SUMMARY FOOTER (EXACT MATCH: Ara Toplam, KDV, TOPLAM) */}
              <tr>
                <td
                  colSpan={4}
                  rowSpan={3}
                  className="border border-black p-3 align-top bg-slate-50/20 print:bg-transparent"
                >
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600">
                    <div className="font-semibold text-slate-800">Teklif Açıklaması & Koşullar:</div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full bg-transparent border-none focus:outline-none resize-none text-[11px] text-slate-700 leading-relaxed font-sans"
                      placeholder="Teklif şartları, teslim süresi, garanti vb..."
                    />
                    {grandTotal > 0 && (
                      <div className="mt-1 pt-2 border-t border-slate-200 text-slate-800 font-medium">
                        <span className="font-bold text-slate-900">Yazıyla: </span>
                        <span>{numberToTurkishWords(grandTotal)}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="border border-black py-2 px-3 text-right font-bold text-slate-800 bg-slate-50 print:bg-transparent">
                  Ara Toplam
                </td>
                <td className="border border-black py-2 px-3 text-right font-mono font-bold text-slate-900">
                  {formatCurrency(subtotal)}
                </td>
                <td className="no-print border border-black" />
              </tr>

              <tr>
                <td className="border border-black py-2 px-3 text-right font-bold text-slate-800 bg-slate-50 print:bg-transparent">
                  <div className="flex items-center justify-end gap-1">
                    <span>KDV</span>
                    <span className="text-xs text-slate-500 font-normal">
                      (%{vatRate})
                    </span>
                  </div>
                </td>
                <td className="border border-black py-2 px-3 text-right font-mono font-bold text-slate-900">
                  {formatCurrency(vatAmount)}
                </td>
                <td className="no-print border border-black" />
              </tr>

              <tr
                style={{
                  backgroundColor: "#f1f5f9",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                <td className="border border-black py-2.5 px-3 text-right font-extrabold text-slate-950 text-sm">
                  TOPLAM
                </td>
                <td className="border border-black py-2.5 px-3 text-right font-mono font-extrabold text-blue-900 print:text-black text-sm sm:text-base">
                  {formatCurrency(grandTotal)}
                </td>
                <td className="no-print border border-black" />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quick Add Row helper at bottom of table (Hidden in Print) */}
        <div className="no-print mt-3 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddRows(1)}
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Satır Ekle</span>
            </button>
            <span>•</span>
            <span className="text-slate-400">
              İpucu: Birim Fiyatı kutusundayken <strong>Enter</strong> tuşuna basarak da anında yeni satır açabilirsiniz.
            </span>
          </div>
          <div className="font-medium text-slate-600">
            Toplam <strong>{rows.length}</strong> satır
          </div>
        </div>

        {/* Signature & Approval Block (Visible on Print or preview) */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
          <div className="border border-black rounded-lg p-4 h-28 flex flex-col justify-between bg-slate-50/30 print:bg-transparent">
            <div className="font-bold text-slate-800">
              TEKLİFİ HAZIRLAYAN
            </div>
            <div className="text-slate-600 font-medium">
              {preparedBy || "Yetkili İmza / Kaşe"}
            </div>
            <div className="text-[10px] text-slate-400">İmza & Tarih</div>
          </div>

          <div className="border border-black rounded-lg p-4 h-28 flex flex-col justify-between bg-slate-50/30 print:bg-transparent">
            <div className="font-bold text-slate-800">
              TEKLİFİ ONAYLAYAN / MÜŞTERİ
            </div>
            <div className="text-slate-600 font-medium">
              {customerName || "Yetkili İmza / Kaşe"}
            </div>
            <div className="text-[10px] text-slate-400">Kaşe & İmza</div>
          </div>
        </div>
      </div>
    </div>
  );
}
