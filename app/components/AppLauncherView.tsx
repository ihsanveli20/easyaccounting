"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LayoutGrid,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AppMenuId } from "../types/accounting";

export interface LauncherNavItem {
  id: AppMenuId;
  name: string;
  shortName: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string | number | null;
  tag?: string | null;
}

export interface MenuPreferences {
  order: AppMenuId[];
  hiddenIds: AppMenuId[];
  startInLauncher: boolean;
  hideSidebarInLauncher: boolean;
  sidebarHidden: boolean;
  sidebarCollapsed: boolean;
}

export const MENU_PREFS_STORAGE_KEY = "easy_accounting_menu_prefs_v1";

export const DEFAULT_MENU_PREFS: MenuPreferences = {
  order: [],
  hiddenIds: [],
  startInLauncher: false,
  hideSidebarInLauncher: false,
  sidebarHidden: false,
  sidebarCollapsed: false,
};

// Distinct, colorful icon tile styles inspired by modern ERP app launchers
const TILE_STYLES: Record<
  AppMenuId,
  { iconBg: string; iconColor: string; accentDot: string }
> = {
  summary: {
    iconBg: "bg-gradient-to-br from-emerald-50 to-teal-100 border-emerald-200/70",
    iconColor: "text-emerald-600",
    accentDot: "bg-emerald-500",
  },
  details: {
    iconBg: "bg-gradient-to-br from-sky-50 to-indigo-100 border-sky-200/70",
    iconColor: "text-indigo-600",
    accentDot: "bg-sky-500",
  },
  calculator: {
    iconBg: "bg-gradient-to-br from-slate-100 to-slate-200 border-slate-300/70",
    iconColor: "text-slate-800",
    accentDot: "bg-emerald-500",
  },
  reconciliation: {
    iconBg: "bg-gradient-to-br from-rose-50 to-orange-100 border-rose-200/70",
    iconColor: "text-rose-600",
    accentDot: "bg-rose-500",
  },
  "invoice-extractor": {
    iconBg: "bg-gradient-to-br from-slate-100 to-zinc-200 border-slate-200",
    iconColor: "text-slate-500",
    accentDot: "bg-slate-400",
  },
  "invoice-comparison": {
    iconBg: "bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200/70",
    iconColor: "text-blue-600",
    accentDot: "bg-indigo-500",
  },
  quote: {
    iconBg: "bg-gradient-to-br from-cyan-50 to-blue-100 border-cyan-200/70",
    iconColor: "text-blue-600",
    accentDot: "bg-cyan-500",
  },
  "proposal-history": {
    iconBg: "bg-gradient-to-br from-violet-50 to-purple-100 border-violet-200/70",
    iconColor: "text-purple-600",
    accentDot: "bg-violet-500",
  },
  "proposal-comparison": {
    iconBg: "bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200/70",
    iconColor: "text-amber-600",
    accentDot: "bg-orange-500",
  },
  "received-quotes": {
    iconBg: "bg-gradient-to-br from-indigo-50 to-cyan-100 border-indigo-200/70",
    iconColor: "text-indigo-600",
    accentDot: "bg-cyan-500",
  },
  "stock-tracking": {
    iconBg: "bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200/70",
    iconColor: "text-orange-600",
    accentDot: "bg-amber-500",
  },
  "kurban-reporting": {
    iconBg: "bg-gradient-to-br from-teal-50 to-emerald-100 border-teal-200/70",
    iconColor: "text-teal-700",
    accentDot: "bg-emerald-600",
  },
  settings: {
    iconBg: "bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200/70",
    iconColor: "text-orange-600",
    accentDot: "bg-orange-500",
  },
  "admin-users": {
    iconBg: "bg-gradient-to-br from-fuchsia-50 to-purple-100 border-fuchsia-200/70",
    iconColor: "text-purple-700",
    accentDot: "bg-fuchsia-500",
  },
};

interface AppLauncherViewProps {
  items: LauncherNavItem[];
  allAllowedItems: LauncherNavItem[];
  activeTab: AppMenuId;
  prefs: MenuPreferences;
  onUpdatePrefs: (next: MenuPreferences) => void;
  onSelectModule: (id: AppMenuId) => void;
}

export default function AppLauncherView({
  items,
  allAllowedItems,
  activeTab,
  onSelectModule,
}: AppLauncherViewProps) {
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLocaleLowerCase("tr-TR").includes(q) ||
        it.shortName.toLocaleLowerCase("tr-TR").includes(q) ||
        it.description.toLocaleLowerCase("tr-TR").includes(q)
    );
  }, [items, search]);

  return (
    <div className="min-h-[calc(100vh-8.5rem)] rounded-3xl bg-gradient-to-br from-[#eceaf7] via-[#e7e6f5] to-[#f4f3fb] border border-indigo-200/60 shadow-inner p-6 sm:p-10 lg:p-14 flex flex-col justify-between">
      <div className="max-w-5xl w-full mx-auto space-y-8">
        {/* Top Bar: Search & Customize */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-indigo-100 flex items-center justify-center text-indigo-600">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-800 tracking-tight">
                Uygulamalar &amp; Modüller
              </h2>
              <p className="text-xs text-slate-500">
                Açmak istediğiniz modüle tıklayın veya menü düzenini özelleştirin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Uygulama ara..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/90 border border-indigo-100 text-xs font-medium text-slate-700 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>

        {/* Odoo-style Square Icon Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-4 gap-y-7 sm:gap-x-6 sm:gap-y-8 pt-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const style = TILE_STYLES[item.id] || {
              iconBg: "bg-slate-50 border-slate-200",
              iconColor: "text-slate-700",
              accentDot: "bg-indigo-500",
            };
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectModule(item.id)}
                title={`${item.name} — ${item.description}`}
                className="group flex flex-col items-center gap-2.5 focus:outline-none"
              >
                <div
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border shadow-sm group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-200 flex items-center justify-center p-3 ${isActive
                      ? "border-indigo-400 ring-2 ring-indigo-400/30"
                      : "border-white/90 group-hover:border-indigo-200"
                    }`}
                >
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl border flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${style.iconBg}`}
                  >
                    <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${style.iconColor}`} />
                  </div>

                  {item.badge !== null && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-600 text-white shadow-sm ring-2 ring-white">
                      {item.badge}
                    </span>
                  )}

                  {item.tag && item.badge === null && (
                    <span
                      className={`absolute top-2 right-2 w-2 h-2 rounded-full ${style.accentDot}`}
                      title={item.tag}
                    />
                  )}
                </div>

                <span className="text-xs sm:text-[13px] font-semibold text-slate-700 group-hover:text-slate-950 text-center leading-snug line-clamp-2 max-w-[110px]">
                  {item.shortName}
                </span>
              </button>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500 font-medium">
            Aramanızla eşleşen modül bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
}

interface MenuCustomizerModalProps {
  open: boolean;
  onClose: () => void;
  orderedAllowedItems: LauncherNavItem[];
  prefs: MenuPreferences;
  onUpdatePrefs: (next: MenuPreferences) => void;
}

export function MenuCustomizerModal({
  open,
  onClose,
  orderedAllowedItems,
  prefs,
  onUpdatePrefs,
}: MenuCustomizerModalProps) {
  if (!open) return null;

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
    const nextHidden = new Set(prefs.hiddenIds);
    if (nextHidden.has(id)) {
      nextHidden.delete(id);
    } else {
      // Keep at least 1 module visible
      const visibleCount = orderedAllowedItems.filter((it) => !nextHidden.has(it.id)).length;
      if (visibleCount <= 1) return;
      nextHidden.add(id);
    }
    onUpdatePrefs({ ...prefs, hiddenIds: Array.from(nextHidden) });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Menüyü Özelleştir
              </h3>
              <p className="text-xs text-slate-500">
                Hem yan menü hem de uygulama ızgarası için sıralama ve görünüm ayarları
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* View Preferences */}
          <div className="space-y-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
              Görünüm &amp; Başlangıç Tercihi
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
              <div>
                <div className="text-xs font-bold text-slate-800">
                  Yan Menüyü Tamamen Gizle
                </div>
                <div className="text-[11px] text-slate-500">
                  Sol yan menüyü tüm sayfalarda gizler; üstteki Uygulamalar ve Ayarlar butonlarıyla gezinebilirsiniz
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.sidebarHidden}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, sidebarHidden: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer py-1 border-t border-slate-200/70 pt-2.5">
              <div>
                <div className="text-xs font-bold text-slate-800">
                  Açılışta Uygulama Izgarası (Odoo Görünümü) Göster
                </div>
                <div className="text-[11px] text-slate-500">
                  Giriş yapınca ikonlu ana menüyle başlar; sol yan menü yine kullanılabilir
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.startInLauncher}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, startInLauncher: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer py-1 border-t border-slate-200/70 pt-2.5">
              <div>
                <div className="text-xs font-bold text-slate-800">
                  Uygulama Izgarasındayken Yan Menüyü Otomatik Gizle
                </div>
                <div className="text-[11px] text-slate-500">
                  Kapalıyken sol yan menü her zaman görünür kalır
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.hideSidebarInLauncher}
                onChange={(e) =>
                  onUpdatePrefs({ ...prefs, hideSidebarInLauncher: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </label>
          </div>

          {/* Module Order & Visibility */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                Modül Sıralaması ve Görünürlük
              </span>
              <button
                type="button"
                onClick={() => onUpdatePrefs(DEFAULT_MENU_PREFS)}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Varsayılana Sıfırla</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {orderedAllowedItems.map((item, idx) => {
                const Icon = item.icon;
                const isHidden = hiddenSet.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${isHidden ? "bg-slate-50/70 opacity-60" : "bg-white"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {item.shortName}
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
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedAllowedItems.length - 1}
                        onClick={() => moveItem(item.id, 1)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Aşağı taşı"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVisibility(item.id)}
                        className={`p-1.5 rounded-lg transition-colors ${isHidden
                            ? "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                        title={isHidden ? "Menüde göster" : "Menüden gizle"}
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

        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
