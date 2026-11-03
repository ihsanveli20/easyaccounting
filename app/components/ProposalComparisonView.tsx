"use client";

import React, { useState } from "react";
import {
  ArrowLeftRight,
  Sparkles,
  CheckCircle2,
  Layers,
  FileText,
  History,
  TrendingDown,
  TrendingUp,
  Percent,
  Zap,
  Bell,
  ChevronRight,
  ShieldCheck,
  Calculator,
  ArrowRight,
  Check,
  Clock,
  Sparkle,
} from "lucide-react";

interface ProposalComparisonViewProps {
  onGoToQuote?: () => void;
  onGoToHistory?: () => void;
}

export default function ProposalComparisonView({
  onGoToQuote,
  onGoToHistory,
}: ProposalComparisonViewProps) {
  const [notified, setNotified] = useState<boolean>(false);
  const [activeTabPreview, setActiveTabPreview] = useState<"diff" | "margin" | "supplier">("diff");

  const handleNotifyMe = () => {
    setNotified(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hero Announcement Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 border border-indigo-500/20 text-white p-6 sm:p-10 shadow-2xl">
        {/* Glow Effects */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wide uppercase mb-4 backdrop-blur-md shadow-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-amber-300 font-extrabold">ÇOK YAKINDA</span>
            <span className="text-purple-300/60">•</span>
            <span className="text-[11px] font-semibold text-slate-300">Geliştirme Aşamasında</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Teklif Karşılaştırma & Kıyaslama Modülü
          </h1>

          <p className="text-sm sm:text-base text-slate-300/90 leading-relaxed mb-6">
            Müşterilerinize verdiğiniz farklı revizyonları, alternatif ürün seçeneklerini ve tedarikçi maliyet tekliflerini yan yana kıyaslayın. En karlı, en avantajlı ve rekabetçi teklifleri saniyeler içinde analiz edin.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {onGoToQuote && (
              <button
                onClick={onGoToQuote}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-purple-600/30 hover:scale-102"
              >
                <FileText className="w-4 h-4" />
                <span>Mevcut Teklif Oluştur</span>
              </button>
            )}

            {onGoToHistory && (
              <button
                onClick={onGoToHistory}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 font-semibold text-xs sm:text-sm transition-all backdrop-blur-md"
              >
                <History className="w-4 h-4 text-slate-300" />
                <span>Kayıtlı Teklifleri İncele</span>
              </button>
            )}

            <button
              onClick={handleNotifyMe}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                notified
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300"
              }`}
            >
              {notified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Bildirim Listenize Eklendi!</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 text-amber-400" />
                  <span>Yayınlandığında Haber Ver</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Sneak Peek Simulation (Canlı Kıyaslama Simülasyonu) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">
                Önizleme & Simülasyon
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Mockup Demo
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              Yan Yana Karşılaştırma Ekranı Nasıl Çalışacak?
            </h2>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start sm:self-auto text-xs font-semibold">
            <button
              onClick={() => setActiveTabPreview("diff")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTabPreview === "diff"
                  ? "bg-white text-purple-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Fiyat Farkı (Diff)
            </button>
            <button
              onClick={() => setActiveTabPreview("margin")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTabPreview === "margin"
                  ? "bg-white text-purple-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Karlılık Kıyası
            </button>
            <button
              onClick={() => setActiveTabPreview("supplier")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTabPreview === "supplier"
                  ? "bg-white text-purple-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tedarikçi Seçimi
            </button>
          </div>
        </div>

        {/* Side by Side Cards Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Offer A */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Orijinal Teklif
                </span>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>TEK-2026-0042 (Rev 1)</span>
                </h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                12 Ekim 2026
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200/80 mb-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Müşteri:</span>
                <span className="font-semibold text-slate-800">Atlas İnşaat Ltd.</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Kalem Sayısı:</span>
                <span className="font-semibold text-slate-800">4 Malzeme Kalemi</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-500 font-medium">Toplam Tutar:</span>
                <span className="font-bold text-slate-900 text-sm">184.200,00 TRY</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2 rounded-lg bg-white border border-slate-200/60 flex justify-between items-center">
                <span className="text-slate-700 font-medium">Betonarme Çelik Profil</span>
                <span className="font-bold text-slate-800">120,00 ₺ / kg</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200/60 flex justify-between items-center">
                <span className="text-slate-700 font-medium">Yalıtımlı Sandviç Panel</span>
                <span className="font-bold text-slate-800">420,00 ₺ / m²</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200/60 flex justify-between items-center">
                <span className="text-slate-700 font-medium">Epoksi Zemin Kaplama</span>
                <span className="font-bold text-slate-800">285,00 ₺ / m²</span>
              </div>
            </div>
          </div>

          {/* Offer B (Compared) */}
          <div className="rounded-2xl border-2 border-purple-500/40 bg-purple-50/20 p-4 sm:p-5 relative overflow-hidden shadow-xs">
            <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Yeni Revizyon (Rev 2)</span>
            </div>

            <div className="flex items-center justify-between mb-3 mt-1">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Kıyaslanan Teklif
                </span>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span>TEK-2026-0042-R2</span>
                </h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 mr-24 sm:mr-28">
                Güncel
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-purple-200/80 mb-3 space-y-1.5 shadow-2xs">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Müşteri:</span>
                <span className="font-semibold text-slate-800">Atlas İnşaat Ltd.</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Fark Analizi:</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  -%7.98 Daha Avantajlı
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-purple-100">
                <span className="text-slate-500 font-medium">Yeni Toplam:</span>
                <span className="font-bold text-purple-700 text-sm">169.500,00 TRY (-14.700 ₺)</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2 rounded-lg bg-white border border-purple-200 flex justify-between items-center shadow-2xs">
                <span className="text-slate-800 font-semibold">Betonarme Çelik Profil</span>
                <div className="flex items-center gap-2">
                  <span className="line-through text-slate-400">120 ₺</span>
                  <span className="font-bold text-emerald-700">110,00 ₺ (-%8.3)</span>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-purple-200 flex justify-between items-center shadow-2xs">
                <span className="text-slate-800 font-semibold">Yalıtımlı Sandviç Panel</span>
                <div className="flex items-center gap-2">
                  <span className="line-through text-slate-400">420 ₺</span>
                  <span className="font-bold text-emerald-700">385,00 ₺ (-%8.3)</span>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200/70 flex justify-between items-center">
                <span className="text-slate-700 font-medium">Epoksi Zemin Kaplama</span>
                <span className="font-semibold text-slate-600">285,00 ₺ (Aynı)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Pillar 1 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1.5">
              Otomatik Versiyon Kıyaslama
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Müşteriye verdiğiniz 1., 2. ve 3. teklif revizyonları arasındaki birim fiyat, miktar ve genel toplam değişimlerini tek ekranda renkli fark analiziyle inceleyin.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-purple-700">
            <span>Revizyon Diff Motoru</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Pillar 2 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <Percent className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1.5">
              Karlılık & Marj Simülasyonu
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              İskonto uygulandığında brüt kar marjınızın nasıl etkilendiğini anlık görün. En karlı teklif kombinasyonunu minimum riskle hazırlayın.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
            <span>Marj & Stopaj Koruma</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Pillar 3 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1.5">
              Tedarikçi Maliyet Matrisi
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Farklı tedarikçilerden aldığınız ham malzeme fiyat tekliflerini içe aktarın, sistem en ucuz tedarikçiyi otomatik olarak teklif formunuza yansıtsın.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-blue-700">
            <span>Optimum Satın Alma</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
