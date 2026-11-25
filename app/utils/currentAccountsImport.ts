import * as XLSX from "xlsx";
import { parseExcelDate, parseTurkishAmount } from "./excel";
import { parseExternalPdfStatementText } from "./currentAccountsEngine";
import type {
  AccountTransactionType,
  CariCurrency,
  ContactType,
} from "../types/currentAccounts";

export interface ParsedCariContactRow {
  tempId: string;
  selected: boolean;
  code: string;
  name: string;
  contact_type: ContactType;
  tax_office: string;
  tax_number: string;
  authorized_person: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  address: string;
  currency: CariCurrency;
  payment_term_days: number;
  risk_limit: number;
  opening_debit: number;
  opening_credit: number;
}

export interface ParsedCariTransactionRow {
  tempId: string;
  selected: boolean;
  transaction_date: string; // YYYY-MM-DD
  due_date: string;
  document_no: string;
  transaction_type: AccountTransactionType;
  description: string;
  debit: number;
  credit: number;
  currency: CariCurrency;
}

function normKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

function toIsoDate(raw: unknown): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parsed = parseExcelDate(raw);
  const tr = parsed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
  const iso = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return new Date().toISOString().slice(0, 10);
}

function pickCol(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([k]) => normKey(k) === alias);
    if (found && String(found[1] ?? "").trim() !== "") return found[1];
  }
  for (const alias of aliases) {
    const found = entries.find(([k]) => normKey(k).includes(alias));
    if (found && String(found[1] ?? "").trim() !== "") return found[1];
  }
  return "";
}

function mapContactType(raw: string): ContactType {
  const n = normKey(raw);
  if (!n) return "customer";
  if (n.includes("herikisi") || (n.includes("musteri") && n.includes("tedarikci")) || n === "both") {
    return "both";
  }
  if (n.includes("tedarikci") || n.includes("satici") || n.includes("supplier")) return "supplier";
  if (n.includes("diger") || n.includes("other")) return "other";
  return "customer";
}

function mapCurrency(raw: string): CariCurrency {
  const u = String(raw || "").toUpperCase();
  if (u.includes("USD") || u.includes("$")) return "USD";
  if (u.includes("EUR") || u.includes("€")) return "EUR";
  return "TRY";
}

function mapTxType(raw: string, debit: number, credit: number): AccountTransactionType {
  const n = normKey(raw);
  if (n.includes("acilis") || n.includes("devir")) return "opening";
  if (n.includes("satis")) return "sales_invoice";
  if (n.includes("alis")) return "purchase_invoice";
  if (n.includes("tahsilat")) return "collection";
  if (n.includes("odeme")) return "payment";
  if (n.includes("iade")) return "return";
  if (n.includes("iskonto")) return "discount";
  if (n.includes("virman")) return "transfer";
  if (n.includes("mahsup")) return "offset";
  if (n.includes("borcdekont")) return "debit_note";
  if (n.includes("alacakdekont")) return "credit_note";
  if (debit > 0 && credit === 0) return "sales_invoice";
  if (credit > 0 && debit === 0) return "collection";
  return "other";
}

export function parseCariContactsExcel(buffer: ArrayBuffer): ParsedCariContactRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  });

  const out: ParsedCariContactRow[] = [];
  rows.forEach((row, idx) => {
    const name = String(
      pickCol(row, [
        "firmaadi",
        "unvan",
        "cariadi",
        "musteriadi",
        "tedarikciadi",
        "isim",
        "ad",
        "name",
      ])
    ).trim();
    if (!name) return;

    const rawCode = String(
      pickCol(row, ["carikodu", "carikod", "kodu", "kod", "hesapkodu", "code"])
    ).trim();
    const code = rawCode || `CR-${String(idx + 1).padStart(4, "0")}`;

    const debitRaw = parseTurkishAmount(
      pickCol(row, ["borc", "borcbakiyesi", "toplamborc", "acilisborc", "debit"])
    );
    const creditRaw = parseTurkishAmount(
      pickCol(row, ["alacak", "alacakbakiyesi", "toplamalacak", "acilisalacak", "credit"])
    );
    const balRaw = parseTurkishAmount(
      pickCol(row, ["bakiye", "guncelbakiye", "acilisbakiyesi", "balance"])
    );
    const dirRaw = normKey(String(pickCol(row, ["yon", "borcalacak", "durum", "ba"])));

    let opening_debit = Math.max(0, debitRaw);
    let opening_credit = Math.max(0, creditRaw);
    if (opening_debit === 0 && opening_credit === 0 && balRaw !== 0) {
      if (dirRaw === "a" || dirRaw.includes("alacak") || balRaw < 0) {
        opening_credit = Math.abs(balRaw);
      } else {
        opening_debit = Math.abs(balRaw);
      }
    }

    out.push({
      tempId: `imp-c-${idx}-${Date.now()}`,
      selected: true,
      code,
      name,
      contact_type: mapContactType(String(pickCol(row, ["carituru", "turu", "tur", "tip", "type"]))),
      tax_office: String(pickCol(row, ["vergidairesi", "vd", "taxoffice"])).trim(),
      tax_number: String(
        pickCol(row, ["vergino", "verginumarasi", "vkn", "tckn", "tckimlik", "taxnumber"])
      ).trim(),
      authorized_person: String(pickCol(row, ["yetkili", "yetkilikisi", "ilgilikisi"])).trim(),
      phone: String(pickCol(row, ["telefon", "tel", "gsm", "cep", "phone"])).trim(),
      email: String(pickCol(row, ["eposta", "mail", "email"])).trim(),
      city: String(pickCol(row, ["sehir", "il", "city"])).trim(),
      district: String(pickCol(row, ["ilce", "district"])).trim(),
      address: String(pickCol(row, ["adres", "acikadres", "address"])).trim(),
      currency: mapCurrency(String(pickCol(row, ["parabirimi", "doviz", "currency"]))),
      payment_term_days: Math.max(
        0,
        Math.round(parseTurkishAmount(pickCol(row, ["odemevadesi", "vade", "vadegun"])))
      ),
      risk_limit: Math.max(0, parseTurkishAmount(pickCol(row, ["risklimiti", "risk"]))),
      opening_debit,
      opening_credit,
    });
  });

  return out;
}

export function parseCariTransactionsExcel(buffer: ArrayBuffer): ParsedCariTransactionRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  });

  const out: ParsedCariTransactionRow[] = [];
  rows.forEach((row, idx) => {
    const rawDate = pickCol(row, ["islemtarihi", "tarih", "belgetarihi", "date"]);
    const desc = String(
      pickCol(row, ["aciklama", "izahat", "detay", "description", "islem"])
    ).trim();
    const docNo = String(
      pickCol(row, ["belgeno", "faturano", "fisno", "evrakno", "documentno"])
    ).trim();
    const debit = Math.max(0, parseTurkishAmount(pickCol(row, ["borc", "borctutari", "debit"])));
    const credit = Math.max(
      0,
      parseTurkishAmount(pickCol(row, ["alacak", "alacaktutari", "credit"]))
    );
    const tutar = parseTurkishAmount(pickCol(row, ["tutar", "miktar", "amount"]));

    let finalDebit = debit;
    let finalCredit = credit;
    if (finalDebit === 0 && finalCredit === 0 && tutar !== 0) {
      if (tutar > 0) finalDebit = tutar;
      else finalCredit = Math.abs(tutar);
    }

    if (!rawDate && !desc && finalDebit === 0 && finalCredit === 0) return;

    const rawDue = pickCol(row, ["vadetarihi", "vade", "duedate"]);
    const rawType = String(pickCol(row, ["islemturu", "tur", "tip", "type"]));

    out.push({
      tempId: `imp-tx-${idx}-${Date.now()}`,
      selected: true,
      transaction_date: toIsoDate(rawDate),
      due_date: rawDue ? toIsoDate(rawDue) : "",
      document_no: docNo,
      transaction_type: mapTxType(rawType, finalDebit, finalCredit),
      description: desc || docNo || "Excel Aktarımı",
      debit: finalDebit,
      credit: finalCredit,
      currency: mapCurrency(String(pickCol(row, ["parabirimi", "doviz", "currency"]))),
    });
  });

  return out;
}

export function parseCariTransactionsPdfText(rawText: string): ParsedCariTransactionRow[] {
  const lines = parseExternalPdfStatementText(rawText);
  return lines.map((l, idx) => ({
    tempId: `pdf-tx-${idx}-${Date.now()}`,
    selected: true,
    transaction_date: l.date || new Date().toISOString().slice(0, 10),
    due_date: "",
    document_no: l.documentNo || "",
    transaction_type: l.debit > 0 ? "sales_invoice" : l.credit > 0 ? "collection" : "other",
    description: l.description || "PDF Ekstre Satırı",
    debit: l.debit || 0,
    credit: l.credit || 0,
    currency: "TRY",
  }));
}

export function parseCariContactsPdfText(rawText: string): ParsedCariContactRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedCariContactRow[] = [];
  // 1. Try extracting tabular lines containing VKN/TCKN (10-11 digits) or code + company name
  lines.forEach((line, idx) => {
    const vknMatch = line.match(/\b(\d{10,11})\b/);
    const phoneMatch = line.match(/(\+?90\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|05\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/);
    if (vknMatch) {
      const cleaned = line
        .replace(vknMatch[0], " ")
        .replace(phoneMatch ? phoneMatch[0] : "", " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length >= 3) {
        out.push({
          tempId: `pdf-c-${idx}-${Date.now()}`,
          selected: true,
          code: `CR-PDF-${String(out.length + 1).padStart(3, "0")}`,
          name: cleaned.slice(0, 120),
          contact_type: "customer",
          tax_office: "",
          tax_number: vknMatch[1],
          authorized_person: "",
          phone: phoneMatch ? phoneMatch[1] : "",
          email: "",
          city: "",
          district: "",
          address: "",
          currency: "TRY",
          payment_term_days: 0,
          risk_limit: 0,
          opening_debit: 0,
          opening_credit: 0,
        });
      }
    }
  });

  // 2. Fallback: extract single company card from header if no VKN rows matched
  if (out.length === 0 && lines.length > 0) {
    const companyLine =
      lines.find((l) => /(A\.Ş\.|LTD\.|ŞTİ\.|TİC\.|SAN\.|İNŞ\.|YAPI)/i.test(l)) || lines[0];
    const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = rawText.match(/(\+?90\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|0\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/);
    if (companyLine && companyLine.length >= 3) {
      out.push({
        tempId: `pdf-c-single-${Date.now()}`,
        selected: true,
        code: `CR-PDF-001`,
        name: companyLine.slice(0, 120),
        contact_type: "customer",
        tax_office: "",
        tax_number: "",
        authorized_person: "",
        phone: phoneMatch ? phoneMatch[1] : "",
        email: emailMatch ? emailMatch[0] : "",
        city: "",
        district: "",
        address: "",
        currency: "TRY",
        payment_term_days: 0,
        risk_limit: 0,
        opening_debit: 0,
        opening_credit: 0,
      });
    }
  }

  return out;
}

