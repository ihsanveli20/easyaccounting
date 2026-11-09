import {
  AppMenuId,
  MenuItemDefinition,
  RoleMenuPermissions,
  AppPermissionsConfig,
} from "../types/accounting";

export type { AppPermissionsConfig, RoleMenuPermissions };

export const SYSTEM_MENUS: MenuItemDefinition[] = [
  {
    id: "summary",
    name: "Hesap Planı & Bakiyeler",
    shortName: "Hesap Planı",
    description: "Mizan listesi, bakiye hesapları ve Excel arama",
    category: "accounting",
  },
  {
    id: "details",
    name: "Firma Detay Hareketleri",
    shortName: "Firma Detay",
    description: "Muavin defteri, fiş ve ekstre hareketleri",
    category: "accounting",
  },
  {
    id: "calculator",
    name: "Ayrıntılı Hesap Makinesi",
    shortName: "Hesap Makinesi",
    description: "Fişli muhasebe, KDV & stopaj, tevkifat hesaplama",
    category: "accounting",
  },
  {
    id: "reconciliation",
    name: "Ekstre Karşılaştırma",
    shortName: "Mutabakat",
    description: "PDF banka/firma ekstresi ile Luca mizan mutabakatı",
    category: "accounting",
  },
  {
    id: "invoice-extractor",
    name: "Toplu Fatura → Excel",
    shortName: "Fatura Aktarım",
    description: "XML, PDF ve Fotoğraf faturaları toplu yükleme, görüntüleme ve Excel'e indirme",
    category: "accounting",
  },
  {
    id: "quote",
    name: "Fiyat Teklifi",
    shortName: "Fiyat Teklifi",
    description: "Kurumsal teklif formu hazırlama, iskonto ve yazdırma",
    category: "sales",
  },
  {
    id: "proposal-history",
    name: "Teklif Geçmişi",
    shortName: "Geçmiş Teklifler",
    description: "Kayıtlı teklifleri listeleme, düzenleme ve WhatsApp paylaşımı",
    category: "sales",
  },
  {
    id: "proposal-comparison",
    name: "Fiyat & Tedarikçi Kıyaslama",
    shortName: "Fiyat Kıyaslama",
    description: "Ürün için farklı yerlerden fiyat çekme, en uygun tedarikçi ve piyasa analizi",
    category: "sales",
  },
  {
    id: "stock-tracking",
    name: "Ürün & Stok Yönetimi",
    shortName: "Ürün Yönetimi",
    description: "Excel ürün kataloğu, fiyat listesi ve stok takibi",
    category: "sales",
  },
  {
    id: "kurban-reporting",
    name: "Kurban Raporları",
    shortName: "Kurban Raporları",
    description: "Canlı hayvan alımı, 2 kesimhane, sevk, soğuk depolama, teslimat ve resmî süreç raporları",
    category: "sales",
  },
  {
    id: "admin-users",
    name: "Kullanıcı & Yetki Yönetimi",
    shortName: "Yetki Paneli",
    description: "Kullanıcı rolleri, menü görünürlükleri ve izin yönetimi",
    category: "admin",
  },
];

export const DEFAULT_ROLE_PERMISSIONS: RoleMenuPermissions = {
  admin: [
    "summary",
    "details",
    "calculator",
    "reconciliation",
    "invoice-extractor",
    "quote",
    "proposal-history",
    "proposal-comparison",
    "stock-tracking",
    "kurban-reporting",
    "admin-users",
  ],
  sales: [
    "quote",
    "proposal-history",
    "proposal-comparison",
    "stock-tracking",
    "kurban-reporting",
    "invoice-extractor",
    "details",
    "calculator",
  ],
  viewer: [
    "summary",
    "details",
    "invoice-extractor",
    "proposal-history",
    "proposal-comparison",
    "kurban-reporting",
  ],
  purchasing: [
    "stock-tracking",
    "proposal-comparison",
    "kurban-reporting",
    "invoice-extractor",
    "summary",
    "calculator",
  ],
  user: [
    "summary",
    "details",
    "invoice-extractor",
    "proposal-comparison",
    "kurban-reporting",
    "calculator",
  ],
};

export const DEFAULT_PERMISSIONS_CONFIG: AppPermissionsConfig = {
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  userPermissions: {},
};

const LOCAL_STORAGE_PERMISSIONS_KEY = "easy_accounting_permissions_config_v3";

/**
 * Get permissions configuration from localStorage (fallback)
 */
export function getLocalPermissionsConfig(): AppPermissionsConfig {
  if (typeof window === "undefined") return DEFAULT_PERMISSIONS_CONFIG;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PERMISSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.rolePermissions) {
        return {
          rolePermissions: {
            ...DEFAULT_ROLE_PERMISSIONS,
            ...parsed.rolePermissions,
          },
          userPermissions: parsed.userPermissions || {},
        };
      }
    }
  } catch (err) {
    console.warn("Could not read local permissions:", err);
  }
  return DEFAULT_PERMISSIONS_CONFIG;
}

/**
 * Save permissions configuration to localStorage
 */
export function saveLocalPermissionsConfig(config: AppPermissionsConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PERMISSIONS_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn("Could not save local permissions:", err);
  }
}

/**
 * Compute the final allowed menus for a given user, considering:
 * 1. User-specific custom overrides (if enabled)
 * 2. Role-based menu permissions
 * 3. Admin safety guarantee (admin always has admin-users)
 */
export function resolveUserAllowedMenus(
  userEmail: string | undefined | null,
  userId: string | undefined | null,
  roleName: string,
  config: AppPermissionsConfig,
  isAdmin: boolean
): AppMenuId[] {
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  const normalizedId = (userId || "").trim();

  // 1. Check user-specific custom override
  const userOverride =
    (normalizedEmail && config.userPermissions?.[normalizedEmail]) ||
    (normalizedId && config.userPermissions?.[normalizedId]);

  if (userOverride && userOverride.custom && Array.isArray(userOverride.allowedMenus)) {
    let menus = [...userOverride.allowedMenus];
    // Admin always retains admin-users
    if (isAdmin && !menus.includes("admin-users")) {
      menus.push("admin-users");
    }
    return menus;
  }

  // 2. Fallback to role-based permissions
  const normalizedRole = (roleName || "").trim().toLowerCase();
  const roleMenus =
    config.rolePermissions?.[normalizedRole] ||
    DEFAULT_ROLE_PERMISSIONS[normalizedRole] ||
    DEFAULT_ROLE_PERMISSIONS.user;

  let finalMenus = [...roleMenus];
  if (!finalMenus.includes("invoice-extractor")) {
    finalMenus.push("invoice-extractor");
  }
  if (isAdmin && !finalMenus.includes("admin-users")) {
    finalMenus.push("admin-users");
  }

  return finalMenus;
}
