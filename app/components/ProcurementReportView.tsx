"use client";

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import {
  ComparisonEvaluationReport,
  ProcurementComparison,
  ProcurementCurrency,
} from "../types/procurement";
import { renderElementToPdf } from "../utils/pdfGenerator";

interface ProcurementReportViewProps {
  comparison: ProcurementComparison;
  report: ComparisonEvaluationReport;
  onGoToQuotes: () => void;
}

function formatMoney(amount: number, currency: ProcurementCurrency = "TRY"): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
  return `${symbol}${(Number(amount) || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProcurementReportView({
  comparison,
  report,
  onGoToQuotes,
}: ProcurementReportViewProps) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [backendVerified, setBackendVerified] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const approvedQuotes = comparison.quotes.filter((q) => q.approved);
  const primaryCurrency: ProcurementCurrency = approvedQuotes[0]?.currency || "TRY";

  const handleVerifyOnBackend = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch("/api/procurement/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comparison }),
      });
      const data = await res.json();
      setBackendVerified(Boolean(data?.success));
    } catch {
      setBackendVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Özet & Genel Toplamlar
    const summaryAoa: (string | number)[][] = [
      ["SATIN ALMA TEKLİF KARŞILAŞTIRMA RAPORU"],
      ["Şirket", comparison.companyName || "Yapı Firması"],
      ["Karşılaştırma Adı", comparison.title],
      ["Proje / Şantiye", comparison.projectName || "-"],
      ["Talep Tarihi", comparison.requestDate],
      ["Açıklama", comparison.description || "-"],
      [],
      [
        "Firma Adı",
        "Karşılanan Kalem",
        "Ürün Toplamı (KDV Hariç)",
        "Nakliye (KDV Hariç)",
        "KDV Hariç Ara Toplam",
        "KDV Tutarı",
        "KDV Dahil Genel Toplam",
        "En İyiye Göre Fark",
        "Durum",
      ],
      ...report.supplierTotals.map((s) => [
        s.supplierName,
        `${s.coveredNeedsCount}/${s.totalNeedsCount}`,
        s.productNetTotal,
        s.shippingNetTotal,
        s.subtotalNet,
        s.vatTotal,
        s.grandTotal,
        s.diffFromBestAmount,
        s.isBestOverall ? "EN AVANTAJLI" : s.fullyCoversAllNeeds ? "Tam Teklif" : "Eksik Kalem Var",
      ]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Genel Ozet");

    // Sheet 2: Ürün Bazlı Yan Yana Karşılaştırma
    const productAoa: (string | number)[][] = [];
    for (const nc of report.needComparisons) {
      productAoa.push([
        `Ürün: ${nc.need.name} (${nc.need.quantity} ${nc.need.unit})`,
        ...approvedQuotes.map((q) => q.supplierName),
      ]);
      productAoa.push([
        "Teklif Edilen Miktar",
        ...approvedQuotes.map((q) => {
          const c = nc.cells[q.id];
          return c?.hasOffer ? `${c.offeredQuantity} ${nc.need.unit}` : "Teklif Yok";
        }),
      ]);
      productAoa.push([
        "Birim Fiyat (KDV Hariç)",
        ...approvedQuotes.map((q) => nc.cells[q.id]?.effectiveUnitPriceNet ?? 0),
      ]);
      productAoa.push([
        "Ürün Toplamı",
        ...approvedQuotes.map((q) => nc.cells[q.id]?.productNetTotal ?? 0),
      ]);
      productAoa.push([
        "Nakliye",
        ...approvedQuotes.map((q) => nc.cells[q.id]?.allocatedShippingNet ?? 0),
      ]);
      productAoa.push([
        "KDV Hariç Ara Toplam",
        ...approvedQuotes.map((q) => nc.cells[q.id]?.subtotalNet ?? 0),
      ]);
      productAoa.push([
        "KDV",
        ...approvedQuotes.map((q) => nc.cells[q.id]?.vatTotal ?? 0),
      ]);
      productAoa.push([
        "Genel Toplam (KDV Dahil)",
        ...approvedQuotes.map((q) => nc.cells[q.id]?.grandTotal ?? 0),
      ]);
      productAoa.push([]);
    }
    const wsProducts = XLSX.utils.aoa_to_sheet(productAoa);
    XLSX.utils.book_append_sheet(wb, wsProducts, "Urun Bazli");

    XLSX.writeFile(
      wb,
      `Teklif_Karsilastirma_Raporu_${comparison.title.replace(/\s+/g, "_")}.xlsx`
    );
  };

  const handleExportPdf = async () => {
    if (!printableRef.current) return;
    setIsExportingPdf(true);
    try {
      const { pdf } = await renderElementToPdf(printableRef.current);
      pdf.save(`Teklif_Karsilastirma_Raporu_${comparison.title.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (approvedQuotes.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-black text-slate-900">
          Karşılaştırma Raporu İçin Onaylı Teklif Bulunamadı
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Yapay zekâ veya manuel olarak girilen teklifler, kullanıcı onayından sonra karşılaştırmaya dahil edilir.
          Lütfen &quot;Teklif Detayları&quot; sekmesinden en az bir teklifi onaylayın.
        </p>
        <button
          type="button"
          onClick={onGoToQuotes}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
        >
          Teklif Detaylarına Git
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action & Verification Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleVerifyOnBackend}
            disabled={isVerifying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
          >
            {isVerifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>Backend Hesaplama Doğrula</span>
          </button>
          {backendVerified === true && (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sunucu tarafından doğrulandı
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Raporu İndir</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-colors"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>PDF Raporu İndir</span>
          </button>
        </div>
      </div>

      {/* Warnings (unapproved quotes or missing VAT rates) */}
      {report.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-1">
          {report.warnings.map((w, idx) => (
            <div key={idx} className="text-xs font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Printable Report Root */}
      <div ref={printableRef} className="space-y-6 bg-slate-50/40 p-1 rounded-3xl">
        {/* Report Header Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
              {comparison.companyName || "Satın Alma Karşılaştırma Raporu"}
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-0.5">{comparison.title}</h2>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <strong>Proje / Şantiye:</strong> {comparison.projectName || "-"}
              </span>
              <span>
                <strong>Talep Tarihi:</strong> {comparison.requestDate}
              </span>
              {comparison.description && (
                <span>
                  <strong>Açıklama:</strong> {comparison.description}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              <Award className="w-3.5 h-3.5" />
              En Avantajlı: {report.bestOverallSupplierName || "-"}
            </span>
          </div>
        </div>

        {/* Section 9: Dashboard KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-slate-400">Teklif Veren Firma</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {report.approvedQuoteCount} Firma
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-slate-400">Karşılaştırılan Ürün</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {report.needCount} Kalem
            </div>
          </div>
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-3.5 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-emerald-700">En Düşük Toplam</div>
            <div className="text-lg font-black text-emerald-900 mt-1">
              {formatMoney(report.lowestGrandTotal, primaryCurrency)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-slate-400">En Yüksek Toplam</div>
            <div className="text-lg font-black text-rose-700 mt-1">
              {formatMoney(report.highestGrandTotal, primaryCurrency)}
            </div>
          </div>
          <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-3.5 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-emerald-700">En Avantajlı Firma</div>
            <div className="text-sm font-black text-emerald-900 mt-1 truncate">
              {report.bestOverallSupplierName || "-"}
            </div>
          </div>
          <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-3.5 shadow-sm">
            <div className="text-[10px] font-bold uppercase text-indigo-700 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Potansiyel Tasarruf
            </div>
            <div className="text-lg font-black text-indigo-900 mt-1">
              {formatMoney(report.potentialSavings, primaryCurrency)}
            </div>
          </div>
        </div>

        {/* Section 8: Product-by-Product Side-by-Side Comparison Tables */}
        <div className="space-y-5">
          {report.needComparisons.map((nc) => (
            <div
              key={nc.need.id}
              className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="font-black text-sm text-slate-900">
                  Ürün: {nc.need.name} ({nc.need.quantity} {nc.need.unit})
                </div>
                {nc.bestSupplierName && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                    <Award className="w-3 h-3" /> En Uygun: {nc.bestSupplierName} (
                    {formatMoney(nc.bestGrandTotal, primaryCurrency)})
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="py-2.5 px-4 font-bold text-slate-600 w-48 border-r border-slate-200">
                        Maliyet Kalemi
                      </th>
                      {approvedQuotes.map((q) => {
                        const cell = nc.cells[q.id];
                        const isBest = cell?.isBestForNeed;
                        return (
                          <th
                            key={q.id}
                            className={`py-2.5 px-4 font-extrabold text-right border-r border-slate-200 last:border-r-0 ${
                              isBest ? "bg-emerald-50 text-emerald-900" : "text-slate-900"
                            }`}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {isBest && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px]">
                                  EN AVANTAJLI
                                </span>
                              )}
                              <span>{q.supplierName}</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2 px-4 font-semibold text-slate-600 border-r border-slate-200">
                        İhtiyaç Karşılama
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        if (!c?.hasOffer) {
                          return (
                            <td key={q.id} className="py-2 px-4 text-right text-slate-400 border-r border-slate-200 last:border-r-0">
                              Teklif Yok
                            </td>
                          );
                        }
                        return (
                          <td key={q.id} className="py-2 px-4 text-right border-r border-slate-200 last:border-r-0">
                            {c.fulfillmentStatus === "partial" ? (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[11px]">
                                Kısmi ({c.offeredQuantity}/{nc.need.quantity} — Eksik: {c.missingQuantity})
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-bold">
                                Tam ({c.offeredQuantity} {nc.need.unit})
                              </span>
                            )}
                            {c.moqWarning && (
                              <div className="text-[10px] text-rose-600 font-bold mt-0.5">
                                Min. Sipariş: {c.minOrderQuantity} {nc.need.unit}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td className="py-2 px-4 font-semibold text-slate-600 border-r border-slate-200">
                        Birim Fiyat (KDV Hariç)
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        return (
                          <td key={q.id} className="py-2 px-4 text-right font-semibold tabular-nums border-r border-slate-200 last:border-r-0">
                            {c?.hasOffer ? formatMoney(c.effectiveUnitPriceNet, c.currency) : "—"}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td className="py-2 px-4 font-semibold text-slate-600 border-r border-slate-200">
                        Ürün Toplamı (KDV Hariç)
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        return (
                          <td key={q.id} className="py-2 px-4 text-right font-semibold tabular-nums border-r border-slate-200 last:border-r-0">
                            {c?.hasOffer ? formatMoney(c.productNetTotal, c.currency) : "—"}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td className="py-2 px-4 font-semibold text-slate-600 border-r border-slate-200">
                        Nakliye
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        return (
                          <td key={q.id} className="py-2 px-4 text-right font-semibold tabular-nums border-r border-slate-200 last:border-r-0">
                            {c?.hasOffer ? formatMoney(c.allocatedShippingNet, c.currency) : "—"}
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="bg-slate-50/50">
                      <td className="py-2 px-4 font-bold text-slate-700 border-r border-slate-200">
                        KDV Hariç Ara Toplam
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        return (
                          <td key={q.id} className="py-2 px-4 text-right font-bold tabular-nums border-r border-slate-200 last:border-r-0">
                            {c?.hasOffer ? formatMoney(c.subtotalNet, c.currency) : "—"}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td className="py-2 px-4 font-semibold text-slate-600 border-r border-slate-200">
                        KDV
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        return (
                          <td key={q.id} className="py-2 px-4 text-right tabular-nums border-r border-slate-200 last:border-r-0">
                            {c?.hasOffer ? (
                              c.missingVatRate ? (
                                <span className="text-amber-600 font-bold">KDV Oranı Girilmedi</span>
                              ) : (
                                `${formatMoney(c.vatTotal, c.currency)} (%${c.vatRateUsed})`
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="bg-slate-100/80 font-black">
                      <td className="py-2.5 px-4 text-slate-900 border-r border-slate-200">
                        Genel Toplam (KDV Dahil)
                      </td>
                      {approvedQuotes.map((q) => {
                        const c = nc.cells[q.id];
                        const isBest = c?.isBestForNeed;
                        return (
                          <td
                            key={q.id}
                            className={`py-2.5 px-4 text-right tabular-nums border-r border-slate-200 last:border-r-0 ${
                              isBest ? "bg-emerald-100/80 text-emerald-900" : "text-slate-900"
                            }`}
                          >
                            {c?.hasOffer ? (
                              <div>
                                <div className="text-sm">{formatMoney(c.grandTotal, c.currency)}</div>
                                {c.diffFromBestAmount > 0 && (
                                  <div className="text-[10px] font-bold text-rose-600">
                                    +{formatMoney(c.diffFromBestAmount, c.currency)} (+%{c.diffFromBestPct})
                                  </div>
                                )}
                                {isBest && c.savingsVsWorstAmount > 0 && (
                                  <div className="text-[10px] font-bold text-emerald-700">
                                    %{c.savingsVsWorstPct} tasarruf ({formatMoney(c.savingsVsWorstAmount, c.currency)})
                                  </div>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* Multi-Supplier Split Analysis */}
        {report.splitStrategy.slices.length > 0 && (
          <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-black text-sm text-indigo-900">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Karma / Bölünmüş Satın Alma Analizi (Ayrı Nakliye Dahil)</span>
              </div>
              <span className="text-xs font-bold text-indigo-700">
                Karma Toplam: {formatMoney(report.splitStrategy.totalGrandTotal, primaryCurrency)}
              </span>
            </div>
            <p className="text-xs text-slate-600">{report.splitStrategy.note}</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2 px-3">Ürün</th>
                    <th className="py-2 px-3">Önerilen Firma</th>
                    <th className="py-2 px-3 text-right">Miktar</th>
                    <th className="py-2 px-3 text-right">Ürün Net</th>
                    <th className="py-2 px-3 text-right">Nakliye Net</th>
                    <th className="py-2 px-3 text-right">KDV Dahil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.splitStrategy.slices.map((s, i) => (
                    <tr key={`${s.needId}-${s.quoteId}-${i}`}>
                      <td className="py-2 px-3 font-bold text-slate-900">{s.needName}</td>
                      <td className="py-2 px-3 font-semibold text-indigo-700">{s.supplierName}</td>
                      <td className="py-2 px-3 text-right">
                        {s.allocatedQty} {s.unit}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {formatMoney(s.productNetTotal, primaryCurrency)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {formatMoney(s.shippingNetAllocated, primaryCurrency)}
                      </td>
                      <td className="py-2 px-3 text-right font-black tabular-nums">
                        {formatMoney(s.grandTotal, primaryCurrency)}
                      </td>
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
