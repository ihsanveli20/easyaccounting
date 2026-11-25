"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { ContactCard } from "../types/currentAccounts";
import {
  parseCariContactsExcel,
  parseCariContactsPdfText,
  parseCariTransactionsExcel,
  parseCariTransactionsPdfText,
  type ParsedCariContactRow,
  type ParsedCariTransactionRow,
} from "../utils/currentAccountsImport";

interface CurrentAccountsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: ContactCard[];
  initialMode?: "contacts" | "transactions";
  initialContactId?: string;
  actorName: string;
  onImported: () => Promise<void>;
}

export default function CurrentAccountsImportModal({
  isOpen,
  onClose,
  contacts,
  initialMode = "contacts",
  initialContactId = "",
  actorName,
  onImported,
}: CurrentAccountsImportModalProps) {
  const [importMode, setImportMode] = useState<"contacts" | "transactions">(initialMode);
  const [targetContactId, setTargetContactId] = useState<string>(
    initialContactId || contacts[0]?.id || ""
  );
  const [fileName, setFileName] = useState<string>("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [parsedContacts, setParsedContacts] = useState<ParsedCariContactRow[]>([]);
  const [parsedTx, setParsedTx] = useState<ParsedCariTransactionRow[]>([]);

  if (!isOpen) return null;

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setErrorMsg(null);
    setSuccessMsg(null);
    setParsedContacts([]);
    setParsedTx([]);
    setIsParsing(true);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf")) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
        const data = await res.json();
        const rawText = String(data?.rawText || data?.text || "").trim();
        if (!rawText) {
          setErrorMsg(
            "PDF metni okunamadı veya taranmış görsel içeriyor. Metin tabanlı PDF yükleyin."
          );
          return;
        }
        if (importMode === "contacts") {
          const rows = parseCariContactsPdfText(rawText);
          if (rows.length === 0) {
            setErrorMsg("PDF içinde cari kart bilgisi tespit edilemedi.");
            return;
          }
          setParsedContacts(rows);
        } else {
          const rows = parseCariTransactionsPdfText(rawText);
          if (rows.length === 0) {
            setErrorMsg("PDF içinde tarihli ekstre / hareket satırı tespit edilemedi.");
            return;
          }
          setParsedTx(rows);
        }
      } else if (
        lower.endsWith(".xlsx") ||
        lower.endsWith(".xls") ||
        lower.endsWith(".csv")
      ) {
        const buf = await file.arrayBuffer();
        if (importMode === "contacts") {
          const rows = parseCariContactsExcel(buf);
          if (rows.length === 0) {
            setErrorMsg(
              "Excel içinde cari kart bulunamadı. 'Firma Adı' / 'Ünvan' ve opsiyonel 'Cari Kodu' kolonlarını kontrol edin."
            );
            return;
          }
          setParsedContacts(rows);
        } else {
          const rows = parseCariTransactionsExcel(buf);
          if (rows.length === 0) {
            setErrorMsg(
              "Excel içinde hareket satırı bulunamadı. 'Tarih', 'Açıklama', 'Borç', 'Alacak' kolonlarını kontrol edin."
            );
            return;
          }
          setParsedTx(rows);
        }
      } else {
        setErrorMsg("Lütfen .xlsx, .xls, .csv veya .pdf uzantılı bir dosya seçin.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Dosya okunurken hata oluştu.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsImporting(true);

    try {
      if (importMode === "contacts") {
        const selected = parsedContacts.filter((r) => r.selected);
        if (selected.length === 0) {
          setErrorMsg("Lütfen en az 1 cari kart seçin.");
          return;
        }
        const res = await fetch("/api/current-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "bulk_import_contacts",
            actor: actorName,
            contacts: selected,
          }),
        });
        const data = await res.json();
        if (!data?.success) {
          setErrorMsg(data?.error || "Cari kartlar içe aktarılamadı.");
          return;
        }
        setSuccessMsg(
          `${data.inserted} cari kart eklendi${
            data.skipped > 0 ? ` (${data.skipped} mükerrer/eksik atlandı)` : ""
          }.`
        );
        await onImported();
      } else {
        if (!targetContactId) {
          setErrorMsg("Lütfen hareketlerin ekleneceği cari hesabı seçin.");
          return;
        }
        const selected = parsedTx.filter((r) => r.selected);
        if (selected.length === 0) {
          setErrorMsg("Lütfen en az 1 hareket satırı seçin.");
          return;
        }
        const res = await fetch("/api/current-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "bulk_import_transactions",
            actor: actorName,
            contact_id: targetContactId,
            transactions: selected,
          }),
        });
        const data = await res.json();
        if (!data?.success) {
          setErrorMsg(data?.error || "Hareketler içe aktarılamadı.");
          return;
        }
        setSuccessMsg(`${data.inserted} cari hareketi başarıyla eklendi.`);
        await onImported();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İçe aktarma sırasında hata oluştu.");
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount =
    importMode === "contacts"
      ? parsedContacts.filter((r) => r.selected).length
      : parsedTx.filter((r) => r.selected).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Cari Hesaplar — Excel &amp; PDF Yükleme
              </h3>
              <p className="text-[11px] text-slate-500">
                .xlsx, .xls, .csv veya .pdf dosyasından toplu cari kart ya da ekstre/hareket yükleyin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Mode Switch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setImportMode("contacts");
                setParsedContacts([]);
                setParsedTx([]);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                importMode === "contacts"
                  ? "border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-200"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-slate-900">Toplu Cari Kart Yükle</div>
                <div className="text-[11px] text-slate-500">
                  Excel/PDF listesinden firma kartlarını ve açılış bakiyelerini oluşturur.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setImportMode("transactions");
                setParsedContacts([]);
                setParsedTx([]);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                importMode === "transactions"
                  ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-200"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-slate-900">Cari Ekstre / Hareket Yükle</div>
                <div className="text-[11px] text-slate-500">
                  Excel veya PDF ekstreden tarih, belge no, borç/alacak hareketlerini aktarır.
                </div>
              </div>
            </button>
          </div>

          {importMode === "transactions" && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Hedef Cari Hesap *
              </label>
              <select
                value={targetContactId}
                onChange={(e) => setTargetContactId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
              >
                <option value="">-- Cari Seçin --</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* File Picker */}
          <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100/70 cursor-pointer transition">
            {isParsing ? (
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-indigo-600" />
            )}
            <div className="font-bold text-slate-800">
              {fileName ? `Seçilen Dosya: ${fileName}` : "Excel (.xlsx, .xls, .csv) veya PDF (.pdf) Dosyası Seçin"}
            </div>
            <div className="text-[11px] text-slate-500 text-center">
              {importMode === "contacts"
                ? "Desteklenen kolonlar: Cari Kodu, Firma Adı / Ünvan, Cari Türü, Vergi No, Vergi Dairesi, Telefon, E-posta, Şehir, Borç / Alacak / Bakiye"
                : "Desteklenen kolonlar: Tarih, Belge No, İşlem Türü, Açıklama, Borç, Alacak, Vade Tarihi"}
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="hidden"
              onChange={(e) => void handleFileChange(e.target.files?.[0] || null)}
            />
          </label>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Preview: Contacts */}
          {importMode === "contacts" && parsedContacts.length > 0 && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between font-bold">
                <span>Önizleme ({parsedContacts.length} cari satırı)</span>
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = parsedContacts.every((r) => r.selected);
                    setParsedContacts(
                      parsedContacts.map((r) => ({ ...r, selected: !allSelected }))
                    );
                  }}
                  className="text-indigo-600 hover:underline"
                >
                  Tümünü Seç / Kaldır
                </button>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="p-2">Seç</th>
                      <th className="p-2">Kod</th>
                      <th className="p-2">Firma / Kişi Adı</th>
                      <th className="p-2">Vergi No</th>
                      <th className="p-2">Telefon</th>
                      <th className="p-2 text-right">Açılış Borç</th>
                      <th className="p-2 text-right">Açılış Alacak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedContacts.map((r) => (
                      <tr key={r.tempId} className="hover:bg-slate-50">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) =>
                              setParsedContacts(
                                parsedContacts.map((x) =>
                                  x.tempId === r.tempId
                                    ? { ...x, selected: e.target.checked }
                                    : x
                                )
                              )
                            }
                          />
                        </td>
                        <td className="p-2 font-mono font-bold">{r.code}</td>
                        <td className="p-2 font-semibold">{r.name}</td>
                        <td className="p-2 font-mono">{r.tax_number || "-"}</td>
                        <td className="p-2">{r.phone || "-"}</td>
                        <td className="p-2 text-right font-mono">
                          {r.opening_debit > 0 ? r.opening_debit.toLocaleString("tr-TR") : "-"}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {r.opening_credit > 0 ? r.opening_credit.toLocaleString("tr-TR") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Preview: Transactions */}
          {importMode === "transactions" && parsedTx.length > 0 && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between font-bold">
                <span>Önizleme ({parsedTx.length} hareket satırı)</span>
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = parsedTx.every((r) => r.selected);
                    setParsedTx(parsedTx.map((r) => ({ ...r, selected: !allSelected })));
                  }}
                  className="text-indigo-600 hover:underline"
                >
                  Tümünü Seç / Kaldır
                </button>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="p-2">Seç</th>
                      <th className="p-2">Tarih</th>
                      <th className="p-2">Belge No</th>
                      <th className="p-2">Açıklama</th>
                      <th className="p-2 text-right">Borç</th>
                      <th className="p-2 text-right">Alacak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedTx.map((r) => (
                      <tr key={r.tempId} className="hover:bg-slate-50">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) =>
                              setParsedTx(
                                parsedTx.map((x) =>
                                  x.tempId === r.tempId
                                    ? { ...x, selected: e.target.checked }
                                    : x
                                )
                              )
                            }
                          />
                        </td>
                        <td className="p-2 font-mono">{r.transaction_date}</td>
                        <td className="p-2 font-mono">{r.document_no || "-"}</td>
                        <td className="p-2">{r.description}</td>
                        <td className="p-2 text-right font-mono text-rose-700">
                          {r.debit > 0 ? r.debit.toLocaleString("tr-TR") : "-"}
                        </td>
                        <td className="p-2 text-right font-mono text-emerald-700">
                          {r.credit > 0 ? r.credit.toLocaleString("tr-TR") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700"
          >
            Kapat
          </button>
          <button
            type="button"
            disabled={isImporting || selectedCount === 0}
            onClick={() => void handleImport()}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2"
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>Seçilenleri İçe Aktar ({selectedCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
}

