import { NextResponse, connection } from "next/server";
import {
  SEED_ORGANIZATION,
  SEED_PARTIES,
  SEED_CONTRACT,
  SEED_CUTTING_LOCATIONS,
  SEED_ANIMALS,
  SEED_SHIPMENTS,
  SEED_SLAUGHTER_BATCHES,
  SEED_STORAGE_RECORDS,
  SEED_INVOICES,
  SEED_DELIVERIES,
  SEED_DOCUMENTS,
  SEED_REPORTS,
} from "../../utils/kurbanProcessSeed";
import {
  getSupabaseServerClient,
  isUUID,
  ensureUUID,
  getActiveOrganizationId,
  getActiveLocationId,
  ensureDatabaseReady,
  safeDeleteLocationFromDb,
  loadKurbanPersistentState,
  saveKurbanPersistentState,
  createDefaultPersistentState,
  KurbanPersistentState,
  mapLocationFromDb,
  mapPartyFromDb,
  mapShipmentFromDb,
  mapSlaughterBatchFromDb,
  mapStorageRecordFromDb,
  mapDeliveryFromDb,
  mapInvoiceFromDb,
  mapDocumentFromDb,
  mapReportFromDb,
} from "../../utils/kurbanProcessDb";
import {
  KurbanProcessOrganization,
  KurbanCuttingLocation,
  KurbanParty,
  KurbanShipment,
  KurbanSlaughterBatch,
  KurbanStorageRecord,
  KurbanDelivery,
  KurbanInvoice,
  KurbanDocument,
  KurbanReport,
} from "../../types/kurbanProcess";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

// In-memory fallback cache
let inMemoryStore: KurbanPersistentState = createDefaultPersistentState();
let inMemoryAnimalsCount = SEED_ANIMALS.length;

/**
 * Helper: Build a default 10-section official report for a newly added cutting location
 */
function createReportForLocation(
  loc: KurbanCuttingLocation,
  org: KurbanProcessOrganization,
  index: number
): KurbanReport {
  const reportId = ensureUUID();
  const baseTemplate = SEED_REPORTS[0];
  const sections = (baseTemplate?.sections || []).map((sec, idx) => ({
    ...sec,
    id: ensureUUID(),
    reportId,
    orderIndex: idx + 1,
    contentHtml: (sec.contentHtml || "")
      .replace(/Tuzla Entegre Et Kombinası/g, loc.name)
      .replace(/1\. Kesimhane \(İstanbul Tuzla\)/g, loc.name)
      .replace(/Anadolu Gıda & Perakende A\.Ş\./g, org.clientCompanyName || "Alıcı Kurum"),
  }));

  return {
    id: reportId,
    organizationId: org.id,
    cuttingLocationId: loc.id,
    cuttingLocationName: loc.name,
    reportNo: `KRB-2026-RAP-0${index + 1}`,
    title: `${loc.name} — Kurban Kesim, Depolama ve Teslimat Resmî Denetim Raporu`,
    reportDate: new Date().toISOString().split("T")[0],
    reportPeriod: "2026 Kurban Dönemi",
    preparedBy: loc.responsiblePerson || "Operasyon Denetim Kurulu",
    status: "final_approved",
    clientCompanyName: org.clientCompanyName || "Alıcı Kurum",
    executiveSummary: `${loc.name} (${loc.city}) tesisinde gerçekleştirilen kurban kesim, soğuk hava depolama ve teslimat süreçlerine ilişkin resmî denetim raporu.`,
    evaluationNotes: "Tüm süreçler veteriner hekim kontrolünde ve hijyen standartlarına uygun tamamlanmıştır.",
    finalResultSummary: "Tam Mutabakat • 0 Fire",
    metadata: {},
    sections,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const LEGACY_PARTY_TO_LOCATION_ID: Record<string, string> = {
  "30000000-0000-4000-a000-000000000004": "f4779128-11e4-4593-93de-ff811c1bbfc9",
  "30000000-0000-4000-a000-000000000005": "e289c564-901a-4d76-b631-0e4c6b8f3a21",
};

const LOCATION_TO_LEGACY_PARTY_ID: Record<string, string> = {
  "f4779128-11e4-4593-93de-ff811c1bbfc9": "30000000-0000-4000-a000-000000000004",
  "e289c564-901a-4d76-b631-0e4c6b8f3a21": "30000000-0000-4000-a000-000000000005",
};

/**
 * Derives and synchronizes `state.cuttingLocations` (Kesim Yerleri) directly from
 * `state.parties` where `partyType === "slaughterhouse"` (Firma / Müşteri Bilgileri -> Kesimhane / Mezbaha).
 */
function syncLocationsWithSlaughterhouseParties(state: KurbanPersistentState): KurbanPersistentState {
  const deletedSet = new Set(state.deletedIds || []);
  const existingLocations = state.cuttingLocations || [];

  // Normalize any legacy slaughterhouse party IDs to match their cutting location IDs
  const normalizedParties: KurbanParty[] = [];
  const seenPartyIds = new Set<string>();

  for (const p of state.parties || []) {
    const mappedId = LEGACY_PARTY_TO_LOCATION_ID[p.id] || p.id;
    if (deletedSet.has(p.id) || deletedSet.has(mappedId)) continue;
    if (seenPartyIds.has(mappedId)) continue;
    seenPartyIds.add(mappedId);
    normalizedParties.push({
      ...p,
      id: mappedId,
    });
  }

  state.parties = normalizedParties;

  const slaughterhouseParties = state.parties.filter((p) => p.partyType === "slaughterhouse");

  // Derive cuttingLocations directly from the slaughterhouse parties in Firma / Müşteri Bilgileri
  const derivedLocations: KurbanCuttingLocation[] = slaughterhouseParties.map((p, idx) => {
    const existingLoc =
      existingLocations.find((l) => l.id === p.id) ||
      existingLocations.find(
        (l) => l.name.trim().toLowerCase() === p.name.trim().toLowerCase()
      );

    // Extract approval number from notes if not explicitly set
    const approvalMatch = (p.notes || "").match(/TR-\d{2}-\d+/i);
    const derivedApproval =
      existingLoc?.officialApprovalNo ||
      (approvalMatch ? `${approvalMatch[0].toUpperCase()} (Bakanlık Onaylı)` : p.taxId || "");

    return {
      id: p.id,
      organizationId: p.organizationId || state.organization?.id || SEED_ORGANIZATION.id,
      name: p.name,
      locationCode: existingLoc?.locationCode || `KSM-0${idx + 1}`,
      city: p.city || existingLoc?.city || "İstanbul",
      address: p.address || existingLoc?.address || "",
      responsiblePerson: p.authorizedPerson || existingLoc?.responsiblePerson || "",
      responsiblePhone: p.phone || existingLoc?.responsiblePhone || "",
      officialApprovalNo: derivedApproval,
      veterinaryName: existingLoc?.veterinaryName || p.authorizedPerson || "",
      dailyCapacity: existingLoc?.dailyCapacity || 200,
      allocatedAnimalCount: existingLoc?.allocatedAnimalCount ?? 0,
      notes: p.notes || existingLoc?.notes || "",
      createdAt: existingLoc?.createdAt || p.createdAt || new Date().toISOString(),
    };
  });

  state.cuttingLocations = derivedLocations;

  // Ensure each derived cutting location has a corresponding report, and keep report names synced
  const activeLocIds = new Set(derivedLocations.map((l) => l.id));
  const updatedReports: KurbanReport[] = [];

  for (let i = 0; i < derivedLocations.length; i++) {
    const loc = derivedLocations[i];
    const existingRep = (state.reports || []).find((r) => r.cuttingLocationId === loc.id);
    if (existingRep) {
      updatedReports.push({
        ...existingRep,
        cuttingLocationName: loc.name,
        clientCompanyName: state.organization?.clientCompanyName || existingRep.clientCompanyName,
      });
    } else {
      updatedReports.push(createReportForLocation(loc, state.organization, i));
    }
  }

  // Keep any custom reports only if their location is still active
  for (const rep of state.reports || []) {
    if (
      activeLocIds.has(rep.cuttingLocationId) &&
      !updatedReports.some((ur) => ur.id === rep.id)
    ) {
      updatedReports.push(rep);
    }
  }

  state.reports = updatedReports;
  return state;
}

/**
 * Resolves the authoritative Kurban state by combining the cloud persistent state (`proposals` table)
 * and relational `kurban_*` tables without EVER re-seeding deleted/edited mock data.
 */
async function resolveAuthoritativeState(supabase: any): Promise<{
  state: KurbanPersistentState;
  totalAnimalCount: number;
  source: string;
}> {
  // 1. Load persistent state from Supabase `proposals` table (or /tmp file fallback)
  const persisted = await loadKurbanPersistentState(supabase);

  let totalAnimalCount = inMemoryAnimalsCount;
  if (supabase) {
    try {
      const { count } = await supabase
        .from("kurban_animals")
        .select("id", { count: "exact", head: true });
      if (typeof count === "number" && count > 0) {
        totalAnimalCount = count;
      }
    } catch {
      // ignore
    }
  }

  // If the user has already customized state (saved/edited/deleted any record),
  // `persisted` is the authoritative state and never resurrects deleted mock items!
  if (persisted && persisted.isCustomized) {
    const deletedSet = new Set(persisted.deletedIds || []);
    const cleanState: KurbanPersistentState = syncLocationsWithSlaughterhouseParties({
      ...persisted,
      parties: (persisted.parties || []).filter((p) => !deletedSet.has(p.id)),
      cuttingLocations: (persisted.cuttingLocations || []).filter((l) => !deletedSet.has(l.id)),
      shipments: (persisted.shipments || []).filter((s) => !deletedSet.has(s.id)),
      slaughterBatches: (persisted.slaughterBatches || []).filter((b) => !deletedSet.has(b.id)),
      storageRecords: (persisted.storageRecords || []).filter((st) => !deletedSet.has(st.id)),
      invoices: (persisted.invoices || []).filter((inv) => !deletedSet.has(inv.id)),
      deliveries: (persisted.deliveries || []).filter((d) => !deletedSet.has(d.id)),
      documents: (persisted.documents || []).filter((doc) => !deletedSet.has(doc.id)),
      reports: (persisted.reports || []).filter((rep) => !deletedSet.has(rep.id)),
    });
    inMemoryStore = cleanState;
    return { state: cleanState, totalAnimalCount, source: "supabase_persistent_state" };
  }

  // 2. Otherwise, check relational `kurban_*` tables in Supabase (WITHOUT calling auto-seeding!)
  if (supabase) {
    try {
      const [
        orgRes,
        locsRes,
        partiesRes,
        shipmentsRes,
        slaughtersRes,
        storagesRes,
        deliveriesRes,
        invoicesRes,
        docsRes,
        reportsRes,
      ] = await Promise.all([
        supabase.from("kurban_process_organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("kurban_cutting_locations").select("*").order("location_code", { ascending: true }),
        supabase.from("kurban_parties").select("*").order("created_at", { ascending: false }),
        supabase.from("kurban_shipments").select("*").order("shipment_date", { ascending: false }),
        supabase.from("kurban_slaughter_batches").select("*").order("slaughter_date", { ascending: false }),
        supabase.from("kurban_storage_records").select("*").order("entry_date", { ascending: false }),
        supabase.from("kurban_deliveries").select("*").order("delivery_date", { ascending: false }),
        supabase.from("kurban_invoices").select("*").order("invoice_date", { ascending: false }),
        supabase.from("kurban_documents").select("*").order("uploaded_at", { ascending: false }),
        supabase.from("kurban_reports").select("*, kurban_report_sections(*)").order("report_no", { ascending: true }),
      ]);

      const hasRelationalData =
        (!orgRes.error && orgRes.data && orgRes.data.length > 0) ||
        (!locsRes.error && locsRes.data && locsRes.data.length > 0) ||
        (!partiesRes.error && partiesRes.data && partiesRes.data.length > 0);

      if (hasRelationalData) {
        const activeOrgRow = orgRes.data?.[0];
        const organization: KurbanProcessOrganization = activeOrgRow
          ? {
              id: activeOrgRow.id,
              name: activeOrgRow.name || SEED_ORGANIZATION.name,
              clientCompanyName:
                activeOrgRow.client_company_name || SEED_ORGANIZATION.clientCompanyName,
              clientTaxNo: activeOrgRow.client_tax_no || "",
              clientTaxOffice: activeOrgRow.client_tax_office || "",
              clientAddress: activeOrgRow.client_address || "",
              clientContact: activeOrgRow.client_contact || "",
              startDate: activeOrgRow.start_date || SEED_ORGANIZATION.startDate,
              endDate: activeOrgRow.end_date || SEED_ORGANIZATION.endDate,
              targetAnimalCount: Number(activeOrgRow.target_animal_count) || 350,
              status: activeOrgRow.status || "in_progress",
              description: activeOrgRow.description || "",
              generalNotes: activeOrgRow.general_notes || "",
              createdAt: activeOrgRow.created_at || new Date().toISOString(),
              updatedAt: activeOrgRow.updated_at || new Date().toISOString(),
            }
          : { ...SEED_ORGANIZATION };

        const locationsMap = new Map<string, string>();
        const cuttingLocations: KurbanCuttingLocation[] = (locsRes.data || []).map((row: any) => {
          const loc = mapLocationFromDb(row);
          locationsMap.set(loc.id, loc.name);
          return loc;
        });

        const parties: KurbanParty[] = (partiesRes.data || []).map(mapPartyFromDb);
        const shipments: KurbanShipment[] =
          shipmentsRes.data && shipmentsRes.data.length > 0
            ? shipmentsRes.data.map((r: any) => mapShipmentFromDb(r, locationsMap))
            : [...SEED_SHIPMENTS];
        const slaughterBatches: KurbanSlaughterBatch[] =
          slaughtersRes.data && slaughtersRes.data.length > 0
            ? slaughtersRes.data.map((r: any) => mapSlaughterBatchFromDb(r, locationsMap))
            : [...SEED_SLAUGHTER_BATCHES];
        const storageRecords: KurbanStorageRecord[] =
          storagesRes.data && storagesRes.data.length > 0
            ? storagesRes.data.map((r: any) => mapStorageRecordFromDb(r, locationsMap))
            : [...SEED_STORAGE_RECORDS];
        const deliveries: KurbanDelivery[] =
          deliveriesRes.data && deliveriesRes.data.length > 0
            ? deliveriesRes.data.map((r: any) => mapDeliveryFromDb(r, locationsMap))
            : [...SEED_DELIVERIES];
        const invoices: KurbanInvoice[] =
          invoicesRes.data && invoicesRes.data.length > 0
            ? invoicesRes.data.map((r: any) => mapInvoiceFromDb(r, locationsMap))
            : [...SEED_INVOICES];
        const documents: KurbanDocument[] =
          docsRes.data && docsRes.data.length > 0
            ? docsRes.data.map(mapDocumentFromDb)
            : [...SEED_DOCUMENTS];
        const reports: KurbanReport[] =
          reportsRes.data && reportsRes.data.length > 0
            ? reportsRes.data.map((r: any) => mapReportFromDb(r, locationsMap))
            : JSON.parse(JSON.stringify(SEED_REPORTS));

        const relationalState: KurbanPersistentState = syncLocationsWithSlaughterhouseParties({
          isCustomized: false,
          deletedIds: [],
          organization,
          parties,
          contracts: [{ ...SEED_CONTRACT }],
          cuttingLocations,
          shipments,
          slaughterBatches,
          storageRecords,
          invoices,
          deliveries,
          documents,
          reports,
          updatedAt: new Date().toISOString(),
        });

        inMemoryStore = relationalState;
        return { state: relationalState, totalAnimalCount, source: "supabase_relational" };
      }
    } catch (err) {
      console.warn("Supabase relational fetch warning:", err);
    }
  }

  inMemoryStore = syncLocationsWithSlaughterhouseParties(inMemoryStore);
  return { state: inMemoryStore, totalAnimalCount, source: "default_state" };
}

/**
 * Formats the API response payload from a KurbanPersistentState
 */
function buildOverviewResponse(
  state: KurbanPersistentState,
  locationId: string | null,
  totalAnimalCount: number,
  source: string
) {
  const locationsMap = new Map<string, string>();
  for (const loc of state.cuttingLocations) {
    locationsMap.set(loc.id, loc.name);
  }

  // Ensure location names stay synchronized
  const shipments = state.shipments.map((s) => ({
    ...s,
    destinationLocationName:
      locationsMap.get(s.destinationLocationId) || s.destinationLocationName || "Kesimhane",
  }));
  const slaughterBatches = state.slaughterBatches.map((b) => ({
    ...b,
    cuttingLocationName:
      locationsMap.get(b.cuttingLocationId) || b.cuttingLocationName || "Kesimhane",
  }));
  const storageRecords = state.storageRecords.map((st) => ({
    ...st,
    cuttingLocationName:
      (st.cuttingLocationId && locationsMap.get(st.cuttingLocationId)) ||
      st.cuttingLocationName,
  }));
  const deliveries = state.deliveries.map((d) => ({
    ...d,
    cuttingLocationName:
      (d.cuttingLocationId && locationsMap.get(d.cuttingLocationId)) ||
      d.cuttingLocationName,
  }));
  const invoices = state.invoices.map((inv) => ({
    ...inv,
    cuttingLocationName:
      (inv.cuttingLocationId && locationsMap.get(inv.cuttingLocationId)) ||
      inv.cuttingLocationName,
  }));
  const reports = state.reports.map((rep) => ({
    ...rep,
    cuttingLocationName:
      (rep.cuttingLocationId && locationsMap.get(rep.cuttingLocationId)) ||
      rep.cuttingLocationName,
  }));

  let filteredShipments = shipments;
  let filteredSlaughters = slaughterBatches;
  let filteredStorage = storageRecords;
  let filteredDeliveries = deliveries;
  let filteredInvoices = invoices;
  let filteredReports = reports;

  if (locationId && locationId !== "all") {
    filteredShipments = shipments.filter((s) => s.destinationLocationId === locationId);
    filteredSlaughters = slaughterBatches.filter((b) => b.cuttingLocationId === locationId);
    filteredStorage = storageRecords.filter((st) => st.cuttingLocationId === locationId);
    filteredDeliveries = deliveries.filter((d) => d.cuttingLocationId === locationId);
    filteredInvoices = invoices.filter(
      (inv) => !inv.cuttingLocationId || inv.cuttingLocationId === locationId
    );
    const matched = reports.filter((rep) => rep.cuttingLocationId === locationId);
    if (matched.length > 0) {
      filteredReports = matched;
    }
  }

  const totalShipped = filteredShipments.reduce((acc, s) => acc + (Number(s.animalCount) || 0), 0);
  const totalSlaughtered = filteredSlaughters.reduce(
    (acc, b) => acc + (Number(b.animalCount) || 0),
    0
  );
  const totalCarcass = filteredSlaughters.reduce(
    (acc, b) => acc + (Number(b.totalCarcassWeightKg) || 0),
    0
  );
  const totalStoredKg = filteredStorage.reduce(
    (acc, st) => acc + (Number(st.storedQuantityKg) || 0),
    0
  );
  const totalDeliveredKg = filteredDeliveries.reduce(
    (acc, d) => acc + (Number(d.deliveredQuantityKg) || 0),
    0
  );
  const totalInvoiceAmount = filteredInvoices.reduce(
    (acc, inv) => acc + (Number(inv.totalAmount) || 0),
    0
  );
  const targetCount = state.organization?.targetAnimalCount || 350;

  return {
    success: true,
    source,
    isCustomized: state.isCustomized,
    organization: state.organization,
    organizations: [state.organization],
    cuttingLocations: state.cuttingLocations,
    parties: state.parties,
    contracts: state.contracts || [SEED_CONTRACT],
    shipments: filteredShipments,
    slaughterBatches: filteredSlaughters,
    storageRecords: filteredStorage,
    deliveries: filteredDeliveries,
    invoices: filteredInvoices,
    documents: state.documents,
    reports: filteredReports,
    allReports: reports,
    totalAnimalCount,
    stats: {
      totalTargetAnimals: targetCount,
      totalPurchasedAnimals: totalAnimalCount,
      totalShipments: filteredShipments.length,
      totalShippedAnimals: totalShipped,
      totalSlaughterBatches: filteredSlaughters.length,
      totalSlaughteredAnimals: totalSlaughtered,
      totalCarcassWeightKg: totalCarcass,
      totalStorageRecords: filteredStorage.length,
      totalStoredQuantityKg: totalStoredKg,
      totalDeliveries: filteredDeliveries.length,
      totalDeliveredQuantityKg: totalDeliveredKg,
      totalDeliveredAnimals: totalSlaughtered,
      totalInvoicesCount: filteredInvoices.length,
      totalInvoiceAmount,
      totalDocumentsCount: state.documents.length,
      missingDocumentsCount: 0,
      discrepancies: {
        unshippedAnimals: Math.max(0, totalAnimalCount - totalShipped),
        unslaughteredShippedAnimals: Math.max(0, totalShipped - totalSlaughtered),
        unstoredOrUndeliveredKg: Math.max(0, totalCarcass - totalDeliveredKg),
      },
    },
  };
}

/**
 * GET: Full process data overview with stats, locations, parties, and reports
 */
export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");

  const supabase = getSupabaseServerClient();
  const { state, totalAnimalCount, source } = await resolveAuthoritativeState(supabase);

  return NextResponse.json(
    buildOverviewResponse(state, locationId, totalAnimalCount, source),
    { headers: NO_STORE_HEADERS }
  );
}

/**
 * POST: Save / Update entities (organization, party, location, shipment, slaughter, storage, invoice, delivery, document)
 * or run special actions (clear_mock_data, seed_demo_to_supabase)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabaseServerClient();

    // Load current authoritative state first
    const { state } = await resolveAuthoritativeState(supabase);

    // ------------------------------------------------------------------------
    // Action: Clear All Mock / Demo Records
    // ------------------------------------------------------------------------
    if (action === "clear_mock_data") {
      const allDeletedIds = [
        ...state.deletedIds,
        ...SEED_PARTIES.map((p) => p.id),
        ...SEED_CUTTING_LOCATIONS.map((l) => l.id),
        ...SEED_SHIPMENTS.map((s) => s.id),
        ...SEED_SLAUGHTER_BATCHES.map((b) => b.id),
        ...SEED_STORAGE_RECORDS.map((st) => st.id),
        ...SEED_INVOICES.map((inv) => inv.id),
        ...SEED_DELIVERIES.map((d) => d.id),
        ...SEED_DOCUMENTS.map((doc) => doc.id),
        ...SEED_REPORTS.map((r) => r.id),
        ...state.parties.map((p) => p.id),
        ...state.cuttingLocations.map((l) => l.id),
        ...state.shipments.map((s) => s.id),
        ...state.slaughterBatches.map((b) => b.id),
        ...state.storageRecords.map((st) => st.id),
        ...state.invoices.map((inv) => inv.id),
        ...state.deliveries.map((d) => d.id),
        ...state.documents.map((doc) => doc.id),
      ];

      if (supabase) {
        try {
          await supabase.from("kurban_parties").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          for (const loc of state.cuttingLocations) {
            await safeDeleteLocationFromDb(supabase, loc.id);
          }
          for (const loc of SEED_CUTTING_LOCATIONS) {
            await safeDeleteLocationFromDb(supabase, loc.id);
          }
        } catch (e) {
          console.warn("clear_mock_data relational cleanup warning:", e);
        }
      }

      const clearedState: KurbanPersistentState = {
        ...state,
        isCustomized: true,
        deletedIds: Array.from(new Set(allDeletedIds)),
        parties: [],
        cuttingLocations: [],
        shipments: [],
        slaughterBatches: [],
        storageRecords: [],
        invoices: [],
        deliveries: [],
        documents: [],
        reports: [],
        updatedAt: new Date().toISOString(),
      };

      inMemoryStore = clearedState;
      await saveKurbanPersistentState(clearedState, supabase);

      return NextResponse.json({
        success: true,
        message: "Tüm örnek (mock) veriler kalıcı olarak temizlendi. Kendi kayıtlarınızı ekleyebilirsiniz.",
      });
    }

    // ------------------------------------------------------------------------
    // Action: Seed Full Demo to Supabase
    // ------------------------------------------------------------------------
    if (action === "seed_demo_to_supabase") {
      const demoState = createDefaultPersistentState();
      demoState.isCustomized = true;
      demoState.deletedIds = [];
      inMemoryStore = demoState;
      await saveKurbanPersistentState(demoState, supabase);

      if (supabase) {
        try {
          await supabase.from("kurban_process_organizations").upsert({
            id: SEED_ORGANIZATION.id,
            name: SEED_ORGANIZATION.name,
            client_company_name: SEED_ORGANIZATION.clientCompanyName,
            client_tax_no: SEED_ORGANIZATION.clientTaxNo,
            client_tax_office: SEED_ORGANIZATION.clientTaxOffice,
            client_address: SEED_ORGANIZATION.clientAddress,
            client_contact: SEED_ORGANIZATION.clientContact,
            start_date: SEED_ORGANIZATION.startDate,
            end_date: SEED_ORGANIZATION.endDate,
            target_animal_count: SEED_ORGANIZATION.targetAnimalCount,
            status: SEED_ORGANIZATION.status,
            description: SEED_ORGANIZATION.description,
            general_notes: SEED_ORGANIZATION.generalNotes,
          });

          for (const loc of SEED_CUTTING_LOCATIONS) {
            await supabase.from("kurban_cutting_locations").upsert({
              id: loc.id,
              organization_id: loc.organizationId,
              name: loc.name,
              location_code: loc.locationCode,
              city: loc.city,
              address: loc.address,
              responsible_person: loc.responsiblePerson,
              responsible_phone: loc.responsiblePhone,
              official_approval_no: loc.officialApprovalNo,
              veterinary_name: loc.veterinaryName,
              daily_capacity: loc.dailyCapacity,
              allocated_animal_count: loc.allocatedAnimalCount,
              notes: loc.notes,
            });
          }

          for (const p of SEED_PARTIES) {
            await supabase.from("kurban_parties").upsert({
              id: p.id,
              organization_id: p.organizationId,
              party_type: p.partyType,
              name: p.name,
              tax_id: p.taxId,
              tax_office: p.taxOffice,
              phone: p.phone,
              email: p.email,
              city: p.city,
              address: p.address,
              authorized_person: p.authorizedPerson,
              notes: p.notes,
            });
          }

          for (const rep of SEED_REPORTS) {
            await supabase.from("kurban_reports").upsert({
              id: rep.id,
              organization_id: rep.organizationId,
              cutting_location_id: rep.cuttingLocationId,
              report_no: rep.reportNo,
              title: rep.title,
              report_date: rep.reportDate,
              report_period: rep.reportPeriod,
              prepared_by: rep.preparedBy,
              status: rep.status,
              client_company_name: rep.clientCompanyName,
              executive_summary: rep.executiveSummary,
              evaluation_notes: rep.evaluationNotes,
              final_result_summary: rep.finalResultSummary,
              metadata: rep.metadata || {},
            });

            if (rep.sections && rep.sections.length > 0) {
              for (const sec of rep.sections) {
                await supabase.from("kurban_report_sections").upsert({
                  id: sec.id,
                  report_id: rep.id,
                  section_key: sec.sectionKey,
                  section_title: sec.sectionTitle,
                  order_index: sec.orderIndex,
                  is_enabled: sec.isEnabled,
                  content_html: sec.contentHtml,
                  custom_notes: sec.customNotes,
                  include_tables: sec.includeTables,
                  page_break_after: sec.pageBreakAfter,
                });
              }
            }
          }

          const batchSize = 50;
          for (let i = 0; i < SEED_ANIMALS.length; i += batchSize) {
            const batch = SEED_ANIMALS.slice(i, i + batchSize).map((a) => ({
              id: a.id,
              organization_id: a.organizationId,
              cutting_location_id: a.cuttingLocationId,
              ear_tag_no: a.earTagNo,
              animal_type: a.animalType,
              animal_type_label: a.animalTypeLabel,
              breed: a.breed,
              gender: a.gender,
              birth_date: a.birthDate,
              age_months: a.ageMonths,
              passport_no: a.passportNo,
              farm_reg_no: a.farmRegNo,
              farm_name: a.farmName,
              health_doc_no: a.healthDocNo,
              live_weight_kg: a.liveWeightKg,
              carcass_weight_kg: a.carcassWeightKg,
              status: a.status,
              notes: a.notes,
            }));
            await supabase.from("kurban_animals").upsert(batch);
          }
        } catch (err) {
          console.warn("seed_demo_to_supabase relational warning:", err);
        }
      }

      return NextResponse.json({
        success: true,
        message: "350 hayvan, 2 kesimhane ve tüm süreç kayıtları başarıyla yüklendi.",
      });
    }

    // ------------------------------------------------------------------------
    // Entity CRUD: Organization, Party, Location, Shipment, Slaughter, Storage, Invoice, Delivery, Document
    // ------------------------------------------------------------------------
    if (body.entityType && body.data) {
      const { entityType, data } = body;
      await ensureDatabaseReady(supabase);
      const orgId = await getActiveOrganizationId(supabase, data.organizationId || state.organization?.id);
      const entityId = ensureUUID(data.id);

      // Remove entityId from deletedIds if it was previously deleted
      state.deletedIds = (state.deletedIds || []).filter((id) => id !== entityId);

      // --- 0. ORGANIZATION (Ana Organizasyon & Alıcı Kurum Bilgileri) ---
      if (entityType === "organization") {
        const updatedOrg: KurbanProcessOrganization = {
          ...state.organization,
          id: ensureUUID(data.id || state.organization?.id || orgId),
          name: data.name?.trim() || state.organization.name || "2026 Kurban Organizasyonu",
          clientCompanyName:
            data.clientCompanyName?.trim() ||
            state.organization.clientCompanyName ||
            "Alıcı Kurum",
          clientTaxNo: data.clientTaxNo ?? state.organization.clientTaxNo ?? "",
          clientTaxOffice: data.clientTaxOffice ?? state.organization.clientTaxOffice ?? "",
          clientAddress: data.clientAddress ?? state.organization.clientAddress ?? "",
          clientContact: data.clientContact ?? state.organization.clientContact ?? "",
          startDate: data.startDate || state.organization.startDate,
          endDate: data.endDate || state.organization.endDate,
          targetAnimalCount:
            Number(data.targetAnimalCount) || state.organization.targetAnimalCount || 350,
          status: data.status || state.organization.status || "in_progress",
          description: data.description ?? state.organization.description ?? "",
          generalNotes: data.generalNotes ?? state.organization.generalNotes ?? "",
          createdAt: state.organization.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        state.organization = updatedOrg;
        // Sync clientCompanyName to reports
        state.reports = state.reports.map((r) => ({
          ...r,
          clientCompanyName: updatedOrg.clientCompanyName,
        }));

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_process_organizations").upsert({
            id: updatedOrg.id,
            name: updatedOrg.name,
            client_company_name: updatedOrg.clientCompanyName,
            client_tax_no: updatedOrg.clientTaxNo || null,
            client_tax_office: updatedOrg.clientTaxOffice || null,
            client_address: updatedOrg.clientAddress || null,
            client_contact: updatedOrg.clientContact || null,
            start_date: updatedOrg.startDate || null,
            end_date: updatedOrg.endDate || null,
            target_animal_count: updatedOrg.targetAnimalCount,
            status: updatedOrg.status,
            description: updatedOrg.description || null,
            general_notes: updatedOrg.generalNotes || null,
            updated_at: updatedOrg.updatedAt,
          });
          if (dbErr) {
            console.warn("Supabase organization upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          organization: updatedOrg,
          message: "Organizasyon ve alıcı kurum bilgileri başarıyla kaydedildi.",
        });
      }

      // --- 1. PARTY (Firma / Alıcı Müşteri / Besici / Soğuk Depo / Mezbaha / Lojistik) ---
      if (entityType === "party") {
        const canonicalPartyId = LEGACY_PARTY_TO_LOCATION_ID[entityId] || entityId;
        state.deletedIds = (state.deletedIds || []).filter(
          (id) => id !== canonicalPartyId && id !== LOCATION_TO_LEGACY_PARTY_ID[canonicalPartyId]
        );

        const item: KurbanParty = {
          id: canonicalPartyId,
          organizationId: orgId,
          partyType: data.partyType || "supplier_seller",
          name: (data.name || "").trim(),
          taxId: data.taxId || "",
          taxOffice: data.taxOffice || "",
          phone: data.phone || "",
          email: data.email || "",
          city: data.city || "",
          address: data.address || "",
          authorizedPerson: data.authorizedPerson || "",
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.parties.findIndex((p) => p.id === item.id || p.id === entityId);
        if (idx >= 0) state.parties[idx] = item;
        else state.parties.unshift(item);

        // If this party is a Buyer / Client (Alıcı Müşteri), also sync organization buyer info!
        if (item.partyType === "client_buyer") {
          state.organization = {
            ...state.organization,
            clientCompanyName: item.name,
            clientTaxNo: item.taxId || state.organization.clientTaxNo,
            clientTaxOffice: item.taxOffice || state.organization.clientTaxOffice,
            clientAddress: item.address || state.organization.clientAddress,
            clientContact:
              [item.authorizedPerson, item.phone].filter(Boolean).join(" • ") ||
              state.organization.clientContact,
            updatedAt: new Date().toISOString(),
          };
          state.reports = state.reports.map((r) => ({
            ...r,
            clientCompanyName: item.name,
          }));

          if (supabase && isUUID(state.organization.id)) {
            await supabase
              .from("kurban_process_organizations")
              .update({
                client_company_name: state.organization.clientCompanyName,
                client_tax_no: state.organization.clientTaxNo || null,
                client_tax_office: state.organization.clientTaxOffice || null,
                client_address: state.organization.clientAddress || null,
                client_contact: state.organization.clientContact || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", state.organization.id);
          }
        }

        // Automatically derive/sync Kesim Yerleri (cuttingLocations) from slaughterhouse parties!
        syncLocationsWithSlaughterhouseParties(state);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_parties").upsert({
            id: item.id,
            organization_id: item.organizationId,
            party_type: item.partyType,
            name: item.name,
            tax_id: item.taxId || null,
            tax_office: item.taxOffice || null,
            phone: item.phone || null,
            email: item.email || null,
            city: item.city || null,
            address: item.address || null,
            authorized_person: item.authorizedPerson || null,
            notes: item.notes || null,
          });

          if (dbErr) {
            console.warn("Supabase party upsert warning (saved to persistent state):", dbErr);
          }

          // If this is a slaughterhouse party, also upsert into kurban_cutting_locations
          if (item.partyType === "slaughterhouse") {
            const syncedLoc = state.cuttingLocations.find((l) => l.id === item.id);
            if (syncedLoc) {
              await supabase.from("kurban_cutting_locations").upsert({
                id: syncedLoc.id,
                organization_id: syncedLoc.organizationId,
                name: syncedLoc.name,
                location_code: syncedLoc.locationCode,
                city: syncedLoc.city,
                address: syncedLoc.address || null,
                responsible_person: syncedLoc.responsiblePerson || null,
                responsible_phone: syncedLoc.responsiblePhone || null,
                official_approval_no: syncedLoc.officialApprovalNo || null,
                veterinary_name: syncedLoc.veterinaryName || null,
                daily_capacity: syncedLoc.dailyCapacity,
                allocated_animal_count: syncedLoc.allocatedAnimalCount,
                notes: syncedLoc.notes || null,
              });
            }
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          party: item,
          parties: state.parties,
          cuttingLocations: state.cuttingLocations,
          reports: state.reports,
          organization: state.organization,
          message: "Paydaş / Firma başarıyla kaydedildi.",
        });
      }

      // --- 2. LOCATION (Kesim Yeri / Mezbaha -> Firma/Müşteri Bilgilerindeki Mezbahalarla Senkron) ---
      if (entityType === "location") {
        const canonicalLocId = LEGACY_PARTY_TO_LOCATION_ID[entityId] || entityId;
        state.deletedIds = (state.deletedIds || []).filter(
          (id) => id !== canonicalLocId && id !== LOCATION_TO_LEGACY_PARTY_ID[canonicalLocId]
        );

        const item: KurbanCuttingLocation = {
          id: canonicalLocId,
          organizationId: orgId,
          name: (data.name || "").trim(),
          locationCode:
            data.locationCode?.trim() || `KSM-0${state.cuttingLocations.length + 1}`,
          city: data.city || "İstanbul",
          address: data.address || "",
          responsiblePerson: data.responsiblePerson || "",
          responsiblePhone: data.responsiblePhone || "",
          officialApprovalNo: data.officialApprovalNo || "",
          veterinaryName: data.veterinaryName || "",
          dailyCapacity: Number(data.dailyCapacity) || 150,
          allocatedAnimalCount: Number(data.allocatedAnimalCount) || 0,
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.cuttingLocations.findIndex((l) => l.id === item.id);
        if (idx >= 0) {
          state.cuttingLocations[idx] = item;
        } else {
          state.cuttingLocations.push(item);
        }

        // Also upsert the corresponding "slaughterhouse" party in Firma / Müşteri Bilgileri (`state.parties`)
        const existingPartyIdx = state.parties.findIndex((p) => p.id === item.id);
        const syncedParty: KurbanParty = {
          id: item.id,
          organizationId: orgId,
          partyType: "slaughterhouse",
          name: item.name,
          taxId:
            (existingPartyIdx >= 0 ? state.parties[existingPartyIdx].taxId : "") ||
            item.officialApprovalNo ||
            "",
          taxOffice: existingPartyIdx >= 0 ? state.parties[existingPartyIdx].taxOffice : "",
          phone:
            item.responsiblePhone ||
            (existingPartyIdx >= 0 ? state.parties[existingPartyIdx].phone : "") ||
            "",
          email: existingPartyIdx >= 0 ? state.parties[existingPartyIdx].email : "",
          city: item.city,
          address: item.address || "",
          authorizedPerson:
            item.responsiblePerson ||
            item.veterinaryName ||
            (existingPartyIdx >= 0 ? state.parties[existingPartyIdx].authorizedPerson : "") ||
            "",
          notes:
            item.notes ||
            (item.officialApprovalNo ? `Bakanlık Onay No: ${item.officialApprovalNo}` : ""),
          createdAt:
            existingPartyIdx >= 0
              ? state.parties[existingPartyIdx].createdAt
              : item.createdAt,
        };

        if (existingPartyIdx >= 0) {
          state.parties[existingPartyIdx] = syncedParty;
        } else {
          state.parties.push(syncedParty);
        }

        syncLocationsWithSlaughterhouseParties(state);

        // Propagate updated location name to linked entities & ensure an official report exists for this location
        state.shipments = state.shipments.map((s) =>
          s.destinationLocationId === item.id
            ? { ...s, destinationLocationName: item.name }
            : s
        );
        state.slaughterBatches = state.slaughterBatches.map((b) =>
          b.cuttingLocationId === item.id ? { ...b, cuttingLocationName: item.name } : b
        );
        state.storageRecords = state.storageRecords.map((st) =>
          st.cuttingLocationId === item.id ? { ...st, cuttingLocationName: item.name } : st
        );
        state.deliveries = state.deliveries.map((d) =>
          d.cuttingLocationId === item.id ? { ...d, cuttingLocationName: item.name } : d
        );

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_cutting_locations").upsert({
            id: item.id,
            organization_id: item.organizationId,
            name: item.name,
            location_code: item.locationCode,
            city: item.city,
            address: item.address || null,
            responsible_person: item.responsiblePerson || null,
            responsible_phone: item.responsiblePhone || null,
            official_approval_no: item.officialApprovalNo || null,
            veterinary_name: item.veterinaryName || null,
            daily_capacity: item.dailyCapacity,
            allocated_animal_count: item.allocatedAnimalCount,
            notes: item.notes || null,
          });

          if (dbErr) {
            console.warn("Supabase location upsert warning (saved to persistent state):", dbErr);
          }

          await supabase.from("kurban_parties").upsert({
            id: syncedParty.id,
            organization_id: syncedParty.organizationId,
            party_type: syncedParty.partyType,
            name: syncedParty.name,
            tax_id: syncedParty.taxId || null,
            tax_office: syncedParty.taxOffice || null,
            phone: syncedParty.phone || null,
            email: syncedParty.email || null,
            city: syncedParty.city || null,
            address: syncedParty.address || null,
            authorized_person: syncedParty.authorizedPerson || null,
            notes: syncedParty.notes || null,
          });
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          location: state.cuttingLocations.find((l) => l.id === item.id) || item,
          cuttingLocations: state.cuttingLocations,
          parties: state.parties,
          reports: state.reports,
          message: "Kesim yeri ve mezbaha firma bilgileri başarıyla kaydedildi.",
        });
      }

      // --- 3. SHIPMENT (Canlı Hayvan Sevk Tırı) ---
      if (entityType === "shipment") {
        const destLocId =
          data.destinationLocationId ||
          state.cuttingLocations[0]?.id ||
          (await getActiveLocationId(supabase, data.destinationLocationId));
        const matchedLoc = state.cuttingLocations.find((l) => l.id === destLocId);

        const item: KurbanShipment = {
          id: entityId,
          organizationId: orgId,
          destinationLocationId: destLocId,
          destinationLocationName:
            matchedLoc?.name || data.destinationLocationName || "Kesimhane",
          shipmentNo: data.shipmentNo || `SVK-2026-00${state.shipments.length + 1}`,
          shipmentDate: data.shipmentDate || new Date().toISOString().split("T")[0],
          originAddress: data.originAddress || "Besi İşletmesi",
          carrierCompany: data.carrierCompany || "",
          vehiclePlate: data.vehiclePlate?.trim() || "Plakasız / Belirtilmedi",
          driverName: data.driverName || "Şoför",
          driverPhone: data.driverPhone || "",
          animalCount: Number(data.animalCount) || 0,
          shippingCost: Number(data.shippingCost) || 0,
          shippingInvoiceNo: data.shippingInvoiceNo || "",
          dispatchNoteNo: data.dispatchNoteNo || "",
          vetHealthReportNo: data.vetHealthReportNo || "",
          status: data.status || "delivered_to_slaughterhouse",
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.shipments.findIndex((s) => s.id === item.id);
        if (idx >= 0) state.shipments[idx] = item;
        else state.shipments.unshift(item);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_shipments").upsert({
            id: item.id,
            organization_id: item.organizationId,
            destination_location_id: isUUID(item.destinationLocationId)
              ? item.destinationLocationId
              : null,
            shipment_no: item.shipmentNo,
            shipment_date: item.shipmentDate,
            origin_address: item.originAddress,
            carrier_company: item.carrierCompany || null,
            vehicle_plate: item.vehiclePlate,
            driver_name: item.driverName,
            driver_phone: item.driverPhone || null,
            animal_count: item.animalCount,
            shipping_cost: item.shippingCost,
            shipping_invoice_no: item.shippingInvoiceNo || null,
            dispatch_note_no: item.dispatchNoteNo || null,
            vet_health_report_no: item.vetHealthReportNo || null,
            status: item.status,
            notes: item.notes || null,
          });

          if (dbErr) {
            console.warn("Supabase shipment upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          shipment: item,
          message: "Sevk tırı başarıyla kaydedildi.",
        });
      }

      // --- 3.5. SLAUGHTER BATCH (Kesimhane Oturumu & Karkas Tartım Tutanağı) ---
      if (entityType === "slaughter") {
        const cutLocId =
          data.cuttingLocationId ||
          state.cuttingLocations[0]?.id ||
          (await getActiveLocationId(supabase, data.cuttingLocationId));
        const matchedLoc = state.cuttingLocations.find((l) => l.id === cutLocId);

        const item: KurbanSlaughterBatch = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: cutLocId,
          cuttingLocationName: matchedLoc?.name || data.cuttingLocationName || "Kesimhane",
          batchNo: data.batchNo || `KSM-PARTI-0${state.slaughterBatches.length + 1}`,
          slaughterDate: data.slaughterDate || new Date().toISOString().split("T")[0],
          slaughterTime: data.slaughterTime || "08:00 - 17:00",
          animalCount: Number(data.animalCount) || 0,
          totalCarcassWeightKg: Number(data.totalCarcassWeightKg) || 0,
          responsiblePerson: data.responsiblePerson || matchedLoc?.responsiblePerson || "",
          butcherTeam: data.butcherTeam || "Uzman Kasap Ekibi",
          veterinaryApproval: Boolean(data.veterinaryApproval ?? true),
          officialProtocolNo: data.officialProtocolNo || `TUT-2026-0${state.slaughterBatches.length + 1}`,
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.slaughterBatches.findIndex((b) => b.id === item.id);
        if (idx >= 0) state.slaughterBatches[idx] = item;
        else state.slaughterBatches.unshift(item);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_slaughter_batches").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: isUUID(item.cuttingLocationId) ? item.cuttingLocationId : null,
            batch_no: item.batchNo,
            slaughter_date: item.slaughterDate,
            slaughter_time: item.slaughterTime || null,
            animal_count: item.animalCount,
            total_carcass_weight_kg: item.totalCarcassWeightKg,
            responsible_person: item.responsiblePerson || null,
            butcher_team: item.butcherTeam || null,
            veterinary_approval: item.veterinaryApproval,
            official_protocol_no: item.officialProtocolNo || null,
            notes: item.notes || null,
          });
          if (dbErr) {
            console.warn("Supabase slaughter upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          slaughter: item,
          message: "Kesimhane oturumu ve karkas tartım tutanağı kaydedildi.",
        });
      }

      // --- 4. STORAGE (Soğuk Hava Depolama Kaydı) ---
      if (entityType === "storage") {
        const cutLocId =
          data.cuttingLocationId ||
          state.cuttingLocations[0]?.id ||
          (await getActiveLocationId(supabase, data.cuttingLocationId));
        const matchedLoc = state.cuttingLocations.find((l) => l.id === cutLocId);

        const item: KurbanStorageRecord = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: cutLocId,
          cuttingLocationName: matchedLoc?.name || data.cuttingLocationName,
          storageCompany: data.storageCompany || "Soğuk Depo Firması",
          warehouseName: data.warehouseName || "Soğuk Hava Antreposu",
          warehouseAddress: data.warehouseAddress || "",
          entryDate: data.entryDate || new Date().toISOString().split("T")[0],
          exitDate: data.exitDate || undefined,
          productType: data.productType || "Karkas / Parçalanmış Soğuk Sığır Eti",
          storedQuantityKg: Number(data.storedQuantityKg) || 0,
          remainingQuantityKg: Number(data.remainingQuantityKg ?? data.storedQuantityKg) || 0,
          entryDispatchNo: data.entryDispatchNo || "",
          exitDispatchNo: data.exitDispatchNo || "",
          invoiceNo: data.invoiceNo || "",
          invoiceDate: data.invoiceDate || undefined,
          invoiceAmount: Number(data.invoiceAmount) || 0,
          temperatureCelsius: Number(data.temperatureCelsius) || 4.0,
          status: data.status || "in_storage",
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.storageRecords.findIndex((st) => st.id === item.id);
        if (idx >= 0) state.storageRecords[idx] = item;
        else state.storageRecords.unshift(item);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_storage_records").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: isUUID(item.cuttingLocationId) ? item.cuttingLocationId : null,
            storage_company: item.storageCompany,
            warehouse_name: item.warehouseName,
            warehouse_address: item.warehouseAddress || null,
            entry_date: item.entryDate,
            exit_date: item.exitDate || null,
            product_type: item.productType,
            stored_quantity_kg: item.storedQuantityKg,
            remaining_quantity_kg: item.remainingQuantityKg,
            entry_dispatch_no: item.entryDispatchNo || null,
            exit_dispatch_no: item.exitDispatchNo || null,
            invoice_no: item.invoiceNo || null,
            invoice_date: item.invoiceDate || null,
            invoice_amount: item.invoiceAmount,
            temperature_celsius: item.temperatureCelsius,
            status: item.status,
            notes: item.notes || null,
          });

          if (dbErr) {
            console.warn("Supabase storage upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          storage: item,
          message: "Soğuk depo kaydı başarıyla kaydedildi.",
        });
      }

      // --- 4.5. INVOICE (Mali Fatura & İrsaliye Kaydı) ---
      if (entityType === "invoice") {
        const subtotal = Number(data.subtotal) || 0;
        const vatRate = Number(data.vatRate ?? 1);
        const vatAmount =
          data.vatAmount !== undefined
            ? Number(data.vatAmount)
            : Math.round(subtotal * (vatRate / 100) * 100) / 100;
        const totalAmount =
          Number(data.totalAmount) || Math.round((subtotal + vatAmount) * 100) / 100;

        const item: KurbanInvoice = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: data.cuttingLocationId || undefined,
          invoiceType: data.invoiceType || "animal_purchase",
          invoiceNo: data.invoiceNo || `FAT-2026-00${state.invoices.length + 1}`,
          invoiceDate: data.invoiceDate || new Date().toISOString().split("T")[0],
          issuerCompany: data.issuerCompany || "",
          recipientCompany: data.recipientCompany || state.organization.clientCompanyName || "",
          subtotal,
          vatRate,
          vatAmount,
          totalAmount,
          description: data.description || "",
          fileUrl: data.fileUrl || undefined,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.invoices.findIndex((inv) => inv.id === item.id);
        if (idx >= 0) state.invoices[idx] = item;
        else state.invoices.unshift(item);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_invoices").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: isUUID(item.cuttingLocationId) ? item.cuttingLocationId : null,
            invoice_type: item.invoiceType,
            invoice_no: item.invoiceNo,
            invoice_date: item.invoiceDate,
            issuer_company: item.issuerCompany,
            recipient_company: item.recipientCompany,
            subtotal: item.subtotal,
            vat_rate: item.vatRate,
            vat_amount: item.vatAmount,
            total_amount: item.totalAmount,
            description: item.description || null,
            file_url: item.fileUrl || null,
          });
          if (dbErr) {
            console.warn("Supabase invoice upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          invoice: item,
          message: "Fatura kaydı başarıyla kaydedildi.",
        });
      }

      // --- 5. DELIVERY (Taşıma Aracı & Müşteri Teslimatı) ---
      if (entityType === "delivery") {
        const cutLocId =
          data.cuttingLocationId ||
          state.cuttingLocations[0]?.id ||
          (await getActiveLocationId(supabase, data.cuttingLocationId));
        const matchedLoc = state.cuttingLocations.find((l) => l.id === cutLocId);

        const item: KurbanDelivery = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: cutLocId,
          cuttingLocationName: matchedLoc?.name || data.cuttingLocationName,
          deliveryNo: data.deliveryNo || `TSL-2026-00${state.deliveries.length + 1}`,
          recipientCompany:
            data.recipientCompany || state.organization.clientCompanyName || "Alıcı Firma",
          deliveryDate: data.deliveryDate || new Date().toISOString().split("T")[0],
          deliveredQuantityKg: Number(data.deliveredQuantityKg) || 0,
          deliveredAnimalCount: Number(data.deliveredAnimalCount) || 0,
          outgoingInvoiceNo: data.outgoingInvoiceNo || "",
          dispatchNoteNo: data.dispatchNoteNo || `IRS-${Date.now().toString().slice(-6)}`,
          deliveryAddress: data.deliveryAddress || "Müşteri Teslim Adresi",
          recipientPerson: data.recipientPerson || "Yetkili",
          deliveredByPerson: data.deliveredByPerson || "Sevkiyat Sorumlusu",
          transportType: data.transportType || "company_vehicle",
          vehiclePlate: data.vehiclePlate?.trim() || "Plakasız / Belirtilmedi",
          driverName: data.driverName || "Şoför",
          transportCost: Number(data.transportCost) || 0,
          status: data.status || "completed",
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        const idx = state.deliveries.findIndex((d) => d.id === item.id);
        if (idx >= 0) state.deliveries[idx] = item;
        else state.deliveries.unshift(item);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_deliveries").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: isUUID(item.cuttingLocationId) ? item.cuttingLocationId : null,
            delivery_no: item.deliveryNo,
            recipient_company: item.recipientCompany,
            delivery_date: item.deliveryDate,
            delivered_quantity_kg: item.deliveredQuantityKg,
            delivered_animal_count: item.deliveredAnimalCount,
            outgoing_invoice_no: item.outgoingInvoiceNo || null,
            dispatch_note_no: item.dispatchNoteNo,
            delivery_address: item.deliveryAddress,
            recipient_person: item.recipientPerson,
            delivered_by_person: item.deliveredByPerson,
            transport_type: item.transportType,
            vehicle_plate: item.vehiclePlate,
            driver_name: item.driverName,
            transport_cost: item.transportCost,
            status: item.status,
            notes: item.notes || null,
          });

          if (dbErr) {
            console.warn("Supabase delivery upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          delivery: item,
          message: "Taşıma / Teslimat aracı başarıyla kaydedildi.",
        });
      }

      // --- 6. DOCUMENT (Fotoğraf & Belge) ---
      if (entityType === "document") {
        const item: KurbanDocument = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: data.cuttingLocationId || undefined,
          category: data.category || "shipment_photo",
          title: data.title || "Süreç Görseli",
          description: data.description || "",
          fileUrl: data.fileUrl || "",
          fileName: data.fileName || undefined,
          mimeType: data.mimeType || undefined,
          relatedEntityType: data.relatedEntityType || undefined,
          relatedEntityId: data.relatedEntityId || undefined,
          uploadedAt: data.uploadedAt || new Date().toISOString(),
        };

        const idx = state.documents.findIndex((doc) => doc.id === item.id);
        if (idx >= 0) state.documents[idx] = item;
        else state.documents.unshift(item);

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_documents").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: isUUID(item.cuttingLocationId) ? item.cuttingLocationId : null,
            category: item.category,
            title: item.title,
            description: item.description || null,
            file_url: item.fileUrl,
            file_name: item.fileName || null,
            mime_type: item.mimeType || null,
            related_entity_type: item.relatedEntityType || null,
            related_entity_id: isUUID(item.relatedEntityId) ? item.relatedEntityId : null,
            uploaded_at: item.uploadedAt,
          });
          if (dbErr) {
            console.warn("Supabase document upsert warning (saved to persistent state):", dbErr);
          }
        }

        inMemoryStore = state;
        await saveKurbanPersistentState(state, supabase);

        return NextResponse.json({
          success: true,
          document: item,
          message: "Fotoğraf / Belge başarıyla kaydedildi.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "İşlem başarılı.",
    });
  } catch (err: any) {
    console.error("Kurban process API POST error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Sunucu hatası" },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Delete a party, location, shipment, slaughter, storage, invoice, delivery, or document
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const id = searchParams.get("id");

    if (!entityType || !id) {
      return NextResponse.json(
        { success: false, error: "entityType ve id zorunludur." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { state } = await resolveAuthoritativeState(supabase);

    const canonicalId = LEGACY_PARTY_TO_LOCATION_ID[id] || id;
    const legacyPartyId = LOCATION_TO_LEGACY_PARTY_ID[canonicalId];
    const idsToDelete = [id, canonicalId, ...(legacyPartyId ? [legacyPartyId] : [])];

    // Record ID as deleted permanently so it never comes back from seed or relational tables
    state.deletedIds = Array.from(new Set([...(state.deletedIds || []), ...idsToDelete]));

    if (entityType === "party" || entityType === "location") {
      const removedParty = state.parties.find((p) => idsToDelete.includes(p.id));
      const isSlaughterhouse =
        entityType === "location" || removedParty?.partyType === "slaughterhouse";

      state.parties = state.parties.filter((p) => !idsToDelete.includes(p.id));

      if (isSlaughterhouse) {
        const removedReportIds = state.reports
          .filter((r) => idsToDelete.includes(r.cuttingLocationId))
          .map((r) => r.id);
        state.deletedIds = Array.from(new Set([...state.deletedIds, ...removedReportIds]));
        state.cuttingLocations = state.cuttingLocations.filter(
          (l) => !idsToDelete.includes(l.id)
        );
        state.reports = state.reports.filter(
          (r) => !idsToDelete.includes(r.cuttingLocationId)
        );
      }

      syncLocationsWithSlaughterhouseParties(state);

      if (supabase) {
        for (const delId of idsToDelete) {
          if (isUUID(delId)) {
            await supabase.from("kurban_parties").delete().eq("id", delId);
            if (isSlaughterhouse) {
              await safeDeleteLocationFromDb(supabase, delId);
            }
          }
        }
      }

      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({
        success: true,
        parties: state.parties,
        cuttingLocations: state.cuttingLocations,
        reports: state.reports,
        message: isSlaughterhouse
          ? "Kesimhane / Mezbaha ve bağlı kesim yeri silindi."
          : "Paydaş firma silindi.",
      });
    }

    if (entityType === "shipment") {
      state.shipments = state.shipments.filter((s) => s.id !== id);
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_shipments").delete().eq("id", id);
        if (error) console.warn("Supabase shipment delete warning:", error);
      }
      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({ success: true, message: "Sevk tırı silindi." });
    }

    if (entityType === "slaughter") {
      state.slaughterBatches = state.slaughterBatches.filter((b) => b.id !== id);
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_slaughter_batches").delete().eq("id", id);
        if (error) console.warn("Supabase slaughter delete warning:", error);
      }
      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({ success: true, message: "Kesimhane oturumu silindi." });
    }

    if (entityType === "storage") {
      state.storageRecords = state.storageRecords.filter((st) => st.id !== id);
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_storage_records").delete().eq("id", id);
        if (error) console.warn("Supabase storage delete warning:", error);
      }
      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({ success: true, message: "Soğuk depo kaydı silindi." });
    }

    if (entityType === "invoice") {
      state.invoices = state.invoices.filter((inv) => inv.id !== id);
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_invoices").delete().eq("id", id);
        if (error) console.warn("Supabase invoice delete warning:", error);
      }
      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({ success: true, message: "Fatura kaydı silindi." });
    }

    if (entityType === "delivery") {
      state.deliveries = state.deliveries.filter((d) => d.id !== id);
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_deliveries").delete().eq("id", id);
        if (error) console.warn("Supabase delivery delete warning:", error);
      }
      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({ success: true, message: "Taşıma aracı kaydı silindi." });
    }

    if (entityType === "document") {
      state.documents = state.documents.filter((doc) => doc.id !== id);
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_documents").delete().eq("id", id);
        if (error) console.warn("Supabase document delete warning:", error);
      }
      inMemoryStore = state;
      await saveKurbanPersistentState(state, supabase);
      return NextResponse.json({ success: true, message: "Belge / Fotoğraf silindi." });
    }

    return NextResponse.json({ success: false, error: "Geçersiz entityType." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Silme hatası" },
      { status: 500 }
    );
  }
}
