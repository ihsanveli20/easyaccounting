import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  SEED_ORGANIZATION,
  SEED_ORGANIZATION_ID,
  SEED_CUTTING_LOCATIONS,
  SEED_LOC_TUZLA_ID,
  SEED_PARTIES,
  SEED_CONTRACT,
  SEED_SHIPMENTS,
  SEED_SLAUGHTER_BATCHES,
  SEED_STORAGE_RECORDS,
  SEED_INVOICES,
  SEED_DELIVERIES,
  SEED_DOCUMENTS,
  SEED_REPORTS,
} from "./kurbanProcessSeed";
import {
  KurbanProcessOrganization,
  KurbanCuttingLocation,
  KurbanParty,
  KurbanContract,
  KurbanShipment,
  KurbanSlaughterBatch,
  KurbanStorageRecord,
  KurbanDelivery,
  KurbanInvoice,
  KurbanDocument,
  KurbanReport,
  KurbanAnimal,
} from "../types/kurbanProcess";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KURBAN_STATE_IDENTIFIER = "__KURBAN_PROCESS_STATE_V2__";
const KURBAN_STATE_STATUS = "kurban_process_state";
const LOCAL_DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_STATE_FILE = path.join(LOCAL_DATA_DIR, "kurban_process_state.json");
const TMP_STATE_FILE = path.join(os.tmpdir(), "easy_kurban_process_state_v2.json");

export interface KurbanPersistentState {
  isCustomized: boolean;
  mockAnimalsCleaned?: boolean;
  deletedIds: string[];
  organization: KurbanProcessOrganization;
  parties: KurbanParty[];
  contracts: KurbanContract[];
  cuttingLocations: KurbanCuttingLocation[];
  animals?: KurbanAnimal[];
  shipments: KurbanShipment[];
  slaughterBatches: KurbanSlaughterBatch[];
  storageRecords: KurbanStorageRecord[];
  invoices: KurbanInvoice[];
  deliveries: KurbanDelivery[];
  documents: KurbanDocument[];
  reports: KurbanReport[];
  updatedAt: string;
}

export function isUUID(val?: string | null): boolean {
  return typeof val === "string" && UUID_REGEX.test(val);
}

export function ensureUUID(val?: string | null): string {
  if (val && isUUID(val)) return val;
  return crypto.randomUUID();
}

export function deterministicUUID(seed: string): string {
  const hash = crypto.createHash("sha256").update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function getSupabaseServerClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qcndlfastbrezugknkho.supabase.co";

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export function createDefaultPersistentState(): KurbanPersistentState {
  return {
    isCustomized: false,
    mockAnimalsCleaned: true,
    deletedIds: [],
    organization: { ...SEED_ORGANIZATION, targetAnimalCount: 0 },
    parties: [...SEED_PARTIES],
    contracts: [{ ...SEED_CONTRACT, animalCount: 0 }],
    cuttingLocations: SEED_CUTTING_LOCATIONS.map((loc) => ({
      ...loc,
      allocatedAnimalCount: 0,
    })),
    animals: [],
    shipments: [],
    slaughterBatches: [],
    storageRecords: [],
    invoices: [...SEED_INVOICES],
    deliveries: [],
    documents: [...SEED_DOCUMENTS],
    reports: JSON.parse(JSON.stringify(SEED_REPORTS)),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Load persistent Kurban state from local/tmp file cache
 */
async function loadStateFromFile(): Promise<KurbanPersistentState | null> {
  try {
    const raw = await fs.readFile(TMP_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.organization) return parsed;
  } catch {
    // ignore
  }

  try {
    const raw = await fs.readFile(LOCAL_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.organization) return parsed;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Save persistent Kurban state to local/tmp file cache safely
 */
async function saveStateToFile(state: KurbanPersistentState): Promise<void> {
  const content = JSON.stringify(state, null, 2);
  try {
    await fs.writeFile(TMP_STATE_FILE, content, "utf-8");
  } catch {
    // ignore
  }
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    await fs.writeFile(LOCAL_STATE_FILE, content, "utf-8");
  } catch {
    // ignore on read-only serverless fs
  }
}

/**
 * Load persistent Kurban state from Supabase `proposals` table (cloud key-value store)
 */
export async function loadKurbanPersistentState(
  supabaseClient?: any
): Promise<KurbanPersistentState | null> {
  const supabase = supabaseClient || getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, proposal_number")
        .eq("status", KURBAN_STATE_STATUS)
        .order("id", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const raw: string = data[0].proposal_number || "";
        const sepIdx = raw.indexOf("::");
        if (sepIdx !== -1) {
          const jsonStr = raw.substring(sepIdx + 2);
          const parsed = JSON.parse(jsonStr);
          if (parsed && parsed.organization) {
            const normalized: KurbanPersistentState = {
              ...createDefaultPersistentState(),
              ...parsed,
              isCustomized: Boolean(parsed.isCustomized ?? true),
              deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
            };
            saveStateToFile(normalized).catch(() => {});
            return normalized;
          }
        }
      }
    } catch (err) {
      console.warn("loadKurbanPersistentState supabase warning:", err);
    }
  }

  return await loadStateFromFile();
}

/**
 * Save persistent Kurban state to Supabase `proposals` table + tmp/local file cache
 */
export async function saveKurbanPersistentState(
  state: KurbanPersistentState,
  supabaseClient?: any
): Promise<boolean> {
  const updatedState: KurbanPersistentState = {
    ...state,
    isCustomized: true,
    deletedIds: Array.from(new Set(state.deletedIds || [])),
    updatedAt: new Date().toISOString(),
  };

  await saveStateToFile(updatedState);

  const supabase = supabaseClient || getSupabaseServerClient();
  if (!supabase) return false;

  try {
    const packedValue = `${KURBAN_STATE_IDENTIFIER}::${JSON.stringify(updatedState)}`;
    const payload = {
      customer_id: null,
      proposal_number: packedValue,
      status: KURBAN_STATE_STATUS,
      total_amount: 0,
    };

    const { data: existing } = await supabase
      .from("proposals")
      .select("id")
      .eq("status", KURBAN_STATE_STATUS)
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: updateErr } = await supabase
        .from("proposals")
        .update(payload)
        .eq("id", existing[0].id);

      if (!updateErr) return true;
      console.warn("saveKurbanPersistentState update warning:", updateErr);
    } else {
      const { error: insertErr } = await supabase
        .from("proposals")
        .insert(payload);

      if (!insertErr) return true;
      console.warn("saveKurbanPersistentState insert warning:", insertErr);
    }
  } catch (err) {
    console.warn("saveKurbanPersistentState exception:", err);
  }

  return false;
}

/**
 * Resolves a valid UUID organization ID from Supabase or creates the default parent row if empty.
 */
export async function getActiveOrganizationId(
  supabase: any,
  incomingOrgId?: string | null
): Promise<string> {
  if (supabase) {
    try {
      if (incomingOrgId && isUUID(incomingOrgId)) {
        const { data: match } = await supabase
          .from("kurban_process_organizations")
          .select("id")
          .eq("id", incomingOrgId)
          .limit(1);
        if (match && match.length > 0 && match[0].id) {
          return match[0].id;
        }
      }

      const { data } = await supabase
        .from("kurban_process_organizations")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].id) {
        return data[0].id;
      }

      // If table exists but is empty, insert the parent organization row so FK references succeed
      const persisted = await loadKurbanPersistentState(supabase);
      const orgToInsert = persisted?.organization || SEED_ORGANIZATION;
      const orgId = ensureUUID(orgToInsert.id);
      const { error: insertErr } = await supabase
        .from("kurban_process_organizations")
        .upsert({
          id: orgId,
          name: orgToInsert.name,
          client_company_name: orgToInsert.clientCompanyName,
          client_tax_no: orgToInsert.clientTaxNo || null,
          client_tax_office: orgToInsert.clientTaxOffice || null,
          client_address: orgToInsert.clientAddress || null,
          client_contact: orgToInsert.clientContact || null,
          start_date: orgToInsert.startDate || null,
          end_date: orgToInsert.endDate || null,
          target_animal_count: orgToInsert.targetAnimalCount || 350,
          status: orgToInsert.status || "in_progress",
          description: orgToInsert.description || null,
          general_notes: orgToInsert.generalNotes || null,
        });
      if (!insertErr) return orgId;
    } catch (e) {
      console.warn("Could not query kurban_process_organizations:", e);
    }
  }

  if (incomingOrgId && isUUID(incomingOrgId)) {
    return incomingOrgId;
  }

  return SEED_ORGANIZATION_ID;
}

/**
 * Resolves a valid UUID cutting location ID from Supabase or fallback
 */
export async function getActiveLocationId(
  supabase: any,
  incomingLocId?: string | null
): Promise<string> {
  if (supabase) {
    try {
      if (incomingLocId && isUUID(incomingLocId)) {
        const { data: match } = await supabase
          .from("kurban_cutting_locations")
          .select("id")
          .eq("id", incomingLocId)
          .limit(1);
        if (match && match.length > 0 && match[0].id) {
          return match[0].id;
        }
      }

      const { data } = await supabase
        .from("kurban_cutting_locations")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1);

      if (data && data.length > 0 && data[0].id) {
        return data[0].id;
      }
    } catch (e) {
      console.warn("Could not query kurban_cutting_locations:", e);
    }
  }

  if (incomingLocId && isUUID(incomingLocId)) {
    return incomingLocId;
  }

  return SEED_LOC_TUZLA_ID;
}

/**
 * Ensures ONLY that the parent organization exists in Supabase if relational tables are used.
 * IMPORTANT: NEVER auto-reseeds or overwrites cutting locations, parties, or reports on GET!
 */
export async function ensureDatabaseReady(supabase: any): Promise<string> {
  if (!supabase) return SEED_ORGANIZATION_ID;

  try {
    const { data: orgData, error: orgErr } = await supabase
      .from("kurban_process_organizations")
      .select("id")
      .limit(1);

    if (!orgErr && orgData && orgData.length > 0) {
      return orgData[0].id;
    }

    const persisted = await loadKurbanPersistentState(supabase);
    const org = persisted?.organization || SEED_ORGANIZATION;
    const activeOrgId = ensureUUID(org.id);

    await supabase.from("kurban_process_organizations").upsert({
      id: activeOrgId,
      name: org.name,
      client_company_name: org.clientCompanyName,
      client_tax_no: org.clientTaxNo,
      client_tax_office: org.clientTaxOffice,
      client_address: org.clientAddress,
      client_contact: org.clientContact,
      start_date: org.startDate,
      end_date: org.endDate,
      target_animal_count: org.targetAnimalCount,
      status: org.status,
      description: org.description,
      general_notes: org.generalNotes,
    });

    return activeOrgId;
  } catch (err) {
    console.warn("ensureDatabaseReady warning:", err);
    return SEED_ORGANIZATION_ID;
  }
}

let legacyMockAnimalsCleanedInSession = false;

/**
 * Deletes any legacy mock animals (IDs 10000000-0000-4000-a000-* and 20000000-0000-4000-a000-*)
 * from the Supabase `kurban_animals` table so mock animals never appear again.
 */
export async function cleanupLegacyMockAnimals(supabase: any): Promise<void> {
  if (!supabase || legacyMockAnimalsCleanedInSession) return;
  legacyMockAnimalsCleanedInSession = true;
  try {
    await supabase
      .from("kurban_animals")
      .delete()
      .gte("id", "10000000-0000-4000-a000-000000000000")
      .lte("id", "10000000-0000-4000-a000-000000000999");
    await supabase
      .from("kurban_animals")
      .delete()
      .gte("id", "20000000-0000-4000-a000-000000000000")
      .lte("id", "20000000-0000-4000-a000-000000000999");
  } catch (err) {
    console.warn("cleanupLegacyMockAnimals warning:", err);
  }
}

/**
 * Ensures that active cutting locations (and slaughterhouse parties) from KurbanPersistentState
 * exist in `kurban_cutting_locations` in Supabase so `cutting_location_id` FK references on `kurban_animals` succeed.
 * Returns the Set of valid location UUIDs present in `kurban_cutting_locations`.
 */
export async function ensureLocationsExistInDb(
  supabase: any,
  activeOrgId: string
): Promise<Set<string>> {
  const validIds = new Set<string>();
  if (!supabase) return validIds;

  try {
    const persisted = await loadKurbanPersistentState(supabase);
    const locationsToSync: KurbanCuttingLocation[] = [];

    if (persisted) {
      for (const loc of persisted.cuttingLocations || []) {
        if (loc.id && isUUID(loc.id)) {
          locationsToSync.push(loc);
        }
      }
      for (const p of (persisted.parties || []).filter((x) => x.partyType === "slaughterhouse")) {
        if (p.id && isUUID(p.id) && !locationsToSync.some((l) => l.id === p.id)) {
          locationsToSync.push({
            id: p.id,
            organizationId: activeOrgId,
            name: p.name,
            locationCode: `KSM-0${locationsToSync.length + 1}`,
            city: p.city || "İstanbul",
            address: p.address || "",
            responsiblePerson: p.authorizedPerson || "",
            responsiblePhone: p.phone || "",
            officialApprovalNo: p.taxId || "",
            veterinaryName: p.authorizedPerson || "",
            dailyCapacity: 200,
            allocatedAnimalCount: 0,
            notes: p.notes || "",
            createdAt: p.createdAt || new Date().toISOString(),
          });
        }
      }
    }

    for (const loc of locationsToSync) {
      await supabase.from("kurban_cutting_locations").upsert({
        id: loc.id,
        organization_id: activeOrgId,
        name: loc.name,
        location_code: loc.locationCode || "KSM-01",
        city: loc.city || "İstanbul",
        address: loc.address || null,
        responsible_person: loc.responsiblePerson || null,
        responsible_phone: loc.responsiblePhone || null,
        official_approval_no: loc.officialApprovalNo || null,
        veterinary_name: loc.veterinaryName || null,
        daily_capacity: loc.dailyCapacity || 200,
        allocated_animal_count: loc.allocatedAnimalCount || 0,
        notes: loc.notes || null,
      });
    }

    const { data } = await supabase.from("kurban_cutting_locations").select("id");
    if (data && Array.isArray(data)) {
      for (const row of data) {
        if (row.id) validIds.add(row.id);
      }
    }
  } catch (err) {
    console.warn("ensureLocationsExistInDb warning:", err);
  }

  return validIds;
}

/**
 * Safely deletes a cutting location from relational tables by first cleaning up or reassigning child FK references.
 */
export async function safeDeleteLocationFromDb(
  supabase: any,
  locationId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !isUUID(locationId)) {
    return { success: true };
  }

  try {
    // Find an alternative location if any child table has a NOT NULL constraint on location_id
    const { data: otherLocs } = await supabase
      .from("kurban_cutting_locations")
      .select("id")
      .neq("id", locationId)
      .limit(1);
    const fallbackLocId = otherLocs && otherLocs.length > 0 ? otherLocs[0].id : null;

    // 1. Nullify or reassign animals
    await supabase
      .from("kurban_animals")
      .update({ cutting_location_id: fallbackLocId })
      .eq("cutting_location_id", locationId);

    // 2. Nullify or delete shipments referencing this location
    const { error: shpUpdateErr } = await supabase
      .from("kurban_shipments")
      .update({ destination_location_id: fallbackLocId })
      .eq("destination_location_id", locationId);
    if (shpUpdateErr) {
      await supabase.from("kurban_shipments").delete().eq("destination_location_id", locationId);
    }

    // 3. Nullify or delete slaughter batches referencing this location
    const { error: slgUpdateErr } = await supabase
      .from("kurban_slaughter_batches")
      .update({ cutting_location_id: fallbackLocId })
      .eq("cutting_location_id", locationId);
    if (slgUpdateErr) {
      await supabase.from("kurban_slaughter_batches").delete().eq("cutting_location_id", locationId);
    }

    // 4. Nullify or delete storage records referencing this location
    const { error: stgUpdateErr } = await supabase
      .from("kurban_storage_records")
      .update({ cutting_location_id: fallbackLocId })
      .eq("cutting_location_id", locationId);
    if (stgUpdateErr) {
      await supabase.from("kurban_storage_records").delete().eq("cutting_location_id", locationId);
    }

    // 5. Nullify or delete deliveries referencing this location
    const { error: delUpdateErr } = await supabase
      .from("kurban_deliveries")
      .update({ cutting_location_id: fallbackLocId })
      .eq("cutting_location_id", locationId);
    if (delUpdateErr) {
      await supabase.from("kurban_deliveries").delete().eq("cutting_location_id", locationId);
    }

    // 6. Nullify or delete invoices referencing this location
    const { error: invUpdateErr } = await supabase
      .from("kurban_invoices")
      .update({ cutting_location_id: null })
      .eq("cutting_location_id", locationId);
    if (invUpdateErr) {
      await supabase.from("kurban_invoices").delete().eq("cutting_location_id", locationId);
    }

    // 7. Nullify or delete documents referencing this location
    const { error: docUpdateErr } = await supabase
      .from("kurban_documents")
      .update({ cutting_location_id: null })
      .eq("cutting_location_id", locationId);
    if (docUpdateErr) {
      await supabase.from("kurban_documents").delete().eq("cutting_location_id", locationId);
    }

    // 8. Delete report sections & reports tied to this cutting location
    const { data: locReports } = await supabase
      .from("kurban_reports")
      .select("id")
      .eq("cutting_location_id", locationId);

    if (locReports && locReports.length > 0) {
      const repIds = locReports.map((r: any) => r.id);
      await supabase.from("kurban_report_sections").delete().in("report_id", repIds);
      await supabase.from("kurban_report_revisions").delete().in("report_id", repIds);
      await supabase.from("kurban_reports").delete().in("id", repIds);
    }

    // 9. Finally delete the cutting location itself
    const { error: delLocErr } = await supabase
      .from("kurban_cutting_locations")
      .delete()
      .eq("id", locationId);

    if (delLocErr) {
      console.warn("safeDeleteLocationFromDb delete warning:", delLocErr);
      return { success: false, error: delLocErr.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn("safeDeleteLocationFromDb exception:", err);
    return { success: false, error: err?.message };
  }
}

// ---------------------------------------------------------------------------
// DB Row to Domain Object Mappers (snake_case -> camelCase)
// ---------------------------------------------------------------------------

export function mapLocationFromDb(row: any): KurbanCuttingLocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    locationCode: row.location_code || "",
    city: row.city || "İstanbul",
    address: row.address || "",
    responsiblePerson: row.responsible_person || "",
    responsiblePhone: row.responsible_phone || "",
    officialApprovalNo: row.official_approval_no || "",
    veterinaryName: row.veterinary_name || "",
    dailyCapacity: Number(row.daily_capacity) || 0,
    allocatedAnimalCount: Number(row.allocated_animal_count) || 0,
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapPartyFromDb(row: any): KurbanParty {
  return {
    id: row.id,
    organizationId: row.organization_id,
    partyType: row.party_type || "supplier_seller",
    name: row.name || "",
    taxId: row.tax_id || "",
    taxOffice: row.tax_office || "",
    phone: row.phone || "",
    email: row.email || "",
    city: row.city || "",
    address: row.address || "",
    authorizedPerson: row.authorized_person || "",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapShipmentFromDb(
  row: any,
  locationsMap?: Map<string, string>
): KurbanShipment {
  const locName =
    locationsMap?.get(row.destination_location_id) ||
    row.kurban_cutting_locations?.name ||
    undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    destinationLocationId: row.destination_location_id,
    destinationLocationName: locName,
    shipmentNo: row.shipment_no || "",
    shipmentDate: row.shipment_date || new Date().toISOString().split("T")[0],
    originAddress: row.origin_address || "",
    carrierCompany: row.carrier_company || "",
    vehiclePlate: row.vehicle_plate || "",
    driverName: row.driver_name || "",
    driverPhone: row.driver_phone || "",
    animalCount: Number(row.animal_count) || 0,
    shippingCost: Number(row.shipping_cost) || 0,
    shippingInvoiceNo: row.shipping_invoice_no || "",
    dispatchNoteNo: row.dispatch_note_no || "",
    vetHealthReportNo: row.vet_health_report_no || "",
    status: row.status || "delivered_to_slaughterhouse",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapSlaughterBatchFromDb(
  row: any,
  locationsMap?: Map<string, string>
): KurbanSlaughterBatch {
  const locName =
    locationsMap?.get(row.cutting_location_id) ||
    row.kurban_cutting_locations?.name ||
    undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    cuttingLocationName: locName,
    batchNo: row.batch_no || "",
    slaughterDate: row.slaughter_date || new Date().toISOString().split("T")[0],
    slaughterTime: row.slaughter_time || "",
    animalCount: Number(row.animal_count) || 0,
    totalCarcassWeightKg: Number(row.total_carcass_weight_kg) || 0,
    responsiblePerson: row.responsible_person || "",
    butcherTeam: row.butcher_team || "",
    veterinaryApproval: Boolean(row.veterinary_approval ?? true),
    officialProtocolNo: row.official_protocol_no || "",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapStorageRecordFromDb(
  row: any,
  locationsMap?: Map<string, string>
): KurbanStorageRecord {
  const locName =
    locationsMap?.get(row.cutting_location_id) ||
    row.kurban_cutting_locations?.name ||
    undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    cuttingLocationName: locName,
    storageCompany: row.storage_company || "",
    warehouseName: row.warehouse_name || "",
    warehouseAddress: row.warehouse_address || "",
    entryDate: row.entry_date || new Date().toISOString().split("T")[0],
    exitDate: row.exit_date || undefined,
    productType: row.product_type || "Karkas / Parçalanmış Soğuk Sığır Eti",
    storedQuantityKg: Number(row.stored_quantity_kg) || 0,
    remainingQuantityKg:
      Number(row.remaining_quantity_kg ?? row.stored_quantity_kg) || 0,
    entryDispatchNo: row.entry_dispatch_no || "",
    exitDispatchNo: row.exit_dispatch_no || "",
    invoiceNo: row.invoice_no || "",
    invoiceDate: row.invoice_date || undefined,
    invoiceAmount: Number(row.invoice_amount) || 0,
    temperatureCelsius: Number(row.temperature_celsius) || 4.0,
    status: row.status || "in_storage",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapDeliveryFromDb(
  row: any,
  locationsMap?: Map<string, string>
): KurbanDelivery {
  const locName =
    locationsMap?.get(row.cutting_location_id) ||
    row.kurban_cutting_locations?.name ||
    undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    cuttingLocationName: locName,
    deliveryNo: row.delivery_no || "",
    recipientCompany: row.recipient_company || "",
    deliveryDate: row.delivery_date || new Date().toISOString().split("T")[0],
    deliveredQuantityKg: Number(row.delivered_quantity_kg) || 0,
    deliveredAnimalCount: Number(row.delivered_animal_count) || 0,
    outgoingInvoiceNo: row.outgoing_invoice_no || "",
    dispatchNoteNo: row.dispatch_note_no || "",
    deliveryAddress: row.delivery_address || "",
    recipientPerson: row.recipient_person || "",
    deliveredByPerson: row.delivered_by_person || "",
    transportType: row.transport_type || "company_vehicle",
    vehiclePlate: row.vehicle_plate || "",
    driverName: row.driver_name || "",
    transportCost: Number(row.transport_cost) || 0,
    status: row.status || "completed",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapInvoiceFromDb(
  row: any,
  locationsMap?: Map<string, string>
): KurbanInvoice {
  const locName =
    locationsMap?.get(row.cutting_location_id) ||
    row.kurban_cutting_locations?.name ||
    undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    cuttingLocationName: locName,
    invoiceType: row.invoice_type || "other",
    invoiceNo: row.invoice_no || "",
    invoiceDate: row.invoice_date || new Date().toISOString().split("T")[0],
    issuerCompany: row.issuer_company || "",
    recipientCompany: row.recipient_company || "",
    subtotal: Number(row.subtotal) || 0,
    vatRate: Number(row.vat_rate) || 1,
    vatAmount: Number(row.vat_amount) || 0,
    totalAmount: Number(row.total_amount) || 0,
    description: row.description || "",
    fileUrl: row.file_url || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapDocumentFromDb(row: any): KurbanDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    category: row.category || "contract_doc",
    title: row.title || "",
    description: row.description || "",
    fileUrl: row.file_url || "",
    fileName: row.file_name || undefined,
    mimeType: row.mime_type || undefined,
    relatedEntityType: row.related_entity_type || undefined,
    relatedEntityId: row.related_entity_id || undefined,
    uploadedAt: row.uploaded_at || new Date().toISOString(),
  };
}

export function mapReportFromDb(
  row: any,
  locationsMap?: Map<string, string>
): KurbanReport {
  const locName =
    locationsMap?.get(row.cutting_location_id) ||
    row.kurban_cutting_locations?.name ||
    undefined;

  const sections = (row.kurban_report_sections || [])
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s: any) => ({
      id: s.id,
      reportId: s.report_id,
      sectionKey: s.section_key,
      sectionTitle: s.section_title,
      orderIndex: s.order_index,
      isEnabled: Boolean(s.is_enabled ?? true),
      contentHtml: s.content_html || "",
      customNotes: s.custom_notes || "",
      includeTables: Boolean(s.include_tables ?? true),
      pageBreakAfter: Boolean(s.page_break_after ?? false),
      createdAt: s.created_at || new Date().toISOString(),
    }));

  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    cuttingLocationName: locName,
    reportNo: row.report_no || "",
    title: row.title || "",
    reportDate: row.report_date || new Date().toISOString().split("T")[0],
    reportPeriod: row.report_period || "",
    preparedBy: row.prepared_by || "",
    status: row.status || "draft",
    clientCompanyName: row.client_company_name || "",
    executiveSummary: row.executive_summary || "",
    evaluationNotes: row.evaluation_notes || "",
    finalResultSummary: row.final_result_summary || "",
    metadata: row.metadata || {},
    sections,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function mapAnimalFromDb(row: any): KurbanAnimal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    cuttingLocationId: row.cutting_location_id,
    earTagNo: row.ear_tag_no,
    animalType: row.animal_type || "buyukbas_tosun",
    animalTypeLabel: row.animal_type_label || "Büyükbaş Tosun",
    breed: row.breed || "Simental",
    gender: row.gender || "male",
    birthDate: row.birth_date || undefined,
    ageMonths: Number(row.age_months) || 24,
    passportNo: row.passport_no || undefined,
    farmRegNo: row.farm_reg_no || undefined,
    farmName: row.farm_name || undefined,
    healthDocNo: row.health_doc_no || undefined,
    passportFileUrl: row.passport_file_url || undefined,
    healthDocFileUrl: row.health_doc_file_url || undefined,
    liveWeightKg: Number(row.live_weight_kg) || 0,
    carcassWeightKg: Number(row.carcass_weight_kg) || 0,
    status: row.status || "purchased",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

const LEGACY_PARTY_TO_LOCATION_ID: Record<string, string> = {
  "30000000-0000-4000-a000-000000000004": "f4779128-11e4-4593-93de-ff811c1bbfc9",
  "30000000-0000-4000-a000-000000000005": "e289c564-901a-4d76-b631-0e4c6b8f3a21",
};

function isMockSeedProcessId(id: string | undefined | null, prefix: string): boolean {
  return typeof id === "string" && id.startsWith(prefix);
}

/**
 * Build a deterministic 10-section official report for a cutting location.
 */
export function createReportForLocation(
  loc: KurbanCuttingLocation,
  org: KurbanProcessOrganization,
  index: number
): KurbanReport {
  const reportId = deterministicUUID(`kurban-report:${loc.id}`);
  const baseTemplate = SEED_REPORTS[0];
  const sections = (baseTemplate?.sections || []).map((sec, idx) => ({
    ...sec,
    id: deterministicUUID(`kurban-report-section:${reportId}:${sec.sectionKey || idx}:${idx}`),
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

/**
 * Derives and synchronizes `state.cuttingLocations` and `state.reports` directly from
 * `state.parties` where `partyType === "slaughterhouse"`.
 */
export function syncLocationsWithSlaughterhouseParties(
  state: KurbanPersistentState
): KurbanPersistentState {
  const deletedSet = new Set(state.deletedIds || []);
  const existingLocations = state.cuttingLocations || [];

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

  const derivedLocations: KurbanCuttingLocation[] = slaughterhouseParties.map((p, idx) => {
    const existingLoc =
      existingLocations.find((l) => l.id === p.id) ||
      existingLocations.find(
        (l) => l.name.trim().toLowerCase() === p.name.trim().toLowerCase()
      );

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
 * Loads Kurban state from Supabase relational tables when persistent JSON state is not yet initialized.
 */
export async function loadRelationalFallbackState(
  supabase: any,
  totalAnimalCount = 0
): Promise<KurbanPersistentState | null> {
  if (!supabase) return null;

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

    if (!hasRelationalData) return null;

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
          targetAnimalCount: totalAnimalCount > 0 ? totalAnimalCount : Number(activeOrgRow.target_animal_count) || 0,
          status: activeOrgRow.status || "in_progress",
          description: activeOrgRow.description || "",
          generalNotes: activeOrgRow.general_notes || "",
          createdAt: activeOrgRow.created_at || new Date().toISOString(),
          updatedAt: activeOrgRow.updated_at || new Date().toISOString(),
        }
      : { ...SEED_ORGANIZATION, targetAnimalCount: totalAnimalCount };

    const locationsMap = new Map<string, string>();
    const cuttingLocations: KurbanCuttingLocation[] = (locsRes.data || []).map((row: any) => {
      const loc = mapLocationFromDb(row);
      locationsMap.set(loc.id, loc.name);
      return loc;
    });

    const parties: KurbanParty[] = (partiesRes.data || []).map(mapPartyFromDb);
    const shipments: KurbanShipment[] =
      shipmentsRes.data && shipmentsRes.data.length > 0
        ? shipmentsRes.data
            .map((r: any) => mapShipmentFromDb(r, locationsMap))
            .filter((s: KurbanShipment) => !isMockSeedProcessId(s.id, "40000000-0000-4000-a000-"))
        : [];
    const slaughterBatches: KurbanSlaughterBatch[] =
      slaughtersRes.data && slaughtersRes.data.length > 0
        ? slaughtersRes.data
            .map((r: any) => mapSlaughterBatchFromDb(r, locationsMap))
            .filter((b: KurbanSlaughterBatch) => !isMockSeedProcessId(b.id, "50000000-0000-4000-a000-"))
        : [];
    const storageRecords: KurbanStorageRecord[] =
      storagesRes.data && storagesRes.data.length > 0
        ? storagesRes.data
            .map((r: any) => mapStorageRecordFromDb(r, locationsMap))
            .filter((sr: KurbanStorageRecord) => !isMockSeedProcessId(sr.id, "60000000-0000-4000-a000-"))
        : [];
    const deliveries: KurbanDelivery[] =
      deliveriesRes.data && deliveriesRes.data.length > 0
        ? deliveriesRes.data
            .map((r: any) => mapDeliveryFromDb(r, locationsMap))
            .filter((d: KurbanDelivery) => !isMockSeedProcessId(d.id, "70000000-0000-4000-a000-"))
        : [];
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

    return syncLocationsWithSlaughterhouseParties({
      isCustomized: false,
      deletedIds: [],
      organization,
      parties,
      contracts: [{ ...SEED_CONTRACT, animalCount: totalAnimalCount }],
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
  } catch (err) {
    console.warn("loadRelationalFallbackState warning:", err);
    return null;
  }
}
