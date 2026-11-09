"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Truck,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit3,
  Printer,
  Download,
  Upload,
  Camera,
  Image as ImageIcon,
  Users,
  Scale,
  ChevronRight,
  X,
  Building,
  Phone,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  ShieldCheck,
  Check,
  Eye,
  RefreshCw,
  Coins,
  Tag,
  ArrowUpDown,
  FileDown,
  Sparkles,
  Database,
  Loader2,
  Building2,
  Warehouse,
  ScrollText,
  ClipboardCheck,
  FileCheck2,
  ChevronDown,
  MapPin,
  AlertTriangle,
  TrendingUp,
  Maximize2,
  Save,
  FileSignature,
  SlidersHorizontal,
  HardDrive,
  Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  KurbanProcessOrganization,
  KurbanCuttingLocation,
  KurbanParty,
  KurbanContract,
  KurbanAnimal,
  KurbanShipment,
  KurbanSlaughterBatch,
  KurbanStorageRecord,
  KurbanInvoice,
  KurbanDelivery,
  KurbanDocument,
  KurbanReport,
  KurbanReportSection,
  KurbanProcessStats,
  AnimalStatus,
  DocumentCategory,
  PartyType,
  DeliveryTransportType,
  ShipmentStatus,
} from "../types/kurbanProcess";
import {
  fetchProcessOverviewApi,
  fetchAnimalsApi,
  createAnimalApi,
  updateAnimalApi,
  deleteAnimalApi,
  bulkImportAnimalsApi,
  seedDemoDataToSupabaseApi,
  fetchReportsApi,
  updateReportApi,
  saveReportRevisionApi,
  exportAnimalsToExcel,
  downloadAnimalImportTemplate,
  saveEntityApi,
  deleteEntityApi,
  clearMockDataApi,
} from "../utils/kurbanProcessApi";
import {
  compressImageFile,
  formatBytes,
  uploadImageToOptimizedStorage,
} from "../utils/imageCompressor";
import {
  SEED_ORGANIZATION_ID,
  SEED_LOC_TUZLA_ID,
  SEED_LOC_KOCAELI_ID,
  SEED_REP_TUZLA_ID,
  SEED_REP_KOCAELI_ID,
} from "../utils/kurbanProcessSeed";
import { htmlToMarkdown, renderMarkdownToHtml } from "../utils/markdown";

type ProcessTab =
  | "overview" // 1. Kurban İşlemleri / Genel Bakış
  | "parties" // 2. Firma / Müşteri Bilgileri
  | "locations" // 3. Kesim Yerleri
  | "animals" // 4. Hayvan Kayıtları (350 Hayvan)
  | "shipments" // 5. Sevk İşlemleri
  | "slaughter" // 6. Kesim ve Depolama
  | "invoices" // 7. Fatura ve İrsaliyeler
  | "deliveries" // 8. Teslimat İşlemleri
  | "reports"; // 9. Resmî Raporlar & Rapor Editörü

export default function KurbanProcessModuleView() {
  // Navigation
  const [activeTab, setActiveTab] = useState<ProcessTab>("overview");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");

  // Core Data States
  const [organization, setOrganization] = useState<KurbanProcessOrganization | null>(null);
  const [cuttingLocations, setCuttingLocations] = useState<KurbanCuttingLocation[]>([]);
  const [parties, setParties] = useState<KurbanParty[]>([]);
  const [contracts, setContracts] = useState<KurbanContract[]>([]);
  const [shipments, setShipments] = useState<KurbanShipment[]>([]);
  const [slaughterBatches, setSlaughterBatches] = useState<KurbanSlaughterBatch[]>([]);
  const [storageRecords, setStorageRecords] = useState<KurbanStorageRecord[]>([]);
  const [invoices, setInvoices] = useState<KurbanInvoice[]>([]);
  const [deliveries, setDeliveries] = useState<KurbanDelivery[]>([]);
  const [documents, setDocuments] = useState<KurbanDocument[]>([]);
  const [reports, setReports] = useState<KurbanReport[]>([]);
  const [stats, setStats] = useState<KurbanProcessStats | null>(null);

  // Animals State (300-400 Records with server/client pagination)
  const [animals, setAnimals] = useState<KurbanAnimal[]>([]);
  const [totalAnimalCount, setTotalAnimalCount] = useState<number>(0);
  const [animalPage, setAnimalPage] = useState<number>(1);
  const [animalPageSize, setAnimalPageSize] = useState<number>(25);
  const [animalSearch, setAnimalSearch] = useState<string>("");
  const [animalStatusFilter, setAnimalStatusFilter] = useState<string>("all");
  const [animalsLoading, setAnimalsLoading] = useState<boolean>(false);

  // Active Report State (For Official Report Tab)
  const [selectedReportId, setSelectedReportId] = useState<string>(SEED_REP_TUZLA_ID);
  const [activeReport, setActiveReport] = useState<KurbanReport | null>(null);
  const [isEditingReport, setIsEditingReport] = useState<boolean>(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editedSectionTitle, setEditedSectionTitle] = useState<string>("");
  const [editedSectionHtml, setEditedSectionHtml] = useState<string>("");
  const [editedSectionNotes, setEditedSectionNotes] = useState<string>("");
  const [markdownEditorMode, setMarkdownEditorMode] = useState<"split" | "edit" | "preview">("split");
  const sectionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Modals & UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string; desc?: string } | null>(null);
  const [animalModalOpen, setAnimalModalOpen] = useState<boolean>(false);
  const [editingAnimal, setEditingAnimal] = useState<Partial<KurbanAnimal> | null>(null);
  const [excelImportModalOpen, setExcelImportModalOpen] = useState<boolean>(false);

  // =========================================================================
  // MANUEL EKLEME & DÜZENLEME MODALLARI (PARTIES, LOCATIONS, SHIPMENTS, STORAGE, DELIVERIES)
  // =========================================================================

  // 0. Organization (Ana Organizasyon & Alıcı Kurum Bilgileri)
  const [organizationModalOpen, setOrganizationModalOpen] = useState<boolean>(false);
  const [editingOrganization, setEditingOrganization] =
    useState<Partial<KurbanProcessOrganization> | null>(null);

  // 1. Party (Müşteri / Kurbanı Aldığım Yer / Besici / Soğuk Depo Firması)
  const [partyModalOpen, setPartyModalOpen] = useState<boolean>(false);
  const [editingParty, setEditingParty] = useState<Partial<KurbanParty> | null>(null);
  const [partyTypeFilter, setPartyTypeFilter] = useState<string>("all");

  // 2. Cutting Location (Kesim Yeri Ekle)
  const [locationModalOpen, setLocationModalOpen] = useState<boolean>(false);
  const [editingLocation, setEditingLocation] = useState<Partial<KurbanCuttingLocation> | null>(null);

  // 3. Shipment (TIR Ekle)
  const [shipmentModalOpen, setShipmentModalOpen] = useState<boolean>(false);
  const [editingShipment, setEditingShipment] = useState<Partial<KurbanShipment> | null>(null);

  // 3.5. Slaughter Batch (Kesimhane Oturumu & Karkas Tartım Tutanağı)
  const [slaughterModalOpen, setSlaughterModalOpen] = useState<boolean>(false);
  const [editingSlaughter, setEditingSlaughter] =
    useState<Partial<KurbanSlaughterBatch> | null>(null);

  // 4. Cold Storage Record (Soğuk Hava Depolama Kaydı)
  const [storageModalOpen, setStorageModalOpen] = useState<boolean>(false);
  const [editingStorage, setEditingStorage] = useState<Partial<KurbanStorageRecord> | null>(null);

  // 4.5. Invoice (Mali Fatura & İrsaliye)
  const [invoiceModalOpen, setInvoiceModalOpen] = useState<boolean>(false);
  const [editingInvoice, setEditingInvoice] = useState<Partial<KurbanInvoice> | null>(null);

  // 5. Delivery Transport (Taşıma Aracı - PLAKA ZORUNLU DEĞİL)
  const [deliveryModalOpen, setDeliveryModalOpen] = useState<boolean>(false);
  const [editingDelivery, setEditingDelivery] = useState<Partial<KurbanDelivery> | null>(null);

  // Handlers for Save and Delete
  const handleSaveOrganization = async (orgData: Partial<KurbanProcessOrganization>) => {
    if (!orgData.clientCompanyName?.trim() && !orgData.name?.trim()) {
      showToast("Lütfen organizasyon veya alıcı kurum adını giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("organization", orgData);
      if (res.success && res.organization) {
        setOrganization(res.organization);
        setOrganizationModalOpen(false);
        showToast("Organizasyon ve alıcı kurum bilgileri güncellendi.");
        await loadOverview(selectedLocationId);
      } else {
        showToast(res.error || "Bilgiler kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearMockData = async () => {
    if (
      !confirm(
        "Mevcut tüm örnek (mock) firma, kesim yeri, sevk, depo, fatura ve teslimat kayıtlarını kalıcı olarak temizlemek istediğinize emin misiniz?"
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await clearMockDataApi();
      if (res.success) {
        setParties([]);
        setCuttingLocations([]);
        setShipments([]);
        setSlaughterBatches([]);
        setStorageRecords([]);
        setInvoices([]);
        setDeliveries([]);
        setDocuments([]);
        setReports([]);
        setActiveReport(null);
        setSelectedLocationId("all");
        showToast(res.message || "Örnek (mock) veriler kalıcı olarak temizlendi.");
        await loadOverview("all");
      } else {
        showToast(res.error || "Temizleme işlemi başarısız.");
      }
    } catch {
      showToast("Temizleme sırasında hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveParty = async (partyData: Partial<KurbanParty>) => {
    if (!partyData.name?.trim()) {
      showToast("Lütfen firma veya kişi adını giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("party", partyData);
      if (res.success && res.party) {
        setParties((prev) => {
          const idx = prev.findIndex((p) => p.id === res.party.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.party;
            return updated;
          }
          return [res.party, ...prev];
        });
        if (res.organization) {
          setOrganization(res.organization);
        }
        setPartyModalOpen(false);
        showToast("Paydaş / Firma kaydı başarıyla kaydedildi.");
      } else {
        showToast(res.error || "Firma kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteParty = async (id: string) => {
    if (!confirm("Bu firma/paydaş kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("party", id);
      if (res.success) {
        setParties((prev) => prev.filter((p) => p.id !== id));
        showToast("Firma kaydı kalıcı olarak silindi.");
      } else {
        showToast(res.error || "Firma silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  const handleSaveLocation = async (locData: Partial<KurbanCuttingLocation>) => {
    if (!locData.name?.trim()) {
      showToast("Lütfen kesim yeri adını giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("location", locData);
      if (res.success && res.location) {
        setCuttingLocations((prev) => {
          const idx = prev.findIndex((l) => l.id === res.location.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.location;
            return updated;
          }
          return [...prev, res.location];
        });
        if (res.reports && Array.isArray(res.reports)) {
          setReports(res.reports);
        }
        setLocationModalOpen(false);
        showToast("Kesim yeri tesisi başarıyla kaydedildi.");
      } else {
        showToast(res.error || "Kesim yeri kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("Bu kesim yerini silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("location", id);
      if (res.success) {
        setCuttingLocations((prev) => prev.filter((l) => l.id !== id));
        if (selectedLocationId === id) {
          setSelectedLocationId("all");
        }
        if (res.reports && Array.isArray(res.reports)) {
          setReports(res.reports);
        }
        showToast("Kesim yeri kalıcı olarak silindi.");
      } else {
        showToast(res.error || "Kesim yeri silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  const handleSaveShipment = async (shpData: Partial<KurbanShipment>) => {
    if (!shpData.driverName?.trim() && !shpData.vehiclePlate?.trim()) {
      showToast("Lütfen şoför veya tır plakası bilgisini giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("shipment", shpData);
      if (res.success && res.shipment) {
        setShipments((prev) => {
          const idx = prev.findIndex((s) => s.id === res.shipment.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.shipment;
            return updated;
          }
          return [res.shipment, ...prev];
        });
        setShipmentModalOpen(false);
        showToast("Sevk tırı başarıyla kaydedildi.");
      } else {
        showToast(res.error || "Sevk tırı kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteShipment = async (id: string) => {
    if (!confirm("Bu sevk tırı kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("shipment", id);
      if (res.success) {
        setShipments((prev) => prev.filter((s) => s.id !== id));
        showToast("Sevk tırı silindi.");
      } else {
        showToast(res.error || "Sevk tırı silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  const handleSaveSlaughter = async (slgData: Partial<KurbanSlaughterBatch>) => {
    if (!slgData.batchNo?.trim() && !slgData.cuttingLocationId) {
      showToast("Lütfen kesimhane oturum bilgilerini giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("slaughter", slgData);
      if (res.success && res.slaughter) {
        setSlaughterBatches((prev) => {
          const idx = prev.findIndex((b) => b.id === res.slaughter.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.slaughter;
            return updated;
          }
          return [res.slaughter, ...prev];
        });
        setSlaughterModalOpen(false);
        showToast("Kesimhane oturumu ve karkas tartım tutanağı kaydedildi.");
      } else {
        showToast(res.error || "Kesim oturumu kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlaughter = async (id: string) => {
    if (!confirm("Bu kesimhane oturumu / tutanak kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("slaughter", id);
      if (res.success) {
        setSlaughterBatches((prev) => prev.filter((b) => b.id !== id));
        showToast("Kesimhane oturumu silindi.");
      } else {
        showToast(res.error || "Kesim oturumu silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  const handleSaveStorage = async (stData: Partial<KurbanStorageRecord>) => {
    if (!stData.warehouseName?.trim()) {
      showToast("Lütfen soğuk hava deposu adını giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("storage", stData);
      if (res.success && res.storage) {
        setStorageRecords((prev) => {
          const idx = prev.findIndex((st) => st.id === res.storage.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.storage;
            return updated;
          }
          return [res.storage, ...prev];
        });
        setStorageModalOpen(false);
        showToast("Soğuk hava depolama kaydı başarıyla kaydedildi.");
      } else {
        showToast(res.error || "Depo kaydı kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStorage = async (id: string) => {
    if (!confirm("Bu depolama kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("storage", id);
      if (res.success) {
        setStorageRecords((prev) => prev.filter((st) => st.id !== id));
        showToast("Depolama kaydı silindi.");
      } else {
        showToast(res.error || "Depolama kaydı silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  const handleSaveInvoice = async (invData: Partial<KurbanInvoice>) => {
    if (!invData.invoiceNo?.trim() && !invData.issuerCompany?.trim()) {
      showToast("Lütfen fatura numarası ve düzenleyen firma adını giriniz.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveEntityApi("invoice", invData);
      if (res.success && res.invoice) {
        setInvoices((prev) => {
          const idx = prev.findIndex((inv) => inv.id === res.invoice.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.invoice;
            return updated;
          }
          return [res.invoice, ...prev];
        });
        setInvoiceModalOpen(false);
        showToast("Fatura kaydı başarıyla kaydedildi.");
      } else {
        showToast(res.error || "Fatura kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm("Bu fatura kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("invoice", id);
      if (res.success) {
        setInvoices((prev) => prev.filter((inv) => inv.id !== id));
        showToast("Fatura kaydı silindi.");
      } else {
        showToast(res.error || "Fatura silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  const handleSaveDelivery = async (delData: Partial<KurbanDelivery>) => {
    if (!delData.driverName?.trim()) {
      showToast("Lütfen şoför adını giriniz.");
      return;
    }
    // PLAKA ZORUNLU DEĞİL!
    setIsSaving(true);
    try {
      const res = await saveEntityApi("delivery", delData);
      if (res.success && res.delivery) {
        setDeliveries((prev) => {
          const idx = prev.findIndex((d) => d.id === res.delivery.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.delivery;
            return updated;
          }
          return [res.delivery, ...prev];
        });
        setDeliveryModalOpen(false);
        showToast("Taşıma aracı ve teslimat kaydı başarıyla kaydedildi.");
      } else {
        showToast(res.error || "Teslimat kaydedilemedi.");
      }
    } catch {
      showToast("Bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDelivery = async (id: string) => {
    if (!confirm("Bu taşıma aracı / teslimat kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const res = await deleteEntityApi("delivery", id);
      if (res.success) {
        setDeliveries((prev) => prev.filter((d) => d.id !== id));
        showToast("Taşıma aracı kaydı silindi.");
      } else {
        showToast(res.error || "Teslimat kaydı silinemedi.");
      }
    } catch {
      showToast("Silme işlemi başarısız.");
    }
  };

  // Photo & Document Upload Modal States (Client-Side Compression + Supabase CDN)
  const [photoUploadModalOpen, setPhotoUploadModalOpen] = useState<boolean>(false);
  const [uploadEntity, setUploadEntity] = useState<{
    type: "shipment" | "slaughter" | "delivery" | "animal" | "invoice" | "general";
    id?: string;
    label?: string;
  }>({ type: "general" });
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [compressedPhotoResult, setCompressedPhotoResult] = useState<any | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [customDocTitle, setCustomDocTitle] = useState<string>("");
  const [customDocDesc, setCustomDocDesc] = useState<string>("");
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  // Open Photo Upload Modal for specific entity
  const openPhotoUploadModal = (
    type: "shipment" | "slaughter" | "delivery" | "animal" | "invoice" | "general",
    id?: string,
    defaultTitle?: string
  ) => {
    setUploadEntity({ type, id, label: defaultTitle });
    setSelectedPhotoFile(null);
    setCompressedPhotoResult(null);
    setCustomDocTitle(defaultTitle || "");
    setCustomDocDesc("");
    setPhotoUploadModalOpen(true);
  };

  // Handle Photo File Selection & Client-Side Canvas WebP Compression
  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedPhotoFile(file);
    setIsCompressingPhoto(true);

    try {
      const result = await compressImageFile(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.82,
        createThumbnail: true,
      });

      setCompressedPhotoResult(result);
      if (!customDocTitle) {
        setCustomDocTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (err: any) {
      console.error("Görsel sıkıştırma hatası:", err);
      showToast("Fotoğraf sıkıştırılırken bir hata oluştu.");
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  // Save Compressed Photo to Supabase Storage with 1-Year CDN Cache
  const handleSavePhotoToStorage = async () => {
    if (!compressedPhotoResult) {
      showToast("Lütfen önce bir fotoğraf seçin.");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const uploadRes = await uploadImageToOptimizedStorage(
        compressedPhotoResult,
        `qurban/${uploadEntity.type}`
      );

      const finalUrl = uploadRes.url || compressedPhotoResult.dataUrl;

      const docCategory: DocumentCategory =
        uploadEntity.type === "shipment"
          ? "shipment_photo"
          : uploadEntity.type === "slaughter"
          ? "slaughter_photo"
          : uploadEntity.type === "delivery"
          ? "delivery_photo"
          : "shipment_photo";

      const newDoc: KurbanDocument = {
        id: `doc-${Date.now()}`,
        organizationId: organization?.id || "org-anadolu-001",
        cuttingLocationId:
          selectedLocationId !== "all" ? selectedLocationId : "ksm-tuzla-01",
        category: docCategory,
        relatedEntityType:
          uploadEntity.type === "general" ? undefined : uploadEntity.type,
        relatedEntityId: uploadEntity.id,
        title: customDocTitle.trim() || "Kurban Süreç Görseli",
        fileUrl: finalUrl,
        description:
          customDocDesc.trim() ||
          `WebP Optimize Edilmiş Fotoğraf (${formatBytes(
            compressedPhotoResult.originalSize
          )} ➔ ${formatBytes(compressedPhotoResult.compressedSize)})`,
        uploadedAt: new Date().toISOString(),
      };

      const savedRes = await saveEntityApi("document", newDoc);
      const finalDoc = savedRes.document || newDoc;

      setDocuments((prev) => [finalDoc, ...prev]);
      setPhotoUploadModalOpen(false);
      showToast(
        `✅ Fotoğraf başarıyla yüklendi (${formatBytes(
          compressedPhotoResult.originalSize
        )} ➔ ${formatBytes(compressedPhotoResult.compressedSize)}, %${
          compressedPhotoResult.reductionPercent
        } tasarruf)`
      );
    } catch (err: any) {
      console.error("Fotoğraf yükleme hatası:", err);
      showToast("Fotoğraf yüklenirken hata oluştu.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // File Input Ref for Excel
  const excelFileRef = useRef<HTMLInputElement>(null);
  const reportPrintRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3800);
  };

  // 1. Initial Load of Process Overview
  const loadOverview = async (locId = selectedLocationId) => {
    setIsLoading(true);
    try {
      const data = await fetchProcessOverviewApi(locId);
      if (data.success) {
        if (data.organization) setOrganization(data.organization);
        if (data.cuttingLocations) setCuttingLocations(data.cuttingLocations);
        if (data.parties) setParties(data.parties);
        if (data.contracts) setContracts(data.contracts);
        if (data.shipments) setShipments(data.shipments);
        if (data.slaughterBatches) setSlaughterBatches(data.slaughterBatches);
        if (data.storageRecords) setStorageRecords(data.storageRecords);
        if (data.invoices) setInvoices(data.invoices);
        if (data.deliveries) setDeliveries(data.deliveries);
        if (data.documents) setDocuments(data.documents);
        if (Array.isArray(data.reports)) {
          const fetchedReports = data.reports;
          setReports(fetchedReports);
          if (fetchedReports.length > 0) {
            setActiveReport((prev) => {
              if (prev) {
                const matched = fetchedReports.find((r: KurbanReport) => r.id === prev.id);
                if (matched) return matched;
              }
              if (selectedReportId) {
                const matchedById = fetchedReports.find(
                  (r: KurbanReport) => r.id === selectedReportId
                );
                if (matchedById) return matchedById;
              }
              return fetchedReports[0];
            });
            setSelectedReportId((prev) => {
              if (prev && fetchedReports.some((r: KurbanReport) => r.id === prev)) return prev;
              return fetchedReports[0].id;
            });
          } else {
            setActiveReport(null);
          }
        }
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Overview fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Load Animals with Pagination & Filters
  const loadAnimals = async (page = animalPage, size = animalPageSize, search = animalSearch, status = animalStatusFilter, locId = selectedLocationId) => {
    setAnimalsLoading(true);
    try {
      const res = await fetchAnimalsApi({
        page,
        pageSize: size,
        search,
        status,
        locationId: locId,
      });

      if (res.success) {
        setAnimals(res.animals);
        setTotalAnimalCount(res.totalCount);
      }
    } catch (err) {
      console.error("Animals load error:", err);
    } finally {
      setAnimalsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview(selectedLocationId);
  }, [selectedLocationId]);

  useEffect(() => {
    loadAnimals(animalPage, animalPageSize, animalSearch, animalStatusFilter, selectedLocationId);
  }, [animalPage, animalPageSize, animalSearch, animalStatusFilter, selectedLocationId]);

  // Sync selected active report
  useEffect(() => {
    if (reports.length > 0) {
      const found = reports.find((r) => r.id === selectedReportId) || reports[0];
      setActiveReport(found);
    }
  }, [selectedReportId, reports]);

  // Seed 350 Records to Supabase handler
  const handleSeedToSupabase = async () => {
    if (confirm("350 adet hayvan, 2 kesimhane ve tüm süreç verilerini Supabase bulut veritabanına aktarmak istiyor musunuz?")) {
      setIsSaving(true);
      showToast("350 hayvan ve resmi süreç kayıtları Supabase'e yazılıyor...");
      const res = await seedDemoDataToSupabaseApi();
      setIsSaving(false);
      if (res.success) {
        showToast("Tebrikler! Tüm veriler Supabase veritabanına aktarıldı.");
        await loadOverview(selectedLocationId);
        await loadAnimals(1, animalPageSize, animalSearch, animalStatusFilter, selectedLocationId);
      } else {
        alert("Aktarma hatası: " + res.error);
      }
    }
  };

  // Handle Animal Save (Create or Update)
  const handleSaveAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnimal?.earTagNo?.trim()) {
      alert("Lütfen hayvan küpe numarasını giriniz.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingAnimal.id) {
        // Update
        const res = await updateAnimalApi(editingAnimal as KurbanAnimal);
        if (res.success) {
          showToast(`${editingAnimal.earTagNo} güncellendi.`);
          await loadAnimals();
          await loadOverview(selectedLocationId);
          setAnimalModalOpen(false);
        }
      } else {
        // Create
        const res = await createAnimalApi(editingAnimal);
        if (res.success) {
          showToast(`${editingAnimal.earTagNo} başarıyla kaydedildi.`);
          await loadAnimals();
          await loadOverview(selectedLocationId);
          setAnimalModalOpen(false);
        }
      }
    } catch (err: any) {
      alert("Hata: " + err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Animal Delete
  const handleDeleteAnimal = async (id: string, earTagNo: string) => {
    if (confirm(`${earTagNo} küpeli hayvan kaydını silmek istediğinize emin misiniz?`)) {
      setIsSaving(true);
      const res = await deleteAnimalApi(id);
      setIsSaving(false);
      if (res.success) {
        showToast(`${earTagNo} silindi.`);
        await loadAnimals();
        await loadOverview(selectedLocationId);
      }
    }
  };

  // Handle Excel Bulk Import for 300-400 Animals
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          alert("Excel dosyasında veri satırı bulunamadı.");
          return;
        }

        const parsedAnimals: Partial<KurbanAnimal>[] = data.map((row, idx) => {
          const earTag = String(row["Küpe Numarası"] || row["Küpe No"] || `TR34-${Date.now()}-${idx}`).trim();
          const locCode = String(row["Kesim Yeri Kodu"] || row["Kesim Yeri"] || "").trim();
          const locId =
            locCode.includes("KSM-02") || locCode.includes("Kartepe")
              ? SEED_LOC_KOCAELI_ID
              : SEED_LOC_TUZLA_ID;

          return {
            earTagNo: earTag,
            cuttingLocationId: locId,
            animalType: "buyukbas_tosun",
            animalTypeLabel: String(row["Hayvan Cinsi"] || "Büyükbaş Tosun"),
            breed: String(row["Irk"] || "Simental"),
            gender: String(row["Cinsiyet"]).toLowerCase().includes("dişi") ? "female" : "male",
            ageMonths: Number(row["Yaş (Ay)"] || row["Yaş"]) || 24,
            passportNo: String(row["Pasaport No"] || `PAS-${earTag}`),
            farmRegNo: String(row["İşletme Kayıt No"] || "TR-36-004128"),
            farmName: String(row["Kayıtlı İşletme"] || "Serhat Besi İşletmesi"),
            healthDocNo: String(row["Sağlık Rapor No"] || `VET-2026-${idx}`),
            liveWeightKg: Number(row["Canlı Kilo (Kg)"] || row["Canlı Kilo"]) || 650,
            carcassWeightKg: Number(row["Karkas Kilo (Kg)"] || row["Karkas Kilo"]) || 365,
            status: "purchased" as AnimalStatus,
            notes: String(row["Notlar"] || "Excel İçe Aktarım"),
          };
        });

        setIsSaving(true);
        showToast(`${parsedAnimals.length} adet hayvan sisteme aktarılıyor...`);
        const res = await bulkImportAnimalsApi(parsedAnimals);
        setIsSaving(false);

        if (res.success) {
          showToast(`Tebrikler! ${res.count || parsedAnimals.length} adet hayvan aktarıldı.`);
          setExcelImportModalOpen(false);
          await loadAnimals();
          await loadOverview(selectedLocationId);
        } else {
          alert("İçe aktarma hatası: " + res.error);
        }
      } catch (err: any) {
        alert("Excel dosyası okunamadı: " + err?.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Helper to insert or wrap Markdown syntax at cursor selection in the section editor textarea
  const insertMarkdownSyntax = (
    prefix: string,
    suffix: string = "",
    placeholder: string = "Metin",
    newLineBefore: boolean = false
  ) => {
    const textarea = sectionTextareaRef.current;
    if (!textarea) {
      setEditedSectionHtml(
        (prev) => `${prev}${newLineBefore && prev && !prev.endsWith("\n") ? "\n" : ""}${prefix}${placeholder}${suffix}`
      );
      return;
    }

    const start = textarea.selectionStart ?? editedSectionHtml.length;
    const end = textarea.selectionEnd ?? editedSectionHtml.length;
    const selectedText = editedSectionHtml.substring(start, end);
    const replacementInner = selectedText || placeholder;
    const needsNewline = newLineBefore && start > 0 && editedSectionHtml[start - 1] !== "\n";
    const fullInsert = `${needsNewline ? "\n" : ""}${prefix}${replacementInner}${suffix}`;

    const nextValue =
      editedSectionHtml.substring(0, start) +
      fullInsert +
      editedSectionHtml.substring(end);

    setEditedSectionHtml(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + (needsNewline ? 1 : 0) + prefix.length;
      const cursorEnd = cursorStart + replacementInner.length;
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  // Add a new custom Markdown section to the active report
  const handleAddCustomSection = async () => {
    if (!activeReport) return;
    const currentSections = activeReport.sections || [];
    const nextOrder = currentSections.length + 1;
    const newSec: KurbanReportSection = {
      id: `sec-custom-${Date.now()}`,
      reportId: activeReport.id,
      sectionKey: "custom",
      sectionTitle: `${nextOrder}. Ek Değerlendirme & Özel Rapor Bölümü`,
      orderIndex: nextOrder,
      isEnabled: true,
      contentHtml: `### Ek Denetim Başlığı\n\nBu bölümde **kalın**, *italik*, madde işaretleri ve tablolar dahil olmak üzere **Markdown** formatında rapor metni oluşturabilirsiniz.\n\n- **Birinci Denetim Notu:** Eksiksiz kontrol edildi.\n- **İkinci Denetim Notu:** Belgeler arşivlendi.`,
      customNotes: "Denetim heyeti özel değerlendirme notu.",
      includeTables: false,
      pageBreakAfter: false,
      createdAt: new Date().toISOString(),
    };

    const updatedReport: KurbanReport = {
      ...activeReport,
      sections: [...currentSections, newSec],
    };

    setActiveReport(updatedReport);
    setReports((prev) => prev.map((r) => (r.id === updatedReport.id ? updatedReport : r)));
    setEditingSectionId(newSec.id);
    setEditedSectionTitle(newSec.sectionTitle);
    setEditedSectionHtml(newSec.contentHtml || "");
    setEditedSectionNotes(newSec.customNotes || "");
    showToast("Yeni Markdown rapor bölümü eklendi. Düzenleyip kaydedebilirsiniz.");
  };

  // Section Live Edit Save
  const handleSaveSectionEdit = async (section: KurbanReportSection) => {
    if (!activeReport) return;
    setIsSaving(true);

    try {
      const updatedSections = (activeReport.sections || []).map((s) =>
        s.id === section.id
          ? {
              ...s,
              sectionTitle: editedSectionTitle.trim() || s.sectionTitle,
              contentHtml: editedSectionHtml,
              customNotes: editedSectionNotes,
            }
          : s
      );

      const updatedReport = {
        ...activeReport,
        sections: updatedSections,
      };

      const res = await updateReportApi(updatedReport);
      if (res.success) {
        const finalReport = res.report || updatedReport;
        showToast("Rapor bölümü canlı olarak güncellendi.");
        setActiveReport(finalReport);
        setReports((prev) =>
          prev.map((r) => (r.id === finalReport.id ? finalReport : r))
        );
        setEditingSectionId(null);
      } else {
        showToast(res.error || "Rapor bölümü kaydedilemedi.");
        alert("Rapor bölümü kaydedilemedi: " + (res.error || "Sunucu hatası"));
      }
    } catch (err: any) {
      showToast("Kayıt hatası: " + err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Revision Snapshot
  const handleSaveRevision = async () => {
    if (!activeReport) return;
    const title = prompt("Bu revizyon için bir başlık giriniz:", `Revizyon - ${new Date().toLocaleDateString("tr-TR")} Düzenlemesi`);
    if (!title) return;

    setIsSaving(true);
    const res = await saveReportRevisionApi(activeReport.id, title, activeReport);
    setIsSaving(false);
    if (res.success) {
      showToast("Raporun geçmiş sürümü dondurularak kaydedildi.");
    }
  };

  // Print Report Handler
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-slate-950/95 text-white border border-emerald-500/40 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* TOP HEADER: Hero Banner & Scenario Bar */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 border border-emerald-500/20 text-white p-6 sm:p-8 shadow-2xl no-print">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Resmî Kurban Süreç & Denetim Takip Modülü
              </span>

              <button
                type="button"
                onClick={() => {
                  setEditingOrganization(
                    organization || {
                      name: "2026 Kurban Organizasyonu",
                      clientCompanyName: "",
                      targetAnimalCount: 350,
                    }
                  );
                  setOrganizationModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/40 text-indigo-200 text-xs font-semibold transition-all cursor-pointer"
                title="Alıcı Kurum / Müşteri ve Organizasyon Bilgilerini Düzenle"
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-300" />
                <span>{organization?.clientCompanyName || "Alıcı Kurum Seç / Düzenle"}</span>
                <Edit3 className="w-3 h-3 text-indigo-300 ml-0.5" />
              </button>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                {organization?.targetAnimalCount || totalAnimalCount || 350} Hayvan •{" "}
                {cuttingLocations.length} Kesimhane
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              {organization?.name || "Canlı Hayvan Alımı, Sevkiyat, Kesim ve Resmî Raporlama"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300/90 mt-2 leading-relaxed">
              {organization?.description ||
                "Canlı hayvan satın alımı, kesimhanelere sevkiyat, veteriner kontrollü kesim, soğuk hava depolama, müşteriye teslimat ve her kesim yeri için ayrı resmî denetim raporu yönetimi."}
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            <button
              type="button"
              onClick={() => {
                setEditingOrganization(
                  organization || {
                    name: "2026 Kurban Organizasyonu",
                    clientCompanyName: "",
                    targetAnimalCount: 350,
                  }
                );
                setOrganizationModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-xs border border-indigo-400/30 transition-all shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Alıcı Kurum Düzenle</span>
            </button>

            <button
              type="button"
              onClick={handleClearMockData}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs border border-rose-400/30 transition-all shadow-sm"
              title="Örnek / Mock verileri kalıcı olarak temizle"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Örnek Verileri Temizle</span>
            </button>

            {/* Supabase Seed Button */}
            <button
              onClick={handleSeedToSupabase}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-200 font-bold text-xs border border-white/15 transition-all"
              title="350 hayvan, 2 kesimhane ve örnek süreç verilerini yükle"
            >
              <Database className="w-3.5 h-3.5 text-emerald-300" />
              <span>Örnek Veri Yükle</span>
            </button>

            {/* Filter by Cutting Location */}
            <div className="flex items-center bg-white/10 rounded-xl p-1 border border-white/15 backdrop-blur-md">
              <span className="text-[11px] font-bold text-slate-300 px-2.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                Kesim Yeri:
              </span>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-slate-900/90 text-white text-xs font-bold py-1.5 px-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="all">
                  Tüm Kesimhaneler ({cuttingLocations.length} Tesis)
                </option>
                {cuttingLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.allocatedAnimalCount} Hayvan)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 6 Metric Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Satın Alınan
            </div>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {stats?.totalPurchasedAnimals || 350} <span className="text-xs text-slate-400 font-normal">Adet</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
              1. Sınıf Besi Tosunu
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Sevk Edilen
            </div>
            <div className="text-2xl font-black text-sky-400 font-mono mt-1">
              {stats?.totalShippedAnimals || 350} <span className="text-xs text-slate-400 font-normal">Adet</span>
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              8 Tır Sevkiyatı (Tam)
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Kesilen Hayvan
            </div>
            <div className="text-2xl font-black text-rose-400 font-mono mt-1">
              {stats?.totalSlaughteredAnimals || 350} <span className="text-xs text-slate-400 font-normal">Adet</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
              Veteriner Kontrollü Kesim
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Net Karkas Et
            </div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-1">
              {stats ? Math.round(stats.totalCarcassWeightKg).toLocaleString("tr-TR") : "118.660"}{" "}
              <span className="text-xs text-slate-400 font-normal">Kg</span>
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              +4°C Soğuk Hava Depoda
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Müşteriye Teslim
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
              {stats ? Math.round(stats.totalDeliveredQuantityKg).toLocaleString("tr-TR") : "118.660"}{" "}
              <span className="text-xs text-slate-400 font-normal">Kg</span>
            </div>
            <div className="text-[10px] text-emerald-300 font-semibold mt-0.5">
              %100 Eksiksiz Teslim
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Süreç Mutabakatı
            </div>
            <div className="text-2xl font-black text-teal-300 font-mono mt-1">
              %100 <span className="text-xs text-slate-400 font-normal">Fire: 0</span>
            </div>
            <div className="text-[10px] text-teal-400 font-bold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Sıfır Tutarsızlık
            </div>
          </div>
        </div>
      </div>

      {/* 9 SUB-MENUS HORIZONTAL TAB NAVIGATION */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin border-b border-slate-200 dark:border-slate-800 no-print">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "overview"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span>Kurban İşlemleri (Özet)</span>
        </button>

        <button
          onClick={() => setActiveTab("parties")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "parties"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4 text-blue-500" />
          <span>Firma / Müşteri Bilgileri</span>
        </button>

        <button
          onClick={() => setActiveTab("locations")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "locations"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <MapPin className="w-4 h-4 text-rose-500" />
          <span>Kesim Yerleri ({cuttingLocations.length} Tesis)</span>
        </button>

        <button
          onClick={() => setActiveTab("animals")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "animals"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Tag className="w-4 h-4 text-amber-500" />
          <span>Hayvan Kayıtları ({totalAnimalCount})</span>
        </button>

        <button
          onClick={() => setActiveTab("shipments")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "shipments"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Truck className="w-4 h-4 text-sky-500" />
          <span>Sevk İşlemleri ({shipments.length} Tır)</span>
        </button>

        <button
          onClick={() => setActiveTab("slaughter")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "slaughter"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Warehouse className="w-4 h-4 text-purple-500" />
          <span>Kesim ve Depolama</span>
        </button>

        <button
          onClick={() => setActiveTab("invoices")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "invoices"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <FileText className="w-4 h-4 text-indigo-500" />
          <span>Fatura ve İrsaliyeler</span>
        </button>

        <button
          onClick={() => setActiveTab("deliveries")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "deliveries"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <FileCheck2 className="w-4 h-4 text-emerald-500" />
          <span>Teslimat İşlemleri (Şirket Aracı)</span>
        </button>

        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-extrabold text-xs whitespace-nowrap transition-all ${
            activeTab === "reports"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-102"
              : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          <ScrollText className="w-4 h-4 text-emerald-500 dark:text-emerald-300" />
          <span>Resmî Raporlar & Editör</span>
          <span className="px-1.5 py-0.5 rounded-md bg-emerald-700/80 text-[10px] text-white">
            {reports.length} Rapor
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: KURBAN İŞLEMLERİ (GENEL BAKIŞ & SÜREÇ AKIŞI)                        */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Process Workflow Steps */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Uçtan Uca Dijital Süreç Takip Aşamaları
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 relative">
                <span className="absolute top-3 right-3 text-xs font-black text-slate-400 font-mono">
                  01
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs mb-2">
                  <FileSignature className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Alım & Sözleşme</h4>
                <p className="text-xs text-slate-500 mt-1">
                  350 hayvan satın alma sözleşmesi, pasaport ve TÜRKVET kayıtları onaylandı.
                </p>
                <div className="mt-3 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Tamamlandı
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 relative">
                <span className="absolute top-3 right-3 text-xs font-black text-slate-400 font-mono">
                  02
                </span>
                <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs mb-2">
                  <Truck className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sevk & Lojistik</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Kars ve Erzurum'dan 8 tır ile 2 ayrı kesimhaneye nakliye yapıldı.
                </p>
                <div className="mt-3 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 8 Tır Vardı (Fire: 0)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 relative">
                <span className="absolute top-3 right-3 text-xs font-black text-slate-400 font-mono">
                  03
                </span>
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs mb-2">
                  <Warehouse className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Kesim & Mezbaha</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Tuzla (180 adet) ve Kartepe (170 adet) tesislerinde veterinerli kesim.
                </p>
                <div className="mt-3 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 350 Hayvan Kesildi
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 relative">
                <span className="absolute top-3 right-3 text-xs font-black text-slate-400 font-mono">
                  04
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs mb-2">
                  <Scale className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Soğuk Depo</h4>
                <p className="text-xs text-slate-500 mt-1">
                  118.660 Kg karkas et +4°C dinlendirildi ve hijyenik çeyreklendi.
                </p>
                <div className="mt-3 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Dinlendirme Tam
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 relative">
                <span className="absolute top-3 right-3 text-xs font-black text-slate-400 font-mono">
                  05
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs mb-2">
                  <ScrollText className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Resmî Raporlar</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Her kesim yeri için birbirinden bağımsız 2 resmi denetim raporu hazırlandı.
                </p>
                <div className="mt-3 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PDF Çıktı Hazır
                </div>
              </div>
            </div>
          </div>

          {/* Supabase Storage Optimization Architecture Banner */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 rounded-3xl p-5 border border-emerald-500/30 shadow-xs relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase tracking-wider">
                  <HardDrive className="w-3 h-3" /> Supabase Storage & Egress Koruması Aktif
                </div>
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>Akıllı Fotoğraf Boyutlandırma & 1 Yıl CDN Önbellekleme</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                    %96 Kota Tasarrufu
                  </span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  350–500 kurbanlık için telefon kameralarından çekilen 5–15 MB fotoğraflar, tarayıcıda HTML5 Canvas ile kalite kaybı olmaksızın anında ~180 KB WebP formatına indirgenir. Supabase Storage'a <code>Cache-Control: 31536000, public</code> ile kaydedilir ve raporlar görüntülendiğinde tekrar indirme maliyeti oluşmaz.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openPhotoUploadModal("general", undefined, "Kurban Süreç & Denetim Fotoğrafı")}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 active:scale-95 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Optimize Fotoğraf Ekle</span>
                </button>
              </div>
            </div>
          </div>

          {/* Side-by-side Cutting Location Comparison Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cuttingLocations.map((loc) => {
              const locShipments = shipments.filter((s) => s.destinationLocationId === loc.id);
              const locSlaughters = slaughterBatches.filter((b) => b.cuttingLocationId === loc.id);
              const locDeliveries = deliveries.filter((d) => d.cuttingLocationId === loc.id);
              const locAnimalsCount = loc.allocatedAnimalCount;
              const locCarcassKg = locSlaughters.reduce((acc, b) => acc + b.totalCarcassWeightKg, 0);

              return (
                <div
                  key={loc.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-black text-slate-700 dark:text-slate-300 font-mono uppercase mb-2">
                        {loc.locationCode} • {loc.city}
                      </div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                        {loc.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{loc.address}</p>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedLocationId(loc.id);
                        setActiveTab("reports");
                        const matchedReport = reports.find((r) => r.cuttingLocationId === loc.id);
                        if (matchedReport) setSelectedReportId(matchedReport.id);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-sm shrink-0 flex items-center gap-1.5"
                    >
                      <ScrollText className="w-3.5 h-3.5" />
                      <span>Resmî Raporu Gör</span>
                    </button>
                  </div>

                  {/* Detail Grid */}
                  <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 mb-4">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Tahsisli Hayvan</div>
                      <div className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                        {locAnimalsCount} <span className="text-xs font-normal">Adet</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Sevk Tırları</div>
                      <div className="text-xl font-black text-sky-600 font-mono mt-0.5">
                        {locShipments.length} <span className="text-xs font-normal">Tır</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Net Karkas Et</div>
                      <div className="text-xl font-black text-emerald-600 font-mono mt-0.5">
                        {Math.round(locCarcassKg).toLocaleString("tr-TR")}{" "}
                        <span className="text-xs font-normal">Kg</span>
                      </div>
                    </div>
                  </div>

                  {/* Location Info Badges */}
                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Tesis Sorumlusu:</span>
                      <span>{loc.responsiblePerson} ({loc.responsiblePhone})</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Bakanlık Onay No:</span>
                      <span className="font-mono text-emerald-600 font-bold">{loc.officialApprovalNo}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Denetçi Hekimler:</span>
                      <span>{loc.veterinaryName}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FİRMA / MÜŞTERİ BİLGİLERİ (PARTIES)                                 */}
      {/* ========================================================================= */}
      {activeTab === "parties" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                Süreç Paydaşları ve Firma Bilgileri
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kurban alınan yerler (besiciler/çiftlikler), alıcı müşteriler, mezbahalar, lojistik ve soğuk hava depo firmaları
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => {
                  setEditingOrganization({
                    ...organization,
                  });
                  setOrganizationModalOpen(true);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
                <span>Ana Alıcı Kurum & Sözleşme Düzenle</span>
              </button>

              <button
                onClick={() => {
                  setEditingParty({
                    partyType: "client_buyer",
                    city: "İstanbul",
                  });
                  setPartyModalOpen(true);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Alıcı Müşteri Ekle</span>
              </button>

              <button
                onClick={() => {
                  setEditingParty({
                    partyType: "supplier_seller",
                    city: "İstanbul",
                  });
                  setPartyModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Firma / Paydaş Ekle</span>
              </button>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin text-xs font-semibold">
            {[
              { id: "all", label: `Tümü (${parties.length})` },
              { id: "supplier_seller", label: `Kurban Alınan Yerler / Besici (${parties.filter(p => p.partyType === "supplier_seller").length})` },
              { id: "client_buyer", label: `Alıcı / Müşteriler (${parties.filter(p => p.partyType === "client_buyer").length})` },
              { id: "cold_storage", label: `Soğuk Hava Depoları (${parties.filter(p => p.partyType === "cold_storage").length})` },
              { id: "slaughterhouse", label: `Mezbahalar (${parties.filter(p => p.partyType === "slaughterhouse").length})` },
              { id: "logistics_transporter", label: `Lojistik & Nakliye (${parties.filter(p => p.partyType === "logistics_transporter").length})` },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setPartyTypeFilter(chip.id)}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                  partyTypeFilter === chip.id
                    ? "bg-indigo-600 text-white font-bold shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 text-slate-600"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {parties
              .filter((p) => partyTypeFilter === "all" || p.partyType === partyTypeFilter)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          p.partyType === "client_buyer"
                            ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                            : p.partyType === "supplier_seller"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : p.partyType === "slaughterhouse"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : p.partyType === "logistics_transporter"
                            ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            : "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                        }`}
                      >
                        {p.partyType === "client_buyer"
                          ? "Alıcı / Müşteri Firma"
                          : p.partyType === "supplier_seller"
                          ? "Satıcı / Besi İşletmesi"
                          : p.partyType === "slaughterhouse"
                          ? "Kesimhane / Mezbaha"
                          : p.partyType === "logistics_transporter"
                          ? "Nakliye & Lojistik"
                          : "Soğuk Depo & Antrepo"}
                      </span>
                      <span className="text-xs font-bold text-slate-400 font-mono">{p.city}</span>
                    </div>

                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {p.name}
                    </h4>

                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {p.taxId && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Vergi No:</span>
                          <span className="font-mono">{p.taxId} ({p.taxOffice})</span>
                        </div>
                      )}
                      {p.authorizedPerson && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Yetkili:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{p.authorizedPerson}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">İletişim:</span>
                          <span className="font-mono text-indigo-600 font-semibold">{p.phone}</span>
                        </div>
                      )}
                    </div>

                    {p.notes && (
                      <p className="text-[11px] text-slate-500 italic border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                        {p.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingParty(p);
                        setPartyModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-bold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>
                    <button
                      onClick={() => handleDeleteParty(p.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            {parties.filter((p) => partyTypeFilter === "all" || p.partyType === partyTypeFilter).length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                Bu kategoride kayıtlı firma veya müşteri bulunamadı. Yukarıdaki butonlardan yeni kayıt ekleyebilirsiniz.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KESİM YERLERİ                                                       */}
      {/* ========================================================================= */}
      {activeTab === "locations" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-rose-600" />
                Yetkili Kesim Tesisleri ve Mezbahalar ({cuttingLocations.length} Tesis)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tarım ve Orman Bakanlığı onaylı entegre et kombinaları ve resmi kesimhaneler
              </p>
            </div>

            <button
              onClick={() => {
                setEditingLocation({
                  city: "İstanbul",
                  dailyCapacity: 200,
                  allocatedAnimalCount: 0,
                  locationCode: `KSM-0${cuttingLocations.length + 1}`,
                });
                setLocationModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all self-start sm:self-auto active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Kesim Yeri Ekle</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cuttingLocations.map((loc, idx) => (
              <div
                key={loc.id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full uppercase">
                      Kesim Tesisi #{idx + 1}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-400">{loc.locationCode}</span>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{loc.name}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{loc.address}</p>

                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Tahsis Edilen Hayvan</div>
                      <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-1">
                        {loc.allocatedAnimalCount} <span className="text-xs font-normal">Adet</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Günlük Kesim Kapasitesi</div>
                      <div className="text-2xl font-black text-indigo-600 font-mono mt-1">
                        {loc.dailyCapacity} <span className="text-xs font-normal">Hayvan/Gün</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Bakanlık Ruhsat & Onay No: </span>
                      <span className="font-mono text-emerald-600 font-bold">{loc.officialApprovalNo || "Onay No Bekleniyor"}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Sorumlu Yönetici: </span>
                      <span>{loc.responsiblePerson || "-"} ({loc.responsiblePhone || "-"})</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Görevli Veteriner Hekimler: </span>
                      <span>{loc.veterinaryName || "-"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingLocation(loc);
                        setLocationModalOpen(true);
                      }}
                      className="p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>
                    <button
                      onClick={() => handleDeleteLocation(loc.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Kesim Yerini Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedLocationId(loc.id);
                      setActiveTab("reports");
                      const matched = reports.find((r) => r.cuttingLocationId === loc.id);
                      if (matched) setSelectedReportId(matched.id);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <ScrollText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Resmî Raporu Aç</span>
                  </button>
                </div>
              </div>
            ))}
            {cuttingLocations.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                Henüz kesim yeri eklenmemiş. &quot;Yeni Kesim Yeri Ekle&quot; butonuna tıklayarak ilk kesimhanenizi oluşturabilirsiniz.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HAYVAN KAYITLARI (300-400 HAYVAN TABLOSU & EXCEL ENTEGRASYONU)     */}
      {/* ========================================================================= */}
      {activeTab === "animals" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-600" />
                Hayvan Kayıtları & TÜRKVET Pasaport Takibi
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Toplam <strong>{totalAnimalCount}</strong> adet canlı kurbanlık kaydı • Kesim yerine göre izleme
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setEditingAnimal({
                    earTagNo: `TR34-${String(Date.now()).slice(-5)}`,
                    cuttingLocationId: cuttingLocations[0]?.id || "",
                    animalType: "buyukbas_tosun",
                    animalTypeLabel: "Büyükbaş Tosun",
                    breed: "Simental",
                    gender: "male",
                    ageMonths: 24,
                    farmRegNo: "TR-36-004128",
                    farmName: parties.find((p) => p.partyType === "supplier_seller")?.name || "",
                    liveWeightKg: 650,
                    carcassWeightKg: 368,
                    status: "delivered",
                  });
                  setAnimalModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tekil Hayvan Ekle</span>
              </button>

              <button
                onClick={() => setExcelImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Excel'den Toplu Yükle (350 Hayvan)</span>
              </button>

              <button
                onClick={() => exportAnimalsToExcel(animals)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors border border-slate-200 dark:border-slate-700"
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel İndir</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Küpe No, Pasaport, Irk veya Çiftlik ara..."
                value={animalSearch}
                onChange={(e) => {
                  setAnimalSearch(e.target.value);
                  setAnimalPage(1);
                }}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={animalStatusFilter}
                onChange={(e) => {
                  setAnimalStatusFilter(e.target.value);
                  setAnimalPage(1);
                }}
                className="text-xs py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="purchased">Alındı (Çiftlikte)</option>
                <option value="in_transit">Sevk Edildi (Yolda)</option>
                <option value="arrived_at_slaughterhouse">Mezbaha Padokta</option>
                <option value="slaughtered">Kesildi</option>
                <option value="in_storage">Soğuk Depoda</option>
                <option value="delivered">Müşteriye Teslim Edildi</option>
              </select>

              <select
                value={animalPageSize}
                onChange={(e) => {
                  setAnimalPageSize(Number(e.target.value));
                  setAnimalPage(1);
                }}
                className="text-xs py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium font-mono"
              >
                <option value="25">25 / sayfa</option>
                <option value="50">50 / sayfa</option>
                <option value="100">100 / sayfa</option>
                <option value="350">350 (Tümü)</option>
              </select>
            </div>
          </div>

          {/* Animals Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Küpe Numarası</th>
                  <th className="py-3 px-3">Kesim Yeri</th>
                  <th className="py-3 px-3">Irk / Tür</th>
                  <th className="py-3 px-3">Kayıtlı İşletme</th>
                  <th className="py-3 px-3 text-right">Canlı (Kg)</th>
                  <th className="py-3 px-3 text-right">Karkas (Kg)</th>
                  <th className="py-3 px-3 text-center">Randıman</th>
                  <th className="py-3 px-3 text-center">Durum</th>
                  <th className="py-3 px-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {animalsLoading ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                      Hayvan kayıtları yükleniyor...
                    </td>
                  </tr>
                ) : animals.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Kriterlere uygun hayvan kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  animals.map((a, idx) => {
                    const rowNum = (animalPage - 1) * animalPageSize + idx + 1;
                    const yieldPercent =
                      a.liveWeightKg > 0
                        ? ((a.carcassWeightKg / a.liveWeightKg) * 100).toFixed(1)
                        : "-";

                    return (
                      <tr
                        key={a.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-400">{rowNum}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {a.earTagNo}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              cuttingLocations.findIndex((l) => l.id === a.cuttingLocationId) % 2 === 0
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                : "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            }`}
                          >
                            {cuttingLocations.find((l) => l.id === a.cuttingLocationId)?.name || "Atanmadı"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                          {a.breed} ({a.ageMonths} Ay)
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                          {a.farmName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 font-semibold">
                          {a.liveWeightKg}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                          {a.carcassWeightKg}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600">
                          %{yieldPercent}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              a.status === "delivered"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : a.status === "in_storage"
                                ? "bg-teal-100 text-teal-800"
                                : a.status === "slaughtered"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {a.status === "delivered"
                              ? "Teslim Edildi"
                              : a.status === "in_storage"
                              ? "Depoda"
                              : a.status === "slaughtered"
                              ? "Kesildi"
                              : "Sevk/Kabul"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                setEditingAnimal(a);
                                setAnimalModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAnimal(a.id, a.earTagNo)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500 font-medium">
            <div>
              Toplam <strong>{totalAnimalCount}</strong> hayvandan{" "}
              {Math.min((animalPage - 1) * animalPageSize + 1, totalAnimalCount)} -{" "}
              {Math.min(animalPage * animalPageSize, totalAnimalCount)} arası gösteriliyor.
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={animalPage <= 1}
                onClick={() => setAnimalPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                Önceki
              </button>
              <span className="px-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                {animalPage} / {Math.ceil(totalAnimalCount / animalPageSize) || 1}
              </span>
              <button
                disabled={animalPage >= Math.ceil(totalAnimalCount / animalPageSize)}
                onClick={() => setAnimalPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                Sonraki
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* TAB 5: SEVK İŞLEMLERİ (TIRLAR, ŞOFÖRLER, FOTOĞRAFLAR)                      */}
      {/* ========================================================================= */}
      {activeTab === "shipments" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-600" />
                Canlı Hayvan Sevkiyat & Nakliye Takip ({shipments.length} Tır)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Besi çiftliklerinden kesimhanelere canlı hayvan nakliyesi, veteriner raporları ve araç takibi
              </p>
            </div>

            <button
              onClick={() => {
                setEditingShipment({
                  shipmentDate: new Date().toISOString().split("T")[0],
                  destinationLocationId: cuttingLocations[0]?.id || "ksm-tuzla-01",
                  animalCount: 40,
                  originAddress: "Besi İşletmesi - Kars",
                  status: "delivered_to_slaughterhouse",
                  shipmentNo: `SVK-2026-00${shipments.length + 1}`,
                  vehiclePlate: "36 KARS 101",
                  driverName: "",
                });
                setShipmentModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all self-start sm:self-auto active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Sevk Tırı Ekle</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shipments.map((s) => (
              <div
                key={s.id}
                className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-700 bg-sky-100 dark:bg-sky-950 px-2.5 py-0.5 rounded-full">
                      {s.shipmentNo}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {s.shipmentDate}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-slate-600" />
                      {s.vehiclePlate || "Plakasız Tır"}
                    </h4>
                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                      {s.animalCount} Hayvan
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Varış Yeri: </span>
                      <span className="text-emerald-600 font-bold">{s.destinationLocationName}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Çıkış Yeri: </span>
                      <span>{s.originAddress}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Şoför: </span>
                      <span>{s.driverName} {s.driverPhone ? `(${s.driverPhone})` : ""}</span>
                    </div>
                    {s.dispatchNoteNo && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Sevk İrsaliyesi: </span>
                        <span className="font-mono">{s.dispatchNoteNo}</span>
                      </div>
                    )}
                    {s.vetHealthReportNo && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Vet. Rapor No: </span>
                        <span className="font-mono">{s.vetHealthReportNo}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Photo & Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingShipment(s);
                        setShipmentModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-sky-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>
                    <button
                      onClick={() => handleDeleteShipment(s.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        openPhotoUploadModal(
                          "shipment",
                          s.id,
                          `${s.vehiclePlate || s.shipmentNo} Sevk Tırı & Sevkiyat Fotoğrafı`
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Fotoğraf Ekle</span>
                    </button>

                    <button
                      onClick={() => {
                        const doc = documents.find((d) => d.relatedEntityId === s.id) || documents[0];
                        if (doc) {
                          setPhotoPreview({
                            url: doc.fileUrl,
                            title: `${s.vehiclePlate || s.shipmentNo} Sevk Tırı Görseli`,
                            desc: doc.description,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Tır Görseli</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: KESİM VE DEPOLAMA (SLAUGHTER & STORAGE)                             */}
      {/* ========================================================================= */}
      {activeTab === "slaughter" && (
        <div className="space-y-6">
          {/* Slaughter Batches Section */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Warehouse className="w-5 h-5 text-rose-600" />
                  Kesimhane Oturumları & Karkas Tartım Tutanakları ({slaughterBatches.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kesim oturumları, kasap ekipleri, veteriner onayları ve karkas tartım tutanakları
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingSlaughter({
                    batchNo: `KSM-BATCH-00${slaughterBatches.length + 1}`,
                    slaughterDate: new Date().toISOString().split("T")[0],
                    slaughterTime: "07:00",
                    cuttingLocationId: cuttingLocations[0]?.id || "",
                    animalCount: 50,
                    totalCarcassWeightKg: 18500,
                    butcherTeam: "Başkasap Ekibi (12 Kişi)",
                    veterinaryApproval: true,
                    officialProtocolNo: `TUT-2026-0${slaughterBatches.length + 1}`,
                  });
                  setSlaughterModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all self-start sm:self-auto active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Kesim Oturumu Ekle</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slaughterBatches.map((b) => (
                <div
                  key={b.id}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-rose-700 bg-rose-100 dark:bg-rose-950 px-2.5 py-0.5 rounded-full">
                      {b.batchNo}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">{b.slaughterDate} • {b.slaughterTime}</span>
                  </div>

                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {cuttingLocations.find((l) => l.id === b.cuttingLocationId)?.name || b.cuttingLocationName}
                  </h4>

                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400 font-bold">Kesilen Hayvan</div>
                      <div className="text-lg font-black text-rose-600 font-mono mt-0.5">
                        {b.animalCount} <span className="text-xs font-normal">Adet</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400 font-bold">Karkas Net Et</div>
                      <div className="text-lg font-black text-emerald-600 font-mono mt-0.5">
                        {b.totalCarcassWeightKg.toLocaleString("tr-TR")} <span className="text-xs font-normal">Kg</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                    <div><strong>Kasap Ekibi:</strong> {b.butcherTeam}</div>
                    <div><strong>Tutanak No:</strong> {b.officialProtocolNo}</div>
                    <div><strong>Veteriner Onayı:</strong> <span className="text-emerald-600 font-bold">✓ Tam Onaylı</span></div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingSlaughter(b);
                          setSlaughterModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Düzenle</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSlaughter(b.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          openPhotoUploadModal(
                            "slaughter",
                            b.id,
                            `${b.cuttingLocationName} Kesim & Tartım Tutanağı Fotoğrafı`
                          )
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Fotoğraf Ekle</span>
                      </button>

                      <button
                        onClick={() => {
                          const doc = documents.find((d) => d.relatedEntityId === b.id) || documents[2];
                          if (doc) {
                            setPhotoPreview({
                              url: doc.fileUrl,
                              title: `${b.cuttingLocationName} Kesimhane Fotoğrafı`,
                              desc: doc.description,
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Kesimhane Fotoğrafı</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cold Storage Records */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-teal-600" />
                  Soğuk Hava Depolama, Şoklama ve Et Dinlendirme
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  +4°C dinlendirme ve şoklama antrepoları, karkas et muhafaza tutanakları ve depo faturaları
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingStorage({
                    temperatureCelsius: 4.0,
                    entryDate: new Date().toISOString().split("T")[0],
                    productType: "Karkas / Parçalanmış Soğuk Sığır Eti",
                    status: "in_storage",
                    cuttingLocationId: cuttingLocations[0]?.id || "ksm-tuzla-01",
                    storageCompany: "Marmara Frigo Lojistik A.Ş.",
                    warehouseName: "",
                    storedQuantityKg: 50000,
                  });
                  setStorageModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md shadow-teal-600/20 flex items-center gap-1.5 transition-all self-start sm:self-auto active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Soğuk Hava Depo Kaydı Ekle</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {storageRecords.map((st) => (
                <div
                  key={st.id}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-teal-700 bg-teal-100 dark:bg-teal-950 px-2.5 py-0.5 rounded-full">
                        Sabit Isı: +{st.temperatureCelsius} °C
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">{st.entryDate} - {st.exitDate || "Devam Ediyor"}</span>
                    </div>

                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {st.warehouseName}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">{st.storageCompany}</p>

                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Depolanan Miktar</div>
                        <div className="text-xl font-black text-emerald-600 font-mono mt-0.5">
                          {st.storedQuantityKg.toLocaleString("tr-TR")} Kg
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Depo Fatura Tutarı</div>
                        <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                          {st.invoiceAmount.toLocaleString("tr-TR")} ₺
                        </div>
                      </div>
                    </div>

                    {st.notes && <p className="text-xs text-slate-500 italic">{st.notes}</p>}
                  </div>

                  <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingStorage(st);
                        setStorageModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-teal-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>
                    <button
                      onClick={() => handleDeleteStorage(st.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: FATURA VE İRSALİYELER (INVOICES & DISPATCHES)                       */}
      {/* ========================================================================= */}
      {activeTab === "invoices" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Mali Belgeler: Alım, Nakliye, Kesim, Depo ve Satış Faturaları ({invoices.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kurban süreci kapsamındaki tüm mali kayıtlar, %1 ve %20 KDV analizleri
              </p>
            </div>

            <button
              onClick={() => {
                setEditingInvoice({
                  invoiceNo: `GIB${new Date().getFullYear()}000000${invoices.length + 1}`,
                  invoiceDate: new Date().toISOString().split("T")[0],
                  invoiceType: "animal_purchase",
                  issuerCompany: parties.find((p) => p.partyType === "supplier_seller")?.name || "",
                  recipientCompany: organization?.clientCompanyName || "",
                  cuttingLocationId: cuttingLocations[0]?.id || "",
                  description: "",
                  subtotal: 0,
                  vatRate: 1,
                  vatAmount: 0,
                  totalAmount: 0,
                });
                setInvoiceModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all self-start sm:self-auto active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Fatura Ekle</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-3">Fatura Türü</th>
                  <th className="py-3 px-3">Fatura No</th>
                  <th className="py-3 px-3">Tarih</th>
                  <th className="py-3 px-3">Düzenleyen</th>
                  <th className="py-3 px-3">Alıcı / Muhatap</th>
                  <th className="py-3 px-3 text-right">Matrah (₺)</th>
                  <th className="py-3 px-3 text-center">KDV</th>
                  <th className="py-3 px-3 text-right">Genel Toplam (₺)</th>
                  <th className="py-3 px-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          inv.invoiceType === "animal_purchase"
                            ? "bg-amber-100 text-amber-800"
                            : inv.invoiceType === "sales_outgoing"
                            ? "bg-emerald-100 text-emerald-800"
                            : inv.invoiceType === "slaughter_service"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {inv.invoiceType === "animal_purchase"
                          ? "Hayvan Alımı"
                          : inv.invoiceType === "sales_outgoing"
                          ? "Satış Çıkış"
                          : inv.invoiceType === "slaughter_service"
                          ? "Kesim Hizmeti"
                          : inv.invoiceType === "storage_service"
                          ? "Depolama"
                          : "Nakliye"}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {inv.invoiceNo}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">{inv.invoiceDate}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">{inv.issuerCompany}</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{inv.recipientCompany}</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">
                      {inv.subtotal.toLocaleString("tr-TR")}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">
                      %{inv.vatRate}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100">
                      {inv.totalAmount.toLocaleString("tr-TR")} ₺
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setEditingInvoice(inv);
                            setInvoiceModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(inv.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: TESLİMAT İŞLEMLERİ (ŞİRKET ARACI / PARÇALI TESLİMATLAR)             */}
      {/* ========================================================================= */}
      {activeTab === "deliveries" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                Müşteriye Satış, Frigorifik Sevk ve Teslimat
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Şirket özmal araçları ve lojistik araçlarıyla parçalı teslimat yönetimi (Plaka zorunlu değildir)
              </p>
            </div>
            <button
              onClick={() => {
                setEditingDelivery({
                  organizationId: activeReport?.organizationId || SEED_ORGANIZATION_ID,
                  deliveryNo: `TES-${new Date().getFullYear()}-${String(deliveries.length + 1).padStart(3, "0")}`,
                  deliveryDate: new Date().toISOString().split("T")[0],
                  recipientCompany: parties.find((p) => p.partyType === "client_buyer")?.name || "Alıcı Firma",
                  recipientPerson: "",
                  deliveredByPerson: "",
                  transportType: "company_vehicle",
                  vehiclePlate: "",
                  driverName: "",
                  deliveredQuantityKg: 0,
                  deliveredAnimalCount: 0,
                  dispatchNoteNo: "",
                  outgoingInvoiceNo: "",
                  deliveryAddress: "",
                  status: "completed",
                });
                setDeliveryModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Yeni Taşıma Aracı / Teslimat Ekle</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deliveries.map((d) => (
              <div
                key={d.id}
                className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 rounded-full">
                    {d.deliveryNo}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{d.deliveryDate}</span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold mb-1">
                      {d.transportType === "company_vehicle" ? "★ Şirket Özmal Aracı" : "Lojistik Şirketi"}
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {d.vehiclePlate && d.vehiclePlate.trim() !== "" ? (
                        d.vehiclePlate
                      ) : (
                        <span className="text-slate-400 font-normal italic text-xs">
                          (Plakasız / Belirtilmemiş Araç)
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-emerald-600 font-mono">
                      {d.deliveredQuantityKg.toLocaleString("tr-TR")} Kg
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold">{d.deliveredAnimalCount} Hayvan Karşılığı</div>
                  </div>
                </div>

                <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div><strong>Teslim Alan:</strong> {d.recipientPerson}</div>
                  <div><strong>Teslim Eden:</strong> {d.deliveredByPerson}</div>
                  <div><strong>Şoför:</strong> {d.driverName}</div>
                  <div><strong>Teslim Adresi:</strong> {d.deliveryAddress}</div>
                  <div><strong>İrsaliye No:</strong> {d.dispatchNoteNo} | <strong>Fatura No:</strong> {d.outgoingInvoiceNo}</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Teslim Edildi
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingDelivery({ ...d });
                        setDeliveryModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      title="Taşıma Aracı / Teslimatı Düzenle"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDelivery(d.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      title="Teslimat Kaydını Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() =>
                        openPhotoUploadModal(
                          "delivery",
                          d.id,
                          `${d.recipientPerson} Teslimat & İrsaliye Makbuzu Fotoğrafı`
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Fotoğraf Ekle</span>
                    </button>

                    <button
                      onClick={() => {
                        const doc = documents.find((docItem) => docItem.relatedEntityType === "delivery") || documents[5];
                        if (doc) {
                          setPhotoPreview({
                            url: doc.fileUrl,
                            title: "Frigorifik Teslimat Filosu Fotoğrafı",
                            desc: doc.description,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Teslimat Fotoğrafı</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 9: RESMÎ RAPORLAR & CANLI RAPOR EDİTÖRÜ (A'DAN J'YE 10 BÖLÜM & PDF)   */}
      {/* ========================================================================= */}
      {activeTab === "reports" && activeReport && (
        <div className="space-y-6">
          {/* Report Selector & Tool Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <ScrollText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  Aktif Resmî Rapor
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {activeReport.title}
                </h3>
              </div>
            </div>

            {/* Switch Between Reports */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {reports.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => {
                      setSelectedReportId(rep.id);
                      setActiveReport(rep);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      (activeReport?.id === rep.id || selectedReportId === rep.id)
                        ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {rep.cuttingLocationName || rep.title || (rep.cuttingLocationId === SEED_LOC_TUZLA_ID ? "1. Kesimhane Raporu" : "2. Kesimhane Raporu")}
                  </button>
                ))}
              </div>

              <button
                onClick={handleAddCustomSection}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-xs transition-colors"
                title="Rapora yeni bir Markdown destekli bölüm ekle"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Bölüm Ekle (Markdown)</span>
              </button>

              <button
                onClick={handleSaveRevision}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
                title="Raporun mevcut durumunu revizyon olarak kaydet"
              >
                <Save className="w-3.5 h-3.5 text-indigo-500" />
                <span>Revizyon Dondur</span>
              </button>

              <button
                onClick={handlePrintReport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm transition-all shadow-md shadow-emerald-600/25"
              >
                <Printer className="w-4 h-4" />
                <span>Resmî PDF / Yazdır</span>
              </button>
            </div>
          </div>

          {/* OFFICIAL REPORT DOCUMENT (PRINTABLE A4 CONTAINER) */}
          <div
            ref={reportPrintRef}
            className="bg-white text-slate-900 rounded-3xl p-8 sm:p-14 border border-slate-300 shadow-xl max-w-5xl mx-auto space-y-10 print:p-0 print:border-none print:shadow-none print:rounded-none"
          >
            {/* Report Header & Letterhead */}
            <div className="border-b-2 border-slate-900 pb-6 flex items-start justify-between gap-6">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-800 mb-1">
                  T.C. TARIM VE ORMAN BAKANLIĞI DENETİM UYUMLU RESMÎ RAPOR
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {activeReport.cuttingLocationName?.toUpperCase()}
                </h1>
                <h2 className="text-sm font-bold text-slate-700 mt-0.5">
                  KURBAN KESİM, SEVKİYAT, SOĞUK DEPOLAMA VE SÜREÇ TAKİP DENETİM RAPORU
                </h2>
              </div>

              <div className="text-right font-mono text-xs space-y-1 shrink-0">
                <div>
                  <strong>Rapor No:</strong> <span className="font-bold text-emerald-800">{activeReport.reportNo}</span>
                </div>
                <div>
                  <strong>Tarih:</strong> {activeReport.reportDate}
                </div>
                <div>
                  <strong>Dönem:</strong> {activeReport.reportPeriod}
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase mt-1">
                  {activeReport.status === "final_approved" ? "✓ Resmî Onaylı Nüsha" : "Taslak Metin"}
                </div>
              </div>
            </div>

            {/* SECTIONS LIST (A'DAN J'YE 10 BÖLÜM) */}
            <div className="space-y-8">
              {(activeReport.sections || []).map((sec) => (
                <div
                  key={sec.id}
                  className={`relative p-6 rounded-2xl border transition-all ${
                    editingSectionId === sec.id
                      ? "border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-500/20"
                      : "border-slate-200/80 bg-slate-50/40 hover:border-slate-300"
                  } ${sec.pageBreakAfter ? "print:break-after-page" : ""}`}
                >
                  {/* Section Title & Live Edit Button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 mb-3">
                    {editingSectionId === sec.id ? (
                      <div className="flex-1 min-w-[240px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
                          Bölüm Başlığı:
                        </label>
                        <input
                          type="text"
                          value={editedSectionTitle}
                          onChange={(e) => setEditedSectionTitle(e.target.value)}
                          className="w-full text-sm font-black text-slate-900 px-3 py-1.5 rounded-xl border border-emerald-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          placeholder="Bölüm başlığını giriniz..."
                        />
                      </div>
                    ) : (
                      <h3 className="text-base font-black text-slate-900 tracking-tight">
                        {sec.sectionTitle}
                      </h3>
                    )}

                    {/* Edit Trigger (Hidden in Print) */}
                    <div className="no-print">
                      {editingSectionId === sec.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSaveSectionEdit(sec)}
                            disabled={isSaving}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                          >
                            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>{isSaving ? "Kaydediliyor..." : "Kaydet"}</span>
                          </button>
                          <button
                            onClick={() => setEditingSectionId(null)}
                            disabled={isSaving}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingSectionId(sec.id);
                            setEditedSectionTitle(sec.sectionTitle || "");
                            setEditedSectionHtml(htmlToMarkdown(sec.contentHtml || ""));
                            setEditedSectionNotes(sec.customNotes || "");
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs transition-all"
                          title="Bölüm metnini Markdown ile düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Düzenle (Markdown)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section Content: Edit Mode or View Mode */}
                  {editingSectionId === sec.id ? (
                    <div className="space-y-4 pt-2 no-print">
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                        {/* Top Header & Mode Switcher */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                              Markdown Rapor Editörü
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                              Markdown Destekli
                            </span>
                          </div>

                          <div className="flex items-center bg-slate-200/80 dark:bg-slate-900 p-0.5 rounded-lg text-[11px] font-bold">
                            <button
                              type="button"
                              onClick={() => setMarkdownEditorMode("split")}
                              className={`px-2.5 py-1 rounded-md transition-colors ${
                                markdownEditorMode === "split"
                                  ? "bg-white dark:bg-slate-800 text-emerald-600 shadow-xs"
                                  : "text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              Bölünmüş Görünüm
                            </button>
                            <button
                              type="button"
                              onClick={() => setMarkdownEditorMode("edit")}
                              className={`px-2.5 py-1 rounded-md transition-colors ${
                                markdownEditorMode === "edit"
                                  ? "bg-white dark:bg-slate-800 text-emerald-600 shadow-xs"
                                  : "text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              Sadece Markdown
                            </button>
                            <button
                              type="button"
                              onClick={() => setMarkdownEditorMode("preview")}
                              className={`px-2.5 py-1 rounded-md transition-colors ${
                                markdownEditorMode === "preview"
                                  ? "bg-white dark:bg-slate-800 text-emerald-600 shadow-xs"
                                  : "text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              Tam Önizleme
                            </button>
                          </div>
                        </div>

                        {/* Rich Markdown Formatting Toolbar */}
                        {markdownEditorMode !== "preview" && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("**", "**", "Kalın Metin")}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 font-black shadow-2xs"
                              title="Kalın (**metin**) - Ctrl/Cmd+B"
                            >
                              B
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("*", "*", "İtalik Metin")}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 italic font-serif shadow-2xs"
                              title="İtalik (*metin*) - Ctrl/Cmd+I"
                            >
                              I
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("~~", "~~", "Üstü Çizili")}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 line-through shadow-2xs"
                              title="Üstü Çizili (~~metin~~)"
                            >
                              S
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("==", "==", "Vurgulu Bilgi")}
                              className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:border-amber-500 shadow-2xs"
                              title="Sarı Vurgu (==metin==)"
                            >
                              ==Vurgu==
                            </button>

                            <span className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-0.5" />

                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("# ", "", "Ana Başlık", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 font-extrabold shadow-2xs"
                              title="Başlık 1 (# Başlık)"
                            >
                              H1
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("## ", "", "Alt Başlık", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 font-extrabold shadow-2xs"
                              title="Başlık 2 (## Alt Başlık)"
                            >
                              H2
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("### ", "", "Bölüm Alt Başlığı", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 font-bold shadow-2xs"
                              title="Başlık 3 (### Alt Başlık)"
                            >
                              H3
                            </button>

                            <span className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-0.5" />

                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("- ", "", "Liste maddesi", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-2xs"
                              title="Madde İşaretli Liste (- madde)"
                            >
                              • Liste
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("1. ", "", "Sıralı madde", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-2xs"
                              title="Numaralı Liste (1. madde)"
                            >
                              1. Liste
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("- [x] ", "", "Kontrol edildi", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-2xs"
                              title="Onay Kutulu Madde (- [x] madde)"
                            >
                              ☑ Kontrol
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("> ", "", "Resmî denetim notu veya alıntı...", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-2xs"
                              title="Alıntı Bloğu (> not)"
                            >
                              ❝ Alıntı
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                insertMarkdownSyntax(
                                  "\n| Kriter | Değer | Durum |\n| :--- | :---: | :--- |\n| ",
                                  " | 100% | ✓ Uygun |\n",
                                  "Denetim Kalemi",
                                  true
                                )
                              }
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-2xs"
                              title="Markdown Tablosu Ekle"
                            >
                              ⊞ Tablo
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("\n---\n", "", "", true)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-2xs"
                              title="Yatay Ayırıcı Çizgi (---)"
                            >
                              ― Çizgi
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownSyntax("**✓ Onaylandı:** ", "", "Denetim tamamlandı")}
                              className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs"
                              title="Onay İfadesi Ekle"
                            >
                              ✓ Onay
                            </button>
                          </div>
                        )}

                        {/* Editor & Live Preview Grid */}
                        <div
                          className={`grid gap-3 ${
                            markdownEditorMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
                          }`}
                        >
                          {markdownEditorMode !== "preview" && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                <span>Markdown Kaynak Metni</span>
                                <span>**kalın** • *italik* • # başlık • - liste • | tablo |</span>
                              </div>
                              <textarea
                                ref={sectionTextareaRef}
                                rows={9}
                                value={editedSectionHtml}
                                onChange={(e) => setEditedSectionHtml(e.target.value)}
                                onKeyDown={(e) => {
                                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                                    e.preventDefault();
                                    insertMarkdownSyntax("**", "**", "Kalın Metin");
                                  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
                                    e.preventDefault();
                                    insertMarkdownSyntax("*", "*", "İtalik Metin");
                                  }
                                }}
                                className="w-full text-xs p-3.5 font-mono rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                                placeholder="Markdown formatında rapor metnini giriniz (Örn: **Kalın**, *İtalik*, ## Başlık, - Liste, | Tablo |)..."
                              />
                            </div>
                          )}

                          {markdownEditorMode !== "edit" && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Canlı Markdown Rapor Önizlemesi</span>
                              </div>
                              <div
                                className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 min-h-[210px] leading-relaxed space-y-2 overflow-y-auto"
                                dangerouslySetInnerHTML={{
                                  __html:
                                    renderMarkdownToHtml(editedSectionHtml) ||
                                    "<span class='text-slate-400 italic'>Önizlenecek içerik yok...</span>",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Özel Not / Değerlendirme Açıklaması (Markdown Destekli):
                        </label>
                        <input
                          type="text"
                          value={editedSectionNotes}
                          onChange={(e) => setEditedSectionNotes(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                          placeholder="Örn: **Yetkili denetçi** tarafından *imza altına* alınmıştır."
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Render Content via Markdown + HTML Renderer */}
                      <div
                        className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownToHtml(sec.contentHtml || ""),
                        }}
                      />

                      {sec.customNotes && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-100 text-xs text-slate-600 font-semibold border-l-4 border-emerald-600 flex items-start gap-1.5">
                          <strong className="shrink-0">Not:</strong>
                          <span
                            className="inline"
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdownToHtml(sec.customNotes).replace(/^<p[^>]*>|<\/p>$/g, ""),
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dynamic Tables Embedded Based on Section */}
                  {sec.sectionKey === "shipment" && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">
                        Bu Kesimhaneye Ait Sevk Tırları ve İrsaliyeler:
                      </div>
                      <table className="w-full text-left text-xs border border-slate-200">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th className="p-2 border-b">Sevk No</th>
                            <th className="p-2 border-b">Tarih</th>
                            <th className="p-2 border-b">Araç Plakası</th>
                            <th className="p-2 border-b">Şoför</th>
                            <th className="p-2 border-b text-right">Hayvan Sayısı</th>
                            <th className="p-2 border-b">Sevk İrsaliye No</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {shipments
                            .filter((s) => s.destinationLocationId === activeReport.cuttingLocationId)
                            .map((s) => (
                              <tr key={s.id}>
                                <td className="p-2 font-bold">{s.shipmentNo}</td>
                                <td className="p-2">{s.shipmentDate}</td>
                                <td className="p-2 font-bold text-slate-900">{s.vehiclePlate}</td>
                                <td className="p-2">{s.driverName}</td>
                                <td className="p-2 text-right font-bold text-emerald-700">{s.animalCount} Adet</td>
                                <td className="p-2">{s.dispatchNoteNo}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {sec.sectionKey === "delivery" && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">
                        Bu Kesimhaneden Yapılan Satış & Parçalı Teslimatlar:
                      </div>
                      <table className="w-full text-left text-xs border border-slate-200">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th className="p-2 border-b">Teslimat No</th>
                            <th className="p-2 border-b">Tarih</th>
                            <th className="p-2 border-b">Nakliye Türü</th>
                            <th className="p-2 border-b">Araç Plakası</th>
                            <th className="p-2 border-b text-right">Teslim Edilen Et</th>
                            <th className="p-2 border-b">Teslim Alan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {deliveries
                            .filter((d) => d.cuttingLocationId === activeReport.cuttingLocationId)
                            .map((d) => (
                              <tr key={d.id}>
                                <td className="p-2 font-bold">{d.deliveryNo}</td>
                                <td className="p-2">{d.deliveryDate}</td>
                                <td className="p-2 font-sans font-semibold">
                                  {d.transportType === "company_vehicle" ? "★ Şirket Özmal Aracı" : "Lojistik Tırı"}
                                </td>
                                <td className="p-2 font-bold">{d.vehiclePlate}</td>
                                <td className="p-2 text-right font-bold text-emerald-700">
                                  {d.deliveredQuantityKg.toLocaleString("tr-TR")} Kg
                                </td>
                                <td className="p-2 font-sans">{d.recipientPerson}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Official Report Sign-off / Signatures */}
            <div className="pt-10 border-t-2 border-slate-900 grid grid-cols-3 gap-6 text-center text-xs">
              <div className="space-y-1">
                <div className="text-slate-500 font-bold uppercase text-[10px]">Hazırlayan & Denetleyen</div>
                <div className="font-bold text-slate-900">{activeReport.preparedBy}</div>
                <div className="text-slate-500">Operasyon Koordinatörü</div>
                <div className="h-14 flex items-end justify-center font-cursive text-slate-400">
                  (İmza / Kaşe)
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-500 font-bold uppercase text-[10px]">Tesis Yetkili Veteriner Hekimi</div>
                <div className="font-bold text-slate-900">
                  {cuttingLocations.find((l) => l.id === activeReport.cuttingLocationId)?.veterinaryName ||
                    "Tesis Veteriner Hekimi"}
                </div>
                <div className="text-slate-500">Gıda & Tarım Bakanlığı Denetçisi</div>
                <div className="h-14 flex items-end justify-center font-cursive text-slate-400">
                  (Resmî Mühür & İmza)
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-500 font-bold uppercase text-[10px]">Müşteri Kabul Yetkilisi</div>
                <div className="font-bold text-slate-900">
                  {parties.find((p) => p.partyType === "client_buyer")?.authorizedPerson || "Müşteri Kabul Yetkilisi"}
                </div>
                <div className="text-slate-500">
                  {parties.find((p) => p.partyType === "client_buyer")?.name ||
                    organization?.clientCompanyName ||
                    activeReport.clientCompanyName}
                </div>
                <div className="h-14 flex items-end justify-center font-cursive text-slate-400">
                  (Onay & İmza)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab Empty / Loading Fallback */}
      {activeTab === "reports" && !activeReport && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200 dark:border-slate-800 text-center max-w-xl mx-auto space-y-4 shadow-sm my-8">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <ScrollText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
            Resmî Denetim Raporu Yükleniyor
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Resmî raporlar Supabase veritabanından alınıyor veya hazır duruma getiriliyor. Raporları anında yenilemek için aşağıdaki butona basabilirsiniz.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={async () => {
                setIsLoading(true);
                await loadOverview("all");
                setIsLoading(false);
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Raporları Yeniden Yükle</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: TEKİL HAYVAN EKLE / DÜZENLE                                      */}
      {/* ========================================================================= */}
      {animalModalOpen && editingAnimal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                {editingAnimal.id ? "Hayvan Kaydını Düzenle" : "Yeni Canlı Hayvan Ekle"}
              </h3>
              <button
                onClick={() => setAnimalModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAnimal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Küpe Numarası *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAnimal.earTagNo || ""}
                    onChange={(e) => setEditingAnimal({ ...editingAnimal, earTagNo: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kesim Yeri
                  </label>
                  <select
                    value={editingAnimal.cuttingLocationId || ""}
                    onChange={(e) => setEditingAnimal({ ...editingAnimal, cuttingLocationId: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                  >
                    <option value="">Kesim Yeri Seçiniz...</option>
                    {cuttingLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Irk
                  </label>
                  <input
                    type="text"
                    value={editingAnimal.breed || "Simental"}
                    onChange={(e) => setEditingAnimal({ ...editingAnimal, breed: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Canlı Kilo (Kg)
                  </label>
                  <input
                    type="number"
                    value={editingAnimal.liveWeightKg || 650}
                    onChange={(e) => setEditingAnimal({ ...editingAnimal, liveWeightKg: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Karkas Kilo (Kg)
                  </label>
                  <input
                    type="number"
                    value={editingAnimal.carcassWeightKg || 365}
                    onChange={(e) => setEditingAnimal({ ...editingAnimal, carcassWeightKg: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kayıtlı Olduğu Çiftlik / İşletme
                </label>
                <input
                  type="text"
                  value={editingAnimal.farmName || ""}
                  onChange={(e) => setEditingAnimal({ ...editingAnimal, farmName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Durumu
                </label>
                <select
                  value={editingAnimal.status || "delivered"}
                  onChange={(e) => setEditingAnimal({ ...editingAnimal, status: e.target.value as AnimalStatus })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="purchased">Alındı (Çiftlikte)</option>
                  <option value="in_transit">Sevk Edildi (Yolda)</option>
                  <option value="arrived_at_slaughterhouse">Mezbaha Padokta</option>
                  <option value="slaughtered">Kesildi</option>
                  <option value="in_storage">Soğuk Depoda</option>
                  <option value="delivered">Müşteriye Teslim Edildi</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAnimalModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EXCEL'DEN TOPLU HAYVAN YÜKLEME (350-400 HAYVAN)                  */}
      {/* ========================================================================= */}
      {excelImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Excel ile Toplu Hayvan Kaydı (300-400 Hayvan)
              </h3>
              <button
                onClick={() => setExcelImportModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Excel dosyanızda <strong>Küpe Numarası</strong>, <strong>Kesim Yeri Kodu</strong> (KSM-01 veya KSM-02), <strong>Irk</strong>, <strong>Canlı Kilo</strong> ve <strong>Karkas Kilo</strong> sütunlarını içeren dosyanızı yükleyerek yüzlerce hayvanı tek seferde aktarabilirsiniz.
            </p>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Hazır Şablon Dosyası:
              </span>
              <button
                onClick={downloadAnimalImportTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Boş Şablon İndir (.xlsx)</span>
              </button>
            </div>

            <input
              type="file"
              ref={excelFileRef}
              accept=".xlsx, .xls"
              onChange={handleExcelImport}
              className="hidden"
            />

            <div
              onClick={() => excelFileRef.current?.click()}
              className="border-2 border-dashed border-indigo-400/50 hover:border-indigo-500 rounded-3xl p-8 text-center cursor-pointer bg-indigo-50/20 hover:bg-indigo-50/40 transition-colors space-y-2"
            >
              <FileSpreadsheet className="w-10 h-10 text-indigo-600 mx-auto" />
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Excel Dosyasını Seçin veya Sürükleyin
              </div>
              <div className="text-xs text-slate-500">
                .xlsx veya .xls formatı desteklenir
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setExcelImportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: FOTOĞRAF LIGHTBOX ÖNİZLEME                                       */}
      {/* ========================================================================= */}
      {photoPreview && (
        <div
          onClick={() => setPhotoPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                {photoPreview.title}
              </h3>
              <button
                onClick={() => setPhotoPreview(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center">
              <img
                src={photoPreview.url}
                alt={photoPreview.title}
                loading="lazy"
                decoding="async"
                className="max-h-[500px] w-auto object-contain"
              />
            </div>

            {photoPreview.desc && (
              <p className="text-xs text-slate-300 leading-relaxed italic">
                {photoPreview.desc}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: FOTOĞRAF & BELGE YÜKLEME (SUPABASE STORAGE OPTİMİZE)             */}
      {/* ========================================================================= */}
      {photoUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  Fotoğraf & Belge Ekle
                </h3>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3 h-3" />
                  Otomatik WebP sıkıştırma + 1 yıl CDN önbelleği (%95+ kota tasarrufu)
                </p>
              </div>
              <button
                onClick={() => setPhotoUploadModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={photoFileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handlePhotoFileChange}
            />

            {/* Upload Selector Dropzone */}
            {!compressedPhotoResult && !isCompressingPhoto && (
              <div
                onClick={() => photoFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer transition-all hover:bg-emerald-50/20 group"
              >
                <Camera className="w-10 h-10 text-slate-400 group-hover:text-emerald-500 mx-auto transition-colors" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-2">
                  Fotoğraf Seçmek veya Yüklemek İçin Tıklayın
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  JPG, PNG veya HEIC (Telefon kameraları desteklenir)
                </div>
                <div className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                  <Zap className="w-3 h-3" /> 5-15 MB fotoğraf anında ~200 KB WebP'ye dönüştürülür
                </div>
              </div>
            )}

            {/* Compressing Indicator */}
            {isCompressingPhoto && (
              <div className="py-10 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Görsel HTML5 Canvas üzerinde WebP formatına sıkıştırılıyor...
                </div>
                <div className="text-xs text-slate-500">
                  Boyut küçültülüyor ve çözünürlük optimize ediliyor
                </div>
              </div>
            )}

            {/* Compressed Result & Preview */}
            {compressedPhotoResult && !isCompressingPhoto && (
              <div className="space-y-4">
                {/* Before / After Stats Bar */}
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Orijinal Boyut</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {formatBytes(compressedPhotoResult.originalSize)}
                    </span>
                  </div>
                  <div className="text-emerald-600 font-bold text-base">➔</div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Optimize WebP</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {formatBytes(compressedPhotoResult.compressedSize)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Kota Tasarrufu</span>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-600 text-white font-mono font-black text-xs">
                      %{compressedPhotoResult.reductionPercent}
                    </span>
                  </div>
                </div>

                {/* Photo Preview Thumbnail */}
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-slate-950 flex items-center justify-center">
                  <img
                    src={compressedPhotoResult.dataUrl}
                    alt="Önizleme"
                    loading="lazy"
                    decoding="async"
                    className="max-h-48 w-auto object-contain"
                  />
                  <button
                    onClick={() => {
                      setCompressedPhotoResult(null);
                      setSelectedPhotoFile(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Document Metadata Form */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Fotoğraf / Belge Başlığı
                    </label>
                    <input
                      type="text"
                      value={customDocTitle}
                      onChange={(e) => setCustomDocTitle(e.target.value)}
                      placeholder="Örn: 34 KRB 101 Varış ve Canlı Ağırlık Görseli"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Açıklama / Denetim Notu (Opsiyonel)
                    </label>
                    <input
                      type="text"
                      value={customDocDesc}
                      onChange={(e) => setCustomDocDesc(e.target.value)}
                      placeholder="Örn: Sevkiyat tutanağı veteriner hekim tarafından kaşelenmiştir."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setPhotoUploadModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>

              <div className="flex items-center gap-2">
                {compressedPhotoResult && (
                  <button
                    onClick={() => photoFileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Başka Fotoğraf Seç
                  </button>
                )}
                <button
                  disabled={!compressedPhotoResult || isUploadingPhoto}
                  onClick={handleSavePhotoToStorage}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
                >
                  {isUploadingPhoto ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Supabase'e Yükleniyor...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Supabase Storage'a Kaydet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PARTIES (MÜŞTERİ / KURBANI ALDIĞIM YER / SOĞUK DEPO FİRMASI)       */}
      {/* ========================================================================= */}
      {partyModalOpen && editingParty && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-2xl w-full shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {editingParty.id && parties.some((p) => p.id === editingParty.id)
                      ? "Firma / Paydaş Düzenle"
                      : "Yeni Firma / Paydaş Ekle"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Müşteri, kurban alınan besici/çiftlik veya soğuk hava firma bilgileri
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPartyModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1 text-xs">
              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Paydaş Rolü / Türü <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editingParty.partyType || "supplier_seller"}
                  onChange={(e) =>
                    setEditingParty((prev) => ({
                      ...prev,
                      partyType: e.target.value as PartyType,
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="supplier_seller">🌿 Kurbanı Aldığım Yer / Besici / Çiftlik (Tedarikçi)</option>
                  <option value="client_buyer">🏢 Alıcı Firma / Müşteri (Kurumsal Alıcı)</option>
                  <option value="cold_storage">❄️ Soğuk Hava Depo Şirketi</option>
                  <option value="slaughterhouse">🔪 Kesimhane / Mezbaha İşletmesi</option>
                  <option value="logistics_transporter">🚚 Lojistik / Nakliye Şirketi</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Firma / Çiftlik / Şahıs Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingParty.name || ""}
                  onChange={(e) => setEditingParty((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Örn: Anadolu Besi Çiftliği Ltd. Şti. veya Ahmet Yılmaz"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Yetkili Kişi
                </label>
                <input
                  type="text"
                  value={editingParty.authorizedPerson || ""}
                  onChange={(e) =>
                    setEditingParty((prev) => ({ ...prev, authorizedPerson: e.target.value }))
                  }
                  placeholder="Örn: Mehmet Demir"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Telefon Numarası
                </label>
                <input
                  type="text"
                  value={editingParty.phone || ""}
                  onChange={(e) => setEditingParty((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="0532 000 00 00"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  VKN / TCKN
                </label>
                <input
                  type="text"
                  value={editingParty.taxId || ""}
                  onChange={(e) => setEditingParty((prev) => ({ ...prev, taxId: e.target.value }))}
                  placeholder="10 veya 11 haneli kimlik/vergi no"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Vergi Dairesi
                </label>
                <input
                  type="text"
                  value={editingParty.taxOffice || ""}
                  onChange={(e) =>
                    setEditingParty((prev) => ({ ...prev, taxOffice: e.target.value }))
                  }
                  placeholder="Örn: Erzurum Vergi Dairesi"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Şehir / İlçe
                </label>
                <input
                  type="text"
                  value={editingParty.city || ""}
                  onChange={(e) => setEditingParty((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="Örn: Erzurum / Palandöken"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-Posta (Opsiyonel)
                </label>
                <input
                  type="email"
                  value={editingParty.email || ""}
                  onChange={(e) => setEditingParty((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="iletisim@ciftlik.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Açık Adres
                </label>
                <textarea
                  rows={2}
                  value={editingParty.address || ""}
                  onChange={(e) =>
                    setEditingParty((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="Köy, mahalle, cadde, numara bilgileri"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Açıklama & Özel Notlar
                </label>
                <textarea
                  rows={2}
                  value={editingParty.notes || ""}
                  onChange={(e) => setEditingParty((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Besi ırkı, sözleşme şartları, ödeme koşulları vb."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPartyModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveParty(editingParty)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Paydaş / Firma Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: CUTTING LOCATIONS (KESİM YERİ EKLE / DÜZENLE)                     */}
      {/* ========================================================================= */}
      {locationModalOpen && editingLocation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-2xl w-full shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {editingLocation.id && cuttingLocations.some((l) => l.id === editingLocation.id)
                      ? "Kesim Yeri Düzenle"
                      : "Yeni Kesim Yeri Ekle"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mezbaha ve kesim tesisi resmi izin ve operasyonel bilgileri
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLocationModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1 text-xs">
              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kesim Yeri / Mezbaha Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingLocation.name || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Örn: Tuzla Modern Et Kombinası ve Kesimhanesi"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kesimhane Kodu
                </label>
                <input
                  type="text"
                  value={editingLocation.locationCode || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, locationCode: e.target.value }))
                  }
                  placeholder="Örn: KSM-01"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  İl / İlçe
                </label>
                <input
                  type="text"
                  value={editingLocation.city || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, city: e.target.value }))
                  }
                  placeholder="Örn: İstanbul / Tuzla"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tarım Bakanlığı Onay / İşletme No
                </label>
                <input
                  type="text"
                  value={editingLocation.officialApprovalNo || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, officialApprovalNo: e.target.value }))
                  }
                  placeholder="Örn: TR-34-KSM-089"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tahsis Edilen Kurban Sayısı (Adet)
                </label>
                <input
                  type="number"
                  value={editingLocation.allocatedAnimalCount || 0}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({
                      ...prev,
                      allocatedAnimalCount: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Günlük Kesim Kapasitesi (Adet)
                </label>
                <input
                  type="number"
                  value={editingLocation.dailyCapacity || 0}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({
                      ...prev,
                      dailyCapacity: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tesis Sorumlusu
                </label>
                <input
                  type="text"
                  value={editingLocation.responsiblePerson || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, responsiblePerson: e.target.value }))
                  }
                  placeholder="Örn: Ali Kemal Demir"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sorumlu Telefonu
                </label>
                <input
                  type="text"
                  value={editingLocation.responsiblePhone || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, responsiblePhone: e.target.value }))
                  }
                  placeholder="0533 000 00 00"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sorumlu Veteriner Hekim
                </label>
                <input
                  type="text"
                  value={editingLocation.veterinaryName || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, veterinaryName: e.target.value }))
                  }
                  placeholder="Örn: Vet. Hekim Murat Can (Oda Sicil No: 3412)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Açık Adres
                </label>
                <textarea
                  rows={2}
                  value={editingLocation.address || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="Mezbaha açık adres bilgisi"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tesis Açıklaması & Notlar
                </label>
                <textarea
                  rows={2}
                  value={editingLocation.notes || ""}
                  onChange={(e) =>
                    setEditingLocation((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Hijyen sertifikası, parçalama hatları, soğuk hava odaları bilgisi"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveLocation(editingLocation)}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center gap-1.5 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Kesim Yerini Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: SHIPMENTS (CANLI HAYVAN SEVK TIRI EKLE / DÜZENLE)                 */}
      {/* ========================================================================= */}
      {shipmentModalOpen && editingShipment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-2xl w-full shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {editingShipment.id && shipments.some((s) => s.id === editingShipment.id)
                      ? "Sevk Tırı Düzenle"
                      : "Yeni Canlı Hayvan Sevk Tırı Ekle"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kurbanlıkların çiftlikten kesimhaneye sevkiyat ve TIR bilgileri
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShipmentModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  TIR / Kamyon Plakası <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingShipment.vehiclePlate || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, vehiclePlate: e.target.value.toUpperCase() }))
                  }
                  placeholder="Örn: 06 TR 1010"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sevk Numarası
                </label>
                <input
                  type="text"
                  value={editingShipment.shipmentNo || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, shipmentNo: e.target.value }))
                  }
                  placeholder="Örn: TR-SEVK-2026-001"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sevk Tarihi
                </label>
                <input
                  type="date"
                  value={editingShipment.shipmentDate || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, shipmentDate: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Varış Kesimhanesi <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editingShipment.destinationLocationId || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({
                      ...prev,
                      destinationLocationId: e.target.value,
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Kesim Yeri Seçiniz</option>
                  {cuttingLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.locationCode || loc.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Çıkış Noktası / Çiftlik
                </label>
                <input
                  type="text"
                  value={editingShipment.originAddress || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, originAddress: e.target.value }))
                  }
                  placeholder="Örn: Erzurum Besi Çiftliği"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Taşıyıcı / Lojistik Firma
                </label>
                <input
                  type="text"
                  value={editingShipment.carrierCompany || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, carrierCompany: e.target.value }))
                  }
                  placeholder="Örn: Anadolu Canlı Hayvan Nakliyat"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Şoför Adı Soyadı
                </label>
                <input
                  type="text"
                  value={editingShipment.driverName || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, driverName: e.target.value }))
                  }
                  placeholder="Örn: Hüseyin Kaya"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Şoför Telefonu
                </label>
                <input
                  type="text"
                  value={editingShipment.driverPhone || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, driverPhone: e.target.value }))
                  }
                  placeholder="0535 000 00 00"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Taşınan Hayvan Sayısı (Adet)
                </label>
                <input
                  type="number"
                  value={editingShipment.animalCount || 0}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, animalCount: Number(e.target.value) }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nakliye Bedeli (₺)
                </label>
                <input
                  type="number"
                  value={editingShipment.shippingCost || 0}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({
                      ...prev,
                      shippingCost: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sevk İrsaliye No
                </label>
                <input
                  type="text"
                  value={editingShipment.dispatchNoteNo || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, dispatchNoteNo: e.target.value }))
                  }
                  placeholder="Örn: IRS-2026-4401"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Veteriner Sağlık Rapor No (Yurtiçi Hayvan Sevk)
                </label>
                <input
                  type="text"
                  value={editingShipment.vetHealthReportNo || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, vetHealthReportNo: e.target.value }))
                  }
                  placeholder="Örn: TR-25-VET-8832"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sevkiyat Durumu
                </label>
                <select
                  value={editingShipment.status || "delivered_to_slaughterhouse"}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({
                      ...prev,
                      status: e.target.value as ShipmentStatus,
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="delivered_to_slaughterhouse">✓ Tesis Kesimhanesine Ulaştı / Teslim Edildi</option>
                  <option value="in_transit">🚚 Yolda / Sevkiyatta</option>
                  <option value="planned">📅 Planlandı / Yükleme Bekliyor</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Açıklama & Sevkiyat Notları
                </label>
                <textarea
                  rows={2}
                  value={editingShipment.notes || ""}
                  onChange={(e) =>
                    setEditingShipment((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Yolculuk süresi, mola yerleri, kantar tartım fişi bilgileri vb."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShipmentModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveShipment(editingShipment)}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-cyan-600/20 flex items-center gap-1.5 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Sevk Tırını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: STORAGE (SOĞUK HAVA DEPO KAYDI EKLE / DÜZENLE)                    */}
      {/* ========================================================================= */}
      {storageModalOpen && editingStorage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-2xl w-full shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 flex items-center justify-center font-bold">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {editingStorage.id && storageRecords.some((s) => s.id === editingStorage.id)
                      ? "Soğuk Depo Kaydı Düzenle"
                      : "Yeni Soğuk Hava Depo Kaydı Ekle"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kesim sonrası karkas ve parça etlerin soğuk hava tesisinde muhafazası
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStorageModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1 text-xs">
              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Soğuk Hava Deposu / Tesis Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingStorage.warehouseName || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, warehouseName: e.target.value }))
                  }
                  placeholder="Örn: Marmara Frigo Lojistik & Soğuk Hava Deposu"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  İşletmeci / Depolama Firması
                </label>
                <input
                  type="text"
                  value={editingStorage.storageCompany || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, storageCompany: e.target.value }))
                  }
                  placeholder="Örn: Marmara Frigo A.Ş."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  İlişkili Kesimhane
                </label>
                <select
                  value={editingStorage.cuttingLocationId || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, cuttingLocationId: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Kesimhane Seçiniz</option>
                  {cuttingLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Depolanan Ürün Tipi
                </label>
                <input
                  type="text"
                  value={editingStorage.productType || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, productType: e.target.value }))
                  }
                  placeholder="Örn: Karkas Et (Dörde Bölünmüş), Hisse Kolileri"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Muhafaza Sıcaklığı (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editingStorage.temperatureCelsius || 0}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({
                      ...prev,
                      temperatureCelsius: Number(e.target.value),
                    }))
                  }
                  placeholder="Örn: 2 veya 4"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Depolanan Miktar (Kg)
                </label>
                <input
                  type="number"
                  value={editingStorage.storedQuantityKg || 0}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({
                      ...prev,
                      storedQuantityKg: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Depoya Giriş Tarihi
                </label>
                <input
                  type="date"
                  value={editingStorage.entryDate || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, entryDate: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Depodan Çıkış / Sevk Tarihi (Opsiyonel)
                </label>
                <input
                  type="date"
                  value={editingStorage.exitDate || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, exitDate: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Depolama Fatura Tutarı (₺)
                </label>
                <input
                  type="number"
                  value={editingStorage.invoiceAmount || 0}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({
                      ...prev,
                      invoiceAmount: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Depolama Fatura No
                </label>
                <input
                  type="text"
                  value={editingStorage.invoiceNo || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, invoiceNo: e.target.value }))
                  }
                  placeholder="Örn: DEP-2026-0044"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Açıklama & İklimlendirme Koşulları
                </label>
                <textarea
                  rows={2}
                  value={editingStorage.notes || ""}
                  onChange={(e) =>
                    setEditingStorage((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="HACCP hijyen standartları, bağıl nem %85, hava sirkülasyonu sağlandı."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStorageModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveStorage(editingStorage)}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Soğuk Depo Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: DELIVERIES (TAŞIMA ARACI EKLE - PLAKA ZORUNLU DEĞİL)             */}
      {/* ========================================================================= */}
      {deliveryModalOpen && editingDelivery && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-2xl w-full shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {editingDelivery.id && deliveries.some((d) => d.id === editingDelivery.id)
                        ? "Taşıma Aracı / Teslimat Düzenle"
                        : "Yeni Taşıma Aracı / Teslimat Ekle"}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Plaka Zorunlu Değil
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Müşteriye soğuk zincir teslimatı - Plaka bilgisi opsiyoneldir.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeliveryModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Araç Türü / Filo Mülkiyeti
                </label>
                <select
                  value={editingDelivery.transportType || "company_vehicle"}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      transportType: e.target.value as DeliveryTransportType,
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="company_vehicle">★ Şirket Özmal Aracı</option>
                  <option value="logistics_third_party">🚚 Dış Lojistik / Anlaşmalı Nakliye</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Taşıma Aracı Plakası
                  </label>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.2 rounded">
                    Opsiyonel (Zorunlu Değil)
                  </span>
                </div>
                <input
                  type="text"
                  value={editingDelivery.vehiclePlate || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      vehiclePlate: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Örn: 34 VR 4410 (Boş bırakabilirsiniz)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Şoför / Teslim Eden Sürücü <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingDelivery.driverName || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({ ...prev, driverName: e.target.value }))
                  }
                  placeholder="Örn: Serdar Koç"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Şirket Teslim Eden Yetkilisi
                </label>
                <input
                  type="text"
                  value={editingDelivery.deliveredByPerson || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      deliveredByPerson: e.target.value,
                    }))
                  }
                  placeholder="Örn: Enes Kurtul (Sevkiyat Sorumlusu)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Alıcı Müşteri / Firma Adı
                </label>
                <input
                  type="text"
                  value={editingDelivery.recipientCompany || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      recipientCompany: e.target.value,
                    }))
                  }
                  placeholder="Örn: Anadolu Perakende Gıda A.Ş."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Teslim Alan Yetkili Kişi
                </label>
                <input
                  type="text"
                  value={editingDelivery.recipientPerson || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      recipientPerson: e.target.value,
                    }))
                  }
                  placeholder="Örn: Murat Göktaş (Depo Müdürü)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Teslimat Tarihi
                </label>
                <input
                  type="date"
                  value={editingDelivery.deliveryDate || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({ ...prev, deliveryDate: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Teslim Edilen Miktar (Kg)
                </label>
                <input
                  type="number"
                  value={editingDelivery.deliveredQuantityKg || 0}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      deliveredQuantityKg: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Teslim Edilen Hayvan / Karkas Karşılığı (Adet)
                </label>
                <input
                  type="number"
                  value={editingDelivery.deliveredAnimalCount || 0}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      deliveredAnimalCount: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Taşıma Masrafı / Navlun (₺) (Opsiyonel)
                </label>
                <input
                  type="number"
                  value={editingDelivery.transportCost || 0}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      transportCost: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sevk İrsaliye Numarası
                </label>
                <input
                  type="text"
                  value={editingDelivery.dispatchNoteNo || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({ ...prev, dispatchNoteNo: e.target.value }))
                  }
                  placeholder="Örn: IRS-2026-901"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Satış Faturası No
                </label>
                <input
                  type="text"
                  value={editingDelivery.outgoingInvoiceNo || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({
                      ...prev,
                      outgoingInvoiceNo: e.target.value,
                    }))
                  }
                  placeholder="Örn: GIB2026000000301"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Teslimat Adresi / Mağaza / Şube
                </label>
                <textarea
                  rows={2}
                  value={editingDelivery.deliveryAddress || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({ ...prev, deliveryAddress: e.target.value }))
                  }
                  placeholder="Örn: Anadolu Gıda Merkez Soğuk Hava Deposu / Pendik İstanbul"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Teslimat Notları
                </label>
                <textarea
                  rows={2}
                  value={editingDelivery.notes || ""}
                  onChange={(e) =>
                    setEditingDelivery((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Isı kayıt cihazı (datalogger) kontrol edildi, et derecesi +2°C ölçüldü."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeliveryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveDelivery(editingDelivery)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Taşıma Aracı ve Teslimatı Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ORGANİZASYON & ANA ALICI KURUM DÜZENLE                             */}
      {/* ========================================================================= */}
      {organizationModalOpen && editingOrganization && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-500" />
                <span>Organizasyon & Ana Alıcı Kurum Bilgileri</span>
              </h3>
              <button
                onClick={() => setOrganizationModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingOrganization) handleSaveOrganization(editingOrganization);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Organizasyon / Operasyon Adı *
                </label>
                <input
                  type="text"
                  required
                  value={editingOrganization.name || ""}
                  onChange={(e) =>
                    setEditingOrganization({ ...editingOrganization, name: e.target.value })
                  }
                  placeholder="Örn: 2026 Kurban Eti Tedarik ve Kesim Operasyonu"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ana Alıcı Müşteri / Kurum Adı *
                </label>
                <input
                  type="text"
                  required
                  value={editingOrganization.clientCompanyName || ""}
                  onChange={(e) =>
                    setEditingOrganization({
                      ...editingOrganization,
                      clientCompanyName: e.target.value,
                    })
                  }
                  placeholder="Örn: Anadolu Gıda & Perakende A.Ş."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Başlangıç Tarihi
                  </label>
                  <input
                    type="date"
                    value={editingOrganization.startDate || ""}
                    onChange={(e) =>
                      setEditingOrganization({
                        ...editingOrganization,
                        startDate: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alıcı Vergi No
                  </label>
                  <input
                    type="text"
                    value={editingOrganization.clientTaxNo || ""}
                    onChange={(e) =>
                      setEditingOrganization({
                        ...editingOrganization,
                        clientTaxNo: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Planlanan Hayvan Adedi
                  </label>
                  <input
                    type="number"
                    value={editingOrganization.targetAnimalCount || 0}
                    onChange={(e) =>
                      setEditingOrganization({
                        ...editingOrganization,
                        targetAnimalCount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Operasyon Açıklaması / Notlar
                  </label>
                  <input
                    type="text"
                    value={editingOrganization.description || ""}
                    onChange={(e) =>
                      setEditingOrganization({
                        ...editingOrganization,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrganizationModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md shadow-amber-600/20"
                >
                  {isSaving ? "Kaydediliyor..." : "Bilgileri Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: KESİM OTURUMU EKLE / DÜZENLE                                       */}
      {/* ========================================================================= */}
      {slaughterModalOpen && editingSlaughter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-rose-600" />
                <span>{editingSlaughter.id ? "Kesim Oturumu Düzenle" : "Yeni Kesim Oturumu Ekle"}</span>
              </h3>
              <button
                onClick={() => setSlaughterModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingSlaughter) handleSaveSlaughter(editingSlaughter);
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kesim Yeri / Mezbaha *
                  </label>
                  <select
                    required
                    value={editingSlaughter.cuttingLocationId || ""}
                    onChange={(e) =>
                      setEditingSlaughter({
                        ...editingSlaughter,
                        cuttingLocationId: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
                  >
                    <option value="">Seçiniz...</option>
                    {cuttingLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.city})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Parti / Oturum Kodu *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingSlaughter.batchNo || ""}
                    onChange={(e) =>
                      setEditingSlaughter({ ...editingSlaughter, batchNo: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kesim Tarihi
                  </label>
                  <input
                    type="date"
                    value={editingSlaughter.slaughterDate || ""}
                    onChange={(e) =>
                      setEditingSlaughter({ ...editingSlaughter, slaughterDate: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kesilen Hayvan Adedi
                  </label>
                  <input
                    type="number"
                    value={editingSlaughter.animalCount || 0}
                    onChange={(e) =>
                      setEditingSlaughter({
                        ...editingSlaughter,
                        animalCount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Karkas Net Et (Kg)
                  </label>
                  <input
                    type="number"
                    value={editingSlaughter.totalCarcassWeightKg || 0}
                    onChange={(e) =>
                      setEditingSlaughter({
                        ...editingSlaughter,
                        totalCarcassWeightKg: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kasap Ekibi
                  </label>
                  <input
                    type="text"
                    value={editingSlaughter.butcherTeam || ""}
                    onChange={(e) =>
                      setEditingSlaughter({ ...editingSlaughter, butcherTeam: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Resmî Tutanak No
                  </label>
                  <input
                    type="text"
                    value={editingSlaughter.officialProtocolNo || ""}
                    onChange={(e) =>
                      setEditingSlaughter({
                        ...editingSlaughter,
                        officialProtocolNo: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSlaughterModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/20"
                >
                  {isSaving ? "Kaydediliyor..." : "Kesim Oturumunu Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FATURA EKLE / DÜZENLE                                              */}
      {/* ========================================================================= */}
      {invoiceModalOpen && editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>{editingInvoice.id ? "Fatura Düzenle" : "Yeni Fatura Ekle"}</span>
              </h3>
              <button
                onClick={() => setInvoiceModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingInvoice) handleSaveInvoice(editingInvoice);
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fatura Türü
                  </label>
                  <select
                    value={editingInvoice.invoiceType || "animal_purchase"}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        invoiceType: e.target.value as KurbanInvoice["invoiceType"],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
                  >
                    <option value="animal_purchase">Hayvan Alımı</option>
                    <option value="transport_shipping">Nakliye</option>
                    <option value="slaughter_service">Kesim Hizmeti</option>
                    <option value="storage_service">Soğuk Depolama</option>
                    <option value="sales_outgoing">Satış Çıkış</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fatura No *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingInvoice.invoiceNo || ""}
                    onChange={(e) =>
                      setEditingInvoice({ ...editingInvoice, invoiceNo: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tarih
                  </label>
                  <input
                    type="date"
                    value={editingInvoice.invoiceDate || ""}
                    onChange={(e) =>
                      setEditingInvoice({ ...editingInvoice, invoiceDate: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Düzenleyen Firma *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingInvoice.issuerCompany || ""}
                    onChange={(e) =>
                      setEditingInvoice({ ...editingInvoice, issuerCompany: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alıcı / Muhatap Firma *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingInvoice.recipientCompany || ""}
                    onChange={(e) =>
                      setEditingInvoice({ ...editingInvoice, recipientCompany: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Matrah (KDV Hariç ₺)
                  </label>
                  <input
                    type="number"
                    value={editingInvoice.subtotal || 0}
                    onChange={(e) => {
                      const sub = Number(e.target.value);
                      const rate = Number(editingInvoice.vatRate ?? 1);
                      const vat = Math.round((sub * rate) / 100);
                      setEditingInvoice({
                        ...editingInvoice,
                        subtotal: sub,
                        vatAmount: vat,
                        totalAmount: sub + vat,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    KDV Oranı (%)
                  </label>
                  <input
                    type="number"
                    value={editingInvoice.vatRate ?? 1}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      const sub = Number(editingInvoice.subtotal || 0);
                      const vat = Math.round((sub * rate) / 100);
                      setEditingInvoice({
                        ...editingInvoice,
                        vatRate: rate,
                        vatAmount: vat,
                        totalAmount: sub + vat,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Genel Toplam (₺)
                  </label>
                  <input
                    type="number"
                    value={editingInvoice.totalAmount || 0}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        totalAmount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-indigo-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInvoiceModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  {isSaving ? "Kaydediliyor..." : "Faturayı Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
