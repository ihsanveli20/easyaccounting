"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Send,
  RotateCcw,
  Phone,
  FileText,
  AlignLeft,
  Smartphone,
  ExternalLink,
  FileDown,
  Loader2,
  FileCheck,
  Info,
  CheckCircle2,
} from "lucide-react";
import {
  WhatsAppProposalData,
  generateProposalWhatsAppText,
  createWhatsAppShareUrl,
  formatPhoneNumberForWhatsApp,
} from "../utils/whatsapp";
import { formatCurrency } from "../utils/excel";

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalData: WhatsAppProposalData;
  initialPhoneNumber?: string;
  defaultMode?: "text" | "pdf";
  onSharePdf?: (
    phoneNumber: string,
    messageText: string
  ) => Promise<{ sharedViaNative: boolean; downloaded: boolean } | void>;
  onDownloadPdfOnly?: () => Promise<void> | void;
}

export default function WhatsAppShareModal({
  isOpen,
  onClose,
  proposalData,
  initialPhoneNumber = "",
  defaultMode = "pdf",
  onSharePdf,
  onDownloadPdfOnly,
}: WhatsAppShareModalProps) {
  const [shareMode, setShareMode] = useState<"text" | "pdf">(defaultMode);
  const [phoneNumber, setPhoneNumber] = useState<string>(initialPhoneNumber);
  const [format, setFormat] = useState<"detailed" | "summary">("detailed");
  const [messageText, setMessageText] = useState<string>("");
  const [pdfCompanionText, setPdfCompanionText] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [isCustomEdited, setIsCustomEdited] = useState<boolean>(false);
  const [isSharingPdf, setIsSharingPdf] = useState<boolean>(false);
  const [desktopNotice, setDesktopNotice] = useState<string | null>(null);

  // Generate companion message for PDF mode
  const generatePdfDefaultMessage = () => {
    const cust = proposalData.customerName?.trim() || "Yetkili";
    const num = proposalData.proposalNumber?.trim();
    const tot = formatCurrency(proposalData.grandTotal);
    const numPart = num ? `${num} numaralı f` : "F";
    const comp = proposalData.companyName?.trim() ? `\n🏢 *${proposalData.companyName.trim()}*` : "";
    return `Sayın *${cust}*,${comp}\n${numPart}iyat teklifimiz ekteki resmi PDF belgesinde bilgilerinize sunulmuştur.\n\n💰 *Genel Toplam:* ${tot}\n\nDetaylı incelemenizi rica eder, iyi çalışmalar dileriz.`;
  };

  // Re-generate default message when proposalData or format changes (unless manually edited)
  useEffect(() => {
    if (!isCustomEdited) {
      const generated = generateProposalWhatsAppText({
        ...proposalData,
        format,
      });
      setMessageText(generated);
    }
  }, [proposalData, format, isCustomEdited]);

  // When modal is reopened, reset custom edited flag and reload initial phone
  useEffect(() => {
    if (isOpen) {
      setShareMode(defaultMode);
      setIsCustomEdited(false);
      setPhoneNumber(initialPhoneNumber);
      const generated = generateProposalWhatsAppText({
        ...proposalData,
        format: "detailed",
      });
      setFormat("detailed");
      setMessageText(generated);
      setPdfCompanionText(generatePdfDefaultMessage());
      setCopied(false);
      setDesktopNotice(null);
    }
  }, [isOpen, initialPhoneNumber, defaultMode]);

  if (!isOpen) return null;

  const handleFormatChange = (newFormat: "detailed" | "summary") => {
    setFormat(newFormat);
    setIsCustomEdited(false);
    const text = generateProposalWhatsAppText({
      ...proposalData,
      format: newFormat,
    });
    setMessageText(text);
  };

  const handleResetToDefault = () => {
    setIsCustomEdited(false);
    const text = generateProposalWhatsAppText({
      ...proposalData,
      format,
    });
    setMessageText(text);
  };

  const handleCopyText = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Metin kopyalanamadı:", err);
    }
  };

  const handleSendTextWhatsApp = () => {
    const url = createWhatsAppShareUrl(phoneNumber, messageText);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleExecutePdfShare = async () => {
    if (!onSharePdf) {
      alert("PDF paylaşım servisi bulunamadı.");
      return;
    }

    setIsSharingPdf(true);
    setDesktopNotice(null);
    try {
      const result = await onSharePdf(phoneNumber, pdfCompanionText);
      if (result && !result.sharedViaNative && result.downloaded) {
        setDesktopNotice(
          "PDF belgesi bilgisayarınıza indirildi ve WhatsApp Web açıldı! İndirilen PDF dosyasını sohbete sürükleyip bırakarak veya ataç ikonuna (📎 ➔ Belge) tıklayarak anında gönderebilirsiniz."
        );
      }
    } catch (err: unknown) {
      console.error("PDF share error:", err);
    } finally {
      setIsSharingPdf(false);
    }
  };

  const cleanPhonePreview = formatPhoneNumberForWhatsApp(phoneNumber);

  const safeCustomer = (proposalData.customerName?.trim() || "Musteri")
    .replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")
    .substring(0, 30);
  const safeNumber = (proposalData.proposalNumber || "Teklif").replace(/[^a-zA-Z0-9_-]/g, "_");
  const estimatedFileName = `${safeNumber}_${safeCustomer}.pdf`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with WhatsApp branding */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-xs">
              {/* WhatsApp SVG Icon */}
              <svg
                className="w-5 h-5 fill-current text-white"
                viewBox="0 0 24 24"
              >
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.03C9.36 7.03 9.09 7.1 8.87 7.33C8.65 7.57 8.02 8.16 8.02 9.36C8.02 10.56 8.9 11.71 9.02 11.87C9.14 12.03 10.73 14.5 13.18 15.56C15.22 16.44 15.63 16.26 16.07 16.22C16.52 16.18 17.5 15.63 17.7 15.07C17.91 14.5 17.91 14.02 17.84 13.92C17.78 13.82 17.62 13.76 17.37 13.63C17.12 13.51 15.91 12.92 15.68 12.83C15.46 12.75 15.3 12.71 15.13 12.95C14.97 13.2 14.51 13.76 14.37 13.92C14.23 14.08 14.1 14.1 13.85 13.97C13.6 13.85 12.81 13.59 11.87 12.75C11.14 12.1 10.65 11.29 10.51 11.05C10.37 10.8 10.5 10.67 10.62 10.54C10.73 10.43 10.87 10.25 11 10.1C11.12 9.94 11.17 9.82 11.25 9.66C11.33 9.49 11.29 9.35 11.23 9.22C11.17 9.1 10.68 7.9 10.47 7.41C10.27 6.93 10.07 7 9.92 6.99C9.78 6.99 9.61 7.03 9.53 7.03Z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                WhatsApp ile Teklif Paylaş
              </h3>
              <p className="text-emerald-100 text-xs">
                {proposalData.proposalNumber || "Fiyat Teklifi"} • {proposalData.customerName || "Müşteri"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Mode Selector: PDF Belgesi vs Metin Mesajı */}
        <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setShareMode("pdf");
                setDesktopNotice(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                shareMode === "pdf"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileDown className="w-4 h-4 text-emerald-600" />
              <span>PDF Teklif Belgesi Paylaş</span>
              <span className="hidden sm:inline-block px-1.5 py-0.2 text-[9px] font-bold bg-emerald-100 text-emerald-800 rounded">
                Önerilen
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShareMode("text");
                setDesktopNotice(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                shareMode === "text"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>WhatsApp Metin Mesajı</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-slate-800 text-xs sm:text-sm">
          {/* Recipient Phone input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Alıcı WhatsApp Numarası <span className="font-normal text-slate-500">(Opsiyonel)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 border border-slate-300 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 overflow-hidden bg-white shadow-2xs">
                <span className="px-3 py-2 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold text-xs flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  +90
                </span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="05XX XXX XX XX veya 5XXXXXXXXX"
                  className="w-full px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden"
                />
                {phoneNumber && (
                  <button
                    onClick={() => setPhoneNumber("")}
                    className="p-1 mr-2 text-slate-400 hover:text-slate-600"
                    title="Temizle"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              {cleanPhonePreview ? (
                <span className="text-emerald-700 font-medium">
                  Doğrudan +{cleanPhonePreview} numaralı kişinin WhatsApp sohbeti açılacaktır.
                </span>
              ) : (
                "Numara belirtmezseniz WhatsApp açıldığında dilediğiniz kişi veya grubu seçebilirsiniz."
              )}
            </p>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: PDF BELGESİ OLARAK PAYLAŞ                          */}
          {/* ========================================================= */}
          {shareMode === "pdf" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* PDF Document Preview Card */}
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-teal-50/30 to-white shadow-2xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-14 rounded-lg bg-rose-600 text-white flex flex-col items-center justify-center font-bold shadow-xs shrink-0">
                    <span className="text-[10px] tracking-wider uppercase opacity-90">PDF</span>
                    <FileText className="w-5 h-5 mt-0.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                      {estimatedFileName}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-emerald-800">
                        {formatCurrency(proposalData.grandTotal)}
                      </span>
                      <span>•</span>
                      <span>A4 Resmi Teklif Belgesi</span>
                      <span>•</span>
                      <span>{proposalData.items.length} Kalem</span>
                    </div>
                  </div>
                </div>

                {onDownloadPdfOnly && (
                  <button
                    type="button"
                    onClick={onDownloadPdfOnly}
                    className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-100/60 rounded-xl transition-colors shrink-0"
                    title="PDF Belgesini Doğrudan İndir"
                  >
                    <FileDown className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Desktop Notice if triggered */}
              {desktopNotice && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">{desktopNotice}</p>
                    <p className="text-[11px] text-emerald-700">
                      💡 İpucu: WhatsApp Web sekmesinde alt kısımdaki ataç (📎) simgesine basıp &quot;Belge&quot; seçerek de PDF dosyasını seçebilirsiniz.
                    </p>
                  </div>
                </div>
              )}

              {/* Companion message input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    PDF İle Birlikte Gönderilecek WhatsApp Mesajı
                  </label>
                  <button
                    type="button"
                    onClick={() => setPdfCompanionText(generatePdfDefaultMessage())}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Sıfırla</span>
                  </button>
                </div>
                <div className="border border-emerald-200 rounded-xl overflow-hidden bg-[#F0FDF4]/30">
                  <textarea
                    value={pdfCompanionText}
                    onChange={(e) => setPdfCompanionText(e.target.value)}
                    rows={4}
                    className="w-full p-3 text-xs font-mono text-slate-800 bg-transparent focus:outline-hidden resize-none leading-relaxed"
                    placeholder="PDF belgesine eşlik edecek kısa mesaj..."
                  />
                  <div className="px-3 py-1 bg-emerald-50/70 border-t border-emerald-100 flex items-center justify-between text-[10px] text-slate-500">
                    <span>*kalın*, _italik_ metin formatı desteklenir</span>
                    <span>{pdfCompanionText.length} karakter</span>
                  </div>
                </div>
              </div>

              {/* Info guideline box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Nasıl çalışır?</strong> Mobil cihazlarda (iPhone, Android) ve Safari&apos;de doğrudan WhatsApp paylaşılarak PDF belgesi sohbete eklenir. Masaüstü tarayıcılarda PDF dosyanız otomatik olarak İndirilenler klasörüne kaydedilir ve WhatsApp Web açılır.
                </p>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: METİN MESAJI OLARAK PAYLAŞ                         */}
          {/* ========================================================= */}
          {shareMode === "text" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Format selection tabs */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Metin Paylaşım Formatı
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleFormatChange("detailed")}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                      format === "detailed"
                        ? "bg-white text-emerald-800 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Detaylı Liste (Tüm Kalemler)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatChange("summary")}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                      format === "summary"
                        ? "bg-white text-emerald-800 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Özet Teklif</span>
                  </button>
                </div>
              </div>

              {/* Message Preview & Edit box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>WhatsApp Mesaj Önizleme</span>
                    {isCustomEdited && (
                      <span className="text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Özelleştirildi
                      </span>
                    )}
                  </label>
                  {isCustomEdited && (
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Orijinal Metne Dön</span>
                    </button>
                  )}
                </div>

                <div className="relative border border-emerald-200 rounded-xl overflow-hidden bg-[#F0FDF4]/40 shadow-inner">
                  <textarea
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      setIsCustomEdited(true);
                    }}
                    rows={8}
                    className="w-full p-3 text-xs font-mono text-slate-800 bg-transparent focus:outline-hidden resize-none leading-relaxed"
                    placeholder="WhatsApp mesaj içeriği..."
                  />
                  <div className="px-3 py-1.5 bg-emerald-50/80 border-t border-emerald-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                    <span>*kalın*, _italik_ WhatsApp biçimlendirmesi desteklenir</span>
                    <span>{messageText.length} karakter</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            Kapat
          </button>

          <div className="flex items-center gap-2">
            {shareMode === "pdf" ? (
              <>
                {onDownloadPdfOnly && (
                  <button
                    type="button"
                    onClick={onDownloadPdfOnly}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                    title="PDF Dosyasını İndir"
                  >
                    <FileDown className="w-3.5 h-3.5 text-slate-600" />
                    <span>PDF İndir</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExecutePdfShare}
                  disabled={isSharingPdf}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-[#25D366] hover:bg-[#20BD5A] active:bg-[#1DA850] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-700/20 transition-all active:scale-98 disabled:opacity-70 disabled:cursor-wait"
                >
                  {isSharingPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>PDF Hazırlanıyor...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.03C9.36 7.03 9.09 7.1 8.87 7.33C8.65 7.57 8.02 8.16 8.02 9.36C8.02 10.56 8.9 11.71 9.02 11.87C9.14 12.03 10.73 14.5 13.18 15.56C15.22 16.44 15.63 16.26 16.07 16.22C16.52 16.18 17.5 15.63 17.7 15.07C17.91 14.5 17.91 14.02 17.84 13.92C17.78 13.82 17.62 13.76 17.37 13.63C17.12 13.51 15.91 12.92 15.68 12.83C15.46 12.75 15.3 12.71 15.13 12.95C14.97 13.2 14.51 13.76 14.37 13.92C14.23 14.08 14.1 14.1 13.85 13.97C13.6 13.85 12.81 13.59 11.87 12.75C11.14 12.1 10.65 11.29 10.51 11.05C10.37 10.8 10.5 10.67 10.62 10.54C10.73 10.43 10.87 10.25 11 10.1C11.12 9.94 11.17 9.82 11.25 9.66C11.33 9.49 11.29 9.35 11.23 9.22C11.17 9.1 10.68 7.9 10.47 7.41C10.27 6.93 10.07 7 9.92 6.99C9.78 6.99 9.61 7.03 9.53 7.03Z" />
                      </svg>
                      <span>PDF&apos;i WhatsApp&apos;ta Paylaş</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleCopyText(messageText)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  title="Mesaj metnini panoya kopyala"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Metni Kopyala</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendTextWhatsApp}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-[#25D366] hover:bg-[#20BD5A] active:bg-[#1DA850] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-700/20 transition-all active:scale-98"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.03C9.36 7.03 9.09 7.1 8.87 7.33C8.65 7.57 8.02 8.16 8.02 9.36C8.02 10.56 8.9 11.71 9.02 11.87C9.14 12.03 10.73 14.5 13.18 15.56C15.22 16.44 15.63 16.26 16.07 16.22C16.52 16.18 17.5 15.63 17.7 15.07C17.91 14.5 17.91 14.02 17.84 13.92C17.78 13.82 17.62 13.76 17.37 13.63C17.12 13.51 15.91 12.92 15.68 12.83C15.46 12.75 15.3 12.71 15.13 12.95C14.97 13.2 14.51 13.76 14.37 13.92C14.23 14.08 14.1 14.1 13.85 13.97C13.6 13.85 12.81 13.59 11.87 12.75C11.14 12.1 10.65 11.29 10.51 11.05C10.37 10.8 10.5 10.67 10.62 10.54C10.73 10.43 10.87 10.25 11 10.1C11.12 9.94 11.17 9.82 11.25 9.66C11.33 9.49 11.29 9.35 11.23 9.22C11.17 9.1 10.68 7.9 10.47 7.41C10.27 6.93 10.07 7 9.92 6.99C9.78 6.99 9.61 7.03 9.53 7.03Z" />
                  </svg>
                  <span>WhatsApp&apos;ta Aç</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
