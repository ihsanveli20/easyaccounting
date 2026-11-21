"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  BellRing,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  Edit3,
  FileText,
  Filter,
  History,
  Layers,
  Loader2,
  MessageSquare,
  Package,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  AccountTransaction,
  AccountTransactionType,
  CariAuditLogItem,
  CariCurrency,
  CollectionPaymentRecord,
  CompanyEntityType,
  ContactCard,
  ContactDocumentItem,
  ContactNoteItem,
  ContactType,
  PaymentMethodType,
  ReconciliationRecord,
} from "../types/currentAccounts";
import {
  computeAgingAndRisk,
  computeChronologicalLedger,
  computeContactBalance,
  CONTACT_TYPE_LABELS,
  findDuplicateContact,
  getCariPermissionsForRole,
  PAYMENT_METHOD_LABELS,
  round2,
  TRANSACTION_TYPE_LABELS,
} from "../utils/currentAccountsEngine";
import { useAuth } from "../context/AuthContext";
import CurrentAccountStatementAndReconcile from "./CurrentAccountStatementAndReconcile";

const LOCAL_CARI_KEY = "easy_accounting_current_accounts_v1";

type MainViewMode = "list" | "profile" | "reports";
type ProfileTabId =
  | "overview"
  | "transactions"
  | "statement"
  | "collections_payments"
  | "sales"
  | "purchases"
  | "proposals"
  | "orders"
  | "reconciliations"
  | "documents"
  | "notes"
  | "audit";

type ReportTypeId =
  | "all_balances"
  | "debit_balances"
  | "credit_balances"
  | "overdue_receivables"
  | "overdue_payables"
  | "collection_perf"
  | "payment_perf"
  | "sales_by_customer"
  | "purchases_by_supplier"
  | "highest_balance"
  | "most_active"
  | "monthly_movements"
  | "risk_report";

interface ExternalSaleRow {
  id: string;
  product_name: string;
  customer_name: string;
  quantity: number;
  unit: string;
  sale_date: string;
}

interface ExternalProposalRow {
  id: string;
  proposal_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  customer?: { name?: string } | null;
  metadata?: { customerName?: string } | null;
}

function fmtMoney(n: number, curr: CariCurrency = "TRY"): string {
  const sym = curr === "USD" ? "$" : curr === "EUR" ? "€" : "₺";
  return `${sym}${(Number(n) || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CurrentAccountsView() {
  const { profile, user, roleName } = useAuth();
  const actorName =
    profile?.full_name || profile?.user_name || user?.email?.split("@")[0] || "Kullanıcı";
  const perms = useMemo(() => getCariPermissionsForRole(roleName), [roleName]);

  // Core data state
  const [contacts, setContacts] = useState<ContactCard[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [collectionsPayments, setCollectionsPayments] = useState<CollectionPaymentRecord[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationRecord[]>([]);
  const [notes, setNotes] = useState<ContactNoteItem[]>([]);
  const [documents, setDocuments] = useState<ContactDocumentItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<CariAuditLogItem[]>([]);

  // Cross-module integration data
  const [externalSales, setExternalSales] = useState<ExternalSaleRow[]>([]);
  const [externalProposals, setExternalProposals] = useState<ExternalProposalRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Navigation
  const [mainView, setMainView] = useState<MainViewMode>("list");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTabId>("overview");

  // List filters, sorting, pagination, column visibility
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "passive">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "Borç" | "Alacak">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<"name" | "code" | "balance">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [showColsPanel, setShowColsPanel] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    code: true,
    type: true,
    phone: true,
    debit: true,
    credit: true,
    balance: true,
    lastDate: true,
    status: true,
  });

  // Contact Create / Edit Modal
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState<Partial<ContactCard>>({});
  const [contactFormError, setContactFormError] = useState<string | null>(null);

  // Transaction Form
  const [txType, setTxType] = useState<AccountTransactionType>("sales_invoice");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [txDueDate, setTxDueDate] = useState("");
  const [txDocNo, setTxDocNo] = useState("");
  const [txDesc, setTxDesc] = useState("");
  const [txDebit, setTxDebit] = useState("");
  const [txCredit, setTxCredit] = useState("");
  const [txCurrency, setTxCurrency] = useState<CariCurrency>("TRY");
  const [txRate, setTxRate] = useState("1");

  // Collection / Payment Form
  const [cpKind, setCpKind] = useState<"collection" | "payment">("collection");
  const [cpDate, setCpDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [cpAmount, setCpAmount] = useState("");
  const [cpCurrency, setCpCurrency] = useState<CariCurrency>("TRY");
  const [cpRate, setCpRate] = useState("1");
  const [cpMethod, setCpMethod] = useState<PaymentMethodType>("bank_transfer");
  const [cpAccount, setCpAccount] = useState("Ana Banka Hesabı");
  const [cpRefNo, setCpRefNo] = useState("");
  const [cpDesc, setCpDesc] = useState("");

  // Note & Document Forms
  const [noteType, setNoteType] = useState<ContactNoteItem["note_type"]>("note");
  const [noteContent, setNoteContent] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFileName, setDocFileName] = useState("");

  // Reports State
  const [activeReport, setActiveReport] = useState<ReportTypeId>("all_balances");

  const persistLocalSnapshot = (snapshot: {
    contacts: ContactCard[];
    transactions: AccountTransaction[];
    collectionsPayments: CollectionPaymentRecord[];
    reconciliations: ReconciliationRecord[];
    notes: ContactNoteItem[];
    documents: ContactDocumentItem[];
    auditLogs: CariAuditLogItem[];
  }) => {
    try {
      window.localStorage.setItem(LOCAL_CARI_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore quota errors
    }
  };

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      setIsLoading(true);
      try {
        const [cariRes, salesRes, propRes] = await Promise.all([
          fetch("/api/current-accounts"),
          fetch("/api/sales-records"),
          fetch("/api/proposals"),
        ]);
        const cariData = await cariRes.json();
        const salesData = await salesRes.json().catch(() => ({}));
        const propData = await propRes.json().catch(() => ({}));

        if (!active) return;

        if (salesData?.success && Array.isArray(salesData.records)) {
          setExternalSales(salesData.records);
        }
        if (propData?.success && Array.isArray(propData.proposals)) {
          setExternalProposals(propData.proposals);
        }

        if (cariData?.success) {
          setContacts(cariData.contacts || []);
          setTransactions(cariData.transactions || []);
          setCollectionsPayments(cariData.collectionsPayments || []);
          setReconciliations(cariData.reconciliations || []);
          setNotes(cariData.notes || []);
          setDocuments(cariData.documents || []);
          setAuditLogs(cariData.auditLogs || []);
          setTableMissing(false);
        } else {
          if (cariData?.tableMissing) setTableMissing(true);
          try {
            const raw = window.localStorage.getItem(LOCAL_CARI_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              setContacts(parsed.contacts || []);
              setTransactions(parsed.transactions || []);
              setCollectionsPayments(parsed.collectionsPayments || []);
              setReconciliations(parsed.reconciliations || []);
              setNotes(parsed.notes || []);
              setDocuments(parsed.documents || []);
              setAuditLogs(parsed.auditLogs || []);
            }
          } catch {
            // ignore
          }
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadAll();
    return () => {
      active = false;
    };
  }, []);

  const showSuccess = (msg: string) => {
    setBannerSuccess(msg);
    setBannerError(null);
    setTimeout(() => setBannerSuccess(null), 3500);
  };

  // Compute balance summary for every contact
  const contactSummaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeContactBalance>>();
    for (const c of contacts) {
      map.set(c.id, computeContactBalance(c.id, transactions, collectionsPayments));
    }
    return map;
  }, [contacts, transactions, collectionsPayments]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  const selectedContactLedger = useMemo(() => {
    if (!selectedContact) return [];
    const list = transactions.filter((t) => t.contact_id === selectedContact.id);
    return computeChronologicalLedger(list);
  }, [selectedContact, transactions]);

  const selectedContactAgingRisk = useMemo(() => {
    if (!selectedContact) return null;
    return computeAgingAndRisk(selectedContact, transactions);
  }, [selectedContact, transactions]);

  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.city && set.add(c.city));
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered & sorted contacts list
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
    const list = contacts.filter((c) => {
      if (typeFilter !== "all" && c.contact_type !== typeFilter) return false;
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "passive" && c.is_active) return false;
      if (cityFilter !== "all" && (c.city || "") !== cityFilter) return false;

      const sum = contactSummaries.get(c.id);
      if (directionFilter !== "all" && sum?.direction !== directionFilter) return false;

      if (q) {
        const hit =
          c.name.toLocaleLowerCase("tr-TR").includes(q) ||
          c.code.toLocaleLowerCase("tr-TR").includes(q) ||
          (c.tax_number || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.city || "").toLocaleLowerCase("tr-TR").includes(q);
        if (!hit) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name, "tr-TR");
      else if (sortField === "code") cmp = a.code.localeCompare(b.code, "tr-TR");
      else {
        const balA = contactSummaries.get(a.id)?.netBalance ?? 0;
        const balB = contactSummaries.get(b.id)?.netBalance ?? 0;
        cmp = balA - balB;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    contacts,
    searchQuery,
    typeFilter,
    statusFilter,
    cityFilter,
    directionFilter,
    contactSummaries,
    sortField,
    sortAsc,
  ]);

  const pagedContacts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [filteredContacts, page]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));

  // Global KPI totals
  const globalKpis = useMemo(() => {
    let totalReceivable = 0;
    let totalPayable = 0;
    for (const sum of contactSummaries.values()) {
      if (sum.netBalance > 0) totalReceivable = round2(totalReceivable + sum.netBalance);
      else if (sum.netBalance < 0) totalPayable = round2(totalPayable + Math.abs(sum.netBalance));
    }
    return {
      totalContacts: contacts.length,
      activeContacts: contacts.filter((c) => c.is_active).length,
      totalReceivable,
      totalPayable,
    };
  }, [contacts, contactSummaries]);

  // ---------------------------------------------------------------------------
  // Handlers (Contact, Transaction, Collection/Payment, Reconciliation, Notes)
  // ---------------------------------------------------------------------------

  const openNewContactModal = () => {
    const nextCode = `CR-${String(contacts.length + 1).padStart(4, "0")}`;
    setContactDraft({
      code: nextCode,
      name: "",
      contact_type: "both",
      company_type: "limited",
      country: "Türkiye",
      currency: "TRY",
      payment_term_days: 30,
      risk_limit: 0,
      tags: [],
      is_active: true,
    });
    setContactFormError(null);
    setContactModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactFormError(null);

    const dupMsg = findDuplicateContact(contacts, {
      id: contactDraft.id,
      code: contactDraft.code,
      tax_number: contactDraft.tax_number,
    });
    if (dupMsg) {
      setContactFormError(dupMsg);
      return;
    }

    const now = new Date().toISOString();
    const localContact: ContactCard = {
      id: contactDraft.id || `c-loc-${Date.now()}`,
      code: (contactDraft.code || "").trim(),
      name: (contactDraft.name || "").trim(),
      contact_type: contactDraft.contact_type || "both",
      company_type: contactDraft.company_type || "limited",
      tax_office: contactDraft.tax_office || null,
      tax_number: contactDraft.tax_number || null,
      authorized_person: contactDraft.authorized_person || null,
      phone: contactDraft.phone || null,
      email: contactDraft.email || null,
      website: contactDraft.website || null,
      country: contactDraft.country || "Türkiye",
      city: contactDraft.city || null,
      district: contactDraft.district || null,
      address: contactDraft.address || null,
      billing_address: contactDraft.billing_address || null,
      shipping_address: contactDraft.shipping_address || null,
      currency: contactDraft.currency || "TRY",
      payment_term_days: Number(contactDraft.payment_term_days) || 0,
      risk_limit: Number(contactDraft.risk_limit) || 0,
      description: contactDraft.description || null,
      category: contactDraft.category || null,
      tags: contactDraft.tags || [],
      is_active: contactDraft.is_active !== false,
      created_at: contactDraft.created_at || now,
      updated_at: now,
    };

    try {
      const res = await fetch("/api/current-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_contact",
          actor: actorName,
          contact: contactDraft,
        }),
      });
      const data = await res.json();

      const saved = data?.success && data.contact ? data.contact : localContact;
      if (data?.error && res.status === 409) {
        setContactFormError(data.error);
        return;
      }

      const nextContacts = contactDraft.id
        ? contacts.map((c) => (c.id === saved.id ? saved : c))
        : [saved, ...contacts];
      setContacts(nextContacts);
      persistLocalSnapshot({
        contacts: nextContacts,
        transactions,
        collectionsPayments,
        reconciliations,
        notes,
        documents,
        auditLogs,
      });
      setContactModalOpen(false);
      setSelectedContactId(saved.id);
      showSuccess("Cari kartı kaydedildi.");
    } catch {
      const nextContacts = contactDraft.id
        ? contacts.map((c) => (c.id === localContact.id ? localContact : c))
        : [localContact, ...contacts];
      setContacts(nextContacts);
      persistLocalSnapshot({
        contacts: nextContacts,
        transactions,
        collectionsPayments,
        reconciliations,
        notes,
        documents,
        auditLogs,
      });
      setContactModalOpen(false);
      setSelectedContactId(localContact.id);
      showSuccess("Cari kartı yerel olarak kaydedildi.");
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact) return;
    const deb = round2(Number(txDebit) || 0);
    const cred = round2(Number(txCredit) || 0);
    const rate = Number(txRate) || 1;
    if (deb <= 0 && cred <= 0) return;

    const payload = {
      contact_id: selectedContact.id,
      transaction_date: txDate,
      document_date: txDate,
      due_date: txDueDate || null,
      document_no: txDocNo.trim() || null,
      transaction_type: txType,
      description: txDesc.trim() || TRANSACTION_TYPE_LABELS[txType],
      debit: deb,
      credit: cred,
      currency: txCurrency,
      exchange_rate: rate,
    };

    const localTx: AccountTransaction = {
      id: `tx-loc-${Date.now()}`,
      ...payload,
      tl_debit: round2(deb * rate),
      tl_credit: round2(cred * rate),
      is_cancelled: false,
      created_by: actorName,
      created_at: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/current-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_transaction",
          actor: actorName,
          transaction: payload,
        }),
      });
      const data = await res.json();
      const savedTx = data?.success && data.transaction ? data.transaction : localTx;
      const nextTx = [...transactions, savedTx];
      setTransactions(nextTx);
      persistLocalSnapshot({
        contacts,
        transactions: nextTx,
        collectionsPayments,
        reconciliations,
        notes,
        documents,
        auditLogs,
      });
    } catch {
      const nextTx = [...transactions, localTx];
      setTransactions(nextTx);
    }

    setTxDebit("");
    setTxCredit("");
    setTxDocNo("");
    setTxDesc("");
    showSuccess("Cari hareket eklendi.");
  };

  const handleCancelTransaction = async (txId: string) => {
    const nextTx = transactions.map((t) =>
      t.id === txId ? { ...t, is_cancelled: true, cancelled_by: actorName } : t
    );
    setTransactions(nextTx);
    persistLocalSnapshot({
      contacts,
      transactions: nextTx,
      collectionsPayments,
      reconciliations,
      notes,
      documents,
      auditLogs,
    });
    if (!txId.startsWith("tx-loc-")) {
      await fetch("/api/current-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_transaction",
          actor: actorName,
          transactionId: txId,
        }),
      }).catch(() => {});
    }
    showSuccess("Hareket iptal olarak işaretlendi (iz bırakma korundu).");
  };

  const handleAddCollectionPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact) return;
    const amt = round2(Number(cpAmount) || 0);
    const rate = Number(cpRate) || 1;
    if (amt <= 0) return;

    const recordPayload = {
      contact_id: selectedContact.id,
      kind: cpKind,
      transaction_date: cpDate,
      amount: amt,
      currency: cpCurrency,
      exchange_rate: rate,
      payment_method: cpMethod,
      account_name: cpAccount.trim() || null,
      reference_no: cpRefNo.trim() || null,
      description: cpDesc.trim() || null,
    };

    try {
      const res = await fetch("/api/current-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_collection_payment",
          actor: actorName,
          record: recordPayload,
        }),
      });
      const data = await res.json();
      if (data?.error && res.status === 409) {
        setBannerError(data.error);
        return;
      }

      const tlAmt = round2(amt * rate);
      const isCol = cpKind === "collection";
      const fallbackTx: AccountTransaction = {
        id: `tx-cp-${Date.now()}`,
        contact_id: selectedContact.id,
        transaction_date: cpDate,
        document_no: cpRefNo.trim() || null,
        transaction_type: isCol ? "collection" : "payment",
        description: cpDesc.trim() || `${isCol ? "Tahsilat" : "Ödeme"} (${PAYMENT_METHOD_LABELS[cpMethod]})`,
        debit: isCol ? 0 : amt,
        credit: isCol ? amt : 0,
        currency: cpCurrency,
        exchange_rate: rate,
        tl_debit: isCol ? 0 : tlAmt,
        tl_credit: isCol ? tlAmt : 0,
        is_cancelled: false,
        created_by: actorName,
        created_at: new Date().toISOString(),
      };
      const fallbackCp: CollectionPaymentRecord = {
        id: `cp-loc-${Date.now()}`,
        ...recordPayload,
        tl_amount: tlAmt,
        linked_transaction_id: fallbackTx.id,
        is_cancelled: false,
        created_by: actorName,
        created_at: new Date().toISOString(),
      };

      const savedTx = data?.success && data.transaction ? data.transaction : fallbackTx;
      const savedCp = data?.success && data.record ? data.record : fallbackCp;

      const nextTx = [...transactions, savedTx];
      const nextCp = [savedCp, ...collectionsPayments];
      setTransactions(nextTx);
      setCollectionsPayments(nextCp);
      persistLocalSnapshot({
        contacts,
        transactions: nextTx,
        collectionsPayments: nextCp,
        reconciliations,
        notes,
        documents,
        auditLogs,
      });

      setCpAmount("");
      setCpRefNo("");
      setCpDesc("");
      showSuccess(`${isCol ? "Tahsilat" : "Ödeme"} kaydedildi ve cari harekete işlendi.`);
    } catch {
      setBannerError("Kayıt sırasında hata oluştu.");
    }
  };

  const handleSendDuePushAlert = async () => {
    if (!selectedContact || !selectedContactAgingRisk) return;
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Vade / Risk Uyarısı: ${selectedContact.name}`,
        body: `Gecikmiş Alacak: ${fmtMoney(
          selectedContactAgingRisk.overdueReceivable
        )} | Mevcut Risk: ${fmtMoney(selectedContactAgingRisk.currentRisk)}`,
        url: "/",
      }),
    });
    showSuccess("Vade/risk uyarısı Web Push ile gönderildi.");
  };

  const handleExportContactsExcel = () => {
    const rows = filteredContacts.map((c) => {
      const s = contactSummaries.get(c.id);
      return {
        "Cari Kodu": c.code,
        "Firma Adı": c.name,
        "Cari Türü": CONTACT_TYPE_LABELS[c.contact_type],
        Telefon: c.phone || "",
        Şehir: c.city || "",
        "Toplam Borç": s?.totalDebit || 0,
        "Toplam Alacak": s?.totalCredit || 0,
        "Güncel Bakiye": s?.absBalance || 0,
        "Bakiye Yönü": s?.direction || "Sıfır",
        Durum: c.is_active ? "Aktif" : "Pasif",
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Cari Listesi");
    XLSX.writeFile(wb, `Cari_Hesap_Listesi_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Cross-module matched sales & proposals for selectedContact
  const contactMatchedSales = useMemo(() => {
    if (!selectedContact) return [];
    const nameLower = selectedContact.name.toLocaleLowerCase("tr-TR");
    return externalSales.filter((s) =>
      s.customer_name.toLocaleLowerCase("tr-TR").includes(nameLower) ||
      nameLower.includes(s.customer_name.toLocaleLowerCase("tr-TR"))
    );
  }, [selectedContact, externalSales]);

  const contactMatchedProposals = useMemo(() => {
    if (!selectedContact) return [];
    const nameLower = selectedContact.name.toLocaleLowerCase("tr-TR");
    return externalProposals.filter((p) => {
      const pName = (p.customer?.name || p.metadata?.customerName || "").toLocaleLowerCase("tr-TR");
      return pName && (pName.includes(nameLower) || nameLower.includes(pName));
    });
  }, [selectedContact, externalProposals]);

  return (
    <div className="space-y-5">
      {/* Supabase Notice if tables missing */}
      {tableMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <div className="font-bold">Cari Hesap tabloları Supabase&apos;de henüz oluşturulmamış</div>
            <p className="text-amber-700 mt-0.5">
              Veriler şu an tarayıcı hafızasında tutuluyor. Kalıcı bulut veritabanı için{" "}
              <code>data/current_accounts_schema.sql</code> dosyasını Supabase SQL Editor&apos;de çalıştırın.
            </p>
          </div>
        </div>
      )}

      {bannerError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 flex items-center justify-between">
          <span>{bannerError}</span>
          <button type="button" onClick={() => setBannerError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{bannerSuccess}</span>
        </div>
      )}

      {/* Top Module Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2.5 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMainView("list")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              mainView === "list"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Cari Listesi ({contacts.length})</span>
          </button>

          {selectedContact && (
            <button
              type="button"
              onClick={() => setMainView("profile")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                mainView === "profile"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Cari Profili: {selectedContact.name}</span>
            </button>
          )}

          {perms.has("report_view") && (
            <button
              type="button"
              onClick={() => setMainView("reports")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                mainView === "reports"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cari Analiz &amp; Raporlar</span>
            </button>
          )}
        </div>

        {perms.has("cari_create") && (
          <button
            type="button"
            onClick={openNewContactModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Cari Kartı</span>
          </button>
        )}
      </div>

      {/* =================================================================== */}
      {/* VIEW 1: CARİ LİSTESİ                                                */}
      {/* =================================================================== */}
      {mainView === "list" && (
        <div className="space-y-4">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400">Toplam Cari</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {globalKpis.totalContacts}
              </div>
              <div className="text-xs text-slate-500">{globalKpis.activeContacts} Aktif Kart</div>
            </div>
            <div className="bg-rose-50/60 rounded-2xl border border-rose-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-rose-700 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Toplam Borç Bakiyesi (Alacağımız)
              </div>
              <div className="text-2xl font-black text-rose-900 mt-1">
                {fmtMoney(globalKpis.totalReceivable)}
              </div>
            </div>
            <div className="bg-emerald-50/60 rounded-2xl border border-emerald-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Toplam Alacak Bakiyesi (Borcumuz)
              </div>
              <div className="text-2xl font-black text-emerald-900 mt-1">
                {fmtMoney(globalKpis.totalPayable)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase text-slate-400">Toplam Hareket</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {transactions.filter((t) => !t.is_cancelled).length}
              </div>
            </div>
          </div>

          {/* Search & Filters Bar */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative min-w-[200px] flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Kod, firma adı, VKN, telefon..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                >
                  <option value="all">Tüm Türler</option>
                  <option value="customer">Müşteri</option>
                  <option value="supplier">Tedarikçi</option>
                  <option value="both">Müşteri &amp; Tedarikçi</option>
                  <option value="other">Diğer</option>
                </select>
                <select
                  value={directionFilter}
                  onChange={(e) =>
                    setDirectionFilter(e.target.value as "all" | "Borç" | "Alacak")
                  }
                  className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                >
                  <option value="all">Tüm Bakiyeler</option>
                  <option value="Borç">Borç Bakiyesi</option>
                  <option value="Alacak">Alacak Bakiyesi</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "all" | "active" | "passive")
                  }
                  className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                >
                  <option value="all">Tümü</option>
                  <option value="active">Aktif</option>
                  <option value="passive">Pasif</option>
                </select>
                {uniqueCities.length > 0 && (
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="all">Tüm Şehirler</option>
                    {uniqueCities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 relative">
                <button
                  type="button"
                  onClick={() => setShowColsPanel((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Kolonlar</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportContactsExcel}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel</span>
                </button>

                {showColsPanel && (
                  <div className="absolute right-0 top-11 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 w-48 space-y-1.5 text-xs">
                    {(
                      [
                        ["code", "Cari Kodu"],
                        ["type", "Cari Türü"],
                        ["phone", "Telefon"],
                        ["debit", "Toplam Borç"],
                        ["credit", "Toplam Alacak"],
                        ["balance", "Güncel Bakiye"],
                        ["lastDate", "Son İşlem"],
                        ["status", "Durum"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleCols[k]}
                          onChange={(e) =>
                            setVisibleCols({ ...visibleCols, [k]: e.target.checked })
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Cari kartlar yükleniyor...</span>
              </div>
            ) : pagedContacts.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Kayıtlı cari kartı bulunamadı. &quot;Yeni Cari Kartı&quot; ile ekleyebilirsiniz.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      {visibleCols.code && (
                        <th
                          onClick={() => {
                            setSortField("code");
                            setSortAsc((v) => !v);
                          }}
                          className="py-3 px-4 cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1">
                            Cari Kodu <ArrowUpDown className="w-3 h-3" />
                          </span>
                        </th>
                      )}
                      <th
                        onClick={() => {
                          setSortField("name");
                          setSortAsc((v) => !v);
                        }}
                        className="py-3 px-4 cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-1">
                          Firma Adı <ArrowUpDown className="w-3 h-3" />
                        </span>
                      </th>
                      {visibleCols.type && <th className="py-3 px-3">Cari Türü</th>}
                      {visibleCols.phone && <th className="py-3 px-3">Telefon</th>}
                      {visibleCols.debit && <th className="py-3 px-3 text-right">Toplam Borç</th>}
                      {visibleCols.credit && <th className="py-3 px-3 text-right">Toplam Alacak</th>}
                      {visibleCols.balance && (
                        <th
                          onClick={() => {
                            setSortField("balance");
                            setSortAsc((v) => !v);
                          }}
                          className="py-3 px-4 text-right cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1">
                            Güncel Bakiye <ArrowUpDown className="w-3 h-3" />
                          </span>
                        </th>
                      )}
                      {visibleCols.lastDate && <th className="py-3 px-3">Son İşlem</th>}
                      {visibleCols.status && <th className="py-3 px-3 text-center">Durum</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedContacts.map((c) => {
                      const s = contactSummaries.get(c.id);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setSelectedContactId(c.id);
                            setProfileTab("overview");
                            setMainView("profile");
                          }}
                          className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                        >
                          {visibleCols.code && (
                            <td className="py-3 px-4 font-mono font-bold text-slate-600">
                              {c.code}
                            </td>
                          )}
                          <td className="py-3 px-4 font-extrabold text-slate-900">
                            <div>{c.name}</div>
                            {c.city && (
                              <div className="text-[10px] font-normal text-slate-400">
                                {c.city}
                              </div>
                            )}
                          </td>
                          {visibleCols.type && (
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                                {CONTACT_TYPE_LABELS[c.contact_type]}
                              </span>
                            </td>
                          )}
                          {visibleCols.phone && (
                            <td className="py-3 px-3 text-slate-600">{c.phone || "—"}</td>
                          )}
                          {visibleCols.debit && (
                            <td className="py-3 px-3 text-right tabular-nums">
                              {fmtMoney(s?.totalDebit || 0)}
                            </td>
                          )}
                          {visibleCols.credit && (
                            <td className="py-3 px-3 text-right tabular-nums">
                              {fmtMoney(s?.totalCredit || 0)}
                            </td>
                          )}
                          {visibleCols.balance && (
                            <td className="py-3 px-4 text-right font-black tabular-nums">
                              <span
                                className={
                                  s?.direction === "Borç"
                                    ? "text-rose-700"
                                    : s?.direction === "Alacak"
                                      ? "text-emerald-700"
                                      : "text-slate-500"
                                }
                              >
                                {fmtMoney(s?.absBalance || 0)} ({s?.direction || "Sıfır"})
                              </span>
                            </td>
                          )}
                          {visibleCols.lastDate && (
                            <td className="py-3 px-3 text-slate-500">
                              {s?.lastTransactionDate || "—"}
                            </td>
                          )}
                          {visibleCols.status && (
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  c.is_active
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {c.is_active ? "Aktif" : "Pasif"}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Sayfa {page} / {totalPages} ({filteredContacts.length} kayıt)
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-40"
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-40"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 2: CARİ PROFİLİ (12 SEKME)                                     */}
      {/* =================================================================== */}
      {mainView === "profile" && selectedContact && selectedContactAgingRisk && (
        <div className="space-y-4">
          {/* Profile Header Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setMainView("list")}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {selectedContact.code}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    {CONTACT_TYPE_LABELS[selectedContact.contact_type]}
                  </span>
                  {selectedContactAgingRisk.riskExceeded && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                      <ShieldAlert className="w-3.5 h-3.5" /> Risk Limiti Aşıldı!
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  {selectedContact.name}
                </h2>
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                  <span>Yetkili: {selectedContact.authorized_person || "-"}</span>
                  <span>Tel: {selectedContact.phone || "-"}</span>
                  <span>VKN/TCKN: {selectedContact.tax_number || "-"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {perms.has("cari_edit") && (
                <button
                  type="button"
                  onClick={() => {
                    setContactDraft({ ...selectedContact });
                    setContactFormError(null);
                    setContactModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Düzenle
                </button>
              )}
              <button
                type="button"
                onClick={handleSendDuePushAlert}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-800"
                title="Vade/Risk uyarısını Web Push ile bildir"
              >
                <BellRing className="w-3.5 h-3.5" /> Bildirim Gönder
              </button>
            </div>
          </div>

          {/* 12 Profile Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {(
                [
                  ["overview", "1. Genel Bakış"],
                  ["transactions", "2. Cari Hareketler"],
                  ["statement", "3. Ekstre"],
                  ["collections_payments", "4. Tahsilat & Ödeme"],
                  ["sales", "5. Satışlar"],
                  ["purchases", "6. Alışlar"],
                  ["proposals", "7. Teklifler"],
                  ["orders", "8. Siparişler"],
                  ["reconciliations", "9. Mutabakatlar"],
                  ["documents", "10. Belgeler"],
                  ["notes", "11. Görüşme & Notlar"],
                  ["audit", "12. İşlem Geçmişi"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProfileTab(id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                    profileTab === id
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Genel Bakış */}
          {profileTab === "overview" && (() => {
            const sum = contactSummaries.get(selectedContact.id)!;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Güncel Bakiye</div>
                    <div className="text-xl font-black text-indigo-700 mt-1">
                      {fmtMoney(sum.absBalance)} ({sum.direction})
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Toplam Borç / Alacak</div>
                    <div className="text-xs font-bold text-slate-800 mt-1.5">
                      Borç: {fmtMoney(sum.totalDebit)}
                    </div>
                    <div className="text-xs font-bold text-slate-800">
                      Alacak: {fmtMoney(sum.totalCredit)}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Vadesi Geçmiş Alacak</div>
                    <div className="text-xl font-black text-rose-700 mt-1">
                      {fmtMoney(selectedContactAgingRisk.overdueReceivable)}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Son Tarihler</div>
                    <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                      <div>İşlem: {sum.lastTransactionDate || "-"}</div>
                      <div>Tahsilat: {sum.lastCollectionDate || "-"}</div>
                      <div>Ödeme: {sum.lastPaymentDate || "-"}</div>
                    </div>
                  </div>
                </div>

                {/* Risk & Aging Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <h4 className="text-sm font-black text-slate-900">Vade Yaşlandırma</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="text-[10px] text-slate-500">Vadesi Gelmemiş</div>
                        <div className="font-black mt-0.5">{fmtMoney(selectedContactAgingRisk.notDue)}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="text-[10px] text-amber-700">1–30 Gün</div>
                        <div className="font-black mt-0.5">{fmtMoney(selectedContactAgingRisk.days1to30)}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200">
                        <div className="text-[10px] text-orange-700">31–60 Gün</div>
                        <div className="font-black mt-0.5">{fmtMoney(selectedContactAgingRisk.days31to60)}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                        <div className="text-[10px] text-rose-700">61–90 Gün</div>
                        <div className="font-black mt-0.5">{fmtMoney(selectedContactAgingRisk.days61to90)}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300">
                        <div className="text-[10px] text-rose-900">90+ Gün</div>
                        <div className="font-black mt-0.5">{fmtMoney(selectedContactAgingRisk.days90Plus)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <h4 className="text-sm font-black text-slate-900">Risk &amp; Performans</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-slate-500">Risk Limiti</div>
                        <div className="font-black text-sm">{fmtMoney(selectedContactAgingRisk.riskLimit)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Kullanılabilir Risk</div>
                        <div className="font-black text-sm">{fmtMoney(selectedContactAgingRisk.availableRiskLimit)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Ödeme Performansı</div>
                        <div className="font-black text-sm text-emerald-700">
                          %{selectedContactAgingRisk.paymentPerformanceScore}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Bekleyen Teklif / Satış</div>
                        <div className="font-black text-sm">
                          {contactMatchedProposals.length} Teklif • {contactMatchedSales.length} Satış
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tab 2: Cari Hareketler */}
          {profileTab === "transactions" && (
            <div className="space-y-4">
              {perms.has("tx_create") && (
                <form
                  onSubmit={handleAddTransaction}
                  className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-8 gap-2 text-xs"
                >
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as AccountTransactionType)}
                    className="col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                    {(Object.keys(TRANSACTION_TYPE_LABELS) as AccountTransactionType[]).map((k) => (
                      <option key={k} value={k}>
                        {TRANSACTION_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="px-2 py-2 rounded-xl border border-slate-300"
                  />
                  <input
                    type="date"
                    value={txDueDate}
                    onChange={(e) => setTxDueDate(e.target.value)}
                    title="Vade Tarihi"
                    className="px-2 py-2 rounded-xl border border-slate-300"
                  />
                  <input
                    type="text"
                    value={txDocNo}
                    onChange={(e) => setTxDocNo(e.target.value)}
                    placeholder="Belge No"
                    className="px-2.5 py-2 rounded-xl border border-slate-300"
                  />
                  <input
                    type="number"
                    step="any"
                    value={txDebit}
                    onChange={(e) => setTxDebit(e.target.value)}
                    placeholder="Borç"
                    className="px-2.5 py-2 rounded-xl border border-slate-300 text-right font-bold"
                  />
                  <input
                    type="number"
                    step="any"
                    value={txCredit}
                    onChange={(e) => setTxCredit(e.target.value)}
                    placeholder="Alacak"
                    className="px-2.5 py-2 rounded-xl border border-slate-300 text-right font-bold"
                  />
                  <div className="flex gap-1">
                    <select
                      value={txCurrency}
                      onChange={(e) => setTxCurrency(e.target.value as CariCurrency)}
                      className="w-1/2 px-1.5 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                    >
                      <option value="TRY">TRY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={txRate}
                      onChange={(e) => setTxRate(e.target.value)}
                      title="Kur"
                      className="w-1/2 px-1.5 py-2 rounded-xl border border-slate-300 text-right"
                    />
                  </div>
                  <input
                    type="text"
                    value={txDesc}
                    onChange={(e) => setTxDesc(e.target.value)}
                    placeholder="Açıklama..."
                    className="col-span-6 px-3 py-2 rounded-xl border border-slate-300"
                  />
                  <button
                    type="submit"
                    className="col-span-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                  >
                    Hareket Ekle
                  </button>
                </form>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3">Tarih</th>
                      <th className="py-2.5 px-3">Vade</th>
                      <th className="py-2.5 px-3">Belge No</th>
                      <th className="py-2.5 px-3">Tür</th>
                      <th className="py-2.5 px-3">Açıklama</th>
                      <th className="py-2.5 px-3 text-right">Borç (TL)</th>
                      <th className="py-2.5 px-3 text-right">Alacak (TL)</th>
                      <th className="py-2.5 px-3 text-right">Kümülatif Bakiye</th>
                      <th className="py-2.5 px-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedContactLedger.map((r) => (
                      <tr key={r.id} className={r.is_cancelled ? "opacity-45 line-through bg-slate-50" : ""}>
                        <td className="py-2.5 px-3 whitespace-nowrap">{r.transaction_date}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {r.due_date || "-"}
                          {r.isOverdue && (
                            <span className="ml-1 text-[10px] text-rose-600 font-bold">
                              ({r.overdueDays}g)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{r.document_no || "-"}</td>
                        <td className="py-2.5 px-3">{TRANSACTION_TYPE_LABELS[r.transaction_type]}</td>
                        <td className="py-2.5 px-3">{r.description}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-rose-700">
                          {r.tl_debit > 0 ? fmtMoney(r.tl_debit) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                          {r.tl_credit > 0 ? fmtMoney(r.tl_credit) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black">
                          {fmtMoney(Math.abs(r.runningBalance))} ({r.runningDirection})
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {!r.is_cancelled && perms.has("tx_create") && (
                            <button
                              type="button"
                              onClick={() => handleCancelTransaction(r.id)}
                              className="text-[11px] font-bold text-rose-600 hover:underline"
                            >
                              İptal Et
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Ekstre */}
          {profileTab === "statement" && (
            <CurrentAccountStatementAndReconcile
              mode="statement"
              contact={selectedContact}
              transactions={transactions}
              reconciliations={reconciliations}
              canExport={perms.has("statement_export")}
              canCreateReconciliation={perms.has("reconciliation_create")}
              canApproveReconciliation={perms.has("reconciliation_approve")}
              onSaveReconciliation={async () => {}}
            />
          )}

          {/* Tab 4: Tahsilat & Ödemeler */}
          {profileTab === "collections_payments" && (
            <div className="space-y-4">
              {(perms.has("collect") || perms.has("pay")) && (
                <form
                  onSubmit={handleAddCollectionPayment}
                  className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-8 gap-2 text-xs"
                >
                  <select
                    value={cpKind}
                    onChange={(e) => setCpKind(e.target.value as "collection" | "payment")}
                    className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                    {perms.has("collect") && <option value="collection">Tahsilat (Giriş)</option>}
                    {perms.has("pay") && <option value="payment">Ödeme (Çıkış)</option>}
                  </select>
                  <input
                    type="date"
                    value={cpDate}
                    onChange={(e) => setCpDate(e.target.value)}
                    className="px-2 py-2 rounded-xl border border-slate-300"
                  />
                  <input
                    type="number"
                    step="any"
                    required
                    value={cpAmount}
                    onChange={(e) => setCpAmount(e.target.value)}
                    placeholder="Tutar"
                    className="px-2.5 py-2 rounded-xl border border-slate-300 text-right font-bold"
                  />
                  <select
                    value={cpMethod}
                    onChange={(e) => setCpMethod(e.target.value as PaymentMethodType)}
                    className="px-2 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodType[]).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={cpAccount}
                    onChange={(e) => setCpAccount(e.target.value)}
                    placeholder="Kasa / Banka"
                    className="px-2.5 py-2 rounded-xl border border-slate-300"
                  />
                  <input
                    type="text"
                    value={cpRefNo}
                    onChange={(e) => setCpRefNo(e.target.value)}
                    placeholder="Referans / Dekont No"
                    className="px-2.5 py-2 rounded-xl border border-slate-300"
                  />
                  <div className="flex gap-1">
                    <select
                      value={cpCurrency}
                      onChange={(e) => setCpCurrency(e.target.value as CariCurrency)}
                      className="w-1/2 px-1 py-2 rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="TRY">TRY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={cpRate}
                      onChange={(e) => setCpRate(e.target.value)}
                      className="w-1/2 px-1.5 py-2 rounded-xl border border-slate-300 text-right"
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Kaydet</span>
                  </button>
                  <input
                    type="text"
                    value={cpDesc}
                    onChange={(e) => setCpDesc(e.target.value)}
                    placeholder="Açıklama..."
                    className="col-span-2 sm:col-span-8 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                  />
                </form>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3">Tarih</th>
                      <th className="py-2.5 px-3">Tür</th>
                      <th className="py-2.5 px-3">Yöntem</th>
                      <th className="py-2.5 px-3">Kasa / Banka</th>
                      <th className="py-2.5 px-3">Referans</th>
                      <th className="py-2.5 px-3 text-right">Tutar (TL)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {collectionsPayments
                      .filter((c) => c.contact_id === selectedContact.id)
                      .map((c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 px-3">{c.transaction_date}</td>
                          <td className="py-2.5 px-3 font-bold">
                            {c.kind === "collection" ? "Tahsilat" : "Ödeme"}
                          </td>
                          <td className="py-2.5 px-3">{PAYMENT_METHOD_LABELS[c.payment_method]}</td>
                          <td className="py-2.5 px-3">{c.account_name || "-"}</td>
                          <td className="py-2.5 px-3 font-mono">{c.reference_no || "-"}</td>
                          <td className="py-2.5 px-3 text-right font-black">{fmtMoney(c.tl_amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 5: Satışlar (integrated with sales_records) */}
          {profileTab === "sales" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h4 className="text-sm font-black text-slate-900">
                Bu Cariye Ait Satış Kayıtları ({contactMatchedSales.length})
              </h4>
              {contactMatchedSales.length === 0 ? (
                <p className="text-xs text-slate-400">Eşleşen satış kaydı bulunamadı.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3">Tarih</th>
                      <th className="py-2 px-3">Ürün</th>
                      <th className="py-2 px-3 text-right">Miktar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contactMatchedSales.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 px-3">{s.sale_date}</td>
                        <td className="py-2 px-3 font-bold">{s.product_name}</td>
                        <td className="py-2 px-3 text-right">
                          {s.quantity} {s.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 6: Alışlar */}
          {profileTab === "purchases" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h4 className="text-sm font-black text-slate-900">Alış Faturaları</h4>
              {selectedContactLedger.filter((t) => t.transaction_type === "purchase_invoice").length === 0 ? (
                <p className="text-xs text-slate-400">Alış faturası hareketi bulunmuyor.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3">Tarih</th>
                      <th className="py-2 px-3">Belge No</th>
                      <th className="py-2 px-3">Açıklama</th>
                      <th className="py-2 px-3 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedContactLedger
                      .filter((t) => t.transaction_type === "purchase_invoice")
                      .map((t) => (
                        <tr key={t.id}>
                          <td className="py-2 px-3">{t.transaction_date}</td>
                          <td className="py-2 px-3">{t.document_no || "-"}</td>
                          <td className="py-2 px-3">{t.description}</td>
                          <td className="py-2 px-3 text-right font-bold">{fmtMoney(t.tl_credit)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 7: Teklifler */}
          {profileTab === "proposals" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h4 className="text-sm font-black text-slate-900">
                Teklifler ({contactMatchedProposals.length})
              </h4>
              {contactMatchedProposals.length === 0 ? (
                <p className="text-xs text-slate-400">Bu cariye ait kayıtlı teklif bulunamadı.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3">Teklif No</th>
                      <th className="py-2 px-3">Tarih</th>
                      <th className="py-2 px-3">Durum</th>
                      <th className="py-2 px-3 text-right">Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contactMatchedProposals.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-bold">{p.proposal_number}</td>
                        <td className="py-2 px-3">{p.created_at?.slice(0, 10)}</td>
                        <td className="py-2 px-3">{p.status}</td>
                        <td className="py-2 px-3 text-right font-black">
                          {fmtMoney(p.total_amount || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 8: Siparişler */}
          {profileTab === "orders" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-indigo-600" /> Sipariş Özeti
              </h4>
              <p className="text-xs text-slate-500">
                Onaylanan teklifler ({contactMatchedProposals.filter((p) => p.status === "accepted").length}) ve
                teslim edilen satışlar ({contactMatchedSales.length}) burada takip edilir.
              </p>
            </div>
          )}

          {/* Tab 9: Mutabakatlar & PDF Otomatik Karşılaştırma */}
          {profileTab === "reconciliations" && (
            <CurrentAccountStatementAndReconcile
              mode="reconciliation"
              contact={selectedContact}
              transactions={transactions}
              reconciliations={reconciliations}
              canExport={perms.has("statement_export")}
              canCreateReconciliation={perms.has("reconciliation_create")}
              canApproveReconciliation={perms.has("reconciliation_approve")}
              onSaveReconciliation={async (rec) => {
                const res = await fetch("/api/current-accounts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "upsert_reconciliation",
                    actor: actorName,
                    reconciliation: rec,
                  }),
                });
                const data = await res.json();
                const saved: ReconciliationRecord =
                  data?.success && data.reconciliation
                    ? data.reconciliation
                    : {
                        id: `rec-loc-${Date.now()}`,
                        contact_id: selectedContact.id,
                        start_date: rec.start_date || "",
                        end_date: rec.end_date || "",
                        balance_date: rec.balance_date || "",
                        system_amount: rec.system_amount || 0,
                        system_direction: rec.system_direction || "Borç",
                        counterparty_amount: rec.counterparty_amount ?? null,
                        counterparty_direction: rec.counterparty_direction ?? null,
                        difference_amount: rec.difference_amount || 0,
                        difference_note: rec.difference_note ?? null,
                        status: rec.status || "preparing",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      };
                const next = [saved, ...reconciliations];
                setReconciliations(next);
                showSuccess("Mutabakat kaydı güncellendi.");
              }}
            />
          )}

          {/* Tab 10: Belgeler */}
          {profileTab === "documents" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Belge başlığı (ör: Vergi Levhası)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                />
                <input
                  type="text"
                  value={docFileName}
                  onChange={(e) => setDocFileName(e.target.value)}
                  placeholder="Dosya adı / bağlantı"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!docTitle.trim()) return;
                    const newDoc: ContactDocumentItem = {
                      id: `doc-${Date.now()}`,
                      contact_id: selectedContact.id,
                      title: docTitle.trim(),
                      file_name: docFileName.trim() || docTitle.trim(),
                      uploaded_by: actorName,
                      created_at: new Date().toISOString(),
                    };
                    setDocuments([newDoc, ...documents]);
                    setDocTitle("");
                    setDocFileName("");
                    await fetch("/api/current-accounts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "add_document",
                        actor: actorName,
                        document: newDoc,
                      }),
                    }).catch(() => {});
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold inline-flex items-center gap-1"
                >
                  <Paperclip className="w-3.5 h-3.5" /> Ekle
                </button>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {documents
                  .filter((d) => d.contact_id === selectedContact.id)
                  .map((d) => (
                    <div key={d.id} className="py-2 flex justify-between">
                      <span className="font-bold">{d.title}</span>
                      <span className="text-slate-500">{d.file_name}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tab 11: Görüşme ve Notlar */}
          {profileTab === "notes" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <select
                  value={noteType}
                  onChange={(e) =>
                    setNoteType(e.target.value as ContactNoteItem["note_type"])
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                >
                  <option value="note">Genel Not</option>
                  <option value="call">Telefon Görüşmesi</option>
                  <option value="meeting">Toplantı</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-posta</option>
                </select>
                <input
                  type="text"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Görüşme özeti veya hatırlatma..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!noteContent.trim()) return;
                    const newNote: ContactNoteItem = {
                      id: `note-${Date.now()}`,
                      contact_id: selectedContact.id,
                      note_type: noteType,
                      content: noteContent.trim(),
                      created_by: actorName,
                      created_at: new Date().toISOString(),
                    };
                    setNotes([newNote, ...notes]);
                    setNoteContent("");
                    await fetch("/api/current-accounts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "add_note",
                        actor: actorName,
                        note: newNote,
                      }),
                    }).catch(() => {});
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold inline-flex items-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Not Ekle
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {notes
                  .filter((n) => n.contact_id === selectedContact.id)
                  .map((n) => (
                    <div key={n.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="font-bold text-indigo-700 text-[10px] uppercase">
                        {n.note_type} • {n.created_by} • {n.created_at.slice(0, 10)}
                      </div>
                      <div className="text-slate-800 mt-1">{n.content}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tab 12: İşlem Geçmişi (Audit Log) */}
          {profileTab === "audit" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-600" /> Denetim İzi (Audit Log)
              </h4>
              <div className="divide-y divide-slate-100 text-xs">
                {auditLogs
                  .filter((l) => !l.contact_id || l.contact_id === selectedContact.id)
                  .map((l) => (
                    <div key={l.id} className="py-2 flex justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900">{l.action}</span> —{" "}
                        <span className="text-slate-600">{l.details}</span>
                      </div>
                      <div className="text-slate-400 whitespace-nowrap">
                        {l.performed_by} • {l.created_at.slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 3: CARİ ANALİZ & RAPORLAMA (13 RAPOR)                          */}
      {/* =================================================================== */}
      {mainView === "reports" && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-slate-900">Cari Analiz ve Raporlama Merkezi</h3>
              <p className="text-xs text-slate-500">
                13 farklı cari, vade, risk ve ticari performans raporu
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportContactsExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" /> Excel İndir
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all_balances", "Tüm Bakiyeler"],
                ["debit_balances", "Borç Bakiyesi Olanlar"],
                ["credit_balances", "Alacak Bakiyesi Olanlar"],
                ["overdue_receivables", "Vadesi Geçmiş Alacaklar"],
                ["overdue_payables", "Vadesi Geçmiş Borçlar"],
                ["collection_perf", "Tahsilat Performansı"],
                ["payment_perf", "Ödeme Performansı"],
                ["sales_by_customer", "Müşteri Satış Analizi"],
                ["purchases_by_supplier", "Tedarikçi Alış Analizi"],
                ["highest_balance", "En Yüksek Bakiyeliler"],
                ["most_active", "En Fazla İşlem Yapılanlar"],
                ["monthly_movements", "Aylık Hareket Raporu"],
                ["risk_report", "Cari Risk Raporu"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveReport(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  activeReport === id
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-4">Cari Kodu</th>
                  <th className="py-2.5 px-4">Firma Adı</th>
                  <th className="py-2.5 px-3 text-right">Borç</th>
                  <th className="py-2.5 px-3 text-right">Alacak</th>
                  <th className="py-2.5 px-4 text-right">Net Bakiye</th>
                  <th className="py-2.5 px-4 text-right">Gecikmiş / Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts
                  .map((c) => ({
                    contact: c,
                    sum: contactSummaries.get(c.id)!,
                    risk: computeAgingAndRisk(c, transactions),
                  }))
                  .filter(({ sum, risk }) => {
                    if (activeReport === "debit_balances") return sum.netBalance > 0;
                    if (activeReport === "credit_balances") return sum.netBalance < 0;
                    if (activeReport === "overdue_receivables") return risk.overdueReceivable > 0;
                    if (activeReport === "overdue_payables") return risk.overduePayable > 0;
                    if (activeReport === "risk_report") return risk.riskLimit > 0;
                    return true;
                  })
                  .sort((a, b) => {
                    if (activeReport === "highest_balance") return b.sum.absBalance - a.sum.absBalance;
                    if (activeReport === "most_active") return b.sum.transactionCount - a.sum.transactionCount;
                    return a.contact.name.localeCompare(b.contact.name, "tr-TR");
                  })
                  .map(({ contact, sum, risk }) => (
                    <tr key={contact.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono">{contact.code}</td>
                      <td className="py-2.5 px-4 font-bold">{contact.name}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMoney(sum.totalDebit)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMoney(sum.totalCredit)}</td>
                      <td className="py-2.5 px-4 text-right font-black">
                        {fmtMoney(sum.absBalance)} ({sum.direction})
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {risk.overdueReceivable > 0 ? (
                          <span className="text-rose-700 font-bold">
                            Gecikmiş: {fmtMoney(risk.overdueReceivable)}
                          </span>
                        ) : (
                          `Risk: %${risk.paymentPerformanceScore}`
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: YENİ / DÜZENLE CARİ KARTI                                    */}
      {/* =================================================================== */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveContact}
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-sm text-slate-900">
                {contactDraft.id ? "Cari Kartını Düzenle" : "Yeni Cari Kartı Oluştur"}
              </h3>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {contactFormError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-700 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{contactFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Cari Kodu *</label>
                  <input
                    type="text"
                    required
                    value={contactDraft.code || ""}
                    onChange={(e) => setContactDraft({ ...contactDraft, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Firma / Kişi Adı *</label>
                  <input
                    type="text"
                    required
                    value={contactDraft.name || ""}
                    onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Cari Türü</label>
                  <select
                    value={contactDraft.contact_type || "both"}
                    onChange={(e) =>
                      setContactDraft({
                        ...contactDraft,
                        contact_type: e.target.value as ContactType,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="customer">Müşteri</option>
                    <option value="supplier">Tedarikçi</option>
                    <option value="both">Müşteri ve Tedarikçi</option>
                    <option value="other">Diğer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Firma Türü</label>
                  <select
                    value={contactDraft.company_type || "limited"}
                    onChange={(e) =>
                      setContactDraft({
                        ...contactDraft,
                        company_type: e.target.value as CompanyEntityType,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="limited">Limited Şirket</option>
                    <option value="incorporated">Anonim Şirket</option>
                    <option value="individual">Şahıs Firması</option>
                    <option value="other">Diğer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Para Birimi</label>
                  <select
                    value={contactDraft.currency || "TRY"}
                    onChange={(e) =>
                      setContactDraft({
                        ...contactDraft,
                        currency: e.target.value as CariCurrency,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Vergi Dairesi</label>
                  <input
                    type="text"
                    value={contactDraft.tax_office || ""}
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, tax_office: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Vergi No / TCKN</label>
                  <input
                    type="text"
                    value={contactDraft.tax_number || ""}
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, tax_number: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Yetkili Kişi</label>
                  <input
                    type="text"
                    value={contactDraft.authorized_person || ""}
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, authorized_person: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={contactDraft.phone || ""}
                    onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">E-posta</label>
                  <input
                    type="email"
                    value={contactDraft.email || ""}
                    onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Web Sitesi</label>
                  <input
                    type="text"
                    value={contactDraft.website || ""}
                    onChange={(e) => setContactDraft({ ...contactDraft, website: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Şehir</label>
                  <input
                    type="text"
                    value={contactDraft.city || ""}
                    onChange={(e) => setContactDraft({ ...contactDraft, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Ödeme Vadesi (Gün)</label>
                  <input
                    type="number"
                    value={contactDraft.payment_term_days ?? 0}
                    onChange={(e) =>
                      setContactDraft({
                        ...contactDraft,
                        payment_term_days: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-right"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Risk Limiti</label>
                  <input
                    type="number"
                    step="any"
                    disabled={Boolean(contactDraft.id) && !perms.has("risk_edit")}
                    value={contactDraft.risk_limit ?? 0}
                    onChange={(e) =>
                      setContactDraft({
                        ...contactDraft,
                        risk_limit: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-right font-bold"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-600 mb-1">Açık Adres</label>
                  <input
                    type="text"
                    value={contactDraft.address || ""}
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, address: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-600 mb-1">Cari Açıklaması</label>
                  <input
                    type="text"
                    value={contactDraft.description || ""}
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, description: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

