"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Database, Download, History, Loader2, RefreshCw, Search } from "lucide-react";
import type { SystemAuditEntry } from "../api/audit-logs/route";

const ACTION_BADGES: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "Oluşturuldu", cls: "bg-emerald-100 text-emerald-800" },
  UPDATE: { label: "Değiştirildi", cls: "bg-indigo-100 text-indigo-800" },
  DELETE: { label: "Silindi", cls: "bg-rose-100 text-rose-800" },
  CANCEL: { label: "İptal Edildi", cls: "bg-amber-100 text-amber-800" },
  APPROVE: { label: "Onaylandı", cls: "bg-teal-100 text-teal-800" },
  SYNC: { label: "Senkronize", cls: "bg-purple-100 text-purple-800" },
};

export default function AuditLogView() {
  const [logs, setLogs] = useState<SystemAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/audit-logs");
      const data = await res.json();
      if (data?.success) {
        setLogs(data.logs || []);
        setTableMissing(Boolean(data.tableMissing));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.user_name && set.add(l.user_name));
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
    return logs.filter((l) => {
      if (actionFilter !== "all" && !l.action.includes(actionFilter)) return false;
      if (userFilter !== "all" && l.user_name !== userFilter) return false;
      if (q) {
        const hit =
          l.user_name.toLocaleLowerCase("tr-TR").includes(q) ||
          l.record_label.toLocaleLowerCase("tr-TR").includes(q) ||
          l.module.toLocaleLowerCase("tr-TR").includes(q) ||
          (l.details || "").toLocaleLowerCase("tr-TR").includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [logs, actionFilter, userFilter, searchQuery]);

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) return;
    const rows = filteredLogs.map((l) => ({
      Tarih: l.created_at.slice(0, 19).replace("T", " "),
      Kullanıcı: l.user_name,
      İşlem: l.action,
      Modül: l.module,
      Kayıt: l.record_label,
      Detay: l.details || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    XLSX.writeFile(wb, `Islem_Gecmisi_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {tableMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <div className="font-bold">
              Supabase &quot;system_audit_logs&quot; tablosu henüz oluşturulmamış
            </div>
            <p className="text-amber-700 mt-0.5">
              Kalıcı işlem geçmişi için <code>data/system_audit_logs_schema.sql</code> dosyasını
              Supabase SQL Editor&apos;de çalıştırın.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              <span>Merkezi İşlem Geçmişi (Audit Log)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Hangi kullanıcı hangi kaydı ne zaman oluşturdu, değiştirdi veya sildi?
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kullanıcı, kayıt, modül ara..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
            >
              <option value="all">Tüm İşlemler</option>
              <option value="CREATE">Oluşturma</option>
              <option value="UPDATE">Değiştirme</option>
              <option value="DELETE">Silme</option>
              <option value="CANCEL">İptal</option>
            </select>

            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
            >
              <option value="all">Tüm Kullanıcılar</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void fetchLogs()}
              className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-600"
              title="Yenile"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Kayıtlar yükleniyor...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Gösterilecek işlem geçmişi kaydı bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4 w-40">Tarih / Saat</th>
                  <th className="py-3 px-4">Kullanıcı</th>
                  <th className="py-3 px-3">İşlem</th>
                  <th className="py-3 px-3">Modül</th>
                  <th className="py-3 px-4">Kayıt</th>
                  <th className="py-3 px-4">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((l) => {
                  const badge = ACTION_BADGES[l.action] || {
                    label: l.action,
                    cls: "bg-slate-100 text-slate-700",
                  };
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {l.created_at.slice(0, 19).replace("T", " ")}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{l.user_name}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-indigo-700">{l.module}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-800">{l.record_label}</td>
                      <td className="py-2.5 px-4 text-slate-500">{l.details || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

