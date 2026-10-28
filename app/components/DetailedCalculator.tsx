"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Calculator,
  Percent,
  Calendar,
  DollarSign,
  TrendingUp,
  Copy,
  Check,
  RotateCcw,
  Download,
  Sparkles,
  Clock,
  Receipt,
  Scale,
  BookmarkCheck,
  ArrowRight,
  FileText,
  Delete,
  Hash,
} from "lucide-react";
import { formatCurrency, parseTurkishAmount } from "../utils/excel";

type CalcMode = "standard" | "vat" | "interest" | "withholding" | "margin";

interface TapeItem {
  id: string;
  time: string;
  expression: string;
  result: number;
}

export default function DetailedCalculator() {
  const [activeMode, setActiveMode] = useState<CalcMode>("standard");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Copy with visual toast feedback
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // =========================================================================
  // MODE 1: DESK ACCOUNTING TAPE CALCULATOR (Fişli Masaüstü Hesap Makinesi)
  // =========================================================================
  const [display, setDisplay] = useState<string>("0");
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [isNewEntry, setIsNewEntry] = useState<boolean>(true);
  const [memory, setMemory] = useState<number>(0);
  const [expression, setExpression] = useState<string>("");
  const [tape, setTape] = useState<TapeItem[]>(() => {
    // Initial sample tape for accountants
    return [
      {
        id: "tape-1",
        time: "10:14",
        expression: "15.000 + 4.250",
        result: 19250,
      },
      {
        id: "tape-2",
        time: "10:15",
        expression: "19.250 * 1,20 (KDV)",
        result: 23100,
      },
    ];
  });

  // Tape subtotal calculation
  const tapeSum = useMemo(() => {
    return tape.reduce((acc, item) => acc + item.result, 0);
  }, [tape]);

  // Format number for calculator display (Turkish format)
  const formatCalcNumber = (val: number | string): string => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 4,
    }).format(num);
  };

  // Add digit to display
  const handleInputDigit = (digit: string) => {
    if (isNewEntry) {
      if (digit === "00") {
        setDisplay("0");
      } else {
        setDisplay(digit);
      }
      setIsNewEntry(false);
    } else {
      if (digit === "00" && display === "0") return;
      if (display.length >= 16) return;
      setDisplay(display === "0" && digit !== "." ? digit : display + digit);
    }
  };

  const handleInputDecimal = () => {
    if (isNewEntry) {
      setDisplay("0.");
      setIsNewEntry(false);
    } else if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const handleBackspace = () => {
    if (isNewEntry) return;
    if (display.length <= 1) {
      setDisplay("0");
      setIsNewEntry(true);
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setPrevValue(null);
    setOperation(null);
    setExpression("");
    setIsNewEntry(true);
  };

  const handleToggleSign = () => {
    const current = parseFloat(display) || 0;
    setDisplay(String(-current));
  };

  // Percentage calculation
  const handlePercent = () => {
    const current = parseFloat(display) || 0;
    if (prevValue !== null && operation) {
      // e.g., 1000 + 20% = 1000 + 200
      const pctValue = (prevValue * current) / 100;
      setDisplay(String(pctValue));
    } else {
      setDisplay(String(current / 100));
    }
  };

  // VAT Shortcut on desk calculator (+%20, -%20, +%10, -%10, +%1)
  const handleVatShortcut = (rate: number, isAddition: boolean) => {
    const current = parseFloat(display) || 0;
    let newResult = 0;
    let label = "";

    if (isAddition) {
      newResult = current * (1 + rate / 100);
      label = `${formatCalcNumber(current)} + %${rate} KDV`;
    } else {
      newResult = current / (1 + rate / 100);
      label = `${formatCalcNumber(current)} - %${rate} KDV Hariç`;
    }

    const rounded = Math.round(newResult * 100) / 100;
    setDisplay(String(rounded));
    setIsNewEntry(true);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    setTape((prev) => [
      {
        id: `tape-${Date.now()}`,
        time: timeStr,
        expression: label,
        result: rounded,
      },
      ...prev,
    ]);
  };

  // Execute mathematical operator (+, -, *, /)
  const handleOperator = (nextOp: string) => {
    const current = parseFloat(display) || 0;

    if (prevValue === null) {
      setPrevValue(current);
      setExpression(`${formatCalcNumber(current)} ${nextOp}`);
    } else if (operation) {
      const result = computeResult(prevValue, current, operation);
      setPrevValue(result);
      setDisplay(String(result));
      setExpression(`${formatCalcNumber(result)} ${nextOp}`);
    }

    setOperation(nextOp);
    setIsNewEntry(true);
  };

  // Compute result
  const computeResult = (a: number, b: number, op: string): number => {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "×":
      case "*":
        return a * b;
      case "÷":
      case "/":
        return b !== 0 ? a / b : 0;
      default:
        return b;
    }
  };

  // Equal button (=)
  const handleEquals = () => {
    if (prevValue === null || !operation) return;

    const current = parseFloat(display) || 0;
    const result = computeResult(prevValue, current, operation);
    const rounded = Math.round(result * 10000) / 10000;

    const fullExp = `${formatCalcNumber(prevValue)} ${operation} ${formatCalcNumber(
      current
    )}`;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    // Add to audit tape
    setTape((prev) => [
      {
        id: `tape-${Date.now()}`,
        time: timeStr,
        expression: fullExp,
        result: rounded,
      },
      ...prev,
    ]);

    setExpression(`${fullExp} =`);
    setDisplay(String(rounded));
    setPrevValue(null);
    setOperation(null);
    setIsNewEntry(true);
  };

  // Memory buttons (M+, M-, MR, MC)
  const handleMemoryAdd = () => {
    const current = parseFloat(display) || 0;
    setMemory((m) => m + current);
    setIsNewEntry(true);
  };

  const handleMemorySubtract = () => {
    const current = parseFloat(display) || 0;
    setMemory((m) => m - current);
    setIsNewEntry(true);
  };

  const handleMemoryRecall = () => {
    setDisplay(String(memory));
    setIsNewEntry(true);
  };

  const handleMemoryClear = () => {
    setMemory(0);
  };

  // Keyboard shortcut listener for standard calculator
  useEffect(() => {
    if (activeMode !== "standard") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in another input element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleInputDigit(e.key);
      } else if (e.key === "." || e.key === ",") {
        e.preventDefault();
        handleInputDecimal();
      } else if (e.key === "+" || e.key === "-") {
        e.preventDefault();
        handleOperator(e.key);
      } else if (e.key === "*") {
        e.preventDefault();
        handleOperator("×");
      } else if (e.key === "/") {
        e.preventDefault();
        handleOperator("÷");
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleEquals();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "%") {
        e.preventDefault();
        handlePercent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMode, display, prevValue, operation, isNewEntry]);

  // Export audit tape to txt file
  const handleExportTape = () => {
    if (tape.length === 0) return;
    let txt = "=== HESAP MAKİNESİ İŞLEM FİŞİ (AUDIT TAPE) ===\n";
    txt += `Tarih: ${new Date().toLocaleDateString("tr-TR")}\n`;
    txt += "------------------------------------------------\n\n";

    tape.forEach((item, idx) => {
      txt += `[${item.time}] #${idx + 1}: ${item.expression} = ${formatCalcNumber(
        item.result
      )} TL\n`;
    });

    txt += "\n------------------------------------------------\n";
    txt += `İşlem Adedi: ${tape.length}\n`;
    txt += `Toplam Tutar: ${formatCalcNumber(tapeSum)} TL\n`;

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Hesap_Fisi_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // MODE 2: KDV & TEVKİFAT HESAPLAYICI (VAT & Withholding)
  // =========================================================================
  const [vatAmount, setVatAmount] = useState<string>("10000");
  const [vatDirection, setVatDirection] = useState<"exclusive" | "inclusive">(
    "exclusive"
  );
  const [vatRate, setVatRate] = useState<number>(20);
  const [withholdingRate, setWithholdingRate] = useState<string>("0"); // e.g. "5/10" or "0"

  const vatCalculations = useMemo(() => {
    const rawNum = parseTurkishAmount(vatAmount) || 0;
    const rateDec = vatRate / 100;

    let baseAmount = 0; // Matrah (KDV Hariç)
    let totalVat = 0; // Toplam KDV

    if (vatDirection === "exclusive") {
      baseAmount = rawNum;
      totalVat = baseAmount * rateDec;
    } else {
      baseAmount = rawNum / (1 + rateDec);
      totalVat = rawNum - baseAmount;
    }

    const grandTotal = baseAmount + totalVat;

    // Withholding calculation
    let withholdingAmount = 0;
    let payableVat = totalVat; // Satıcıya ödenecek KDV

    if (withholdingRate !== "0" && totalVat > 0) {
      const parts = withholdingRate.split("/");
      if (parts.length === 2) {
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1]);
        if (den > 0) {
          withholdingAmount = (totalVat * num) / den;
          payableVat = totalVat - withholdingAmount;
        }
      }
    }

    const netPayableToSeller = baseAmount + payableVat;

    return {
      baseAmount,
      totalVat,
      withholdingAmount,
      payableVat,
      grandTotal,
      netPayableToSeller,
    };
  }, [vatAmount, vatDirection, vatRate, withholdingRate]);

  // =========================================================================
  // MODE 3: VADE FARKI & GECİKME FAİZİ (Due Date & Interest)
  // =========================================================================
  const [interestPrincipal, setInterestPrincipal] = useState<string>("50000");
  const [interestDays, setInterestDays] = useState<string>("45");
  const [annualRate, setAnnualRate] = useState<string>("48"); // %48 Yıllık faiz
  const [applyVatToInterest, setApplyVatToInterest] = useState<boolean>(true);

  const interestCalculations = useMemo(() => {
    const principal = parseTurkishAmount(interestPrincipal) || 0;
    const days = parseInt(interestDays, 10) || 0;
    const rate = parseFloat(annualRate) || 0;

    // Standard commercial interest formula: (Principal * Rate * Days) / (365 * 100)
    const rawInterest = (principal * rate * days) / 36500;
    const interestVat = applyVatToInterest ? rawInterest * 0.2 : 0;
    const totalPayable = principal + rawInterest + interestVat;

    const dailyInterest = (principal * rate) / 36500;

    return {
      principal,
      days,
      rawInterest,
      interestVat,
      totalPayable,
      dailyInterest,
    };
  }, [interestPrincipal, interestDays, annualRate, applyVatToInterest]);

  // =========================================================================
  // MODE 4: STOPAJ & SERBEST MESLEK MAKBUZU (SMM & Withholding)
  // =========================================================================
  const [smmDirection, setSmmDirection] = useState<"gross" | "net">("gross");
  const [smmAmount, setSmmAmount] = useState<string>("20000");
  const [smmStopajRate, setSmmStopajRate] = useState<number>(20); // %20
  const [smmVatRate, setSmmVatRate] = useState<number>(20); // %20

  const smmCalculations = useMemo(() => {
    const rawNum = parseTurkishAmount(smmAmount) || 0;
    const stopajDec = smmStopajRate / 100;
    const vatDec = smmVatRate / 100;

    let gross = 0;
    let stopaj = 0;
    let vat = 0;
    let netWage = 0; // Brüt - Stopaj
    let netReceived = 0; // Net Ücret + KDV
    let totalClientCost = 0; // Brüt + KDV

    if (smmDirection === "gross") {
      gross = rawNum;
      stopaj = gross * stopajDec;
      vat = gross * vatDec;
      netWage = gross - stopaj;
      netReceived = netWage + vat;
      totalClientCost = gross + vat;
    } else {
      // Net Received = Gross * (1 - stopaj + vat)
      const denominator = 1 - stopajDec + vatDec;
      gross = denominator > 0 ? rawNum / denominator : 0;
      stopaj = gross * stopajDec;
      vat = gross * vatDec;
      netWage = gross - stopaj;
      netReceived = rawNum;
      totalClientCost = gross + vat;
    }

    return {
      gross,
      stopaj,
      vat,
      netWage,
      netReceived,
      totalClientCost,
    };
  }, [smmDirection, smmAmount, smmStopajRate, smmVatRate]);

  // =========================================================================
  // MODE 5: KAR MARJI, MARKUP & İSKONTO HESABI (Margin & Discount)
  // =========================================================================
  const [costPrice, setCostPrice] = useState<string>("1000");
  const [targetMargin, setTargetMargin] = useState<string>("30"); // %30
  const [discount1, setDiscount1] = useState<string>("10"); // %10
  const [discount2, setDiscount2] = useState<string>("5"); // %5

  const marginCalculations = useMemo(() => {
    const cost = parseTurkishAmount(costPrice) || 0;
    const marginPct = parseFloat(targetMargin) || 0;
    const disc1Pct = parseFloat(discount1) || 0;
    const disc2Pct = parseFloat(discount2) || 0;

    // Base Selling Price before discounts to achieve target markup: Cost * (1 + margin / 100)
    const baseSellingPrice = cost * (1 + marginPct / 100);

    // Apply cascading discounts: Price * (1 - d1) * (1 - d2)
    const afterDisc1 = baseSellingPrice * (1 - disc1Pct / 100);
    const finalPrice = afterDisc1 * (1 - disc2Pct / 100);

    const totalDiscountAmount = baseSellingPrice - finalPrice;
    const netProfit = finalPrice - cost;
    const realizedMarginPct =
      finalPrice > 0 ? (netProfit / finalPrice) * 100 : 0;
    const markupPct = cost > 0 ? (netProfit / cost) * 100 : 0;

    return {
      cost,
      baseSellingPrice,
      totalDiscountAmount,
      finalPrice,
      netProfit,
      realizedMarginPct,
      markupPct,
    };
  }, [costPrice, targetMargin, discount1, discount2]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Calculator Mode Selection Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-2 sm:p-2.5 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2">
          {/* Mode 1: Desk Calculator */}
          <button
            onClick={() => setActiveMode("standard")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMode === "standard"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Calculator className="w-4 h-4 text-emerald-400" />
            <span>Masaüstü Fişli Hesap</span>
          </button>

          {/* Mode 2: VAT & Withholding */}
          <button
            onClick={() => setActiveMode("vat")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMode === "vat"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Percent className="w-4 h-4 text-amber-300" />
            <span>KDV & Tevkifat</span>
          </button>

          {/* Mode 3: Due Date & Interest */}
          <button
            onClick={() => setActiveMode("interest")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMode === "interest"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Calendar className="w-4 h-4 text-sky-300" />
            <span>Vade Farkı & Faiz</span>
          </button>

          {/* Mode 4: SMM & Withholding */}
          <button
            onClick={() => setActiveMode("withholding")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMode === "withholding"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Receipt className="w-4 h-4 text-pink-300" />
            <span>Stopaj & SMM</span>
          </button>

          {/* Mode 5: Profit Margin & Discount */}
          <button
            onClick={() => setActiveMode("margin")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all col-span-2 sm:col-span-1 ${
              activeMode === "margin"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-300" />
            <span>Kar Marjı & İskonto</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. DESK ACCOUNTING CALCULATOR (Fişli Masaüstü Hesap Makinesi)             */}
      {/* ========================================================================= */}
      {activeMode === "standard" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: The Calculator Body */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-4">
            {/* Header info */}
            <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold text-slate-700">
                  Fişli Muhasebe Hesap Makinesi
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                  Klavye Destekli
                </span>
              </div>
              <div className="flex items-center gap-2">
                {memory !== 0 && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                    M: {formatCalcNumber(memory)} ₺
                  </span>
                )}
              </div>
            </div>

            {/* LCD / LED Display Screen */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-inner border border-slate-800 relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono min-h-[20px]">
                <span>{expression || "\u00A0"}</span>
                <button
                  onClick={() => handleCopy(display, "calc-main")}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                  title="Sonucu kopyala"
                >
                  {copiedKey === "calc-main" ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Kopyalandı</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-right text-3xl sm:text-4xl font-mono font-bold tracking-tight text-emerald-400 tabular-nums overflow-x-auto mt-2">
                {formatCalcNumber(display)}
                <span className="text-slate-400 text-lg ml-2 font-normal font-sans">
                  ₺
                </span>
              </div>
            </div>

            {/* Quick Tax Shortcuts Bar */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              <button
                onClick={() => handleVatShortcut(20, true)}
                className="py-1.5 px-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors shadow-2xs"
                title="Tutara %20 KDV ekler"
              >
                +%20 KDV
              </button>
              <button
                onClick={() => handleVatShortcut(20, false)}
                className="py-1.5 px-2 rounded-xl text-xs font-bold bg-blue-50/60 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors shadow-2xs"
                title="KDV dahil tutardan KDV'yi çıkarır (KDV Hariç)"
              >
                -%20 KDV
              </button>
              <button
                onClick={() => handleVatShortcut(10, true)}
                className="py-1.5 px-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors shadow-2xs"
                title="Tutara %10 KDV ekler"
              >
                +%10 KDV
              </button>
              <button
                onClick={() => handleVatShortcut(10, false)}
                className="py-1.5 px-2 rounded-xl text-xs font-bold bg-indigo-50/60 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors shadow-2xs"
                title="KDV dahil tutardan %10 KDV çıkarır"
              >
                -%10 KDV
              </button>
              <button
                onClick={() => handleVatShortcut(1, true)}
                className="py-1.5 px-2 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-colors shadow-2xs"
                title="Tutara %1 KDV ekler"
              >
                +%1 KDV
              </button>
            </div>

            {/* Main Keypad Grid */}
            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
              {/* Row 1: Memory Controls */}
              <button
                onClick={handleMemoryClear}
                className="py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
              >
                MC
              </button>
              <button
                onClick={handleMemoryRecall}
                className="py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
              >
                MR
              </button>
              <button
                onClick={handleMemorySubtract}
                className="py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
              >
                M-
              </button>
              <button
                onClick={handleMemoryAdd}
                className="py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                M+
              </button>

              {/* Row 2: Clear, Backspace, %, Division */}
              <button
                onClick={handleClear}
                className="py-3 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              >
                C / AC
              </button>
              <button
                onClick={handleBackspace}
                className="py-3 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors flex items-center justify-center"
                title="Son basamağı sil"
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                onClick={handlePercent}
                className="py-3 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
              >
                %
              </button>
              <button
                onClick={() => handleOperator("÷")}
                className={`py-3 rounded-xl text-base font-bold transition-colors ${
                  operation === "÷"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-800 bg-slate-200/80 hover:bg-slate-300"
                }`}
              >
                ÷
              </button>

              {/* Row 3: 7, 8, 9, Multiply */}
              <button
                onClick={() => handleInputDigit("7")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                7
              </button>
              <button
                onClick={() => handleInputDigit("8")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                8
              </button>
              <button
                onClick={() => handleInputDigit("9")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                9
              </button>
              <button
                onClick={() => handleOperator("×")}
                className={`py-3 rounded-xl text-base font-bold transition-colors ${
                  operation === "×"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-800 bg-slate-200/80 hover:bg-slate-300"
                }`}
              >
                ×
              </button>

              {/* Row 4: 4, 5, 6, Subtract */}
              <button
                onClick={() => handleInputDigit("4")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                4
              </button>
              <button
                onClick={() => handleInputDigit("5")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                5
              </button>
              <button
                onClick={() => handleInputDigit("6")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                6
              </button>
              <button
                onClick={() => handleOperator("-")}
                className={`py-3 rounded-xl text-base font-bold transition-colors ${
                  operation === "-"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-800 bg-slate-200/80 hover:bg-slate-300"
                }`}
              >
                -
              </button>

              {/* Row 5: 1, 2, 3, Add */}
              <button
                onClick={() => handleInputDigit("1")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                1
              </button>
              <button
                onClick={() => handleInputDigit("2")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                2
              </button>
              <button
                onClick={() => handleInputDigit("3")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                3
              </button>
              <button
                onClick={() => handleOperator("+")}
                className={`py-3 rounded-xl text-base font-bold transition-colors ${
                  operation === "+"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-800 bg-slate-200/80 hover:bg-slate-300"
                }`}
              >
                +
              </button>

              {/* Row 6: 0, 00, Decimal, Equals */}
              <button
                onClick={() => handleInputDigit("0")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                0
              </button>
              <button
                onClick={() => handleInputDigit("00")}
                className="py-3 rounded-xl text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
                title="Çift sıfır"
              >
                00
              </button>
              <button
                onClick={handleInputDecimal}
                className="py-3 rounded-xl text-base font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
              >
                ,
              </button>
              <button
                onClick={handleEquals}
                className="py-3 rounded-xl text-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/30 transition-all active:scale-[0.98]"
              >
                =
              </button>
            </div>
          </div>

          {/* Right: The Paper Tape (Fiş Şeridi / İşlem Geçmişi) */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Fiş Şeridi (İşlem Geçmişi)
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                  {tape.length} Kayıt
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportTape}
                  disabled={tape.length === 0}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Fiş geçmişini metin dosyası olarak indir"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setTape([])}
                  disabled={tape.length === 0}
                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                  title="Fişi temizle"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tape paper roll container */}
            <div className="bg-amber-50/40 border border-amber-200/50 rounded-2xl p-3 min-h-[360px] max-h-[460px] overflow-y-auto font-mono text-xs text-slate-700 flex flex-col justify-between shadow-inner">
              {tape.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                  <Calculator className="w-8 h-8 mb-2 stroke-1 opacity-50" />
                  <p className="font-sans text-xs">Henüz bir işlem yapılmadı.</p>
                  <p className="font-sans text-[11px] text-slate-400 mt-0.5">
                    Yaptığınız tüm hesaplamalar fiş şeklinde burada listelenir.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tape.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setDisplay(String(item.result));
                        setIsNewEntry(true);
                      }}
                      className="p-2.5 rounded-xl bg-white/80 border border-amber-200/60 hover:bg-white hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                        <span>#{tape.length - idx}</span>
                        <span>{item.time}</span>
                      </div>
                      <div className="text-slate-600 truncate">
                        {item.expression}
                      </div>
                      <div className="text-right font-bold text-slate-900 text-sm mt-1 text-emerald-700">
                        = {formatCalcNumber(item.result)} ₺
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tape bottom summary */}
              {tape.length > 0 && (
                <div className="pt-3 border-t border-amber-200/80 mt-3 font-sans">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Fiş Toplamı (∑):</span>
                    <span className="font-bold font-mono text-slate-900 text-sm">
                      {formatCalcNumber(tapeSum)} ₺
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. KDV & TEVKİFAT HESAPLAYICI (VAT & Withholding)                         */}
      {/* ========================================================================= */}
      {activeMode === "vat" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Inputs Column */}
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  KDV & Tevkifat Hesaplama
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                Resmi Oranlar
              </span>
            </div>

            {/* Calculation Direction Tabs */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Hesaplama Yönü
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setVatDirection("exclusive")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    vatDirection === "exclusive"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  KDV Hariçten ➔ Dahile
                </button>
                <button
                  onClick={() => setVatDirection("inclusive")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    vatDirection === "inclusive"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  KDV Dahilden ➔ Harice
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {vatDirection === "exclusive"
                  ? "KDV Hariç Tutar (Matrah)"
                  : "KDV Dahil Toplam Tutar"}{" "}
                (TL)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(e.target.value)}
                  placeholder="10000"
                  className="w-full text-lg font-bold py-2.5 pl-4 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-900"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                  ₺
                </span>
              </div>
            </div>

            {/* VAT Rate Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                KDV Oranı
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[20, 10, 1].map((r) => (
                  <button
                    key={r}
                    onClick={() => setVatRate(r)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      vatRate === r
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    %{r}
                  </button>
                ))}
                <div className="relative">
                  <input
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                    placeholder="Özel"
                    className="w-full text-center py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Withholding (Tevkifat) Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                KDV Tevkifat Oranı (Varsa)
              </label>
              <select
                value={withholdingRate}
                onChange={(e) => setWithholdingRate(e.target.value)}
                className="w-full text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800"
              >
                <option value="0">Tevkifatsız (Normal Fatura)</option>
                <option value="2/10">2/10 (Yapım İşleri ve Projeler)</option>
                <option value="3/10">3/10 (Makine ve Teçhizat Bakım)</option>
                <option value="4/10">4/10 (Yemek Servis Hizmetleri)</option>
                <option value="5/10">5/10 (Ağaç / Orman Ürünleri, Danışmanlık)</option>
                <option value="7/10">7/10 (Temizlik, Güvenlik, Servis Taşımacılığı)</option>
                <option value="9/10">9/10 (Hurda ve Atık Teslimleri)</option>
                <option value="10/10">10/10 (Tam Tevkifat)</option>
              </select>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-6 bg-gradient-to-br from-white via-emerald-50/20 to-slate-50 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm">
                Hesaplama Özeti & Fatura Dağılımı
              </h4>
              <button
                onClick={() =>
                  handleCopy(
                    `Matrah: ${formatCurrency(
                      vatCalculations.baseAmount
                    )}\nToplam KDV (%${vatRate}): ${formatCurrency(
                      vatCalculations.totalVat
                    )}\nTevkifat: ${formatCurrency(
                      vatCalculations.withholdingAmount
                    )}\nÖdenecek Tutar: ${formatCurrency(
                      vatCalculations.netPayableToSeller
                    )}`,
                    "vat-results"
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
              >
                {copiedKey === "vat-results" ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sonuçları Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {/* Main Result Card */}
            <div className="p-4 rounded-2xl bg-white border border-emerald-200/80 shadow-xs flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Satıcıya Ödenecek / Tahsil Edilecek Tutar
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 tabular-nums">
                {formatCurrency(vatCalculations.netPayableToSeller)}
              </div>
              <span className="text-xs text-slate-400">
                (Matrah + Satıcı Payına Düşen KDV)
              </span>
            </div>

            {/* Line items breakdown */}
            <div className="space-y-2 text-sm bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">KDV Hariç Tutar (Matrah):</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatCurrency(vatCalculations.baseAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">
                  Hesaplanan KDV (%{vatRate}):
                </span>
                <span className="font-bold text-blue-700 tabular-nums">
                  {formatCurrency(vatCalculations.totalVat)}
                </span>
              </div>

              {withholdingRate !== "0" && (
                <>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-rose-700">
                    <span>
                      Tevkif Edilen KDV ({withholdingRate} - 2 No'lu KDV):
                    </span>
                    <span className="font-bold tabular-nums">
                      - {formatCurrency(vatCalculations.withholdingAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-emerald-700">
                    <span>Tahsil Edilecek KDV Payı:</span>
                    <span className="font-bold tabular-nums">
                      {formatCurrency(vatCalculations.payableVat)}
                    </span>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-2 text-slate-900 font-bold">
                <span>Fatura Genel Toplamı (KDV Dahil):</span>
                <span className="text-base tabular-nums">
                  {formatCurrency(vatCalculations.grandTotal)}
                </span>
              </div>
            </div>

            {/* Accounting Guide Hint */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Muhasebe Kaydı İpucu: </span>
              {withholdingRate !== "0"
                ? "Tevkifat tutarı alıcı tarafından 2 No'lu KDV beyannamesi ile vergi dairesine, kalan tutar ise satıcıya ödenir."
                : "Standart faturada KDV tutarı 391 Hesaplanan KDV hesabında takip edilir."}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. VADE FARKI & FAİZ HESAPLAYICI (Due Date & Interest)                    */}
      {/* ========================================================================= */}
      {activeMode === "interest" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Vade Farkı & Gecikme Faizi Hesabı
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                365 Gün Bazlı
              </span>
            </div>

            {/* Principal Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Fatura / Borç Tutarı (TL)
              </label>
              <input
                type="text"
                value={interestPrincipal}
                onChange={(e) => setInterestPrincipal(e.target.value)}
                placeholder="50000"
                className="w-full text-lg font-bold py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900"
              />
            </div>

            {/* Days Count */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Gecikme / Vade Gün Sayısı
              </label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[15, 30, 45, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => setInterestDays(String(d))}
                    className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                      interestDays === String(d)
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {d} Gün
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={interestDays}
                onChange={(e) => setInterestDays(e.target.value)}
                placeholder="Örn: 45"
                className="w-full text-sm font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
              />
            </div>

            {/* Interest Rate */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Yıllık Faiz Oranı (%)
              </label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <button
                  onClick={() => setAnnualRate("24")}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                    annualRate === "24"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  %24 (Yasal Faiz)
                </button>
                <button
                  onClick={() => setAnnualRate("48")}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                    annualRate === "48"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  %48 (Ticari Faiz)
                </button>
                <button
                  onClick={() => setAnnualRate("60")}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                    annualRate === "60"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  %60 (Özel)
                </button>
              </div>
              <input
                type="number"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
                placeholder="48"
                className="w-full text-sm font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
              />
            </div>

            {/* VAT Checkbox */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="vatToInterest"
                checked={applyVatToInterest}
                onChange={(e) => setApplyVatToInterest(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <label
                htmlFor="vatToInterest"
                className="text-xs font-medium text-slate-700 cursor-pointer"
              >
                Vade farkı bedeline %20 KDV uygula (Vade farkı faturası için)
              </label>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-6 bg-gradient-to-br from-white via-indigo-50/20 to-slate-50 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm">
                Vade Farkı Hesabı Çıktısı
              </h4>
              <button
                onClick={() =>
                  handleCopy(
                    `Ana Para: ${formatCurrency(
                      interestCalculations.principal
                    )}\nVade Farkı (${interestDays} Gün / %${annualRate}): ${formatCurrency(
                      interestCalculations.rawInterest
                    )}\nKDV (%20): ${formatCurrency(
                      interestCalculations.interestVat
                    )}\nToplam Tahsil Edilecek: ${formatCurrency(
                      interestCalculations.totalPayable
                    )}`,
                    "interest-copy"
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
              >
                {copiedKey === "interest-copy" ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {/* Total Payable Card */}
            <div className="p-4 rounded-2xl bg-white border border-indigo-200/80 shadow-xs flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Toplam Tahsil Edilecek Tutar (Ana Para + Vade Farkı)
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-indigo-700 tabular-nums">
                {formatCurrency(interestCalculations.totalPayable)}
              </div>
            </div>

            {/* Breakdown List */}
            <div className="space-y-2 text-sm bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Ana Para Tutarı:</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatCurrency(interestCalculations.principal)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Gecikme Süresi:</span>
                <span className="font-semibold text-slate-800">
                  {interestDays} Gün
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-indigo-700">
                <span>Hesaplanan Vade Farkı / Faiz:</span>
                <span className="font-bold tabular-nums">
                  + {formatCurrency(interestCalculations.rawInterest)}
                </span>
              </div>

              {applyVatToInterest && (
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-blue-700">
                  <span>Vade Farkı KDV Tutarı (%20):</span>
                  <span className="font-bold tabular-nums">
                    + {formatCurrency(interestCalculations.interestVat)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 text-slate-500 text-xs">
                <span>Günlük Faiz Yükü:</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(interestCalculations.dailyInterest)} / gün
                </span>
              </div>
            </div>

            {/* Ready Invoice Statement Text */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/60 flex flex-col gap-2">
              <span className="text-xs font-bold text-indigo-900">
                Fatura Açıklaması Şablonu:
              </span>
              <div className="text-xs text-indigo-800 font-mono bg-white p-2.5 rounded-xl border border-indigo-100 select-all">
                "{formatCurrency(interestCalculations.principal)} tutarlı faturanın {interestDays} günlük vade farkı bedeli."
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. STOPAJ & SERBEST MESLEK MAKBUZU (SMM & Withholding)                   */}
      {/* ========================================================================= */}
      {activeMode === "withholding" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Stopaj & Serbest Meslek Makbuzu (SMM)
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200">
                SMM Çevirici
              </span>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Hesaplama Türü
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSmmDirection("gross")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    smmDirection === "gross"
                      ? "bg-purple-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Brüt Ücretten ➔ Nete
                </button>
                <button
                  onClick={() => setSmmDirection("net")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    smmDirection === "net"
                      ? "bg-purple-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Net Ele Geçenden ➔ Brüte
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {smmDirection === "gross" ? "Brüt Hizmet Tutarı" : "Net Ele Geçecek Tutar"}{" "}
                (TL)
              </label>
              <input
                type="text"
                value={smmAmount}
                onChange={(e) => setSmmAmount(e.target.value)}
                placeholder="20000"
                className="w-full text-lg font-bold py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-900"
              />
            </div>

            {/* Stopaj Rate */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Gelir Vergisi Stopaj Oranı (%)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[20, 17, 10].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSmmStopajRate(r)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      smmStopajRate === r
                        ? "bg-purple-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    %{r} {r === 20 ? "(Standart)" : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* VAT Rate */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                KDV Oranı (%)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[20, 10].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSmmVatRate(r)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      smmVatRate === r
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    %{r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-6 bg-gradient-to-br from-white via-purple-50/20 to-slate-50 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm">
                Makbuz Dökümü (SMM)
              </h4>
              <button
                onClick={() =>
                  handleCopy(
                    `Brüt Tutar: ${formatCurrency(
                      smmCalculations.gross
                    )}\nStopaj Kesintisi (%${smmStopajRate}): ${formatCurrency(
                      smmCalculations.stopaj
                    )}\nKDV (%${smmVatRate}): ${formatCurrency(
                      smmCalculations.vat
                    )}\nNet Ele Geçen: ${formatCurrency(
                      smmCalculations.netReceived
                    )}\nMüşteri Toplam Ödemesi: ${formatCurrency(
                      smmCalculations.totalClientCost
                    )}`,
                    "smm-copy"
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition-colors"
              >
                {copiedKey === "smm-copy" ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Makbuzu Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {/* Net Received Card */}
            <div className="p-4 rounded-2xl bg-white border border-purple-200/80 shadow-xs flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Meslek Mensubunun Net Ele Geçen Tutarı
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 tabular-nums">
                {formatCurrency(smmCalculations.netReceived)}
              </div>
              <span className="text-xs text-slate-400">
                (Brüt - Stopaj + KDV)
              </span>
            </div>

            {/* Breakdown List */}
            <div className="space-y-2 text-sm bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Brüt Ücret Tutarı:</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatCurrency(smmCalculations.gross)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-rose-700">
                <span>Stopaj Kesintisi (GV %{smmStopajRate}):</span>
                <span className="font-bold tabular-nums">
                  - {formatCurrency(smmCalculations.stopaj)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Net Ücret (Stopaj Sonrası):</span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {formatCurrency(smmCalculations.netWage)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-blue-700">
                <span>KDV Tutarı (%{smmVatRate}):</span>
                <span className="font-bold tabular-nums">
                  + {formatCurrency(smmCalculations.vat)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 text-slate-900 font-bold">
                <span>Müşterinin Yapacağı Toplam Ödeme:</span>
                <span className="text-base tabular-nums">
                  {formatCurrency(smmCalculations.totalClientCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. KAR MARJI, MARKUP & İSKONTO HESABI (Margin & Discount)                  */}
      {/* ========================================================================= */}
      {activeMode === "margin" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Kar Marjı & İskonto Hesaplayıcı
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                Ticari Fiyatlandırma
              </span>
            </div>

            {/* Cost Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alış / Maliyet Fiyatı (TL)
              </label>
              <input
                type="text"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="1000"
                className="w-full text-lg font-bold py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-900"
              />
            </div>

            {/* Target Markup Margin */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Maliyet Üzerine Eklenecek Kar Oranı (Markup %)
              </label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[15, 25, 35, 50].map((m) => (
                  <button
                    key={m}
                    onClick={() => setTargetMargin(String(m))}
                    className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                      targetMargin === String(m)
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    %{m}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={targetMargin}
                onChange={(e) => setTargetMargin(e.target.value)}
                placeholder="30"
                className="w-full text-sm font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800"
              />
            </div>

            {/* Cascading Discounts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  1. İskonto (%)
                </label>
                <input
                  type="number"
                  value={discount1}
                  onChange={(e) => setDiscount1(e.target.value)}
                  placeholder="10"
                  className="w-full text-sm font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  2. Kademeli İskonto (%)
                </label>
                <input
                  type="number"
                  value={discount2}
                  onChange={(e) => setDiscount2(e.target.value)}
                  placeholder="5"
                  className="w-full text-sm font-semibold py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-6 bg-gradient-to-br from-white via-amber-50/20 to-slate-50 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm">
                Fiyatlandırma & Kar Analizi
              </h4>
              <button
                onClick={() =>
                  handleCopy(
                    `Maliyet: ${formatCurrency(
                      marginCalculations.cost
                    )}\nListe Fiyatı: ${formatCurrency(
                      marginCalculations.baseSellingPrice
                    )}\nİskontolar Toplamı: ${formatCurrency(
                      marginCalculations.totalDiscountAmount
                    )}\nNet Satış Fiyatı: ${formatCurrency(
                      marginCalculations.finalPrice
                    )}\nNet Kar: ${formatCurrency(
                      marginCalculations.netProfit
                    )} (%${marginCalculations.realizedMarginPct.toFixed(1)})`,
                    "margin-copy"
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
              >
                {copiedKey === "margin-copy" ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {/* Final Selling Price Card */}
            <div className="p-4 rounded-2xl bg-white border border-amber-200/80 shadow-xs flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                İskontolu Net Satış Fiyatı
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 tabular-nums">
                {formatCurrency(marginCalculations.finalPrice)}
              </div>
              <span className="text-xs text-slate-400">
                (Tüm kademeli iskontolar düşülmüş net satış)
              </span>
            </div>

            {/* Breakdown List */}
            <div className="space-y-2 text-sm bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Alış Maliyeti:</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatCurrency(marginCalculations.cost)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Brüt Liste Satış Fiyatı:</span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {formatCurrency(marginCalculations.baseSellingPrice)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-rose-700">
                <span>Toplam İskonto Tutarı:</span>
                <span className="font-bold tabular-nums">
                  - {formatCurrency(marginCalculations.totalDiscountAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-emerald-700">
                <span>Elde Edilen Net Kar:</span>
                <span className="font-bold tabular-nums">
                  {formatCurrency(marginCalculations.netProfit)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  Gerçekleşen Kar Marjı:
                </span>
                <span className="font-bold text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono">
                  %{marginCalculations.realizedMarginPct.toFixed(2)} (Satış Üzerinden)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
