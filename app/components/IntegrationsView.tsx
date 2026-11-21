"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Globe,
  KeyRound,
  Landmark,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Power,
  RefreshCw,
  Settings,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { INTEGRATION_PROVIDERS } from "../utils/integrations/registry";
import {
  ExternalIdMappingRecord,
  IntegrationConnectionState,
  IntegrationConnectionStatus,
  IntegrationErrorQueueItem,
  IntegrationLogRecord,
  IntegrationProviderKey,
  IntegrationSyncJobRecord,
  SyncDirection,
} from "../utils/integrations/types";

type DetailTabId =
  | "overview"
  | "connection"
  | "transfer"
  | "history"
  | "errors"
  | "mappings"
  | "webhook"
  | "permissions";

const STATUS_BADGES: Record<
  IntegrationConnectionStatus,
  { label: string; cls: string }
> = {
  connected: {
    label: "Bağlı",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  pending: {
    label: "Bağlantı Bekleniyor",
    cls: "bg-amber-100 text-amber-800 border-amber-200",
  },
  error: {
    label: "Bağlantı Hatası",
    cls: "bg-rose-100 text-rose-800 border-rose-200",
  },
  syncing: {
    label: "Senkronizasyon Devam Ediyor",
    cls: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  disabled: {
    label: "Devre Dışı",
    cls: "bg-slate-200 text-slate-600 border-slate-300",
  },
};

function renderProviderIcon(key: IntegrationProviderKey) {
  switch (key) {
    case "odoo":
      return <Building2 className="w-5 h-5 text-purple-600" />;
    case "nes":
      return <FileSpreadsheet className="w-5 h-5 text-indigo-600" />;
    case "turmob":
      return <Database className="w-5 h-5 text-amber-600" />;
    case "bank":
      return <Landmark className="w-5 h-5 text-emerald-600" />;
    case "whatsapp_business":
      return <MessageCircle className="w-5 h-5 text-[#25D366]" />;
    case "email":
      return <Mail className="w-5 h-5 text-sky-600" />;
  }
}

export default function IntegrationsView() {
  const { profile, user, isAdmin } = useAuth();
  const actorName =
    profile?.full_name || profile?.user_name || user?.email?.split("@")[0] || "Admin";

  const [connections, setConnections] = useState<IntegrationConnectionState[]>([]);
  const [jobs, setJobs] = useState<IntegrationSyncJobRecord[]>([]);
  const [logs, setLogs] = useState<IntegrationLogRecord[]>([]);
  const [, setErrors] = useState<IntegrationErrorQueueItem[]>([]);
  const [mappings, setMappings] = useState<ExternalIdMappingRecord[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedProviderKey, setSelectedProviderKey] =
    useState<IntegrationProviderKey | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTabId>("overview");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form states for selected provider
  const [publicDraft, setPublicDraft] = useState<Record<string, string>>({});
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [autoSyncDraft, setAutoSyncDraft] = useState(false);
  const [intervalDraft, setIntervalDraft] = useState(60);
  const [directionDraft, setDirectionDraft] = useState<SyncDirection>("pull");

  const loadAll = async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (data?.success) {
        setConnections(data.connections || []);
        setJobs(data.jobs || []);
        setLogs(data.logs || []);
        setErrors(data.errors || []);
        setMappings(data.mappings || []);
        setTableMissing(Boolean(data.tableMissing));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const openProviderDetail = (key: IntegrationProviderKey, tab: DetailTabId = "overview") => {
    const conn = connections.find((c) => c.provider_key === key);
    setSelectedProviderKey(key);
    setDetailTab(tab);
    setPublicDraft(conn?.public_config || {});
    setSecretDraft({});
    setAutoSyncDraft(Boolean(conn?.auto_sync_enabled));
    setIntervalDraft(conn?.sync_interval_minutes || 60);
    setDirectionDraft(conn?.sync_direction || "pull");
    setFeedback(null);
  };

  const handleAction = async (
    providerKey: IntegrationProviderKey,
    action: string,
    extra: Record<string, unknown> = {}
  ) => {
    setBusyKey(`${providerKey}:${action}`);
    setFeedback(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          providerKey,
          actor: actorName,
          ...extra,
        }),
      });
      const data = await res.json();
      if (data?.connection) {
        setConnections((prev) =>
          prev.map((c) => (c.provider_key === providerKey ? data.connection : c))
        );
      }
      if (data?.job) {
        setJobs((prev) => [data.job, ...prev]);
      }
      setFeedback({
        ok: Boolean(data?.success),
        msg:
          data?.message ||
          data?.error ||
          (data?.success ? "İşlem başarıyla tamamlandı." : "İşlem başarısız."),
      });
      // Refresh logs silently
      loadAll();
    } catch (err: unknown) {
      setFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : "Sunucu iletişim hatası.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const kpis = useMemo(() => {
    return {
      total: connections.length || INTEGRATION_PROVIDERS.length,
      connected: connections.filter((c) => c.status === "connected").length,
      errors: connections.filter((c) => c.status === "error").length,
      totalSynced: connections.reduce((s, c) => s + (c.synced_record_count || 0), 0),
    };
  }, [connections]);

  const selectedDef = selectedProviderKey
    ? INTEGRATION_PROVIDERS.find((p) => p.key === selectedProviderKey) || null
    : null;
  const selectedConn = selectedProviderKey
    ? connections.find((c) => c.provider_key === selectedProviderKey) || null
    : null;

  return (
    <div className="space-y-5">
      {tableMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <div className="font-bold">Entegrasyon tabloları Supabase&apos;de henüz oluşturulmamış</div>
            <p className="text-amber-700 mt-0.5">
              Ayarlar geçici olarak sunucu belleğinde tutuluyor. Kalıcı şifreli saklama ve loglama için{" "}
              <code>data/integrations_schema.sql</code> dosyasını Supabase SQL Editor&apos;de çalıştırın.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold flex items-center gap-2 ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* MAIN DASHBOARD: INTEGRATION CARDS                                   */}
      {/* =================================================================== */}
      {!selectedProviderKey && (
        <div className="space-y-5">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Tanımlı Entegrasyon
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{kpis.total}</div>
            </div>
            <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-emerald-700">Bağlı Sistem</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">{kpis.connected}</div>
            </div>
            <div className="bg-rose-50/70 rounded-2xl border border-rose-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-rose-700">Bağlantı Hatası</div>
              <div className="text-2xl font-black text-rose-900 mt-1">{kpis.errors}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Aktarılan Kayıt
              </div>
              <div className="text-2xl font-black text-indigo-700 mt-1">{kpis.totalSynced}</div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Entegrasyonlar yükleniyor...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {INTEGRATION_PROVIDERS.map((def) => {
                const conn = connections.find((c) => c.provider_key === def.key);
                const status = conn?.status || "pending";
                const badge = STATUS_BADGES[status];
                const isTesting = busyKey === `${def.key}:test_connection`;
                const isSyncing = busyKey === `${def.key}:run_sync`;

                return (
                  <div
                    key={def.key}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4 hover:border-indigo-300 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                            {renderProviderIcon(def.key)}
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-900">{def.name}</h3>
                            <div className="text-[10px] font-semibold text-slate-400">
                              {def.authMethod}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">{def.shortDesc}</p>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <div>
                          <span className="text-slate-400 block">Son Senkronizasyon</span>
                          <span className="font-bold text-slate-700">
                            {conn?.last_sync_at ? conn.last_sync_at.slice(0, 16).replace("T", " ") : "Henüz yok"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Otomatik Senkron.</span>
                          <span className="font-bold text-slate-700">
                            {conn?.auto_sync_enabled ? `Aktif (${conn.sync_interval_minutes} dk)` : "Kapalı"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Aktarılan Kayıt</span>
                          <span className="font-bold text-indigo-700">
                            {conn?.synced_record_count || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Son Hata</span>
                          <span className="font-bold text-rose-600">
                            {conn?.last_error_at ? conn.last_error_at.slice(0, 10) : "Yok"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <button
                        type="button"
                        disabled={isTesting || status === "disabled"}
                        onClick={() => handleAction(def.key, "test_connection")}
                        className="py-2 px-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Activity className="w-3.5 h-3.5" />
                        )}
                        <span>Bağlantıyı Test Et</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openProviderDetail(def.key, "connection")}
                        className="py-2 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold inline-flex items-center justify-center gap-1"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Ayarları Düzenle</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSyncing || status === "disabled" || !def.supportsDirectApi}
                        onClick={() => handleAction(def.key, "run_sync")}
                        className="py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        {isSyncing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>Senkronize Et</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction(def.key, "toggle_disable")}
                        className="py-2 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold inline-flex items-center justify-center gap-1"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{status === "disabled" ? "Etkinleştir" : "Devre Dışı"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* INTEGRATION DETAIL VIEW (8 TABS)                                    */}
      {/* =================================================================== */}
      {selectedProviderKey && selectedDef && selectedConn && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedProviderKey(null)}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                {renderProviderIcon(selectedDef.key)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900">{selectedDef.name}</h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      STATUS_BADGES[selectedConn.status].cls
                    }`}
                  >
                    {STATUS_BADGES[selectedConn.status].label}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{selectedDef.shortDesc}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAction(selectedDef.key, "test_connection")}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" /> Bağlantıyı Test Et
              </button>
            </div>
          </div>

          {/* 8 Detail Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {(
                [
                  ["overview", "1. Genel Bakış"],
                  ["connection", "2. Bağlantı Ayarları"],
                  ["transfer", "3. Veri Aktarım Ayarları"],
                  ["history", "4. Senkronizasyon Geçmişi"],
                  ["errors", "5. Hata Kayıtları"],
                  ["mappings", "6. Veri Eşleştirme"],
                  ["webhook", "7. Webhook Ayarları"],
                  ["permissions", "8. Yetkilendirme"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDetailTab(id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
                    detailTab === id
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Overview */}
          {detailTab === "overview" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-indigo-950">
                <div className="font-black mb-1 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-600" /> Resmî API Yetenekleri &amp; Doğrulama Notu
                </div>
                <p className="leading-relaxed">{selectedDef.apiCapabilityNote}</p>
              </div>
              <div>
                <div className="font-black text-slate-800 mb-2">Desteklenen Veri Türleri</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDef.supportedDataTypes.map((dt) => (
                    <span
                      key={dt}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold"
                    >
                      {dt}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Connection Settings (Encrypted Secrets) */}
          {detailTab === "connection" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAction(selectedDef.key, "save_config", {
                  publicConfig: publicDraft,
                  secrets: secretDraft,
                });
              }}
              className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 text-xs"
            >
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  API anahtarları ve şifreler sunucu tarafında AES-256-GCM ile şifrelenir ve asla tarayıcıya açık şekilde geri gönderilmez.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedDef.fields.map((f) => {
                  const hasSavedSecret = f.isSecret && selectedConn.has_secrets?.[f.key];
                  return (
                    <div key={f.key}>
                      <label className="block font-bold text-slate-700 mb-1">
                        {f.label} {f.required && "*"}
                        {hasSavedSecret && (
                          <span className="ml-2 text-[10px] text-emerald-600">(Kayıtlı ✓)</span>
                        )}
                      </label>
                      {f.type === "select" ? (
                        <select
                          value={publicDraft[f.key] || f.options?.[0]?.value || ""}
                          onChange={(e) =>
                            setPublicDraft({ ...publicDraft, [f.key]: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                        >
                          {f.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : f.isSecret ? (
                        <input
                          type="password"
                          value={secretDraft[f.key] || ""}
                          onChange={(e) =>
                            setSecretDraft({ ...secretDraft, [f.key]: e.target.value })
                          }
                          placeholder={
                            hasSavedSecret ? "•••••••• (Değiştirmek için yeni değer girin)" : f.placeholder
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                        />
                      ) : (
                        <input
                          type={f.type}
                          value={publicDraft[f.key] || ""}
                          onChange={(e) =>
                            setPublicDraft({ ...publicDraft, [f.key]: e.target.value })
                          }
                          placeholder={f.placeholder}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Şifreli Kaydet
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Data Transfer Settings */}
          {detailTab === "transfer" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Senkronizasyon Yönü</label>
                  <select
                    value={directionDraft}
                    onChange={(e) => setDirectionDraft(e.target.value as SyncDirection)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                    <option value="pull">Tek Yönlü (Harici → ERP)</option>
                    <option value="push">Tek Yönlü (ERP → Harici)</option>
                    {selectedDef.supportsTwoWaySync && (
                      <option value="bidirectional">Çift Yönlü Senkronizasyon</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Zamanlama Sıklığı (Dakika)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={intervalDraft}
                    onChange={(e) => setIntervalDraft(Number(e.target.value) || 60)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-right"
                  />
                </div>
                <div className="flex items-end">
                  <label className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={autoSyncDraft}
                      onChange={(e) => setAutoSyncDraft(e.target.checked)}
                    />
                    <span>Otomatik Senkronizasyon</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    handleAction(selectedDef.key, "save_config", {
                      autoSyncEnabled: autoSyncDraft,
                      syncIntervalMinutes: intervalDraft,
                      syncDirection: directionDraft,
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                >
                  Aktarım Kurallarını Kaydet
                </button>
              </div>
            </div>
          )}

          {/* Tab 4: Sync History */}
          {detailTab === "history" && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-4">Başlangıç</th>
                    <th className="py-2.5 px-3">Yön</th>
                    <th className="py-2.5 px-3">Durum</th>
                    <th className="py-2.5 px-3 text-right">Başarılı / Toplam</th>
                    <th className="py-2.5 px-4">Özet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs
                    .filter((j) => j.provider_key === selectedDef.key)
                    .map((j) => (
                      <tr key={j.id}>
                        <td className="py-2.5 px-4">{j.started_at.slice(0, 16).replace("T", " ")}</td>
                        <td className="py-2.5 px-3 font-bold">{j.direction}</td>
                        <td className="py-2.5 px-3">{j.status}</td>
                        <td className="py-2.5 px-3 text-right font-bold">
                          {j.success_count} / {j.total_count}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">{j.error_summary || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 5: Error Logs */}
          {detailTab === "errors" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 text-xs">
              {logs
                .filter((l) => l.provider_key === selectedDef.key)
                .map((l) => (
                  <div
                    key={l.id}
                    className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                      l.level === "error"
                        ? "bg-rose-50 border-rose-200 text-rose-800"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    <div>
                      <span className="font-black">[{l.action}]</span> {l.message}
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {l.created_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Tab 6: Data Mapping */}
          {detailTab === "mappings" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-xs">
              <div className="font-black text-slate-900 flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-indigo-600" /> Merkezi Harici ID Eşleştirme Tablosu
              </div>
              {mappings.filter((m) => m.provider_key === selectedDef.key).length === 0 ? (
                <p className="text-slate-400">Henüz harici ID eşleştirmesi bulunmuyor.</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                      <th className="py-2 px-3">Tür</th>
                      <th className="py-2 px-3">Yerel ID</th>
                      <th className="py-2 px-3">Harici ID</th>
                      <th className="py-2 px-3">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings
                      .filter((m) => m.provider_key === selectedDef.key)
                      .map((m) => (
                        <tr key={m.id}>
                          <td className="py-2 px-3">{m.entity_type}</td>
                          <td className="py-2 px-3 font-mono">{m.local_id}</td>
                          <td className="py-2 px-3 font-mono">{m.external_id}</td>
                          <td className="py-2 px-3 font-bold">{m.match_status}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 7: Webhook Settings */}
          {detailTab === "webhook" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-xs">
              <div className="font-black text-slate-900 flex items-center gap-1.5">
                <Webhook className="w-4 h-4 text-indigo-600" /> Webhook Uç Noktası
              </div>
              <div className="p-3 rounded-xl bg-slate-100 font-mono text-slate-800 select-all">
                /api/integrations/webhook
              </div>
              <p className="text-slate-500">
                Meta WhatsApp ve diğer webhook sağlayıcıları için HMAC-SHA256 imza doğrulaması (
                <code>WEBHOOK_SIGNING_SECRET</code>) ve Verify Token kontrolü (
                <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>) aktiftir.
              </p>
            </div>
          )}

          {/* Tab 8: Permissions */}
          {detailTab === "permissions" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 text-xs">
              <div className="font-black text-slate-900">Erişim &amp; Güvenlik Politikası</div>
              <p className="text-slate-600">
                Mevcut kullanıcı rolü: <strong>{isAdmin ? "Yönetici (Tam Yetki)" : "Kısıtlı"}</strong>.
                API anahtarları ve secret değerler yalnızca sunucu ortamında şifrelenerek işlenir.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
