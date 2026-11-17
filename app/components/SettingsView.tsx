"use client";

import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  PanelLeft,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { AppMenuId } from "../types/accounting";
import {
  DEFAULT_MENU_PREFS,
  LauncherNavItem,
  MenuPreferences,
} from "./AppLauncherView";

const SQL_SCHEMA_TEXT = `CREATE TABLE IF NOT EXISTS public.user_menu_preferences (
  user_id TEXT PRIMARY KEY,
  menu_order TEXT[] NOT NULL DEFAULT '{}',
  hidden_menu_ids TEXT[] NOT NULL DEFAULT '{}',
  sidebar_hidden BOOLEAN NOT NULL DEFAULT false,
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  start_in_launcher BOOLEAN NOT NULL DEFAULT false,
  hide_sidebar_in_launcher BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);`;

interface SettingsViewProps {
  orderedAllowedItems: LauncherNavItem[];
  prefs: MenuPreferences;
  prefsSource: string;
  isSavingPrefs: boolean;
  onUpdatePrefs: (next: MenuPreferences) => void;
  onSaveToSupabase: (next?: MenuPreferences) => Promise<boolean>;
  onOpenLauncher: () => void;
}

export default function SettingsView({
  orderedAllowedItems,
  prefs,
  prefsSource,
  isSavingPrefs,
  onUpdatePrefs,
  onSaveToSupabase,
  onOpenLauncher,
}: SettingsViewProps) {
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const hiddenSet = new Set(prefs.hiddenIds);

  const moveItem = (id: AppMenuId, direction: -1 | 1) => {
    const ids = orderedAllowedItems.map((it) => it.id);
    const idx = ids.indexOf(id);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= ids.length) return;
    const nextOrder = [...ids];
    [nextOrder[idx], nextOrder[targetIdx]] = [nextOrder[targetIdx], nextOrder[idx]];
    onUpdatePrefs({ ...prefs, order: nextOrder });
  };

  const toggleVisibility = (id: AppMenuId) => {
    if (id === "settings") return; // Keep Settings accessible so user cannot lock themselves out
    const nextHidden = new Set(prefs.hiddenIds);
    if (nextHidden.has(id)) {
      nextHidden.delete(id);
    } else {
      const visibleCount = orderedAllowedItems.filter((it) => !nextHidden.has(it.id)).length;
      if (visibleCount <= 1) return;
      nextHidden.add(id);
    }
    onUpdatePrefs({ ...prefs, hiddenIds: Array.from(nextHidden) });
  };

  const handleSave = async () => {
    const ok = await onSaveToSupabase(prefs);
    if (ok) {
      setSavedBanner("Menü ve görünüm ayarları Supabase'e başarıyla kaydedildi.");
      setTimeout(() => setSavedBanner(null), 4000);
    }
  };

  const handleReset = async () => {
    onUpdatePrefs(DEFAULT_MENU_PREFS);
    const ok = await onSaveToSupabase(DEFAULT_MENU_PREFS);
    if (ok) {
      setSavedBanner("Menü ayarları varsayılana sıfırlandı ve Supabase'e kaydedildi.");
      setTimeout(() => setSavedBanner(null), 4000);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SCHEMA_TEXT);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0">
            <Settings2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Ayarlar &amp; Menü Yönetimi
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Cloud className="w-3 h-3" />
                {prefsSource === "supabase_table"
                  ? "Supabase Tablo"
                  : prefsSource === "supabase_cloud"
                    ? "Supabase Bulut"
                    : "Yerel / Varsayılan"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Yan menüyü gizleyin/gösterin, Odoo tarzı ızgara başlatıcıyı açın, modülleri sıralayın ve ayarlarınızı Supabase&apos;e kaydedin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenLauncher}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Izgara Menüyü Aç</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSavingPrefs}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-colors"
          >
            {isSavingPrefs ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSavingPrefs ? "Kaydediliyor..." : "Supabase'e Kaydet"}</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sidebar & Launcher Behavior */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-3">
              <PanelLeft className="w-4 h-4 text-indigo-600" />
              <span>Yan Menü &amp; Görünüm Ayarları</span>
            </div>

            <label className="flex items-start justify-between gap-3 cursor-pointer p-3 rounded-2xl border border-slate-200/80 hover:border-indigo-200 bg-slate-50/60 transition-colors">
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  Yan Menüyü Gizle
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Sol taraftaki yan menüyü tamamen gizler. Sayfa yenilense bile gizli kalır; üst çubuktaki <strong>Uygulamalar</strong> ve <strong>Ayarlar</strong> ile gezinebilirsiniz.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.sidebarHidden}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, sidebarHidden: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 cursor-pointer p-3 rounded-2xl border border-slate-200/80 hover:border-indigo-200 bg-slate-50/60 transition-colors">
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  Yan Menüyü Daraltılmış Başlat
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Yan menü görünürken yalnızca ikonlar şeklinde daraltılmış açılır.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.sidebarCollapsed}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, sidebarCollapsed: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 cursor-pointer p-3 rounded-2xl border border-slate-200/80 hover:border-indigo-200 bg-slate-50/60 transition-colors">
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  Açılışta Uygulama Izgarası Göster
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Giriş yapıldığında doğrudan Odoo tarzı kare ikonlu ana menü açılır.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.startInLauncher}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, startInLauncher: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 cursor-pointer p-3 rounded-2xl border border-slate-200/80 hover:border-indigo-200 bg-slate-50/60 transition-colors">
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  Izgara Menüdeyken Yan Menüyü Otomatik Gizle
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Uygulama başlatıcı açıkken yan menüyü gizler, modüle girince tekrar gösterir.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.hideSidebarInLauncher}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, hideSidebarInLauncher: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
              />
            </label>
          </div>

          {/* DB Schema Reference Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Supabase Veritabanı Yapısı</span>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>SQL Kopyala</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Ayarlarınız şu an Supabase bulutunda otomatik saklanır. Dilerseniz Supabase SQL Editor&apos;de aşağıdaki tabloyu oluşturarak özel tablo üzerinden de saklayabilirsiniz:
            </p>
            <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto leading-relaxed">
              {SQL_SCHEMA_TEXT}
            </pre>
          </div>
        </div>

        {/* Right Column: Module Order & Visibility */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                <span>Modül Sıralaması &amp; Görünürlük ({orderedAllowedItems.length})</span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Varsayılana Sıfırla</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {orderedAllowedItems.map((item, idx) => {
                const Icon = item.icon;
                const isHidden = hiddenSet.has(item.id);
                const isSettings = item.id === "settings";
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      isHidden ? "bg-slate-50/70 opacity-60" : "bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.description}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveItem(item.id, -1)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Yukarı taşı"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedAllowedItems.length - 1}
                        onClick={() => moveItem(item.id, 1)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Aşağı taşı"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={isSettings}
                        onClick={() => toggleVisibility(item.id)}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                          isHidden
                            ? "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                        }`}
                        title={
                          isSettings
                            ? "Ayarlar menüsü gizlenemez"
                            : isHidden
                              ? "Menüde göster"
                              : "Menüden gizle"
                        }
                      >
                        {isHidden ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

