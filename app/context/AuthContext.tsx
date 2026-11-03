"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../utils/supabase";
import {
  UserProfile,
  UserRole,
  AppMenuId,
  AppPermissionsConfig,
} from "../types/accounting";
import {
  DEFAULT_PERMISSIONS_CONFIG,
  getLocalPermissionsConfig,
  saveLocalPermissionsConfig,
  resolveUserAllowedMenus,
} from "../utils/permissions";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  roleName: string;
  isAdmin: boolean;
  isSales: boolean;
  isViewer: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Menu Permissions
  permissionsConfig: AppPermissionsConfig;
  allowedMenus: AppMenuId[];
  hasMenuAccess: (menuId: AppMenuId) => boolean;
  savePermissions: (newConfig: AppPermissionsConfig) => Promise<{ success: boolean; error?: string }>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionsConfig, setPermissionsConfig] = useState<AppPermissionsConfig>(() =>
    getLocalPermissionsConfig()
  );

  // Fetch user profile and joined role from Supabase profiles & roles table
  const fetchUserProfile = useCallback(async (currentUserId: string, userEmail?: string | null) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      // 1. Try finding by user UUID (id)
      let { data, error: fetchErr } = await supabase
        .from("profiles")
        .select("id, email, full_name, role_id, user_name, created_at, updated_at, roles(id, name, description, created_at)")
        .eq("id", currentUserId)
        .maybeSingle();

      // 2. If not found by id but we have an email, try finding by email
      if (!data && userEmail) {
        const { data: emailData } = await supabase
          .from("profiles")
          .select("id, email, full_name, role_id, user_name, created_at, updated_at, roles(id, name, description, created_at)")
          .eq("email", userEmail.trim().toLowerCase())
          .maybeSingle();

        if (emailData) {
          data = emailData;
        }
      }

      if (data) {
        const userProfile: UserProfile = {
          id: data.id,
          email: data.email,
          full_name: data.full_name || "",
          role_id: data.role_id,
          user_name: data.user_name,
          created_at: data.created_at,
          updated_at: data.updated_at,
          roles: Array.isArray(data.roles) ? data.roles[0] : (data.roles as UserRole) || null,
        };

        setProfile(userProfile);
        setRole(userProfile.roles || null);
        return userProfile;
      } else {
        // Fallback profile if record not found in profiles table yet
        const fallbackProfile: UserProfile = {
          id: currentUserId,
          email: userEmail || "",
          full_name: "",
          role_id: 2, // default to sales
          roles: {
            id: 2,
            name: "sales",
            description: "Teklif oluşturan satış temsilcisi",
          },
        };
        setProfile(fallbackProfile);
        setRole(fallbackProfile.roles || null);
        return fallbackProfile;
      }
    } catch (err) {
      console.warn("Could not fetch user profile:", err);
      return null;
    }
  }, []);

  // Initialize session and listen for auth changes
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // Get current session on load
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession } }) => {
        if (!isMounted) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          await fetchUserProfile(initialSession.user.id, initialSession.user.email);
        }
      })
      .catch((err) => {
        console.warn("Auth getSession error:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await fetchUserProfile(newSession.user.id, newSession.user.email);
      } else {
        setProfile(null);
        setRole(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  // Sign in with email and password
  const signIn = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: "Supabase bağlantısı kurulamadı." };
    }

    setError(null);
    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) {
        let msg = signInErr.message;
        if (msg.includes("Invalid login credentials")) {
          msg = "Geçersiz e-posta adresi veya şifre girdiniz.";
        } else if (msg.includes("Email not confirmed")) {
          msg = "E-posta adresiniz henüz doğrulanmamış.";
        } else if (msg.includes("User not found")) {
          msg = "Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.";
        } else if (msg.includes("Too many requests")) {
          msg = "Çok fazla deneme yaptınız. Lütfen biraz bekleyiniz.";
        }
        setError(msg);
        return { success: false, error: msg };
      }

      if (data.session && data.user) {
        setSession(data.session);
        setUser(data.user);
        await fetchUserProfile(data.user.id, data.user.email);
        return { success: true };
      }

      return { success: false, error: "Giriş yapılamadı, lütfen tekrar deneyin." };
    } catch (err: any) {
      const msg = err?.message || "Giriş sırasında beklenmeyen bir hata oluştu.";
      setError(msg);
      return { success: false, error: msg };
    }
  };

  // Sign out
  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Sign out error:", err);
      }
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setError(null);
  };

  // Refresh user profile & roles
  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.id, user.email);
    }
  };

  // Fetch remote permissions config
  const refreshPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.permissions) {
          setPermissionsConfig(data.permissions);
          saveLocalPermissionsConfig(data.permissions);
        }
      }
    } catch (err) {
      console.warn("Could not fetch remote permissions:", err);
    }
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Save permissions config to server & local storage
  const savePermissions = async (
    newConfig: AppPermissionsConfig
  ): Promise<{ success: boolean; error?: string }> => {
    setPermissionsConfig(newConfig);
    saveLocalPermissionsConfig(newConfig);
    try {
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.permissions) {
          setPermissionsConfig(data.permissions);
          saveLocalPermissionsConfig(data.permissions);
          return { success: true };
        }
      }
      return { success: false, error: "Sunucuya kaydedilemedi." };
    } catch (err: any) {
      return { success: false, error: err?.message || "Yetki kaydı hatası" };
    }
  };

  // Calculate permissions
  const rawRoleName = (role?.name || "").toLowerCase().trim();
  const isAdmin = rawRoleName === "admin" || profile?.role_id === 1;
  const isSales = rawRoleName === "sales" || profile?.role_id === 2;
  const isViewer = rawRoleName === "viewer" || profile?.role_id === 3;
  const roleName = isAdmin ? "admin" : isSales ? "sales" : isViewer ? "viewer" : rawRoleName || "user";

  // Compute allowed menus for the current user
  const allowedMenus = resolveUserAllowedMenus(
    user?.email,
    user?.id,
    roleName,
    permissionsConfig,
    isAdmin
  );

  const hasMenuAccess = useCallback(
    (menuId: AppMenuId): boolean => {
      if (menuId === "admin-users") return isAdmin;
      return allowedMenus.includes(menuId);
    },
    [allowedMenus, isAdmin]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        roleName,
        isAdmin,
        isSales,
        isViewer,
        isAuthenticated: Boolean(user),
        isLoading,
        error,
        signIn,
        signOut,
        refreshProfile,
        permissionsConfig,
        allowedMenus,
        hasMenuAccess,
        savePermissions,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
