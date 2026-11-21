import {
  AdapterSyncResult,
  AdapterTestResult,
  IntegrationAdapter,
  IntegrationProviderKey,
  SyncDirection,
} from "./types";

const REQUEST_TIMEOUT_MS = 8000;

const odooAdapter: IntegrationAdapter = {
  key: "odoo",
  async testConnection(pub, sec): Promise<AdapterTestResult> {
    const serverUrl = (pub.serverUrl || "").trim().replace(/\/+$/, "");
    const db = (pub.database || "").trim();
    const username = (pub.username || "").trim();
    const apiKey = (sec.apiKey || "").trim();

    if (!serverUrl || !db || !username || !apiKey) {
      return {
        ok: false,
        message: "Odoo sunucu adresi, veritabanı, kullanıcı adı ve API anahtarı zorunludur.",
      };
    }

    try {
      const res = await fetch(`${serverUrl}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "common",
            method: "authenticate",
            args: [db, username, apiKey, {}],
          },
          id: 1,
        }),
      });

      if (!res.ok) {
        return {
          ok: false,
          message: `Odoo sunucusu HTTP ${res.status} döndürdü.`,
        };
      }

      const data = await res.json();
      if (data?.error) {
        return {
          ok: false,
          message: `Odoo hata verdi: ${data.error?.data?.message || data.error?.message || "Kimlik doğrulama başarısız"}`,
        };
      }

      if (typeof data?.result === "number" && data.result > 0) {
        return {
          ok: true,
          message: `Odoo bağlantısı doğrulandı (Kullanıcı UID: ${data.result}).`,
        };
      }

      return {
        ok: false,
        message: "Odoo kimlik doğrulaması başarısız (kullanıcı adı, veritabanı veya API anahtarı hatalı).",
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? `Odoo sunucusuna ulaşılamadı: ${err.message}`
            : "Odoo bağlantı zaman aşımı.",
      };
    }
  },

  async syncData(pub, sec, options: { direction: SyncDirection; entityTypes: string[] }): Promise<AdapterSyncResult> {
    const authTest = await this.testConnection(pub, sec);
    if (!authTest.ok) {
      return {
        status: "failed",
        totalCount: 0,
        successCount: 0,
        errorCount: 1,
        skippedCount: 0,
        message: authTest.message,
      };
    }

    // Real Odoo JSON-RPC count/read query for res.partner when authenticated
    const serverUrl = (pub.serverUrl || "").trim().replace(/\/+$/, "");
    const db = (pub.database || "").trim();
    const username = (pub.username || "").trim();
    const apiKey = (sec.apiKey || "").trim();

    try {
      const authRes = await fetch(`${serverUrl}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: { service: "common", method: "authenticate", args: [db, username, apiKey, {}] },
          id: 1,
        }),
      });
      const authJson = await authRes.json();
      const uid = authJson?.result;

      const countRes = await fetch(`${serverUrl}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [db, uid, apiKey, "res.partner", "search_count", [[]]],
          },
          id: 2,
        }),
      });
      const countJson = await countRes.json();
      const partnerCount = typeof countJson?.result === "number" ? countJson.result : 0;

      return {
        status: "success",
        totalCount: partnerCount,
        successCount: partnerCount,
        errorCount: 0,
        skippedCount: 0,
        message: `Odoo ${options.direction} kontrolü tamamlandı (${partnerCount} cari kayıt tespit edildi).`,
      };
    } catch (err: unknown) {
      return {
        status: "failed",
        totalCount: 0,
        successCount: 0,
        errorCount: 1,
        skippedCount: 0,
        message: err instanceof Error ? err.message : "Odoo senkronizasyon hatası.",
      };
    }
  },
};

const nesAdapter: IntegrationAdapter = {
  key: "nes",
  async testConnection(pub, sec): Promise<AdapterTestResult> {
    const baseUrl = (pub.baseUrl || "").trim().replace(/\/+$/, "");
    const apiToken = (sec.apiToken || "").trim();
    if (!baseUrl || !apiToken) {
      return {
        ok: false,
        message: "NES API adresi ve Bearer API Token zorunludur.",
      };
    }

    try {
      const res = await fetch(`${baseUrl}/v1/einvoices/incoming?page=1&pageSize=1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        return { ok: true, message: "NES e-Fatura API bağlantısı başarıyla doğrulandı." };
      }
      return {
        ok: false,
        message: `NES API yanıtı başarısız (HTTP ${res.status}). Token veya yetkileri kontrol edin.`,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? `NES sunucusuna bağlanılamadı: ${err.message}`
            : "NES bağlantı hatası.",
      };
    }
  },
};

const turmobAdapter: IntegrationAdapter = {
  key: "turmob",
  async testConnection(): Promise<AdapterTestResult> {
    return {
      ok: false,
      message:
        "TÜRMOB / Luca için herkese açık doğrudan REST API erişimi bulunmamaktadır. Mizan ve hareket aktarımı için Excel / CSV / XML dosya aktarımını kullanın.",
    };
  },
};

const bankAdapter: IntegrationAdapter = {
  key: "bank",
  async testConnection(pub, sec): Promise<AdapterTestResult> {
    const endpoint = (pub.apiEndpoint || "").trim();
    const secret = (sec.clientSecret || "").trim();
    if (!endpoint || !secret) {
      return {
        ok: false,
        message: "Banka API uç noktası ve Client Secret / Token zorunludur.",
      };
    }

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        return { ok: true, message: "Banka API bağlantısı (salt okunur) doğrulandı." };
      }
      return {
        ok: false,
        message: `Banka API HTTP ${res.status} döndürdü. OAuth / IP izinlerini kontrol edin.`,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? `Banka sunucusuna ulaşılamadı: ${err.message}`
            : "Banka bağlantı hatası.",
      };
    }
  },
};

const whatsappBusinessAdapter: IntegrationAdapter = {
  key: "whatsapp_business",
  async testConnection(pub, sec): Promise<AdapterTestResult> {
    const phoneNumberId = (pub.phoneNumberId || "").trim();
    const accessToken = (sec.accessToken || "").trim();
    if (!phoneNumberId || !accessToken) {
      return {
        ok: false,
        message: "Phone Number ID ve Meta Permanent Access Token zorunludur.",
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(
          phoneNumberId
        )}?fields=display_phone_number,verified_name`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      const data = await res.json();
      if (res.ok && data?.id) {
        return {
          ok: true,
          message: `Meta WhatsApp Business doğrulandı: ${data.verified_name || ""} (${data.display_phone_number || data.id})`,
        };
      }
      return {
        ok: false,
        message: `Meta API hatası: ${data?.error?.message || `HTTP ${res.status}`}`,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? `Meta API bağlantı hatası: ${err.message}`
            : "Meta bağlantı hatası.",
      };
    }
  },
};

const emailAdapter: IntegrationAdapter = {
  key: "email",
  async testConnection(pub, sec): Promise<AdapterTestResult> {
    const host = (pub.smtpHost || "").trim();
    const port = (pub.smtpPort || "").trim();
    const sender = (pub.senderEmail || "").trim();
    const pass = (sec.smtpPassword || "").trim();

    if (!host || !port || !sender || !pass) {
      return {
        ok: false,
        message: "SMTP sunucu, port, gönderen e-posta ve şifre alanları zorunludur.",
      };
    }

    return {
      ok: false,
      message:
        "SMTP ayarları kaydedildi; gerçek SMTP el sıkışması (nodemailer) için sunucuda SMTP paketinin etkinleştirilmesi gerekir.",
    };
  },
};

const ADAPTERS: Record<IntegrationProviderKey, IntegrationAdapter> = {
  odoo: odooAdapter,
  nes: nesAdapter,
  turmob: turmobAdapter,
  bank: bankAdapter,
  whatsapp_business: whatsappBusinessAdapter,
  email: emailAdapter,
};

export function getIntegrationAdapter(key: IntegrationProviderKey): IntegrationAdapter {
  return ADAPTERS[key];
}

