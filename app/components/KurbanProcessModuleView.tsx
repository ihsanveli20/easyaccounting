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
} from "../utils/kurbanProcessApi";
import {
  compressImageFile,
  formatBytes,
  uploadImageToOptimizedStorage,
} from "../utils/imageCompressor";

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
  const [selectedReportId, setSelectedReportId] = useState<string>("rep-tuzla-ksm01");
  const [activeReport, setActiveReport] = useState<KurbanReport | null>(null);
  const [isEditingReport, setIsEditingReport] = useState<boolean>(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editedSectionHtml, setEditedSectionHtml] = useState<string>("");
  const [editedSectionNotes, setEditedSectionNotes] = useState<string>("");

  // Modals & UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string; desc?: string } | null>(null);
  const [animalModalOpen, setAnimalModalOpen] = useState<boolean>(false);
  const [editingAnimal, setEditingAnimal] = useState<Partial<KurbanAnimal> | null>(null);
  const [excelImportModalOpen, setExcelImportModalOpen] = useState<boolean>(false);

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

      setDocuments((prev) => [newDoc, ...prev]);
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
        if (data.reports) {
          setReports(data.reports);
          if (data.reports.length > 0 && !activeReport) {
            setActiveReport(data.reports[0]);
            setSelectedReportId(data.reports[0].id);
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
              ? "loc-kocaeli-ksm02"
              : "loc-tuzla-ksm01";

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

  // Section Live Edit Save
  const handleSaveSectionEdit = async (section: KurbanReportSection) => {
    if (!activeReport) return;
    setIsSaving(true);

    const updatedSections = (activeReport.sections || []).map((s) =>
      s.id === section.id
        ? {
            ...s,
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
    setIsSaving(false);
    if (res.success) {
      showToast("Rapor bölümü canlı olarak güncellendi.");
      setActiveReport(updatedReport);
      setEditingSectionId(null);
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

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                {organization?.clientCompanyName || "Anadolu Gıda & Perakende A.Ş."}
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                350 Hayvan • 2 Kesimhane
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              Canlı Hayvan Alımı, Sevkiyat, Kesim ve Resmî Raporlama
            </h1>
            <p className="text-xs sm:text-sm text-slate-300/90 mt-2 leading-relaxed">
              350 adet canlı hayvanın satın alınması, Kars ve Erzurum'dan iki bağımsız kesimhaneye (Tuzla ve Kartepe) sevki,
              veteriner kontrollü kesimi, karkas soğuk depolaması, müşteriye teslimatı ve <strong>her kesim yeri için ayrı resmî denetim raporu</strong> oluşturulması.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {/* Supabase Seed Button */}
            <button
              onClick={handleSeedToSupabase}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-900/30 hover:scale-102"
              title="350 hayvan, 2 kesimhane ve tüm süreç verilerini Supabase'e yaz"
            >
              <Database className="w-4 h-4 text-emerald-200" />
              <span>Verileri Supabase'e Aktar</span>
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
                <option value="all">Tüm Kesimhaneler (350 Hayvan)</option>
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
          <span>Kesim Yerleri (2 Tesis)</span>
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
            2 Rapor
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
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                Süreç Paydaşları ve Firma Bilgileri
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Alıcı firma, satıcı besi işletmeleri, mezbahalar, lojistik ve soğuk hava antrepoları
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {parties.map((p) => (
              <div
                key={p.id}
                className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
              >
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
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KESİM YERLERİ (2 AYRI TESİS)                                        */}
      {/* ========================================================================= */}
      {activeTab === "locations" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cuttingLocations.map((loc, idx) => (
              <div
                key={loc.id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
              >
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
                    <span className="font-mono text-emerald-600 font-bold">{loc.officialApprovalNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Sorumlu Yönetici: </span>
                    <span>{loc.responsiblePerson} ({loc.responsiblePhone})</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Görevli Veteriner Hekimler: </span>
                    <span>{loc.veterinaryName}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setSelectedLocationId(loc.id);
                      setActiveTab("reports");
                      const matched = reports.find((r) => r.cuttingLocationId === loc.id);
                      if (matched) setSelectedReportId(matched.id);
                    }}
                    className="w-full py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-2"
                  >
                    <ScrollText className="w-4 h-4 text-emerald-400" />
                    <span>Bu Kesimhanenin Resmî Raporunu Aç</span>
                  </button>
                </div>
              </div>
            ))}
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
                    cuttingLocationId: "loc-tuzla-ksm01",
                    animalType: "buyukbas_tosun",
                    animalTypeLabel: "Büyükbaş Tosun",
                    breed: "Simental",
                    gender: "male",
                    ageMonths: 24,
                    farmRegNo: "TR-36-004128",
                    farmName: "Serhat Besi Çiftliği",
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
                              a.cuttingLocationId === "loc-tuzla-ksm01"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                : "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            }`}
                          >
                            {a.cuttingLocationId === "loc-tuzla-ksm01" ? "1. Tuzla" : "2. Kartepe"}
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
      {/* TAB 5: SEVK İŞLEMLERİ (TIRLAR, ŞOFÖRLER, FOTOĞRAFLAR)                      */}
      {/* ========================================================================= */}
      {activeTab === "shipments" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-600" />
                Canlı Hayvan Sevkiyat & Nakliye Takip
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kars ve Erzurum çiftliklerinden iki mezbahaya yapılan toplam 8 tır sevkiyatı
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shipments.map((s) => (
              <div
                key={s.id}
                className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
              >
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
                    {s.vehiclePlate}
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
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Şoför: </span>
                    <span>{s.driverName} ({s.driverPhone})</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Sevk İrsaliyesi: </span>
                    <span className="font-mono">{s.dispatchNoteNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Vet. Rapor No: </span>
                    <span className="font-mono">{s.vetHealthReportNo}</span>
                  </div>
                </div>

                {/* Photo Trigger */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Eksiksiz Varış Teyidi
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        openPhotoUploadModal(
                          "shipment",
                          s.id,
                          `${s.vehiclePlate} Sevk Tırı & Sevkiyat Fotoğrafı`
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
                            title: `${s.vehiclePlate} Sevk Tırı Görseli`,
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
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-rose-600" />
              Kesimhane Oturumları & Karkas Tartım Tutanakları
            </h3>

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
                    {b.cuttingLocationName}
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

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200/60 dark:border-slate-800">
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
              ))}
            </div>
          </div>

          {/* Cold Storage Records */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-teal-600" />
              Soğuk Hava Depolama, Şoklama ve Et Dinlendirme
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {storageRecords.map((st) => (
                <div
                  key={st.id}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-teal-700 bg-teal-100 dark:bg-teal-950 px-2.5 py-0.5 rounded-full">
                      Sabit Isı: +{st.temperatureCelsius} °C
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">{st.entryDate} - {st.exitDate}</span>
                  </div>

                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {st.warehouseName}
                  </h4>

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

                  <p className="text-xs text-slate-500">{st.notes}</p>
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
                Mali Belgeler: Alım, Nakliye, Kesim, Depo ve Satış Faturaları
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kurban süreci kapsamındaki tüm mali kayıtlar, %1 ve %20 KDV analizleri
              </p>
            </div>
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
                Şirket özmal araçları ve lojistik araçlarıyla parçalı teslimat yönetimi
              </p>
            </div>
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
                      {d.vehiclePlate}
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

            {/* Switch Between 2 Reports */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {reports.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => setSelectedReportId(rep.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedReportId === rep.id
                        ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {rep.cuttingLocationId === "loc-tuzla-ksm01" ? "1. Kesimhane Raporu" : "2. Kesimhane Raporu"}
                  </button>
                ))}
              </div>

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
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                      {sec.sectionTitle}
                    </h3>

                    {/* Edit Trigger (Hidden in Print) */}
                    <div className="no-print">
                      {editingSectionId === sec.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSaveSectionEdit(sec)}
                            disabled={isSaving}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                          >
                            Kaydet
                          </button>
                          <button
                            onClick={() => setEditingSectionId(null)}
                            className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingSectionId(sec.id);
                            setEditedSectionHtml(sec.contentHtml || "");
                            setEditedSectionNotes(sec.customNotes || "");
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                          title="Bölüm metnini düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Düzenle</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section Content: Edit Mode or View Mode */}
                  {editingSectionId === sec.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Bölüm Metni / Rapor Paragrafı:
                        </label>
                        <textarea
                          rows={6}
                          value={editedSectionHtml}
                          onChange={(e) => setEditedSectionHtml(e.target.value)}
                          className="w-full text-xs p-3 font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Özel Not / Değerlendirme Açıklaması:
                        </label>
                        <input
                          type="text"
                          value={editedSectionNotes}
                          onChange={(e) => setEditedSectionNotes(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Render Content HTML */}
                      <div
                        className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2"
                        dangerouslySetInnerHTML={{ __html: sec.contentHtml || "" }}
                      />

                      {sec.customNotes && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-100 text-xs text-slate-600 font-semibold border-l-4 border-emerald-600">
                          <strong>Not:</strong> {sec.customNotes}
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
                <div className="font-bold text-slate-900">Vet. Hekim Dr. Selim Karaca</div>
                <div className="text-slate-500">Gıda & Tarım Bakanlığı Denetçisi</div>
                <div className="h-14 flex items-end justify-center font-cursive text-slate-400">
                  (Resmî Mühür & İmza)
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-500 font-bold uppercase text-[10px]">Müşteri Kabul Yetkilisi</div>
                <div className="font-bold text-slate-900">Mehmet Akif Yılmaz</div>
                <div className="text-slate-500">Anadolu Gıda & Perakende A.Ş.</div>
                <div className="h-14 flex items-end justify-center font-cursive text-slate-400">
                  (Onay & İmza)
                </div>
              </div>
            </div>
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
                    <option value="loc-tuzla-ksm01">1. Kesimhane (Tuzla)</option>
                    <option value="loc-kocaeli-ksm02">2. Kesimhane (Kartepe)</option>
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
    </div>
  );
}
