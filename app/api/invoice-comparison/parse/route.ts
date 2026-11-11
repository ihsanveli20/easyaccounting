import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { pathToFileURL } from "url";
import {
  detectFileFormat,
  MAX_INVOICE_FILE_BYTES,
  parseInvoiceJsonSecure,
  parseInvoicePdfText,
  parseInvoiceXmlSecure,
} from "../../../utils/invoiceFileParser";
import {
  InvoiceDirection,
  StandardInvoiceDocument,
} from "../../../types/invoiceComparison";

// Polyfills required by pdfjs-dist inside pdf-parse v2 on Node.js
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;
    multiply() {
      return new DOMMatrixPolyfill();
    }
    inverse() {
      return new DOMMatrixPolyfill();
    }
    translate() {
      return new DOMMatrixPolyfill();
    }
    scale() {
      return new DOMMatrixPolyfill();
    }
    rotate() {
      return new DOMMatrixPolyfill();
    }
    transformPoint(p?: { x?: number; y?: number }) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 };
    }
  }
  // @ts-expect-error polyfill for pdfjs
  globalThis.DOMMatrix = DOMMatrixPolyfill;
}

if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error polyfill for pdfjs
  globalThis.Path2D = class Path2DPolyfill {};
}

if (typeof globalThis.ImageData === "undefined") {
  // @ts-expect-error polyfill for pdfjs
  globalThis.ImageData = class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

let workerInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePdfWorker(PDFParseClass: any) {
  if (workerInitialized) return;
  try {
    const workerAbsolutePath = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs"
    );
    const workerUrl = pathToFileURL(workerAbsolutePath).href;
    if (typeof PDFParseClass.setWorker === "function") {
      PDFParseClass.setWorker(workerUrl);
    }
    workerInitialized = true;
  } catch (err) {
    console.warn("Could not initialize pdfjs worker:", err);
  }
}

/**
 * Ephemeral stateless endpoint for parsing incoming/outgoing XML, PDF, JSON invoice files.
 * Zero database persistence and zero disk storage — request memory is released immediately.
 */
export async function POST(request: NextRequest) {
  let transientBuffers: Array<Buffer | null> = [];

  try {
    const contentType = request.headers.get("content-type") || "";

    // Client-side OCR fallback text parsing (for scanned PDFs)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const rawText = typeof body.rawText === "string" ? body.rawText : "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "taranmis-fatura.pdf";
      const direction: InvoiceDirection =
        body.direction === "outgoing" ? "outgoing" : "incoming";

      const doc = parseInvoicePdfText(
        rawText,
        fileName,
        direction,
        Buffer.byteLength(rawText, "utf8")
      );
      return NextResponse.json(
        {
          documents: [doc],
          errors: [],
          ephemeral: true,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const dirRaw = String(formData.get("direction") || "incoming");
    const direction: InvoiceDirection =
      dirRaw === "outgoing" ? "outgoing" : "incoming";

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Lütfen en az bir XML, PDF veya JSON fatura dosyası yükleyin." },
        { status: 400 }
      );
    }

    const documents: StandardInvoiceDocument[] = [];
    const errors: Array<{ fileName: string; message: string }> = [];

    for (const file of files) {
      const format = detectFileFormat(file.name, file.type);
      if (!format) {
        errors.push({
          fileName: file.name,
          message:
            "Desteklenmeyen dosya türü. Yalnızca XML, PDF ve JSON dosyaları kabul edilir.",
        });
        continue;
      }

      if (file.size > MAX_INVOICE_FILE_BYTES) {
        errors.push({
          fileName: file.name,
          message: "Dosya boyutu 4 MB güvenlik sınırını aşıyor.",
        });
        continue;
      }

      try {
        if (format === "xml") {
          const xmlText = await file.text();
          const parsedXml = parseInvoiceXmlSecure(xmlText, file.name, direction, file.size);
          documents.push(parsedXml);
        } else if (format === "json") {
          const jsonText = await file.text();
          const parsedJsonDocs = parseInvoiceJsonSecure(
            jsonText,
            file.name,
            direction,
            file.size
          );
          documents.push(...parsedJsonDocs);
        } else if (format === "pdf") {
          const arrayBuffer = await file.arrayBuffer();
          let pdfBuffer: Buffer | null = Buffer.from(arrayBuffer);
          transientBuffers.push(pdfBuffer);

          const pdfParseModule = await import("pdf-parse");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const PDFParseClass = (pdfParseModule as any).PDFParse;
          await ensurePdfWorker(PDFParseClass);

          const parser = new PDFParseClass({ data: pdfBuffer, verbosity: 0 });
          const result = await parser.getText();
          const rawText: string = result?.text || "";
          pdfBuffer = null;

          const parsedPdf = parseInvoicePdfText(rawText, file.name, direction, file.size);
          documents.push(parsedPdf);
        }
      } catch (fileErr: unknown) {
        errors.push({
          fileName: file.name,
          message:
            fileErr instanceof Error
              ? fileErr.message
              : "Dosya ayrıştırılırken hata oluştu.",
        });
      }
    }

    return NextResponse.json(
      {
        documents,
        errors,
        ephemeral: true,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: unknown) {
    console.error("Ephemeral invoice comparison parse error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Faturalar geçici olarak ayrıştırılırken sunucu hatası oluştu.",
      },
      { status: 500 }
    );
  } finally {
    // Explicit transient memory cleanup after parsing response is prepared
    transientBuffers = [];
  }
}

