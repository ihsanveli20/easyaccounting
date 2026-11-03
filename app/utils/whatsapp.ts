import { formatCurrency } from "./excel";

export interface WhatsAppItem {
  materialName: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  total: number;
}

export interface WhatsAppProposalData {
  proposalNumber?: string;
  quoteDate?: string;
  customerName?: string;
  preparedBy?: string;
  companyName?: string;
  items: WhatsAppItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  notes?: string;
  format?: "detailed" | "summary";
}

/**
 * Format Turkish numbers into written Turkish words (e.g. 15450 -> "On Beş Bin Dört Yüz Elli Türk Lirası")
 */
export function numberToTurkishWords(amount: number): string {
  if (amount <= 0 || isNaN(amount)) return "Sıfır Türk Lirası";
  const birler = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
  const onlar = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"];
  const basamaklar = ["", "Bin", "Milyon", "Milyar", "Trilyon"];

  const tamKisim = Math.floor(Math.abs(amount));
  const kurusKisim = Math.round((Math.abs(amount) - tamKisim) * 100);

  function ucBasamak(n: number) {
    let res = "";
    const yuzler = Math.floor(n / 100);
    const onluk = Math.floor((n % 100) / 10);
    const birlik = n % 10;

    if (yuzler > 1) res += birler[yuzler] + " Yüz ";
    else if (yuzler === 1) res += "Yüz ";

    if (onluk > 0) res += onlar[onluk] + " ";
    if (birlik > 0) res += birler[birlik] + " ";
    return res.trim();
  }

  let strTam = "";
  let temp = tamKisim;
  let basamakIdx = 0;

  if (temp === 0) strTam = "Sıfır";
  while (temp > 0) {
    const uc = temp % 1000;
    if (uc > 0) {
      let ucStr = ucBasamak(uc);
      if (basamakIdx === 1 && uc === 1) {
        ucStr = ""; // "Bir Bin" yerine "Bin"
      }
      const basamakAdi = basamaklar[basamakIdx];
      strTam = `${ucStr} ${basamakAdi} ${strTam}`.trim();
    }
    temp = Math.floor(temp / 1000);
    basamakIdx++;
  }

  let sonuc = strTam.trim() + " Türk Lirası";
  if (kurusKisim > 0) {
    sonuc += " " + ucBasamak(kurusKisim) + " Kuruş";
  }
  return sonuc.replace(/\s+/g, " ");
}

/**
 * Clean and format phone number for WhatsApp international standard (e.g. 0532... -> 90532...)
 */
export function formatPhoneNumberForWhatsApp(phone: string): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // If starts with 00 (e.g. 0090...)
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Turkish 11-digit starting with 0: 0532 123 4567 -> 905321234567
  if (digits.length === 11 && digits.startsWith("0")) {
    return "90" + digits.slice(1);
  }

  // Turkish 10-digit without leading 0: 532 123 4567 -> 905321234567
  if (digits.length === 10 && digits.startsWith("5")) {
    return "90" + digits;
  }

  // Already with country code (90 532...)
  if (digits.length === 12 && digits.startsWith("905")) {
    return digits;
  }

  return digits;
}

/**
 * Generate full WhatsApp web / mobile send URL
 */
export function createWhatsAppShareUrl(phone: string, text: string): string {
  const cleanPhone = formatPhoneNumberForWhatsApp(phone);
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Format quantity in Turkish notation (e.g. 14000 -> 14.000)
 */
function formatQty(qty: number | string): string {
  if (qty === "" || qty === undefined || qty === null) return "1";
  const num = typeof qty === "number" ? qty : parseFloat(String(qty).replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return String(qty);
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(num);
}

/**
 * Generate clean, professional WhatsApp proposal message
 */
export function generateProposalWhatsAppText(data: WhatsAppProposalData): string {
  const isSummary = data.format === "summary";
  const lines: string[] = [];

  // Title & Header
  lines.push("📄 *FİYAT TEKLİFİ*");
  if (data.companyName && data.companyName.trim()) {
    lines.push(`🏢 *${data.companyName.trim()}*`);
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Key Details
  if (data.proposalNumber && data.proposalNumber.trim()) {
    lines.push(`🔢 *Teklif No:* ${data.proposalNumber.trim()}`);
  }
  if (data.quoteDate && data.quoteDate.trim()) {
    lines.push(`📅 *Tarih:* ${data.quoteDate.trim()}`);
  }
  if (data.customerName && data.customerName.trim()) {
    lines.push(`👤 *Sayın:* ${data.customerName.trim()}`);
  }
  if (data.preparedBy && data.preparedBy.trim()) {
    lines.push(`✍️ *Hazırlayan:* ${data.preparedBy.trim()}`);
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Items filtering
  const validItems = (data.items || []).filter(
    (it) => (it.materialName && it.materialName.trim() !== "") || (Number(it.total) > 0)
  );

  if (isSummary) {
    lines.push(`📦 *Toplam Kalem:* ${validItems.length} Kalem Ürün/Hizmet`);
  } else {
    lines.push("📦 *TEKLİF KALEMLERİ:*");
    lines.push("");
    validItems.forEach((it, idx) => {
      const q = formatQty(it.quantity);
      const u = it.unit || "Adet";
      const upNum = typeof it.unitPrice === "number" ? it.unitPrice : parseFloat(String(it.unitPrice)) || 0;
      const upStr = formatCurrency(upNum);
      const totStr = formatCurrency(it.total || 0);

      lines.push(`${idx + 1}️⃣ *${it.materialName.trim() || "Malzeme / Hizmet"}*`);
      lines.push(`   • ${q} ${u} × ${upStr} = *${totStr}*`);
    });
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Totals & VAT
  if (!isSummary && data.vatRate > 0) {
    lines.push(`💵 *Ara Toplam:* ${formatCurrency(data.subtotal)}`);
    lines.push(`📊 *KDV (%${data.vatRate}):* ${formatCurrency(data.vatAmount)}`);
  }
  lines.push(`💰 *GENEL TOPLAM:* *${formatCurrency(data.grandTotal)}*`);

  const words = numberToTurkishWords(data.grandTotal);
  if (words) {
    lines.push(`🗣️ *Yalnız:* _${words}_`);
  }

  // Notes
  if (data.notes && data.notes.trim()) {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("📝 *Notlar & Açıklamalar:*");
    lines.push(data.notes.trim());
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("_Detaylı bilgi ve teyit için bu mesaja dönüş yapabilirsiniz._");

  return lines.join("\n");
}

/**
 * Convert a SavedProposal from database into WhatsAppProposalData
 */
export function savedProposalToWhatsAppProposalData(
  prop: {
    proposal_number?: string;
    created_at?: string;
    total_amount?: number;
    customer?: { id: number; name: string } | null;
    items?: Array<{
      quantity: number;
      unit_price: number;
      total_price?: number;
      product?: { name?: string; unit_of_measure?: string } | null;
    }>;
    metadata?: {
      notes?: string;
      vatRate?: number;
      quoteDate?: string;
      customerName?: string;
      preparedBy?: string;
      customItems?: Array<{ materialName: string; unit: string }>;
    } | null;
  },
  companyName?: string
): WhatsAppProposalData {
  const vatRate = prop.metadata?.vatRate ?? 20;
  const items: WhatsAppItem[] = (prop.items || []).map((it, idx) => {
    const custom = prop.metadata?.customItems?.[idx];
    return {
      materialName: it.product?.name || custom?.materialName || `Ürün #${idx + 1}`,
      quantity: it.quantity,
      unit: it.product?.unit_of_measure || custom?.unit || "Adet",
      unitPrice: it.unit_price,
      total: it.total_price || it.quantity * it.unit_price,
    };
  });

  const subtotal = items.reduce((acc, it) => acc + (it.total || 0), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = prop.total_amount ?? subtotal + vatAmount;

  return {
    proposalNumber: prop.proposal_number,
    quoteDate:
      prop.metadata?.quoteDate ||
      (prop.created_at ? new Date(prop.created_at).toLocaleDateString("tr-TR") : ""),
    customerName: prop.customer?.name || prop.metadata?.customerName || "",
    preparedBy: prop.metadata?.preparedBy || "",
    companyName: companyName,
    items,
    subtotal,
    vatRate,
    vatAmount,
    grandTotal,
    notes: prop.metadata?.notes || "",
  };
}

/**
 * Share a PDF file via WhatsApp (using native Web Share API if supported, or download + open WhatsApp chat)
 */
export async function sharePdfViaWhatsApp(options: {
  pdfBlob: Blob;
  fileName: string;
  phoneNumber?: string;
  messageText?: string;
}): Promise<{ sharedViaNative: boolean; downloaded: boolean }> {
  const { pdfBlob, fileName, phoneNumber = "", messageText = "" } = options;

  let file: File | null = null;
  try {
    file = new File([pdfBlob], fileName, { type: "application/pdf" });
  } catch {
    file = null;
  }

  // 1. Try Web Share API with file (supported on mobile Safari / Chrome and Mac Safari)
  if (
    file &&
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: fileName.replace(/\.pdf$/i, ""),
        text: messageText,
      });
      return { sharedViaNative: true, downloaded: false };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { sharedViaNative: true, downloaded: false };
      }
      console.warn("navigator.share failed, using fallback:", err);
    }
  }

  // 2. Fallback: Download file locally and launch WhatsApp
  if (typeof window !== "undefined") {
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    const waUrl = createWhatsAppShareUrl(phoneNumber, messageText);
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  return { sharedViaNative: false, downloaded: true };
}
