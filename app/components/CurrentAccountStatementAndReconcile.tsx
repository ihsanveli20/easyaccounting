"use client";

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Loader2,
  MessageCircle,
  Printer,
  Send,
  UploadCloud,
} from "lucide-react";
import {
  AccountTransaction,
  AccountTransactionType,
  CariCurrency,
  ContactCard,
  PdfStatementComparisonReport,
  ReconciliationRecord,
  ReconciliationWorkflowStatus,
} from "../types/currentAccounts";
import {
  compareContactWithPdfLines,
  computeChronologicalLedger,
  getDirectionLabel,
  parseExternalPdfStatementText,
  round2,
  TRANSACTION_TYPE_LABELS,
} from "../utils/currentAccountsEngine";
import { renderElementToPdf } from "../utils/pdfGenerator";
import { openWhatsAppAppOrWeb } from "../utils/whatsapp";

interface StatementAndReconcileProps {
  mode: "statement" | "reconciliation";
  contact: ContactCard;
  transactions: AccountTransaction[];
  reconciliations: ReconciliationRecord[];
  canExport: boolean;
  canCreateReconciliation: boolean;
  canApproveReconciliation: boolean;
  onSaveReconciliation: (rec: Partial<ReconciliationRecord>) => Promise<void>;
}

const RECON_STATUS_LABELS: Record<ReconciliationWorkflowStatus, string> = {
  preparing: "Hazırlanıyor",
  sent: "Gönderildi",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  difference_reported: "Fark Bildirildi",
  awaiting_reply: "Yanıt Bekleniyor",
};

function fmtMoney(n: number, curr: CariCurrency = "TRY"): string {
  const sym = curr === "USD" ? "$" : curr === "EUR" ? "€" : "₺";
  return `${sym}${(Number(n) || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CurrentAccountStatementAndReconcile({
  mode,
  contact,
  transactions,
  reconciliations,
  canExport,
  canCreateReconciliation,
  canApproveReconciliation,
  onSaveReconciliation,
}: StatementAndReconcileProps) {
  const printableRef = useRef<HTMLDivElement>(null);
  const pdfCompareInputRef = useRef<HTMLInputElement>(null);

  // Statement filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("all");
  const [docNoFilter, setDocNoFilter] = useState("");
  const [dcFilter, setDcFilter] = useState<"all" | "debit" | "credit">("all");
  const [currFilter, setCurrFilter] = useState<string>("all");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Reconciliation form
  const [recStart, setRecStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [recEnd, setRecEnd] = useState(() => new Date().toISOString().split("T")[0]);
  const [recCounterAmount, setRecCounterAmount] = useState("");
  const [recCounterDir, setRecCounterDir] = useState<"Borç" | "Alacak">("Borç");
  const [recDiffNote, setRecDiffNote] = useState("");
  const [recStatus, setRecStatus] = useState<ReconciliationWorkflowStatus>("preparing");

  // PDF Statement Auto-Comparison state (read-only)
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfCompareReport, setPdfCompareReport] =
    useState<PdfStatementComparisonReport | null>(null);
  const [pdfParseError, setPdfParseError] = useState<string | null>(null);

  const contactTx = useMemo(
    () => transactions.filter((t) => t.contact_id === contact.id && !t.is_cancelled),
    [transactions, contact.id]
  );

  // Compute opening balance prior to startDate
  const { openingBalance, filteredLedger, closingBalance } = useMemo(() => {
    const sorted = [...contactTx].sort((a, b) =>
      a.transaction_date.localeCompare(b.transaction_date)
    );

    let opening = 0;
    const inRange: AccountTransaction[] = [];

    for (const tx of sorted) {
      if (startDate && tx.transaction_date < startDate) {
        opening = round2(opening + (tx.tl_debit || tx.debit) - (tx.tl_credit || tx.credit));
        continue;
      }
      if (endDate && tx.transaction_date > endDate) continue;
      if (txTypeFilter !== "all" && tx.transaction_type !== txTypeFilter) continue;
      if (
        docNoFilter.trim() &&
        !(tx.document_no || "").toLowerCase().includes(docNoFilter.trim().toLowerCase())
      ) {
        continue;
      }
      if (dcFilter === "debit" && (tx.tl_debit || tx.debit) <= 0) continue;
      if (dcFilter === "credit" && (tx.tl_credit || tx.credit) <= 0) continue;
      if (currFilter !== "all" && tx.currency !== currFilter) continue;
      inRange.push(tx);
    }

    const ledger = computeChronologicalLedger(inRange, opening);
    const closing =
      ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : opening;

    return { openingBalance: opening, filteredLedger: ledger, closingBalance: closing };
  }, [contactTx, startDate, endDate, txTypeFilter, docNoFilter, dcFilter, currFilter]);

  const handleExportStatementExcel = () => {
    const rows = filteredLedger.map((r) => ({
      "İşlem Tarihi": r.transaction_date,
      "Belge No": r.document_no || "-",
      "İşlem Türü": TRANSACTION_TYPE_LABELS[r.transaction_type],
      Açıklama: r.description,
      Borç: r.tl_debit || r.debit,
      Alacak: r.tl_credit || r.credit,
      Bakiye: Math.abs(r.runningBalance),
      Durum: r.runningDirection,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Cari Ekstre");
    XLSX.writeFile(wb, `Ekstre_${contact.code}_${contact.name.replace(/\s+/g, "_")}.xlsx`);
  };

  const handleExportStatementCsv = () => {
    const header = "Tarih;Belge No;Tur;Aciklama;Borc;Alacak;Bakiye;Yon\n";
    const body = filteredLedger
      .map(
        (r) =>
          `${r.transaction_date};${r.document_no || ""};${
            TRANSACTION_TYPE_LABELS[r.transaction_type]
          };"${(r.description || "").replace(/"/g, '""')}";${r.tl_debit || r.debit};${
            r.tl_credit || r.credit
          };${Math.abs(r.runningBalance)};${r.runningDirection}`
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + body], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ekstre_${contact.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportStatementPdf = async () => {
    if (!printableRef.current) return;
    setIsExportingPdf(true);
    try {
      const { pdf } = await renderElementToPdf(printableRef.current);
      pdf.save(`Cari_Ekstre_${contact.code}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Reconciliation period balance
  const periodBalance = useMemo(() => {
    const inPeriod = contactTx.filter(
      (t) =>
        (!recStart || t.transaction_date >= recStart) &&
        (!recEnd || t.transaction_date <= recEnd)
    );
    const net = round2(
      inPeriod.reduce((s, t) => s + (t.tl_debit || t.debit) - (t.tl_credit || t.credit), 0)
    );
    return {
      amount: Math.abs(net),
      signed: net,
      direction: getDirectionLabel(net),
    };
  }, [contactTx, recStart, recEnd]);

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    const counterAmt = recCounterAmount.trim() ? Number(recCounterAmount) : null;
    let diffAmt = 0;
    if (counterAmt !== null && Number.isFinite(counterAmt)) {
      const counterSigned = recCounterDir === "Borç" ? counterAmt : -counterAmt;
      diffAmt = round2(periodBalance.signed - counterSigned);
    }

    await onSaveReconciliation({
      contact_id: contact.id,
      start_date: recStart,
      end_date: recEnd,
      balance_date: recEnd,
      system_amount: periodBalance.amount,
      system_direction: periodBalance.direction,
      counterparty_amount: counterAmt,
      counterparty_direction: counterAmt !== null ? recCounterDir : null,
      difference_amount: diffAmt,
      difference_note: recDiffNote.trim() || null,
      status: recStatus,
    });
  };

  const handleUploadCounterpartyPdf = async (file: File) => {
    setIsParsingPdf(true);
    setPdfParseError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
      const data = await res.json();
      const rawText = data?.rawText || data?.text || "";
      if (!rawText) {
        setPdfParseError(
          "PDF metni okunamadı veya taranmış görsel içeriyor. Metin tabanlı PDF ekstre yükleyin."
        );
        return;
      }
      const externalLines = parseExternalPdfStatementText(rawText);
      if (externalLines.length === 0) {
        setPdfParseError("PDF içinde tarihli ekstre satırı tespit edilemedi.");
        return;
      }
      const report = compareContactWithPdfLines(contact.id, contactTx, externalLines);
      setPdfCompareReport(report);
    } catch (err: unknown) {
      setPdfParseError(err instanceof Error ? err.message : "PDF karşılaştırma hatası.");
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleExportPdfComparisonExcel = () => {
    if (!pdfCompareReport) return;
    const rows = pdfCompareReport.rows.map((r) => ({
      Durum: r.category,
      "Sistem Tarih": r.internalTx?.transaction_date || "-",
      "Sistem Belge": r.internalTx?.document_no || "-",
      "Sistem Borç": r.internalTx?.debit || 0,
      "Sistem Alacak": r.internalTx?.credit || 0,
      "Ekstre Tarih": r.externalLine?.date || "-",
      "Ekstre Belge": r.externalLine?.documentNo || "-",
      "Ekstre Borç": r.externalLine?.debit || 0,
      "Ekstre Alacak": r.externalLine?.credit || 0,
      Açıklama: r.note,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Mutabakat Karsilastirma");
    XLSX.writeFile(wb, `PDF_Mutabakat_${contact.code}.xlsx`);
  };

  if (mode === "statement") {
    return (
      <div className="space-y-4">
        {/* Statement Filters */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 flex-1">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Başlangıç</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Bitiş</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">İşlem Türü</label>
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                <option value="all">Tümü</option>
                {(Object.keys(TRANSACTION_TYPE_LABELS) as AccountTransactionType[]).map((k) => (
                  <option key={k} value={k}>
                    {TRANSACTION_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Belge No</label>
              <input
                type="text"
                value={docNoFilter}
                onChange={(e) => setDocNoFilter(e.target.value)}
                placeholder="Ara..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Borç / Alacak</label>
              <select
                value={dcFilter}
                onChange={(e) => setDcFilter(e.target.value as "all" | "debit" | "credit")}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                <option value="all">Tümü</option>
                <option value="debit">Sadece Borç</option>
                <option value="credit">Sadece Alacak</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Para Birimi</label>
              <select
                value={currFilter}
                onChange={(e) => setCurrFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                <option value="all">Tümü</option>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {canExport && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportStatementPdf}
                disabled={isExportingPdf}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={handleExportStatementExcel}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportStatementCsv}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Yazdır</span>
              </button>
            </div>
          )}
        </div>

        {/* Printable Corporate Statement */}
        <div
          ref={printableRef}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                RESMÎ CARİ HESAP EKSTRESİ
              </div>
              <h3 className="text-lg font-black text-slate-900 mt-0.5">{contact.name}</h3>
              <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                <div>
                  <strong>Cari Kodu:</strong> {contact.code} •{" "}
                  <strong>Vergi Dairesi / No:</strong> {contact.tax_office || "-"} /{" "}
                  {contact.tax_number || "-"}
                </div>
                <div>
                  <strong>Adres:</strong> {contact.billing_address || contact.address || "-"}
                </div>
              </div>
            </div>
            <div className="text-right text-xs space-y-1">
              <div>
                <strong>Tarih Aralığı:</strong> {startDate || "Başlangıç"} —{" "}
                {endDate || "Bugün"}
              </div>
              <div>
                <strong>Açılış Bakiyesi:</strong>{" "}
                <span className="font-bold">
                  {fmtMoney(Math.abs(openingBalance))} ({getDirectionLabel(openingBalance)})
                </span>
              </div>
              <div>
                <strong>Kapanış Bakiyesi:</strong>{" "}
                <span className="font-black text-indigo-700">
                  {fmtMoney(Math.abs(closingBalance))} ({getDirectionLabel(closingBalance)})
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3">Belge No</th>
                  <th className="py-2.5 px-3">Tür</th>
                  <th className="py-2.5 px-3">Açıklama</th>
                  <th className="py-2.5 px-3 text-right">Borç</th>
                  <th className="py-2.5 px-3 text-right">Alacak</th>
                  <th className="py-2.5 px-3 text-right">Bakiye</th>
                  <th className="py-2.5 px-3 text-center">B/A</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-slate-50/50 font-semibold text-slate-600">
                  <td colSpan={4} className="py-2 px-3">
                    Devreden Açılış Bakiyesi
                  </td>
                  <td className="py-2 px-3 text-right">-</td>
                  <td className="py-2 px-3 text-right">-</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {fmtMoney(Math.abs(openingBalance))}
                  </td>
                  <td className="py-2 px-3 text-center">{getDirectionLabel(openingBalance)}</td>
                </tr>
                {filteredLedger.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 whitespace-nowrap">{r.transaction_date}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">{r.document_no || "-"}</td>
                    <td className="py-2 px-3">{TRANSACTION_TYPE_LABELS[r.transaction_type]}</td>
                    <td className="py-2 px-3">{r.description}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                      {(r.tl_debit || r.debit) > 0 ? fmtMoney(r.tl_debit || r.debit) : "-"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">
                      {(r.tl_credit || r.credit) > 0 ? fmtMoney(r.tl_credit || r.credit) : "-"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-black">
                      {fmtMoney(Math.abs(r.runningBalance))}
                    </td>
                    <td className="py-2 px-3 text-center font-bold">{r.runningDirection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // MODE = RECONCILIATION (Mutabakat + PDF Ekstre Otomatik Karşılaştırma)
  return (
    <div className="space-y-6">
      {/* 1. Create / Share Reconciliation Record */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-slate-900">Cari Mutabakat Oluştur &amp; Paylaş</h4>
            <p className="text-xs text-slate-500">
              Dönem bakiyesi: <strong>{fmtMoney(periodBalance.amount)} ({periodBalance.direction})</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                openWhatsAppAppOrWeb(
                  contact.phone || "",
                  `Sayın *${contact.name}*,\n${recStart} - ${recEnd} tarihleri arası cari hesap mutabakat bakiyemiz *${fmtMoney(
                    periodBalance.amount
                  )} (${periodBalance.direction})* şeklindedir. Teyidinizi rica ederiz.`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1fb858] text-white text-xs font-bold"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp Paylaş</span>
            </button>
          </div>
        </div>

        {canCreateReconciliation && (
          <form onSubmit={handleCreateReconciliation} className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Başlangıç</label>
              <input
                type="date"
                value={recStart}
                onChange={(e) => setRecStart(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Bitiş / Bakiye Tarihi</label>
              <input
                type="date"
                value={recEnd}
                onChange={(e) => setRecEnd(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Karşı Taraf Tutarı</label>
              <input
                type="number"
                step="any"
                value={recCounterAmount}
                onChange={(e) => setRecCounterAmount(e.target.value)}
                placeholder="Opsiyonel"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-right"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Karşı Taraf Yönü</label>
              <select
                value={recCounterDir}
                onChange={(e) => setRecCounterDir(e.target.value as "Borç" | "Alacak")}
                className="w-full px-2 py-2 rounded-xl border border-slate-300 bg-white"
              >
                <option value="Borç">Borç</option>
                <option value="Alacak">Alacak</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Mutabakat Durumu</label>
              <select
                value={recStatus}
                onChange={(e) => setRecStatus(e.target.value as ReconciliationWorkflowStatus)}
                className="w-full px-2 py-2 rounded-xl border border-slate-300 bg-white"
              >
                {(Object.keys(RECON_STATUS_LABELS) as ReconciliationWorkflowStatus[]).map((st) => (
                  <option
                    key={st}
                    value={st}
                    disabled={st === "approved" && !canApproveReconciliation}
                  >
                    {RECON_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold inline-flex items-center justify-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kaydet</span>
              </button>
            </div>
            <div className="sm:col-span-6">
              <input
                type="text"
                value={recDiffNote}
                onChange={(e) => setRecDiffNote(e.target.value)}
                placeholder="Fark açıklaması veya mutabakat notu..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
            </div>
          </form>
        )}

        {/* Reconciliation History */}
        {reconciliations.filter((r) => r.contact_id === contact.id).length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2 px-3">Dönem</th>
                  <th className="py-2 px-3 text-right">Sistem Bakiyesi</th>
                  <th className="py-2 px-3 text-right">Karşı Taraf</th>
                  <th className="py-2 px-3 text-right">Fark</th>
                  <th className="py-2 px-3">Durum</th>
                  <th className="py-2 px-3">Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reconciliations
                  .filter((r) => r.contact_id === contact.id)
                  .map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {r.start_date} — {r.end_date}
                      </td>
                      <td className="py-2 px-3 text-right font-bold">
                        {fmtMoney(r.system_amount)} ({r.system_direction})
                      </td>
                      <td className="py-2 px-3 text-right">
                        {r.counterparty_amount !== null && r.counterparty_amount !== undefined
                          ? `${fmtMoney(r.counterparty_amount)} (${r.counterparty_direction || "-"})`
                          : "-"}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-rose-600">
                        {r.difference_amount !== 0 ? fmtMoney(r.difference_amount) : "0,00"}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                          {RECON_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{r.difference_note || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. PDF Ekstre ile Otomatik Karşılaştırma (Read-Only Analysis) */}
      <div className="bg-white rounded-2xl border border-indigo-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-indigo-950 flex items-center gap-1.5">
              <GitCompareArrows className="w-4 h-4 text-indigo-600" />
              <span>PDF Ekstre ile Otomatik Karşılaştırma (Salt Analiz)</span>
            </h4>
            <p className="text-xs text-slate-500">
              Karşı taraftan gelen PDF ekstreyi yükleyin; sistem mevcut cari hareketlerinizi değiştirmeden satır bazlı fark analizi yapar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={pdfCompareInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadCounterpartyPdf(f);
              }}
            />
            <button
              type="button"
              onClick={() => pdfCompareInputRef.current?.click()}
              disabled={isParsingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
            >
              {isParsingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              <span>Karşı Taraf PDF Ekstre Yükle</span>
            </button>
            {pdfCompareReport && (
              <button
                type="button"
                onClick={handleExportPdfComparisonExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel Raporu</span>
              </button>
            )}
          </div>
        </div>

        {pdfParseError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pdfParseError}</span>
          </div>
        )}

        {pdfCompareReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-700">Tam Eşleşen</div>
                <div className="text-lg font-black text-emerald-900">
                  {pdfCompareReport.exactCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-700">Farklı Kayıtlar</div>
                <div className="text-lg font-black text-amber-900">
                  {pdfCompareReport.diffCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <div className="text-[10px] font-bold text-rose-700">Sistemde Olmayan</div>
                <div className="text-lg font-black text-rose-900">
                  {pdfCompareReport.onlyExternalCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-600">Ekstrede Olmayan</div>
                <div className="text-lg font-black text-slate-900">
                  {pdfCompareReport.onlyInternalCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-[10px] font-bold text-indigo-700">Kapanış Bakiye Farkı</div>
                <div className="text-base font-black text-indigo-900">
                  {fmtMoney(pdfCompareReport.closingBalanceDifference)}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2 px-3">Eşleşme</th>
                    <th className="py-2 px-3">Sistem Hareketi</th>
                    <th className="py-2 px-3">Karşı Taraf PDF Satırı</th>
                    <th className="py-2 px-3">Tespit / Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pdfCompareReport.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 px-3 font-bold">
                        {r.category === "exact" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Tam
                          </span>
                        ) : (
                          <span className="text-amber-700">{r.category}</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {r.internalTx
                          ? `${r.internalTx.transaction_date} | ${r.internalTx.document_no || "-"} | ${fmtMoney(
                              r.internalTx.debit || r.internalTx.credit
                            )}`
                          : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {r.externalLine
                          ? `${r.externalLine.date} | ${r.externalLine.documentNo || "-"} | ${fmtMoney(
                              r.externalLine.debit || r.externalLine.credit
                            )}`
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

