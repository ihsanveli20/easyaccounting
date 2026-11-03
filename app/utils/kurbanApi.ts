import { QurbanRecord } from "../types/kurban";

/**
 * Fetch all Qurban records from Supabase via /api/qurbans
 */
export async function fetchQurbansApi(): Promise<{
  success: boolean;
  data: QurbanRecord[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/qurbans", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        data: [],
        error: errJson.error || `HTTP Hata: ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      success: data.success,
      data: Array.isArray(data.qurbans) ? data.qurbans : [],
      error: data.error,
    };
  } catch (err: any) {
    return {
      success: false,
      data: [],
      error: err?.message || "Kurban kayıtları çekilemedi.",
    };
  }
}

/**
 * Create a new Qurban record in Supabase
 */
export async function createQurbanApi(
  record: Partial<QurbanRecord>
): Promise<{
  success: boolean;
  data?: QurbanRecord;
  error?: string;
}> {
  try {
    const res = await fetch("/api/qurbans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || "Kurban kaydı oluşturulamadı.",
      };
    }

    return {
      success: true,
      data: data.qurban,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Bağlantı hatası.",
    };
  }
}

/**
 * Update an existing Qurban record in Supabase
 */
export async function updateQurbanApi(
  record: QurbanRecord
): Promise<{
  success: boolean;
  data?: QurbanRecord;
  error?: string;
}> {
  try {
    const res = await fetch("/api/qurbans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || "Kurban kaydı güncellenemedi.",
      };
    }

    return {
      success: true,
      data: data.qurban,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Bağlantı hatası.",
    };
  }
}

/**
 * Delete a Qurban record in Supabase
 */
export async function deleteQurbanApi(
  id: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/qurbans?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || "Kurban kaydı silinemedi.",
      };
    }

    return {
      success: true,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Bağlantı hatası.",
    };
  }
}

/**
 * Bulk import multiple Qurban records (e.g. 400-500 from Excel) to Supabase
 */
export async function bulkImportQurbansApi(
  records: Partial<QurbanRecord>[]
): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    // Process in batches of 50 to avoid payload size limits
    const BATCH_SIZE = 50;
    let totalImported = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const res = await fetch("/api/qurbans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: true,
          records: batch,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          count: totalImported,
          error: data.error || `Parti ${i / BATCH_SIZE + 1} aktarılamadı.`,
        };
      }

      totalImported += data.count || batch.length;
    }

    return {
      success: true,
      count: totalImported,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Toplu aktarım sırasında hata oluştu.",
    };
  }
}
