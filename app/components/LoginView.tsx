"use client";

import React, { useState } from "react";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function LoginView() {
  const { signIn, error: authError } = useAuth();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError("Lütfen e-posta adresinizi giriniz.");
      return;
    }
    if (!password) {
      setLocalError("Lütfen şifrenizi giriniz.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signIn(email, password);
      if (!res.success) {
        setLocalError(res.error || "Giriş başarısız oldu.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectQuickEmail = (quickEmail: string) => {
    setEmail(quickEmail);
    setLocalError(null);
  };

  const currentError = localError || authError;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-hidden font-sans">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-white/95 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8">
          {/* Brand & Logo Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white p-2 shadow-xl shadow-slate-900/10 border border-slate-200/80 mb-3.5 mx-auto group hover:scale-105 transition-all">
              <img
                src="/logo.jpg"
                alt="Logo"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Kolay Muhasebe
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                PRO
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Mizan, Ürün Stok & Teklif Yönetimi
            </p>
          </div>

          {/* Error Banner */}
          {currentError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{currentError}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Kurumsal E-posta
              </label>
              <div className="relative flex items-center border border-slate-300 rounded-xl bg-slate-50/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all overflow-hidden shadow-2xs">
                <div className="pl-3.5 text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adiniz@sirket.com"
                  autoComplete="email"
                  required
                  className="w-full py-2.5 px-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 bg-transparent focus:outline-hidden"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Şifre
                </label>
              </div>
              <div className="relative flex items-center border border-slate-300 rounded-xl bg-slate-50/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all overflow-hidden shadow-2xs">
                <div className="pl-3.5 text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full py-2.5 px-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 bg-transparent focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="p-2 mr-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-700 hover:via-teal-700 hover:to-blue-700 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-700/25 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Giriş Yapılıyor...</span>
                </>
              ) : (
                <>
                  <span>Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Login Preset Chips */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Kayıtlı Kullanıcılar (Hızlı Seçim)</span>
              </span>
              <span className="text-[10px] text-slate-400">Tıkla ve doldur</span>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleSelectQuickEmail("veliihsan@ea.co")}
                className={`w-full p-2 rounded-xl text-left border text-xs flex items-center justify-between transition-all ${email === "veliihsan@ea.co"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold"
                  : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px]">
                    AD
                  </div>
                  <span>veliihsan@ea.co</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                  👑 Admin
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectQuickEmail("bilalersy@ea.co")}
                className={`w-full p-2 rounded-xl text-left border text-xs flex items-center justify-between transition-all ${email === "bilalersy@ea.co"
                  ? "bg-blue-50 border-blue-300 text-blue-950 font-semibold"
                  : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                    SA
                  </div>
                  <span>bilalersy@ea.co</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                  💼 Satış
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectQuickEmail("rustemskn@ea.co")}
                className={`w-full p-2 rounded-xl text-left border text-xs flex items-center justify-between transition-all ${email === "rustemskn@ea.co"
                  ? "bg-blue-50 border-blue-300 text-blue-950 font-semibold"
                  : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                    SA
                  </div>
                  <span>rustemskn@ea.co</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                  💼 Satış
                </span>
              </button>
            </div>
          </div>

          {/* Footer Security Badge */}
          <div className="mt-5 pt-3 text-center flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-Bit SSL Güvenli Bağlantı • Supabase Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
}
