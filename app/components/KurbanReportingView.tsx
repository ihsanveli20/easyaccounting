"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
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
  Share2,
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
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  QurbanRecord,
  QurbanShareholder,
  QurbanMedia,
} from "../types/kurban";
import {
  SAMPLE_QURBAN_RECORDS,
  DEMO_MEDIA,
  getStoredQurbanRecords,
  saveStoredQurbanRecords,
  generateShareholderWhatsAppText,
  exportQurbanRecordsToExcel,
  downloadQurbanImportTemplate,
} from "../utils/kurbanData";
import {
  fetchQurbansApi,
  createQurbanApi,
  updateQurbanApi,
  deleteQurbanApi,
  bulkImportQurbansApi,
} from "../utils/kurbanApi";
import {
  compressImageFile,
  formatBytes,
  uploadImageToOptimizedStorage,
} from "../utils/imageCompressor";

export default function KurbanReportingView() {
  // Main records state
  const [records, setRecords] = useState<QurbanRecord[]>(() =>
    getStoredQurbanRecords()
  );

  // Supabase Cloud Sync States
  const [isCloudLoading, setIsCloudLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [truckFilter, setTruckFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Pagination for 400-500 kurbans
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modals state
  const [activeReportModalRecord, setActiveReportModalRecord] =
    useState<QurbanRecord | null>(null);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // File input ref for Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSaveRecords = (updated: QurbanRecord[]) => {
    setRecords(updated);
    saveStoredQurbanRecords(updated);
  };

  // Fetch from Supabase on mount
  const loadFromSupabase = async (showNotification = false) => {
    setIsCloudLoading(true);
    setCloudError(null);
    try {
      const res = await fetchQurbansApi();
      if (res.success) {
        setIsSupabaseConnected(true);
        if (res.data.length > 0) {
          setRecords(res.data);
          saveStoredQurbanRecords(res.data);
          if (showNotification) {
            showToast(`${res.data.length} adet kurban Supabase'den güncellendi.`);
          }
        } else {
          // If Supabase table is empty, fall back to local stored records
          const local = getStoredQurbanRecords();
          if (local.length > 0) {
            setRecords(local);
          }
          if (showNotification) {
            showToast("Supabase tablonuz şu an boş. Örnek verileri yükleyebilirsiniz.");
          }
        }
      } else {
        setCloudError(res.error || "Supabase bağlantısı kurulamadı");
        if (showNotification) {
          showToast(`Supabase bağlantı uyarısı: ${res.error || "Bilinmeyen hata"}`);
        }
      }
    } catch (err: any) {
      setCloudError(err?.message || "Bağlantı hatası");
    } finally {
      setIsCloudLoading(false);
    }
  };

  useEffect(() => {
    loadFromSupabase(false);
  }, []);

  // Bulk Seed Demo Records to Supabase
  const handleSeedDemoToSupabase = async () => {
    if (confirm("Örnek 5 kurban kaydını ve hissedarlarını Supabase veritabanına aktarmak istiyor musunuz?")) {
      setIsSaving(true);
      showToast("Örnek kayıtlar Supabase'e aktarılıyor...");
      const res = await bulkImportQurbansApi(SAMPLE_QURBAN_RECORDS);
      setIsSaving(false);
      if (res.success) {
        showToast("Örnek kayıtlar Supabase bulutuna başarıyla yüklendi!");
        await loadFromSupabase(false);
      } else {
        alert("Supabase'e aktarma başarısız oldu: " + (res.error || "Bilinmeyen hata"));
      }
    }
  };

  // Form State for Add / Edit
  const [formData, setFormData] = useState<Partial<QurbanRecord>>({
    qurbanNo: "",
    earTagNo: "",
    animalType: "buyukbas_tosun",
    animalTypeLabel: "Büyükbaş Tosun",
    status: "incoming",
    originCity: "",
    originFarm: "",
    truckPlate: "",
    driverName: "",
    driverPhone: "",
    dispatchNoteNo: "",
    arrivalDate: new Date().toISOString().split("T")[0],
    invoiceNo: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    supplierName: "",
    purchasePrice: 0,
    slaughterhouseName: "",
    slaughterDate: new Date().toISOString().split("T")[0],
    slaughterTime: "09:00",
    slaughterOrderNo: 1,
    butcherTeam: "",
    liveWeightKg: 0,
    carcassWeightKg: 0,
    totalShares: 7,
    shareholders: [],
    media: [],
    notes: "",
  });

  // Unique lists for filter dropdowns
  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.originCity) set.add(r.originCity);
    });
    return Array.from(set);
  }, [records]);

  const uniqueTrucks = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.truckPlate) set.add(r.truckPlate);
    });
    return Array.from(set);
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Status match
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      // City match
      if (cityFilter !== "all" && r.originCity !== cityFilter) return false;
      // Truck match
      if (truckFilter !== "all" && r.truckPlate !== truckFilter) return false;

      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const inNo = r.qurbanNo?.toLowerCase().includes(q);
      const inTag = r.earTagNo?.toLowerCase().includes(q);
      const inCity = r.originCity?.toLowerCase().includes(q);
      const inFarm = r.originFarm?.toLowerCase().includes(q);
      const inTruck = r.truckPlate?.toLowerCase().includes(q);
      const inSlaughter = r.slaughterhouseName?.toLowerCase().includes(q);
      const inInvoice = r.invoiceNo?.toLowerCase().includes(q);

      // Search inside shareholders
      const inShareholders = r.shareholders?.some(
        (sh) =>
          sh.fullName?.toLowerCase().includes(q) ||
          sh.phone?.toLowerCase().includes(q)
      );

      return (
        inNo ||
        inTag ||
        inCity ||
        inFarm ||
        inTruck ||
        inSlaughter ||
        inInvoice ||
        inShareholders
      );
    });
  }, [records, searchQuery, statusFilter, cityFilter, truckFilter]);

  // Paginated Records
  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = records.length;
    let completedCount = 0;
    let portionedCount = 0;
    let slaughteredCount = 0;
    let incomingCount = 0;
    let totalLiveKg = 0;
    let totalCarcassKg = 0;
    let totalShareholders = 0;
    let totalTurnover = 0;
    let totalPurchaseCost = 0;

    records.forEach((r) => {
      if (r.status === "completed") completedCount++;
      else if (r.status === "portioned") portionedCount++;
      else if (r.status === "slaughtered") slaughteredCount++;
      else incomingCount++;

      totalLiveKg += r.liveWeightKg || 0;
      totalCarcassKg += r.carcassWeightKg || 0;
      totalPurchaseCost += r.purchasePrice || 0;

      if (r.shareholders) {
        totalShareholders += r.shareholders.length;
        r.shareholders.forEach((sh) => {
          totalTurnover += sh.sharePrice || 0;
        });
      }
    });

    return {
      total,
      completedCount,
      portionedCount,
      slaughteredCount,
      incomingCount,
      totalLiveKg,
      totalCarcassKg,
      totalShareholders,
      totalTurnover,
      totalPurchaseCost,
    };
  }, [records]);

  // Open Edit Form
  const handleOpenEdit = (record: QurbanRecord) => {
    setEditingRecordId(record.id);
    setFormData(JSON.parse(JSON.stringify(record)));
    setEditModalOpen(true);
  };

  // Open New Form
  const handleOpenNew = () => {
    setEditingRecordId(null);
    const nextSeq = String(records.length + 1).padStart(3, "0");
    const defaultShares: QurbanShareholder[] = Array.from({ length: 7 }, (_, i) => ({
      id: `sh-${Date.now()}-${i + 1}`,
      shareIndex: i + 1,
      fullName: "",
      phone: "",
      shareRate: "1/7",
      targetWeightKg: 50,
      actualWeightKg: 50,
      sharePrice: 23000,
      isPaid: false,
      isDelivered: false,
    }));

    setFormData({
      qurbanNo: `KRB-${nextSeq}`,
      earTagNo: `TR34-${Math.floor(10000 + Math.random() * 90000)}`,
      animalType: "buyukbas_tosun",
      animalTypeLabel: "Büyükbaş Tosun",
      status: "incoming",
      originCity: "Kars",
      originFarm: "Merkez Besi Çiftliği",
      truckPlate: "34 KBR 10",
      driverName: "Ahmet Kaptan",
      driverPhone: "0532 000 00 00",
      dispatchNoteNo: `İRS-${nextSeq}`,
      arrivalDate: new Date().toISOString().split("T")[0],
      invoiceNo: `FTR2026-${nextSeq}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      supplierName: "Besi Tedarik A.Ş.",
      purchasePrice: 150000,
      slaughterhouseName: "Tuzla Büyükşehir Kesim Tesisi",
      slaughterDate: new Date().toISOString().split("T")[0],
      slaughterTime: "09:00",
      slaughterOrderNo: records.length + 1,
      butcherTeam: "Usta Kasap Ekibi",
      liveWeightKg: 680,
      carcassWeightKg: 370,
      totalShares: 7,
      shareholders: defaultShares,
      media: [
        {
          id: `m-demo-1`,
          type: "truck",
          title: "Sevk Tırı Fotoğrafı",
          url: DEMO_MEDIA.truck,
          uploadedAt: new Date().toISOString().split("T")[0],
        },
        {
          id: `m-demo-2`,
          type: "animal",
          title: "Kurbanlık Fotoğrafı",
          url: DEMO_MEDIA.animal,
          uploadedAt: new Date().toISOString().split("T")[0],
        },
      ],
      notes: "",
    });
    setEditModalOpen(true);
  };

  // Save Add/Edit Record with Supabase CRUD
  const handleSaveModalForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.qurbanNo?.trim() || !formData.earTagNo?.trim()) {
      alert("Lütfen Kurban No ve Küpe No alanlarını doldurunuz.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingRecordId) {
        // UPDATE in Supabase
        const updatedRecord = {
          ...records.find((r) => r.id === editingRecordId),
          ...formData,
          id: editingRecordId,
          updatedAt: new Date().toISOString(),
        } as QurbanRecord;

        const res = await updateQurbanApi(updatedRecord);
        if (res.success && res.data) {
          const updated = records.map((r) =>
            r.id === editingRecordId ? res.data! : r
          );
          handleSaveRecords(updated);
          showToast(`${formData.qurbanNo} Supabase'de başarıyla güncellendi.`);
        } else {
          // Fallback to local
          const updated = records.map((r) =>
            r.id === editingRecordId ? updatedRecord : r
          );
          handleSaveRecords(updated);
          showToast(`${formData.qurbanNo} yerel olarak güncellendi.`);
        }
      } else {
        // CREATE in Supabase
        const res = await createQurbanApi(formData);
        if (res.success && res.data) {
          handleSaveRecords([res.data, ...records]);
          showToast(`${formData.qurbanNo} Supabase veritabanına kaydedildi.`);
        } else {
          // Fallback to local
          const newRec: QurbanRecord = {
            ...formData,
            id: `krb-${Date.now()}`,
            createdAt: new Date().toISOString().split("T")[0],
            updatedAt: new Date().toISOString().split("T")[0],
          } as QurbanRecord;

          handleSaveRecords([newRec, ...records]);
          showToast(`${formData.qurbanNo} yerel olarak kaydedildi.`);
        }
      }
      setEditModalOpen(false);
    } catch (err: any) {
      alert("Kayıt sırasında hata oluştu: " + err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Record in Supabase
  const handleDeleteRecord = async (id: string, no: string) => {
    if (confirm(`${no} nolu kurban kaydını ve ilişkili tüm hissedarlarını silmek istediğinize emin misiniz?`)) {
      setIsSaving(true);
      try {
        const res = await deleteQurbanApi(id);
        const updated = records.filter((r) => r.id !== id);
        handleSaveRecords(updated);
        if (res.success) {
          showToast(`${no} Supabase'den başarıyla silindi.`);
        } else {
          showToast(`${no} yerel listeden silindi.`);
        }
      } catch (err: any) {
        alert("Silme işlemi başarısız: " + err?.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Add Photo to Form Data (Client-Side Compression + Supabase CDN Upload)
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "truck" | "animal" | "invoice" | "slaughter" | "weighing" | "other"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast("Fotoğraf optimize ediliyor ve WebP formatına dönüştürülüyor...");

      // 1. Client-Side HTML5 Canvas Compression (Resized to max 1600px, WebP quality 0.82)
      // Reduces 5-15MB phone photos to ~150-250KB (>95% bandwidth savings)
      const compressed = await compressImageFile(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.82,
        createThumbnail: true,
      });

      // 2. Upload to Supabase Storage with 1-year CDN Cache-Control header
      const uploadRes = await uploadImageToOptimizedStorage(
        compressed,
        `qurban/${type}`
      );

      const finalUrl = uploadRes.url || compressed.dataUrl;

      const newMedia: QurbanMedia = {
        id: `m-${Date.now()}`,
        type,
        title:
          type === "truck"
            ? `Sevk Tırı Fotoğrafı (${file.name})`
            : type === "animal"
            ? `Kurbanlık Fotoğrafı (${file.name})`
            : type === "invoice"
            ? `Fatura Belgesi (${file.name})`
            : `Tartım / Kesim Belgesi (${file.name})`,
        url: finalUrl,
        uploadedAt: new Date().toISOString().split("T")[0],
      };

      setFormData((prev) => ({
        ...prev,
        media: [...(prev.media || []), newMedia],
      }));

      showToast(
        `✅ Optimize edildi: ${formatBytes(compressed.originalSize)} ➔ ${formatBytes(
          compressed.compressedSize
        )} (%${compressed.reductionPercent} tasarruf)`
      );
    } catch (err: any) {
      console.error("Fotoğraf sıkıştırma hatası:", err);
      showToast("Fotoğraf işlenirken bir sorun oluştu.");
    } finally {
      // Reset input value so same file can be selected again if needed
      e.target.value = "";
    }
  };

  // Remove Photo from Form
  const handleRemoveMedia = (mediaId: string) => {
    setFormData((prev) => ({
      ...prev,
      media: (prev.media || []).filter((m) => m.id !== mediaId),
    }));
  };

  // Excel Bulk Import Parser
  const handleExcelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          alert("Excel dosyasında veri bulunamadı.");
          return;
        }

        // Group rows by Kurban No
        const kurbanMap = new Map<string, Partial<QurbanRecord>>();

        data.forEach((row: any, idx: number) => {
          const qNo = String(
            row["Kurban No"] || row["KurbanNo"] || `KRB-${String(idx + 1).padStart(3, "0")}`
          ).trim();

          if (!kurbanMap.has(qNo)) {
            kurbanMap.set(qNo, {
              id: `krb-imp-${Date.now()}-${idx}`,
              qurbanNo: qNo,
              earTagNo: String(row["Küpe No"] || row["KüpeNo"] || `TR-${idx + 1}`).trim(),
              animalType: "buyukbas_tosun",
              animalTypeLabel: String(row["Hayvan Türü"] || "Büyükbaş Tosun"),
              status: "completed",
              originCity: String(row["Geldiği İl"] || "Kars"),
              originFarm: String(row["Çiftlik"] || row["Çiftlik/Besi"] || "Yayla Besi"),
              truckPlate: String(row["Tır Plakası"] || "34 KBR 01"),
              dispatchNoteNo: String(row["Sevk İrsaliye No"] || ""),
              arrivalDate: String(row["Geliş Tarihi"] || new Date().toISOString().split("T")[0]),
              invoiceNo: String(row["Alış Fatura No"] || `FTR-${qNo}`),
              invoiceDate: new Date().toISOString().split("T")[0],
              supplierName: String(row["Tedarikçi/Satıcı"] || "Besi Kooperatifi"),
              purchasePrice: Number(row["Alış Fiyatı (₺)"] || row["Alış Fiyatı"]) || 150000,
              slaughterhouseName: String(row["Kesimhane"] || row["Kesim Yeri"] || "Mezbaha"),
              slaughterDate: String(row["Kesim Tarihi"] || new Date().toISOString().split("T")[0]),
              liveWeightKg: Number(row["Canlı Kilo (Kg)"] || row["Canlı Kilo"]) || 650,
              carcassWeightKg: Number(row["Karkas Kilo (Kg)"] || row["Karkas Kilo"]) || 360,
              totalShares: Number(row["Toplam Hisse"] || row["Hisse Sayısı"]) || 7,
              shareholders: [],
              media: [
                {
                  id: `m-imp-truck-${idx}`,
                  type: "truck",
                  title: "Sevk Tırı",
                  url: DEMO_MEDIA.truck,
                  uploadedAt: new Date().toISOString().split("T")[0],
                },
                {
                  id: `m-imp-animal-${idx}`,
                  type: "animal",
                  title: "Kurbanlık",
                  url: DEMO_MEDIA.animal,
                  uploadedAt: new Date().toISOString().split("T")[0],
                },
              ],
              notes: String(row["Özel Notlar"] || ""),
              createdAt: new Date().toISOString().split("T")[0],
              updatedAt: new Date().toISOString().split("T")[0],
            });
          }

          // Add shareholder if present in row
          const shName = row["Hissedar Adı"] || row["Hissedar Adı Soyadı"];
          if (shName) {
            const current = kurbanMap.get(qNo)!;
            const shList = current.shareholders || [];
            const shIndex = shList.length + 1;
            const sharePrice = Number(row["Hisse Bedeli (₺)"] || row["Hisse Bedeli"]) || 22000;
            const kg = Number(row["Düşen Et (Kg)"] || row["Hisse Düşen Kilo"]) || 52;
            const paidStr = String(row["Ödeme Durumu"] || "").toLowerCase();
            const delStr = String(row["Teslim Durumu"] || row["Teslim Edildi mi"] || "").toLowerCase();

            shList.push({
              id: `sh-imp-${Date.now()}-${idx}`,
              shareIndex: shIndex,
              fullName: String(shName).trim(),
              phone: String(row["Hissedar Tel"] || row["Hissedar Telefon"] || "").trim(),
              shareRate: `1/${current.totalShares || 7}`,
              targetWeightKg: kg,
              actualWeightKg: kg,
              sharePrice,
              isPaid: paidStr.includes("ödendi") || paidStr.includes("evet"),
              isDelivered: delStr.includes("evet") || delStr.includes("teslim"),
              deliveryDate: String(row["Teslim Tarihi"] || ""),
              deliveredTo: String(row["Teslim Alan"] || ""),
            });
            current.shareholders = shList;
          }
        });

        const importedList = Array.from(kurbanMap.values()) as QurbanRecord[];

        // Bulk insert to Supabase
        setIsSaving(true);
        showToast(`${importedList.length} adet kurban Supabase bulutuna aktarılıyor...`);

        bulkImportQurbansApi(importedList)
          .then((res) => {
            if (res.success) {
              showToast(`Tebrikler! ${res.count || importedList.length} adet kurban Supabase'e aktarıldı.`);
              loadFromSupabase(false);
            } else {
              handleSaveRecords([...importedList, ...records]);
              showToast(`${importedList.length} adet kurban yerel olarak aktarıldı (Supabase: ${res.error}).`);
            }
          })
          .catch((err) => {
            handleSaveRecords([...importedList, ...records]);
            showToast(`${importedList.length} adet kurban yerel olarak aktarıldı.`);
          })
          .finally(() => {
            setIsSaving(false);
            setImportModalOpen(false);
          });
      } catch (err: any) {
        alert("Excel okuma hatası: " + err?.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Reset to sample records or seed to Supabase
  const handleResetSampleRecords = async () => {
    if (confirm("Örnek kurban kayıtlarını yüklemek istediğinize emin misiniz?")) {
      handleSaveRecords(SAMPLE_QURBAN_RECORDS);
      showToast("Örnek kurban kayıtları yüklendi.");
    }
  };

  // Print Digital Report
  const handlePrintReport = () => {
    window.print();
  };

  // Open WhatsApp with Shareholder message
  const handleSendWhatsApp = (qurban: QurbanRecord, sh: QurbanShareholder) => {
    const text = generateShareholderWhatsAppText(qurban, sh);
    const cleanPhone = sh.phone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.startsWith("0")
      ? `9${cleanPhone}`
      : cleanPhone.startsWith("90")
      ? cleanPhone
      : `90${cleanPhone}`;

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/95 text-white border border-emerald-500/30 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 border border-emerald-500/25 text-white p-6 sm:p-8 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold tracking-wide uppercase mb-3 backdrop-blur-md">
              <Truck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kurban Takip & Dijital Raporlama Modülü</span>
              <span className="text-emerald-400/50">•</span>
              <span className="text-[11px] font-semibold text-emerald-200">
                400-500 Kurban Kapasitesi
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              Kurban Sevkiyat, Kesimhane & Hissedar Raporu
            </h1>
            <p className="text-sm text-slate-300/90 leading-relaxed">
              Kurbanların nereden geldiği (sevk tırı, menşei, çiftlik), alış faturası, nerede ve ne zaman kesildiği,
              kaç hisse olduğu, hissedarlara kaçar kilo et düştüğü ve fotoğraflı dijital karne raporlarını tek ekranda yönetin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Supabase Cloud Status Pill */}
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border ${
                isCloudLoading
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
                  : isSupabaseConnected
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200"
                  : "bg-slate-800/80 border-slate-700 text-slate-300"
              }`}
            >
              {isCloudLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
              ) : (
                <Database className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>
                {isCloudLoading
                  ? "Eşitleniyor..."
                  : isSupabaseConnected
                  ? `Supabase (${records.length})`
                  : "Yerel Mod"}
              </span>
              <button
                onClick={() => loadFromSupabase(true)}
                disabled={isCloudLoading}
                title="Supabase'den verileri yeniden çek"
                className="ml-1 p-0.5 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isCloudLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {records.length === 0 && (
              <button
                onClick={handleSeedDemoToSupabase}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-bold text-xs sm:text-sm transition-all shadow-md"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Örnek 5 Kaydı Supabase'e Yaz</span>
              </button>
            )}

            <button
              onClick={handleOpenNew}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-600/25 hover:scale-102"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Kurban Ekle</span>
            </button>

            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 font-semibold text-xs sm:text-sm transition-all shadow-md"
            >
              <Upload className="w-4 h-4" />
              <span>Toplu Excel Yükle</span>
            </button>

            <button
              onClick={() => exportQurbanRecordsToExcel(filteredRecords)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 font-semibold text-xs sm:text-sm transition-all backdrop-blur-md"
              title="Filtrelenen listeyi Excel'e aktar"
            >
              <FileDown className="w-4 h-4" />
              <span>Excel Rapor İndir</span>
            </button>
          </div>
        </div>

        {/* Dashboard Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/10">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              Toplam Kurban
            </div>
            <div className="text-2xl font-black text-white font-mono mt-0.5">
              {stats.total}
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold">
              {stats.completedCount} Kesildi & Dağıtıldı
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              Toplam Hissedar
            </div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">
              {stats.totalShareholders}
            </div>
            <div className="text-[10px] text-slate-300">
              Paydaş Dağıtımı
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              Toplam Canlı Kilo
            </div>
            <div className="text-2xl font-black text-indigo-400 font-mono mt-0.5">
              {stats.totalLiveKg.toLocaleString("tr-TR")} <span className="text-xs font-normal">kg</span>
            </div>
            <div className="text-[10px] text-slate-300">
              Baskül Ağırlığı
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              Toplam Net Karkas Et
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
              {stats.totalCarcassKg.toLocaleString("tr-TR")} <span className="text-xs font-normal">kg</span>
            </div>
            <div className="text-[10px] text-emerald-300">
              Dağıtılan Kemikli/Kemiksiz
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              Alış Maliyeti
            </div>
            <div className="text-lg font-black text-rose-400 font-mono mt-1 truncate">
              ₺{stats.totalPurchaseCost.toLocaleString("tr-TR")}
            </div>
            <div className="text-[10px] text-slate-400">
              Fatura Bedelleri
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              Hisse Toplamı
            </div>
            <div className="text-lg font-black text-emerald-300 font-mono mt-1 truncate">
              ₺{stats.totalTurnover.toLocaleString("tr-TR")}
            </div>
            <div className="text-[10px] text-emerald-400">
              Hissedar Gelirleri
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filter & Bulk Controls */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="lg:col-span-5 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kurban No, Küpe No, Hissedar Adı, Tır Plakası, İl veya Fatura No..."
              className="w-full px-4 py-2.5 pl-10 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="lg:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              <option value="all">Tüm Durumlar ({records.length})</option>
              <option value="incoming">🚛 Yolda / Sevkiyatta</option>
              <option value="at_slaughterhouse">🏢 Kesimhanede Bekliyor</option>
              <option value="slaughtered">🔪 Kesildi / Tartımda</option>
              <option value="portioned">🥩 Pay Ediliyor</option>
              <option value="completed">✅ Kesildi & Dağıtıldı</option>
            </select>
          </div>

          {/* City Filter */}
          <div className="lg:col-span-2">
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              <option value="all">Tüm İller</option>
              {uniqueCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Truck Filter */}
          <div className="lg:col-span-2">
            <select
              value={truckFilter}
              onChange={(e) => setTruckFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              <option value="all">Tüm Sevk Tırları</option>
              {uniqueTrucks.map((t) => (
                <option key={t} value={t}>
                  🚛 {t}
                </option>
              ))}
            </select>
          </div>

          {/* Reset / Sample Data */}
          <div className="lg:col-span-1 flex items-center justify-end">
            <button
              onClick={handleResetSampleRecords}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
              title="Örnek Verileri Yükle"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Records Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <span>Kurban Dosya & Rapor Listesi</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {filteredRecords.length} Kurban
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Her kurbanın küpe no, menşei, sevk tırı, faturası, kesimhane ve hisse detayları.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Sayfa Başına:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500 (Tümü)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-24">Kurban No</th>
                <th className="py-3 px-4">Küpe No & Tür</th>
                <th className="py-3 px-4">Sevkiyat & Tır</th>
                <th className="py-3 px-4">Fatura & Maliyet</th>
                <th className="py-3 px-4">Kesimhane & Sıra</th>
                <th className="py-3 px-4 text-right">Kilo (Canlı/Et)</th>
                <th className="py-3 px-4">Hissedarlar ({7})</th>
                <th className="py-3 px-4 text-center">Fotoğraflar</th>
                <th className="py-3 px-4 text-center">Durum</th>
                <th className="py-3 px-4 text-center w-32">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedRecords.length > 0 ? (
                paginatedRecords.map((q) => {
                  const paidCount = q.shareholders?.filter((s) => s.isPaid).length || 0;
                  const deliveredCount =
                    q.shareholders?.filter((s) => s.isDelivered).length || 0;

                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Qurban No */}
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs font-mono">
                          {q.qurbanNo}
                        </span>
                      </td>

                      {/* Ear Tag & Animal Type */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {q.earTagNo}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {q.animalTypeLabel || q.animalType}
                        </div>
                      </td>

                      {/* Shipment & Truck */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{q.truckPlate}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {q.originCity} • {q.originFarm}
                        </div>
                      </td>

                      {/* Invoice & Purchase */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                          {q.invoiceNo}
                        </div>
                        <div className="text-[11px] text-rose-500 font-bold font-mono">
                          ₺{q.purchasePrice?.toLocaleString("tr-TR")}
                        </div>
                      </td>

                      {/* Slaughterhouse */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs">
                          {q.slaughterhouseName}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {q.slaughterDate} {q.slaughterTime || ""} (Sıra #{q.slaughterOrderNo || 1})
                          </span>
                        </div>
                      </td>

                      {/* Weights */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {q.carcassWeightKg || "-"} kg <span className="text-[10px] text-slate-400">et</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {q.liveWeightKg || "-"} kg canlı
                        </div>
                      </td>

                      {/* Shareholders Summary */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-amber-500" />
                          <span>
                            {q.shareholders?.length || 0} / {q.totalShares || 7} Hisse
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Ödeme: {paidCount}/{q.shareholders?.length || 0} • Teslim: {deliveredCount}/{q.shareholders?.length || 0}
                        </div>
                      </td>

                      {/* Media Photos Badge */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {q.media && q.media.length > 0 ? (
                            <button
                              onClick={() => setActiveReportModalRecord(q)}
                              className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] flex items-center gap-1 hover:bg-indigo-100"
                              title="Fotoğrafları gör"
                            >
                              <Camera className="w-3 h-3" />
                              <span>{q.media.length} Foto</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            q.status === "completed"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400"
                              : q.status === "portioned"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400"
                              : q.status === "slaughtered"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400"
                          }`}
                        >
                          {q.status === "completed"
                            ? "Dağıtıldı"
                            : q.status === "portioned"
                            ? "Pay Ediliyor"
                            : q.status === "slaughtered"
                            ? "Kesildi"
                            : "Yolda"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setActiveReportModalRecord(q)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all"
                            title="Dijital Kurban Karnesini & Raporunu Aç"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Rapor</span>
                          </button>

                          <button
                            onClick={() => handleOpenEdit(q)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Düzenle"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteRecord(q.id, q.qurbanNo)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Arama kriterlerinize uygun kurban kaydı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div>
            Toplam <strong>{filteredRecords.length}</strong> kurban kaydı (Sayfa {currentPage} / {totalPages})
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50"
            >
              Önceki
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: DİJİTAL KURBAN RAPORU & HİSSEDAR KARNESİ (YAZDIRILABİLİR)    */}
      {/* ===================================================================== */}
      {activeReportModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-lg shadow-emerald-600/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>DİJİTAL KURBAN RAPORU & KARNESİ</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-mono">
                      {activeReportModalRecord.qurbanNo}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Küpe No: {activeReportModalRecord.earTagNo} • {activeReportModalRecord.animalTypeLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintReport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">Raporu Yazdır / PDF</span>
                </button>

                <button
                  onClick={() => setActiveReportModalRecord(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Printable Certificate */}
            <div className="p-6 space-y-6 text-xs text-slate-800 dark:text-slate-200">
              {/* Top Details Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Sevkiyat & Menşei */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
                    <Truck className="w-4 h-4" />
                    <span>Sevkiyat & Menşei</span>
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {activeReportModalRecord.originCity} / {activeReportModalRecord.originFarm}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 space-y-1">
                    <div><strong>Sevk Tırı:</strong> {activeReportModalRecord.truckPlate}</div>
                    <div><strong>Şoför:</strong> {activeReportModalRecord.driverName || "-"} ({activeReportModalRecord.driverPhone || "-"})</div>
                    <div><strong>Geliş Tarihi:</strong> {activeReportModalRecord.arrivalDate}</div>
                    {activeReportModalRecord.dispatchNoteNo && (
                      <div><strong>İrsaliye No:</strong> {activeReportModalRecord.dispatchNoteNo}</div>
                    )}
                  </div>
                </div>

                {/* 2. Kesimhane & Mezbaha */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                    <Building className="w-4 h-4" />
                    <span>Kesimhane & Mezbaha</span>
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {activeReportModalRecord.slaughterhouseName}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 space-y-1">
                    <div><strong>Kesim Tarihi:</strong> {activeReportModalRecord.slaughterDate} {activeReportModalRecord.slaughterTime || ""}</div>
                    <div><strong>Kesim Sıra No:</strong> #{activeReportModalRecord.slaughterOrderNo || 1}</div>
                    <div><strong>Kasap Ekibi:</strong> {activeReportModalRecord.butcherTeam || "Usta Kasaplar"}</div>
                    <div><strong>Canlı Kilo:</strong> {activeReportModalRecord.liveWeightKg || "-"} kg</div>
                  </div>
                </div>

                {/* 3. Fatura & Karkas Tartım */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider text-[11px]">
                    <Scale className="w-4 h-4" />
                    <span>Fatura & Net Et Tartımı</span>
                  </div>
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {activeReportModalRecord.carcassWeightKg || "-"} KG NET KARKAS
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 space-y-1">
                    <div><strong>Fatura No:</strong> {activeReportModalRecord.invoiceNo}</div>
                    <div><strong>Satıcı:</strong> {activeReportModalRecord.supplierName}</div>
                    <div><strong>Alış Bedeli:</strong> ₺{activeReportModalRecord.purchasePrice?.toLocaleString("tr-TR")}</div>
                    <div>
                      <strong>Hisse Başı Et:</strong>{" "}
                      {activeReportModalRecord.carcassWeightKg && activeReportModalRecord.totalShares
                        ? `~${(activeReportModalRecord.carcassWeightKg / activeReportModalRecord.totalShares).toFixed(1)} kg`
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Photos Gallery */}
              {activeReportModalRecord.media && activeReportModalRecord.media.length > 0 && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-500" />
                    <span>Kurban Belgeleri & Sevkiyat Fotoğrafları ({activeReportModalRecord.media.length})</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {activeReportModalRecord.media.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setPhotoPreviewUrl(m.url)}
                        className="group relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 cursor-pointer shadow-xs hover:border-emerald-500 transition-all"
                      >
                        <img
                          src={m.url}
                          alt={m.title}
                          className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
                          <div className="font-bold text-[11px] truncate text-slate-900 dark:text-slate-100">
                            {m.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {m.uploadedAt}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shareholders Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    <span>Hissedarlar & Pay Dağıtım Tablosu ({activeReportModalRecord.shareholders?.length || 0} Pay)</span>
                  </h4>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3 w-12 text-center">Hisse</th>
                        <th className="py-2.5 px-3">Hissedar Adı Soyadı</th>
                        <th className="py-2.5 px-3">Telefon</th>
                        <th className="py-2.5 px-3 text-right">Düşen Et (Kg)</th>
                        <th className="py-2.5 px-3 text-right">Hisse Bedeli</th>
                        <th className="py-2.5 px-3 text-center">Ödeme</th>
                        <th className="py-2.5 px-3 text-center">Teslimat</th>
                        <th className="py-2.5 px-3 text-center w-28">WhatsApp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeReportModalRecord.shareholders &&
                        activeReportModalRecord.shareholders.map((sh) => (
                          <tr key={sh.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                              #{sh.shareIndex}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                              {sh.fullName || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono">
                              {sh.phone || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {sh.actualWeightKg || sh.targetWeightKg || "-"} kg
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800 dark:text-slate-200">
                              ₺{sh.sharePrice?.toLocaleString("tr-TR")}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  sh.isPaid
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                }`}
                              >
                                {sh.isPaid ? "Ödendi" : "Bekliyor"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  sh.isDelivered
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                }`}
                              >
                                {sh.isDelivered ? "Teslim Edildi" : "Bekliyor"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {sh.phone ? (
                                <button
                                  onClick={() =>
                                    handleSendWhatsApp(activeReportModalRecord, sh)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] inline-flex items-center gap-1 shadow-xs"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Gönder</span>
                                </button>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Special Notes & Veterinary Statement */}
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300 leading-relaxed text-xs">
                <strong>İslami Usullere Uygunluk & Veteriner Sağlık Beyanı:</strong>{" "}
                Bu kurbanlık, Tarım ve Orman Bakanlığı kulak küpe ve sağlık raporlarına uygun olarak temin edilmiş,
                vekaleti alınan hissedarlar adına bayram namazı sonrasında tekbir ve dualar eşliğinde İslami usullere göre kesilmiş
                ve hijyenik ortamda pay edilerek teslim edilmiştir.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ADD / EDIT KURBAN DOSYASI                                    */}
      {/* ===================================================================== */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-500" />
                <span>
                  {editingRecordId ? "Kurban Dosyasını Düzenle" : "Yeni Kurban Dosyası Oluştur"}
                </span>
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalForm} className="space-y-4 text-xs">
              {/* Row 1: Qurban No, Ear Tag, Animal Type, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kurban No *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.qurbanNo || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, qurbanNo: e.target.value })
                    }
                    placeholder="Örn: KRB-001"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Küpe No *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.earTagNo || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, earTagNo: e.target.value })
                    }
                    placeholder="Örn: TR34-89421"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hayvan Türü
                  </label>
                  <select
                    value={formData.animalType || "buyukbas_tosun"}
                    onChange={(e) => {
                      const val = e.target.value;
                      const label =
                        val === "buyukbas_tosun"
                          ? "Büyükbaş Tosun"
                          : val === "buyukbas_duve"
                          ? "Büyükbaş Düve"
                          : val === "buyukbas_dana"
                          ? "Büyükbaş Dana"
                          : "Küçükbaş Koç/Koyun";
                      setFormData({ ...formData, animalType: val, animalTypeLabel: label });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-semibold"
                  >
                    <option value="buyukbas_tosun">Büyükbaş Tosun</option>
                    <option value="buyukbas_duve">Büyükbaş Düve</option>
                    <option value="buyukbas_dana">Büyükbaş Dana</option>
                    <option value="kucukbas_koc">Küçükbaş Koç</option>
                    <option value="kucukbas_koyun">Küçükbaş Koyun</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    İşlem Durumu
                  </label>
                  <select
                    value={formData.status || "incoming"}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-semibold"
                  >
                    <option value="incoming">🚛 Yolda / Sevkiyatta</option>
                    <option value="at_slaughterhouse">🏢 Kesimhanede Bekliyor</option>
                    <option value="slaughtered">🔪 Kesildi / Tartımda</option>
                    <option value="portioned">🥩 Pay Ediliyor</option>
                    <option value="completed">✅ Kesildi & Dağıtıldı</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Origin, Farm, Truck, Arrival */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 space-y-3">
                <div className="font-extrabold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 uppercase text-[11px]">
                  <Truck className="w-4 h-4" />
                  <span>Sevkiyat & Menşei Bilgileri</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Geldiği İl</label>
                    <input
                      type="text"
                      placeholder="Örn: Kars, Erzurum"
                      value={formData.originCity || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, originCity: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Çiftlik / Besihane</label>
                    <input
                      type="text"
                      placeholder="Örn: Serhat Besi Çiftliği"
                      value={formData.originFarm || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, originFarm: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Sevk Tırı Plakası</label>
                    <input
                      type="text"
                      placeholder="Örn: 36 KBR 124"
                      value={formData.truckPlate || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, truckPlate: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Geliş Tarihi</label>
                    <input
                      type="date"
                      value={formData.arrivalDate || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, arrivalDate: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Invoice, Supplier, Purchase Price */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase text-[11px]">
                  <FileText className="w-4 h-4 text-purple-500" />
                  <span>Fatura & Alış Maliyet Bilgileri</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Alış Fatura No</label>
                    <input
                      type="text"
                      placeholder="Örn: FTR2026-0012"
                      value={formData.invoiceNo || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, invoiceNo: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Tedarikçi / Satıcı</label>
                    <input
                      type="text"
                      placeholder="Örn: Kars Besiciler Birliği"
                      value={formData.supplierName || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, supplierName: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Alış Fiyatı (₺)</label>
                    <input
                      type="number"
                      value={formData.purchasePrice || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          purchasePrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Ek Masraflar (₺)</label>
                    <input
                      type="number"
                      placeholder="Nakliye, kesim vb."
                      value={formData.additionalCosts || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          additionalCosts: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Slaughterhouse & Weighing */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-3">
                <div className="font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 uppercase text-[11px]">
                  <Scale className="w-4 h-4" />
                  <span>Kesimhane & Kilo Tartım Bilgisi</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Kesimhane (Mezbaha)</label>
                    <input
                      type="text"
                      placeholder="Örn: Tuzla Büyükşehir Kesim Tesisi"
                      value={formData.slaughterhouseName || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, slaughterhouseName: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Kesim Sıra No</label>
                    <input
                      type="number"
                      value={formData.slaughterOrderNo || 1}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          slaughterOrderNo: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Canlı Ağırlık (Kg)</label>
                    <input
                      type="number"
                      placeholder="680"
                      value={formData.liveWeightKg || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          liveWeightKg: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-emerald-600 dark:text-emerald-400">
                      Net Karkas Et (Kg) *
                    </label>
                    <input
                      type="number"
                      placeholder="370"
                      required
                      value={formData.carcassWeightKg || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const shares = formData.totalShares || 7;
                        const perShare = shares > 0 ? Math.round((val / shares) * 10) / 10 : 0;

                        // Auto recalculate shareholders weights
                        const updatedSh = (formData.shareholders || []).map((s) => ({
                          ...s,
                          actualWeightKg: perShare,
                          targetWeightKg: perShare,
                        }));

                        setFormData({
                          ...formData,
                          carcassWeightKg: val,
                          shareholders: updatedSh,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-400 dark:border-emerald-600 font-mono font-bold text-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Row 5: Photo Uploads */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase text-[11px]">
                      <Camera className="w-4 h-4 text-indigo-500" />
                      <span>Kurban & Sevkiyat Fotoğrafları ({formData.media?.length || 0})</span>
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                      <Sparkles className="w-3 h-3" />
                      Cihaz içi WebP sıkıştırma & 1 yıl CDN önbelleği devrede (%95+ kota tasarrufu)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] cursor-pointer flex items-center gap-1 transition-transform active:scale-95 shadow-xs">
                      <Truck className="w-3 h-3" />
                      <span>+ Tır Fotoğrafı</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "truck")}
                      />
                    </label>

                    <label className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer flex items-center gap-1 transition-transform active:scale-95 shadow-xs">
                      <ImageIcon className="w-3 h-3" />
                      <span>+ Hayvan Fotoğrafı</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "animal")}
                      />
                    </label>

                    <label className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] cursor-pointer flex items-center gap-1 transition-transform active:scale-95 shadow-xs">
                      <Scale className="w-3 h-3" />
                      <span>+ Fatura / Tartım</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "weighing")}
                      />
                    </label>
                  </div>
                </div>

                {formData.media && formData.media.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                    {formData.media.map((m) => (
                      <div
                        key={m.id}
                        className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 group shadow-xs"
                      >
                        <img
                          src={m.url}
                          alt={m.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-20 object-cover"
                        />
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-900/80 text-emerald-400 backdrop-blur-xs">
                          {m.url.startsWith("http") ? "Supabase CDN" : "WebP"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedia(m.id)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 text-white shadow-xs opacity-90 hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="p-1 bg-white dark:bg-slate-900 text-[10px] font-semibold truncate text-slate-800 dark:text-slate-200">
                          {m.title}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 6: Shareholders Details */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase text-[11px]">
                    <Users className="w-4 h-4 text-emerald-500" />
                    <span>Hissedarlar ({formData.shareholders?.length || 0} Kişi)</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const count = formData.shareholders?.length || 0;
                        const perShare =
                          formData.carcassWeightKg && count + 1 > 0
                            ? Math.round((formData.carcassWeightKg / (count + 1)) * 10) / 10
                            : 50;

                        const newSh: QurbanShareholder = {
                          id: `sh-${Date.now()}-${count + 1}`,
                          shareIndex: count + 1,
                          fullName: "",
                          phone: "",
                          shareRate: `1/${count + 1}`,
                          targetWeightKg: perShare,
                          actualWeightKg: perShare,
                          sharePrice: 23000,
                          isPaid: false,
                          isDelivered: false,
                        };

                        setFormData({
                          ...formData,
                          totalShares: count + 1,
                          shareholders: [...(formData.shareholders || []), newSh],
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-[10px]"
                    >
                      + Hissedar Ekle
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {formData.shareholders &&
                    formData.shareholders.map((sh, idx) => (
                      <div
                        key={sh.id}
                        className="grid grid-cols-12 gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center text-xs"
                      >
                        <div className="col-span-1 text-center font-bold text-slate-400">
                          #{idx + 1}
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            placeholder="Hissedar Adı Soyadı"
                            value={sh.fullName || ""}
                            onChange={(e) => {
                              const updated = [...(formData.shareholders || [])];
                              updated[idx].fullName = e.target.value;
                              setFormData({ ...formData, shareholders: updated });
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-bold"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="text"
                            placeholder="Telefon (WhatsApp)"
                            value={sh.phone || ""}
                            onChange={(e) => {
                              const updated = [...(formData.shareholders || [])];
                              updated[idx].phone = e.target.value;
                              setFormData({ ...formData, shareholders: updated });
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-mono"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            placeholder="Et Kg"
                            value={sh.actualWeightKg || ""}
                            onChange={(e) => {
                              const updated = [...(formData.shareholders || [])];
                              updated[idx].actualWeightKg = parseFloat(e.target.value) || 0;
                              setFormData({ ...formData, shareholders: updated });
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-mono text-emerald-600 font-bold text-right"
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sh.isPaid}
                              onChange={(e) => {
                                const updated = [...(formData.shareholders || [])];
                                updated[idx].isPaid = e.target.checked;
                                setFormData({ ...formData, shareholders: updated });
                              }}
                            />
                            <span>Ödendi</span>
                          </label>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold shadow-lg shadow-emerald-600/25 transition-all"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSaving ? "Kaydediliyor..." : "Kaydet"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: TOPLU EXCEL YÜKLEME (400-500 KURBAN)                         */}
      {/* ===================================================================== */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
                <span>Toplu Excel Kurban Yükleme (400-500 Kurban)</span>
              </h3>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              400-500 kurbanlık listenizi, hissedarları, kilo tartımlarını ve fatura bilgilerini tek bir Excel dosyasından anında içeri aktarabilirsiniz.
            </p>

            {/* Template Download Button */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 flex items-center justify-between">
              <div>
                <div className="font-bold text-xs text-indigo-900 dark:text-indigo-300">
                  Örnek Excel Şablonu
                </div>
                <div className="text-[11px] text-slate-500">
                  Doğru sütun başlıkları için hazır şablonu indirin.
                </div>
              </div>
              <button
                onClick={downloadQurbanImportTemplate}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Şablonu İndir</span>
              </button>
            </div>

            {/* File Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 dark:bg-slate-950 transition-all group"
            >
              <Upload className="w-10 h-10 text-slate-400 group-hover:text-emerald-500 mx-auto mb-2 transition-colors" />
              <div className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mb-1">
                Excel Dosyanızı Seçin veya Buraya Sürükleyin
              </div>
              <div className="text-xs text-slate-400">
                .XLSX veya .CSV formatı desteklenir
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleExcelFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Photo Preview */}
      {photoPreviewUrl && (
        <div
          onClick={() => setPhotoPreviewUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md cursor-pointer animate-in fade-in"
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={photoPreviewUrl}
              alt="Fotoğraf Önizleme"
              className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain border border-white/20"
            />
            <button
              onClick={() => setPhotoPreviewUrl(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-slate-900 text-white border border-white/30"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
