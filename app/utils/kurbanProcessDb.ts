import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  SEED_ORGANIZATION,
  SEED_ORGANIZATION_ID,
  SEED_CUTTING_LOCATIONS,
  SEED_LOC_TUZLA_ID,
  SEED_LOC_KOCAELI_ID,
  SEED_PARTIES,
  SEED_CONTRACT,
  SEED_REPORTS,
  SEED_ANIMALS,
} from "./kurbanProcessSeed";
import {
  KurbanCuttingLocation,
  KurbanParty,
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

export function isUUID(val?: string | null): boolean {
  return typeof val === "string" && UUID_REGEX.test(val);
}

export function ensureUUID(val?: string | null): string {
  if (val && isUUID(val)) return val;
  return crypto.randomUUID();
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

/**
 * Resolves a valid UUID organization ID from Supabase or fallback to SEED_ORGANIZATION_ID
 */
export async function getActiveOrganizationId(
  supabase: any,
  incomingOrgId?: string | null
): Promise<string> {
  if (incomingOrgId && isUUID(incomingOrgId)) {
    return incomingOrgId;
  }

  if (supabase) {
    try {
      const { data } = await supabase
        .from("kurban_process_organizations")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].id) {
        return data[0].id;
      }
    } catch (e) {
      console.warn("Could not query kurban_process_organizations:", e);
    }
  }

  return SEED_ORGANIZATION_ID;
}

/**
 * Resolves a valid UUID cutting location ID from Supabase or fallback to SEED_LOC_TUZLA_ID
 */
export async function getActiveLocationId(
  supabase: any,
  incomingLocId?: string | null
): Promise<string> {
  if (incomingLocId && isUUID(incomingLocId)) {
    return incomingLocId;
  }

  if (supabase) {
    try {
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

  return SEED_LOC_TUZLA_ID;
}

/**
 * Ensures primary organization and default cutting locations exist in Supabase
 */
export async function ensureDatabaseReady(supabase: any): Promise<string> {
  if (!supabase) return SEED_ORGANIZATION_ID;

  try {
    // 1. Check organizations
    const { data: orgData, error: orgErr } = await supabase
      .from("kurban_process_organizations")
      .select("id")
      .limit(1);

    let activeOrgId = SEED_ORGANIZATION_ID;

    if (orgErr || !orgData || orgData.length === 0) {
      console.log("Seeding primary organization to Supabase...");
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
      activeOrgId = SEED_ORGANIZATION.id;
    } else {
      activeOrgId = orgData[0].id;
    }

    // 2. Check cutting locations
    const { data: locData } = await supabase
      .from("kurban_cutting_locations")
      .select("id")
      .limit(1);

    if (!locData || locData.length === 0) {
      console.log("Seeding cutting locations to Supabase...");
      for (const loc of SEED_CUTTING_LOCATIONS) {
        await supabase.from("kurban_cutting_locations").upsert({
          id: loc.id,
          organization_id: activeOrgId,
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
    }

    // 3. Check parties
    const { data: partyData } = await supabase
      .from("kurban_parties")
      .select("id")
      .limit(1);

    if (!partyData || partyData.length === 0) {
      console.log("Seeding parties to Supabase...");
      for (const p of SEED_PARTIES) {
        await supabase.from("kurban_parties").upsert({
          id: p.id,
          organization_id: activeOrgId,
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
    }

    return activeOrgId;
  } catch (err) {
    console.warn("ensureDatabaseReady warning:", err);
    return SEED_ORGANIZATION_ID;
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
