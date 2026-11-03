export interface QurbanShareholder {
  id: string;
  shareIndex: number; // 1 to 7
  fullName: string; // Hissedar Adı Soyadı
  phone: string; // Telefon (WhatsApp bildirimi için)
  shareRate: string; // Örn: "1/7", "1/5", "1/1"
  targetWeightKg?: number; // Hissedara düşen tahmini et kilosu (kg)
  actualWeightKg?: number; // Gerçekleşen net et kilosu (kg)
  sharePrice: number; // Hisse bedeli (₺)
  isPaid: boolean; // Ödeme alındı mı?
  paymentMethod?: "nakit" | "havale" | "kredi_karti" | string;
  isDelivered: boolean; // Teslim edildi mi?
  deliveryDate?: string; // Ne zaman pay edildi / teslim edildi
  deliveryTime?: string; // Saat
  deliveredTo?: string; // Kime teslim edildi (vekili veya kendisi)
  specialRequests?: string; // Sakatat, kemikli/kemiksiz vb. istekler
}

export interface QurbanMedia {
  id: string;
  type: "truck" | "animal" | "invoice" | "slaughter" | "weighing" | "delivery" | "other";
  title: string; // Örn: "Kurban Sevk Tırı", "Kurbanlık Fotoğrafı", "Alış Faturası", "Tartım Fişi"
  url: string; // Base64 data URL veya image URL
  uploadedAt: string;
}

export interface QurbanRecord {
  id: string;
  qurbanNo: string; // Örn: "KRB-001", "K-124"
  earTagNo: string; // Küpe No örn: "TR34-98421"
  animalType: "buyukbas_tosun" | "buyukbas_duve" | "buyukbas_dana" | "kucukbas_koc" | "kucukbas_koyun" | string;
  animalTypeLabel?: string;
  status: "incoming" | "at_slaughterhouse" | "slaughtered" | "portioned" | "completed";
  // Sevkiyat & Menşei
  originCity: string; // Geldiği İl (Örn: "Kars", "Erzurum", "Afyon", "Sivas")
  originFarm: string; // Çiftlik / Besihane Adı (Örn: "Yıldız Besi Çiftliği")
  truckPlate: string; // Sevk Tırı Plakası (Örn: "34 KBR 82", "06 ERZ 145")
  driverName?: string; // Tır Şoförü
  driverPhone?: string;
  dispatchNoteNo?: string; // Sevk İrsaliye No
  arrivalDate: string; // Geliş Tarihi
  // Fatura & Maliyet
  invoiceNo: string; // Alış Fatura No (Örn: "FTR20260000412")
  invoiceDate: string; // Fatura Tarihi
  supplierName: string; // Fatura Kesilen Firma / Satıcı
  purchasePrice: number; // Kurbanlık Alış Fiyatı (₺)
  additionalCosts?: number; // Nakliye / Kesim / Poşetleme maliyetleri (₺)
  // Kesimhane & Kasap Bilgisi
  slaughterhouseName: string; // Kesildiği Yer / Mezbaha (Örn: "İstanbul Büyükşehir Mezbahası", "Tuzla Kesim Tesisi")
  slaughterDate: string; // Kesim Tarihi
  slaughterTime?: string; // Kesim Saati (Örn: "09:30")
  slaughterOrderNo?: number; // Kesim Sıra No
  butcherTeam?: string; // Kasap Ekibi / Usta Adı
  // Kilo & Tartım
  liveWeightKg?: number; // Canlı Kilo (Örn: 650 kg)
  carcassWeightKg?: number; // Karkas / Net Et Kilosu (Örn: 360 kg)
  boneWeightKg?: number; // Kemikli / Kemiksiz oran
  // Pay & Hissedarlar
  totalShares: number; // 1, 5, 7 vb.
  shareholders: QurbanShareholder[];
  // Fotoğraf & Evraklar
  media: QurbanMedia[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
