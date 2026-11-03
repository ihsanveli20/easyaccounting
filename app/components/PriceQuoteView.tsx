"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import * as htmlToImage from "html-to-image";
import {
  Printer,
  Plus,
  Trash2,
  Download,
  Copy,
  Calendar,
  Sparkles,
  RotateCcw,
  Building,
  CheckCircle2,
  FileText,
  Percent,
  Settings,
  MapPin,
  Phone,
  Upload,
  FileDown,
  Loader2,
  Package,
  Search,
  Check,
  Tag,
  X,
  Filter,
  CloudUpload,
  Users,
  History,
  Save,
} from "lucide-react";
import { ProductItem, Customer, SavedProposal } from "../types/accounting";
import { normalizeForSearch } from "../utils/excel";
import { DEFAULT_SAMPLE_PRODUCTS } from "./ProductManagementView";
import WhatsAppShareModal from "./WhatsAppShareModal";
import { WhatsAppProposalData, sharePdfViaWhatsApp } from "../utils/whatsapp";
import { renderElementToPdf } from "../utils/pdfGenerator";
import { useAuth } from "../context/AuthContext";

export interface QuoteItem {
  id: string;
  productId?: string | number; // MALZEME / ÜRÜN ID (Supabase products.id)
  materialName: string; // MALZEME CİNSİ
  quantity: number | ""; // MİKTAR
  unit: string; // BİRİM (Adet, Kg, Mt, Paket, vb.)
  unitPrice: number | ""; // BİRİM FİYATI (₺)
  total: number; // TUTAR (₺)
}

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  logoUrl?: string;
}

const COMMON_UNITS = [
  "Adet",
  "Metre",
  "Kg",
  "Ton",
  "Paket",
  "Koli",
  "Takım",
  "m²",
  "m³",
  "Litre",
  "Saat",
  "Gün",
  "Hizmet",
];

// Helper to format currency (Turkish locale)
function formatCurrency(val: number): string {
  if (isNaN(val)) return "0,00 TRY";
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val) + " TRY"
  );
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

// Turkish quantity formatter (e.g. 14000 -> "14.000", 1000 -> "1.000", 200 -> "200")
export function formatQuantityTurkish(qty: number | string | undefined | null): string {
  if (qty === "" || qty === undefined || qty === null) return "";
  const num =
    typeof qty === "number"
      ? qty
      : parseFloat(String(qty).replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return String(qty);
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 3,
  }).format(num);
}

// Turkish quantity parser (e.g. "14.000" -> 14000, "1.000" -> 1000, "200" -> 200)
export function parseQuantityTurkish(val: string): number | "" {
  if (!val || val.trim() === "") return "";
  const clean = val.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? "" : num;
}

// Quantity input cell component for table
interface QuantityCellProps {
  value: number | "";
  onChange: (val: number | "") => void;
}

function QuantityCell({ value, onChange }: QuantityCellProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState("");

  const displayValue = isFocused
    ? text
    : value !== ""
      ? formatQuantityTurkish(value)
      : "";

  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onFocus={() => {
          setIsFocused(true);
          setText(value !== "" ? String(value) : "");
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseQuantityTurkish(e.target.value);
          onChange(parsed);
        }}
        onBlur={() => {
          setIsFocused(false);
          const parsed = parseQuantityTurkish(text);
          onChange(parsed);
        }}
        className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 text-right font-medium text-slate-900 print:hidden text-xs"
        placeholder="0"
      />
      <div className="hidden print:block font-medium text-slate-950 text-xs text-right">
        {value !== "" && value !== 0 ? formatQuantityTurkish(value) : "\u00A0"}
      </div>
    </div>
  );
}

// Generate empty row
function createEmptyRow(): QuoteItem {
  return {
    id: Math.random().toString(36).substring(2, 9),
    materialName: "",
    quantity: "",
    unit: "Adet",
    unitPrice: "",
    total: 0,
  };
}

// Sample initial rows (5 items)
const SAMPLE_ITEMS: QuoteItem[] = [
  { id: "1", materialName: "Q12 Nervürlü İnşaat Demiri", quantity: 5, unit: "Ton", unitPrice: 28500, total: 142500 },
  { id: "2", materialName: "C30/37 Hazır Beton", quantity: 45, unit: "m³", unitPrice: 2450, total: 110250 },
  { id: "3", materialName: "19'luk Tuğla (Paletli)", quantity: 1200, unit: "Adet", unitPrice: 14.5, total: 17400 },
  { id: "4", materialName: "Torbalı Çimento (50 Kg)", quantity: 60, unit: "Paket", unitPrice: 195, total: 11700 },
  { id: "5", materialName: "Kaba Sıva Kumu", quantity: 18, unit: "Ton", unitPrice: 480, total: 8640 },
];

interface PriceQuoteViewProps {
  products?: ProductItem[];
  onGoToProducts?: () => void;
  productSource?: "supabase" | "local" | "syncing";
  editingProposal?: SavedProposal | null;
  onGoToHistory?: () => void;
  onClearEditingProposal?: () => void;
}

export default function PriceQuoteView({
  products: initialProducts,
  onGoToProducts,
  productSource = "local",
  editingProposal = null,
  onGoToHistory,
  onClearEditingProposal,
}: PriceQuoteViewProps = {}) {
  // Today formatted as DD.MM.YYYY
  const getTodayStr = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}.${m}.${y}`;
  };

  // Company Information (Matching the logo and header from user's template)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "İSTANBUL ANADOLU GIDA YAPI TEKNOLOJİ SANAYİ VE TİCARET ANONİM ŞİRKETİ",
    address: "Esenevler Mah.Talatpaşa Cad. İkiz Sokak No:2A Dükkan 1 Akyıldız İş Merkezi Ümraniye İstanbul Türkiye",
    phone: "(0216) 316 37 44",
    logoUrl: "/logo.jpg", // From app/logo.jpg
  });

  const [showCompanySettings, setShowCompanySettings] = useState<boolean>(false);

  // Form Title
  const [formTitle, setFormTitle] = useState<string>("MÜŞTERİ TEKLİF VE SİPARİŞ FORMU");

  // Meta: ONLY Customer Company Name and Date as requested ("AMA MÜŞTERİDE SADECE MÜŞTERİ FİRMA ADI VE TARİHİ OLACAK")
  const [customerName, setCustomerName] = useState<string>("");
  const [quoteDate, setQuoteDate] = useState<string>(getTodayStr());

  const { user, profile, isViewer } = useAuth();

  // Additional settings
  const [vatNote, setVatNote] = useState<string>("Birim fiyatlara KDV dahil değildir.");
  const [notes, setNotes] = useState<string>(
    "1. Fiyatlarımız teklif tarihinden itibaren 15 gün süreyle geçerlidir.\n2. Teslimat şantiye/depo teslimidir.\n3. Ödeme vadesi teslimat sonrası 30 gündür."
  );
  const [preparedBy, setPreparedBy] = useState<string>(
    profile?.full_name || profile?.user_name || "Satış & Pazarlama Departmanı"
  );

  // KDV Rate (%20 default)
  const [vatRate, setVatRate] = useState<number>(20);

  // Rows State (starts with 5 rows)
  const [rows, setRows] = useState<QuoteItem[]>(() => {
    return Array.from({ length: 5 }, () => createEmptyRow());
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Products Catalog Integration (from props or localStorage)
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>(() => {
    if (initialProducts && initialProducts.length > 0) return initialProducts;
    try {
      const saved = localStorage.getItem("easy_accounting_products_catalog_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return DEFAULT_SAMPLE_PRODUCTS;
  });

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setCatalogProducts(initialProducts);
    }
  }, [initialProducts]);

  // Autocomplete & Catalog Modal State
  const [activeAutocompleteRow, setActiveAutocompleteRow] = useState<number | null>(null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>("");
  const [selectedCatalogCategory, setSelectedCatalogCategory] = useState<string>("all");
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);

  // Customer selection from Supabase customers table
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSearchModalOpen, setCustomerSearchModalOpen] = useState<boolean>(false);
  const [customerModalSearch, setCustomerModalSearch] = useState<string>("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState<boolean>(false);

  // Proposal persistence state (Supabase proposals & proposal_items)
  const [proposalNumber, setProposalNumber] = useState<string>("");
  const [proposalStatus, setProposalStatus] = useState<"draft" | "sent" | "accepted" | "rejected">("draft");
  const [editingProposalId, setEditingProposalId] = useState<number | null>(null);
  const [isSavingToSupabase, setIsSavingToSupabase] = useState<boolean>(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState<boolean>(false);

  // Fetch customers from Supabase customers table on mount
  useEffect(() => {
    const loadCustomers = async () => {
      setIsLoadingCustomers(true);
      try {
        const res = await fetch("/api/customers");
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.customers)) {
            setCustomers(data.customers);
          }
        }
      } catch (err) {
        console.warn("Could not fetch customers from Supabase:", err);
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    loadCustomers();
  }, []);

  // Load editingProposal when passed from ProposalHistoryView
  useEffect(() => {
    if (editingProposal) {
      setEditingProposalId(editingProposal.id);
      setProposalNumber(editingProposal.proposal_number);
      setProposalStatus(editingProposal.status || "draft");
      setSelectedCustomerId(editingProposal.customer_id);
      setCustomerName(
        editingProposal.customer?.name ||
        editingProposal.metadata?.customerName ||
        ""
      );
      if (editingProposal.metadata?.quoteDate) {
        setQuoteDate(editingProposal.metadata.quoteDate);
      }
      if (editingProposal.metadata?.vatRate !== undefined) {
        setVatRate(editingProposal.metadata.vatRate);
      }
      if (editingProposal.metadata?.vatNote !== undefined) {
        setVatNote(editingProposal.metadata.vatNote);
      }
      if (editingProposal.metadata?.notes !== undefined) {
        setNotes(editingProposal.metadata.notes);
      }
      if (editingProposal.metadata?.preparedBy !== undefined) {
        setPreparedBy(editingProposal.metadata.preparedBy);
      }

      if (Array.isArray(editingProposal.items) && editingProposal.items.length > 0) {
        const loadedRows: QuoteItem[] = editingProposal.items.map((it, idx) => {
          const custom = editingProposal.metadata?.customItems?.[idx];
          return {
            id: String(it.id || idx + 1),
            productId: it.product_id || undefined,
            materialName: it.product?.name || custom?.materialName || "",
            quantity: it.quantity,
            unit: it.product?.unit_of_measure || custom?.unit || "Adet",
            unitPrice: it.unit_price,
            total: it.total_price || (it.quantity * it.unit_price),
          };
        });
        while (loadedRows.length < 5) {
          loadedRows.push(createEmptyRow());
        }
        setRows(loadedRows);
      }
    }
  }, [editingProposal]);

  // Customer matching for active input autocomplete
  const matchingCustomers = useMemo(() => {
    if (!customerDropdownOpen || !customerName.trim()) return [];
    const q = normalizeForSearch(customerName);
    const matches: Customer[] = [];
    for (const c of customers) {
      if (normalizeForSearch(c.name).includes(q)) {
        matches.push(c);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [customers, customerName, customerDropdownOpen]);

  // Filtered customer list for modal (capped at 100 for instant UI responsiveness)
  const filteredModalCustomers = useMemo(() => {
    const q = normalizeForSearch(customerModalSearch);
    if (!q) return customers.slice(0, 100);
    const matches: Customer[] = [];
    for (const c of customers) {
      if (normalizeForSearch(c.name).includes(q)) {
        matches.push(c);
        if (matches.length >= 100) break;
      }
    }
    return matches;
  }, [customers, customerModalSearch]);

  const handleSelectCustomer = (cust: Customer) => {
    setCustomerName(cust.name.toLocaleUpperCase("tr-TR"));
    setSelectedCustomerId(cust.id);
    setCustomerDropdownOpen(false);
    setCustomerSearchModalOpen(false);
  };

  // Autocomplete matching products for current active row
  const currentQuery =
    activeAutocompleteRow !== null && rows[activeAutocompleteRow]
      ? rows[activeAutocompleteRow].materialName
      : "";

  const matchingProducts = useMemo(() => {
    if (activeAutocompleteRow === null) return [];
    const q = normalizeForSearch(currentQuery);
    if (!q) {
      return catalogProducts.slice(0, 8);
    }
    const matches: ProductItem[] = [];
    for (const p of catalogProducts) {
      const nameMatch = normalizeForSearch(p.name).includes(q);
      const codeMatch = p.code ? normalizeForSearch(p.code).includes(q) : false;
      const catMatch = p.category ? normalizeForSearch(p.category).includes(q) : false;
      if (nameMatch || codeMatch || catMatch) {
        matches.push(p);
        if (matches.length >= 10) break;
      }
    }
    return matches;
  }, [catalogProducts, activeAutocompleteRow, currentQuery]);

  // Categories for Catalog Modal
  const catalogCategories = useMemo(() => {
    const set = new Set<string>();
    catalogProducts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [catalogProducts]);

  // Filtered Products in Catalog Modal (capped at 100 for instant UI rendering)
  const filteredCatalogList = useMemo(() => {
    const q = normalizeForSearch(catalogSearch);
    const matches: ProductItem[] = [];
    for (const p of catalogProducts) {
      if (selectedCatalogCategory !== "all" && p.category !== selectedCatalogCategory) {
        continue;
      }
      if (!q) {
        matches.push(p);
        if (matches.length >= 100) break;
        continue;
      }
      const nameMatch = normalizeForSearch(p.name).includes(q);
      const codeMatch = p.code ? normalizeForSearch(p.code).includes(q) : false;
      const catMatch = p.category ? normalizeForSearch(p.category).includes(q) : false;
      if (nameMatch || codeMatch || catMatch) {
        matches.push(p);
        if (matches.length >= 100) break;
      }
    }
    return matches;
  }, [catalogProducts, catalogSearch, selectedCatalogCategory]);

  // Load saved quote and company info from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fiyat_teklifi_data_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rows && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          let initialRows = parsed.rows;
          // If previous saved list had 10 rows and trailing rows are empty, reduce to 5
          if (initialRows.length === 10) {
            const hasDataPast5 = initialRows.slice(5).some(
              (r: any) => (r.materialName && r.materialName.trim() !== "") || (r.quantity && Number(r.quantity) > 0)
            );
            if (!hasDataPast5) {
              initialRows = initialRows.slice(0, 5);
            }
          }
          setRows(initialRows);
        }
        if (parsed.quoteDate) setQuoteDate(parsed.quoteDate);
        if (parsed.vatNote !== undefined) setVatNote(parsed.vatNote);
        if (parsed.customerName !== undefined)
          setCustomerName(parsed.customerName.toLocaleUpperCase("tr-TR"));
        if (parsed.formTitle) setFormTitle(parsed.formTitle);
        if (parsed.notes) setNotes(parsed.notes);
        if (parsed.preparedBy) setPreparedBy(parsed.preparedBy);
        if (parsed.vatRate !== undefined) setVatRate(parsed.vatRate);
        if (parsed.companyInfo) {
          setCompanyInfo((prev) => ({
            ...prev,
            ...parsed.companyInfo,
            // Ensure newly configured company name and address are preserved over old demo cache
            name:
              parsed.companyInfo.name &&
                !parsed.companyInfo.name.includes("Adaş") &&
                !parsed.companyInfo.name.includes("Anadolu Yapı & Teknoloji San")
                ? parsed.companyInfo.name.toLocaleUpperCase("tr-TR")
                : "İSTANBUL ANADOLU GIDA YAPI TEKNOLOJİ SANAYİ VE TİCARET ANONİM ŞİRKETİ",
            address:
              parsed.companyInfo.address &&
                !parsed.companyInfo.address.includes("Havsa") &&
                !parsed.companyInfo.address.includes("Edirne")
                ? parsed.companyInfo.address
                : "Esenevler Mah.Talatpaşa Cad. İkiz Sokak No:2A Dükkan 1 Akyıldız İş Merkezi Ümraniye İstanbul Türkiye",
            phone:
              parsed.companyInfo.phone && !parsed.companyInfo.phone.includes("0284")
                ? parsed.companyInfo.phone
                : "(0216) 316 37 44",
            logoUrl: "/logo.jpg",
          }));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    try {
      const data = {
        rows,
        quoteDate,
        vatNote,
        customerName,
        formTitle,
        notes,
        preparedBy,
        vatRate,
        companyInfo,
      };
      localStorage.setItem("fiyat_teklifi_data_v2", JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [rows, quoteDate, vatNote, customerName, formTitle, notes, preparedBy, vatRate, companyInfo]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Row update handlers
  const handleUpdateRow = (
    index: number,
    field: keyof QuoteItem,
    value: any
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      // Auto calculate total
      const qty = typeof row.quantity === "number" ? row.quantity : parseFloat(String(row.quantity)) || 0;
      const price = typeof row.unitPrice === "number" ? row.unitPrice : parseFloat(String(row.unitPrice)) || 0;
      row.total = Math.round(qty * price * 100) / 100;

      updated[index] = row;
      return updated;
    });
  };

  // Add 1 or multiple rows
  const handleAddRows = (count: number = 1) => {
    setRows((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => createEmptyRow()),
    ]);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        return [createEmptyRow()];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Duplicate row
  const handleDuplicateRow = (index: number) => {
    setRows((prev) => {
      const target = prev[index];
      const clone: QuoteItem = {
        ...target,
        id: Math.random().toString(36).substring(2, 9),
      };
      const updated = [...prev];
      updated.splice(index + 1, 0, clone);
      return updated;
    });
  };

  // Remove empty rows
  const handleClearEmptyRows = () => {
    const filled = rows.filter(
      (r) =>
        r.materialName.trim() !== "" ||
        (typeof r.quantity === "number" && r.quantity > 0) ||
        (typeof r.unitPrice === "number" && r.unitPrice > 0)
    );
    if (filled.length === 0) {
      setRows(Array.from({ length: 5 }, () => createEmptyRow()));
    } else {
      setRows(filled);
    }
    showToast("Boş satırlar temizlendi.");
  };

  // Select single product from autocomplete or catalog
  const handleSelectProduct = (index: number, product: ProductItem) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index] };
      row.productId = product.id;
      row.materialName = product.name;
      row.unit = product.unit || "Adet";
      row.unitPrice = product.unitPrice;
      const qty = typeof row.quantity === "number" ? row.quantity : parseFloat(String(row.quantity)) || 0;
      row.total = Math.round(qty * product.unitPrice * 100) / 100;
      updated[index] = row;
      return updated;
    });
    setActiveAutocompleteRow(null);
    showToast(`"${product.name}" teklife aktarıldı (${formatCurrency(product.unitPrice)})`);
  };

  // Add multiple products from catalog modal
  const handleAddProductsFromModal = (items: ProductItem[]) => {
    if (items.length === 0) return;

    setRows((prev) => {
      const updated = [...prev];
      // Find empty rows (materialName is empty, quantity is empty/0)
      const emptyRowIndices: number[] = [];
      updated.forEach((r, i) => {
        if (r.materialName.trim() === "" && (r.quantity === "" || r.quantity === 0)) {
          emptyRowIndices.push(i);
        }
      });

      items.forEach((item) => {
        if (emptyRowIndices.length > 0) {
          const targetIdx = emptyRowIndices.shift()!;
          updated[targetIdx] = {
            ...updated[targetIdx],
            productId: item.id,
            materialName: item.name,
            unit: item.unit || "Adet",
            unitPrice: item.unitPrice,
            total: 0,
          };
        } else {
          // Append new row
          updated.push({
            id: Math.random().toString(36).substring(2, 9),
            productId: item.id,
            materialName: item.name,
            quantity: "",
            unit: item.unit || "Adet",
            unitPrice: item.unitPrice,
            total: 0,
          });
        }
      });

      return updated;
    });

    setCatalogPickerOpen(false);
    setSelectedCatalogIds([]);
    showToast(`${items.length} ürün teklife eklendi.`);
  };

  // Reset all
  const handleReset = () => {
    if (confirm("Fiyat teklifini sıfırlamak istediğinize emin misiniz?")) {
      setRows(Array.from({ length: 5 }, () => createEmptyRow()));
      setCustomerName("");
      setSelectedCustomerId(null);
      setEditingProposalId(null);
      setProposalNumber("");
      setProposalStatus("draft");
      setQuoteDate(getTodayStr());
      localStorage.removeItem("fiyat_teklifi_data_v2");
      if (onClearEditingProposal) onClearEditingProposal();
      showToast("Teklif formu sıfırlandı.");
    }
  };

  // Load Sample
  const handleLoadSample = () => {
    setRows(SAMPLE_ITEMS);
    setCustomerName("ÖZDEMİR İNŞAAT VE TAAHHÜT A.Ş.");
    setQuoteDate(getTodayStr());
    showToast("Örnek müşteri ve malzeme teklifi yüklendi.");
  };

  // Enter / Tab key on last row adds a new row
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (rowIndex === rows.length - 1) {
        handleAddRows(1);
      }
    }
  };

  // Calculations
  const subtotal = rows.reduce((acc, r) => acc + (r.total || 0), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  // Save or Update Proposal in Supabase (proposals & proposal_items)
  const handleSaveToSupabase = async () => {
    if (isViewer) {
      showToast("Yetki Uyarısı: İzleyici rolü yeni teklif kaydedemez veya düzenleyemez.");
      return;
    }

    const activeRows = rows.filter(
      (r) =>
        (r.materialName && r.materialName.trim() !== "") ||
        (typeof r.quantity === "number" && r.quantity > 0)
    );

    if (activeRows.length === 0 && !customerName.trim()) {
      showToast("Lütfen kaydetmeden önce müşteri adı veya en az bir ürün giriniz.");
      return;
    }

    setIsSavingToSupabase(true);
    try {
      const itemsPayload = activeRows.map((r) => {
        let pId = r.productId ? Number(r.productId) : null;
        if (!pId && r.materialName.trim()) {
          const matched = catalogProducts.find(
            (cp) => normalizeForSearch(cp.name) === normalizeForSearch(r.materialName)
          );
          if (matched && matched.id) {
            pId = Number(matched.id) || null;
          }
        }
        return {
          product_id: pId,
          quantity: typeof r.quantity === "number" ? r.quantity : parseFloat(String(r.quantity)) || 1,
          unit_price: typeof r.unitPrice === "number" ? r.unitPrice : parseFloat(String(r.unitPrice)) || 0,
        };
      });

      const customItemsMeta = activeRows.map((r) => ({
        materialName: r.materialName,
        unit: r.unit,
      }));

      const metadata = {
        notes,
        vatRate,
        vatNote,
        formTitle,
        preparedBy,
        quoteDate,
        customerName: customerName.trim(),
        customItems: customItemsMeta,
      };

      const payload = {
        id: editingProposalId || undefined,
        customer_id: selectedCustomerId,
        proposal_number: proposalNumber.trim() || undefined,
        status: proposalStatus,
        total_amount: grandTotal,
        items: itemsPayload,
        metadata,
      };

      const method = editingProposalId ? "PUT" : "POST";
      const res = await fetch("/api/proposals", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.proposal) {
          if (!editingProposalId && data.proposal.id) {
            setEditingProposalId(data.proposal.id);
          }
          if (data.proposal.proposal_number) {
            setProposalNumber(data.proposal.proposal_number);
          }
          showToast(
            editingProposalId
              ? `Teklif (${data.proposal.proposal_number}) başarıyla güncellendi!`
              : `Teklif (${data.proposal.proposal_number}) kaydedildi!`
          );
        } else {
          showToast(`Kayıt hatası: ${data.error || "İşlem başarısız"}`);
        }
      } else {
        const err = await res.json();
        showToast(`Kayıt hatası: ${err.error || "Sunucu hatası"}`);
      }
    } catch (err: any) {
      showToast(`Hata: ${err.message}`);
    } finally {
      setIsSavingToSupabase(false);
    }
  };

  // Keep latest save handler in ref for global keyboard shortcuts
  const handleSaveRef = useRef(handleSaveToSupabase);
  useEffect(() => {
    handleSaveRef.current = handleSaveToSupabase;
  });

  // Global Keyboard Shortcut: F2 to save proposal (and Ctrl+S / Cmd+S support)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Check for F2 or Ctrl+S / Cmd+S
      if (
        e.key === "F2" ||
        e.code === "F2" ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleSaveRef.current();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  // WhatsApp Proposal Data preparation
  const currentWhatsAppProposalData: WhatsAppProposalData = useMemo(() => {
    const validRows = rows.filter(
      (r) =>
        (r.materialName && r.materialName.trim() !== "") ||
        (typeof r.quantity === "number" && r.quantity > 0)
    );

    return {
      proposalNumber: proposalNumber.trim() || undefined,
      quoteDate: quoteDate,
      customerName: customerName.trim() || undefined,
      preparedBy: preparedBy.trim() || undefined,
      companyName: companyInfo.name.trim() || undefined,
      items: validRows.map((r) => ({
        materialName: r.materialName,
        quantity: r.quantity,
        unit: r.unit,
        unitPrice: r.unitPrice,
        total: r.total,
      })),
      subtotal,
      vatRate,
      vatAmount,
      grandTotal,
      notes: notes.trim() || undefined,
    };
  }, [
    rows,
    proposalNumber,
    quoteDate,
    customerName,
    preparedBy,
    companyInfo.name,
    subtotal,
    vatRate,
    vatAmount,
    grandTotal,
    notes,
  ]);

  const handleOpenWhatsAppShare = () => {
    const activeRows = rows.filter(
      (r) =>
        (r.materialName && r.materialName.trim() !== "") ||
        (typeof r.quantity === "number" && r.quantity > 0)
    );

    if (activeRows.length === 0 && !customerName.trim()) {
      showToast("Lütfen WhatsApp ile paylaşmadan önce müşteri adı veya en az bir ürün giriniz.");
      return;
    }

    setWhatsappModalOpen(true);
  };

  // Share PDF via WhatsApp
  const handleSharePdfViaWhatsApp = async (
    recipientPhone: string,
    messageText: string
  ) => {
    const quoteElement = document.getElementById("printable-quote");
    if (!quoteElement) {
      showToast("Teklif formu bulunamadı.");
      return;
    }

    const safeCustomer = (customerName.trim() || "Musteri_Teklif")
      .replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")
      .substring(0, 35);
    const safeDate = quoteDate.replace(/\./g, "-");
    const fileName = `Teklif_${safeCustomer}_${safeDate}.pdf`;

    setIsGeneratingPdf(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));

      const { blob } = await renderElementToPdf(quoteElement);

      const result = await sharePdfViaWhatsApp({
        pdfBlob: blob,
        fileName,
        phoneNumber: recipientPhone,
        messageText,
      });

      if (result.sharedViaNative) {
        showToast("Teklif PDF'i WhatsApp ile paylaşıldı.");
      } else {
        showToast("PDF indirildi ve WhatsApp Web açıldı. Belgeyi sohbete ekleyebilirsiniz.");
      }

      return result;
    } catch (err: unknown) {
      console.error("PDF share error:", err);
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      alert("PDF paylaşılırken hata oluştu: " + msg);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // Direct PDF Download (High-resolution native print replica without lab() color parsing issues)
  const handleDownloadPdf = async () => {
    const quoteElement = document.getElementById("printable-quote");
    if (!quoteElement) {
      alert("Teklif formu bulunamadı.");
      return;
    }

    try {
      setIsGeneratingPdf(true);

      // Give React one tick to apply .pdf-export-mode (hiding inputs, showing print-only blocks)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Native browser rasterizer - 100% compatible with Tailwind v4, lab(), oklab(), and custom fonts
      const dataUrl = await htmlToImage.toPng(quoteElement, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: false,
      });

      // Load image to determine exact dimensions
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
        // Fits nicely on 1 single page with slight scale
        const scaleFactor = pdfHeight / imgHeight;
        const scaledWidth = imgWidth * scaleFactor;
        const xOffset = (pdfWidth - scaledWidth) / 2;
        pdf.addImage(dataUrl, "PNG", xOffset, 0, scaledWidth, pdfHeight);
      } else {
        // Multi-page document
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

      const safeCustomer = (customerName.trim() || "Musteri_Teklif")
        .replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")
        .substring(0, 35);
      const safeDate = quoteDate.replace(/\./g, "-");
      pdf.save(`Teklif_${safeCustomer}_${safeDate}.pdf`);

      showToast("PDF teklif formu başarıyla indirildi.");
    } catch (err: unknown) {
      console.error("PDF generation error:", err);
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      alert("PDF oluşturulurken bir hata meydana geldi: " + msg);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Export to Excel matching the exact format
  const handleExportExcel = () => {
    try {
      const activeRows = rows.filter(
        (r) =>
          r.materialName.trim() !== "" ||
          (typeof r.quantity === "number" && r.quantity > 0) ||
          (typeof r.unitPrice === "number" && r.unitPrice > 0)
      );
      const rowsToExport = activeRows.length > 0 ? activeRows : rows;

      const wsData: any[][] = [
        [companyInfo.name, "", "", "", "ADRES:", companyInfo.address],
        ["", "", "", "", "TELEFON:", companyInfo.phone],
        [],
        [formTitle, "", "", "", "", ""],
        ["MÜŞTERİ FİRMA ADI", customerName || "-", "", "TEKLİF TARİHİ", quoteDate, ""],
        [vatNote, "", "", "", "", ""],
        ["SIRA", "MALZEME CİNSİ", "MİKTAR", "BİRİM", "BİRİM FİYATI (₺)", "TUTAR (₺)"],
      ];

      rowsToExport.forEach((r, idx) => {
        wsData.push([
          idx + 1,
          r.materialName || "",
          r.quantity !== "" ? r.quantity : "",
          r.unit || "",
          r.unitPrice !== "" ? r.unitPrice : "",
          r.total > 0 ? r.total : "",
        ]);
      });

      // Totals
      wsData.push(["", "", "", "", "Ara Toplam", subtotal]);
      wsData.push(["", "", "", "", `KDV (%${vatRate})`, vatAmount]);
      wsData.push(["", "", "", "", "TOPLAM", grandTotal]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Merges
      ws["!merges"] = [
        { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } }, // Title
        { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } }, // Customer Name
        { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } }, // Date
        { s: { r: 5, c: 0 }, e: { r: 5, c: 5 } }, // Vat note
      ];

      // Col widths
      ws["!cols"] = [
        { wch: 8 },  // SIRA
        { wch: 42 }, // MALZEME CİNSİ
        { wch: 12 }, // MİKTAR
        { wch: 12 }, // BİRİM
        { wch: 18 }, // BİRİM FİYATI
        { wch: 20 }, // TUTAR
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Müşteri Teklif Formu");

      const safeName = (customerName || "Musteri_Teklif_Formu")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 30);
      XLSX.writeFile(wb, `${safeName}_${quoteDate.replace(/\./g, "-")}.xlsx`);
      showToast("Excel dosyası başarıyla indirildi.");
    } catch (err: any) {
      alert("Excel oluşturulurken bir hata oluştu: " + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto pb-16 print:p-0 print:m-0 print:w-full print:max-w-none print:pb-0">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-sm flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Control Actions Bar (Hidden in Print) */}
      <div className="no-print bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold shrink-0">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 sm:gap-2">
              <span>{formTitle}</span>

            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
              Teklif formu oluşturun, müşteri ve tarih alanını doldurup yazdırın.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          {/* Add Rows */}
          <button
            onClick={() => handleAddRows(1)}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            title="Aşağıya 1 yeni satır ekle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Satır Ekle</span>
          </button>
          <button
            onClick={() => handleAddRows(5)}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-colors"
            title="Aşağıya 5 yeni satır ekle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+5</span>
          </button>

          {/* Clean empty rows */}
          <button
            onClick={handleClearEmptyRows}
            className="hidden sm:inline-flex px-3 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-medium border border-slate-200 transition-colors"
            title="Doldurulmamış boş satırları kaldır"
          >
            Boşları Temizle
          </button>

          {/* Catalog Multi-Select Picker */}
          <button
            onClick={() => setCatalogPickerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors shadow-2xs"
            title="Kayıtlı ürün kataloğundan ürün seçip teklife aktar"
          >
            <Package className="w-3.5 h-3.5 text-indigo-600" />
            <span>Katalogdan Ekle</span>
            {catalogProducts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-200/80 text-indigo-800 font-bold">
                {catalogProducts.length}
              </span>
            )}
            {productSource === "supabase" && (
              <span className="hidden sm:inline text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                DB
              </span>
            )}
          </button>

          {/* Sample Data */}
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
            title="Örnek teklif verilerini doldur"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Örnek Doldur</span>
            <span className="sm:hidden">Örnek</span>
          </button>

          {/* Company Settings Toggle */}
          <button
            onClick={() => setShowCompanySettings((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold border transition-colors ${showCompanySettings
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
              }`}
            title="Firma unvanı, adres ve iletişim bilgilerini düzenle"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Firma Bilgileri</span>
            <span className="sm:hidden">Ayarlar</span>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="p-1.5 sm:p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-xs transition-colors border border-slate-200"
            title="Tabloyu Sıfırla"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            title="Excel formatında indir (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Excel</span>
          </button>

          {/* History Button */}
          {onGoToHistory && (
            <button
              onClick={onGoToHistory}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors shadow-2xs"
              title="Daha önce verdiğiniz teklifleri görüntüleyin ve düzenleyin"
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span>Teklif Geçmişi</span>
            </button>
          )}

          {/* Save / Update to Supabase Button (Kısayol: F2) */}
          <button
            onClick={handleSaveToSupabase}
            disabled={isSavingToSupabase}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-98 ${editingProposalId
              ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
              : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
              }`}
            title="Teklifi Bulut veritabanına kaydet (Kısayol: F2 veya Ctrl+S)"
          >
            {isSavingToSupabase ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : editingProposalId ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
            <span>
              {isSavingToSupabase
                ? "Kaydediliyor..."
                : editingProposalId
                  ? "Teklifi Güncelle"
                  : "Kaydet"}
            </span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-white/90 bg-white/20 rounded border border-white/30 ml-0.5">
              F2
            </kbd>
          </button>

          {/* WhatsApp Share Button */}
          <button
            onClick={handleOpenWhatsAppShare}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-98"
            title="Teklifi veya PDF belgesini WhatsApp ile paylaş"
          >
            <svg
              className="w-3.5 h-3.5 fill-current"
              viewBox="0 0 24 24"
            >
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.03C9.36 7.03 9.09 7.1 8.87 7.33C8.65 7.57 8.02 8.16 8.02 9.36C8.02 10.56 8.9 11.71 9.02 11.87C9.14 12.03 10.73 14.5 13.18 15.56C15.22 16.44 15.63 16.26 16.07 16.22C16.52 16.18 17.5 15.63 17.7 15.07C17.91 14.5 17.91 14.02 17.84 13.92C17.78 13.82 17.62 13.76 17.37 13.63C17.12 13.51 15.91 12.92 15.68 12.83C15.46 12.75 15.3 12.71 15.13 12.95C14.97 13.2 14.51 13.76 14.37 13.92C14.23 14.08 14.1 14.1 13.85 13.97C13.6 13.85 12.81 13.59 11.87 12.75C11.14 12.1 10.65 11.29 10.51 11.05C10.37 10.8 10.5 10.67 10.62 10.54C10.73 10.43 10.87 10.25 11 10.1C11.12 9.94 11.17 9.82 11.25 9.66C11.33 9.49 11.29 9.35 11.23 9.22C11.17 9.1 10.68 7.9 10.47 7.41C10.27 6.93 10.07 7 9.92 6.99C9.78 6.99 9.61 7.03 9.53 7.03Z"/>
            </svg>
            <span>WhatsApp</span>
            <span className="hidden sm:inline-block px-1 py-0.2 text-[9px] font-bold bg-white/25 rounded border border-white/30 text-white">
              PDF
            </span>
          </button>


          {/* Download PDF Button */}
          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all disabled:opacity-75 disabled:cursor-wait"
            title="Teklifi PDF olarak indir (.pdf)"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-white" />
            ) : (
              <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            )}
            <span>{isGeneratingPdf ? "PDF İndiriliyor..." : "PDF İndir"}</span>
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/20 transition-all"
            title="Teklifi A4 formatında yazdır veya tarayıcıdan kaydet"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            <span>Yazdır</span>
          </button>
        </div>
      </div>

      {/* Editing proposal banner */}
      {editingProposalId && (
        <div className="no-print bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-emerald-900">
              Kayıtlı Teklif Düzenleniyor:
            </span>
            <span className="font-mono font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
              {proposalNumber || `#${editingProposalId}`}
            </span>
            <span className="text-emerald-700 text-[11px]">
              (Değişikliklerinizi &quot;Teklifi Güncelle&quot; butonuna basarak kaydedebilirsiniz)
            </span>
          </div>
          <button
            onClick={() => {
              setEditingProposalId(null);
              setProposalNumber("");
              setCustomerName("");
              setSelectedCustomerId(null);
              setRows(Array.from({ length: 5 }, () => createEmptyRow()));
              if (onClearEditingProposal) onClearEditingProposal();
            }}
            className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 underline"
          >
            Yeni Teklife Geç →
          </button>
        </div>
      )}

      {/* Optional Company Details Panel (Hidden in Print, editable for customization) */}
      {showCompanySettings && (
        <div className="no-print bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 text-xs flex flex-col gap-3 animate-in fade-in">
          <div className="font-bold text-slate-800 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <span>Teklifi Veren Firma Bilgileri (Üst Başlık)</span>
            </span>
            <span className="text-[11px] font-normal text-slate-500 hidden sm:inline">
              Logo: <code className="bg-white px-1.5 py-0.5 rounded border text-blue-700 font-mono">app/logo.jpg</code>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-600 font-semibold mb-1">Firma Ticari Unvanı:</label>
              <textarea
                rows={2}
                value={companyInfo.name}
                onChange={(e) =>
                  setCompanyInfo({
                    ...companyInfo,
                    name: e.target.value.toLocaleUpperCase("tr-TR"),
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none overflow-hidden text-xs leading-snug uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> Adres:
              </label>
              <textarea
                rows={2}
                value={companyInfo.address}
                onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none overflow-hidden text-xs leading-snug"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" /> Telefon:
                </label>
                <input
                  type="text"
                  value={companyInfo.phone}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1">
                  <Percent className="w-3 h-3 text-slate-400" /> KDV Oranı:
                </label>
                <select
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={20}>%20 (Standart KDV)</option>
                  <option value={10}>%10 KDV</option>
                  <option value={1}>%1 KDV</option>
                  <option value={0}>%0 (KDV Muaf / Hariç)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* THE OFFICIAL PRICE QUOTATION SHEET (EXACT SCREENSHOT LAYOUT & PRINT READY) */}
      {/* ========================================================================= */}
      <div
        id="printable-quote"
        className={`bg-white rounded-2xl shadow-sm border border-slate-300 p-4 sm:p-8 w-full print:p-0 print:border-none print:shadow-none print:rounded-none ${isGeneratingPdf ? "pdf-export-mode" : ""
          }`}
      >
        {/* 1. TOP HEADER: LOGO ON LEFT (app/logo.jpg) & CONTACT INFO ON RIGHT (EXACT MATCH, NEVER WRAPS VERTICALLY IN PRINT) */}
        <div className="w-full flex flex-col sm:flex-row print:flex-row justify-between items-start gap-4 pb-3 border-b-2 border-black print:pb-2">
          {/* Left: Logo & Company Name */}
          <div className="flex flex-col items-start gap-1 w-full sm:max-w-[55%] print:max-w-[55%]">
            <div className="h-16 sm:h-20 max-w-[320px] flex items-center mb-0.5 print:h-14 print:max-w-[260px]">
              <img
                src={companyInfo.logoUrl}
                alt={companyInfo.name}
                className="max-h-full w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
            <div className="w-full text-xs font-bold text-slate-900 leading-snug">
              <textarea
                rows={2}
                value={companyInfo.name}
                onChange={(e) =>
                  setCompanyInfo({
                    ...companyInfo,
                    name: e.target.value.toLocaleUpperCase("tr-TR"),
                  })
                }
                className="w-full bg-transparent border-none focus:outline-none font-bold text-slate-900 resize-none overflow-hidden leading-tight text-xs print:hidden uppercase"
                placeholder="FİRMA TİCARİ UNVANI"
              />
              <div className="hidden print:block font-bold text-slate-900 text-xs leading-tight uppercase">
                {companyInfo.name}
              </div>
            </div>
          </div>

          {/* Right: Address & Contact info (NO GAP BETWEEN ADDRESS AND PHONE) */}
          <div className="text-xs text-slate-900 font-sans w-full sm:w-[42%] print:w-[42%] max-w-md shrink-0 flex flex-col justify-start">
            {/* ADRES */}
            <div className="flex items-start gap-1.5 leading-tight">
              <span className="font-bold tracking-wider w-16 text-left select-none shrink-0 pt-0.5">ADRES</span>
              <span className="font-bold shrink-0 pt-0.5">:</span>
              <div className="text-slate-800 font-medium text-left flex-1 min-w-0">
                <textarea
                  rows={2}
                  value={companyInfo.address}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                  className="w-full bg-transparent border-none focus:outline-none text-slate-800 resize-none overflow-hidden leading-tight text-xs p-0 m-0 print:hidden"
                  placeholder="Firma adresi"
                />
                <div className="hidden print:block text-slate-800 font-medium text-xs leading-tight">
                  {companyInfo.address}
                </div>
              </div>
            </div>

            {/* TELEFON - IMMEDIATELY UNDER ADRES WITHOUT GAP */}
            <div className="flex items-center gap-1.5 leading-tight mt-0.5">
              <span className="font-bold tracking-wider w-16 text-left select-none shrink-0">TELEFON</span>
              <span className="font-bold shrink-0">:</span>
              <div className="text-slate-800 font-medium text-left flex-1 min-w-0">
                <input
                  type="text"
                  value={companyInfo.phone}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                  className="w-full bg-transparent border-none focus:outline-none text-slate-800 text-xs font-semibold p-0 m-0 print:hidden"
                  placeholder="Telefon"
                />
                <div className="hidden print:block text-slate-800 font-semibold text-xs leading-tight">
                  {companyInfo.phone}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. FORM TITLE (EXACT MATCH: Centered Bold Uppercase) */}
        <div className="w-full my-4 text-center print:my-2">
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full text-center bg-transparent border-none focus:outline-none font-black text-slate-950 text-base sm:text-lg tracking-wider uppercase select-none print:hidden"
            placeholder="MÜŞTERİ TEKLİF VE SİPARİŞ FORMU"
          />
          <div className="hidden print:block text-center font-black text-slate-950 text-base tracking-wider uppercase">
            {formTitle}
          </div>
        </div>

        {/* 3. CUSTOMER META TABLE (ONLY CUSTOMER COMPANY NAME AND DATE AS REQUESTED!) */}
        <div className="w-full mb-2 print:mb-1.5 overflow-x-auto no-scrollbar print:overflow-visible">
          <table className="w-full border-collapse border-2 border-black text-xs font-semibold table-fixed min-w-[500px] print:min-w-0">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "46%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td
                  className="border border-black py-2 px-2.5 bg-slate-100 font-extrabold uppercase text-slate-900 select-none text-xs"
                  style={{
                    backgroundColor: "#f8fafc",
                    WebkitPrintColorAdjust: "exact",
                    printColorAdjust: "exact",
                  }}
                >
                  MÜŞTERİ FİRMA ADI
                </td>
                <td className="border border-black py-1.5 px-2.5 font-bold text-slate-950 text-xs relative">
                  <div className="flex items-start gap-1">
                    <div className="relative flex-1">
                      <textarea
                        rows={1}
                        value={customerName}
                        onFocus={() => setCustomerDropdownOpen(true)}
                        onChange={(e) => {
                          setCustomerName(e.target.value.toLocaleUpperCase("tr-TR"));
                          setCustomerDropdownOpen(true);
                        }}
                        placeholder="MÜŞTERİ FİRMA ADINI GİRİNİZ VEYA LİSTEDEN SEÇİNİZ..."
                        className="w-full bg-transparent border-none focus:outline-none font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-300 resize-none overflow-hidden leading-snug print:hidden uppercase"
                      />
                      {/* Customer Autocomplete Dropdown */}
                      {customerDropdownOpen && matchingCustomers.length > 0 && (
                        <div
                          className="absolute left-0 top-full mt-1 w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden divide-y divide-slate-100 no-print"
                        >
                          <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Kayıtlı Müşteriler</span>
                            <span>{matchingCustomers.length} Eşleşme</span>
                          </div>
                          {matchingCustomers.map((cust) => (
                            <div
                              key={cust.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectCustomer(cust);
                              }}
                              className="px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{cust.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">#{cust.id}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Choose customer modal trigger button */}
                    <button
                      type="button"
                      onClick={() => setCustomerSearchModalOpen(true)}
                      className="no-print p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded shrink-0 transition-colors"
                      title="Kayıtlı Müşteri Listesinden Seç"
                    >
                      <Users className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="hidden print:block font-bold text-slate-950 text-xs leading-snug uppercase">
                    {customerName || "-"}
                  </div>
                </td>
                <td
                  className="border border-black py-2 px-2 bg-slate-100 font-extrabold uppercase text-slate-900 select-none text-center text-xs"
                  style={{
                    backgroundColor: "#f8fafc",
                    WebkitPrintColorAdjust: "exact",
                    printColorAdjust: "exact",
                  }}
                >
                  TEKLİF TARİHİ
                </td>
                <td className="border border-black py-1.5 px-2 font-bold text-slate-950 text-xs">
                  <div className="flex items-center justify-between print:hidden">
                    <input
                      type="text"
                      value={quoteDate}
                      onChange={(e) => setQuoteDate(e.target.value)}
                      placeholder="GG.AA.YYYY"
                      className="w-full bg-transparent border-none focus:outline-none font-bold text-slate-900 text-left"
                    />
                    <span className="no-print text-[10px] text-slate-400 font-normal italic ml-1 shrink-0">
                      (Bugün)
                    </span>
                  </div>
                  <div className="hidden print:block font-bold text-slate-950 text-center text-xs">
                    {quoteDate}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 4. KDV DAHİL DEĞİLDİR NOTE */}
        <div className="w-full py-1 px-2.5 mb-2 border border-slate-300 rounded text-xs italic text-slate-800 bg-slate-50/50 print:bg-transparent print:border-none print:px-0 print:py-0 print:mb-1">
          <input
            type="text"
            value={vatNote}
            onChange={(e) => setVatNote(e.target.value)}
            className="w-full bg-transparent border-none focus:outline-none italic text-slate-800 print:hidden"
            placeholder="Birim fiyatlara KDV dahil değildir."
          />
          <div className="hidden print:block italic text-slate-800 text-xs">
            {vatNote}
          </div>
        </div>

        {/* 5. MAIN QUOTATION TABLE (EXACT MATCH & FIXED COLUMNS FOR ZERO PRINT DRIFT) */}
        <div className="sm:hidden no-print text-[11px] text-slate-400 italic mb-1 flex items-center justify-between">
          <span>⟵ Sağa kaydırarak tabloyu doldurabilirsiniz ⟶</span>
        </div>
        <div className="w-full overflow-x-auto no-scrollbar sm:overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse border-2 border-black text-xs text-slate-900 table-fixed min-w-[580px] print:min-w-0">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "45%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
              <col className="no-print" style={{ width: "48px" }} />
            </colgroup>
            <thead>
              <tr
                className="text-white text-xs uppercase tracking-wide font-bold select-none h-8 print:h-7"
                style={{
                  backgroundColor: "#1b365d",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                <th className="border border-black py-1.5 px-1 text-center">SIRA</th>
                <th className="border border-black py-1.5 px-3 text-left">MALZEME CİNSİ</th>
                <th className="border border-black py-1.5 px-2 text-right">MİKTAR</th>
                <th className="border border-black py-1.5 px-1 text-center">BİRİM</th>
                <th className="border border-black py-1.5 px-2 text-right">BİRİM FİYATI (₺)</th>
                <th className="border border-black py-1.5 px-2 text-right">TUTAR (₺)</th>
                <th className="no-print border border-black py-1.5 px-1 text-center">İŞLEM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className="hover:bg-blue-50/40 transition-colors group h-8 print:h-7"
                >
                  {/* SIRA */}
                  <td className="border border-black py-1 px-1 text-center font-bold text-slate-700 bg-slate-50/50 print:bg-transparent">
                    {idx + 1}
                  </td>

                  {/* MALZEME CİNSİ */}
                  <td className="border border-black py-1 px-2 relative">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={row.materialName}
                        onChange={(e) => {
                          handleUpdateRow(idx, "materialName", e.target.value);
                          setActiveAutocompleteRow(idx);
                        }}
                        onFocus={() => setActiveAutocompleteRow(idx)}
                        onBlur={() => setTimeout(() => setActiveAutocompleteRow(null), 250)}
                        placeholder={idx === 0 ? "Malzeme adını yazın (Katalogdan otomatik tamamlanır)..." : ""}
                        className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 font-medium text-slate-900 placeholder:text-slate-300 print:hidden text-xs pr-5"
                      />
                      {catalogProducts.length > 0 && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setActiveAutocompleteRow(activeAutocompleteRow === idx ? null : idx);
                          }}
                          title="Ürün kataloğundan seç"
                          className="no-print absolute right-0.5 text-slate-300 hover:text-blue-600 p-0.5 rounded transition-colors"
                        >
                          <Package className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="hidden print:block font-medium text-slate-950 text-xs truncate">
                      {row.materialName || "\u00A0"}
                    </div>

                    {/* Autocomplete Dropdown */}
                    {activeAutocompleteRow === idx && (
                      <div className="no-print absolute left-0 top-full mt-1 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-1.5 text-xs text-left max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                        <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1">
                          <span>Kayıtlı Ürünler ({matchingProducts.length})</span>
                          <span className="text-blue-600 font-medium lowercase">Tıkla ve doldur</span>
                        </div>
                        {matchingProducts.length === 0 ? (
                          <div className="py-3 px-2 text-center text-slate-400 text-xs">
                            <p>Eşleşen ürün bulunamadı.</p>
                            {onGoToProducts && (
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  onGoToProducts();
                                }}
                                className="mt-1 text-[11px] text-blue-600 hover:underline font-semibold"
                              >
                                Ürün Yönetimine Git →
                              </button>
                            )}
                          </div>
                        ) : (
                          matchingProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectProduct(idx, p);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-50/90 flex items-center justify-between gap-2 transition-colors group cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                                  {p.name}
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                  {p.code && (
                                    <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">
                                      {p.code}
                                    </span>
                                  )}
                                  {p.category && <span>{p.category}</span>}
                                  <span className="font-medium text-blue-600">• {p.unit}</span>
                                </div>
                              </div>
                              <div className="shrink-0 text-right font-mono font-bold text-slate-900 group-hover:text-blue-700">
                                {formatCurrency(p.unitPrice)}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </td>

                  {/* MİKTAR */}
                  <td className="border border-black py-1 px-2 text-right">
                    <QuantityCell
                      value={row.quantity}
                      onChange={(newQty) => handleUpdateRow(idx, "quantity", newQty)}
                    />
                  </td>

                  {/* BİRİM */}
                  <td className="border border-black py-1 px-1 text-center">
                    <input
                      type="text"
                      list={`units-list-${idx}`}
                      value={row.unit}
                      onChange={(e) => handleUpdateRow(idx, "unit", e.target.value)}
                      className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 text-center text-slate-800 print:hidden text-xs"
                      placeholder="Adet"
                    />
                    <datalist id={`units-list-${idx}`}>
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                    <div className="hidden print:block text-slate-800 text-xs text-center">
                      {row.materialName ? row.unit : "\u00A0"}
                    </div>
                  </td>

                  {/* BİRİM FİYATI (₺) */}
                  <td className="border border-black py-1 px-2 text-right">
                    <input
                      type="number"
                      step="any"
                      value={row.unitPrice}
                      onChange={(e) =>
                        handleUpdateRow(
                          idx,
                          "unitPrice",
                          e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "unitPrice")}
                      className="w-full bg-transparent border-none focus:outline-none focus:bg-blue-50/50 rounded px-1 py-0.5 text-right font-mono font-medium text-slate-900 print:hidden text-xs"
                      placeholder="0,00"
                    />
                    <div className="hidden print:block font-mono font-medium text-slate-950 text-xs text-right">
                      {typeof row.unitPrice === "number" && row.unitPrice > 0
                        ? new Intl.NumberFormat("tr-TR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(row.unitPrice)
                        : "\u00A0"}
                    </div>
                  </td>

                  {/* TUTAR (₺) */}
                  <td className="border border-black py-1 px-2.5 text-right font-mono font-bold text-slate-900 bg-slate-50/30 print:bg-transparent">
                    {row.total > 0
                      ? new Intl.NumberFormat("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(row.total) + " ₺"
                      : "-"}
                  </td>

                  {/* İŞLEM (Hidden on print) */}
                  <td className="no-print border border-black py-1 px-1 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDuplicateRow(idx)}
                        className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-blue-50"
                        title="Satırı çoğalt"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                        title="Satırı sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* 6. SUMMARY FOOTER (EXACT MATCH: Ara Toplam, KDV, TOPLAM) */}
              <tr>
                <td
                  colSpan={4}
                  rowSpan={3}
                  className="border border-black p-2.5 align-top bg-slate-50/20 print:bg-transparent"
                >
                  <div className="flex flex-col gap-1 text-xs text-slate-600">
                    <div className="font-semibold text-slate-800">Teklif Açıklaması & Koşullar:</div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full bg-transparent border-none focus:outline-none resize-none text-[11px] text-slate-700 leading-snug font-sans print:hidden"
                      placeholder="Teklif şartları, teslim süresi, garanti vb..."
                    />
                    <div className="hidden print:block text-[11px] text-slate-700 whitespace-pre-line leading-tight">
                      {notes}
                    </div>
                    {grandTotal > 0 && (
                      <div className="mt-1 pt-1.5 border-t border-slate-200 text-slate-800 font-medium text-[11px]">
                        <span className="font-bold text-slate-900">Yazıyla: </span>
                        <span>{numberToTurkishWords(grandTotal)}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="border border-black py-2 px-2.5 text-right font-bold text-slate-800 bg-slate-50 print:bg-transparent text-xs">
                  Ara Toplam
                </td>
                <td className="border border-black py-2 px-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                  {formatCurrency(subtotal)}
                </td>
                <td className="no-print border border-black" />
              </tr>

              <tr>
                <td className="border border-black py-2 px-2.5 text-right font-bold text-slate-800 bg-slate-50 print:bg-transparent text-xs">
                  <div className="flex items-center justify-end gap-1">
                    <span>KDV</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (%{vatRate})
                    </span>
                  </div>
                </td>
                <td className="border border-black py-2 px-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                  {formatCurrency(vatAmount)}
                </td>
                <td className="no-print border border-black" />
              </tr>

              <tr
                style={{
                  backgroundColor: "#f1f5f9",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                <td className="border border-black py-2 px-2.5 text-right font-extrabold text-slate-950 text-xs sm:text-sm">
                  TOPLAM
                </td>
                <td className="border border-black py-2 px-2.5 text-right font-mono font-extrabold text-blue-900 print:text-black text-xs sm:text-sm">
                  {formatCurrency(grandTotal)}
                </td>
                <td className="no-print border border-black" />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quick Add Row helper at bottom of table (Hidden in Print) */}
        <div className="no-print mt-3 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddRows(1)}
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Satır Ekle</span>
            </button>
            <span>•</span>
            <span className="text-slate-400">
              İpucu: Birim Fiyatı kutusundayken <strong>Enter</strong> tuşuna basarak da anında yeni satır açabilirsiniz.
            </span>
          </div>
          <div className="font-medium text-slate-600">
            Toplam <strong>{rows.length}</strong> satır
          </div>
        </div>

        {/* Signature & Approval Block (Visible on Print or preview) */}
        <div className="mt-6 grid grid-cols-2 gap-6 text-center text-xs print:mt-4 print:gap-4">
          <div className="border border-black rounded-lg p-3 h-24 flex flex-col justify-between bg-slate-50/30 print:bg-transparent">
            <div className="font-bold text-slate-800">
              TEKLİFİ HAZIRLAYAN
            </div>
            <div className="text-slate-700 font-medium">
              <input
                type="text"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Yetkili Adı / Kaşe"
                className="w-full text-center bg-transparent border-none focus:outline-none text-slate-800 font-medium print:hidden"
              />
              <div className="hidden print:block text-slate-800 font-medium text-xs">
                {preparedBy || "Yetkili İmza / Kaşe"}
              </div>
            </div>
            <div className="text-[10px] text-slate-500">İmza & Kaşe</div>
          </div>

          <div className="border border-black rounded-lg p-3 h-24 flex flex-col justify-between bg-slate-50/30 print:bg-transparent">
            <div className="font-bold text-slate-800">
              TEKLİFİ ONAYLAYAN / MÜŞTERİ
            </div>
            <div className="text-slate-700 font-medium">
              {customerName ? customerName : "Müşteri Yetkilisi"}
            </div>
            <div className="text-[10px] text-slate-500">Kaşe & İmza</div>
          </div>
        </div>
      </div>

      {/* Catalog Multi-Select Modal */}
      {catalogPickerOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>Katalogdan Teklife Ürün Seç ({catalogProducts.length} Ürün)</span>
                  {productSource === "supabase" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      🟢 Bulut
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      📦 Yerel / İçe Aktarılan
                    </span>
                  )}
                </h3>
              </div>
              <button
                onClick={() => {
                  setCatalogPickerOpen(false);
                  setSelectedCatalogIds([]);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Category Filter */}
            <div className="my-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Ürün adı, kod veya kategori ile ara..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
              </div>

              {catalogCategories.length > 0 && (
                <div className="flex items-center gap-1">
                  <select
                    value={selectedCatalogCategory}
                    onChange={(e) => setSelectedCatalogCategory(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-medium text-slate-700 focus:outline-none"
                  >
                    <option value="all">Tüm Kategoriler ({catalogProducts.length})</option>
                    {catalogCategories.map((c) => (
                      <option key={c} value={c}>
                        {c} ({catalogProducts.filter((p) => p.category === c).length})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {onGoToProducts && (
                <button
                  type="button"
                  onClick={() => {
                    setCatalogPickerOpen(false);
                    onGoToProducts();
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1.5 shrink-0"
                >
                  Ürün Yönetimi →
                </button>
              )}
            </div>

            {/* Product List with checkboxes */}
            <div className="overflow-y-auto max-h-80 border border-slate-200 rounded-xl divide-y divide-slate-100">
              {filteredCatalogList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-slate-600">Aradığınız ürün bulunamadı</p>
                  <p className="text-[11px] mt-0.5">Ürün kataloğunuz boşsa Excel ile ürün ekleyin.</p>
                </div>
              ) : (
                filteredCatalogList.map((p) => {
                  const isSelected = selectedCatalogIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedCatalogIds((prev) =>
                          isSelected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                        );
                      }}
                      className={`p-2.5 sm:p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${isSelected ? "bg-indigo-50/70" : "hover:bg-slate-50"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${isSelected
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-slate-300 bg-white"
                            }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-xs truncate">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2">
                            {p.code && (
                              <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">
                                {p.code}
                              </span>
                            )}
                            {p.category && <span>{p.category}</span>}
                            <span>Birim: {p.unit}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-xs text-slate-900 block">
                          {formatCurrency(p.unitPrice)}
                        </span>
                        <span className="text-[10px] text-slate-500">/{p.unit}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-3">
              <span className="text-xs text-slate-500">
                {selectedCatalogIds.length} ürün seçildi
                {filteredCatalogList.length >= 100 && (
                  <span className="text-[11px] text-amber-600 ml-1">
                    (İlk 100 gösteriliyor, diğerleri için arama yapın)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogPickerOpen(false);
                    setSelectedCatalogIds([]);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={selectedCatalogIds.length === 0}
                  onClick={() => {
                    const selectedItems = catalogProducts.filter((p) =>
                      selectedCatalogIds.includes(p.id)
                    );
                    handleAddProductsFromModal(selectedItems);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 rounded-xl shadow-xs transition-colors"
                >
                  Teklife Ekle ({selectedCatalogIds.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Selection Modal (Supabase customers) */}
      {customerSearchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Müşteri Seç
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Kayıtlı {customers.length} müşteri arasından seçim yapın
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCustomerSearchModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={customerModalSearch}
                  onChange={(e) => setCustomerModalSearch(e.target.value)}
                  placeholder="Firma adı veya kurum ara..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
            </div>

            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100 max-h-96">
              {filteredModalCustomers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <Building className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-slate-600">Aranan müşteri bulunamadı</p>
                </div>
              ) : (
                filteredModalCustomers.map((cust) => {
                  const isSelected = selectedCustomerId === cust.id;
                  return (
                    <div
                      key={cust.id}
                      onClick={() => handleSelectCustomer(cust)}
                      className={`p-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${isSelected ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center shrink-0 text-[10px] font-bold ${isSelected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          {cust.id}
                        </div>
                        <span className="text-xs truncate">{cust.name}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>{filteredModalCustomers.length} müşteri listelendi</span>
              <button
                onClick={() => setCustomerSearchModalOpen(false)}
                className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 font-medium"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Share Modal */}
      <WhatsAppShareModal
        isOpen={whatsappModalOpen}
        onClose={() => setWhatsappModalOpen(false)}
        proposalData={currentWhatsAppProposalData}
        defaultMode="pdf"
        onSharePdf={handleSharePdfViaWhatsApp}
        onDownloadPdfOnly={handleDownloadPdf}
      />
    </div>
  );
}
