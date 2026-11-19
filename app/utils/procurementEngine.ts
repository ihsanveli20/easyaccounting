import {
  ComparisonEvaluationReport,
  EvaluatedCellResult,
  EvaluatedNeedComparison,
  EvaluatedSupplierTotal,
  MatchConfidence,
  NeedFulfillmentStatus,
  ProcurementComparison,
  ProcurementNeedItem,
  ProcurementQuoteLineItem,
  ProcurementSupplierQuote,
  SplitAllocationSlice,
  SplitStrategySummary,
} from "../types/procurement";

// ---------------------------------------------------------------------------
// Integer-cent (kuruş) arithmetic helpers to avoid floating-point drift
// ---------------------------------------------------------------------------

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function round2(amount: number): number {
  return fromCents(toCents(amount));
}

// ---------------------------------------------------------------------------
// Normalization & Fuzzy / Dimension-Aware Product Matching
// ---------------------------------------------------------------------------

export function normalizeProcurementName(text: string): string {
  return (text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/İ/g, "i")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    // Normalize Turkish decimal commas in dimensions: 13,5 -> 13.5
    .replace(/(\d),(\d)/g, "$1.$2")
    // Strip Turkish suffixes on numbers like 13.5'luk, 13.5luk, 8.5'lik
    .replace(/(\d+(?:\.\d+)?)\s*['’]?\s*(luk|lük|lik|lık|cm|mm|mt)\b/g, "$1")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProcurementUnit(unit?: string | null): string {
  const raw = normalizeProcurementName(unit || "adet");
  if (!raw) return "Adet";
  if (["ad", "adet", "adt", "pcs", "pc", "ea"].includes(raw)) return "Adet";
  if (["palet", "paleti", "plt"].includes(raw)) return "Palet";
  if (["torba", "cuval"].includes(raw)) return "Torba";
  if (["ton", "t"].includes(raw)) return "Ton";
  if (["kg", "kilo", "kilogram"].includes(raw)) return "Kg";
  if (["m3", "metrekup"].includes(raw)) return "m³";
  if (["m2", "metrekare"].includes(raw)) return "m²";
  if (["m", "mt", "metre", "mtr"].includes(raw)) return "Metre";
  if (["sefer", "sfr", "kamyon", "tir"].includes(raw)) return "Sefer";
  if (["paket", "pkt"].includes(raw)) return "Paket";
  if (["koli", "ctn"].includes(raw)) return "Koli";
  if (["kutu", "box"].includes(raw)) return "Kutu";
  return unit?.trim() || "Adet";
}

function tokenSimilarity(a: string, b: string): number {
  const normA = normalizeProcurementName(a);
  const normB = normalizeProcurementName(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.88;

  const tokensA = new Set(normA.split(" ").filter((t) => t.length >= 2 || /\d/.test(t)));
  const tokensB = new Set(normB.split(" ").filter((t) => t.length >= 2 || /\d/.test(t)));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function suggestNeedMatch(
  rawProductName: string,
  needs: ProcurementNeedItem[]
): {
  matchedNeedId: string | null;
  suggestedNeedId: string | null;
  matchConfidence: MatchConfidence;
  score: number;
} {
  if (!rawProductName || needs.length === 0) {
    return {
      matchedNeedId: null,
      suggestedNeedId: null,
      matchConfidence: "unmatched",
      score: 0,
    };
  }

  const normRaw = normalizeProcurementName(rawProductName);
  let bestNeed: ProcurementNeedItem | null = null;
  let bestScore = 0;

  for (const need of needs) {
    const normNeed = normalizeProcurementName(need.name);
    if (normRaw === normNeed) {
      return {
        matchedNeedId: need.id,
        suggestedNeedId: need.id,
        matchConfidence: "exact",
        score: 1,
      };
    }
    const score = tokenSimilarity(rawProductName, need.name);
    if (score > bestScore) {
      bestScore = score;
      bestNeed = need;
    }
  }

  if (bestNeed && bestScore >= 0.9) {
    return {
      matchedNeedId: bestNeed.id,
      suggestedNeedId: bestNeed.id,
      matchConfidence: "exact",
      score: bestScore,
    };
  }

  if (bestNeed && bestScore >= 0.35) {
    return {
      matchedNeedId: bestNeed.id,
      suggestedNeedId: bestNeed.id,
      matchConfidence: "suggested",
      score: Math.round(bestScore * 100) / 100,
    };
  }

  return {
    matchedNeedId: null,
    suggestedNeedId: null,
    matchConfidence: "unmatched",
    score: 0,
  };
}

// ---------------------------------------------------------------------------
// Line Item & Comparison Cost Evaluation Engine
// ---------------------------------------------------------------------------

function computeNetUnitPriceCents(
  item: ProcurementQuoteLineItem,
  needQty: number
): { unitNetCents: number; effectiveOfferedQty: number } {
  const offeredQty =
    item.offeredQuantity !== null && item.offeredQuantity > 0
      ? item.offeredQuantity
      : needQty;

  let grossUnit = 0;
  if (item.pricingMode === "total") {
    const totalVal = item.lineTotal ?? 0;
    const divisor = item.offeredQuantity && item.offeredQuantity > 0 ? item.offeredQuantity : needQty;
    grossUnit = divisor > 0 ? totalVal / divisor : 0;
  } else {
    if (item.unitPrice !== null && item.unitPrice > 0) {
      grossUnit = item.unitPrice;
    } else if (item.lineTotal !== null && item.lineTotal > 0 && offeredQty > 0) {
      grossUnit = item.lineTotal / offeredQty;
    }
  }

  // Apply percentage discount & per-line discount amount
  let discountedUnit = grossUnit;
  if (item.discountRate > 0) {
    discountedUnit = discountedUnit * (1 - item.discountRate / 100);
  }
  if (item.discountAmount > 0 && offeredQty > 0) {
    discountedUnit = Math.max(0, discountedUnit - item.discountAmount / offeredQty);
  }

  // Convert VAT-included price to net (KDV Hariç) if vatIncluded is true and vatRate is known
  let netUnit = discountedUnit;
  if (item.vatIncluded && item.vatRate !== null && item.vatRate > 0) {
    netUnit = discountedUnit / (1 + item.vatRate / 100);
  }

  return {
    unitNetCents: toCents(netUnit),
    effectiveOfferedQty: offeredQty,
  };
}

function computeOrderShippingNetCents(quote: ProcurementSupplierQuote): number {
  if (quote.shippingMode === "free" || quote.shippingMode === "included") return 0;
  if (quote.shippingMode !== "per_order") return 0;
  const raw = quote.orderShippingAmount || 0;
  if (raw <= 0) return 0;
  if (quote.shippingVatIncluded && quote.shippingVatRate !== null && quote.shippingVatRate > 0) {
    return toCents(raw / (1 + quote.shippingVatRate / 100));
  }
  return toCents(raw);
}

function computeItemShippingNetCents(
  item: ProcurementQuoteLineItem,
  quote: ProcurementSupplierQuote
): number {
  if (quote.shippingMode === "free" || quote.shippingMode === "included") return 0;
  const raw = item.itemShippingAmount || 0;
  if (raw <= 0) return 0;
  if (quote.shippingVatIncluded && quote.shippingVatRate !== null && quote.shippingVatRate > 0) {
    return toCents(raw / (1 + quote.shippingVatRate / 100));
  }
  return toCents(raw);
}

export function evaluateProcurementComparison(
  comparison: ProcurementComparison
): ComparisonEvaluationReport {
  const approvedQuotes = comparison.quotes.filter((q) => q.approved);
  const warnings: string[] = [];

  if (comparison.quotes.length > approvedQuotes.length) {
    const pendingCount = comparison.quotes.length - approvedQuotes.length;
    warnings.push(
      `${pendingCount} adet tedarikçi teklifi henüz kullanıcı onayından geçmediği için karşılaştırmaya dahil edilmedi.`
    );
  }

  const needComparisons: EvaluatedNeedComparison[] = [];

  for (const need of comparison.needs) {
    const cells: Record<string, EvaluatedCellResult> = {};

    for (const quote of approvedQuotes) {
      const matchedItems = quote.items.filter((it) => it.matchedNeedId === need.id);
      if (matchedItems.length === 0) {
        cells[quote.id] = {
          needId: need.id,
          quoteId: quote.id,
          supplierName: quote.supplierName,
          currency: quote.currency,
          hasOffer: false,
          fulfillmentStatus: "missing",
          offeredQuantity: 0,
          coveredQuantity: 0,
          missingQuantity: need.quantity,
          minOrderQuantity: null,
          moqWarning: false,
          effectiveUnitPriceNet: 0,
          productNetTotal: 0,
          allocatedShippingNet: 0,
          subtotalNet: 0,
          vatRateUsed: null,
          missingVatRate: false,
          vatTotal: 0,
          grandTotal: 0,
          diffFromBestAmount: 0,
          diffFromBestPct: 0,
          savingsVsWorstAmount: 0,
          savingsVsWorstPct: 0,
          isBestForNeed: false,
        };
        continue;
      }

      const item = matchedItems[0];
      const { unitNetCents, effectiveOfferedQty } = computeNetUnitPriceCents(item, need.quantity);

      let fulfillmentStatus: NeedFulfillmentStatus = "full";
      let coveredQuantity = need.quantity;
      let missingQuantity = 0;

      if (item.offeredQuantity !== null && item.offeredQuantity > 0) {
        if (item.offeredQuantity < need.quantity) {
          fulfillmentStatus = "partial";
          coveredQuantity = item.offeredQuantity;
          missingQuantity = round2(need.quantity - item.offeredQuantity);
        } else if (item.offeredQuantity > need.quantity) {
          fulfillmentStatus = "excess";
          coveredQuantity = need.quantity;
        }
      }

      const moq = item.minOrderQuantity ?? null;
      const moqWarning = moq !== null && moq > 0 && need.quantity < moq;

      // Product net total for the covered quantity
      let productNetCents = 0;
      if (item.pricingMode === "total" && fulfillmentStatus !== "partial") {
        // Total price covers the offered/needed quantity directly
        const rawTotal = item.lineTotal ?? 0;
        const discounted =
          rawTotal * (1 - (item.discountRate || 0) / 100) - (item.discountAmount || 0);
        const netTotal =
          item.vatIncluded && item.vatRate !== null && item.vatRate > 0
            ? discounted / (1 + item.vatRate / 100)
            : discounted;
        productNetCents = Math.max(0, toCents(netTotal));
      } else {
        productNetCents = Math.round(unitNetCents * coveredQuantity);
      }

      // Shipping allocation:
      // For single-product view, order shipping is shown in full for this product;
      // if supplier covers N matched needs in this comparison, we allocate per-order shipping proportionally across matched needs for supplier total,
      // while on the individual product table we allocate the order shipping if there's 1 need or proportional share for multi-need.
      const matchedNeedsCount = Math.max(
        1,
        new Set(quote.items.map((it) => it.matchedNeedId).filter(Boolean)).size
      );
      const orderShipCents = computeOrderShippingNetCents(quote);
      const itemShipCents = computeItemShippingNetCents(item, quote);
      const allocatedOrderShipCents =
        comparison.needs.length <= 1
          ? orderShipCents
          : Math.round(orderShipCents / matchedNeedsCount);
      const totalShipCents = allocatedOrderShipCents + itemShipCents;

      const subtotalNetCents = productNetCents + totalShipCents;

      const missingVatRate = item.vatRate === null;
      const vatRate = item.vatRate ?? 0;
      const shipVatRate = quote.shippingVatRate ?? vatRate;

      const productVatCents = Math.round((productNetCents * vatRate) / 100);
      const shipVatCents = Math.round((totalShipCents * shipVatRate) / 100);
      const totalVatCents = productVatCents + shipVatCents;
      const grandTotalCents = subtotalNetCents + totalVatCents;

      cells[quote.id] = {
        needId: need.id,
        quoteId: quote.id,
        supplierName: quote.supplierName,
        currency: quote.currency,
        hasOffer: true,
        fulfillmentStatus,
        offeredQuantity: effectiveOfferedQty,
        coveredQuantity,
        missingQuantity,
        minOrderQuantity: moq,
        moqWarning,
        effectiveUnitPriceNet: fromCents(unitNetCents),
        productNetTotal: fromCents(productNetCents),
        allocatedShippingNet: fromCents(totalShipCents),
        subtotalNet: fromCents(subtotalNetCents),
        vatRateUsed: item.vatRate,
        missingVatRate,
        vatTotal: fromCents(totalVatCents),
        grandTotal: fromCents(grandTotalCents),
        diffFromBestAmount: 0,
        diffFromBestPct: 0,
        savingsVsWorstAmount: 0,
        savingsVsWorstPct: 0,
        isBestForNeed: false,
      };
    }

    // Determine best & worst among offers (prefer full/excess offers over partial)
    const validCells = Object.values(cells).filter((c) => c.hasOffer && c.grandTotal > 0);
    const fullCells = validCells.filter((c) => c.fulfillmentStatus !== "partial");
    const rankingPool = fullCells.length > 0 ? fullCells : validCells;

    let bestCell: EvaluatedCellResult | null = null;
    let worstCell: EvaluatedCellResult | null = null;

    for (const c of rankingPool) {
      if (!bestCell || c.grandTotal < bestCell.grandTotal) bestCell = c;
      if (!worstCell || c.grandTotal > worstCell.grandTotal) worstCell = c;
    }

    if (bestCell) {
      cells[bestCell.quoteId].isBestForNeed = true;
      const bestAmt = bestCell.grandTotal;
      const worstAmt = worstCell?.grandTotal ?? bestAmt;

      for (const c of Object.values(cells)) {
        if (!c.hasOffer) continue;
        c.diffFromBestAmount = round2(c.grandTotal - bestAmt);
        c.diffFromBestPct = bestAmt > 0 ? Math.round(((c.grandTotal - bestAmt) / bestAmt) * 1000) / 10 : 0;
        c.savingsVsWorstAmount = round2(worstAmt - c.grandTotal);
        c.savingsVsWorstPct =
          worstAmt > 0 ? Math.round(((worstAmt - c.grandTotal) / worstAmt) * 1000) / 10 : 0;
      }
    }

    needComparisons.push({
      need,
      cells,
      bestQuoteId: bestCell?.quoteId ?? null,
      bestSupplierName: bestCell?.supplierName ?? null,
      bestGrandTotal: bestCell?.grandTotal ?? 0,
      worstGrandTotal: worstCell?.grandTotal ?? 0,
    });
  }

  // Supplier-level overall totals
  const supplierTotals: EvaluatedSupplierTotal[] = approvedQuotes.map((quote) => {
    let coveredCount = 0;
    let fullyCoversAll = comparison.needs.length > 0;
    let productNetCents = 0;
    let itemShipNetCents = 0;
    let productVatCents = 0;
    let hasMissingVat = false;

    for (const nc of needComparisons) {
      const cell = nc.cells[quote.id];
      if (!cell || !cell.hasOffer) {
        fullyCoversAll = false;
        continue;
      }
      coveredCount++;
      if (cell.fulfillmentStatus === "partial") {
        fullyCoversAll = false;
      }
      if (cell.missingVatRate) hasMissingVat = true;
      productNetCents += toCents(cell.productNetTotal);

      const matchedItem = quote.items.find((it) => it.matchedNeedId === nc.need.id);
      if (matchedItem) {
        itemShipNetCents += computeItemShippingNetCents(matchedItem, quote);
        const vr = matchedItem.vatRate ?? 0;
        productVatCents += Math.round((toCents(cell.productNetTotal) * vr) / 100);
      }
    }

    const orderShipCents = computeOrderShippingNetCents(quote);
    const totalShipNetCents = orderShipCents + itemShipNetCents;
    const shipVatRate = quote.shippingVatRate ?? 20;
    const shipVatCents = Math.round((totalShipNetCents * shipVatRate) / 100);

    const subtotalNetCents = productNetCents + totalShipNetCents;
    const totalVatCents = productVatCents + shipVatCents;
    const grandTotalCents = subtotalNetCents + totalVatCents;

    return {
      quoteId: quote.id,
      supplierName: quote.supplierName,
      currency: quote.currency,
      coveredNeedsCount: coveredCount,
      totalNeedsCount: comparison.needs.length,
      fullyCoversAllNeeds: fullyCoversAll,
      productNetTotal: fromCents(productNetCents),
      shippingNetTotal: fromCents(totalShipNetCents),
      subtotalNet: fromCents(subtotalNetCents),
      vatTotal: fromCents(totalVatCents),
      grandTotal: fromCents(grandTotalCents),
      hasMissingVat,
      diffFromBestAmount: 0,
      diffFromBestPct: 0,
      isBestOverall: false,
    };
  });

  const fullCoverageSuppliers = supplierTotals.filter(
    (s) => s.fullyCoversAllNeeds && s.grandTotal > 0
  );
  const rankableSuppliers =
    fullCoverageSuppliers.length > 0
      ? fullCoverageSuppliers
      : supplierTotals.filter((s) => s.coveredNeedsCount > 0 && s.grandTotal > 0);

  let bestOverall: EvaluatedSupplierTotal | null = null;
  let worstOverall: EvaluatedSupplierTotal | null = null;

  for (const s of rankableSuppliers) {
    if (!bestOverall || s.grandTotal < bestOverall.grandTotal) bestOverall = s;
    if (!worstOverall || s.grandTotal > worstOverall.grandTotal) worstOverall = s;
  }

  if (bestOverall) {
    bestOverall.isBestOverall = true;
    for (const s of supplierTotals) {
      if (s.grandTotal <= 0) continue;
      s.diffFromBestAmount = round2(s.grandTotal - bestOverall.grandTotal);
      s.diffFromBestPct =
        bestOverall.grandTotal > 0
          ? Math.round(((s.grandTotal - bestOverall.grandTotal) / bestOverall.grandTotal) * 1000) /
            10
          : 0;
    }
  }

  const splitStrategy = computeSplitStrategy(
    comparison,
    needComparisons,
    approvedQuotes,
    bestOverall?.grandTotal ?? 0
  );

  return {
    comparisonId: comparison.id,
    approvedQuoteCount: approvedQuotes.length,
    totalQuoteCount: comparison.quotes.length,
    needCount: comparison.needs.length,
    needComparisons,
    supplierTotals: [...supplierTotals].sort((a, b) => a.grandTotal - b.grandTotal),
    bestOverallQuoteId: bestOverall?.quoteId ?? null,
    bestOverallSupplierName: bestOverall?.supplierName ?? null,
    lowestGrandTotal: bestOverall?.grandTotal ?? 0,
    highestGrandTotal: worstOverall?.grandTotal ?? 0,
    potentialSavings:
      bestOverall && worstOverall && worstOverall.grandTotal > bestOverall.grandTotal
        ? round2(worstOverall.grandTotal - bestOverall.grandTotal)
        : 0,
    splitStrategy,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Multi-Supplier Split Optimization (accounts for separate shipping & MOQ)
// ---------------------------------------------------------------------------

function computeSplitStrategy(
  comparison: ProcurementComparison,
  needComparisons: EvaluatedNeedComparison[],
  approvedQuotes: ProcurementSupplierQuote[],
  bestSingleTotal: number
): SplitStrategySummary {
  if (comparison.needs.length === 0 || approvedQuotes.length < 2) {
    return {
      possible: false,
      slices: [],
      totalGrandTotal: bestSingleTotal,
      bestSingleSupplierTotal: bestSingleTotal,
      savingsVsBestSingle: 0,
      note: "Bölünmüş satın alma analizi için en az 2 onaylı firma teklifi gereklidir.",
    };
  }

  const slices: SplitAllocationSlice[] = [];
  const usedQuotes = new Set<string>();

  for (const nc of needComparisons) {
    let remainingQty = nc.need.quantity;

    // Sort candidate suppliers by effective net unit price ascending
    const candidates = approvedQuotes
      .map((q) => {
        const cell = nc.cells[q.id];
        return { quote: q, cell };
      })
      .filter((x) => x.cell && x.cell.hasOffer && x.cell.effectiveUnitPriceNet > 0)
      .sort((a, b) => a.cell.effectiveUnitPriceNet - b.cell.effectiveUnitPriceNet);

    for (const { quote, cell } of candidates) {
      if (remainingQty <= 0) break;
      const item = quote.items.find((it) => it.matchedNeedId === nc.need.id);
      if (!item) continue;

      const maxAvail =
        item.offeredQuantity && item.offeredQuantity > 0
          ? item.offeredQuantity
          : nc.need.quantity;
      const alloc = Math.min(remainingQty, maxAvail);
      if (alloc <= 0) continue;

      if (item.minOrderQuantity && alloc < item.minOrderQuantity) {
        continue;
      }

      usedQuotes.add(quote.id);
      const productNet = round2(alloc * cell.effectiveUnitPriceNet);
      const vatRate = item.vatRate ?? 0;
      const vatAmt = round2(productNet * (vatRate / 100));

      slices.push({
        needId: nc.need.id,
        needName: nc.need.name,
        unit: nc.need.unit,
        quoteId: quote.id,
        supplierName: quote.supplierName,
        allocatedQty: alloc,
        unitPriceNet: cell.effectiveUnitPriceNet,
        productNetTotal: productNet,
        shippingNetAllocated: 0,
        vatTotal: vatAmt,
        grandTotal: round2(productNet + vatAmt),
      });

      remainingQty = round2(remainingQty - alloc);
    }
  }

  // Add each selected supplier's separate order shipping cost once
  let totalShippingWithVat = 0;
  for (const qId of usedQuotes) {
    const q = approvedQuotes.find((x) => x.id === qId);
    if (!q) continue;
    const orderShipNet = fromCents(computeOrderShippingNetCents(q));
    if (orderShipNet > 0) {
      const shipVatRate = q.shippingVatRate ?? 20;
      const shipWithVat = round2(orderShipNet * (1 + shipVatRate / 100));
      totalShippingWithVat = round2(totalShippingWithVat + shipWithVat);

      // Attach shipping to the first slice of this supplier for transparent display
      const firstSlice = slices.find((s) => s.quoteId === qId);
      if (firstSlice) {
        firstSlice.shippingNetAllocated = orderShipNet;
        firstSlice.vatTotal = round2(firstSlice.vatTotal + (shipWithVat - orderShipNet));
        firstSlice.grandTotal = round2(firstSlice.grandTotal + shipWithVat);
      }
    }
  }

  const splitTotal = round2(slices.reduce((acc, s) => acc + s.grandTotal, 0));
  const savings = bestSingleTotal > 0 ? round2(bestSingleTotal - splitTotal) : 0;

  return {
    possible: slices.length > 0 && usedQuotes.size > 1,
    slices,
    totalGrandTotal: splitTotal,
    bestSingleSupplierTotal: bestSingleTotal,
    savingsVsBestSingle: savings,
    note:
      savings > 0
        ? `Ayrı nakliye bedelleri dahil edildiğinde karma alım ile ${savings.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
          })} TL ek tasarruf sağlanabilir.`
        : "Ayrı nakliye bedelleri eklendiğinde tek firmadan toplu alım daha avantajlı görünmektedir.",
  };
}

