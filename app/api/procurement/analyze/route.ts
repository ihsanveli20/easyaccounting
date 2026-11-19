import { NextResponse } from "next/server";
import {
  AiExtractionOutput,
  buildDraftQuoteFromExtraction,
  extractStructuredQuoteFromText,
} from "../../../utils/procurementAiExtractor";
import { ProcurementNeedItem, QuoteSourceType } from "../../../types/procurement";

// Polyfills required by pdfjs-dist inside pdf-parse v2 on Node.js
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    invertSelf() { return this; }
    transformPoint(p: { x?: number; y?: number } = { x: 0, y: 0 }) {
      return { x: p.x ?? 0, y: p.y ?? 0, z: 0, w: 1 };
    }
  };
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as Record<string, unknown>).Path2D = class Path2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    rect() {}
  };
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

const AI_SYSTEM_PROMPT = `Sen bir yapı malzemesi satın alma teklif analiz asistanısın.
Görevin, verilen teklif metninden veya görselinden yalnızca açıkça yazan bilgileri JSON olarak çıkarmaktır.
KESİN KURALLAR:
1. Asla tahmin yürütme veya uydurma. Metinde/görselde açıkça bulunmayan her alanı null (veya boş string) bırak.
2. KDV oranı metinde yazmıyorsa vatRate ve documentVatRate alanlarını null döndür (varsayılan 20 yazma).
3. Sadece geçerli JSON döndür, başka açıklama ekleme.`;

async function callGeminiIfConfigured(params: {
  text?: string;
  imageBase64?: string;
  imageMime?: string;
  needs: ProcurementNeedItem[];
}): Promise<AiExtractionOutput | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const needsHint = params.needs.map((n) => `${n.name} (${n.quantity} ${n.unit})`).join(", ");
  const userPrompt = `${AI_SYSTEM_PROMPT}
İhtiyaç listesi referansı: ${needsHint || "Yok"}

Beklenen JSON şeması:
{
  "supplierName": "string veya boş",
  "quoteDate": "string veya null",
  "quoteNo": "string veya null",
  "currency": "TRY | USD | EUR",
  "paymentTerms": "string veya null",
  "deliveryDuration": "string veya null",
  "validityPeriod": "string veya null",
  "shippingMode": "per_order | per_item | included | free",
  "orderShippingAmount": number,
  "shippingVatRate": number | null,
  "shippingVatIncluded": boolean,
  "vatIncluded": boolean,
  "documentVatRate": number | null,
  "items": [
    {
      "rawProductName": "string",
      "description": "string | null",
      "pricingMode": "unit | total",
      "offeredQuantity": number | null,
      "minOrderQuantity": number | null,
      "unit": "string",
      "unitPrice": number | null,
      "lineTotal": number | null,
      "discountRate": number,
      "discountAmount": number,
      "vatRate": number | null,
      "vatIncluded": boolean
    }
  ]
}

${params.text ? `Teklif Metni:\n${params.text}` : "Teklif görselini analiz et."}`;

  const parts: Array<Record<string, unknown>> = [{ text: userPrompt }];
  if (params.imageBase64 && params.imageMime) {
    parts.push({
      inlineData: {
        mimeType: params.imageMime,
        data: params.imageBase64,
      },
    });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) return null;
    return JSON.parse(rawJson) as AiExtractionOutput;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // Case 1: JSON request (text quote or post-OCR text)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const rawText = String(body.rawText || "").trim();
      const comparisonId = String(body.comparisonId || "");
      const fileName = String(body.fileName || "Metin_Teklif");
      const sourceType = (body.sourceType as QuoteSourceType) || "text";
      const needs: ProcurementNeedItem[] = Array.isArray(body.needs) ? body.needs : [];
      const originalFileDataUrl = body.originalFileDataUrl
        ? String(body.originalFileDataUrl)
        : undefined;
      const originalFileMime = body.originalFileMime ? String(body.originalFileMime) : undefined;

      if (!rawText) {
        return NextResponse.json(
          { success: false, error: "Analiz edilecek teklif metni boş." },
          { status: 400 }
        );
      }

      const aiResult = await callGeminiIfConfigured({ text: rawText, needs });
      const extraction = aiResult || extractStructuredQuoteFromText(rawText, fileName, needs);

      const quote = buildDraftQuoteFromExtraction(extraction, {
        comparisonId,
        sourceType,
        needs,
        rawText,
        originalFileName: fileName !== "Metin_Teklif" ? fileName : undefined,
        originalFileMime,
        originalFileDataUrl,
        usedAi: Boolean(aiResult),
      });

      return NextResponse.json({
        success: true,
        usedAi: Boolean(aiResult),
        quote,
      });
    }

    // Case 2: Multipart file upload (PDF or Image)
    const formData = await request.formData();
    const file = formData.get("file");
    const comparisonId = String(formData.get("comparisonId") || "");
    const needsRaw = String(formData.get("needs") || "[]");
    const needs: ProcurementNeedItem[] = JSON.parse(needsRaw);

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Dosya bulunamadı." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    const lowerName = file.name.toLowerCase();

    // Preserve original file as Data URL if <= 3 MB for in-app preview in Teklif Detayları
    const dataUrl =
      buffer.length <= 3 * 1024 * 1024
        ? `data:${mime};base64,${buffer.toString("base64")}`
        : undefined;

    if (lowerName.endsWith(".pdf") || mime === "application/pdf") {
      let extractedText = "";
      try {
        const pdfParseMod = await import("pdf-parse");
        const PDFParseClass = (
          pdfParseMod as unknown as {
            PDFParse: new (opts: { data: Uint8Array }) => {
              getText: () => Promise<{ text?: string }>;
              destroy?: () => Promise<void>;
            };
          }
        ).PDFParse;

        if (PDFParseClass) {
          const parser = new PDFParseClass({ data: new Uint8Array(buffer) });
          const textResult = await parser.getText();
          extractedText = textResult?.text || "";
          if (typeof parser.destroy === "function") {
            await parser.destroy().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("PDF text extraction warning:", err);
      }

      if (extractedText.trim().length < 20) {
        return NextResponse.json({
          success: true,
          needsClientOcr: true,
          sourceType: "pdf",
          fileName: file.name,
          originalFileMime: mime,
          originalFileDataUrl: dataUrl,
        });
      }

      const aiResult = await callGeminiIfConfigured({ text: extractedText, needs });
      const extraction =
        aiResult || extractStructuredQuoteFromText(extractedText, file.name, needs);

      const quote = buildDraftQuoteFromExtraction(extraction, {
        comparisonId,
        sourceType: "pdf",
        needs,
        rawText: extractedText,
        originalFileName: file.name,
        originalFileMime: mime,
        originalFileDataUrl: dataUrl,
        usedAi: Boolean(aiResult),
      });

      return NextResponse.json({
        success: true,
        usedAi: Boolean(aiResult),
        quote,
      });
    }

    // Image file (JPG, PNG, WEBP)
    const aiVisionResult = await callGeminiIfConfigured({
      imageBase64: buffer.toString("base64"),
      imageMime: mime,
      needs,
    });

    if (aiVisionResult) {
      const quote = buildDraftQuoteFromExtraction(aiVisionResult, {
        comparisonId,
        sourceType: "image",
        needs,
        originalFileName: file.name,
        originalFileMime: mime,
        originalFileDataUrl: dataUrl,
        usedAi: true,
      });
      return NextResponse.json({ success: true, usedAi: true, quote });
    }

    // No Vision LLM configured -> instruct client to run Tesseract OCR and post rawText back
    return NextResponse.json({
      success: true,
      needsClientOcr: true,
      sourceType: "image",
      fileName: file.name,
      originalFileMime: mime,
      originalFileDataUrl: dataUrl,
    });
  } catch (err: unknown) {
    console.error("Procurement analyze error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Teklif analiz edilirken hata oluştu.",
      },
      { status: 500 }
    );
  }
}

