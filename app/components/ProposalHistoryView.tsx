"use client";

import React, { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import * as htmlToImage from "html-to-image";
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Eye,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  FileDown,
  Building,
  Package,
  Calendar,
  AlertCircle,
  Check,
  ChevronRight,
  Printer,
  Copy,
  ExternalLink,
  Layers,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { SavedProposal, Customer } from "../types/accounting";
import WhatsAppShareModal from "./WhatsAppShareModal";
import {
  savedProposalToWhatsAppProposalData,
  WhatsAppProposalData,
  sharePdfViaWhatsApp,
} from "../utils/whatsapp";
import { renderElementToPdf } from "../utils/pdfGenerator";
import { useAuth } from "../context/AuthContext";

interface ProposalHistoryViewProps {
  onNewProposal?: () => void;
  onEditProposal?: (proposal: SavedProposal) => void;
}

// Currency formatter
function formatCurrency(val: number): string {
  if (isNaN(val)) return "0,00 ₺";
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val) + " ₺"
  );
}

// Turkish quantity formatter (e.g. 14000 -> "14.000", 1000 -> "1.000", 200 -> "200")
function formatQuantityTurkish(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 3,
  }).format(val);
}

// Convert number to Turkish words (e.g. 15.450 -> "On Beş Bin Dört Yüz Elli Türk Lirası")
function numberToTurkishWords(amount: number): string {
  if (amount <= 0 || isNaN(amount)) return "Sıfır Türk Lirası";
  const birler = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
  const onlar = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"];
  const basamaklar = ["", "Bin", "Milyon", "Milyar", "Trilyon"];

  const tamKisim = Math.floor(Math.abs(amount));
  const kurusKisim = Math.round((Math.abs(amount) - tamKisim) * 100);

  function ucBasamak(n: number) {
    let res = "";
    const yuzler = Math.floor(n / 100);
    const onluk = Math.floor((n % 100) / 10);
    const birlik = n % 10;

    if (yuzler > 1) res += birler[yuzler] + " Yüz ";
    else if (yuzler === 1) res += "Yüz ";

    if (onluk > 0) res += onlar[onluk] + " ";
    if (birlik > 0) res += birler[birlik] + " ";
    return res.trim();
  }

  let strTam = "";
  let temp = tamKisim;
  let basamakIdx = 0;

  if (temp === 0) strTam = "Sıfır";
  while (temp > 0) {
    const uc = temp % 1000;
    if (uc > 0) {
      let ucStr = ucBasamak(uc);
      if (basamakIdx === 1 && uc === 1) {
        ucStr = ""; // "Bir Bin" yerine "Bin"
      }
      const basamakAdi = basamaklar[basamakIdx];
      strTam = `${ucStr} ${basamakAdi} ${strTam}`.trim();
    }
    temp = Math.floor(temp / 1000);
    basamakIdx++;
  }

  let sonuc = strTam.trim() + " Türk Lirası";
  if (kurusKisim > 0) {
    sonuc += " " + ucBasamak(kurusKisim) + " Kuruş";
  }
  return sonuc.replace(/\s+/g, " ");
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  draft: {
    label: "Taslak",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    icon: Clock,
  },
  sent: {
    label: "Gönderildi",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    icon: Send,
  },
  accepted: {
    label: "Onaylandı",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Reddedildi",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    icon: XCircle,
  },
};

export default function ProposalHistoryView({
  onNewProposal,
  onEditProposal,
}: ProposalHistoryViewProps) {
  const { isAdmin, isViewer } = useAuth();
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedProposalForDetail, setSelectedProposalForDetail] = useState<SavedProposal | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Printing & PDF Download State
  const [activeProposalForPrint, setActiveProposalForPrint] = useState<SavedProposal | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<number | null>(null);

  // WhatsApp Share State
  const [sharingProposalForWhatsApp, setSharingProposalForWhatsApp] = useState<SavedProposal | null>(null);

  // Company Information for quotation sheet
  const [companyInfo, setCompanyInfo] = useState({
    name: "İSTANBUL ANADOLU GIDA YAPI TEKNOLOJİ SANAYİ VE TİCARET ANONİM ŞİRKETİ",
    address: "Esenevler Mah.Talatpaşa Cad. İkiz Sokak No:2A Dükkan 1 Akyıldız İş Merkezi Ümraniye İstanbul Türkiye",
    phone: "(0216) 316 37 44",
    logoUrl: "/logo.jpg",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fiyat_teklifi_data_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.companyInfo) {
          setCompanyInfo((prev) => ({ ...prev, ...parsed.companyInfo }));
        }
      }
    } catch { }
  }, []);

  const whatsappProposalData: WhatsAppProposalData | null = useMemo(() => {
    if (!sharingProposalForWhatsApp) return null;
    return savedProposalToWhatsAppProposalData(
      sharingProposalForWhatsApp,
      companyInfo.name
    );
  }, [sharingProposalForWhatsApp, companyInfo.name]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Fetch proposals from API
  const fetchProposals = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/proposals");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.proposals)) {
          setProposals(data.proposals);
        }
      }
    } catch (err) {
      console.error("Proposals fetch error:", err);
      showToast("Teklifler yüklenirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  // Delete proposal (Only Admin)
  const handleDelete = async (id: number, proposalNumber: string) => {
    if (!isAdmin) {
      showToast("Yetki Hatası: Teklif silme işlemi yalnızca Yönetici (Admin) yetkisine sahiptir.");
      return;
    }
    if (!confirm(`"${proposalNumber}" numaralı teklifi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/proposals?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setProposals((prev) => prev.filter((p) => p.id !== id));
          if (selectedProposalForDetail?.id === id) {
            setSelectedProposalForDetail(null);
          }
          if (activeProposalForPrint?.id === id) {
            setActiveProposalForPrint(null);
          }
          showToast(`"${proposalNumber}" teklifi başarıyla silindi.`);
        } else {
          showToast(`Hata: ${data.error || "Silinemedi"}`);
        }
      }
    } catch (err: any) {
      showToast(`Silme hatası: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Quick change status
  const handleStatusChange = async (proposal: SavedProposal, newStatus: string) => {
    try {
      const res = await fetch("/api/proposals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: proposal.id,
          status: newStatus,
          proposal_number: proposal.proposal_number,
          metadata: proposal.metadata,
        }),
      });
      if (res.ok) {
        setProposals((prev) =>
          prev.map((p) =>
            p.id === proposal.id ? { ...p, status: newStatus as any } : p
          )
        );
        if (selectedProposalForDetail?.id === proposal.id) {
          setSelectedProposalForDetail((prev) =>
            prev ? { ...prev, status: newStatus as any } : null
          );
        }
        showToast(`Teklif durumu güncellendi: ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      }
    } catch (err) {
      showToast("Durum güncellenirken hata oluştu.");
    }
  };

  // Print proposal directly
  const handlePrintProposal = (prop: SavedProposal) => {
    setActiveProposalForPrint(prop);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Download PDF directly using htmlToImage + jsPDF
  const handleDownloadProposalPdf = async (prop: SavedProposal) => {
    setGeneratingPdfId(prop.id);
    setActiveProposalForPrint(prop);

    try {
      // Wait for React to render the printable sheet in the DOM
      await new Promise((resolve) => setTimeout(resolve, 300));

      const printElement = document.getElementById("history-printable-sheet");
      if (!printElement) {
        throw new Error("Teklif formu görseli hazırlanamadı.");
      }

      const dataUrl = await htmlToImage.toPng(printElement, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: false,
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("PDF görseli oluşturulamadı"));
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (img.height * imgWidth) / img.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(dataUrl, "PNG", 0, 0, imgWidth, imgHeight);
      } else if (imgHeight <= pdfHeight * 1.25) {
        const scaleFactor = pdfHeight / imgHeight;
        const scaledWidth = imgWidth * scaleFactor;
        const xOffset = (pdfWidth - scaledWidth) / 2;
        pdf.addImage(dataUrl, "PNG", xOffset, 0, scaledWidth, pdfHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      const custName = prop.customer?.name || prop.metadata?.customerName || "Musteri";
      const safeCustomer = custName
        .replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")
        .substring(0, 30);
      const safeNumber = (prop.proposal_number || "Teklif").replace(/[^a-zA-Z0-9_-]/g, "_");
      pdf.save(`${safeNumber}_${safeCustomer}.pdf`);

      showToast(`"${prop.proposal_number}" teklif PDF'i başarıyla indirildi.`);
    } catch (err: any) {
      console.error("PDF download error:", err);
      alert("PDF oluşturulurken bir hata meydana geldi: " + (err?.message || "Bilinmeyen hata"));
    } finally {
      setGeneratingPdfId(null);
    }
  };

  // Share History Proposal PDF via WhatsApp
  const handleShareHistoryPdfViaWhatsApp = async (
    recipientPhone: string,
    messageText: string
  ) => {
    if (!sharingProposalForWhatsApp) return;

    const prop = sharingProposalForWhatsApp;
    setGeneratingPdfId(prop.id);
    setActiveProposalForPrint(prop);

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const printElement = document.getElementById("history-printable-sheet");
      if (!printElement) {
        throw new Error("Teklif formu görseli hazırlanamadı.");
      }

      const { blob } = await renderElementToPdf(printElement);

      const custName = prop.customer?.name || prop.metadata?.customerName || "Musteri";
      const safeCustomer = custName
        .replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")
        .substring(0, 30);
      const safeNumber = (prop.proposal_number || "Teklif").replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `${safeNumber}_${safeCustomer}.pdf`;

      const result = await sharePdfViaWhatsApp({
        pdfBlob: blob,
        fileName,
        phoneNumber: recipientPhone,
        messageText,
      });

      if (result.sharedViaNative) {
        showToast(`"${prop.proposal_number}" teklif PDF'i WhatsApp ile paylaşıldı.`);
      } else {
        showToast("PDF indirildi ve WhatsApp Web açıldı. Belgeyi sohbete ekleyebilirsiniz.");
      }

      return result;
    } catch (err: unknown) {
      console.error("PDF share error:", err);
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      alert("PDF paylaşılırken hata oluştu: " + msg);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  // Filtered proposals
  const filteredProposals = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const numMatch = (p.proposal_number || "").toLowerCase().includes(q);
      const custMatch = (p.customer?.name || p.metadata?.customerName || "")
        .toLowerCase()
        .includes(q);
      const itemMatch = (p.items || []).some(
        (it) =>
          (it.product?.name || "").toLowerCase().includes(q)
      );
      return numMatch || custMatch || itemMatch;
    });
  }, [proposals, searchQuery, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = proposals.length;
    const totalAmount = proposals.reduce((acc, p) => acc + (p.total_amount || 0), 0);
    const acceptedCount = proposals.filter((p) => p.status === "accepted").length;
    const draftCount = proposals.filter((p) => p.status === "draft").length;
    const sentCount = proposals.filter((p) => p.status === "sent").length;
    return { totalCount, totalAmount, acceptedCount, draftCount, sentCount };
  }, [proposals]);

  return (
    <>
      <div className="no-print space-y-6">
        {/* Toast Alert */}
        {toastMsg && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Teklif Geçmişi & Kayıtlar
                </h1>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Supabase Bulut
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Daha önce hazırladığınız teklifleri görüntüleyin, yazdırın, PDF olarak indirin veya düzenleyin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchProposals}
              disabled={isLoading}
              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors shadow-2xs"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
            </button>

            {onNewProposal && (
              <button
                onClick={onNewProposal}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm shadow-blue-600/20 active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Teklif Hazırla</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
            <div className="text-[11px] font-medium text-slate-400">Toplam Teklif</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.totalCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Veritabanında kayıtlı</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
            <div className="text-[11px] font-medium text-slate-400">Toplam Portföy Tutarı</div>
            <div className="text-xl font-bold text-blue-600 mt-1 truncate">
              {formatCurrency(stats.totalAmount)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Kayıtlı teklifler toplamı</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
            <div className="text-[11px] font-medium text-slate-400">Onaylanan Teklifler</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.acceptedCount}</div>
            <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">Müşteri kabul etti</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
            <div className="text-[11px] font-medium text-slate-400">Taslak / Gönderildi</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">
              {stats.draftCount + stats.sentCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {stats.draftCount} Taslak • {stats.sentCount} Gönderildi
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Teklif No, Müşteri Firma veya Ürün ara..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: "all", label: "Tümü" },
              { id: "draft", label: "Taslak" },
              { id: "sent", label: "Gönderildi" },
              { id: "accepted", label: "Onaylandı" },
              { id: "rejected", label: "Reddedildi" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setStatusFilter(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${statusFilter === item.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Proposals Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="font-semibold text-slate-700">Teklifler yükleniyor...</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Supabase veritabanı sorgulanıyor</p>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs">
              <FileText className="w-10 h-10 mx-auto mb-2.5 opacity-30 text-slate-400" />
              <p className="font-semibold text-slate-700 text-sm">
                {searchQuery || statusFilter !== "all"
                  ? "Filtreye uygun teklif bulunamadı"
                  : "Henüz kayıtlı bir teklif bulunmuyor"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                Fiyat Teklifi formundan hazırladığınız teklifleri Supabase&apos;e kaydederek burada saklayabilir, istediğiniz zaman yazdırabilir veya indirebilirsiniz.
              </p>
              {onNewProposal && (
                <button
                  onClick={onNewProposal}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>İlk Teklifinizi Hazırlayın</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Teklif No</th>
                    <th className="py-3 px-4">Müşteri Firma</th>
                    <th className="py-3 px-4">Tarih</th>
                    <th className="py-3 px-4 text-center">Kalem Sayısı</th>
                    <th className="py-3 px-4 text-right">Toplam Tutar</th>
                    <th className="py-3 px-4 text-center">Durum</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredProposals.map((prop) => {
                    const statusConf = STATUS_CONFIG[prop.status] || STATUS_CONFIG.draft;
                    const StatusIcon = statusConf.icon;
                    const customerName =
                      prop.customer?.name ||
                      prop.metadata?.customerName ||
                      "Belirtilmemiş Müşteri";
                    const itemCount = prop.items?.length || 0;
                    const dateStr = prop.created_at
                      ? new Date(prop.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                      : "-";

                    const isDownloadingThis = generatingPdfId === prop.id;

                    return (
                      <tr
                        key={prop.id}
                        className="hover:bg-slate-50/70 transition-colors group"
                      >
                        {/* Teklif No */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">{prop.proposal_number}</span>
                          </div>
                        </td>

                        {/* Müşteri Firma */}
                        <td className="py-3.5 px-4 font-semibold text-slate-800 max-w-xs truncate">
                          <div className="flex items-center gap-2">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate" title={customerName}>
                              {customerName}
                            </span>
                          </div>
                        </td>

                        {/* Tarih */}
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{dateStr}</span>
                          </div>
                        </td>

                        {/* Kalem Sayısı */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                            <span>{itemCount} Ürün</span>
                          </span>
                        </td>

                        {/* Toplam Tutar */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap text-sm">
                          {formatCurrency(prop.total_amount)}
                        </td>

                        {/* Durum Dropdown */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <select
                            value={prop.status}
                            onChange={(e) => handleStatusChange(prop, e.target.value)}
                            className={`text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none transition-colors ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                          >
                            <option value="draft">Taslak</option>
                            <option value="sent">Gönderildi</option>
                            <option value="accepted">Onaylandı</option>
                            <option value="rejected">Reddedildi</option>
                          </select>
                        </td>

                        {/* İşlemler (Actions) */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* Yazdır (Print) */}
                            <button
                              onClick={() => handlePrintProposal(prop)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors"
                              title="Teklifi A4 Yazdır"
                            >
                              <Printer className="w-4 h-4 text-slate-700" />
                            </button>

                            {/* PDF İndir (Download PDF) */}
                            <button
                              onClick={() => handleDownloadProposalPdf(prop)}
                              disabled={isDownloadingThis}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                              title="Teklifi PDF Olarak İndir (.pdf)"
                            >
                              {isDownloadingThis ? (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                              ) : (
                                <FileDown className="w-4 h-4 text-blue-600" />
                              )}
                            </button>

                            {/* WhatsApp ile Paylaş */}
                            <button
                              onClick={() => setSharingProposalForWhatsApp(prop)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-[#25D366] hover:bg-emerald-50 transition-colors"
                              title="Teklifi WhatsApp ile Paylaş"
                            >
                              <svg
                                className="w-4 h-4 fill-current text-emerald-600"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.03C9.36 7.03 9.09 7.1 8.87 7.33C8.65 7.57 8.02 8.16 8.02 9.36C8.02 10.56 8.9 11.71 9.02 11.87C9.14 12.03 10.73 14.5 13.18 15.56C15.22 16.44 15.63 16.26 16.07 16.22C16.52 16.18 17.5 15.63 17.7 15.07C17.91 14.5 17.91 14.02 17.84 13.92C17.78 13.82 17.62 13.76 17.37 13.63C17.12 13.51 15.91 12.92 15.68 12.83C15.46 12.75 15.3 12.71 15.13 12.95C14.97 13.2 14.51 13.76 14.37 13.92C14.23 14.08 14.1 14.1 13.85 13.97C13.6 13.85 12.81 13.59 11.87 12.75C11.14 12.1 10.65 11.29 10.51 11.05C10.37 10.8 10.5 10.67 10.62 10.54C10.73 10.43 10.87 10.25 11 10.1C11.12 9.94 11.17 9.82 11.25 9.66C11.33 9.49 11.29 9.35 11.23 9.22C11.17 9.1 10.68 7.9 10.47 7.41C10.27 6.93 10.07 7 9.92 6.99C9.78 6.99 9.61 7.03 9.53 7.03Z" />
                              </svg>
                            </button>

                            {/* Detay / Ön İzleme Görüntüle */}
                            <button
                              onClick={() => setSelectedProposalForDetail(prop)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Teklifi Ön İzle (Tablo Görünümü)"
                            >
                              <Eye className="w-4 h-4 text-indigo-600" />
                            </button>

                            {/* Düzenle */}
                            {onEditProposal && (
                              <button
                                onClick={() => {
                                  if (isViewer) {
                                    showToast("İzleyici (Viewer) rolü teklifleri düzenleyemez.");
                                    return;
                                  }
                                  onEditProposal(prop);
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${isViewer
                                  ? "text-slate-300 hover:text-slate-400 cursor-not-allowed"
                                  : "text-slate-600 hover:text-emerald-600 hover:bg-emerald-50"
                                  }`}
                                title={isViewer ? "İzleyici rolü düzenleme yapamaz" : "Teklifi Düzenle & Formda Aç"}
                              >
                                <Edit2 className={`w-4 h-4 ${isViewer ? "text-slate-300" : "text-emerald-600"}`} />
                              </button>
                            )}

                            {/* Sil (Yalnızca Admin) */}
                            {isAdmin ? (
                              <button
                                onClick={() => handleDelete(prop.id, prop.proposal_number)}
                                disabled={deletingId === prop.id}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                                title="Teklifi Sil (Yönetici)"
                              >
                                <Trash2 className="w-4 h-4 text-rose-500" />
                              </button>
                            ) : (
                              <button
                                onClick={() => showToast("Teklif silme işlemi yalnızca Yönetici (Admin) yetkisine sahiptir.")}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-slate-400 hover:bg-slate-50 transition-colors cursor-not-allowed opacity-60"
                                title="Teklif silme yetkisi sadece Admin'e aittir"
                              >
                                <Trash2 className="w-4 h-4 text-slate-300" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail / Preview Modal (Table Structure) */}
        {selectedProposalForDetail && (() => {
          const detailSubtotal = (selectedProposalForDetail.items || []).reduce(
            (acc, it) => acc + (it.total_price || it.quantity * it.unit_price),
            0
          );
          const detailVatRate =
            selectedProposalForDetail.metadata?.vatRate !== undefined
              ? selectedProposalForDetail.metadata.vatRate
              : 20;
          const detailVatAmount = detailSubtotal * (detailVatRate / 100);
          const detailGrandTotal =
            selectedProposalForDetail.total_amount || (detailSubtotal + detailVatAmount);
          const detailCustomerName =
            selectedProposalForDetail.customer?.name ||
            selectedProposalForDetail.metadata?.customerName ||
            "Müşteri Bilgisi Yok";
          const detailQuoteDate =
            selectedProposalForDetail.metadata?.quoteDate ||
            (selectedProposalForDetail.created_at
              ? new Date(selectedProposalForDetail.created_at).toLocaleDateString("tr-TR")
              : "-");
          const detailVatNote =
            selectedProposalForDetail.metadata?.vatNote || "Birim fiyatlara KDV dahil değildir.";

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1b365d] text-white flex items-center justify-center shadow-xs">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Teklif Ön İzleme
                        </span>
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {selectedProposalForDetail.proposal_number}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[selectedProposalForDetail.status]?.bg
                            } ${STATUS_CONFIG[selectedProposalForDetail.status]?.text} ${STATUS_CONFIG[selectedProposalForDetail.status]?.border
                            }`}
                        >
                          {STATUS_CONFIG[selectedProposalForDetail.status]?.label ||
                            selectedProposalForDetail.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-semibold truncate max-w-lg mt-0.5">
                        {detailCustomerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{detailQuoteDate}</span>
                    </span>
                    <button
                      onClick={() => setSelectedProposalForDetail(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                      title="Kapat"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Modal Scrollable Body */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/40">
                  {/* Customer Meta Table / Card */}
                  <div className="w-full bg-white border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td
                            className="w-[22%] sm:w-[20%] py-2 px-3 bg-slate-100 font-extrabold uppercase text-slate-800 border-r border-slate-200"
                            style={{ backgroundColor: "#f8fafc" }}
                          >
                            MÜŞTERİ FİRMA ADI
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-950 uppercase border-r border-slate-200">
                            {detailCustomerName}
                          </td>
                          <td
                            className="w-[20%] sm:w-[16%] py-2 px-2 bg-slate-100 font-extrabold uppercase text-slate-800 text-center border-r border-slate-200"
                            style={{ backgroundColor: "#f8fafc" }}
                          >
                            TEKLİF NO / TARİH
                          </td>
                          <td className="w-[22%] sm:w-[18%] py-2 px-3 font-bold text-slate-950 text-center">
                            <div className="font-mono font-bold text-blue-700">
                              {selectedProposalForDetail.proposal_number}
                            </div>
                            <div className="text-[10px] text-slate-500 font-normal">
                              {detailQuoteDate}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* VAT Note bar */}
                  <div className="flex items-center justify-between text-xs px-1 text-slate-600 italic">
                    <span>{detailVatNote}</span>
                    <span className="not-italic text-[11px] font-semibold text-slate-500">
                      Toplam {selectedProposalForDetail.items?.length || 0} Kalem
                    </span>
                  </div>

                  {/* Main Quotation Items Table */}
                  <div className="w-full overflow-x-auto rounded-xl border-2 border-slate-800 bg-white shadow-2xs">
                    <table className="w-full border-collapse text-xs text-slate-900 table-fixed min-w-[620px]">
                      <colgroup>
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "46%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "13%" }} />
                      </colgroup>
                      <thead>
                        <tr
                          className="text-white text-xs uppercase font-bold h-8 select-none"
                          style={{ backgroundColor: "#1b365d" }}
                        >
                          <th className="border border-slate-700 py-1.5 px-1 text-center">SIRA</th>
                          <th className="border border-slate-700 py-1.5 px-3 text-left">MALZEME CİNSİ</th>
                          <th className="border border-slate-700 py-1.5 px-2 text-right">MİKTAR</th>
                          <th className="border border-slate-700 py-1.5 px-1 text-center">BİRİM</th>
                          <th className="border border-slate-700 py-1.5 px-2 text-right">BİRİM FİYATI (₺)</th>
                          <th className="border border-slate-700 py-1.5 px-2 text-right">TUTAR (₺)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedProposalForDetail.items || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                              Bu teklife ait kayıtlı ürün kalemi bulunamadı.
                            </td>
                          </tr>
                        ) : (
                          (selectedProposalForDetail.items || []).map((it, idx) => {
                            const customItem = selectedProposalForDetail.metadata?.customItems?.[idx];
                            const itemName =
                              it.product?.name ||
                              customItem?.materialName ||
                              `Ürün Kalemi #${idx + 1}`;
                            const itemUnit =
                              it.product?.unit_of_measure ||
                              customItem?.unit ||
                              "Adet";
                            const rowTotal = it.total_price || it.quantity * it.unit_price;

                            return (
                              <tr
                                key={it.id || idx}
                                className="h-8 border-b border-slate-200 hover:bg-blue-50/40 transition-colors"
                              >
                                <td className="border border-slate-300 py-1.5 px-1 text-center font-bold text-slate-700 bg-slate-50/50">
                                  {idx + 1}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-3 text-left">
                                  <div className="font-semibold text-slate-950 truncate">
                                    {itemName}
                                  </div>
                                  {it.product?.internal_reference && (
                                    <span className="text-[10px] font-mono text-slate-500">
                                      Kod: {it.product.internal_reference}
                                    </span>
                                  )}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 text-right font-bold text-slate-950 font-mono">
                                  {formatQuantityTurkish(it.quantity)}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-1 text-center text-slate-800">
                                  {itemUnit}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 text-right font-mono text-slate-950">
                                  {formatCurrency(it.unit_price)}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 text-right font-mono font-bold text-slate-950">
                                  {formatCurrency(rowTotal)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Totals & Turkish Words */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-1">
                    {/* Left: Turkish words & Notes */}
                    <div className="flex-1 space-y-2.5 w-full">
                      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          TUTAR (YAZI İLE)
                        </div>
                        <div className="text-xs font-bold italic text-slate-800">
                          #{numberToTurkishWords(detailGrandTotal)}#
                        </div>
                      </div>

                      {/* Notes / Terms */}
                      {selectedProposalForDetail.metadata?.notes && (
                        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 text-xs text-slate-700">
                          <div className="font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-amber-700" />
                            <span>Teklif Şartları & Notlar</span>
                          </div>
                          <div className="text-[11px] whitespace-pre-line leading-relaxed text-slate-700 font-sans">
                            {selectedProposalForDetail.metadata.notes}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Totals Table */}
                    <div className="w-full sm:w-72 shrink-0">
                      <table className="w-full border-collapse border-2 border-slate-800 text-xs font-bold bg-white rounded-lg overflow-hidden shadow-2xs">
                        <tbody>
                          <tr className="border-b border-slate-300">
                            <td className="border-r border-slate-300 py-1.5 px-3 text-right bg-slate-50 font-semibold text-slate-700">
                              Ara Toplam:
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-950">
                              {formatCurrency(detailSubtotal)}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300">
                            <td className="border-r border-slate-300 py-1.5 px-3 text-right bg-slate-50 font-semibold text-slate-700">
                              KDV (%{detailVatRate}):
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-950">
                              {formatCurrency(detailVatAmount)}
                            </td>
                          </tr>
                          <tr className="bg-slate-100">
                            <td className="border-r border-slate-300 py-2 px-3 text-right font-extrabold text-slate-900">
                              GENEL TOPLAM:
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-black text-blue-700 text-sm">
                              {formatCurrency(detailGrandTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Modal Footer with Actions */}
                <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedProposalForDetail(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Kapat
                  </button>
                  <div className="flex items-center gap-2">
                    {/* Yazdır */}
                    <button
                      onClick={() => handlePrintProposal(selectedProposalForDetail)}
                      className="px-3 py-2 bg-slate-900 hover:bg-black text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                      title="Teklifi A4 Yazdır"
                    >
                      <Printer className="w-3.5 h-3.5 text-blue-400" />
                      <span>Yazdır</span>
                    </button>

                    {/* PDF İndir */}
                    <button
                      onClick={() => handleDownloadProposalPdf(selectedProposalForDetail)}
                      disabled={generatingPdfId === selectedProposalForDetail.id}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-60"
                      title="Teklifi PDF olarak indir"
                    >
                      {generatingPdfId === selectedProposalForDetail.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileDown className="w-3.5 h-3.5" />
                      )}
                      <span>PDF İndir</span>
                    </button>

                    {/* WhatsApp Paylaş */}
                    <button
                      onClick={() => setSharingProposalForWhatsApp(selectedProposalForDetail)}
                      className="px-3 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                      title="Teklifi WhatsApp ile müşteriye gönder veya paylaş"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.03C9.36 7.03 9.09 7.1 8.87 7.33C8.65 7.57 8.02 8.16 8.02 9.36C8.02 10.56 8.9 11.71 9.02 11.87C9.14 12.03 10.73 14.5 13.18 15.56C15.22 16.44 15.63 16.26 16.07 16.22C16.52 16.18 17.5 15.63 17.7 15.07C17.91 14.5 17.91 14.02 17.84 13.92C17.78 13.82 17.62 13.76 17.37 13.63C17.12 13.51 15.91 12.92 15.68 12.83C15.46 12.75 15.3 12.71 15.13 12.95C14.97 13.2 14.51 13.76 14.37 13.92C14.23 14.08 14.1 14.1 13.85 13.97C13.6 13.85 12.81 13.59 11.87 12.75C11.14 12.1 10.65 11.29 10.51 11.05C10.37 10.8 10.5 10.67 10.62 10.54C10.73 10.43 10.87 10.25 11 10.1C11.12 9.94 11.17 9.82 11.25 9.66C11.33 9.49 11.29 9.35 11.23 9.22C11.17 9.1 10.68 7.9 10.47 7.41C10.27 6.93 10.07 7 9.92 6.99C9.78 6.99 9.61 7.03 9.53 7.03Z" />
                      </svg>
                      <span>WhatsApp</span>
                    </button>

                    {/* Teklifi Düzenle */}
                    {onEditProposal && (
                      <button
                        onClick={() => {
                          const prop = selectedProposalForDetail;
                          setSelectedProposalForDetail(null);
                          onEditProposal(prop);
                        }}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Düzenle</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Official Quotation Print Sheet (Active during window.print or PDF download) */}
      {activeProposalForPrint && (
        <div
          id="history-printable-wrapper"
          className={
            generatingPdfId === activeProposalForPrint.id
              ? "fixed -left-[9999px] top-0 w-[210mm] bg-white p-8 z-[-1]"
              : "hidden print:block print:p-0 print:w-full bg-white"
          }
        >
          <div
            id="history-printable-sheet"
            className="w-full bg-white p-6 sm:p-8 font-sans text-slate-900 border border-slate-300 print:border-none print:p-0 print:m-0"
          >
            {/* 1. TOP HEADER: LOGO AND CONTACT INFO */}
            <div className="w-full flex justify-between items-start gap-4 pb-3 border-b-2 border-black">
              {/* Logo & Company Name */}
              <div className="flex items-center gap-3">
                <img
                  src={companyInfo.logoUrl || "/logo.jpg"}
                  alt="Logo"
                  className="w-16 h-16 object-contain shrink-0"
                />
                <div className="font-extrabold text-xs sm:text-sm uppercase text-slate-900 tracking-tight leading-snug max-w-sm">
                  {companyInfo.name}
                </div>
              </div>

              {/* Address & Phone */}
              <div className="text-xs text-slate-900 font-sans max-w-md shrink-0 flex flex-col justify-start">
                <div className="flex items-start gap-1.5 leading-tight">
                  <span className="font-bold tracking-wider w-16 text-left select-none shrink-0 pt-0.5">ADRES</span>
                  <span className="font-bold shrink-0 pt-0.5">:</span>
                  <div className="text-slate-800 font-medium text-left flex-1 min-w-0 text-xs">
                    {companyInfo.address}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 leading-tight mt-1">
                  <span className="font-bold tracking-wider w-16 text-left select-none shrink-0">TELEFON</span>
                  <span className="font-bold shrink-0">:</span>
                  <div className="text-slate-800 font-semibold text-left flex-1 min-w-0 text-xs">
                    {companyInfo.phone}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. FORM TITLE */}
            <div className="w-full my-3 text-center">
              <h2 className="text-center font-black text-slate-950 text-base sm:text-lg tracking-wider uppercase">
                {activeProposalForPrint.metadata?.formTitle || "MÜŞTERİ TEKLİF VE SİPARİŞ FORMU"}
              </h2>
            </div>

            {/* 3. CUSTOMER META TABLE */}
            <div className="w-full mb-2">
              <table className="w-full border-collapse border-2 border-black text-xs font-semibold">
                <tbody>
                  <tr>
                    <td
                      className="border border-black py-1.5 px-2.5 bg-slate-100 font-extrabold uppercase text-slate-900 w-[20%]"
                      style={{ backgroundColor: "#f8fafc", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
                    >
                      MÜŞTERİ FİRMA ADI
                    </td>
                    <td className="border border-black py-1.5 px-2.5 font-bold text-slate-950 uppercase w-[48%]">
                      {activeProposalForPrint.customer?.name || activeProposalForPrint.metadata?.customerName || "-"}
                    </td>
                    <td
                      className="border border-black py-1.5 px-2 bg-slate-100 font-extrabold uppercase text-slate-900 text-center w-[16%]"
                      style={{ backgroundColor: "#f8fafc", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
                    >
                      TEKLİF NO / TARİH
                    </td>
                    <td className="border border-black py-1.5 px-2 font-bold text-slate-950 text-center w-[16%]">
                      <div className="font-mono font-bold text-blue-700">{activeProposalForPrint.proposal_number}</div>
                      <div className="text-[10px] text-slate-600 font-normal">
                        {activeProposalForPrint.metadata?.quoteDate || (activeProposalForPrint.created_at ? new Date(activeProposalForPrint.created_at).toLocaleDateString("tr-TR") : "-")}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. VAT NOTE */}
            <div className="w-full py-1 text-xs italic text-slate-800 mb-1">
              {activeProposalForPrint.metadata?.vatNote || "Birim fiyatlara KDV dahil değildir."}
            </div>

            {/* 5. ITEMS TABLE */}
            <table className="w-full border-collapse border-2 border-black text-xs text-slate-900 table-fixed">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "46%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
              </colgroup>
              <thead>
                <tr
                  className="text-white text-xs uppercase font-bold h-7"
                  style={{ backgroundColor: "#1b365d", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
                >
                  <th className="border border-black py-1 px-1 text-center">SIRA</th>
                  <th className="border border-black py-1 px-2 text-left">MALZEME CİNSİ</th>
                  <th className="border border-black py-1 px-2 text-right">MİKTAR</th>
                  <th className="border border-black py-1 px-1 text-center">BİRİM</th>
                  <th className="border border-black py-1 px-2 text-right">BİRİM FİYATI (₺)</th>
                  <th className="border border-black py-1 px-2 text-right">TUTAR (₺)</th>
                </tr>
              </thead>
              <tbody>
                {(activeProposalForPrint.items || []).map((it, idx) => {
                  const custom = activeProposalForPrint.metadata?.customItems?.[idx];
                  const name = it.product?.name || custom?.materialName || `Kalem #${idx + 1}`;
                  const unit = it.product?.unit_of_measure || custom?.unit || "Adet";
                  return (
                    <tr key={it.id || idx} className="h-7 border-b border-black">
                      <td className="border border-black py-1 px-1 text-center font-bold text-slate-700">
                        {idx + 1}
                      </td>
                      <td className="border border-black py-1 px-2 text-left font-medium text-slate-950 truncate">
                        {name}
                      </td>
                      <td className="border border-black py-1 px-2 text-right font-bold text-slate-950">
                        {formatQuantityTurkish(it.quantity)}
                      </td>
                      <td className="border border-black py-1 px-1 text-center text-slate-800">
                        {unit}
                      </td>
                      <td className="border border-black py-1 px-2 text-right font-medium text-slate-950">
                        {formatCurrency(it.unit_price)}
                      </td>
                      <td className="border border-black py-1 px-2 text-right font-bold text-slate-950">
                        {formatCurrency(it.total_price || it.quantity * it.unit_price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 6. TOTALS TABLE */}
            {(() => {
              const subtotal = (activeProposalForPrint.items || []).reduce(
                (acc, it) => acc + (it.total_price || it.quantity * it.unit_price),
                0
              );
              const vatRate = activeProposalForPrint.metadata?.vatRate !== undefined
                ? activeProposalForPrint.metadata.vatRate
                : 20;
              const vatAmount = subtotal * (vatRate / 100);
              const grandTotal = activeProposalForPrint.total_amount || (subtotal + vatAmount);

              return (
                <div className="w-full flex justify-end mt-2">
                  <table className="border-collapse border-2 border-black text-xs font-bold w-64">
                    <tbody>
                      <tr>
                        <td className="border border-black py-1 px-2 text-right bg-slate-100">Ara Toplam:</td>
                        <td className="border border-black py-1 px-2 text-right font-mono">{formatCurrency(subtotal)}</td>
                      </tr>
                      <tr>
                        <td className="border border-black py-1 px-2 text-right bg-slate-100">KDV (%{vatRate}):</td>
                        <td className="border border-black py-1 px-2 text-right font-mono">{formatCurrency(vatAmount)}</td>
                      </tr>
                      <tr className="bg-slate-100">
                        <td className="border border-black py-1.5 px-2 text-right font-extrabold">GENEL TOPLAM:</td>
                        <td className="border border-black py-1.5 px-2 text-right font-mono font-black text-blue-700 text-sm">
                          {formatCurrency(grandTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* 7. AMOUNT IN WORDS */}
            <div className="w-full my-2 text-right text-xs font-bold italic text-slate-700">
              {numberToTurkishWords(activeProposalForPrint.total_amount)}
            </div>

            {/* 8. NOTES */}
            <div className="w-full mt-3 p-2.5 border border-slate-300 rounded text-[11px] text-slate-700 whitespace-pre-line leading-relaxed">
              <span className="font-bold block mb-0.5 text-slate-900">Teklif Şartları:</span>
              {activeProposalForPrint.metadata?.notes || "1. Fiyatlarımız teklif tarihinden itibaren 15 gün süreyle geçerlidir.\n2. Teslimat şantiye/depo teslimidir.\n3. Ödeme vadesi teslimat sonrası 30 gündür."}
            </div>

            {/* 9. SIGNATURE BLOCKS */}
            <div className="w-full mt-6 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="border-t border-black pt-2">
                <div className="font-bold text-slate-900 uppercase">TEKLİFİ HAZIRLAYAN</div>
                <div className="text-[11px] text-slate-600 mt-1">
                  {activeProposalForPrint.metadata?.preparedBy || "Satış & Pazarlama Departmanı"}
                </div>
                <div className="text-[10px] text-slate-400 mt-6">(İmza / Kaşe)</div>
              </div>
              <div className="border-t border-black pt-2">
                <div className="font-bold text-slate-900 uppercase">MÜŞTERİ ONAYI</div>
                <div className="text-[11px] text-slate-600 mt-1">
                  {activeProposalForPrint.customer?.name || activeProposalForPrint.metadata?.customerName || "Müşteri Yetkilisi"}
                </div>
                <div className="text-[10px] text-slate-400 mt-6">(Kaşe / İmza / Tarih)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Share Modal */}
      {sharingProposalForWhatsApp && whatsappProposalData && (
        <WhatsAppShareModal
          isOpen={Boolean(sharingProposalForWhatsApp)}
          onClose={() => setSharingProposalForWhatsApp(null)}
          proposalData={whatsappProposalData}
          defaultMode="pdf"
          onSharePdf={handleShareHistoryPdfViaWhatsApp}
          onDownloadPdfOnly={() =>
            sharingProposalForWhatsApp &&
            handleDownloadProposalPdf(sharingProposalForWhatsApp)
          }
        />
      )}
    </>
  );
}
