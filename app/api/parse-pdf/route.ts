import { NextRequest, NextResponse } from "next/server";
import { parseTurkishAmount, parseExcelDate, normalizeForSearch } from "../../utils/excel";


function setGlobal(name: string, value: any) {
  try { (globalThis as any)[name] = value; } catch {}
  try { (global as any)[name] = value; } catch {}
  try {
    Object.defineProperty(global, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {}
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {}
}

class DOMMatrixPolyfill {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m13 = 0; m14 = 0;
  m21 = 0; m22 = 1; m23 = 0; m24 = 0;
  m31 = 0; m32 = 0; m33 = 1; m34 = 0;
  m41 = 0; m42 = 0; m43 = 0; m44 = 1;
  is2D = true;
  isIdentity = true;

  constructor(init?: any) {
    if (Array.isArray(init) || (init && typeof init[Symbol.iterator] === "function")) {
      const arr = Array.from(init as number[]);
      if (arr.length === 6) {
        this.a = this.m11 = arr[0];
        this.b = this.m12 = arr[1];
        this.c = this.m21 = arr[2];
        this.d = this.m22 = arr[3];
        this.e = this.m41 = arr[4];
        this.f = this.m42 = arr[5];
        this.is2D = true;
      } else if (arr.length === 16) {
        this.m11 = arr[0]; this.m12 = arr[1]; this.m13 = arr[2]; this.m14 = arr[3];
        this.m21 = arr[4]; this.m22 = arr[5]; this.m23 = arr[6]; this.m24 = arr[7];
        this.m31 = arr[8]; this.m32 = arr[9]; this.m33 = arr[10]; this.m34 = arr[11];
        this.m41 = arr[12]; this.m42 = arr[13]; this.m43 = arr[14]; this.m44 = arr[15];
        this.a = this.m11; this.b = this.m12; this.c = this.m21; this.d = this.m22;
        this.e = this.m41; this.f = this.m42;
        this.is2D = false;
      }
      this.isIdentity =
        this.m11 === 1 && this.m12 === 0 && this.m13 === 0 && this.m14 === 0 &&
        this.m21 === 0 && this.m22 === 1 && this.m23 === 0 && this.m24 === 0 &&
        this.m31 === 0 && this.m32 === 0 && this.m33 === 1 && this.m34 === 0 &&
        this.m41 === 0 && this.m42 === 0 && this.m43 === 0 && this.m44 === 1;
    }
  }

  multiply(other?: any) {
    return new DOMMatrixPolyfill([
      this.a, this.b, this.c, this.d, this.e, this.f,
    ]).multiplySelf(other);
  }

  multiplySelf(other?: any) {
    if (!other) return this;
    const o = other;
    const a = this.a * (o.a ?? 1) + this.c * (o.b ?? 0);
    const b = this.b * (o.a ?? 1) + this.d * (o.b ?? 0);
    const c = this.a * (o.c ?? 0) + this.c * (o.d ?? 1);
    const d = this.b * (o.c ?? 0) + this.d * (o.d ?? 1);
    const e = this.a * (o.e ?? 0) + this.c * (o.f ?? 0) + this.e;
    const f = this.b * (o.e ?? 0) + this.d * (o.f ?? 0) + this.f;
    this.a = this.m11 = a;
    this.b = this.m12 = b;
    this.c = this.m21 = c;
    this.d = this.m22 = d;
    this.e = this.m41 = e;
    this.f = this.m42 = f;
    this.isIdentity = false;
    return this;
  }

  preMultiplySelf(other?: any) {
    if (!other) return this;
    const o = other;
    const a = (o.a ?? 1) * this.a + (o.c ?? 0) * this.b;
    const b = (o.b ?? 0) * this.a + (o.d ?? 1) * this.b;
    const c = (o.a ?? 1) * this.c + (o.c ?? 0) * this.d;
    const d = (o.b ?? 0) * this.c + (o.d ?? 1) * this.d;
    const e = (o.a ?? 1) * this.e + (o.c ?? 0) * this.f + (o.e ?? 0);
    const f = (o.b ?? 0) * this.e + (o.d ?? 1) * this.f + (o.f ?? 0);
    this.a = this.m11 = a;
    this.b = this.m12 = b;
    this.c = this.m21 = c;
    this.d = this.m22 = d;
    this.e = this.m41 = e;
    this.f = this.m42 = f;
    this.isIdentity = false;
    return this;
  }

  translate(tx = 0, ty = 0, tz = 0) {
    return new DOMMatrixPolyfill([
      this.a, this.b, this.c, this.d, this.e, this.f,
    ]).translateSelf(tx, ty, tz);
  }

  translateSelf(tx = 0, ty = 0, tz = 0) {
    this.e += this.a * tx + this.c * ty;
    this.f += this.b * tx + this.d * ty;
    this.m41 = this.e;
    this.m42 = this.f;
    this.isIdentity = false;
    return this;
  }

  scale(sx = 1, sy = sx, sz = 1) {
    return new DOMMatrixPolyfill([
      this.a, this.b, this.c, this.d, this.e, this.f,
    ]).scaleSelf(sx, sy, sz);
  }

  scaleSelf(sx = 1, sy = sx, sz = 1) {
    this.a *= sx;
    this.b *= sx;
    this.c *= sy;
    this.d *= sy;
    this.m11 = this.a;
    this.m12 = this.b;
    this.m21 = this.c;
    this.m22 = this.d;
    this.isIdentity = false;
    return this;
  }

  rotate(angle = 0) {
    return this;
  }

  rotateSelf(angle = 0) {
    return this;
  }

  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) > 1e-12) {
      const invDet = 1 / det;
      const a = this.d * invDet;
      const b = -this.b * invDet;
      const c = -this.c * invDet;
      const d = this.a * invDet;
      const e = (this.c * this.f - this.d * this.e) * invDet;
      const f = (this.b * this.e - this.a * this.f) * invDet;
      this.a = this.m11 = a;
      this.b = this.m12 = b;
      this.c = this.m21 = c;
      this.d = this.m22 = d;
      this.e = this.m41 = e;
      this.f = this.m42 = f;
    }
    return this;
  }

  inverse() {
    const copy = new DOMMatrixPolyfill([
      this.a, this.b, this.c, this.d, this.e, this.f,
    ]);
    return copy.invertSelf();
  }

  transformPoint(point?: any) {
    if (!point) return { x: 0, y: 0, z: 0, w: 1 };
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: point.z ?? 0,
      w: point.w ?? 1,
    };
  }

  toFloat32Array() {
    return new Float32Array([
      this.m11, this.m12, this.m13, this.m14,
      this.m21, this.m22, this.m23, this.m24,
      this.m31, this.m32, this.m33, this.m34,
      this.m41, this.m42, this.m43, this.m44,
    ]);
  }

  toFloat64Array() {
    return new Float64Array([
      this.m11, this.m12, this.m13, this.m14,
      this.m21, this.m22, this.m23, this.m24,
      this.m31, this.m32, this.m33, this.m34,
      this.m41, this.m42, this.m43, this.m44,
    ]);
  }
}

class Path2DPolyfill {
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}

class ImageDataPolyfill {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(w = 1, h = 1) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

class DOMPointPolyfill {
  x = 0; y = 0; z = 0; w = 1;
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }
  static fromPoint(other: any) {
    return new DOMPointPolyfill(other?.x, other?.y, other?.z, other?.w);
  }
  matrixTransform() { return this; }
}

class DOMRectPolyfill {
  x = 0; y = 0; width = 0; height = 0;
  top = 0; right = 0; bottom = 0; left = 0;
  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.x = this.left = x;
    this.y = this.top = y;
    this.width = w;
    this.height = h;
    this.right = x + w;
    this.bottom = y + h;
  }
  static fromRect(other: any) {
    return new DOMRectPolyfill(other?.x, other?.y, other?.width, other?.height);
  }
}

// Register polyfills everywhere
function ensureNodePolyfills() {
  setGlobal("DOMMatrix", DOMMatrixPolyfill);
  setGlobal("Path2D", Path2DPolyfill);
  setGlobal("ImageData", ImageDataPolyfill);
  setGlobal("DOMPoint", DOMPointPolyfill);
  setGlobal("DOMRect", DOMRectPolyfill);
}

// Run immediately on module initialization
ensureNodePolyfills();

async function ensureWorker() {
  ensureNodePolyfills();
  if (!(globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
    try {
      // @ts-ignore - worker module lacks typescript definitions
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      const WMH =
        (worker as any).WorkerMessageHandler ||
        (worker as any).default?.WorkerMessageHandler ||
        (worker as any).default;

      setGlobal("pdfjsWorker", {
        WorkerMessageHandler: WMH,
      });
    } catch (e: any) {
      console.warn("Could not load pdf.worker.mjs directly:", e?.message);
    }
  }
}


export interface ParsedStatementTransaction {

  id: string;
  date: string;
  year?: number;
  docNo?: string;
  type?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  sourceFile: string;
  page?: number;
}

// Helper to extract transactions from text lines of an accounting statement PDF
function parseLinesToTransactions(
  lines: string[],
  sourceFileName: string,
  pageNumber: number
): ParsedStatementTransaction[] {
  const transactions: ParsedStatementTransaction[] = [];

  // Date regex: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY or YYYY-MM-DD
  // Date regex: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY or YYYY-MM-DD
  const dateRegex = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/;

  // Helper to prioritize Turkish e-fatura / invoice numbers over generic sequence numbers
  const extractDocNoFromText = (text: string, currentYear?: number): string | undefined => {
    // 1. Standard 16-character Turkish E-Fatura / E-Arşiv format (e.g. NY22026000003416, GIB2024000012345)
    const eFaturaMatch = text.match(/\b([A-Za-z]{1,4}[A-Za-z0-9](?:20\d{2})\d{9})\b/i);
    if (eFaturaMatch) {
      return eFaturaMatch[1].toUpperCase();
    }

    // 2. Composite pattern: DATE-CODE-NAME (e.g. 04/08/2025-8489-NUR YAPI...)
    const compositeMatch = text.match(
      /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*[-_/]\s*([A-Za-z0-9]{3,16})\s*[-_/]/
    );
    if (compositeMatch) {
      const code = compositeMatch[1].trim();
      if (code && code !== String(currentYear)) {
        return code.toUpperCase();
      }
    }

    // 3. Delimited invoice numbers (e.g. FTR-2024-00105, FAT/2026/001, GIB-123456)
    const delimitedMatch = text.match(/\b([A-Za-z]{1,6}(?:[-_/][A-Za-z0-9]+)+)\b/);
    if (delimitedMatch) {
      return delimitedMatch[1].toUpperCase();
    }

    // 4. Any 16-character alphanumeric code containing letters and digits
    const any16Match = text.match(/\b([A-Za-z0-9]{16})\b/);
    if (any16Match && /[A-Za-z]/.test(any16Match[1]) && /\d/.test(any16Match[1])) {
      return any16Match[1].toUpperCase();
    }

    // 5. Letter prefix followed by digits (e.g., FTR12345, A1234567, FAT99123)
    const prefixMatch = text.match(/\b([A-Za-z]{1,5}\d{4,14})\b/);
    if (prefixMatch) {
      return prefixMatch[1].toUpperCase();
    }

    // 6. Keyword match for slip / tahsilat / dekont (e.g. Tahsilat 8489, Slip 8489, Dekont 8489)
    const kwMatch = text.match(
      /(?:tahsilat|tediye|havale|eft|pos|slip|dekont|fis|fiş|belge|ref|no|nolu)\s*:?[-_#]?\s*([A-Za-z0-9]{3,12})\b/i
    );
    if (kwMatch && kwMatch[1] !== String(currentYear)) {
      return kwMatch[1].toUpperCase();
    }

    // 7. Fallback: Numeric document numbers (4 to 12 digits, not equal to current year)
    const numMatches = text.match(/\b(\d{4,12})\b/g);
    if (numMatches) {
      const valid = numMatches.find((n) => n !== String(currentYear) && !/^05\d{2}/.test(n));
      if (valid) return valid;
    }

    return undefined;
  };

  // Number regex matching currency format with 2 decimals (e.g., 900.00 or 171,482.96 or 900,00 or 171.482,96)
  const currencyAmountRegex = /[-–]?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}\b/g;

  // Stitch multiline PDF rows (e.g. line 1: Date & Desc, line 2: Amount, line 3: B/A indicator)
  const stitchedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const hasDate = dateRegex.test(rawLine);
    if (hasDate) {
      let combined = rawLine;
      const amounts = rawLine.match(currencyAmountRegex) || [];
      if (amounts.length === 0) {
        // Look ahead for amounts on next lines (up to 3 lines)
        while (i + 1 < lines.length) {
          const nextTrim = lines[i + 1].trim();
          if (dateRegex.test(nextTrim)) break; // Next record
          combined += " " + nextTrim;
          i++;
          if (currencyAmountRegex.test(combined)) {
            // Also check for trailing B/A indicator line
            if (i + 1 < lines.length) {
              const afterTrim = lines[i + 1].trim();
              if (/^[ab]$/i.test(afterTrim) || /^(?:borc|alacak)\b/i.test(afterTrim)) {
                combined += " " + afterTrim;
                i++;
              }
            }
            break;
          }
        }
      } else {
        // Has amount, check if immediate next line is B/A indicator
        if (i + 1 < lines.length) {
          const nextTrim = lines[i + 1].trim();
          if (/^[ab]$/i.test(nextTrim) || /^(?:borc|alacak)\b/i.test(nextTrim)) {
            combined += " " + nextTrim;
            i++;
          }
        }
      }
      stitchedLines.push(combined);
    } else {
      // Continuation of previous record
      if (stitchedLines.length > 0 && !currencyAmountRegex.test(stitchedLines[stitchedLines.length - 1])) {
        stitchedLines[stitchedLines.length - 1] += " " + rawLine;
      }
    }
  }

  stitchedLines.forEach((line, lineIdx) => {
    if (!line) return;

    const normLine = normalizeForSearch(line);
    // Ignore summary and table footer lines that could be confused with invoices
    if (
      normLine.includes("genel toplam") ||
      normLine.includes("sayfa toplam") ||
      normLine.includes("nakli yekun") ||
      normLine.includes("yekun") ||
      normLine.startsWith("toplam:") ||
      normLine.endsWith(" toplam")
    ) {
      return;
    }

    // Check if line contains a date
    const allDates = line.match(new RegExp(dateRegex.source, "g")) || [];
    if (allDates.length === 0) return;

    const rawDate = allDates[0] || "";
    const formattedDate = parseExcelDate(rawDate);
    if (!formattedDate) return;

    // Extract year from date
    let year: number | undefined;
    const yearMatch = formattedDate.match(/\d{4}/);
    if (yearMatch) {
      year = parseInt(yearMatch[0], 10);
    }

    // Strip ALL dates from line so secondary dates (e.g., Vade: 21.08.2026) are not parsed as amounts
    let lineWithoutDates = line;
    allDates.forEach((d) => {
      lineWithoutDates = lineWithoutDates.replaceAll(d, " ");
    });

    // Identify Doc No (e.g. NY22026000003416, 8489, FTR-2024-00101, etc.)
    const docNo = extractDocNoFromText(lineWithoutDates, year);

    // Remove docNo and phone numbers from line before amount extraction
    let cleanAmountLine = lineWithoutDates;
    if (docNo) {
      cleanAmountLine = cleanAmountLine.replace(docNo, " ");
    }
    // Remove Turkish mobile phone numbers (e.g. 0544 799 63 55)
    cleanAmountLine = cleanAmountLine.replace(/\b05\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g, " ");

    // Find all currency amounts on this line
    const amounts = cleanAmountLine.match(currencyAmountRegex) || [];
    if (amounts.length === 0) return;

    // Interpret debit and credit from amounts
    let debit = 0;
    let credit = 0;
    let balance: number | undefined;

    if (amounts.length === 1) {
      // Single amount - check if line mentions Borç/Alacak or B/A
      const amt = Math.abs(parseTurkishAmount(amounts[0]));
      const isExplicitDebit =
        normLine.endsWith(" b") ||
        normLine.endsWith("b") ||
        normLine.includes(" b ") ||
        normLine.includes(" borc") ||
        normLine.includes(" borç");

      const isExplicitCredit =
        normLine.endsWith(" a") ||
        normLine.endsWith("a") ||
        normLine.includes(" a ") ||
        normLine.includes(" alacak");

      if (isExplicitDebit && !isExplicitCredit) {
        debit = amt;
      } else if (isExplicitCredit && !isExplicitDebit) {
        credit = amt;
      } else if (
        normLine.includes("alacak") ||
        normLine.includes("tahsilat") ||
        normLine.includes("odeme") ||
        normLine.includes("ödeme")
      ) {
        credit = amt;
      } else {
        debit = amt;
      }
    } else if (amounts.length === 2) {
      debit = parseTurkishAmount(amounts[0]);
      credit = parseTurkishAmount(amounts[1]);
    } else if (amounts.length >= 3) {
      // In Turkish statement tables: [Borç] [Alacak] [Bakiye]
      debit = parseTurkishAmount(amounts[0]);
      credit = parseTurkishAmount(amounts[1]);
      balance = parseTurkishAmount(amounts[2]);
    }

    // Skip line if both debit and credit are 0
    if (debit === 0 && credit === 0) return;

    // Build description: remove date and numbers from line
    let desc = line
      .replace(rawDate, "")
      .replace(docNo || "", "");
    amounts.forEach((amt) => {
      desc = desc.replace(amt.trim(), "");
    });
    desc = desc.replace(/[\|\t]/g, " ").replace(/\s+/g, " ").trim();

    // Infer transaction type
    let type = "Hareket";
    const norm = normalizeForSearch(desc + " " + (docNo || ""));
    if (norm.includes("sat") && (norm.includes("fat") || norm.includes("ftr"))) {
      type = "Satış Faturası";
    } else if (norm.includes("al") && (norm.includes("fat") || norm.includes("ftr"))) {
      type = "Alış Faturası";
    } else if (norm.includes("fat") || norm.includes("ftr")) {
      type = debit > 0 ? "Satış Faturası" : "Alış Faturası";
    } else if (norm.includes("havale") || norm.includes("eft") || norm.includes("bnk")) {
      type = "Banka Havalesi / EFT";
    } else if (norm.includes("tahsilat")) {
      type = "Tahsilat";
    } else if (norm.includes("odeme") || norm.includes("ödeme") || norm.includes("tediye")) {
      type = "Ödeme";
    } else if (norm.includes("kasa") || norm.includes("nakit")) {
      type = debit > 0 ? "Kasa Tahsilat" : "Kasa Tediye";
    } else if (norm.includes("cek") || norm.includes("çek") || norm.includes("senet")) {
      type = "Çek / Senet";
    } else if (norm.includes("devir")) {
      type = "Devir Fişi";
    }

    transactions.push({
      id: `ext-tx-${Date.now()}-${pageNumber}-${lineIdx}-${Math.random().toString(36).substring(2, 6)}`,
      date: formattedDate,
      year,
      docNo,
      type,
      description: desc || "İşlem",
      debit,
      credit,
      balance,
      sourceFile: sourceFileName,
      page: pageNumber,
    });
  });

  return transactions;
}

export async function POST(req: NextRequest) {
  try {
    await ensureWorker();

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];


    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Lütfen en az bir PDF dosyası seçiniz." },
        { status: 400 }
      );
    }

    // Dynamic import of pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfModule = require("pdf-parse");

    const PDFParse = pdfModule.PDFParse;

    const allTransactions: ParsedStatementTransaction[] = [];
    const processedFilesInfo: { name: string; pages: number; txCount: number }[] = [];

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const result = await parser.getText();

      const rawPages = result?.pages && result.pages.length > 0
        ? result.pages
        : [{ text: result?.text || "", num: 1 }];

      let fileTxCount = 0;

      rawPages.forEach((p: { text: string; num: number }) => {
        const text = p.text || "";
        const lines = text.split(/\r?\n/);
        const txs = parseLinesToTransactions(lines, file.name, p.num || 1);
        allTransactions.push(...txs);
        fileTxCount += txs.length;
      });

      processedFilesInfo.push({
        name: file.name,
        pages: rawPages.length || 1,
        txCount: fileTxCount,
      });
    }

    // Sort all transactions chronologically
    allTransactions.sort((a, b) => {
      // Convert DD.MM.YYYY to comparable YYYYMMDD
      const parseDateKey = (dStr: string) => {
        const parts = dStr.split(".");
        if (parts.length === 3) {
          return `${parts[2]}${parts[1]}${parts[0]}`;
        }
        return dStr;
      };
      return parseDateKey(a.date).localeCompare(parseDateKey(b.date));
    });

    // Calculate running balance for external statement
    let running = 0;
    allTransactions.forEach((t) => {
      running += t.debit - t.credit;
      if (t.balance === undefined) {
        t.balance = running;
      }
    });

    return NextResponse.json({
      success: true,
      files: processedFilesInfo,
      totalTransactions: allTransactions.length,
      transactions: allTransactions,
    });
  } catch (err: any) {
    console.error("PDF parse error:", err);
    return NextResponse.json(
      {
        error: `PDF dosyası okunurken hata oluştu: ${err?.message || "Bilinmeyen hata"}`,
      },
      { status: 500 }
    );
  }
}


