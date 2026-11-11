import * as XLSX from "xlsx";
import {
  ComparisonReportPayload,
  ProductComparisonRow,
  StandardInvoiceDocument,
} from "../types/invoiceComparison";
import { renderElementToPdf } from "./pdfGenerator";

const STATUS_LABELS: Record<ProductComparisonRow["status"], string> = {
  matched: "Eşleşti",
  needs_approval: "Onay / İnceleme Bekliyor",
  unmatched: "Eşleşmedi",
  only_incoming: "Sadece Gelen Faturada",
  only_outgoing: "Sadece Giden Faturada",
};

function buildDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Generates and downloads a 6-sheet Excel (.xlsx) comparison workbook:
 * 1. Genel Özet
 * 2. Ürün Karşılaştırma
 * 3. Eşleşen Ürünler
 * 4. Eşleşmeyen Ürünler
 * 5. Şüpheli Eşleşmeler
 * 6. Fatura Kalemleri Detayı
 */
export function exportComparisonToExcel(
  report: ComparisonReportPayload,
  allInvoices: StandardInvoiceDocument[],
  fileNamePrefix = "fatura_urun_karsilastirma"
): void {
  const wb = XLSX.utils.book_new();
  const invoiceMap = new Map<string, StandardInvoiceDocument>();
  allInvoices.forEach((inv) => invoiceMap.set(inv.id, inv));

  // Sheet 1: 1. Genel Özet
  const summaryRows: unknown[][] = [
    ["FATURA KARŞILAŞTIRMA VE ANALİZ — GENEL ÖZET"],
    ["Rapor Tarihi", new Date(report.generatedAt).toLocaleString("tr-TR")],
    ["Not", "Bu rapor geçici dosya analizi sonucudur; kalıcı fatura kaydı oluşturmaz."],
    [],
    ["Gösterge", "Değer"],
    ["Yüklenen Gelen Fatura (Alış) Sayısı", report.summary.incomingInvoiceCount],
    ["Yüklenen Giden Fatura (Satış) Sayısı", report.summary.outgoingInvoiceCount],
    ["Toplam Gelen Ürün Kalemi", report.summary.totalIncomingLines],
    ["Toplam Giden Ürün Kalemi", report.summary.totalOutgoingLines],
    ["Merkezi Ürün Kartı Sayısı", report.comparisonRows.length],
    ["Eşleşen Ürün Sayısı", report.summary.matchedProductCount],
    ["İncelenmesi Gereken (Şüpheli) Kalem Sayısı", report.summary.needsReviewCount],
    ["Eşleşmeyen / Tek Taraflı Kalem Sayısı", report.summary.unmatchedLineCount],
    ["Sadece Gelen Faturalarda Olan Ürün", report.summary.onlyIncomingCount],
    ["Sadece Giden Faturalarda Olan Ürün", report.summary.onlyOutgoingCount],
    ["Toplam Gelen Fatura Tutarı (Net)", report.summary.totalIncomingAmount],
    ["Toplam Giden Fatura Tutarı (Net)", report.summary.totalOutgoingAmount],
    [
      "Tutar Farkı (Giden - Gelen)",
      Number((report.summary.totalOutgoingAmount - report.summary.totalIncomingAmount).toFixed(2)),
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 44 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "1. Genel Özet");

  // Helper to format ProductComparisonRow table
  const comparisonHeader = [
    "Merkezi Ürün Kartı",
    "Ürün Ailesi",
    "Çeşitler",
    "Baz Birim",
    "Gelen Miktar",
    "Gelen Tutar (Net)",
    "Ort. Alış Birim Fiyat",
    "Giden Miktar",
    "Giden Tutar (Net)",
    "Ort. Satış Birim Fiyat",
    "Miktar Farkı (Gelen - Giden)",
    "Tutar Farkı (Giden - Gelen)",
    "Güven Skoru (%)",
    "Durum",
    "Birim Uyarısı",
    "Eşleştirme Nedeni",
  ];

  const rowToAoA = (r: ProductComparisonRow): unknown[] => [
    r.productName,
    r.canonicalFamily || "-",
    r.varieties.join(", ") || "-",
    r.baseUnit,
    r.incomingQuantity,
    r.incomingAmount,
    r.incomingUnitPriceAvg ?? "",
    r.outgoingQuantity,
    r.outgoingAmount,
    r.outgoingUnitPriceAvg ?? "",
    r.quantityDifference,
    r.amountDifference,
    r.confidenceScore,
    STATUS_LABELS[r.status],
    r.unitConflictWarning ? `Farklı Birimler: ${r.unitBreakdownLabel}` : "Uyumlu",
    r.reasonSummary.join(" | "),
  ];

  // Sheet 2: 2. Ürün Karşılaştırma
  const compareRowsAoA: unknown[][] = [comparisonHeader];
  for (const r of report.comparisonRows) {
    compareRowsAoA.push(rowToAoA(r));
  }
  const wsCompare = XLSX.utils.aoa_to_sheet(compareRowsAoA);
  wsCompare["!cols"] = [
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCompare, "2. Ürün Karşılaştırma");

  // Sheet 3: 3. Eşleşen Ürünler
  const matchedAoA: unknown[][] = [comparisonHeader];
  for (const r of report.comparisonRows) {
    if (r.status === "matched") matchedAoA.push(rowToAoA(r));
  }
  const wsMatched = XLSX.utils.aoa_to_sheet(matchedAoA);
  wsMatched["!cols"] = wsCompare["!cols"];
  XLSX.utils.book_append_sheet(wb, wsMatched, "3. Eşleşen Ürünler");

  // Sheet 4: 4. Eşleşmeyen Ürünler
  const unmatchedHeader = [
    "Yön",
    "Fatura No",
    "Fatura Tarihi",
    "Satıcı / Alıcı",
    "Orijinal Ürün Adı",
    "Orijinal Açıklama",
    "Miktar",
    "Birim",
    "Normalize Miktar",
    "Normalize Birim",
    "Satır Tutarı",
    "Merkezi Kart / Durum",
    "Neden",
  ];
  const unmatchedAoA: unknown[][] = [unmatchedHeader];
  for (const { line, invoice, assignment } of report.unmatchedLines) {
    unmatchedAoA.push([
      line.direction === "incoming" ? "Gelen (Alış)" : "Giden (Satış)",
      invoice.invoiceNo || invoice.fileName,
      invoice.invoiceDate || "",
      line.direction === "incoming" ? invoice.sellerName : invoice.buyerName,
      line.originalProductName,
      line.originalDescription,
      line.quantity ?? "",
      line.unit,
      line.measurement?.normalizedQuantity ?? "",
      line.measurement?.normalizedBaseUnit ?? "",
      line.lineTotal ?? "",
      assignment.centralProductName,
      assignment.matchReason,
    ]);
  }
  const wsUnmatched = XLSX.utils.aoa_to_sheet(unmatchedAoA);
  wsUnmatched["!cols"] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 28 },
    { wch: 28 },
    { wch: 32 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 44 },
  ];
  XLSX.utils.book_append_sheet(wb, wsUnmatched, "4. Eşleşmeyen Ürünler");

  // Sheet 5: 5. Şüpheli Eşleşmeler
  const suspiciousHeader = [
    "Yön",
    "Fatura No",
    "Orijinal Ürün Adı",
    "Orijinal Açıklama",
    "Önerilen Merkezi Ürün",
    "Güven Skoru (%)",
    "Uyarılar",
    "Eşleştirme Nedeni",
  ];
  const suspiciousAoA: unknown[][] = [suspiciousHeader];
  for (const { line, invoice, assignment } of report.suspiciousAssignments) {
    suspiciousAoA.push([
      line.direction === "incoming" ? "Gelen (Alış)" : "Giden (Satış)",
      invoice.invoiceNo || invoice.fileName,
      line.originalProductName,
      line.originalDescription,
      assignment.suggestedProductName || assignment.centralProductName,
      assignment.confidenceScore,
      assignment.conflictWarnings.join(" | "),
      assignment.matchReason,
    ]);
  }
  const wsSuspicious = XLSX.utils.aoa_to_sheet(suspiciousAoA);
  wsSuspicious["!cols"] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 28 },
    { wch: 32 },
    { wch: 26 },
    { wch: 14 },
    { wch: 32 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSuspicious, "5. Şüpheli Eşleşmeler");

  // Sheet 6: 6. Fatura Kalemleri Detayı
  const detailHeader = [
    "Merkezi Ürün Kartı",
    "Yön",
    "Fatura No",
    "Fatura Tarihi",
    "Satıcı Firma",
    "Alıcı Firma",
    "Orijinal Ürün Adı",
    "Orijinal Açıklama",
    "Orijinal Miktar",
    "Orijinal Birim",
    "Normalize Miktar",
    "Baz Birim",
    "Dönüşüm Açıklaması",
    "Birim Fiyat",
    "KDV %",
    "KDV Tutarı",
    "Satır Tutarı (Net)",
    "Güven (%)",
    "Onay Durumu",
    "Karar Kaynağı",
    "Eşleşme Nedeni",
  ];
  const detailRows: unknown[][] = [detailHeader];
  for (const row of report.comparisonRows) {
    const assignmentMap = new Map<string, (typeof row.assignments)[number]>();
    for (const a of row.assignments) {
      assignmentMap.set(a.lineId, a);
    }
    const allLines = [...row.incomingLines, ...row.outgoingLines];
    for (const line of allLines) {
      const inv = invoiceMap.get(line.invoiceId);
      const assignment = assignmentMap.get(line.id);
      detailRows.push([
        row.productName,
        line.direction === "incoming" ? "Gelen (Alış)" : "Giden (Satış)",
        inv?.invoiceNo || inv?.fileName || "",
        inv?.invoiceDate || "",
        inv?.sellerName || "",
        inv?.buyerName || "",
        line.originalProductName,
        line.originalDescription,
        line.quantity ?? "",
        line.unit,
        line.measurement?.normalizedQuantity ?? "",
        line.measurement?.normalizedBaseUnit ?? "",
        line.measurement?.conversionExplanation || "",
        line.unitPrice ?? "",
        line.vatRate ?? "",
        line.vatAmount ?? "",
        line.lineTotal ?? "",
        assignment?.confidenceScore ?? "",
        assignment?.approvalStatus || "",
        assignment?.decisionOrigin || "",
        assignment?.matchReason || "",
      ]);
    }
  }
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 20 },
    { wch: 12 },
    { wch: 24 },
    { wch: 24 },
    { wch: 28 },
    { wch: 30 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 28 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 44 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "6. Fatura Kalemleri Detayı");

  XLSX.writeFile(wb, `${fileNamePrefix}_${buildDateStamp()}.xlsx`);
}

/**
 * Exports standardized comparison report as JSON download.
 */
export function exportComparisonToJson(
  report: ComparisonReportPayload,
  allInvoices: StandardInvoiceDocument[],
  fileNamePrefix = "fatura_urun_karsilastirma"
): void {
  const payload = {
    module: "Fatura Karşılaştırma ve Analiz",
    ephemeral: true,
    generatedAt: report.generatedAt,
    summary: report.summary,
    centralProducts: report.centralProducts,
    comparisonRows: report.comparisonRows.map((r) => ({
      centralProductId: r.centralProductId,
      productName: r.productName,
      canonicalFamily: r.canonicalFamily,
      varieties: r.varieties,
      baseUnit: r.baseUnit,
      incomingQuantity: r.incomingQuantity,
      incomingAmount: r.incomingAmount,
      incomingUnitPriceAvg: r.incomingUnitPriceAvg,
      outgoingQuantity: r.outgoingQuantity,
      outgoingAmount: r.outgoingAmount,
      outgoingUnitPriceAvg: r.outgoingUnitPriceAvg,
      quantityDifference: r.quantityDifference,
      amountDifference: r.amountDifference,
      confidenceScore: r.confidenceScore,
      status: r.status,
      unitConflictWarning: r.unitConflictWarning,
      unitBreakdownLabel: r.unitBreakdownLabel,
      reasonSummary: r.reasonSummary,
      assignments: r.assignments,
    })),
    unmatchedLinesCount: report.unmatchedLines.length,
    suspiciousAssignmentsCount: report.suspiciousAssignments.length,
    invoicesAnalyzed: allInvoices.map((inv) => ({
      direction: inv.direction,
      fileName: inv.fileName,
      fileFormat: inv.fileFormat,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      sellerName: inv.sellerName,
      buyerName: inv.buyerName,
      lineCount: inv.items.length,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileNamePrefix}_${buildDateStamp()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates high-resolution PDF from a DOM container (preserving full Turkish typography).
 */
export async function exportComparisonDomToPdf(
  element: HTMLElement,
  fileNamePrefix = "fatura_urun_karsilastirma"
): Promise<void> {
  const { pdf } = await renderElementToPdf(element);
  pdf.save(`${fileNamePrefix}_${buildDateStamp()}.pdf`);
}

