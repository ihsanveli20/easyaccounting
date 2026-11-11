import {
  CentralProductCard,
  ComparisonAnalysisSummary,
  ComparisonReportPayload,
  ConfidenceTier,
  ExtractedProductFeatures,
  LearnedMappingRule,
  LineMatchAssignment,
  NormalizedUnitMeasurement,
  ProductComparisonCategoryStatus,
  ProductComparisonRow,
  StandardInvoiceDocument,
  StandardInvoiceLine,
  UnitFamily,
} from "../types/invoiceComparison";

// ---------------------------------------------------------------------------
// 1. Turkish Text & Abbreviation Dictionaries
// ---------------------------------------------------------------------------

export function normalizeTurkishAscii(text: string): string {
  return (text || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .toLowerCase();
}

const ABBREVIATION_RULES: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /\bt\.?\s*yagli\b/gi, replacement: "tam yagli", label: "T. Yağlı -> Tam Yağlı" },
  { pattern: /\by\.?\s*yagli\b/gi, replacement: "yarim yagli", label: "Y. Yağlı -> Yarım Yağlı" },
  { pattern: /\bo\.?\s*yagli\b/gi, replacement: "orta yagli", label: "O. Yağlı -> Orta Yağlı" },
  { pattern: /\bb\.?\s*peynir\w*/gi, replacement: "beyaz peynir", label: "B. Peynir -> Beyaz Peynir" },
  { pattern: /\bk\.?\s*fasulye\w*/gi, replacement: "kuru fasulye", label: "K. Fasulye -> Kuru Fasulye" },
  { pattern: /\bz\.?\s*yag\w*/gi, replacement: "zeytinyagi", label: "Z. Yağı -> Zeytinyağı" },
  { pattern: /\bsiz\.?\s*z\.?\s*yag\w*/gi, replacement: "sizma zeytinyagi", label: "Sız. Z.Yağı -> Sızma Zeytinyağı" },
  { pattern: /\bayc\.?\s*yag\w*/gi, replacement: "aycicek yagi", label: "Ayç. Yağı -> Ayçiçek Yağı" },
  { pattern: /\bnat\.?\b/gi, replacement: "naturel", label: "Nat. -> Natürel" },
  { pattern: /\bsuz\.?\b/gi, replacement: "suzme", label: "Süz. -> Süzme" },
  { pattern: /\btrk\.?\b/gi, replacement: "trakya", label: "Trk. -> Trakya" },
  { pattern: /\btaze\s+b\.?\s*peynir\w*/gi, replacement: "taze beyaz peynir", label: "Taze B.Peynir -> Taze Beyaz Peynir" },
  { pattern: /\byag\.?\b/gi, replacement: "yagli", label: "Yağ. -> Yağlı" },
  { pattern: /\bglt\.?\b/gi, replacement: "glutensiz", label: "Glt. -> Glutensiz" },
  { pattern: /\borg\.?\b/gi, replacement: "organik", label: "Org. -> Organik" },
  { pattern: /\bltr\b/gi, replacement: "lt", label: "LTR -> LT" },
  { pattern: /\bkgm\b/gi, replacement: "kg", label: "KGM -> KG" },
  { pattern: /\bgrm\b/gi, replacement: "gr", label: "GRM -> GR" },
];

const SYNONYM_CONCEPTS: Array<[RegExp, string]> = [
  [/\bzeytin\s+yagi\b/gi, "zeytinyagi"],
  [/\baycicek\s+yagi\b/gi, "aycicekyagi"],
  [/\bsivi\s+yag\b/gi, "aycicekyagi"],
  [/\btereyag\w*\b/gi, "tereyagi"],
  [/\btere\s+yag\w*\b/gi, "tereyagi"],
  [/\bkrem\s+peynir\w*\b/gi, "krempeynir"],
  [/\bkasar\s+peynir\w*\b/gi, "kasar peynir"],
  [/\bbeyaz\s+peynir\w*\b/gi, "beyaz peynir"],
  [/\btulum\s+peynir\w*\b/gi, "tulum peynir"],
  [/\blor\s+peynir\w*\b/gi, "lor peynir"],
  [/\bpeyniri\b/gi, "peynir"],
  [/\bfasulyesi\b/gi, "fasulye"],
  [/\bpirinci\b/gi, "pirinc"],
  [/\bmercimegi\b/gi, "mercimek"],
  [/\bnohut\w*\b/gi, "nohut"],
  [/\byogurdu\b/gi, "yogurt"],
  [/\bdomates\s+salca\w*\b/gi, "domates salcasi"],
  [/\bbiber\s+salca\w*\b/gi, "biber salcasi"],
  [/\btoz\s+seker\w*\b/gi, "seker"],
  [/\bkristal\s+seker\w*\b/gi, "seker"],
];

// Core product families (canonical noun stems)
const PRODUCT_FAMILIES: Array<{ family: string; display: string; patterns: RegExp[] }> = [
  { family: "peynir", display: "Peynir", patterns: [/\bpeynir\w*\b/, /\bkasar\b/, /\btulum\b/, /\blor\b/, /\bhellim\b/, /\bmozzarella\b/] },
  { family: "fasulye", display: "Fasulye", patterns: [/\bfasulye\w*\b/] },
  { family: "zeytinyagi", display: "Zeytinyağı", patterns: [/\bzeytinyag\w*\b/] },
  { family: "aycicekyagi", display: "Ayçiçek Yağı", patterns: [/\baycicekyag\w*\b/, /\bsiviyag\w*\b/] },
  { family: "tereyagi", display: "Tereyağı", patterns: [/\btereyag\w*\b/] },
  { family: "pirinc", display: "Pirinç", patterns: [/\bpirinc\w*\b/] },
  { family: "mercimek", display: "Mercimek", patterns: [/\bmercimek\w*\b/] },
  { family: "bulgur", display: "Bulgur", patterns: [/\bbulgur\w*\b/] },
  { family: "nohut", display: "Nohut", patterns: [/\bnohut\w*\b/] },
  { family: "dana_eti", display: "Dana Eti", patterns: [/\bdana\b/, /\bkarkas\b/, /\bantrikot\b/, /\bbonfile\b/, /\bkiyma\b/, /\bkusbasi\b/] },
  { family: "kuzu_eti", display: "Kuzu Eti", patterns: [/\bkuzu\b/, /\bpirzola\b/] },
  { family: "tavuk", display: "Tavuk", patterns: [/\btavuk\b/, /\bpilic\b/, /\bbut\b/, /\bgogus\b/] },
  { family: "yogurt", display: "Yoğurt", patterns: [/\byogur\w*\b/] },
  { family: "sut", display: "Süt", patterns: [/\bsut\b/, /\bsutu\b/] },
  { family: "salca", display: "Salça", patterns: [/\bsalca\w*\b/] },
  { family: "seker", display: "Şeker", patterns: [/\bseker\w*\b/] },
  { family: "un", display: "Un", patterns: [/\bun\b/, /\bunu\b/] },
  { family: "makarna", display: "Makarna", patterns: [/\bmakarna\w*\b/] },
  { family: "cay", display: "Çay", patterns: [/\bcay\b/, /\bcayi\b/] },
  { family: "kahve", display: "Kahve", patterns: [/\bkahve\w*\b/] },
  { family: "zeytin", display: "Zeytin", patterns: [/\bzeytin\b/, /\bzeytini\b/] },
  { family: "bal", display: "Bal", patterns: [/\bbal\b/, /\bbali\b/] },
  { family: "yumurta", display: "Yumurta", patterns: [/\byumurta\w*\b/] },
  { family: "ambalaj_poset", display: "Ambalaj & Poşet", patterns: [/\bposet\w*\b/, /\bkoli\b/, /\bstrec\b/, /\bambalaj\b/] },
];

// Special varieties that MUST NOT blindly merge with generic names or different varieties
const SPECIAL_VARIETIES = new Set([
  // Beans / grains
  "ispir",
  "dermason",
  "horoz",
  "seker",
  "barbunya",
  "borulce",
  "baldo",
  "osmancik",
  "yasmin",
  "basmati",
  "pilavlik",
  "koftelik",
  // Dairy / Cheese
  "beyaz",
  "kasar",
  "tulum",
  "ezine",
  "erzincan",
  "izmir",
  "edirne",
  "trakya",
  "lor",
  "orgu",
  "dil",
  "cerkez",
  "hellim",
  "mozzarella",
  "labne",
  "suzme",
  "eski",
  "taze",
  // Oils
  "sizma",
  "riviera",
  "naturel",
  "soguk",
  // Meat
  "dana",
  "kuzu",
  "pirzola",
  "bonfile",
  "antrikot",
  "kiyma",
  "kusbasi",
  // Other distinguishing traits
  "kirmizi",
  "yesil",
  "sari",
  "siyah",
  "domates",
  "biber",
  "organik",
]);

// Fat/richness modifiers (compatible attribute rather than exclusive variety)
const ATTRIBUTE_MODIFIERS = new Set([
  "tam",
  "yarim",
  "orta",
  "yagli",
  "yagsiz",
  "az",
  "tuzlu",
  "tuzsuz",
  "aztuzlu",
  "olgunlasmis",
  "inek",
  "koyun",
  "keci",
  "yerli",
  "ithal",
]);

// Packaging / container words (Fıçı, Teneke, Kutu, Bidon, Vakum...)
const PACKAGING_WORDS = new Set([
  "fici",
  "teneke",
  "bidon",
  "kutu",
  "paket",
  "koli",
  "kasa",
  "cuval",
  "torba",
  "vakum",
  "vakumlu",
  "kavanoz",
  "sise",
  "pet",
  "cam",
  "dilimli",
  "blok",
  "dokme",
]);

const STOP_WORDS = new Set([
  "ve",
  "ile",
  "veya",
  "icin",
  "tip",
  "urun",
  "mal",
  "hizmet",
  "kalem",
  "bos",
  "marka",
  "no",
  "adet",
  "kg",
  "gr",
  "gram",
  "lt",
  "litre",
  "ml",
  "ton",
  "koli",
  "paket",
  "kutu",
  "birim",
]);

// ---------------------------------------------------------------------------
// 2. Unit Normalization & Packaging Multiplier Engine
// ---------------------------------------------------------------------------

export function getUnitFamily(rawUnit: string): {
  standardizedUnit: string;
  unitFamily: UnitFamily;
  baseUnit: string;
  multiplierToBase: number;
} {
  const u = normalizeTurkishAscii(rawUnit).replace(/[^a-z0-9]/g, "");
  if (["kg", "kgm", "kilo", "kilogram"].includes(u)) {
    return { standardizedUnit: "KG", unitFamily: "mass", baseUnit: "KG", multiplierToBase: 1 };
  }
  if (["gr", "grm", "g", "gram"].includes(u)) {
    return { standardizedUnit: "GR", unitFamily: "mass", baseUnit: "KG", multiplierToBase: 0.001 };
  }
  if (["ton", "tne"].includes(u)) {
    return { standardizedUnit: "TON", unitFamily: "mass", baseUnit: "KG", multiplierToBase: 1000 };
  }
  if (["lt", "ltr", "l", "litre"].includes(u)) {
    return { standardizedUnit: "LT", unitFamily: "volume", baseUnit: "LT", multiplierToBase: 1 };
  }
  if (["ml", "mlt", "mililitre"].includes(u)) {
    return { standardizedUnit: "ML", unitFamily: "volume", baseUnit: "LT", multiplierToBase: 0.001 };
  }
  if (["cl", "clt"].includes(u)) {
    return { standardizedUnit: "CL", unitFamily: "volume", baseUnit: "LT", multiplierToBase: 0.01 };
  }
  if (["adet", "ad", "adt", "c62", "niu", "ea", "h87"].includes(u)) {
    return { standardizedUnit: "ADET", unitFamily: "count", baseUnit: "ADET", multiplierToBase: 1 };
  }
  if (["paket", "pkt", "pk", "pa", "kutu", "kt", "bx", "koli", "ct", "torba", "bg", "kasa", "cs", "teneke", "fici", "bidon"].includes(u)) {
    return {
      standardizedUnit: u.toUpperCase(),
      unitFamily: "package",
      baseUnit: u.toUpperCase(),
      multiplierToBase: 1,
    };
  }
  if (["mt", "mtr", "metre"].includes(u)) {
    return { standardizedUnit: "MT", unitFamily: "length", baseUnit: "MT", multiplierToBase: 1 };
  }
  if (["m2", "mtk"].includes(u)) {
    return { standardizedUnit: "M²", unitFamily: "area", baseUnit: "M²", multiplierToBase: 1 };
  }
  const cleanUpper = rawUnit.trim().toUpperCase() || "BELİRSİZ";
  return {
    standardizedUnit: cleanUpper,
    unitFamily: "other",
    baseUnit: cleanUpper,
    multiplierToBase: 1,
  };
}

export function normalizeLineMeasurement(
  line: StandardInvoiceLine,
  combinedText: string
): NormalizedUnitMeasurement {
  const rawUnit = line.unit || "";
  const rawQty = line.quantity;
  const info = getUnitFamily(rawUnit);

  const normText = normalizeTurkishAscii(combinedText);

  // Detect compound packaging like "10 Adet x 500 Gram", "10 x 500 gr", "2 x 5 lt"
  const compoundMatch = normText.match(
    /(\d+(?:[.,]\d+)?)\s*(?:adet|pk|paket|koli|kutu|sise)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|grm|gram|g|lt|ltr|litre|ml)\b/i
  );

  // Detect standalone net weight/volume in text like "5 KG Peynir", "5000 Gram Peynir"
  const singlePackMatch = !compoundMatch
    ? normText.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|grm|gram|lt|ltr|litre|ml)\b/i)
    : null;

  if (rawQty === null) {
    return {
      rawUnit,
      standardizedUnit: info.standardizedUnit,
      unitFamily: info.unitFamily,
      rawQuantity: null,
      normalizedQuantity: null,
      normalizedBaseUnit: info.baseUnit,
      conversionApplied: false,
    };
  }

  // Case 1: Invoice line already uses mass/volume unit (e.g., 5000 Gram or 500 KG)
  if (info.unitFamily === "mass" || info.unitFamily === "volume") {
    const normalizedQuantity = Number((rawQty * info.multiplierToBase).toFixed(4));
    const conversionApplied = info.multiplierToBase !== 1;
    return {
      rawUnit,
      standardizedUnit: info.standardizedUnit,
      unitFamily: info.unitFamily,
      rawQuantity: rawQty,
      normalizedQuantity,
      normalizedBaseUnit: info.baseUnit,
      conversionApplied,
      conversionExplanation: conversionApplied
        ? `${rawQty} ${info.standardizedUnit} -> ${normalizedQuantity} ${info.baseUnit}`
        : undefined,
    };
  }

  // Case 2: Invoice line uses count/package ("Adet", "Koli", "Paket", "Teneke") AND product description specifies compound weight ("10 Adet x 500 Gram")
  if ((info.unitFamily === "count" || info.unitFamily === "package") && compoundMatch) {
    const packCount = parseFloat(compoundMatch[1].replace(",", ".")) || 1;
    const perPackQty = parseFloat(compoundMatch[2].replace(",", ".")) || 0;
    const perPackInfo = getUnitFamily(compoundMatch[3]);
    if (perPackQty > 0 && (perPackInfo.unitFamily === "mass" || perPackInfo.unitFamily === "volume")) {
      const singleUnitInBase = perPackQty * perPackInfo.multiplierToBase;
      // Avoid double multiplying if rawUnit is "Adet" and rawQty already equals packCount (e.g. qty=10, unit=Adet, text="10 Adet x 500 Gram")
      const effectiveTotal =
        info.unitFamily === "count" && Math.abs(rawQty - packCount) < 0.001
          ? Number((rawQty * singleUnitInBase).toFixed(4))
          : Number((rawQty * packCount * singleUnitInBase).toFixed(4));
      return {
        rawUnit,
        standardizedUnit: info.standardizedUnit,
        unitFamily: perPackInfo.unitFamily,
        rawQuantity: rawQty,
        packCount,
        perPackQuantity: perPackQty,
        perPackUnit: perPackInfo.standardizedUnit,
        normalizedQuantity: effectiveTotal,
        normalizedBaseUnit: perPackInfo.baseUnit,
        conversionApplied: true,
        conversionExplanation:
          info.unitFamily === "count" && Math.abs(rawQty - packCount) < 0.001
            ? `${rawQty} ${info.standardizedUnit} x ${perPackQty} ${perPackInfo.standardizedUnit} = ${effectiveTotal} ${perPackInfo.baseUnit}`
            : `${rawQty} ${info.standardizedUnit} x (${packCount} x ${perPackQty} ${perPackInfo.standardizedUnit}) = ${effectiveTotal} ${perPackInfo.baseUnit}`,
      };
    }
  }

  // Case 3: Invoice line uses count/package ("Adet", "Teneke", "Koli") AND text specifies per-package weight ("5 KG Peynir")
  if ((info.unitFamily === "count" || info.unitFamily === "package") && singlePackMatch) {
    const perUnitQty = parseFloat(singlePackMatch[1].replace(",", ".")) || 0;
    const packUnitInfo = getUnitFamily(singlePackMatch[2]);
    if (perUnitQty > 0 && (packUnitInfo.unitFamily === "mass" || packUnitInfo.unitFamily === "volume")) {
      const normalizedQuantity = Number(
        (rawQty * perUnitQty * packUnitInfo.multiplierToBase).toFixed(4)
      );
      return {
        rawUnit,
        standardizedUnit: info.standardizedUnit,
        unitFamily: packUnitInfo.unitFamily,
        rawQuantity: rawQty,
        perPackQuantity: perUnitQty,
        perPackUnit: packUnitInfo.standardizedUnit,
        normalizedQuantity,
        normalizedBaseUnit: packUnitInfo.baseUnit,
        conversionApplied: true,
        conversionExplanation: `${rawQty} ${info.standardizedUnit} x ${perUnitQty} ${packUnitInfo.standardizedUnit} = ${normalizedQuantity} ${packUnitInfo.baseUnit}`,
      };
    }
  }

  // Case 4: Cannot convert package/count to mass/volume safely -> keep original unit family!
  return {
    rawUnit,
    standardizedUnit: info.standardizedUnit,
    unitFamily: info.unitFamily,
    rawQuantity: rawQty,
    normalizedQuantity: rawQty,
    normalizedBaseUnit: info.baseUnit,
    conversionApplied: false,
  };
}

// ---------------------------------------------------------------------------
// 3. Multi-layer Feature Extraction (Name, Description, Family, Varieties)
// ---------------------------------------------------------------------------

function isBlankOrPlaceholderName(name: string): boolean {
  const trimmed = normalizeTurkishAscii(name).trim();
  if (!trimmed) return true;
  return /^(bos|yok|tanımsız|tanimsiz|urun|kalem|mal\s*\/?\s*hizmet|\-+|\.+)$/.test(trimmed);
}

function cleanDisplayProductName(rawText: string): string {
  // Strip leading quantities like "5 KG", "5000 Gram", "10 Adet x 500 Gram" when building canonical label
  return rawText
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:adet|pk|paket|koli|kutu)?\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:kg|gr|grm|gram|g|lt|ltr|litre|ml)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kgm|kilogram|gr|grm|gram|lt|ltr|litre|ml|adet)\b/gi, " ")
    .replace(/\b(?:t\.?\s*yağlı|t\.?\s*yagli)\b/gi, "Tam Yağlı")
    .replace(/\b(?:y\.?\s*yağlı|y\.?\s*yagli)\b/gi, "Yarım Yağlı")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractProductFeatures(line: StandardInvoiceLine): ExtractedProductFeatures {
  const origName = (line.originalProductName || "").trim();
  const origDesc = (line.originalDescription || "").trim();

  const nameIsBlank = isBlankOrPlaceholderName(origName);
  const detectedFromDescription = nameIsBlank && origDesc.length > 0;
  const primaryText = detectedFromDescription ? origDesc : origName || origDesc || "Tanımsız Ürün";

  // Expand abbreviations and concepts across name + description
  const combinedOriginal = [nameIsBlank ? "" : origName, origDesc].filter(Boolean).join(" ").trim();
  let expandedText = normalizeTurkishAscii(combinedOriginal);
  const expandedAbbreviations: string[] = [];

  for (const rule of ABBREVIATION_RULES) {
    if (rule.pattern.test(expandedText)) {
      expandedAbbreviations.push(rule.label);
      expandedText = expandedText.replace(rule.pattern, rule.replacement);
    }
  }
  for (const [synPattern, canonicalToken] of SYNONYM_CONCEPTS) {
    expandedText = expandedText.replace(synPattern, canonicalToken);
  }

  // Remove embedded measurement expressions for semantic matching
  const semanticCleanText = expandedText
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:adet|pk|paket|koli|kutu)?\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:kg|gr|grm|gram|g|lt|ltr|litre|ml)\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kgm|kilogram|gr|grm|gram|lt|ltr|litre|ml|adet|ton)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTokens = semanticCleanText
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  const tokens = Array.from(new Set(rawTokens));

  let canonicalFamily = "";
  for (const fam of PRODUCT_FAMILIES) {
    if (fam.patterns.some((pat) => pat.test(semanticCleanText))) {
      canonicalFamily = fam.family;
      break;
    }
  }
  if (!canonicalFamily && tokens.length > 0) {
    canonicalFamily = tokens[tokens.length - 1];
  }

  const varietyTokens = tokens.filter((t) => SPECIAL_VARIETIES.has(t));
  const packagingTokens = tokens.filter((t) => PACKAGING_WORDS.has(t));
  const brandTokens = tokens.filter(
    (t) =>
      t !== canonicalFamily &&
      !SPECIAL_VARIETIES.has(t) &&
      !PACKAGING_WORDS.has(t) &&
      !ATTRIBUTE_MODIFIERS.has(t)
  );

  const effectiveClean = cleanDisplayProductName(primaryText) || primaryText;

  return {
    effectiveName: effectiveClean,
    detectedFromDescription,
    normalizedFullText: semanticCleanText,
    expandedAbbreviations,
    tokens,
    canonicalFamily,
    varietyTokens,
    packagingTokens,
    brandTokens,
  };
}

// ---------------------------------------------------------------------------
// 4. Semantic & String Similarity Helpers (Levenshtein + 3-gram Cosine)
// ---------------------------------------------------------------------------

function charNgrams(str: string, n = 3): Map<string, number> {
  const padded = ` ${str} `;
  const map = new Map<string, number>();
  for (let i = 0; i <= padded.length - n; i++) {
    const gram = padded.slice(i, i + n);
    map.set(gram, (map.get(gram) || 0) + 1);
  }
  return map;
}

function ngramCosineSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const mapA = charNgrams(a);
  const mapB = charNgrams(b);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [g, countA] of mapA.entries()) {
    normA += countA * countA;
    const countB = mapB.get(g) || 0;
    dot += countA * countB;
  }
  for (const countB of mapB.values()) {
    normB += countB * countB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function tokenMatchScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  let matched = 0;
  for (const tA of tokensA) {
    const exact = tokensB.includes(tA);
    if (exact) {
      matched += 1;
      continue;
    }
    const fuzzy = tokensB.some(
      (tB) => tA.length >= 4 && tB.length >= 4 && levenshteinDistance(tA, tB) <= 1
    );
    if (fuzzy) matched += 0.85;
  }
  return (2 * matched) / (tokensA.length + tokensB.length);
}

// ---------------------------------------------------------------------------
// 5. Learned Rules Signature Key
// ---------------------------------------------------------------------------

export function buildLearnedRuleSignature(line: StandardInvoiceLine): string {
  const namePart = normalizeTurkishAscii(line.originalProductName || "").trim();
  const descPart = normalizeTurkishAscii(line.originalDescription || "").trim();
  return `${namePart}||${descPart}`;
}

// ---------------------------------------------------------------------------
// 6. Pairwise Feature Scoring (Enforces Varieties, Packaging, Context)
// ---------------------------------------------------------------------------

interface PairScoreEvaluation {
  score: number;
  tier: ConfidenceTier;
  canAutoMerge: boolean;
  reason: string;
  warnings: string[];
}

export function evaluateFeatureSimilarity(
  a: ExtractedProductFeatures,
  b: ExtractedProductFeatures
): PairScoreEvaluation {
  const warnings: string[] = [];

  const coreTokensA = a.tokens.filter((t) => !PACKAGING_WORDS.has(t));
  const coreTokensB = b.tokens.filter((t) => !PACKAGING_WORDS.has(t));

  // 1. Different known product families -> Incompatible
  if (
    a.canonicalFamily &&
    b.canonicalFamily &&
    a.canonicalFamily !== b.canonicalFamily
  ) {
    const familyTokensOverlap = tokenMatchScore(coreTokensA, coreTokensB);
    if (familyTokensOverlap < 0.4) {
      return {
        score: Math.round(familyTokensOverlap * 30),
        tier: "low",
        canAutoMerge: false,
        reason: `Farklı ürün grupları (${a.canonicalFamily} ≠ ${b.canonicalFamily}).`,
        warnings,
      };
    }
  }

  // 2. Variety checks (Example 2: İspir Fasulyesi vs Fasulye; Dermason vs İspir)
  const varA = a.varietyTokens;
  const varB = b.varietyTokens;

  if (varA.length > 0 && varB.length > 0) {
    const commonVar = varA.filter((v) => varB.includes(v));
    const missingFromB = varA.filter((v) => !varB.includes(v));
    const missingFromA = varB.filter((v) => !varA.includes(v));

    if (commonVar.length === 0) {
      // Exclusive conflicting varieties (e.g. Beyaz Peynir vs Kaşar Peynir, İspir vs Dermason)
      return {
        score: 24,
        tier: "low",
        canAutoMerge: false,
        reason: `Çeşit uyuşmazlığı: [${varA.join(", ")}] ≠ [${varB.join(", ")}].`,
        warnings: [`Farklı ürün çeşitleri (${varA.join(", ")} vs ${varB.join(", ")}) birleştirilemez.`],
      };
    }

    if (missingFromA.length > 0 || missingFromB.length > 0) {
      warnings.push(
        `Kısmi çeşit farkı: [${varA.join(", ")}] vs [${varB.join(", ")}].`
      );
    }
  } else if (varA.length > 0 || varB.length > 0) {
    // One side specifies a special variety (e.g., "İspir Fasulyesi" or "Beyaz Peynir") and the other side is generic ("Fasulye" or "Tam Yağlı Peynir")
    const specified = varA.length > 0 ? varA : varB;
    const famDisplay =
      PRODUCT_FAMILIES.find((f) => f.family === (a.canonicalFamily || b.canonicalFamily))
        ?.display || a.canonicalFamily;

    const sameModifiers =
      a.tokens.some((t) => ATTRIBUTE_MODIFIERS.has(t)) &&
      a.tokens.filter((t) => ATTRIBUTE_MODIFIERS.has(t)).every((m) => b.tokens.includes(m));

    const score = sameModifiers ? 68 : 56;
    return {
      score,
      tier: "medium",
      canAutoMerge: false,
      reason: `'${specified.join(", ")}' özel çeşit bilgisi içerirken diğer kalemde yalnızca genel '${famDisplay}' adı yer alıyor. Doğrudan otomatik birleştirilmedi; kullanıcı onayı gerektirir.`,
      warnings: [`Özel çeşit farkı (${specified.join(", ")} vs genel ${famDisplay})`],
    };
  }

  // 3. Packaging vs generic check (Example 1: "Fıçı Peynir" vs "5 KG Peynir")
  const packA = a.packagingTokens;
  const packB = b.packagingTokens;
  if (
    a.canonicalFamily === b.canonicalFamily &&
    varA.length === 0 &&
    varB.length === 0 &&
    ((packA.length > 0 && packB.length === 0) || (packB.length > 0 && packA.length === 0))
  ) {
    const packLabel = (packA.length > 0 ? packA : packB).join(", ");
    return {
      score: 62,
      tier: "medium",
      canAutoMerge: false,
      reason: `Aynı temel ürün (${a.canonicalFamily}), ancak '${packLabel}' sunum/ambalaj farkı ve çeşit detayının eksik olması nedeniyle otomatik eşleştirilmedi; kullanıcı onayı önerilir.`,
      warnings: [`Ambalaj/sunum doğrulaması gerekiyor (${packLabel})`],
    };
  }

  // 4. Semantic & Token similarity across core tokens
  const tScore = tokenMatchScore(coreTokensA, coreTokensB);
  const cScore = ngramCosineSimilarity(
    coreTokensA.join(" "),
    coreTokensB.join(" ")
  );
  let combined = Math.round((tScore * 0.65 + cScore * 0.35) * 100);

  // Boost if exact normalized match
  if (
    coreTokensA.length > 0 &&
    coreTokensA.length === coreTokensB.length &&
    coreTokensA.every((t) => coreTokensB.includes(t))
  ) {
    combined = Math.max(combined, 96);
  }

  // Boost slightly if both share the exact same family and identical non-empty varieties
  if (
    a.canonicalFamily &&
    a.canonicalFamily === b.canonicalFamily &&
    varA.length > 0 &&
    varA.length === varB.length &&
    varA.every((v) => varB.includes(v))
  ) {
    combined = Math.max(combined, 88);
  }

  // Explain why it matched
  const reasons: string[] = [];
  if (a.detectedFromDescription || b.detectedFromDescription) {
    reasons.push("Ürün adı boş olan satırın açıklama alanından ürün tespit edildi.");
  }
  if (a.expandedAbbreviations.length > 0 || b.expandedAbbreviations.length > 0) {
    const abbrs = Array.from(
      new Set([...a.expandedAbbreviations, ...b.expandedAbbreviations])
    );
    reasons.push(`Kısaltma çözüldü (${abbrs.join(", ")}).`);
  }
  if (combined >= 80) {
    reasons.push("Çok katmanlı ürün adı, çeşit ve anlamsal benzerlik yüksek uyum gösterdi.");
    return {
      score: Math.min(100, combined),
      tier: "high",
      canAutoMerge: true,
      reason: reasons.join(" "),
      warnings,
    };
  }

  if (combined >= 50) {
    reasons.push("Orta düzey anlamsal/kelime benzerliği tespit edildi; kullanıcı onayı önerilir.");
    return {
      score: combined,
      tier: "medium",
      canAutoMerge: false,
      reason: reasons.join(" "),
      warnings,
    };
  }

  return {
    score: combined,
    tier: "low",
    canAutoMerge: false,
    reason: "Anlamsal benzerlik düşük; inceleme listesine alındı.",
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 7. Central Product Title Builder
// ---------------------------------------------------------------------------

function toTurkishTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 1) return word.toLocaleUpperCase("tr-TR");
      return (
        word.charAt(0).toLocaleUpperCase("tr-TR") +
        word.slice(1).toLocaleLowerCase("tr-TR")
      );
    })
    .join(" ");
}

function deriveCentralCardName(features: ExtractedProductFeatures): string {
  const famObj = PRODUCT_FAMILIES.find((f) => f.family === features.canonicalFamily);
  // If packaging-only variant without variety (e.g. "Fıçı Peynir"), keep "Fıçı Peynir"
  if (famObj && features.varietyTokens.length === 0 && features.packagingTokens.length > 0) {
    return `${toTurkishTitleCase(features.packagingTokens.join(" "))} ${famObj.display}`;
  }
  // If variety + family (e.g. "Beyaz Peynir", "İspir Fasulyesi"), keep clean central card title
  if (famObj && features.varietyTokens.length > 0) {
    if (famObj.family === "fasulye" && features.varietyTokens.includes("ispir")) {
      return "İspir Fasulyesi";
    }
    return toTurkishTitleCase(`${features.varietyTokens.join(" ")} ${famObj.display}`);
  }
  return toTurkishTitleCase(features.effectiveName || famObj?.display || "Diğer Ürün");
}

// ---------------------------------------------------------------------------
// 8. Main Analysis & Comparison Pipeline
// ---------------------------------------------------------------------------

export interface ManualOverrideMap {
  [lineId: string]: {
    action: "approved" | "rejected" | "manual_mapped";
    targetCentralProductId?: string;
    targetCentralProductName?: string;
    customReason?: string;
  };
}

export function runInvoiceProductComparison(params: {
  incomingInvoices: StandardInvoiceDocument[];
  outgoingInvoices: StandardInvoiceDocument[];
  learnedRules: LearnedMappingRule[];
  manualOverrides?: ManualOverrideMap;
  userCreatedCards?: CentralProductCard[];
  onProgress?: (processed: number, total: number) => void;
}): ComparisonReportPayload {
  const {
    incomingInvoices,
    outgoingInvoices,
    learnedRules,
    manualOverrides = {},
    userCreatedCards = [],
    onProgress,
  } = params;

  const allInvoices = [...incomingInvoices, ...outgoingInvoices];
  const invoiceMap = new Map<string, StandardInvoiceDocument>();
  for (const inv of allInvoices) {
    invoiceMap.set(inv.id, inv);
  }

  // Feature extraction cache (many invoice lines share identical product name + description)
  const featureCache = new Map<string, ExtractedProductFeatures>();
  const getCachedFeatures = (line: StandardInvoiceLine): ExtractedProductFeatures => {
    const key = `${line.originalProductName || ""}||${line.originalDescription || ""}`;
    let feat = featureCache.get(key);
    if (!feat) {
      feat = extractProductFeatures(line);
      featureCache.set(key, feat);
    }
    return feat;
  };

  // Enrich every line with non-destructive features and normalized measurements
  const enrichedLines: StandardInvoiceLine[] = [];
  let totalIncomingLineCount = 0;
  let totalOutgoingLineCount = 0;
  for (const inv of allInvoices) {
    for (const line of inv.items) {
      const features = getCachedFeatures(line);
      const measurement = normalizeLineMeasurement(
        line,
        `${line.originalProductName} ${line.originalDescription}`.trim()
      );
      if (line.direction === "incoming") totalIncomingLineCount += 1;
      else totalOutgoingLineCount += 1;
      enrichedLines.push({
        ...line,
        features,
        measurement,
      });
    }
  }

  // Seed central product cards map + inverted indexes for fast O(N) candidate lookup
  const centralCards: CentralProductCard[] = userCreatedCards.map((c) => ({ ...c }));
  const cardById = new Map<string, CentralProductCard>();
  const cardByNormName = new Map<string, CentralProductCard>();
  const cardFeatures = new Map<string, ExtractedProductFeatures>();
  const cardsByFamily = new Map<string, string[]>();
  const cardsByToken = new Map<string, string[]>();
  const cardsByAnchor = new Map<string, string[]>();
  const cardByExactCoreSig = new Map<string, string>();

  const buildExactCoreSignature = (f: ExtractedProductFeatures): string => {
    const core = f.tokens.filter((t) => !PACKAGING_WORDS.has(t)).sort().join(" ");
    const vars = [...f.varietyTokens].sort().join(",");
    const packs = [...f.packagingTokens].sort().join(",");
    return `${f.canonicalFamily}|${vars}|${packs}|${core}`;
  };

  const addToIndex = (map: Map<string, string[]>, key: string, cardId: string) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) {
      arr = [cardId];
      map.set(key, arr);
    } else if (arr[arr.length - 1] !== cardId && !arr.includes(cardId)) {
      arr.push(cardId);
    }
  };

  const indexCard = (card: CentralProductCard, feat: ExtractedProductFeatures) => {
    cardById.set(card.id, card);
    cardByNormName.set(normalizeTurkishAscii(card.canonicalName), card);
    cardFeatures.set(card.id, feat);

    const exactSig = buildExactCoreSignature(feat);
    if (exactSig && !cardByExactCoreSig.has(exactSig)) {
      cardByExactCoreSig.set(exactSig, card.id);
    }
    if (feat.canonicalFamily) {
      addToIndex(cardsByFamily, feat.canonicalFamily, card.id);
    }
    for (const t of feat.tokens) {
      if (PACKAGING_WORDS.has(t)) continue;
      addToIndex(cardsByToken, t, card.id);
      if (t.length >= 4) {
        addToIndex(cardsByAnchor, t.slice(0, 2), card.id);
        addToIndex(cardsByAnchor, t.slice(-2), card.id);
      }
    }
  };

  for (const c of centralCards) {
    indexCard(
      c,
      extractProductFeatures({
        id: c.id,
        invoiceId: "",
        direction: "incoming",
        lineNo: 1,
        originalProductName: c.canonicalName,
        originalDescription: c.aliases.join(" "),
        quantity: null,
        unit: c.baseUnit,
        unitPrice: null,
        vatRate: null,
        vatAmount: null,
        lineTotal: null,
        lineGrandTotal: null,
      })
    );
  }

  const assignments: LineMatchAssignment[] = [];
  const learnedRuleBySignature = new Map<string, LearnedMappingRule>();
  for (const rule of learnedRules) {
    learnedRuleBySignature.set(rule.signatureKey, rule);
  }

  const ensureCard = (
    preferredId: string | null,
    canonicalName: string,
    features: ExtractedProductFeatures,
    measurement: NormalizedUnitMeasurement,
    createdBy: "auto" | "user"
  ): CentralProductCard => {
    if (preferredId && cardById.has(preferredId)) {
      const existing = cardById.get(preferredId)!;
      if (features.effectiveName && !existing.aliases.includes(features.effectiveName)) {
        existing.aliases.push(features.effectiveName);
      }
      return existing;
    }

    const normCanonical = normalizeTurkishAscii(canonicalName);
    const byNormName = cardByNormName.get(normCanonical);
    if (byNormName) {
      if (features.effectiveName && !byNormName.aliases.includes(features.effectiveName)) {
        byNormName.aliases.push(features.effectiveName);
      }
      return byNormName;
    }

    const normSlug =
      normCanonical.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      `card-${centralCards.length + 1}`;
    const deterministicAutoId = `card-auto-${normSlug}`;
    const resolvedNewId =
      preferredId ||
      (cardById.has(deterministicAutoId)
        ? `${deterministicAutoId}-${centralCards.length + 1}`
        : deterministicAutoId);

    const newCard: CentralProductCard = {
      id: resolvedNewId,
      canonicalName,
      canonicalFamily: features.canonicalFamily,
      baseUnit: measurement.normalizedBaseUnit || "ADET",
      unitFamily: measurement.unitFamily,
      varieties: [...features.varietyTokens],
      aliases: features.effectiveName ? [features.effectiveName] : [],
      createdBy,
      isSpecialVariety: features.varietyTokens.length > 0,
    };
    centralCards.push(newCard);
    indexCard(newCard, features);
    return newCard;
  };

  // Process incoming lines first so central catalog forms naturally, then outgoing lines
  const orderedLines: StandardInvoiceLine[] = [];
  for (const l of enrichedLines) {
    if (l.direction === "incoming") orderedLines.push(l);
  }
  const hasAnyIncoming = orderedLines.length > 0;
  for (const l of enrichedLines) {
    if (l.direction === "outgoing") orderedLines.push(l);
  }

  // Cache best auto-match by exact feature signature + centralCards length invalidation?
  // Inverted index keeps candidate evaluation tiny (typically 1-20 cards instead of thousands).
  const MAX_CANDIDATES_PER_LINE = 60;
  const totalLinesToProcess = orderedLines.length;

  for (let lineIdx = 0; lineIdx < totalLinesToProcess; lineIdx++) {
    if (onProgress && (lineIdx % 1000 === 0 || lineIdx === totalLinesToProcess - 1)) {
      onProgress(lineIdx + 1, totalLinesToProcess);
    }

    const line = orderedLines[lineIdx];
    const features = line.features!;
    const measurement = line.measurement!;
    const override = manualOverrides[line.id];
    const sigKey = buildLearnedRuleSignature(line);
    const learnedRule = learnedRuleBySignature.get(sigKey);

    // 1. User Manual Override in current session
    if (override) {
      if (override.action === "rejected") {
        // Assign to its own isolated card so it separates cleanly from merged card
        const ownName = toTurkishTitleCase(features.effectiveName || line.originalProductName || "Ayrılan Ürün");
        const isolatedCard = ensureCard(
          `card-sep-${line.id}`,
          `${ownName} (Ayrıldı)`,
          features,
          measurement,
          "user"
        );
        assignments.push({
          lineId: line.id,
          invoiceId: line.invoiceId,
          direction: line.direction,
          centralProductId: isolatedCard.id,
          centralProductName: isolatedCard.canonicalName,
          confidenceScore: 100,
          confidenceTier: "low",
          approvalStatus: "user_rejected",
          decisionOrigin: "manual",
          matchReason:
            override.customReason ||
            "Kullanıcı otomatik eşleştirmeyi reddetti; ayrı ürün olarak değerlendirildi.",
          conflictWarnings: [],
          measurementNote: measurement.conversionExplanation,
        });
        continue;
      }

      if (override.targetCentralProductName || override.targetCentralProductId) {
        const targetCard = ensureCard(
          override.targetCentralProductId || null,
          override.targetCentralProductName || deriveCentralCardName(features),
          features,
          measurement,
          "user"
        );
        assignments.push({
          lineId: line.id,
          invoiceId: line.invoiceId,
          direction: line.direction,
          centralProductId: targetCard.id,
          centralProductName: targetCard.canonicalName,
          confidenceScore: 100,
          confidenceTier: "high",
          approvalStatus:
            override.action === "approved" ? "user_approved" : "manual_mapped",
          decisionOrigin: "manual",
          matchReason:
            override.customReason ||
            "Kullanıcı onayı / manuel eşleştirme ile merkezi ürün kartına bağlandı.",
          conflictWarnings: [],
          measurementNote: measurement.conversionExplanation,
        });
        continue;
      }
    }

    // 2. Learned Rule from previous user approvals
    if (learnedRule) {
      const targetCard = ensureCard(
        learnedRule.targetCentralProductId,
        learnedRule.targetCentralProductName,
        features,
        measurement,
        "user"
      );
      assignments.push({
        lineId: line.id,
        invoiceId: line.invoiceId,
        direction: line.direction,
        centralProductId: targetCard.id,
        centralProductName: targetCard.canonicalName,
        confidenceScore: 99,
        confidenceTier: "high",
        approvalStatus: "user_approved",
        decisionOrigin: "learned_rule",
        matchReason: `Önceden onaylanmış öğrenilmiş kural uygulandı (${learnedRule.usageCount}x kullanıldı).`,
        conflictWarnings: [],
        measurementNote: measurement.conversionExplanation,
      });
      continue;
    }

    // 3. Compare against existing central product cards (fast O(1) exact path + inverted index)
    let bestCard: CentralProductCard | null = null;
    let bestEval: PairScoreEvaluation | null = null;

    const lineExactSig = buildExactCoreSignature(features);
    const exactCardId = lineExactSig ? cardByExactCoreSig.get(lineExactSig) : undefined;
    if (exactCardId) {
      const exactCard = cardById.get(exactCardId);
      const exactFeat = cardFeatures.get(exactCardId);
      if (exactCard && exactFeat) {
        const evalRes = evaluateFeatureSimilarity(features, exactFeat);
        if (evalRes.canAutoMerge && evalRes.score >= 80) {
          bestCard = exactCard;
          bestEval = evalRes;
        }
      }
    }

    if (!bestCard) {
      if (centralCards.length <= MAX_CANDIDATES_PER_LINE) {
        for (const card of centralCards) {
          const cFeat = cardFeatures.get(card.id);
          if (!cFeat) continue;
          const evalRes = evaluateFeatureSimilarity(features, cFeat);
          if (!bestEval || evalRes.score > bestEval.score) {
            bestEval = evalRes;
            bestCard = card;
          }
        }
      } else {
        const candidateScores = new Map<string, number>();
        if (features.canonicalFamily) {
          const famList = cardsByFamily.get(features.canonicalFamily);
          if (famList) {
            for (const cid of famList) {
              candidateScores.set(cid, (candidateScores.get(cid) || 0) + 3);
            }
          }
        }
        for (const t of features.tokens) {
          if (PACKAGING_WORDS.has(t)) continue;
          const tokList = cardsByToken.get(t);
          if (tokList) {
            for (const cid of tokList) {
              candidateScores.set(cid, (candidateScores.get(cid) || 0) + 4);
            }
          }
          if (t.length >= 4) {
            const pList = cardsByAnchor.get(t.slice(0, 2));
            if (pList) {
              for (const cid of pList) {
                candidateScores.set(cid, (candidateScores.get(cid) || 0) + 1);
              }
            }
            const sList = cardsByAnchor.get(t.slice(-2));
            if (sList) {
              for (const cid of sList) {
                candidateScores.set(cid, (candidateScores.get(cid) || 0) + 1);
              }
            }
          }
        }

        let candidateIds: string[];
        if (candidateScores.size <= MAX_CANDIDATES_PER_LINE) {
          candidateIds = Array.from(candidateScores.keys());
        } else {
          candidateIds = Array.from(candidateScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_CANDIDATES_PER_LINE)
            .map(([cid]) => cid);
        }

        for (const cid of candidateIds) {
          const card = cardById.get(cid);
          const cFeat = cardFeatures.get(cid);
          if (!card || !cFeat) continue;
          const evalRes = evaluateFeatureSimilarity(features, cFeat);
          if (!bestEval || evalRes.score > bestEval.score) {
            bestEval = evalRes;
            bestCard = card;
          }
        }
      }
    }

    if (bestCard && bestEval && bestEval.canAutoMerge && bestEval.score >= 80) {
      if (!bestCard.aliases.includes(features.effectiveName) && features.effectiveName) {
        bestCard.aliases.push(features.effectiveName);
      }
      assignments.push({
        lineId: line.id,
        invoiceId: line.invoiceId,
        direction: line.direction,
        centralProductId: bestCard.id,
        centralProductName: bestCard.canonicalName,
        confidenceScore: bestEval.score,
        confidenceTier: "high",
        approvalStatus: "auto_matched",
        decisionOrigin: features.detectedFromDescription
          ? "description_extracted"
          : bestEval.score >= 95
          ? "exact_or_normalized"
          : "semantic_nlp",
        matchReason: bestEval.reason,
        conflictWarnings: bestEval.warnings,
        measurementNote: measurement.conversionExplanation,
      });
      continue;
    }

    // Medium confidence or special/packaging difference -> keep distinct card AND store suggested target for approval!
    const derivedName = deriveCentralCardName(features);
    const ownCard = ensureCard(null, derivedName, features, measurement, "auto");

    if (bestCard && bestEval && bestEval.score >= 45 && bestCard.id !== ownCard.id) {
      assignments.push({
        lineId: line.id,
        invoiceId: line.invoiceId,
        direction: line.direction,
        centralProductId: ownCard.id,
        centralProductName: ownCard.canonicalName,
        suggestedProductId: bestCard.id,
        suggestedProductName: bestCard.canonicalName,
        confidenceScore: bestEval.score,
        confidenceTier: "medium",
        approvalStatus: "needs_approval",
        decisionOrigin: features.detectedFromDescription
          ? "description_extracted"
          : "semantic_nlp",
        matchReason: bestEval.reason,
        conflictWarnings: bestEval.warnings,
        measurementNote: measurement.conversionExplanation,
      });
      continue;
    }

    // Low confidence or first line creating a new card
    const isUnmatchedOutgoing =
      hasAnyIncoming &&
      line.direction === "outgoing" &&
      (!bestCard || (bestEval && bestEval.score < 45));

    assignments.push({
      lineId: line.id,
      invoiceId: line.invoiceId,
      direction: line.direction,
      centralProductId: ownCard.id,
      centralProductName: ownCard.canonicalName,
      confidenceScore: isUnmatchedOutgoing
        ? bestEval?.score ?? 25
        : features.detectedFromDescription
        ? 85
        : 90,
      confidenceTier: isUnmatchedOutgoing ? "low" : "high",
      approvalStatus: isUnmatchedOutgoing ? "unmatched_review" : "auto_matched",
      decisionOrigin: features.detectedFromDescription
        ? "description_extracted"
        : isUnmatchedOutgoing
        ? "unmatched"
        : "exact_or_normalized",
      matchReason: isUnmatchedOutgoing
        ? "Gelen faturalarda yüksek güvenli eşleşme bulunamadığı için inceleme listesine alındı."
        : features.detectedFromDescription
        ? "Ürün adı boş olduğundan açıklama alanından ürün tespit edildi ve merkezi ürün kartı oluşturuldu."
        : "Merkezi ürün kartı oluşturuldu / eşleştirildi.",
      conflictWarnings: [],
      measurementNote: measurement.conversionExplanation,
    });
  }

  // Group lines into ProductComparisonRow per central card
  const assignmentByLineId = new Map<string, LineMatchAssignment>();
  assignments.forEach((a) => assignmentByLineId.set(a.lineId, a));

  const linesByCardId = new Map<string, StandardInvoiceLine[]>();
  for (const line of enrichedLines) {
    const a = assignmentByLineId.get(line.id);
    if (!a || !a.centralProductId) continue;
    const arr = linesByCardId.get(a.centralProductId) || [];
    arr.push(line);
    linesByCardId.set(a.centralProductId, arr);
  }

  const comparisonRows: ProductComparisonRow[] = [];
  const unmatchedLines: ComparisonReportPayload["unmatchedLines"] = [];
  const suspiciousAssignments: ComparisonReportPayload["suspiciousAssignments"] = [];

  for (const card of centralCards) {
    const cardLines = linesByCardId.get(card.id) || [];
    if (cardLines.length === 0) continue;

    const incomingLines = cardLines.filter((l) => l.direction === "incoming");
    const outgoingLines = cardLines.filter((l) => l.direction === "outgoing");
    const cardAssignments = cardLines
      .map((l) => assignmentByLineId.get(l.id)!)
      .filter(Boolean);

    // Check unit compatibility across all lines in this card
    const familiesPresent = new Set<UnitFamily>();
    const baseUnitsPresent = new Set<string>();
    const qtyByUnit = new Map<string, number>();

    for (const l of cardLines) {
      const m = l.measurement!;
      if (m.normalizedQuantity !== null) {
        familiesPresent.add(m.unitFamily);
        baseUnitsPresent.add(m.normalizedBaseUnit);
        qtyByUnit.set(
          m.normalizedBaseUnit,
          (qtyByUnit.get(m.normalizedBaseUnit) || 0) + m.normalizedQuantity
        );
      }
    }

    const unitConflictWarning = baseUnitsPresent.size > 1;
    const unitBreakdownLabel = Array.from(qtyByUnit.entries())
      .map(([u, q]) => `${Number(q.toFixed(3)).toLocaleString("tr-TR")} ${u}`)
      .join(" + ");

    const primaryBaseUnit = card.baseUnit || Array.from(baseUnitsPresent)[0] || "ADET";

    const sumQty = (list: StandardInvoiceLine[]) =>
      unitConflictWarning
        ? list
            .filter((l) => l.measurement?.normalizedBaseUnit === primaryBaseUnit)
            .reduce((acc, l) => acc + (l.measurement?.normalizedQuantity || 0), 0)
        : list.reduce((acc, l) => acc + (l.measurement?.normalizedQuantity || 0), 0);

    const sumAmount = (list: StandardInvoiceLine[]) =>
      list.reduce((acc, l) => acc + (l.lineTotal ?? 0), 0);

    const incomingQuantity = Number(sumQty(incomingLines).toFixed(3));
    const outgoingQuantity = Number(sumQty(outgoingLines).toFixed(3));
    const incomingAmount = Number(sumAmount(incomingLines).toFixed(2));
    const outgoingAmount = Number(sumAmount(outgoingLines).toFixed(2));

    const incomingUnitPriceAvg =
      incomingQuantity > 0 ? Number((incomingAmount / incomingQuantity).toFixed(2)) : null;
    const outgoingUnitPriceAvg =
      outgoingQuantity > 0 ? Number((outgoingAmount / outgoingQuantity).toFixed(2)) : null;

    const minConfidence = cardAssignments.reduce(
      (min, a) => Math.min(min, a.confidenceScore),
      100
    );
    const hasNeedsApproval = cardAssignments.some(
      (a) => a.approvalStatus === "needs_approval"
    );
    const hasUnmatched = cardAssignments.some(
      (a) => a.approvalStatus === "unmatched_review" || a.approvalStatus === "user_rejected"
    );

    let status: ProductComparisonCategoryStatus;
    if (hasNeedsApproval) {
      status = "needs_approval";
    } else if (incomingLines.length > 0 && outgoingLines.length > 0) {
      status = "matched";
    } else if (hasUnmatched) {
      status = "unmatched";
    } else if (incomingLines.length > 0 && outgoingLines.length === 0) {
      status = "only_incoming";
    } else {
      status = "only_outgoing";
    }

    const confidenceTier: ConfidenceTier =
      minConfidence >= 80 ? "high" : minConfidence >= 50 ? "medium" : "low";

    const reasonSummary = Array.from(
      new Set(cardAssignments.map((a) => a.matchReason).filter(Boolean))
    );

    comparisonRows.push({
      centralProductId: card.id,
      productName: card.canonicalName,
      canonicalFamily: card.canonicalFamily,
      varieties: card.varieties,
      baseUnit: primaryBaseUnit,
      unitFamily: card.unitFamily,
      unitConflictWarning,
      unitBreakdownLabel: unitBreakdownLabel || `0 ${primaryBaseUnit}`,
      incomingQuantity,
      incomingAmount,
      incomingUnitPriceAvg,
      outgoingQuantity,
      outgoingAmount,
      outgoingUnitPriceAvg,
      quantityDifference: Number((incomingQuantity - outgoingQuantity).toFixed(3)),
      amountDifference: Number((outgoingAmount - incomingAmount).toFixed(2)),
      confidenceScore: minConfidence,
      confidenceTier,
      status,
      incomingLines,
      outgoingLines,
      assignments: cardAssignments,
      reasonSummary,
    });
  }

  const comparisonRowByCardId = new Map<string, ProductComparisonRow>();
  for (const r of comparisonRows) {
    comparisonRowByCardId.set(r.centralProductId, r);
  }

  for (const line of enrichedLines) {
    const a = assignmentByLineId.get(line.id);
    const inv = invoiceMap.get(line.invoiceId);
    if (!a || !inv) continue;
    if (a.approvalStatus === "needs_approval") {
      suspiciousAssignments.push({ line, invoice: inv, assignment: a });
    } else {
      const cardRow = a.centralProductId
        ? comparisonRowByCardId.get(a.centralProductId)
        : undefined;
      if (
        a.approvalStatus === "unmatched_review" ||
        a.approvalStatus === "user_rejected" ||
        (cardRow && (cardRow.status === "only_incoming" || cardRow.status === "only_outgoing"))
      ) {
        unmatchedLines.push({ line, invoice: inv, assignment: a });
      }
    }
  }

  let matchedProductCount = 0;
  let onlyIncomingCount = 0;
  let onlyOutgoingCount = 0;
  let totalIncomingAmountSum = 0;
  let totalOutgoingAmountSum = 0;
  for (const r of comparisonRows) {
    if (r.status === "matched") matchedProductCount += 1;
    else if (r.status === "only_incoming") onlyIncomingCount += 1;
    else if (r.status === "only_outgoing") onlyOutgoingCount += 1;
    totalIncomingAmountSum += r.incomingAmount;
    totalOutgoingAmountSum += r.outgoingAmount;
  }

  const summary: ComparisonAnalysisSummary = {
    incomingInvoiceCount: incomingInvoices.length,
    outgoingInvoiceCount: outgoingInvoices.length,
    totalIncomingLines: totalIncomingLineCount,
    totalOutgoingLines: totalOutgoingLineCount,
    matchedProductCount,
    unmatchedLineCount: unmatchedLines.length,
    needsReviewCount: suspiciousAssignments.length,
    onlyIncomingCount,
    onlyOutgoingCount,
    totalIncomingAmount: Number(totalIncomingAmountSum.toFixed(2)),
    totalOutgoingAmount: Number(totalOutgoingAmountSum.toFixed(2)),
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    centralProducts: centralCards,
    comparisonRows,
    unmatchedLines,
    suspiciousAssignments,
  };
}
