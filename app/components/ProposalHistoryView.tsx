"use client";

import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { SavedProposal, Customer } from "../types/accounting";

interface ProposalHistoryViewProps {
  onNewProposal?: () => void;
  onEditProposal?: (proposal: SavedProposal) => void;
}

// Currency formatter
function formatCurrency(val: number): string {
  if (isNaN(val)) return "0,00 TRY";
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val) + " TRY"
  );
}

// Turkish quantity formatter
function formatQuantityTurkish(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 3,
  }).format(val);
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
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedProposalForDetail, setSelectedProposalForDetail] = useState<SavedProposal | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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

  // Delete proposal
  const handleDelete = async (id: number, proposalNumber: string) => {
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
    <div className="space-y-6">
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
              Daha önce hazırladığınız teklifleri görüntüleyin, düzenleyin, durumlarını yönetin ve yazdırın.
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
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === item.id
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
              Fiyat Teklifi formundan hazırladığınız teklifleri Supabase&apos;e kaydederek burada saklayabilir ve dilediğiniz zaman düzenleyebilirsiniz.
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
                          <Package className="w-3 h-3 text-slate-400" />
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

                      {/* İşlemler */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Detay Görüntüle */}
                          <button
                            onClick={() => setSelectedProposalForDetail(prop)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Ürün Detaylarını Gör"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Düzenle */}
                          {onEditProposal && (
                            <button
                              onClick={() => onEditProposal(prop)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Teklifi Düzenle & Formda Aç"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Sil */}
                          <button
                            onClick={() => handleDelete(prop.id, prop.proposal_number)}
                            disabled={deletingId === prop.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                            title="Teklifi Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Detail Modal */}
      {selectedProposalForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{selectedProposalForDetail.proposal_number}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        STATUS_CONFIG[selectedProposalForDetail.status]?.bg
                      } ${STATUS_CONFIG[selectedProposalForDetail.status]?.text} ${
                        STATUS_CONFIG[selectedProposalForDetail.status]?.border
                      }`}
                    >
                      {STATUS_CONFIG[selectedProposalForDetail.status]?.label || selectedProposalForDetail.status}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 truncate max-w-md">
                    {selectedProposalForDetail.customer?.name ||
                      selectedProposalForDetail.metadata?.customerName ||
                      "Müşteri"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProposalForDetail(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Modal Items List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Teklif Kalemleri ({selectedProposalForDetail.items?.length || 0} Kalem)
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {(selectedProposalForDetail.items || []).map((it, idx) => {
                  const customItem = selectedProposalForDetail.metadata?.customItems?.[idx];
                  const itemName =
                    it.product?.name ||
                    customItem?.materialName ||
                    `Ürün Kalemi #${idx + 1}`;
                  const itemUnit =
                    it.product?.unit_of_measure ||
                    customItem?.unit ||
                    "Adet";

                  return (
                    <div
                      key={it.id || idx}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {idx + 1}. {itemName}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Miktar:{" "}
                          <span className="font-semibold text-slate-700">
                            {formatQuantityTurkish(it.quantity)} {itemUnit}
                          </span>{" "}
                          ×{" "}
                          <span className="font-mono text-slate-700">
                            {formatCurrency(it.unit_price)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-slate-900">
                          {formatCurrency(it.total_price || it.quantity * it.unit_price)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Summary */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Toplam Tutar:</span>
                <span className="font-mono font-extrabold text-base text-blue-600">
                  {formatCurrency(selectedProposalForDetail.total_amount)}
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setSelectedProposalForDetail(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
              >
                Kapat
              </button>
              {onEditProposal && (
                <button
                  onClick={() => {
                    const prop = selectedProposalForDetail;
                    setSelectedProposalForDetail(null);
                    onEditProposal(prop);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-xs"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Teklifi Düzenle</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
