import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  decryptSecrets,
  encryptSecrets,
  maskSecretsForClient,
} from "../../utils/integrationCrypto";
import { INTEGRATION_PROVIDERS } from "../../utils/integrations/registry";
import { getIntegrationAdapter } from "../../utils/integrations/adapters";
import {
  ExternalIdMappingRecord,
  IntegrationConnectionState,
  IntegrationErrorQueueItem,
  IntegrationLogRecord,
  IntegrationProviderKey,
  IntegrationSyncJobRecord,
} from "../../utils/integrations/types";

function getSupabaseServer() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qcndlfastbrezugknkho.supabase.co";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface MemoryIntegrationStore {
  connections: Map<
    IntegrationProviderKey,
    IntegrationConnectionState & { encrypted_secrets?: string }
  >;
  jobs: IntegrationSyncJobRecord[];
  logs: IntegrationLogRecord[];
  errors: IntegrationErrorQueueItem[];
  mappings: ExternalIdMappingRecord[];
}

const globalStore = globalThis as unknown as {
  __integrationMemStore?: MemoryIntegrationStore;
};

function getMemStore(): MemoryIntegrationStore {
  if (!globalStore.__integrationMemStore) {
    const connections = new Map<
      IntegrationProviderKey,
      IntegrationConnectionState & { encrypted_secrets?: string }
    >();
    for (const p of INTEGRATION_PROVIDERS) {
      connections.set(p.key, {
        provider_key: p.key,
        display_name: p.name,
        status: "pending",
        auto_sync_enabled: false,
        sync_interval_minutes: 60,
        sync_direction: p.supportsTwoWaySync ? "bidirectional" : "pull",
        public_config: {},
        has_secrets: {},
        last_sync_at: null,
        last_error_at: null,
        last_error_message: null,
        synced_record_count: 0,
        error_record_count: 0,
        updated_at: new Date().toISOString(),
      });
    }
    globalStore.__integrationMemStore = {
      connections,
      jobs: [],
      logs: [],
      errors: [],
      mappings: [],
    };
  }
  return globalStore.__integrationMemStore;
}

function isTableMissing(msg?: string): boolean {
  const l = (msg || "").toLowerCase();
  return (
    l.includes("does not exist") ||
    l.includes("could not find the table") ||
    l.includes("schema cache")
  );
}

function sanitizeConnForClient(
  row: IntegrationConnectionState & { encrypted_secrets?: string | null }
): IntegrationConnectionState {
  const decrypted = decryptSecrets(row.encrypted_secrets);
  return {
    provider_key: row.provider_key,
    display_name: row.display_name,
    status: row.status,
    auto_sync_enabled: row.auto_sync_enabled,
    sync_interval_minutes: row.sync_interval_minutes,
    sync_direction: row.sync_direction,
    public_config: row.public_config || {},
    has_secrets: maskSecretsForClient(decrypted),
    last_sync_at: row.last_sync_at,
    last_error_at: row.last_error_at,
    last_error_message: row.last_error_message,
    synced_record_count: row.synced_record_count || 0,
    error_record_count: row.error_record_count || 0,
    updated_at: row.updated_at,
  };
}

export async function GET() {
  const supabase = getSupabaseServer();
  const mem = getMemStore();

  if (supabase) {
    const [connRes, jobsRes, logsRes, errRes, mapRes] = await Promise.all([
      supabase.from("integration_connections").select("*"),
      supabase
        .from("integration_sync_jobs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("integration_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("integration_error_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("external_id_mappings")
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(100),
    ]);

    if (!connRes.error) {
      const dbMap = new Map(
        (connRes.data || []).map((r) => [r.provider_key as IntegrationProviderKey, r])
      );
      const merged = INTEGRATION_PROVIDERS.map((p) => {
        const dbRow = dbMap.get(p.key);
        if (dbRow) {
          return sanitizeConnForClient(dbRow);
        }
        return sanitizeConnForClient(mem.connections.get(p.key)!);
      });

      return NextResponse.json({
        success: true,
        tableMissing: false,
        connections: merged,
        jobs: jobsRes.data || [],
        logs: logsRes.data || [],
        errors: errRes.data || [],
        mappings: mapRes.data || [],
      });
    }

    if (isTableMissing(connRes.error.message)) {
      return NextResponse.json({
        success: true,
        tableMissing: true,
        connections: Array.from(mem.connections.values()).map(sanitizeConnForClient),
        jobs: mem.jobs,
        logs: mem.logs,
        errors: mem.errors,
        mappings: mem.mappings,
      });
    }
  }

  return NextResponse.json({
    success: true,
    tableMissing: false,
    connections: Array.from(mem.connections.values()).map(sanitizeConnForClient),
    jobs: mem.jobs,
    logs: mem.logs,
    errors: mem.errors,
    mappings: mem.mappings,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const providerKey = String(body.providerKey || "") as IntegrationProviderKey;
    const actor = String(body.actor || "Admin");
    const supabase = getSupabaseServer();
    const mem = getMemStore();

    const def = INTEGRATION_PROVIDERS.find((p) => p.key === providerKey);
    if (!def && action !== "resolve_error" && action !== "confirm_mapping") {
      return NextResponse.json(
        { success: false, error: "Geçersiz entegrasyon sağlayıcısı." },
        { status: 400 }
      );
    }

    const appendLog = async (
      pKey: IntegrationProviderKey,
      level: "info" | "warn" | "error",
      act: string,
      message: string,
      recordRef?: string
    ) => {
      const entry: IntegrationLogRecord = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        provider_key: pKey,
        level,
        action: act,
        message,
        record_ref: recordRef || null,
        created_at: new Date().toISOString(),
      };
      mem.logs.unshift(entry);
      if (supabase) {
        await supabase
          .from("integration_logs")
          .insert([
            {
              provider_key: pKey,
              level,
              action: act,
              message,
              record_ref: recordRef || null,
            },
          ])
          .then(() => {}, () => {});
      }
    };

    const loadConnectionRow = async (pKey: IntegrationProviderKey) => {
      if (supabase) {
        const { data } = await supabase
          .from("integration_connections")
          .select("*")
          .eq("provider_key", pKey)
          .maybeSingle();
        if (data) return data;
      }
      return mem.connections.get(pKey)!;
    };

    const saveConnectionRow = async (
      pKey: IntegrationProviderKey,
      row: IntegrationConnectionState & { encrypted_secrets?: string }
    ) => {
      mem.connections.set(pKey, row);
      if (supabase) {
        await supabase.from("integration_connections").upsert(
          {
            provider_key: pKey,
            display_name: row.display_name,
            status: row.status,
            auto_sync_enabled: row.auto_sync_enabled,
            sync_interval_minutes: row.sync_interval_minutes,
            sync_direction: row.sync_direction,
            public_config: row.public_config,
            encrypted_secrets: row.encrypted_secrets || null,
            last_sync_at: row.last_sync_at,
            last_error_at: row.last_error_at,
            last_error_message: row.last_error_message,
            synced_record_count: row.synced_record_count,
            error_record_count: row.error_record_count,
            updated_by: actor,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_key" }
        );
      }
    };

    if (action === "save_config") {
      const existing = await loadConnectionRow(providerKey);
      const oldSecrets = decryptSecrets(existing.encrypted_secrets);
      const incomingSecrets = (body.secrets || {}) as Record<string, string>;

      // Merge secrets: only overwrite if non-empty new value provided
      const mergedSecrets = { ...oldSecrets };
      for (const [k, v] of Object.entries(incomingSecrets)) {
        if (typeof v === "string" && v.trim().length > 0) {
          mergedSecrets[k] = v.trim();
        }
      }

      const encrypted = encryptSecrets(mergedSecrets);
      const updated = {
        ...existing,
        provider_key: providerKey,
        display_name: def!.name,
        public_config: body.publicConfig || existing.public_config || {},
        auto_sync_enabled:
          body.autoSyncEnabled !== undefined
            ? Boolean(body.autoSyncEnabled)
            : existing.auto_sync_enabled,
        sync_interval_minutes:
          Number(body.syncIntervalMinutes) || existing.sync_interval_minutes || 60,
        sync_direction: body.syncDirection || existing.sync_direction || "pull",
        encrypted_secrets: encrypted,
        has_secrets: maskSecretsForClient(mergedSecrets),
        updated_at: new Date().toISOString(),
      };

      await saveConnectionRow(providerKey, updated);
      await appendLog(providerKey, "info", "SAVE_CONFIG", `${def!.name} bağlantı ayarları güncellendi.`);

      return NextResponse.json({
        success: true,
        connection: sanitizeConnForClient(updated),
      });
    }

    if (action === "test_connection") {
      const existing = await loadConnectionRow(providerKey);
      const secrets = decryptSecrets(existing.encrypted_secrets);
      const adapter = getIntegrationAdapter(providerKey);
      const result = await adapter.testConnection(existing.public_config || {}, secrets);

      const now = new Date().toISOString();
      const updated = {
        ...existing,
        status: result.ok ? ("connected" as const) : ("error" as const),
        last_error_at: result.ok ? existing.last_error_at : now,
        last_error_message: result.ok ? null : result.message,
        updated_at: now,
      };

      await saveConnectionRow(providerKey, updated);
      await appendLog(
        providerKey,
        result.ok ? "info" : "error",
        "TEST_CONNECTION",
        result.message
      );

      return NextResponse.json({
        success: result.ok,
        message: result.message,
        connection: sanitizeConnForClient(updated),
      });
    }

    if (action === "toggle_disable") {
      const existing = await loadConnectionRow(providerKey);
      const nextStatus = existing.status === "disabled" ? "pending" : "disabled";
      const updated = {
        ...existing,
        status: nextStatus as IntegrationConnectionState["status"],
        updated_at: new Date().toISOString(),
      };
      await saveConnectionRow(providerKey, updated);
      await appendLog(
        providerKey,
        "info",
        "TOGGLE_STATUS",
        nextStatus === "disabled" ? "Entegrasyon devre dışı bırakıldı." : "Entegrasyon etkinleştirildi."
      );
      return NextResponse.json({
        success: true,
        connection: sanitizeConnForClient(updated),
      });
    }

    if (action === "run_sync") {
      const existing = await loadConnectionRow(providerKey);
      if (existing.status === "disabled") {
        return NextResponse.json(
          { success: false, error: "Devre dışı entegrasyon senkronize edilemez." },
          { status: 400 }
        );
      }

      const adapter = getIntegrationAdapter(providerKey);
      if (!adapter.syncData) {
        const msg = `${def!.name} için doğrudan API senkronizasyonu desteklenmiyor veya yapılandırılmadı.`;
        await appendLog(providerKey, "warn", "RUN_SYNC", msg);
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }

      const secrets = decryptSecrets(existing.encrypted_secrets);
      const startedAt = new Date().toISOString();
      const syncRes = await adapter.syncData(existing.public_config || {}, secrets, {
        direction: existing.sync_direction,
        entityTypes: body.entityTypes || [],
      });
      const finishedAt = new Date().toISOString();

      const job: IntegrationSyncJobRecord = {
        id: `job-${Date.now()}`,
        provider_key: providerKey,
        direction: existing.sync_direction,
        entity_types: body.entityTypes || [],
        status: syncRes.status,
        started_at: startedAt,
        finished_at: finishedAt,
        total_count: syncRes.totalCount,
        success_count: syncRes.successCount,
        error_count: syncRes.errorCount,
        skipped_count: syncRes.skippedCount,
        error_summary: syncRes.status === "failed" ? syncRes.message : null,
        triggered_by: actor,
      };
      mem.jobs.unshift(job);

      const updated = {
        ...existing,
        status: syncRes.status === "failed" ? ("error" as const) : ("connected" as const),
        last_sync_at: syncRes.status === "failed" ? existing.last_sync_at : finishedAt,
        last_error_at: syncRes.status === "failed" ? finishedAt : existing.last_error_at,
        last_error_message: syncRes.status === "failed" ? syncRes.message : null,
        synced_record_count: (existing.synced_record_count || 0) + syncRes.successCount,
        error_record_count: (existing.error_record_count || 0) + syncRes.errorCount,
        updated_at: finishedAt,
      };

      await saveConnectionRow(providerKey, updated);
      await appendLog(
        providerKey,
        syncRes.status === "failed" ? "error" : "info",
        "RUN_SYNC",
        syncRes.message
      );

      return NextResponse.json({
        success: syncRes.status !== "failed",
        message: syncRes.message,
        job,
        connection: sanitizeConnForClient(updated),
      });
    }

    return NextResponse.json({ success: false, error: "Geçersiz işlem." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Entegrasyon işlem hatası.",
      },
      { status: 500 }
    );
  }
}

