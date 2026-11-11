/// <reference lib="webworker" />

import {
  CentralProductCard,
  ComparisonReportPayload,
  InvoiceDirection,
  LearnedMappingRule,
  StandardInvoiceDocument,
} from "../types/invoiceComparison";
import {
  detectFileFormat,
  MAX_INVOICE_FILE_BYTES,
  parseInvoiceJsonSecure,
  parseInvoiceXmlSecure,
} from "../utils/invoiceFileParser";
import {
  ManualOverrideMap,
  runInvoiceProductComparison,
} from "../utils/productMatchingEngine";

export type WorkerRequestMessage =
  | {
      type: "parse_files";
      requestId: number;
      files: File[];
      direction: InvoiceDirection;
    }
  | {
      type: "compare";
      requestId: number;
      incomingInvoices: StandardInvoiceDocument[];
      outgoingInvoices: StandardInvoiceDocument[];
      learnedRules: LearnedMappingRule[];
      manualOverrides: ManualOverrideMap;
      userCreatedCards: CentralProductCard[];
    };

export type WorkerResponseMessage =
  | {
      type: "parse_progress";
      requestId: number;
      done: number;
      total: number;
    }
  | {
      type: "parse_done";
      requestId: number;
      documents: StandardInvoiceDocument[];
      errors: Array<{ fileName: string; message: string }>;
    }
  | {
      type: "compare_progress";
      requestId: number;
      processed: number;
      total: number;
    }
  | {
      type: "compare_done";
      requestId: number;
      report: ComparisonReportPayload;
    }
  | {
      type: "error";
      requestId: number;
      message: string;
    };

const CONCURRENT_READS = 32;

async function handleParseFiles(
  requestId: number,
  files: File[],
  direction: InvoiceDirection
) {
  const total = files.length;
  const documents: StandardInvoiceDocument[] = [];
  const errors: Array<{ fileName: string; message: string }> = [];
  let done = 0;

  for (let i = 0; i < total; i += CONCURRENT_READS) {
    const chunk = files.slice(i, i + CONCURRENT_READS);
    await Promise.all(
      chunk.map(async (file) => {
        const format = detectFileFormat(file.name, file.type);
        if (!format || format === "pdf") {
          errors.push({
            fileName: file.name,
            message: "Bu worker yalnızca XML ve JSON dosyalarını ayrıştırır.",
          });
          return;
        }
        if (file.size > MAX_INVOICE_FILE_BYTES) {
          errors.push({
            fileName: file.name,
            message: "Dosya boyutu 4 MB sınırını aşıyor.",
          });
          return;
        }
        try {
          const text = await file.text();
          if (format === "xml") {
            documents.push(
              parseInvoiceXmlSecure(text, file.name, direction, file.size)
            );
          } else {
            const docs = parseInvoiceJsonSecure(
              text,
              file.name,
              direction,
              file.size
            );
            for (const d of docs) documents.push(d);
          }
        } catch (err: unknown) {
          errors.push({
            fileName: file.name,
            message:
              err instanceof Error
                ? err.message
                : "Dosya ayrıştırılırken hata oluştu.",
          });
        }
      })
    );

    done = Math.min(total, i + chunk.length);
    self.postMessage({
      type: "parse_progress",
      requestId,
      done,
      total,
    } satisfies WorkerResponseMessage);
  }

  self.postMessage({
    type: "parse_done",
    requestId,
    documents,
    errors,
  } satisfies WorkerResponseMessage);
}

self.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;
  try {
    if (msg.type === "parse_files") {
      await handleParseFiles(msg.requestId, msg.files, msg.direction);
    } else if (msg.type === "compare") {
      const report = runInvoiceProductComparison({
        incomingInvoices: msg.incomingInvoices,
        outgoingInvoices: msg.outgoingInvoices,
        learnedRules: msg.learnedRules,
        manualOverrides: msg.manualOverrides,
        userCreatedCards: msg.userCreatedCards,
        onProgress: (processed, total) => {
          self.postMessage({
            type: "compare_progress",
            requestId: msg.requestId,
            processed,
            total,
          } satisfies WorkerResponseMessage);
        },
      });
      self.postMessage({
        type: "compare_done",
        requestId: msg.requestId,
        report,
      } satisfies WorkerResponseMessage);
    }
  } catch (err: unknown) {
    self.postMessage({
      type: "error",
      requestId: msg.requestId,
      message:
        err instanceof Error
          ? err.message
          : "Arka plan işleminde beklenmeyen hata oluştu.",
    } satisfies WorkerResponseMessage);
  }
};

