import * as XLSX from "xlsx";
import {
  AccountRecord,
  ColumnMapping,
  TransactionItem,
  CompanyDetail,
  DetailColumnMapping,
} from "../types/accounting";

export type {
  AccountRecord,
  ColumnMapping,
  TransactionItem,
  CompanyDetail,
  DetailColumnMapping,
};

// Convert various number strings (Turkish "1.250,50", "1500,00 TL", "(500,00)") to numeric float
export function parseTurkishAmount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  if (!str) return 0;

  // Parentheses indicate negative in accounting: (1.250,00)
  const isNegative = str.startsWith("(") && str.endsWith(")");
  if (isNegative) {
    str = str.slice(1, -1).trim();
  }

  // Remove currency signs, letters, and spaces
  str = str.replace(/[₺$€TLtlA-Za-z]/g, "").trim();

  // Determine separator
  if (str.includes(".") && str.includes(",")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      // Turkish format: 1.250,50 -> 1250.50
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,250.50 -> 1250.50
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Single comma e.g. 1250,50
    str = str.replace(",", ".");
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}

// Parse Excel dates safely to Turkish format "DD.MM.YYYY" or string
export function parseExcelDate(val: any): string {
  if (val === null || val === undefined || val === "") return "";

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    let d = val;
    // SheetJS LMT / Timezone offset drift fix:
    // When SheetJS converts an Excel date serial with cellDates: true, historical timezone differences
    // (e.g. Istanbul's 1899 LMT offset discrepancy of 56 seconds) shift 00:00:00 midnight backwards to 23:59:04 of the previous day.
    // Also in UTC vs local conversions, dates may land in 22:00-23:59.
    // Adding 15 minutes rolls 23:59:xx safely over to the intended day (00:xx:xx) without affecting daytime entries.
    if (d.getHours() === 23) {
      d = new Date(d.getTime() + 15 * 60 * 1000);
    }
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  if (typeof val === "number") {
    // If it's an Excel date serial (typical range for 1980 - 2060: ~29000 to ~60000)
    if (val > 25000 && val < 65000) {
      try {
        const dateObj = XLSX.SSF.parse_date_code(val);
        if (dateObj) {
          const d = String(dateObj.d).padStart(2, "0");
          const m = String(dateObj.m).padStart(2, "0");
          const y = dateObj.y;
          return `${d}.${m}.${y}`;
        }
      } catch {
        // fallback
      }
    }
    return String(val);
  }

  const str = String(val).trim();
  // Check ISO format YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${d}.${m}.${y}`;
  }

  // Check DD.MM.YYYY or DD/MM/YYYY
  const trMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (trMatch) {
    const d = trMatch[1].padStart(2, "0");
    const m = trMatch[2].padStart(2, "0");
    let y = trMatch[3];
    if (y.length === 2) y = "20" + y;
    return `${d}.${m}.${y}`;
  }

  return str;
}

// Currency formatter: 12.345,67 ₺
export function formatCurrency(amount: number): string {
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " ₺"
  );
}

// Turkish insensitive search normalization
export function normalizeForSearch(text: string): string {
  if (!text) return "";
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/i̇/g, "i")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

// Smart detection of column headers for Account Summary
export function detectColumns(headers: string[]): ColumnMapping {
  const norm = (h: string) => normalizeForSearch(h);

  let codeCol = "";
  let nameCol = "";
  let debitCol = "";
  let creditCol = "";
  let balanceCol = "__auto__";

  for (const h of headers) {
    const nh = norm(h);

    if (!nameCol) {
      if (
        nh.includes("hesap adi") ||
        nh.includes("hesap adı") ||
        nh.includes("unvan") ||
        nh.includes("ad soyad") ||
        nh === "ad" ||
        nh === "adi" ||
        nh === "isim" ||
        nh.includes("cari adi") ||
        nh.includes("musteri") ||
        nh.includes("aciklama") ||
        nh.includes("firma")
      ) {
        nameCol = h;
      }
    }

    if (!codeCol) {
      if (
        nh.includes("hesap kodu") ||
        nh.includes("cari kod") ||
        nh === "kod" ||
        nh === "kodu" ||
        nh.includes("hesap no") ||
        nh === "no"
      ) {
        codeCol = h;
      }
    }

    if (!debitCol) {
      if (nh.includes("borc") || nh.includes("borç") || nh.includes("debit")) {
        if (!nh.includes("bakiye")) {
          debitCol = h;
        }
      }
    }

    if (!creditCol) {
      if (nh.includes("alacak") || nh.includes("credit")) {
        if (!nh.includes("bakiye")) {
          creditCol = h;
        }
      }
    }

    if (balanceCol === "__auto__") {
      if (
        nh === "bakiye" ||
        nh.includes("net bakiye") ||
        nh.includes("kalan") ||
        nh.includes("balance") ||
        nh.includes("son bakiye")
      ) {
        balanceCol = h;
      }
    }
  }

  if (!nameCol && headers.length > 0) {
    const cand = headers.find((h) => {
      const nh = norm(h);
      return !nh.includes("kod") && !nh.includes("borc") && !nh.includes("alacak");
    });
    nameCol = cand || headers[0];
  }

  if (!debitCol && headers.length > 1) {
    const cand = headers.find((h) => norm(h).includes("borc"));
    if (cand) debitCol = cand;
  }

  if (!creditCol && headers.length > 1) {
    const cand = headers.find((h) => norm(h).includes("alacak"));
    if (cand) creditCol = cand;
  }

  return {
    codeCol,
    nameCol,
    debitCol,
    creditCol,
    balanceCol,
  };
}

// Smart detection of column headers for Detailed Company Ledger / Muavin
export function detectDetailColumns(headers: string[]): DetailColumnMapping {
  const norm = (h: string) => normalizeForSearch(h);

  let companyCol = "";
  let codeCol = "";
  let dateCol = "";
  let docNoCol = "";
  let typeCol = "";
  let descCol = "";
  let debitCol = "";
  let creditCol = "";
  let balanceCol = "__auto__";

  for (const h of headers) {
    const nh = norm(h);

    // 1. Company Name
    if (!companyCol) {
      if (
        nh.includes("firma") ||
        nh.includes("cari adi") ||
        nh.includes("cari adı") ||
        nh.includes("unvan") ||
        nh.includes("hesap adi") ||
        nh.includes("hesap adı") ||
        nh.includes("musteri") ||
        nh.includes("müşteri")
      ) {
        companyCol = h;
      }
    }

    // 2. Code
    if (!codeCol) {
      if (
        nh.includes("cari kod") ||
        nh.includes("hesap kod") ||
        nh === "kod" ||
        nh === "kodu"
      ) {
        codeCol = h;
      }
    }

    // 3. Date
    if (!dateCol) {
      if (
        nh.includes("tarih") ||
        nh.includes("date") ||
        nh.includes("islem tarihi") ||
        nh.includes("vade")
      ) {
        dateCol = h;
      }
    }

    // 4. Doc / Voucher No
    if (!docNoCol) {
      if (
        nh.includes("evrak") ||
        nh.includes("fis no") ||
        nh.includes("fiş no") ||
        nh.includes("belge no") ||
        nh.includes("fatura no") ||
        nh.includes("dekont no") ||
        nh.includes("makbuz") ||
        nh.includes("fis") ||
        nh.includes("fiş") ||
        nh === "no"
      ) {
        docNoCol = h;
      }
    }

    // 5. Type (İşlem Türü)
    if (!typeCol) {
      if (
        nh.includes("islem tur") ||
        nh.includes("işlem tür") ||
        nh.includes("hareket tur") ||
        nh.includes("hareket tür") ||
        nh.includes("belge tur") ||
        nh.includes("belge tür") ||
        nh === "tur" ||
        nh === "tür" ||
        nh === "tip"
      ) {
        typeCol = h;
      }
    }

    // 6. Description (Açıklama)
    if (!descCol) {
      if (
        nh.includes("aciklama") ||
        nh.includes("açıklama") ||
        nh.includes("izahat") ||
        nh.includes("detay") ||
        nh.includes("not")
      ) {
        descCol = h;
      }
    }

    // 7. Debit (Borç)
    if (!debitCol) {
      if (nh.includes("borc") || nh.includes("borç") || nh.includes("debit")) {
        if (!nh.includes("bakiye")) {
          debitCol = h;
        }
      }
    }

    // 8. Credit (Alacak)
    if (!creditCol) {
      if (nh.includes("alacak") || nh.includes("credit")) {
        if (!nh.includes("bakiye")) {
          creditCol = h;
        }
      }
    }

    // 9. Balance (Bakiye)
    if (balanceCol === "__auto__") {
      if (
        nh === "bakiye" ||
        nh.includes("yuruyen") ||
        nh.includes("yürüyen") ||
        nh.includes("kalan") ||
        nh.includes("balance")
      ) {
        balanceCol = h;
      }
    }
  }

  // Fallback defaults
  if (!descCol && headers.length > 0) {
    const cand = headers.find(
      (h) =>
        h !== dateCol &&
        h !== docNoCol &&
        h !== companyCol &&
        h !== debitCol &&
        h !== creditCol
    );
    if (cand) descCol = cand;
  }

  return {
    companyCol,
    codeCol,
    dateCol,
    docNoCol,
    typeCol,
    descCol,
    debitCol,
    creditCol,
    balanceCol,
  };
}

// Realistic sample Turkish accounting data for instant testing
export const SAMPLE_DATA: AccountRecord[] = [
  {
    id: "sample-1",
    code: "120.01.001",
    name: "Anadolu Dağıtım ve Pazarlama Ltd. Şti.",
    debit: 68500.0,
    credit: 25000.0,
    balance: 43500.0,
  },
  {
    id: "sample-2",
    code: "120.01.002",
    name: "Boğaziçi Yazılım ve Bilişim A.Ş.",
    debit: 112000.5,
    credit: 112000.5,
    balance: 0.0,
  },
  {
    id: "sample-3",
    code: "120.01.003",
    name: "Çınar İnşaat Taahhüt Sanayi Ticaret",
    debit: 185400.0,
    credit: 90000.0,
    balance: 95400.0,
  },
  {
    id: "sample-4",
    code: "320.01.001",
    name: "Demir Çelik Mamulleri İthalat İhracat A.Ş.",
    debit: 45000.0,
    credit: 128400.0,
    balance: -83400.0,
  },
  {
    id: "sample-5",
    code: "320.01.002",
    name: "Ege Lojistik ve Taşımacılık Ltd.",
    debit: 15200.0,
    credit: 42850.2,
    balance: -27650.2,
  },
  {
    id: "sample-6",
    code: "100.01.001",
    name: "Merkez TL Kasası",
    debit: 95000.0,
    credit: 41200.0,
    balance: 53800.0,
  },
  {
    id: "sample-7",
    code: "102.01.001",
    name: "Garanti Bankası Ticari TL Hesabı",
    debit: 345000.0,
    credit: 180000.0,
    balance: 165000.0,
  },
  {
    id: "sample-8",
    code: "320.02.005",
    name: "Gözde Ambalaj Sanayi Ltd. Şti.",
    debit: 0.0,
    credit: 18750.0,
    balance: -18750.0,
  },
  {
    id: "sample-9",
    code: "120.02.010",
    name: "Harun Kılıç (Şahıs Şirketi)",
    debit: 24600.0,
    credit: 24600.0,
    balance: 0.0,
  },
  {
    id: "sample-10",
    code: "120.03.014",
    name: "İpek Yolu Tekstil ve Konfeksiyon San.",
    debit: 74200.0,
    credit: 19000.0,
    balance: 55200.0,
  },
  {
    id: "sample-11",
    code: "320.03.002",
    name: "Kale Kilit & Güvenlik Sistemleri",
    debit: 21500.0,
    credit: 58900.0,
    balance: -37400.0,
  },
  {
    id: "sample-12",
    code: "120.04.008",
    name: "Marmara Gıda Toptan Tedarik A.Ş.",
    debit: 62900.0,
    credit: 31000.0,
    balance: 31900.0,
  },
  {
    id: "sample-13",
    code: "320.05.012",
    name: "Net Bilişim ve Sunucu Teknolojileri",
    debit: 8000.0,
    credit: 27500.0,
    balance: -19500.0,
  },
  {
    id: "sample-14",
    code: "120.05.021",
    name: "Öztürk Hırdavat ve Yapı Malzemeleri",
    debit: 84300.0,
    credit: 79000.0,
    balance: 5300.0,
  },
  {
    id: "sample-15",
    code: "320.06.015",
    name: "Şahinler Otomotiv Yedek Parça Ltd.",
    debit: 19000.0,
    credit: 54000.0,
    balance: -35000.0,
  },
  {
    id: "sample-16",
    code: "120.07.030",
    name: "Yıldız Elektrik Elektronik Sanayi",
    debit: 43500.0,
    credit: 43500.0,
    balance: 0.0,
  },
  {
    id: "sample-17",
    code: "320.08.004",
    name: "Zirve Matbaacılık ve Reklam",
    debit: 12000.0,
    credit: 29800.0,
    balance: -17800.0,
  },
];

// Rich, realistic sample company detailed transactions (Cari Hareketleri / Muavin)
export const SAMPLE_COMPANY_DETAILS: CompanyDetail[] = [
  {
    id: "det-1",
    code: "120.01.001",
    name: "Anadolu Dağıtım ve Pazarlama Ltd. Şti.",
    totalDebit: 68500.0,
    totalCredit: 25000.0,
    balance: 43500.0,
    lastDate: "05.02.2026",
    transactions: [
      {
        id: "tx-1-1",
        date: "02.01.2026",
        docNo: "DVR-001",
        type: "Devir Fişi",
        description: "2025 Yılından Devreden Bakiye",
        debit: 15000.0,
        credit: 0.0,
        balance: 15000.0,
      },
      {
        id: "tx-1-2",
        date: "10.01.2026",
        docNo: "FTR-2026-00101",
        type: "Satış Faturası",
        description: "Toptan Gıda & Bakliyat Sevkiyat Bedeli",
        debit: 32500.0,
        credit: 0.0,
        balance: 47500.0,
      },
      {
        id: "tx-1-3",
        date: "18.01.2026",
        docNo: "BNK-00452",
        type: "Banka Havalesi",
        description: "Garanti Bankası Hesabımıza Gelen Havale",
        debit: 0.0,
        credit: 25000.0,
        balance: 22500.0,
      },
      {
        id: "tx-1-4",
        date: "05.02.2026",
        docNo: "FTR-2026-00189",
        type: "Satış Faturası",
        description: "Sözleşmeli 2. Parti Ürün Teslimatı Faturası",
        debit: 21000.0,
        credit: 0.0,
        balance: 43500.0,
      },
    ],
  },
  {
    id: "det-2",
    code: "120.01.002",
    name: "Boğaziçi Yazılım ve Bilişim A.Ş.",
    totalDebit: 112000.5,
    totalCredit: 112000.5,
    balance: 0.0,
    lastDate: "12.02.2026",
    transactions: [
      {
        id: "tx-2-1",
        date: "05.01.2026",
        docNo: "DVR-002",
        type: "Devir Fişi",
        description: "Önceki Dönem Devir Bakiyesi",
        debit: 40000.0,
        credit: 0.0,
        balance: 40000.0,
      },
      {
        id: "tx-2-2",
        date: "15.01.2026",
        docNo: "FTR-2026-00214",
        type: "Satış Faturası",
        description: "Yıllık ERP ve Bulut Sunucu Lisans Bedeli",
        debit: 72000.5,
        credit: 0.0,
        balance: 112000.5,
      },
      {
        id: "tx-2-3",
        date: "25.01.2026",
        docNo: "BNK-00891",
        type: "Banka Tahsilatı",
        description: "İş Bankası Üzerinden Gelen Ara Ödeme",
        debit: 0.0,
        credit: 62000.0,
        balance: 50000.5,
      },
      {
        id: "tx-2-4",
        date: "12.02.2026",
        docNo: "CEK-00122",
        type: "Çek Tahsilatı",
        description: "28.02.2026 Vadeli Müşteri Çeki Tahsilatı",
        debit: 0.0,
        credit: 50000.5,
        balance: 0.0,
      },
    ],
  },
  {
    id: "det-3",
    code: "120.01.003",
    name: "Çınar İnşaat Taahhüt Sanayi Ticaret",
    totalDebit: 185400.0,
    totalCredit: 90000.0,
    balance: 95400.0,
    lastDate: "15.02.2026",
    transactions: [
      {
        id: "tx-3-1",
        date: "08.01.2026",
        docNo: "DVR-003",
        type: "Devir Fişi",
        description: "Şantiye Malzeme Tedariği Devir Tutarı",
        debit: 65400.0,
        credit: 0.0,
        balance: 65400.0,
      },
      {
        id: "tx-3-2",
        date: "20.01.2026",
        docNo: "FTR-2026-00330",
        type: "Satış Faturası",
        description: "1. Etap Betonarme ve Altyapı Hakediş Faturası",
        debit: 120000.0,
        credit: 0.0,
        balance: 185400.0,
      },
      {
        id: "tx-3-3",
        date: "02.02.2026",
        docNo: "BNK-00912",
        type: "Banka Havalesi",
        description: "Hakediş Kısmi Avans Ödemesi",
        debit: 0.0,
        credit: 50000.0,
        balance: 135400.0,
      },
      {
        id: "tx-3-4",
        date: "15.02.2026",
        docNo: "MHS-00045",
        type: "Mahsup Fişi",
        description: "Karşılıklı Taşeron Hizmet Mahsubu",
        debit: 0.0,
        credit: 40000.0,
        balance: 95400.0,
      },
    ],
  },
  {
    id: "det-4",
    code: "320.01.001",
    name: "Demir Çelik Mamulleri İthalat İhracat A.Ş.",
    totalDebit: 45000.0,
    totalCredit: 128400.0,
    balance: -83400.0,
    lastDate: "10.02.2026",
    transactions: [
      {
        id: "tx-4-1",
        date: "03.01.2026",
        docNo: "DVR-004",
        type: "Devir Fişi",
        description: "Tedarikçi Devir Alacağı",
        debit: 0.0,
        credit: 48400.0,
        balance: -48400.0,
      },
      {
        id: "tx-4-2",
        date: "12.01.2026",
        docNo: "ALF-2026-00512",
        type: "Alış Faturası",
        description: "NPI & Profil Sac Malzeme Alımı Faturası",
        debit: 0.0,
        credit: 80000.0,
        balance: -128400.0,
      },
      {
        id: "tx-4-3",
        date: "22.01.2026",
        docNo: "BNK-01044",
        type: "Banka EFT",
        description: "Vakıfbank Ticari Hesaptan Tedarikçi Ödemesi",
        debit: 30000.0,
        credit: 0.0,
        balance: -98400.0,
      },
      {
        id: "tx-4-4",
        date: "10.02.2026",
        docNo: "KSA-00210",
        type: "Kasa Tediyesi",
        description: "Elden Kasa Nakit Avans Ödemesi",
        debit: 15000.0,
        credit: 0.0,
        balance: -83400.0,
      },
    ],
  },
  {
    id: "det-5",
    code: "320.01.002",
    name: "Ege Lojistik ve Taşımacılık Ltd.",
    totalDebit: 15200.0,
    totalCredit: 42850.2,
    balance: -27650.2,
    lastDate: "04.02.2026",
    transactions: [
      {
        id: "tx-5-1",
        date: "07.01.2026",
        docNo: "ALF-2026-00620",
        type: "Alış Faturası",
        description: "Liman Konteyner Taşıma ve Nakliye Bedeli",
        debit: 0.0,
        credit: 22850.2,
        balance: -22850.2,
      },
      {
        id: "tx-5-2",
        date: "19.01.2026",
        docNo: "ALF-2026-00714",
        type: "Alış Faturası",
        description: "Antrepo ve Gümrükleme Hizmet Faturası",
        debit: 0.0,
        credit: 20000.0,
        balance: -42850.2,
      },
      {
        id: "tx-5-3",
        date: "04.02.2026",
        docNo: "BNK-01188",
        type: "Banka EFT",
        description: "Akbank Aracılığıyla Lojistik Bedeli Ödemesi",
        debit: 15200.0,
        credit: 0.0,
        balance: -27650.2,
      },
    ],
  },
  {
    id: "det-6",
    code: "100.01.001",
    name: "Merkez TL Kasası",
    totalDebit: 95000.0,
    totalCredit: 41200.0,
    balance: 53800.0,
    lastDate: "01.02.2026",
    transactions: [
      {
        id: "tx-6-1",
        date: "01.01.2026",
        docNo: "DVR-005",
        type: "Devir Fişi",
        description: "Dönem Başı Nakit Kasa Mevcudu",
        debit: 40000.0,
        credit: 0.0,
        balance: 40000.0,
      },
      {
        id: "tx-6-2",
        date: "11.01.2026",
        docNo: "KSA-00101",
        type: "Kasa Tahsilat",
        description: "Mağaza Perakende Nakit Satış Tahsilatları",
        debit: 55000.0,
        credit: 0.0,
        balance: 95000.0,
      },
      {
        id: "tx-6-3",
        date: "18.01.2026",
        docNo: "KSA-00145",
        type: "Kasa Tediye",
        description: "Gözde Ambalaj Nakit Malzeme Ödemesi",
        debit: 0.0,
        credit: 25000.0,
        balance: 70000.0,
      },
      {
        id: "tx-6-4",
        date: "01.02.2026",
        docNo: "KSA-00190",
        type: "Kasa Tediye",
        description: "Personel Yol ve Mutfak Masraf Ödemeleri",
        debit: 0.0,
        credit: 16200.0,
        balance: 53800.0,
      },
    ],
  },
  {
    id: "det-7",
    code: "102.01.001",
    name: "Garanti Bankası Ticari TL Hesabı",
    totalDebit: 345000.0,
    totalCredit: 180000.0,
    balance: 165000.0,
    lastDate: "15.01.2026",
    transactions: [
      {
        id: "tx-7-1",
        date: "01.01.2026",
        docNo: "DVR-006",
        type: "Devir Fişi",
        description: "Banka Ticari Vadesiz Mevduat Devir Bakiyesi",
        debit: 100000.0,
        credit: 0.0,
        balance: 100000.0,
      },
      {
        id: "tx-7-2",
        date: "09.01.2026",
        docNo: "BNK-00210",
        type: "Banka Tahsilatı",
        description: "Müşteri EFT & Sanal POS Günlük Hakedişleri",
        debit: 245000.0,
        credit: 0.0,
        balance: 345000.0,
      },
      {
        id: "tx-7-3",
        date: "15.01.2026",
        docNo: "BNK-00340",
        type: "Banka Tediye",
        description: "Muhtasar & KDV Vergi Tahakkuku Ödemeleri",
        debit: 0.0,
        credit: 180000.0,
        balance: 165000.0,
      },
    ],
  },
  {
    id: "det-8",
    code: "120.02.010",
    name: "Harun Kılıç (Şahıs Şirketi)",
    totalDebit: 24600.0,
    totalCredit: 24600.0,
    balance: 0.0,
    lastDate: "28.01.2026",
    transactions: [
      {
        id: "tx-8-1",
        date: "04.01.2026",
        docNo: "FTR-2026-00045",
        type: "Satış Faturası",
        description: "Teknik Danışmanlık ve Raporlama Hizmeti",
        debit: 24600.0,
        credit: 0.0,
        balance: 24600.0,
      },
      {
        id: "tx-8-2",
        date: "28.01.2026",
        docNo: "BNK-00772",
        type: "Banka Havalesi",
        description: "Garanti Bankası Fatura Bedeli Havalesi",
        debit: 0.0,
        credit: 24600.0,
        balance: 0.0,
      },
    ],
  },
  {
    id: "det-9",
    code: "120.03.014",
    name: "İpek Yolu Tekstil ve Konfeksiyon San.",
    totalDebit: 74200.0,
    totalCredit: 19000.0,
    balance: 55200.0,
    lastDate: "18.02.2026",
    transactions: [
      {
        id: "tx-9-1",
        date: "10.01.2026",
        docNo: "FTR-2026-00120",
        type: "Satış Faturası",
        description: "Kumaş ve İplik İmalat Satış Bedeli",
        debit: 74200.0,
        credit: 0.0,
        balance: 74200.0,
      },
      {
        id: "tx-9-2",
        date: "18.02.2026",
        docNo: "BNK-01300",
        type: "Banka Tahsilatı",
        description: "Fatura Karşılığı 1. Taksit Havalesi",
        debit: 0.0,
        credit: 19000.0,
        balance: 55200.0,
      },
    ],
  },
  {
    id: "det-10",
    code: "320.03.002",
    name: "Kale Kilit & Güvenlik Sistemleri",
    totalDebit: 21500.0,
    totalCredit: 58900.0,
    balance: -37400.0,
    lastDate: "20.02.2026",
    transactions: [
      {
        id: "tx-10-1",
        date: "14.01.2026",
        docNo: "ALF-2026-00431",
        type: "Alış Faturası",
        description: "Güvenlik Donanımları & Kilit Tedarik Faturası",
        debit: 0.0,
        credit: 58900.0,
        balance: -58900.0,
      },
      {
        id: "tx-10-2",
        date: "20.02.2026",
        docNo: "BNK-01450",
        type: "Banka EFT",
        description: "Vakıfbank Malzeme Bedeli Kısmi Ödeme",
        debit: 21500.0,
        credit: 0.0,
        balance: -37400.0,
      },
    ],
  },
];

// Helper to export summary records to Excel file
export function exportToExcel(records: AccountRecord[], fileName = "Hesap_Listesi.xlsx") {
  const data = records.map((r, index) => ({
    "Sıra No": index + 1,
    ...(r.code ? { "Hesap Kodu": r.code } : {}),
    "Hesap / Cari Adı": r.name,
    "Borç Tutarı (TL)": r.debit,
    "Alacak Tutarı (TL)": r.credit,
    "Bakiye Tutarı (TL)": r.balance,
    "Bakiye Türü":
      r.balance > 0.001
        ? "Borç Bakiyesi"
        : r.balance < -0.001
        ? "Alacak Bakiyesi"
        : "Sıfır (Dengede)",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 15 },
    { wch: 38 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hesap Listesi");
  XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

// Helper to export a single company's detailed statement (Cari Ekstre / Muavin) to Excel
export function exportCompanyStatementToExcel(company: CompanyDetail, fileName?: string) {
  const data = company.transactions.map((t, idx) => ({
    "Sıra No": idx + 1,
    "Tarih": t.date || "-",
    "Fatura No": t.invoiceNo || t.docNo || "-",
    "İşlem Türü": t.type || "-",
    "Açıklama": t.description,
    "Borç (TL)": t.debit,
    "Alacak (TL)": t.credit,
    "Yürüyen Bakiye (TL)": t.balance,
    "Bakiye Durumu":
      t.balance > 0.001
        ? "Borçlu"
        : t.balance < -0.001
        ? "Alacaklı"
        : "Dengede",
  }));

  // Append summary row
  data.push({
    "Sıra No": 0,
    "Tarih": "GENEL TOPLAM",
    "Fatura No": "",
    "İşlem Türü": "",
    "Açıklama": `${company.name} - ${company.transactions.length} İşlem Toplamı`,
    "Borç (TL)": company.totalDebit,
    "Alacak (TL)": company.totalCredit,
    "Yürüyen Bakiye (TL)": company.balance,
    "Bakiye Durumu":
      company.balance > 0.001
        ? "Net Borçlu"
        : company.balance < -0.001
        ? "Net Alacaklı"
        : "Dengede",
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 42 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  const safeSheetName = (company.name || "Cari Ekstre").slice(0, 31).replace(/[\\/?*[\]]/g, "_");
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  const cleanName = (company.name || "Firma").replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ_]/g, "_");
  const finalFileName = fileName || `${cleanName}_Cari_Ekstre.xlsx`;
  XLSX.writeFile(wb, finalFileName.endsWith(".xlsx") ? finalFileName : `${finalFileName}.xlsx`);
}

// Export all companies detailed list to a single comprehensive Excel file
export function exportAllDetailsToExcel(companies: CompanyDetail[], fileName = "Tum_Firmalar_Detay_Listesi.xlsx") {
  const allRows: any[] = [];

  companies.forEach((comp) => {
    comp.transactions.forEach((t, idx) => {
      allRows.push({
        ...(comp.code ? { "Cari / Hesap Kodu": comp.code } : {}),
        "Firma / Cari Adı": comp.name,
        "Sıra": idx + 1,
        "Tarih": t.date || "-",
        "Fatura No": t.invoiceNo || t.docNo || "-",
        "İşlem Türü": t.type || "-",
        "Açıklama": t.description,
        "Borç Tutarı (TL)": t.debit,
        "Alacak Tutarı (TL)": t.credit,
        "Yürüyen Bakiye (TL)": t.balance,
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(allRows);
  ws["!cols"] = [
    { wch: 15 },
    { wch: 35 },
    { wch: 6 },
    { wch: 13 },
    { wch: 16 },
    { wch: 16 },
    { wch: 40 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Firma Hareketleri");
  XLSX.writeFile(wb, fileName);
}

// Generate empty sample template file for Summary
export function downloadTemplate() {
  const templateData = [
    {
      "Hesap Kodu": "120.01.001",
      "Hesap Adı": "Örnek Müşteri Ltd. Şti.",
      "Borç": 15000.0,
      "Alacak": 5000.0,
      "Bakiye": 10000.0,
    },
    {
      "Hesap Kodu": "320.01.001",
      "Hesap Adı": "Örnek Tedarikçi A.Ş.",
      "Borç": 2000.0,
      "Alacak": 8000.0,
      "Bakiye": -6000.0,
    },
    {
      "Hesap Kodu": "100.01.001",
      "Hesap Adı": "Merkez Kasa",
      "Borç": 25000.0,
      "Alacak": 25000.0,
      "Bakiye": 0.0,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Şablon");
  XLSX.writeFile(wb, "Ornek_Hesap_Plani_Sablonu.xlsx");
}

// Generate empty sample template file for Detailed Transactions (Cari Hareketleri / Muavin)
export function downloadDetailTemplate() {
  const templateData = [
    {
      "Firma / Cari Adı": "Örnek Müşteri Ltd. Şti.",
      "Cari Kodu": "120.01.001",
      "Tarih": "15.01.2026",
      "Fiş / Belge No": "FTR-2026-0001",
      "İşlem Türü": "Satış Faturası",
      "Açıklama": "Ocak Ayı Malzeme Satışı",
      "Borç Tutarı": 25000.0,
      "Alacak Tutarı": 0.0,
      "Bakiye": 25000.0,
    },
    {
      "Firma / Cari Adı": "Örnek Müşteri Ltd. Şti.",
      "Cari Kodu": "120.01.001",
      "Tarih": "25.01.2026",
      "Fiş / Belge No": "BNK-00124",
      "İşlem Türü": "Banka Havalesi",
      "Açıklama": "Garanti Bankası Hesabımıza Gelen Havale",
      "Borç Tutarı": 0.0,
      "Alacak Tutarı": 15000.0,
      "Bakiye": 10000.0,
    },
    {
      "Firma / Cari Adı": "Örnek Tedarikçi A.Ş.",
      "Cari Kodu": "320.01.001",
      "Tarih": "10.01.2026",
      "Fiş / Belge No": "ALF-2026-051",
      "İşlem Türü": "Alış Faturası",
      "Açıklama": "Hammadde Alımı Faturası",
      "Borç Tutarı": 0.0,
      "Alacak Tutarı": 40000.0,
      "Bakiye": -40000.0,
    },
    {
      "Firma / Cari Adı": "Örnek Tedarikçi A.Ş.",
      "Cari Kodu": "320.01.001",
      "Tarih": "20.01.2026",
      "Fiş / Belge No": "BNK-00215",
      "İşlem Türü": "Banka EFT",
      "Açıklama": "Tedarikçi Fatura Ödemesi",
      "Borç Tutarı": 25000.0,
      "Alacak Tutarı": 0.0,
      "Bakiye": -15000.0,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);
  ws["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 38 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Detay Şablonu");
  XLSX.writeFile(wb, "Ornek_Cari_Detay_Hareketleri_Sablonu.xlsx");
}
