import { QurbanRecord, QurbanShareholder, QurbanMedia } from "../types/kurban";
import * as XLSX from "xlsx";

const STORAGE_KEY = "easy_accounting_kurban_records_v1";

// Demo Image Placeholders (Base64 SVG for maximum crispness & zero broken links)
export const DEMO_MEDIA = {
  truck: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260' fill='none'><rect width='400' height='260' rx='16' fill='%231e293b'/><path d='M60 170h280M90 170a20 20 0 1 0 40 0a20 20 0 1 0-40 0zm180 0a20 20 0 1 0 40 0a20 20 0 1 0-40 0z' stroke='%2338bdf8' stroke-width='6'/><rect x='60' y='70' width='180' height='75' rx='8' fill='%230f172a' stroke='%230284c7' stroke-width='4'/><path d='M240 90h45l25 25v30h-70V90z' fill='%230284c7'/><circle cx='80' cy='105' r='6' fill='%2338bdf8'/><text x='150' y='115' fill='%2338bdf8' font-family='sans-serif' font-weight='bold' font-size='14' text-anchor='middle'>36 KBR 124 SEVK TIRI</text><text x='200' y='225' fill='%2394a3b8' font-family='sans-serif' font-size='12' text-anchor='middle'>Kars Merkeze Bağlı Besi Sevkiyatı (42 Kurbanlık)</text></svg>",
  animal: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260' fill='none'><rect width='400' height='260' rx='16' fill='%2314532d'/><circle cx='200' cy='120' r='60' fill='%23166534' stroke='%234ade80' stroke-width='4'/><path d='M160 90c-15-20-40-20-45 5 15 5 35 5 45-5zm80 0c15-20 40-20 45 5-15 5-35 5-45-5z' fill='%23fef08a'/><circle cx='180' cy='115' r='6' fill='%23052e16'/><circle cx='220' cy='115' r='6' fill='%23052e16'/><ellipse cx='200' cy='140' rx='25' ry='16' fill='%2386efac'/><text x='200' y='215' fill='%23bbf7d0' font-family='sans-serif' font-weight='bold' font-size='14' text-anchor='middle'>KÜPE NO: TR-36-89421 (SİMENTAL)</text><text x='200' y='238' fill='%2386efac' font-family='sans-serif' font-size='11' text-anchor='middle'>Canlı: 685 Kg • 1. Sınıf Besi Tosunu</text></svg>",
  invoice: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260' fill='none'><rect width='400' height='260' rx='16' fill='%231e1b4b'/><rect x='80' y='40' width='240' height='180' rx='8' fill='%23ffffff'/><rect x='100' y='60' width='120' height='12' rx='3' fill='%234338ca'/><rect x='100' y='80' width='80' height='8' rx='2' fill='%23cbd5e1'/><line x1='100' y1='105' x2='300' y2='105' stroke='%23e2e8f0' stroke-width='2'/><rect x='100' y='120' width='140' height='8' rx='2' fill='%2364748b'/><rect x='100' y='140' width='110' height='8' rx='2' fill='%2364748b'/><rect x='100' y='160' width='90' height='8' rx='2' fill='%2364748b'/><rect x='220' y='180' width='80' height='16' rx='4' fill='%2310b981'/><text x='260' y='192' fill='%23ffffff' font-family='sans-serif' font-weight='bold' font-size='10' text-anchor='middle'>ONAYLI FATURA</text><text x='200' y='240' fill='%23a5b4fc' font-family='sans-serif' font-size='11' text-anchor='middle'>E-Müstahsil / Fatura No: FTR2026-004812</text></svg>",
  weighing: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260' fill='none'><rect width='400' height='260' rx='16' fill='%23701a75'/><rect x='70' y='50' width='260' height='160' rx='10' fill='%2318181b' stroke='%23d946ef' stroke-width='3'/><text x='200' y='105' fill='%23a1a1aa' font-family='sans-serif' font-size='13' text-anchor='middle'>KANTAR NET KARKAS TARTIMI</text><text x='200' y='155' fill='%23f0abfc' font-family='monospace' font-weight='bold' font-size='38' text-anchor='middle'>374.50 KG</text><text x='200' y='185' fill='%23e879f9' font-family='sans-serif' font-size='12' text-anchor='middle'>Hisse Başı (7 Pay): ~53.50 Kg Net Et</text></svg>",
};

export const SAMPLE_QURBAN_RECORDS: QurbanRecord[] = [

];

/**
 * Read stored Qurban records from localStorage with sample fallbacks
 */
export function getStoredQurbanRecords(): QurbanRecord[] {
  if (typeof window === "undefined") return SAMPLE_QURBAN_RECORDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Could not read qurban records from localStorage:", err);
  }
  return SAMPLE_QURBAN_RECORDS;
}

/**
 * Save Qurban records to localStorage
 */
export function saveStoredQurbanRecords(records: QurbanRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn("Could not save qurban records to localStorage:", err);
  }
}

/**
 * Generates formatted WhatsApp text for notifying a shareholder
 */
export function generateShareholderWhatsAppText(
  qurban: QurbanRecord,
  shareholder: QurbanShareholder
): string {
  const statusTr =
    qurban.status === "completed"
      ? "Kesildi & Pay Edildi (Teslim Alındı)"
      : qurban.status === "portioned"
        ? "Kesildi & Pay Edildi (Teslimata Hazır)"
        : qurban.status === "slaughtered"
          ? "Kurban Kesildi (Parçalanıyor)"
          : qurban.status === "at_slaughterhouse"
            ? "Kesimhanede Sıra Bekliyor"
            : "Sevkiyat Aşamasında";

  const actualWeight = shareholder.actualWeightKg
    ? `${shareholder.actualWeightKg} Kg`
    : shareholder.targetWeightKg
      ? `~${shareholder.targetWeightKg} Kg (Tahmini)`
      : "Tartım Yapılıyor";

  return `*KURBAN TAKİP & DİJİTAL RAPOR BİLGİLENDİRMESİ* 🐑🐂
----------------------------------
*Sayın:* ${shareholder.fullName}
*Kurban No:* ${qurban.qurbanNo}
*Küpe No:* ${qurban.earTagNo}
*Cinsi:* ${qurban.animalTypeLabel || "Büyükbaş"}
*Durum:* ${statusTr}
----------------------------------
📍 *Menşei / Çiftlik:* ${qurban.originCity} / ${qurban.originFarm}
🚛 *Sevk Tırı Plakası:* ${qurban.truckPlate}
🏢 *Kesimhane / Mezbaha:* ${qurban.slaughterhouseName}
🔪 *Kesim Tarihi & Sıra:* ${qurban.slaughterDate} ${qurban.slaughterTime ? `(${qurban.slaughterTime})` : ""} - Sıra: #${qurban.slaughterOrderNo || 1}
⚖️ *Kurban Toplam Karkas:* ${qurban.carcassWeightKg || "-"} Kg
🥩 *Hissenize Düşen Net Et:* *${actualWeight}*
💰 *Hisse Bedeli:* ₺${shareholder.sharePrice.toLocaleString("tr-TR")} (${shareholder.isPaid ? "ÖDENDİ ✅" : "ÖDEME BEKLİYOR ⚠️"})
📦 *Teslimat Durumu:* ${shareholder.isDelivered ? `Teslim Edildi (${shareholder.deliveryDate || ""})` : "Teslim Edilecek"}
----------------------------------
Kurbanınız İslami usullere uygun olarak, vekaletiniz doğrultusunda kesilmiştir. Allah kabul eylesin! 🤲`;
}

/**
 * Export 400-500 Qurban records to Excel sheet
 */
export function exportQurbanRecordsToExcel(records: QurbanRecord[]): void {
  const rows: any[] = [];

  records.forEach((q) => {
    // If has shareholders, write one row per shareholder
    if (q.shareholders && q.shareholders.length > 0) {
      q.shareholders.forEach((sh) => {
        rows.push({
          "Kurban No": q.qurbanNo,
          "Küpe No": q.earTagNo,
          "Hayvan Türü": q.animalTypeLabel || q.animalType,
          "Durum": q.status,
          "Geldiği İl": q.originCity,
          "Çiftlik/Besi": q.originFarm,
          "Tır Plakası": q.truckPlate,
          "Sevk İrsaliye No": q.dispatchNoteNo || "",
          "Geliş Tarihi": q.arrivalDate,
          "Alış Fatura No": q.invoiceNo,
          "Tedarikçi/Satıcı": q.supplierName,
          "Alış Fiyatı (₺)": q.purchasePrice,
          "Kesimhane": q.slaughterhouseName,
          "Kesim Tarihi": q.slaughterDate,
          "Kesim Saati": q.slaughterTime || "",
          "Kesim Sıra No": q.slaughterOrderNo || "",
          "Kasap Ekibi": q.butcherTeam || "",
          "Canlı Kilo (Kg)": q.liveWeightKg || "",
          "Karkas Kilo (Kg)": q.carcassWeightKg || "",
          "Toplam Hisse": q.totalShares,
          "Hissedar Sıra": sh.shareIndex,
          "Hissedar Adı Soyadı": sh.fullName,
          "Hissedar Telefon": sh.phone,
          "Hisse Oranı": sh.shareRate,
          "Hisse Bedeli (₺)": sh.sharePrice,
          "Düşen Et (Kg)": sh.actualWeightKg || sh.targetWeightKg || "",
          "Ödeme Durumu": sh.isPaid ? "Ödendi" : "Bekliyor",
          "Ödeme Türü": sh.paymentMethod || "",
          "Teslim Edildi mi": sh.isDelivered ? "Evet" : "Hayır",
          "Teslim Tarihi": sh.deliveryDate || "",
          "Teslim Alan": sh.deliveredTo || "",
          "Özel Notlar": q.notes || "",
        });
      });
    } else {
      // Just the kurban row
      rows.push({
        "Kurban No": q.qurbanNo,
        "Küpe No": q.earTagNo,
        "Hayvan Türü": q.animalTypeLabel || q.animalType,
        "Durum": q.status,
        "Geldiği İl": q.originCity,
        "Çiftlik/Besi": q.originFarm,
        "Tır Plakası": q.truckPlate,
        "Geliş Tarihi": q.arrivalDate,
        "Alış Fatura No": q.invoiceNo,
        "Alış Fiyatı (₺)": q.purchasePrice,
        "Kesimhane": q.slaughterhouseName,
        "Kesim Tarihi": q.slaughterDate,
        "Canlı Kilo (Kg)": q.liveWeightKg || "",
        "Karkas Kilo (Kg)": q.carcassWeightKg || "",
        "Toplam Hisse": q.totalShares,
        "Hissedarlar": "-",
      });
    }
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Kurban_Listesi");
  XLSX.writeFile(
    workbook,
    `Kurban_Takip_Raporu_${new Date().toISOString().split("T")[0]}.xlsx`
  );
}

/**
 * Generate Blank Excel Template for bulk importing 400-500 kurbans
 */
export function downloadQurbanImportTemplate(): void {
  const templateRows = [
    {
      "Kurban No": "KRB-001",
      "Küpe No": "TR34-12345",
      "Hayvan Türü": "Büyükbaş Tosun",
      "Geldiği İl": "Kars",
      "Çiftlik": "Yıldız Besi",
      "Tır Plakası": "36 KBR 10",
      "Geliş Tarihi": "2026-06-12",
      "Alış Fatura No": "FTR-401",
      "Alış Fiyatı": 150000,
      "Kesim Yeri": "Tuzla Mezbaha",
      "Kesim Tarihi": "2026-06-16",
      "Canlı Kilo": 680,
      "Karkas Kilo": 370,
      "Hisse Sayısı": 7,
      "Hissedar Adı": "Ahmet Yılmaz",
      "Hissedar Tel": "0532 111 22 33",
      "Hisse Bedeli": 23000,
      "Hisse Düşen Kilo": 53,
      "Ödeme Durumu": "Ödendi",
      "Teslim Durumu": "Evet",
    },
    {
      "Kurban No": "KRB-001",
      "Küpe No": "TR34-12345",
      "Hayvan Türü": "Büyükbaş Tosun",
      "Geldiği İl": "Kars",
      "Çiftlik": "Yıldız Besi",
      "Tır Plakası": "36 KBR 10",
      "Geliş Tarihi": "2026-06-12",
      "Alış Fatura No": "FTR-401",
      "Alış Fiyatı": 150000,
      "Kesim Yeri": "Tuzla Mezbaha",
      "Kesim Tarihi": "2026-06-16",
      "Canlı Kilo": 680,
      "Karkas Kilo": 370,
      "Hisse Sayısı": 7,
      "Hissedar Adı": "Mehmet Demir",
      "Hissedar Tel": "0533 222 33 44",
      "Hisse Bedeli": 23000,
      "Hisse Düşen Kilo": 53,
      "Ödeme Durumu": "Ödendi",
      "Teslim Durumu": "Evet",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sablon");
  XLSX.writeFile(wb, "Kurban_Toplu_Yukleme_Sablonu.xlsx");
}
