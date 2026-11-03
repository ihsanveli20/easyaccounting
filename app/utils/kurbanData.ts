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
  {
    id: "krb-1",
    qurbanNo: "KRB-001",
    earTagNo: "TR36-89421",
    animalType: "buyukbas_tosun",
    animalTypeLabel: "Büyükbaş Tosun (Simental)",
    status: "completed",
    originCity: "Kars",
    originFarm: "Serhat Yayla Besi Çiftliği",
    truckPlate: "36 KBR 124",
    driverName: "Yılmaz Karadağ",
    driverPhone: "0532 555 36 01",
    dispatchNoteNo: "İRS-2026-0891",
    arrivalDate: "2026-06-12",
    invoiceNo: "FTR202600004812",
    invoiceDate: "2026-06-10",
    supplierName: "Kars Et ve Besi Ürünleri A.Ş.",
    purchasePrice: 154000,
    additionalCosts: 7000,
    slaughterhouseName: "Tuzla Büyükşehir Kesimhane & Entegre Tesisi",
    slaughterDate: "2026-06-16",
    slaughterTime: "08:15",
    slaughterOrderNo: 1,
    butcherTeam: "Usta Kasap Ekibi - Recep Usta",
    liveWeightKg: 685,
    carcassWeightKg: 378,
    boneWeightKg: 58,
    totalShares: 7,
    shareholders: [
      {
        id: "sh-1-1",
        shareIndex: 1,
        fullName: "Ahmet Yılmaz",
        phone: "0532 111 22 33",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "havale",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "11:30",
        deliveredTo: "Kendisi",
        specialRequests: "Gerdan ve kemikli et eşit pay istendi.",
      },
      {
        id: "sh-1-2",
        shareIndex: 2,
        fullName: "Mehmet Demir",
        phone: "0533 222 33 44",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "nakit",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "11:30",
        deliveredTo: "Oğlu Ali Demir",
      },
      {
        id: "sh-1-3",
        shareIndex: 3,
        fullName: "Fatma Kaya",
        phone: "0535 333 44 55",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "kredi_karti",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "11:45",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-1-4",
        shareIndex: 4,
        fullName: "Mustafa Çelik",
        phone: "0542 444 55 66",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "havale",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:00",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-1-5",
        shareIndex: 5,
        fullName: "Hüseyin Şahin",
        phone: "0530 555 66 77",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "havale",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:15",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-1-6",
        shareIndex: 6,
        fullName: "Ali Vural",
        phone: "0544 666 77 88",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "nakit",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:30",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-1-7",
        shareIndex: 7,
        fullName: "İbrahim Yıldız",
        phone: "0555 777 88 99",
        shareRate: "1/7",
        targetWeightKg: 54,
        actualWeightKg: 54,
        sharePrice: 23000,
        isPaid: true,
        paymentMethod: "havale",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:45",
        deliveredTo: "Kendisi",
      },
    ],
    media: [
      {
        id: "m-1-1",
        type: "truck",
        title: "Kars'tan Gelen Sevk Tırı (36 KBR 124)",
        url: DEMO_MEDIA.truck,
        uploadedAt: "2026-06-12",
      },
      {
        id: "m-1-2",
        type: "animal",
        title: "Kurbanlık Tosun (TR36-89421)",
        url: DEMO_MEDIA.animal,
        uploadedAt: "2026-06-12",
      },
      {
        id: "m-1-3",
        type: "invoice",
        title: "Alış Faturası & Sevk İrsaliyesi",
        url: DEMO_MEDIA.invoice,
        uploadedAt: "2026-06-13",
      },
      {
        id: "m-1-4",
        type: "weighing",
        title: "Kesimhane Karkas Tartım Fişi (378 Kg)",
        url: DEMO_MEDIA.weighing,
        uploadedAt: "2026-06-16",
      },
    ],
    notes: "Kurbanın tüm sağlık ve aşı raporları eksiksizdir. Hissedarlar kesim anını kameradan canlı izlemiştir.",
    createdAt: "2026-06-12",
    updatedAt: "2026-06-16",
  },
  {
    id: "krb-2",
    qurbanNo: "KRB-002",
    earTagNo: "TR25-63102",
    animalType: "buyukbas_dana",
    animalTypeLabel: "Büyükbaş Dana (Montofon)",
    status: "completed",
    originCity: "Erzurum",
    originFarm: "Palandöken Hayvancılık Besi Ltd.",
    truckPlate: "25 ERZ 90",
    driverName: "Kemal Dursun",
    driverPhone: "0533 444 25 10",
    dispatchNoteNo: "İRS-2026-0904",
    arrivalDate: "2026-06-13",
    invoiceNo: "FTR202600004835",
    invoiceDate: "2026-06-11",
    supplierName: "Doğu Anadolu Besiciler Kooperatifi",
    purchasePrice: 161000,
    additionalCosts: 7000,
    slaughterhouseName: "Tuzla Büyükşehir Kesimhane & Entegre Tesisi",
    slaughterDate: "2026-06-16",
    slaughterTime: "09:00",
    slaughterOrderNo: 2,
    butcherTeam: "Usta Kasap Ekibi - Recep Usta",
    liveWeightKg: 710,
    carcassWeightKg: 392,
    totalShares: 7,
    shareholders: [
      {
        id: "sh-2-1",
        shareIndex: 1,
        fullName: "Murat Güler",
        phone: "0532 999 11 22",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:30",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-2-2",
        shareIndex: 2,
        fullName: "Osman Koç",
        phone: "0533 888 22 33",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:30",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-2-3",
        shareIndex: 3,
        fullName: "Zeynep Arslan",
        phone: "0535 777 33 44",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:45",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-2-4",
        shareIndex: 4,
        fullName: "Süleyman Aydın",
        phone: "0542 666 44 55",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "13:00",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-2-5",
        shareIndex: 5,
        fullName: "Emine Polat",
        phone: "0530 555 55 66",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "13:00",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-2-6",
        shareIndex: 6,
        fullName: "Burak Korkmaz",
        phone: "0544 444 66 77",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "13:15",
        deliveredTo: "Kendisi",
      },
      {
        id: "sh-2-7",
        shareIndex: 7,
        fullName: "Deniz Kurt",
        phone: "0555 333 77 88",
        shareRate: "1/7",
        targetWeightKg: 56,
        actualWeightKg: 56,
        sharePrice: 24000,
        isPaid: true,
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "13:30",
        deliveredTo: "Kendisi",
      },
    ],
    media: [
      {
        id: "m-2-1",
        type: "truck",
        title: "Erzurum Sevk Tırı (25 ERZ 90)",
        url: DEMO_MEDIA.truck,
        uploadedAt: "2026-06-13",
      },
      {
        id: "m-2-2",
        type: "animal",
        title: "Kurbanlık Dana (TR25-63102)",
        url: DEMO_MEDIA.animal,
        uploadedAt: "2026-06-13",
      },
      {
        id: "m-2-3",
        type: "invoice",
        title: "Fatura Belgesi FTR202600004835",
        url: DEMO_MEDIA.invoice,
        uploadedAt: "2026-06-13",
      },
      {
        id: "m-2-4",
        type: "weighing",
        title: "Tartım Fişi: 392 Kg Net Karkas",
        url: DEMO_MEDIA.weighing,
        uploadedAt: "2026-06-16",
      },
    ],
    notes: "Etler 7 eşit parçaya ayrılmış ve vakumlu poşetlerde teslim edilmiştir.",
    createdAt: "2026-06-13",
    updatedAt: "2026-06-16",
  },
  {
    id: "krb-3",
    qurbanNo: "KRB-003",
    earTagNo: "TR03-44190",
    animalType: "buyukbas_duve",
    animalTypeLabel: "Büyükbaş Düve (Yerli Besi)",
    status: "portioned",
    originCity: "Afyon",
    originFarm: "Zafer Besi & Tarım İşletmesi",
    truckPlate: "03 AFY 312",
    driverName: "Halil İbrahim Er",
    driverPhone: "0535 222 03 40",
    dispatchNoteNo: "İRS-2026-0922",
    arrivalDate: "2026-06-14",
    invoiceNo: "FTR202600004860",
    invoiceDate: "2026-06-12",
    supplierName: "Afyon Et Entegre Pazarlama A.Ş.",
    purchasePrice: 147000,
    additionalCosts: 6500,
    slaughterhouseName: "Başakşehir Modern Kesimhane Tesisleri",
    slaughterDate: "2026-06-16",
    slaughterTime: "09:45",
    slaughterOrderNo: 3,
    butcherTeam: "Usta Kasap Ekibi - Şükrü Usta",
    liveWeightKg: 640,
    carcassWeightKg: 350,
    totalShares: 7,
    shareholders: [
      {
        id: "sh-3-1",
        shareIndex: 1,
        fullName: "Tarık Bilgin",
        phone: "0532 411 00 11",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: true,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
      {
        id: "sh-3-2",
        shareIndex: 2,
        fullName: "Kemal Başar",
        phone: "0533 522 00 22",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: true,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
      {
        id: "sh-3-3",
        shareIndex: 3,
        fullName: "Selin Öztürk",
        phone: "0535 633 00 33",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: true,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
      {
        id: "sh-3-4",
        shareIndex: 4,
        fullName: "Volkan Erdem",
        phone: "0542 744 00 44",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: false,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
      {
        id: "sh-3-5",
        shareIndex: 5,
        fullName: "Oğuzhan Tekin",
        phone: "0530 855 00 55",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: true,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
      {
        id: "sh-3-6",
        shareIndex: 6,
        fullName: "Berrin Koçak",
        phone: "0544 966 00 66",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: true,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
      {
        id: "sh-3-7",
        shareIndex: 7,
        fullName: "Fatih Avcı",
        phone: "0555 077 00 77",
        shareRate: "1/7",
        targetWeightKg: 50,
        actualWeightKg: 50,
        sharePrice: 22000,
        isPaid: true,
        isDelivered: false,
        deliveryDate: "2026-06-16",
        deliveryTime: "14:00",
      },
    ],
    media: [
      {
        id: "m-3-1",
        type: "truck",
        title: "Afyon Sevk Tırı (03 AFY 312)",
        url: DEMO_MEDIA.truck,
        uploadedAt: "2026-06-14",
      },
      {
        id: "m-3-2",
        type: "animal",
        title: "Kurbanlık Düve (TR03-44190)",
        url: DEMO_MEDIA.animal,
        uploadedAt: "2026-06-14",
      },
      {
        id: "m-3-3",
        type: "invoice",
        title: "Fatura Belgesi",
        url: DEMO_MEDIA.invoice,
        uploadedAt: "2026-06-14",
      },
    ],
    notes: "Kesim tamamlandı, parçalama ve hisse poşetleme yapılıyor. Dağıtım 14:00'te başlayacak.",
    createdAt: "2026-06-14",
    updatedAt: "2026-06-16",
  },
  {
    id: "krb-4",
    qurbanNo: "KRB-004",
    earTagNo: "TR58-11204",
    animalType: "buyukbas_tosun",
    animalTypeLabel: "Büyükbaş Tosun (Angus Melezi)",
    status: "slaughtered",
    originCity: "Sivas",
    originFarm: "Kangal Yaylası Doğal Hayvancılık",
    truckPlate: "58 SVS 410",
    driverName: "Cemal Kaya",
    arrivalDate: "2026-06-14",
    invoiceNo: "FTR202600004899",
    invoiceDate: "2026-06-13",
    supplierName: "Sivas Et ve Damızlık Birliği",
    purchasePrice: 158000,
    additionalCosts: 7000,
    slaughterhouseName: "Başakşehir Modern Kesimhane Tesisleri",
    slaughterDate: "2026-06-16",
    slaughterTime: "10:30",
    slaughterOrderNo: 4,
    butcherTeam: "Usta Kasap Ekibi - Şükrü Usta",
    liveWeightKg: 695,
    carcassWeightKg: 385,
    totalShares: 7,
    shareholders: [
      {
        id: "sh-4-1",
        shareIndex: 1,
        fullName: "Hasan Çetin",
        phone: "0532 100 11 22",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
      {
        id: "sh-4-2",
        shareIndex: 2,
        fullName: "Serkan Doğan",
        phone: "0533 200 22 33",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
      {
        id: "sh-4-3",
        shareIndex: 3,
        fullName: "Gökhan Bulut",
        phone: "0535 300 33 44",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
      {
        id: "sh-4-4",
        shareIndex: 4,
        fullName: "Turgut Yücel",
        phone: "0542 400 44 55",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
      {
        id: "sh-4-5",
        shareIndex: 5,
        fullName: "Mert Yalçın",
        phone: "0530 500 55 66",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
      {
        id: "sh-4-6",
        shareIndex: 6,
        fullName: "Yusuf Kara",
        phone: "0544 600 66 77",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
      {
        id: "sh-4-7",
        shareIndex: 7,
        fullName: "Ramazan Koçer",
        phone: "0555 700 77 88",
        shareRate: "1/7",
        targetWeightKg: 55,
        actualWeightKg: 55,
        sharePrice: 23500,
        isPaid: true,
        isDelivered: false,
      },
    ],
    media: [
      {
        id: "m-4-1",
        type: "truck",
        title: "Sivas Sevk Tırı (58 SVS 410)",
        url: DEMO_MEDIA.truck,
        uploadedAt: "2026-06-14",
      },
      {
        id: "m-4-2",
        type: "animal",
        title: "Kurbanlık (TR58-11204)",
        url: DEMO_MEDIA.animal,
        uploadedAt: "2026-06-14",
      },
    ],
    notes: "Kurban kesildi, tartım işlemi bitti, hisse payına geçiliyor.",
    createdAt: "2026-06-14",
    updatedAt: "2026-06-16",
  },
  {
    id: "krb-5",
    qurbanNo: "KRB-005",
    earTagNo: "TR16-90234",
    animalType: "kucukbas_koc",
    animalTypeLabel: "Küçükbaş Kıvırcık Koç",
    status: "completed",
    originCity: "Balıkesir",
    originFarm: "Manyas Kıvırcık Çiftliği",
    truckPlate: "10 BLK 88",
    driverName: "Nedim Uysal",
    arrivalDate: "2026-06-15",
    invoiceNo: "FTR202600004920",
    invoiceDate: "2026-06-14",
    supplierName: "Balıkesir Damızlık Koyun Koop.",
    purchasePrice: 18500,
    additionalCosts: 1500,
    slaughterhouseName: "Tuzla Büyükşehir Kesimhane & Entegre Tesisi",
    slaughterDate: "2026-06-16",
    slaughterTime: "11:15",
    slaughterOrderNo: 15,
    butcherTeam: "Küçükbaş Kasap Ekibi",
    liveWeightKg: 65,
    carcassWeightKg: 34,
    totalShares: 1,
    shareholders: [
      {
        id: "sh-5-1",
        shareIndex: 1,
        fullName: "Serdar Özkan",
        phone: "0532 999 44 11",
        shareRate: "1/1 (Tek Hisse)",
        targetWeightKg: 34,
        actualWeightKg: 34,
        sharePrice: 20000,
        isPaid: true,
        paymentMethod: "kredi_karti",
        isDelivered: true,
        deliveryDate: "2026-06-16",
        deliveryTime: "12:15",
        deliveredTo: "Kendisi",
        specialRequests: "Kelle ve ciğer teslim edildi.",
      },
    ],
    media: [
      {
        id: "m-5-1",
        type: "animal",
        title: "Kıvırcık Koç (TR16-90234)",
        url: DEMO_MEDIA.animal,
        uploadedAt: "2026-06-15",
      },
      {
        id: "m-5-2",
        type: "invoice",
        title: "Fatura",
        url: DEMO_MEDIA.invoice,
        uploadedAt: "2026-06-15",
      },
    ],
    notes: "Tek hissedarlı küçükbaş kurban. Tüm sakatatları ve eti eksiksiz teslim edildi.",
    createdAt: "2026-06-15",
    updatedAt: "2026-06-16",
  },
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
