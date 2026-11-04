import * as XLSX from "xlsx";
import {
  KurbanAnimal,
  KurbanProcessOrganization,
  KurbanCuttingLocation,
  KurbanParty,
  KurbanContract,
  KurbanShipment,
  KurbanSlaughterBatch,
  KurbanStorageRecord,
  KurbanInvoice,
  KurbanDelivery,
  KurbanDocument,
  KurbanReport,
  KurbanProcessStats,
} from "../types/kurbanProcess";

/**
 * Fetch general process overview (stats, locations, parties, reports, etc.)
 */
export async function fetchProcessOverviewApi(locationId?: string): Promise<{
  success: boolean;
  source?: string;
  organization?: KurbanProcessOrganization;
  organizations?: KurbanProcessOrganization[];
  cuttingLocations?: KurbanCuttingLocation[];
  parties?: KurbanParty[];
  contracts?: KurbanContract[];
  shipments?: KurbanShipment[];
  slaughterBatches?: KurbanSlaughterBatch[];
  storageRecords?: KurbanStorageRecord[];
  deliveries?: KurbanDelivery[];
  invoices?: KurbanInvoice[];
  documents?: KurbanDocument[];
  reports?: KurbanReport[];
  totalAnimalCount?: number;
  stats?: KurbanProcessStats;
  error?: string;
}> {
  try {
    const url = `/api/kurban-process${
      locationId && locationId !== "all" ? `?locationId=${encodeURIComponent(locationId)}` : ""
    }`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, error: `Sunucu hatası: ${res.status}` };
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || "Bağlantı hatası" };
  }
}

/**
 * Fetch animals with pagination, search, and filters
 */
export async function fetchAnimalsApi(params: {
  page?: number;
  pageSize?: number;
  locationId?: string;
  status?: string;
  search?: string;
}): Promise<{
  success: boolean;
  animals: KurbanAnimal[];
  totalCount: number;
  page: number;
  pageSize: number;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    if (params.locationId && params.locationId !== "all") {
      query.set("locationId", params.locationId);
    }
    if (params.status && params.status !== "all") {
      query.set("status", params.status);
    }
    if (params.search) query.set("search", params.search);

    const res = await fetch(`/api/kurban-process/animals?${query.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, animals: [], totalCount: 0, page: 1, pageSize: 50, error: `Hata: ${res.status}` };
    }

    return await res.json();
  } catch (err: any) {
    return { success: false, animals: [], totalCount: 0, page: 1, pageSize: 50, error: err?.message };
  }
}

/**
 * Bulk import animals from Excel
 */
export async function bulkImportAnimalsApi(animals: Partial<KurbanAnimal>[]): Promise<{
  success: boolean;
  count?: number;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/kurban-process/animals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: true, animals }),
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || "Toplu içe aktarma hatası." };
  }
}

/**
 * Create a single animal
 */
export async function createAnimalApi(animal: Partial<KurbanAnimal>): Promise<{
  success: boolean;
  animal?: KurbanAnimal;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/kurban-process/animals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(animal),
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Update single animal
 */
export async function updateAnimalApi(animal: KurbanAnimal): Promise<{
  success: boolean;
  animal?: KurbanAnimal;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/kurban-process/animals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(animal),
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Delete single animal
 */
export async function deleteAnimalApi(id: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/kurban-process/animals?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Seed 350 animals & 2 slaughterhouse records to Supabase
 */
export async function seedDemoDataToSupabaseApi(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/kurban-process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed_demo_to_supabase" }),
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Fetch reports by location or ID
 */
export async function fetchReportsApi(locationId?: string, reportId?: string): Promise<{
  success: boolean;
  reports: KurbanReport[];
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (locationId && locationId !== "all") query.set("locationId", locationId);
    if (reportId) query.set("reportId", reportId);

    const res = await fetch(`/api/kurban-process/reports?${query.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, reports: [], error: err?.message };
  }
}

/**
 * Update report content and sections
 */
export async function updateReportApi(report: Partial<KurbanReport>): Promise<{
  success: boolean;
  message?: string;
  report?: KurbanReport;
  error?: string;
}> {
  try {
    const res = await fetch("/api/kurban-process/reports", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Save report revision snapshot
 */
export async function saveReportRevisionApi(
  reportId: string,
  title: string,
  snapshotData: any
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/kurban-process/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, title, snapshotData }),
    });

    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Export 350-400 animals to Excel (.xlsx)
 */
export function exportAnimalsToExcel(animals: KurbanAnimal[], filename = "Kurban_Hayvan_Listesi_350"): void {
  const rows = animals.map((a, idx) => ({
    "Sıra No": idx + 1,
    "Küpe Numarası": a.earTagNo,
    "Kesim Yeri":
      a.cuttingLocationId === "loc-tuzla-ksm01"
        ? "1. Kesimhane (Tuzla)"
        : a.cuttingLocationId === "loc-kocaeli-ksm02"
        ? "2. Kesimhane (Kartepe)"
        : "Tahsis Edilmedi",
    "Hayvan Cinsi": a.animalTypeLabel || a.animalType,
    "Irk": a.breed || "Simental",
    "Cinsiyet": a.gender === "male" ? "Erkek" : "Dişi",
    "Yaş (Ay)": a.ageMonths,
    "Pasaport No": a.passportNo || "",
    "İşletme Kayıt No": a.farmRegNo || "",
    "Kayıtlı İşletme": a.farmName || "",
    "Sağlık Rapor No": a.healthDocNo || "",
    "Canlı Kilo (Kg)": a.liveWeightKg,
    "Karkas Kilo (Kg)": a.carcassWeightKg,
    "Randıman (%)":
      a.liveWeightKg > 0 ? ((a.carcassWeightKg / a.liveWeightKg) * 100).toFixed(1) + "%" : "",
    "Durumu":
      a.status === "delivered"
        ? "Teslim Edildi"
        : a.status === "in_storage"
        ? "Depoda"
        : a.status === "slaughtered"
        ? "Kesildi"
        : a.status === "arrived_at_slaughterhouse"
        ? "Mezbaha Padokta"
        : a.status === "in_transit"
        ? "Sevk Ediliyor"
        : "Alındı / Çiftlikte",
    "Notlar": a.notes || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hayvan_Kayitlari");

  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 26 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 32 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 30 },
  ];

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Download empty Excel template for bulk animal importing
 */
export function downloadAnimalImportTemplate(): void {
  const sampleRows = [
    {
      "Küpe Numarası": "TR34-00101",
      "Kesim Yeri Kodu": "KSM-01",
      "Hayvan Cinsi": "Büyükbaş Tosun",
      "Irk": "Simental",
      "Cinsiyet": "Erkek",
      "Yaş (Ay)": 24,
      "Pasaport No": "PAS-TR34-00101",
      "İşletme Kayıt No": "TR-36-004128",
      "Kayıtlı İşletme": "Serhat Arpaçay Besi Tesisleri - Kars",
      "Sağlık Rapor No": "VET-2026-KRS-881",
      "Canlı Kilo (Kg)": 660,
      "Karkas Kilo (Kg)": 372,
      "Durumu": "purchased",
      "Notlar": "1. Sınıf Besi",
    },
    {
      "Küpe Numarası": "TR41-00101",
      "Kesim Yeri Kodu": "KSM-02",
      "Hayvan Cinsi": "Büyükbaş Tosun",
      "Irk": "Şarole",
      "Cinsiyet": "Erkek",
      "Yaş (Ay)": 25,
      "Pasaport No": "PAS-TR41-00101",
      "İşletme Kayıt No": "TR-25-009814",
      "Kayıtlı İşletme": "Erzurum Pasinler Yayla Besi",
      "Sağlık Rapor No": "VET-2026-ERZ-911",
      "Canlı Kilo (Kg)": 680,
      "Karkas Kilo (Kg)": 384,
      "Durumu": "purchased",
      "Notlar": "Yüksek Randımanlı",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hayvan_Sablon");
  XLSX.writeFile(workbook, "Toplu_Hayvan_Yukleme_Sablonu.xlsx");
}

/**
 * Generic Entity Save API (Party, Location, Shipment, Storage, Delivery)
 */
export async function saveEntityApi<T = any>(
  entityType: "party" | "location" | "shipment" | "storage" | "delivery",
  data: Partial<T>
): Promise<{ success: boolean; data?: T; [key: string]: any; error?: string }> {
  try {
    const res = await fetch("/api/kurban-process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, data }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || "Kayıt hatası." };
  }
}

/**
 * Generic Entity Delete API
 */
export async function deleteEntityApi(
  entityType: "party" | "location" | "shipment" | "storage" | "delivery",
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(
      `/api/kurban-process?entityType=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || "Silme hatası." };
  }
}
