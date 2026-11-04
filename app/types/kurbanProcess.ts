// ============================================================================
// KURBAN KESİM VE SÜREÇ TAKİP RAPORU - TYPESCRIPT TİPLERİ
// ============================================================================

export type OrganizationStatus =
  | "planning"
  | "active"
  | "slaughter_stage"
  | "distribution"
  | "completed";

export type PartyType =
  | "client_buyer" // Alıcı / Müşteri Firma
  | "supplier_seller" // Satıcı / Besici
  | "slaughterhouse" // Kesimhane / Mezbaha
  | "logistics_transporter" // Nakliye Firması
  | "cold_storage"; // Soğuk Hava Deposu

export type AnimalStatus =
  | "purchased" // Alımı yapıldı
  | "in_transit" // Sevk halinde
  | "arrived_at_slaughterhouse" // Kesimhaneye ulaştı
  | "slaughtered" // Kesildi
  | "in_storage" // Soğuk depoda
  | "delivered"; // Müşteriye teslim edildi

export type ShipmentStatus =
  | "planned"
  | "in_transit"
  | "delivered_to_slaughterhouse";

export type InvoiceType =
  | "animal_purchase" // Hayvan Alım Faturası
  | "transport_shipping" // Nakliye Faturası
  | "slaughter_service" // Kesim Faturası
  | "storage_service" // Depolama Faturası
  | "sales_outgoing" // Satış / Çıkış Faturası
  | "other";

export type DeliveryTransportType =
  | "company_vehicle" // Şirket Aracı (Özmal)
  | "logistics_third_party"; // Nakliye / Lojistik Firması

export type DocumentCategory =
  | "shipment_photo" // Sevk Tırı / Araç Fotoğrafı
  | "slaughter_photo" // Kesimhane Fotoğrafı
  | "storage_photo" // Depo Fotoğrafı
  | "delivery_photo" // Teslimat Fotoğrafı
  | "passport_doc" // Hayvan Pasaportu
  | "health_report" // Veteriner Sağlık Raporu
  | "contract_doc" // Sözleşme Dosyası
  | "invoice_doc" // Fatura Dosyası
  | "dispatch_doc" // Sevk / Teslimat İrsaliyesi
  | "weighing_slip"; // Kantar / Tartım Fişi

export type ReportStatus = "draft" | "review" | "final_approved";

export type ReportSectionKey =
  | "cover" // A. Kapak Sayfası
  | "general_info" // B. Genel Bilgiler
  | "contract" // C. Hayvan Alım ve Sözleşme Bilgileri
  | "shipment" // D. Sevk ve Nakliye Süreci
  | "animals" // E. Hayvanların Resmî Kayıtları & Küpeler
  | "slaughter" // F. Kesim Süreci
  | "storage" // G. Depolama Süreci
  | "delivery" // H. Satış, Faturalandırma ve Teslimat
  | "evaluation" // I. Genel Değerlendirme ve Sonuç
  | "annexes" // J. Ekler (Belgeler & Fotoğraflar)
  | "custom"; // Kullanıcı Özel Bölümü

// 1. Ana Organizasyon
export interface KurbanProcessOrganization {
  id: string;
  name: string;
  clientCompanyName: string;
  clientTaxNo?: string;
  clientTaxOffice?: string;
  clientAddress?: string;
  clientContact?: string;
  startDate: string;
  endDate?: string;
  targetAnimalCount: number;
  status: OrganizationStatus;
  description?: string;
  generalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// 2. Taraflar
export interface KurbanParty {
  id: string;
  organizationId: string;
  partyType: PartyType;
  name: string;
  taxId?: string;
  taxOffice?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  authorizedPerson?: string;
  notes?: string;
  createdAt: string;
}

// 3. Alım Sözleşmesi
export interface KurbanContract {
  id: string;
  organizationId: string;
  contractNo: string;
  contractDate: string;
  sellerPartyId?: string;
  buyerPartyId?: string;
  sellerName: string;
  buyerName: string;
  animalType: string;
  animalCount: number;
  unitPrice: number;
  totalAmount: number;
  description?: string;
  contractFileUrl?: string;
  createdAt: string;
}

// 4. Kesim Yerleri
export interface KurbanCuttingLocation {
  id: string;
  organizationId: string;
  name: string;
  locationCode: string;
  city: string;
  address?: string;
  responsiblePerson?: string;
  responsiblePhone?: string;
  officialApprovalNo?: string;
  veterinaryName?: string;
  dailyCapacity: number;
  allocatedAnimalCount: number;
  notes?: string;
  createdAt: string;
}

// 5. Hayvan Kaydı (300-400 hayvan için)
export interface KurbanAnimal {
  id: string;
  organizationId: string;
  cuttingLocationId?: string;
  earTagNo: string;
  animalType: string;
  animalTypeLabel?: string;
  breed?: string;
  gender: "male" | "female";
  birthDate?: string;
  ageMonths: number;
  passportNo?: string;
  farmRegNo?: string;
  farmName?: string;
  healthDocNo?: string;
  passportFileUrl?: string;
  healthDocFileUrl?: string;
  liveWeightKg: number;
  carcassWeightKg: number;
  status: AnimalStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 6. Sevk İşlemleri
export interface KurbanShipment {
  id: string;
  organizationId: string;
  destinationLocationId: string;
  destinationLocationName?: string;
  shipmentNo: string;
  shipmentDate: string;
  originAddress: string;
  carrierCompany?: string;
  vehiclePlate: string;
  driverName: string;
  driverPhone?: string;
  animalCount: number;
  shippingCost: number;
  shippingInvoiceNo?: string;
  dispatchNoteNo?: string;
  vetHealthReportNo?: string;
  status: ShipmentStatus;
  notes?: string;
  animalIds?: string[];
  createdAt: string;
}

// 7. Kesim Oturumu & Batch
export interface KurbanSlaughterBatch {
  id: string;
  organizationId: string;
  cuttingLocationId: string;
  cuttingLocationName?: string;
  batchNo: string;
  slaughterDate: string;
  slaughterTime?: string;
  animalCount: number;
  totalCarcassWeightKg: number;
  responsiblePerson?: string;
  butcherTeam?: string;
  veterinaryApproval: boolean;
  officialProtocolNo?: string;
  notes?: string;
  slaughteredAnimalIds?: string[];
  createdAt: string;
}

// 8. Depolama İşlemi
export interface KurbanStorageRecord {
  id: string;
  organizationId: string;
  cuttingLocationId?: string;
  cuttingLocationName?: string;
  storageCompany: string;
  warehouseName: string;
  warehouseAddress?: string;
  entryDate: string;
  exitDate?: string;
  productType: string;
  storedQuantityKg: number;
  remainingQuantityKg?: number;
  entryDispatchNo?: string;
  exitDispatchNo?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  invoiceAmount: number;
  temperatureCelsius: number;
  status: "in_storage" | "partially_dispatched" | "empty";
  notes?: string;
  createdAt: string;
}

// 9. Fatura ve İrsaliyeler
export interface KurbanInvoice {
  id: string;
  organizationId: string;
  cuttingLocationId?: string;
  cuttingLocationName?: string;
  invoiceType: InvoiceType;
  invoiceNo: string;
  invoiceDate: string;
  issuerCompany: string;
  recipientCompany: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  description?: string;
  fileUrl?: string;
  createdAt: string;
}

// 10. Çıkış & Teslimat
export interface KurbanDelivery {
  id: string;
  organizationId: string;
  cuttingLocationId?: string;
  cuttingLocationName?: string;
  deliveryNo: string;
  recipientCompany: string;
  deliveryDate: string;
  deliveredQuantityKg: number;
  deliveredAnimalCount: number;
  outgoingInvoiceNo?: string;
  dispatchNoteNo: string;
  deliveryAddress: string;
  recipientPerson: string;
  deliveredByPerson: string;
  transportType: DeliveryTransportType;
  vehiclePlate: string;
  driverName: string;
  transportCost: number;
  status: "completed" | "in_transit" | "cancelled";
  notes?: string;
  createdAt: string;
}

// 11. Süreç Belge & Fotoğrafları
export interface KurbanDocument {
  id: string;
  organizationId: string;
  cuttingLocationId?: string;
  category: DocumentCategory;
  title: string;
  description?: string;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  relatedEntityType?: "shipment" | "slaughter" | "storage" | "delivery" | "animal" | "invoice";
  relatedEntityId?: string;
  uploadedAt: string;
}

// 12. Düzenlenebilir Rapor Bölümü
export interface KurbanReportSection {
  id: string;
  reportId: string;
  sectionKey: ReportSectionKey;
  sectionTitle: string;
  orderIndex: number;
  isEnabled: boolean;
  contentHtml?: string;
  customNotes?: string;
  photoIds?: string[];
  includeTables: boolean;
  pageBreakAfter: boolean;
  createdAt: string;
}

// 13. Kesim Yeri Bazlı Resmî Rapor
export interface KurbanReport {
  id: string;
  organizationId: string;
  cuttingLocationId: string;
  cuttingLocationName?: string;
  reportNo: string;
  title: string;
  reportDate: string;
  reportPeriod: string;
  preparedBy: string;
  status: ReportStatus;
  clientCompanyName: string;
  executiveSummary?: string;
  evaluationNotes?: string;
  finalResultSummary?: string;
  sections?: KurbanReportSection[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// 14. Rapor Revizyonu (Geçmiş Sürüm)
export interface KurbanReportRevision {
  id: string;
  reportId: string;
  revisionNo: number;
  title: string;
  snapshotData: Record<string, any>;
  savedBy?: string;
  createdAt: string;
}

// 15. İstatistik & Mutabakat Özeti
export interface KurbanProcessStats {
  totalTargetAnimals: number;
  totalPurchasedAnimals: number;
  totalShipments: number;
  totalShippedAnimals: number;
  totalSlaughterBatches: number;
  totalSlaughteredAnimals: number;
  totalCarcassWeightKg: number;
  totalStorageRecords: number;
  totalStoredQuantityKg: number;
  totalDeliveries: number;
  totalDeliveredQuantityKg: number;
  totalDeliveredAnimals: number;
  totalInvoicesCount: number;
  totalInvoiceAmount: number;
  totalDocumentsCount: number;
  missingDocumentsCount: number;
  discrepancies: {
    unshippedAnimals: number;
    unslaughteredShippedAnimals: number;
    unstoredOrUndeliveredKg: number;
  };
}
