"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Lock,
  UserCheck,
  Check,
  Loader2,
  Building,
  Key,
  Sliders,
  Settings2,
  Layers,
  FileSpreadsheet,
  Calculator,
  Scale,
  FileText,
  History,
  Package,
  X,
  Save,
  RotateCcw,
  CheckSquare,
  Square,
  Eye,
  Info,
  ArrowLeftRight,
  Truck,
} from "lucide-react";
import { getSupabaseClient } from "../utils/supabase";
import {
  UserProfile,
  UserRole,
  AppMenuId,
  AppPermissionsConfig,
} from "../types/accounting";
import { useAuth } from "../context/AuthContext";
import {
  SYSTEM_MENUS,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_PERMISSIONS_CONFIG,
} from "../utils/permissions";

// Menu icon mapping helper
const MENU_ICONS: Record<AppMenuId, React.ComponentType<{ className?: string }>> = {
  summary: FileSpreadsheet,
  details: Layers,
  calculator: Calculator,
  reconciliation: Scale,
  quote: FileText,
  "proposal-history": History,
  "proposal-comparison": ArrowLeftRight,
  "stock-tracking": Package,
  "kurban-reporting": Truck,
  "admin-users": UserCheck,
};

export default function AdminUsersView() {
  const {
    user: currentAuthUser,
    isAdmin,
    refreshProfile,
    permissionsConfig,
    savePermissions,
  } = useAuth();

  // Sub tab navigation: "users" = Kullanıcılar, "role-menus" = Rol Menü Yönetimi, "matrix" = Yetki Matrisi
  const [activeSubTab, setActiveSubTab] = useState<"users" | "role-menus" | "matrix">("users");

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Local state for role permissions editor (allows editing before saving)
  const [rolePermsDraft, setRolePermsDraft] = useState<Record<string, AppMenuId[]>>({});
  const [isSavingRolePerms, setIsSavingRolePerms] = useState<boolean>(false);

  // User Custom Permissions Modal State
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<UserProfile | null>(null);
  const [userCustomActive, setUserCustomActive] = useState<boolean>(false);
  const [userSelectedMenus, setUserSelectedMenus] = useState<AppMenuId[]>([]);
  const [isSavingUserPerms, setIsSavingUserPerms] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Sync draft role permissions with current global config
  useEffect(() => {
    if (permissionsConfig?.rolePermissions) {
      setRolePermsDraft(permissionsConfig.rolePermissions);
    }
  }, [permissionsConfig]);

  // Fetch profiles and roles from Supabase
  const loadData = async () => {
    setIsLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch available roles
      const { data: rolesData, error: rolesErr } = await supabase
        .from("roles")
        .select("*")
        .order("id", { ascending: true });

      if (rolesData) {
        setRoles(rolesData as UserRole[]);
      }

      // 2. Fetch profiles joined with roles
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, email, full_name, role_id, user_name, created_at, updated_at, roles(id, name, description, created_at)")
        .order("created_at", { ascending: false });

      if (profilesData) {
        const formatted: UserProfile[] = profilesData.map((p: any) => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name || "",
          role_id: p.role_id,
          user_name: p.user_name,
          created_at: p.created_at,
          updated_at: p.updated_at,
          roles: Array.isArray(p.roles) ? p.roles[0] : p.roles || null,
        }));
        setProfiles(formatted);
      }
    } catch (err: any) {
      console.warn("Admin load data error:", err);
      showToast("Veriler yüklenirken hata oluştu: " + (err?.message || ""));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update a user's role in Supabase
  const handleUpdateRole = async (userId: string, targetRoleId: number, targetRoleName: string) => {
    setUpdatingUserId(userId);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setUpdatingUserId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          role_id: targetRoleId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      // Update state in UI
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id === userId) {
            const matchedRole = roles.find((r) => r.id === targetRoleId) || null;
            return {
              ...p,
              role_id: targetRoleId,
              roles: matchedRole,
              updated_at: new Date().toISOString(),
            };
          }
          return p;
        })
      );

      // If updating own role, refresh global auth context
      if (currentAuthUser?.id === userId) {
        await refreshProfile();
      }

      showToast(`Kullanıcı rolü "${targetRoleName}" olarak güncellendi.`);
    } catch (err: any) {
      console.error("Role update error:", err);
      showToast("Yetki güncellenemedi: " + (err?.message || "İzin hatası"));
    } finally {
      setUpdatingUserId(null);
    }
  };

  // Open User Custom Permissions Modal
  const handleOpenUserPermsModal = (targetUser: UserProfile) => {
    setSelectedUserForPerms(targetUser);
    const emailKey = targetUser.email.toLowerCase().trim();
    const userOverride =
      permissionsConfig.userPermissions?.[emailKey] ||
      permissionsConfig.userPermissions?.[targetUser.id];

    const roleName = (targetUser.roles?.name || "").toLowerCase().trim();
    const roleDefaultMenus =
      permissionsConfig.rolePermissions?.[roleName] ||
      DEFAULT_ROLE_PERMISSIONS[roleName] ||
      DEFAULT_ROLE_PERMISSIONS.user;

    if (userOverride && userOverride.custom) {
      setUserCustomActive(true);
      setUserSelectedMenus([...userOverride.allowedMenus]);
    } else {
      setUserCustomActive(false);
      setUserSelectedMenus([...roleDefaultMenus]);
    }
  };

  // Save User Custom Permissions
  const handleSaveUserPermissions = async () => {
    if (!selectedUserForPerms) return;
    setIsSavingUserPerms(true);
    const emailKey = selectedUserForPerms.email.toLowerCase().trim();

    try {
      const updatedUserPerms = {
        ...permissionsConfig.userPermissions,
        [emailKey]: {
          custom: userCustomActive,
          allowedMenus: userSelectedMenus,
        },
      };

      const updatedConfig: AppPermissionsConfig = {
        ...permissionsConfig,
        userPermissions: updatedUserPerms,
      };

      const res = await savePermissions(updatedConfig);
      if (res.success) {
        showToast(
          userCustomActive
            ? `${selectedUserForPerms.email} için özel menü izinleri kaydedildi.`
            : `${selectedUserForPerms.email} rol varsayılan izinlerine döndürüldü.`
        );
        setSelectedUserForPerms(null);
      } else {
        showToast(`Hata: ${res.error || "Kaydedilemedi"}`);
      }
    } catch (err: any) {
      showToast(`Hata: ${err?.message || "Kaydedilemedi"}`);
    } finally {
      setIsSavingUserPerms(false);
    }
  };

  // Toggle Menu for a Role in Draft
  const handleToggleRoleMenu = (roleName: string, menuId: AppMenuId) => {
    const currentMenus = rolePermsDraft[roleName] || DEFAULT_ROLE_PERMISSIONS[roleName] || [];
    let updated: AppMenuId[];

    if (currentMenus.includes(menuId)) {
      // Do not allow removing admin-users from admin
      if (roleName === "admin" && menuId === "admin-users") {
        showToast("Yönetici rolünden Kullanıcı & Yetki Yönetimi menüsü kaldırılamaz.");
        return;
      }
      updated = currentMenus.filter((m) => m !== menuId);
    } else {
      updated = [...currentMenus, menuId];
    }

    setRolePermsDraft((prev) => ({
      ...prev,
      [roleName]: updated,
    }));
  };

  // Save all Role Permissions to Server
  const handleSaveRolePermissions = async () => {
    setIsSavingRolePerms(true);
    try {
      const updatedConfig: AppPermissionsConfig = {
        ...permissionsConfig,
        rolePermissions: rolePermsDraft,
      };

      const res = await savePermissions(updatedConfig);
      if (res.success) {
        showToast("Rol bazlı menü izinleri başarıyla güncellendi.");
      } else {
        showToast(`Hata: ${res.error || "Kaydedilemedi"}`);
      }
    } catch (err: any) {
      showToast(`Hata: ${err?.message || "Kaydedilemedi"}`);
    } finally {
      setIsSavingRolePerms(false);
    }
  };

  // Reset Role Permissions to Default
  const handleResetRolePermissionsToDefault = () => {
    if (confirm("Tüm rol menü izinlerini sistem varsayılan ayarlarına sıfırlamak istediğinize emin misiniz?")) {
      setRolePermsDraft(DEFAULT_ROLE_PERMISSIONS);
      showToast("Varsayılan ayarlar yüklendi. Değişiklikleri kaydetmek için 'Değişiklikleri Kaydet' butonuna basınız.");
    }
  };

  // KPI Calculations
  const adminCount = useMemo(
    () => profiles.filter((p) => (p.roles?.name || "").toLowerCase() === "admin" || p.role_id === 1).length,
    [profiles]
  );
  const salesCount = useMemo(
    () => profiles.filter((p) => (p.roles?.name || "").toLowerCase() === "sales" || p.role_id === 2).length,
    [profiles]
  );
  const viewerCount = useMemo(
    () => profiles.filter((p) => (p.roles?.name || "").toLowerCase() === "viewer" || p.role_id === 3).length,
    [profiles]
  );

  // Filtered Profiles
  const filteredProfiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return profiles.filter((p) => {
      if (roleFilter !== "all") {
        const pRole = (p.roles?.name || "").toLowerCase();
        if (pRole !== roleFilter.toLowerCase()) return false;
      }
      if (!q) return true;
      return (
        p.email?.toLowerCase().includes(q) ||
        p.full_name?.toLowerCase().includes(q) ||
        (p.roles?.name || "").toLowerCase().includes(q)
      );
    });
  }, [profiles, searchQuery, roleFilter]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl text-xs sm:text-sm font-medium flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Kullanıcı & Yetki Yönetimi
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Kullanıcı rolleri, menü görünürlükleri ve sayfa erişim izinlerini canlı olarak yönetin.
            </p>
          </div>
        </div>

        {/* Sub-Tab Navigation Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl self-start md:self-auto border border-slate-200/60">
          <button
            onClick={() => setActiveSubTab("users")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === "users"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Kullanıcılar & Özel Yetkiler</span>
          </button>
          <button
            onClick={() => setActiveSubTab("role-menus")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === "role-menus"
                ? "bg-white text-purple-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-purple-600" />
            <span>Rol Menü Yönetimi</span>
          </button>
          <button
            onClick={() => setActiveSubTab("matrix")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === "matrix"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Yetki Matrisi</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Users */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Toplam Kullanıcı</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{profiles.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Kayıtlı profil</div>
        </div>

        {/* Admins */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Yöneticiler (Admin)</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-700">{adminCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Tam sistem yetkisi</div>
        </div>

        {/* Sales Representatives */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Satış Temsilcileri</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-700">{salesCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Teklif & müşteri hazırlama</div>
        </div>

        {/* Custom Override Count */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Özel İzinli Kullanıcı</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-700">
            {Object.values(permissionsConfig.userPermissions || {}).filter((u) => u.custom).length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Rolden bağımsız menüler</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: USERS LIST & USER-LEVEL CUSTOM MENU PERMISSIONS                */}
      {/* ========================================================================= */}
      {activeSubTab === "users" && (
        <div className="space-y-4">
          {/* Search and Filters Bar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="E-posta, isim veya role göre ara..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Rol:
              </span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Tüm Roller ({profiles.length})</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name.toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                onClick={loadData}
                disabled={isLoading}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                title="Listeyi Yenile"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-purple-600" : ""}`} />
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Kullanıcı</th>
                    <th className="py-3 px-4">Rol & Yetki</th>
                    <th className="py-3 px-4">Rolü Değiştir</th>
                    <th className="py-3 px-4">Menü Görünürlükleri</th>
                    <th className="py-3 px-4 text-right">Menü Yetkilendir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                        <span>Kullanıcı profilleri yükleniyor...</span>
                      </td>
                    </tr>
                  ) : filteredProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        Arama kriterine uygun kullanıcı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map((p) => {
                      const roleName = (p.roles?.name || "").toLowerCase();
                      const isUserAdmin = roleName === "admin" || p.role_id === 1;
                      const isCurrentUser = currentAuthUser?.id === p.id;
                      const isUpdating = updatingUserId === p.id;

                      const emailKey = p.email.toLowerCase().trim();
                      const userOverride =
                        permissionsConfig.userPermissions?.[emailKey] ||
                        permissionsConfig.userPermissions?.[p.id];
                      const isCustom = Boolean(userOverride?.custom);

                      const roleMenus =
                        permissionsConfig.rolePermissions?.[roleName] ||
                        DEFAULT_ROLE_PERMISSIONS[roleName] ||
                        DEFAULT_ROLE_PERMISSIONS.user;

                      const effectiveMenuCount = isCustom
                        ? (userOverride?.allowedMenus || []).length
                        : isUserAdmin
                        ? SYSTEM_MENUS.length
                        : roleMenus.length;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* User Column */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isUserAdmin
                                    ? "bg-rose-100 text-rose-700 border border-rose-200"
                                    : "bg-purple-100 text-purple-700 border border-purple-200"
                                }`}
                              >
                                {(p.full_name || p.email || "U").substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                  <span>{p.full_name || p.email}</span>
                                  {isCurrentUser && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      Siz
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono truncate">
                                  {p.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                isUserAdmin
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : roleName === "sales"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : roleName === "viewer"
                                  ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {isUserAdmin
                                ? "👑 Admin"
                                : roleName === "sales"
                                ? "💼 Satış"
                                : roleName === "viewer"
                                ? "👁️ İzleyici"
                                : roleName.toUpperCase()}
                            </span>
                          </td>

                          {/* Change Role Selector */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <select
                                disabled={isUpdating}
                                value={p.role_id}
                                onChange={(e) => {
                                  const newRoleId = Number(e.target.value);
                                  const matched = roles.find((r) => r.id === newRoleId);
                                  if (matched) {
                                    handleUpdateRole(p.id, matched.id, matched.name);
                                  }
                                }}
                                className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer disabled:opacity-50"
                              >
                                {roles.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name.toUpperCase()}
                                  </option>
                                ))}
                              </select>
                              {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />}
                            </div>
                          </td>

                          {/* Menu Permissions Summary */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isCustom ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  <Sparkles className="w-3 h-3 text-purple-600" />
                                  <span>Özel İzin ({effectiveMenuCount} Menü)</span>
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  <span>Rolden ({effectiveMenuCount} Menü)</span>
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Customize Menus Button */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleOpenUserPermsModal(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors shadow-2xs"
                              title="Bu kullanıcının görebileceği sayfaları belirle"
                            >
                              <Sliders className="w-3.5 h-3.5 text-purple-600" />
                              <span>Menüleri Ayarla</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: ROLE-BASED MENU VISIBILITY MANAGEMENT                          */}
      {/* ========================================================================= */}
      {activeSubTab === "role-menus" && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-600" />
                <span>Rol Bazlı Sayfa & Menü Görünürlüğü</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Her rolün varsayılan olarak hangi menü ve sayfaları görebileceğini belirleyin. Bir role izin verdiğinizde o role sahip tüm kullanıcılar o menüyü görür.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetRolePermissionsToDefault}
                className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 flex items-center gap-1.5"
                title="Varsayılan rollere dön"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Varsayılana Sıfırla</span>
              </button>

              <button
                onClick={handleSaveRolePermissions}
                disabled={isSavingRolePerms}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors shadow-md shadow-purple-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingRolePerms ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Değişiklikleri Kaydet</span>
              </button>
            </div>
          </div>

          {/* Role Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => {
              const roleName = r.name.toLowerCase().trim();
              const activeRoleMenus =
                rolePermsDraft[roleName] || DEFAULT_ROLE_PERMISSIONS[roleName] || [];

              const isAdminRole = roleName === "admin" || r.id === 1;

              return (
                <div
                  key={r.id}
                  className={`bg-white rounded-2xl border transition-all p-5 shadow-2xs flex flex-col justify-between ${
                    isAdminRole ? "border-purple-200 bg-purple-50/20" : "border-slate-200"
                  }`}
                >
                  <div>
                    {/* Role Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isAdminRole
                              ? "bg-rose-100 text-rose-700 border border-rose-200"
                              : roleName === "sales"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : roleName === "viewer"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {isAdminRole ? "ADM" : r.name.substring(0, 3).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 capitalize flex items-center gap-1.5">
                            <span>{r.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-100 text-slate-600">
                              {activeRoleMenus.length} Menü
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-400 line-clamp-1">{r.description || "Kullanıcı rolü"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Menus Checkboxes */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Görünebilir Menüler ({activeRoleMenus.length}/{SYSTEM_MENUS.length})
                      </div>
                      {SYSTEM_MENUS.map((menu) => {
                        const Icon = MENU_ICONS[menu.id] || FileText;
                        const isChecked = activeRoleMenus.includes(menu.id);
                        const isLockedAdmin = isAdminRole && menu.id === "admin-users";

                        return (
                          <label
                            key={menu.id}
                            className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all select-none ${
                              isChecked
                                ? "bg-purple-50/60 border-purple-200 text-slate-900 font-medium"
                                : "bg-slate-50 border-slate-200/60 text-slate-500 hover:bg-slate-100"
                            } ${isLockedAdmin ? "cursor-not-allowed opacity-80" : ""}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                  isChecked ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-500"
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="truncate">{menu.name}</span>
                            </div>

                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isLockedAdmin}
                              onChange={() => handleToggleRoleMenu(roleName, menu.id)}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Bu role sahip:</span>
                    <span className="font-semibold text-slate-700">
                      {profiles.filter((p) => (p.roles?.name || "").toLowerCase() === roleName).length} Kullanıcı
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: PERMISSIONS MATRIX OVERVIEW                                    */}
      {/* ========================================================================= */}
      {activeSubTab === "matrix" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Genel Yetki & İzin Matrisi (RBAC)
                </h3>
                <p className="text-xs text-slate-500">
                  Rollerin sistem modüllerine, işlem yetkilerine ve menülere erişim seviyeleri
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveSubTab("role-menus")}
              className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Rol Menülerini Düzenle</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Modül / Sayfa</th>
                  {roles.map((r) => (
                    <th key={r.id} className="py-3 px-4 text-center">
                      {r.name.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SYSTEM_MENUS.map((menu) => {
                  const Icon = MENU_ICONS[menu.id] || FileText;
                  return (
                    <tr key={menu.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span>{menu.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal pl-6">
                          {menu.description}
                        </div>
                      </td>
                      {roles.map((r) => {
                        const rName = r.name.toLowerCase().trim();
                        const allowed = (
                          permissionsConfig.rolePermissions?.[rName] ||
                          DEFAULT_ROLE_PERMISSIONS[rName] ||
                          []
                        ).includes(menu.id);

                        return (
                          <td key={r.id} className="py-3 px-4 text-center">
                            {allowed ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400">
                                <X className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Additional Functional Permissions */}
                <tr className="bg-slate-50/50 font-bold text-slate-700">
                  <td colSpan={roles.length + 1} className="py-2.5 px-4 uppercase text-[10px] tracking-wider text-purple-700">
                    Özel İşlem Yetkileri (İşlem Güvenliği)
                  </td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-slate-800">
                    <div className="font-semibold">Kayıtlı Teklifleri Silme</div>
                    <div className="text-[11px] text-slate-400">Kritik teklif kayıtlarını veritabanından kalıcı silme</div>
                  </td>
                  {roles.map((r) => {
                    const isAdminRole = r.name.toLowerCase() === "admin" || r.id === 1;
                    return (
                      <td key={r.id} className="py-3 px-4 text-center">
                        {isAdminRole ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                            Yalnızca Admin
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                <tr>
                  <td className="py-3 px-4 text-slate-800">
                    <div className="font-semibold">Kullanıcı Rolü & Yetki Değiştirme</div>
                    <div className="text-[11px] text-slate-400">Sistemdeki personellerin yetkilerini düzenleme</div>
                  </td>
                  {roles.map((r) => {
                    const isAdminRole = r.name.toLowerCase() === "admin" || r.id === 1;
                    return (
                      <td key={r.id} className="py-3 px-4 text-center">
                        {isAdminRole ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                            Yalnızca Admin
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER CUSTOM MENU PERMISSIONS MODAL                                        */}
      {/* ========================================================================= */}
      {selectedUserForPerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-purple-500/20 shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <span>Özel Menü & Sayfa Yetkilendirme</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">{selectedUserForPerms.email}</span>{" "}
                    ({selectedUserForPerms.roles?.name?.toUpperCase() || "Kullanıcı"})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedUserForPerms(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Toggle Mode: Inherit vs Custom */}
            <div className="space-y-4 mb-6">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="permMode"
                    checked={!userCustomActive}
                    onChange={() => {
                      setUserCustomActive(false);
                      const rName = (selectedUserForPerms.roles?.name || "").toLowerCase().trim();
                      const roleDefault =
                        permissionsConfig.rolePermissions?.[rName] ||
                        DEFAULT_ROLE_PERMISSIONS[rName] ||
                        DEFAULT_ROLE_PERMISSIONS.user;
                      setUserSelectedMenus([...roleDefault]);
                    }}
                    className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Rolden Devral (Varsayılan)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Kullanıcı, bağlı olduğu {selectedUserForPerms.roles?.name?.toUpperCase()} rolünün izinlerine göre menüleri görür.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-slate-200/60">
                  <input
                    type="radio"
                    name="permMode"
                    checked={userCustomActive}
                    onChange={() => setUserCustomActive(true)}
                    className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <span>Bu Kullanıcıya Özel Menü Yetkileri Tanımla</span>
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Rol izinlerini geçersiz kılar, yalnızca seçtiğiniz menü ve sayfaları gösterir.
                    </div>
                  </div>
                </label>
              </div>

              {/* Quick Actions (when custom active) */}
              {userCustomActive && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="font-semibold text-slate-700">
                    Görünecek Menüler ({userSelectedMenus.length}/{SYSTEM_MENUS.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUserSelectedMenus(SYSTEM_MENUS.map((m) => m.id))}
                      className="text-purple-600 hover:text-purple-800 text-[11px] font-bold"
                    >
                      Tümünü Seç
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setUserSelectedMenus([])}
                      className="text-slate-500 hover:text-rose-600 text-[11px] font-bold"
                    >
                      Temizle
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const rName = (selectedUserForPerms.roles?.name || "").toLowerCase().trim();
                        const roleDefault =
                          permissionsConfig.rolePermissions?.[rName] ||
                          DEFAULT_ROLE_PERMISSIONS[rName] ||
                          DEFAULT_ROLE_PERMISSIONS.user;
                        setUserSelectedMenus([...roleDefault]);
                      }}
                      className="text-slate-500 hover:text-slate-800 text-[11px] font-bold"
                    >
                      Rolden Doldur
                    </button>
                  </div>
                </div>
              )}

              {/* Menus List */}
              <div className="max-h-64 overflow-y-auto pr-1 space-y-2 no-scrollbar">
                {SYSTEM_MENUS.map((menu) => {
                  const Icon = MENU_ICONS[menu.id] || FileText;
                  const isChecked = userSelectedMenus.includes(menu.id);

                  return (
                    <label
                      key={menu.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? "bg-purple-50/70 border-purple-200 text-slate-900 font-medium"
                          : "bg-slate-50/70 border-slate-200 text-slate-500 hover:bg-slate-100"
                      } ${!userCustomActive ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isChecked ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{menu.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{menu.description}</div>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!userCustomActive}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUserSelectedMenus((prev) => [...prev, menu.id]);
                          } else {
                            setUserSelectedMenus((prev) => prev.filter((m) => m !== menu.id));
                          }
                        }}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedUserForPerms(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSaveUserPermissions}
                disabled={isSavingUserPerms}
                className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors shadow-md shadow-purple-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingUserPerms && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Yetkileri Kaydet ve Uygula</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
