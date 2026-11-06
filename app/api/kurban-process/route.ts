import { NextResponse } from "next/server";
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

// In-memory fallback cache if Supabase is offline
let inMemoryStore = {
  organizations: [SEED_ORGANIZATION],
  parties: [...SEED_PARTIES],
  contracts: [SEED_CONTRACT],
  locations: [...SEED_CUTTING_LOCATIONS],
  animals: [...SEED_ANIMALS],
  shipments: [...SEED_SHIPMENTS],
  slaughterBatches: [...SEED_SLAUGHTER_BATCHES],
  storageRecords: [...SEED_STORAGE_RECORDS],
  invoices: [...SEED_INVOICES],
  deliveries: [...SEED_DELIVERIES],
  documents: [...SEED_DOCUMENTS],
  reports: [...SEED_REPORTS],
};

/**
 * GET: Full process data overview with stats, locations, and reports
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");

  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      await ensureDatabaseReady(supabase);

      const { data: orgData, error: orgErr } = await supabase
        .from("kurban_process_organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (!orgErr && orgData && orgData.length > 0) {
        // Fetch all tables in parallel
        const [
          locsRes,
          partiesRes,
          shipmentsRes,
          slaughtersRes,
          storagesRes,
          deliveriesRes,
          invoicesRes,
          docsRes,
          reportsRes,
          animalsCountRes,
        ] = await Promise.all([
          supabase.from("kurban_cutting_locations").select("*").order("location_code", { ascending: true }),
          supabase.from("kurban_parties").select("*").order("name", { ascending: true }),
          supabase.from("kurban_shipments").select("*").order("shipment_date", { ascending: false }),
          supabase.from("kurban_slaughter_batches").select("*").order("slaughter_date", { ascending: false }),
          supabase.from("kurban_storage_records").select("*").order("entry_date", { ascending: false }),
          supabase.from("kurban_deliveries").select("*").order("delivery_date", { ascending: false }),
          supabase.from("kurban_invoices").select("*").order("invoice_date", { ascending: false }),
          supabase.from("kurban_documents").select("*").order("uploaded_at", { ascending: false }),
          supabase.from("kurban_reports").select("*, kurban_report_sections(*)").order("report_no", { ascending: true }),
          supabase.from("kurban_animals").select("id", { count: "exact", head: true }),
        ]);

        // Map locations first for lookup
        const locationsMap = new Map<string, string>();
        const cuttingLocations: KurbanCuttingLocation[] = (locsRes.data || []).map((row: any) => {
          const loc = mapLocationFromDb(row);
          locationsMap.set(loc.id, loc.name);
          return loc;
        });

        const parties: KurbanParty[] = (partiesRes.data || []).map(mapPartyFromDb);
        const shipments: KurbanShipment[] = (shipmentsRes.data || []).map((r: any) =>
          mapShipmentFromDb(r, locationsMap)
        );
        const slaughterBatches: KurbanSlaughterBatch[] = (slaughtersRes.data || []).map((r: any) =>
          mapSlaughterBatchFromDb(r, locationsMap)
        );
        const storageRecords: KurbanStorageRecord[] = (storagesRes.data || []).map((r: any) =>
          mapStorageRecordFromDb(r, locationsMap)
        );
        const deliveries: KurbanDelivery[] = (deliveriesRes.data || []).map((r: any) =>
          mapDeliveryFromDb(r, locationsMap)
        );
        const invoices: KurbanInvoice[] = (invoicesRes.data || []).map((r: any) =>
          mapInvoiceFromDb(r, locationsMap)
        );
        const documents: KurbanDocument[] = (docsRes.data || []).map(mapDocumentFromDb);
        const reports: KurbanReport[] = (reportsRes.data || []).map((r: any) =>
          mapReportFromDb(r, locationsMap)
        );

        // Filter by location if specified
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
          filteredReports = reports.filter((rep) => rep.cuttingLocationId === locationId);
        }

        const totalShipped = filteredShipments.reduce((acc, s) => acc + s.animalCount, 0);
        const totalSlaughtered = filteredSlaughters.reduce((acc, b) => acc + b.animalCount, 0);
        const totalCarcass = filteredSlaughters.reduce((acc, b) => acc + b.totalCarcassWeightKg, 0);
        const totalStoredKg = filteredStorage.reduce((acc, st) => acc + st.storedQuantityKg, 0);
        const totalDeliveredKg = filteredDeliveries.reduce((acc, d) => acc + d.deliveredQuantityKg, 0);
        const totalInvoiceAmount = filteredInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
        const totalAnimalCount = animalsCountRes.count || inMemoryStore.animals.length;

        const activeOrg = orgData[0];
        const targetCount = activeOrg.target_animal_count || 350;

        return NextResponse.json({
          success: true,
          source: "supabase",
          organization: {
            id: activeOrg.id,
            name: activeOrg.name,
            clientCompanyName: activeOrg.client_company_name,
            clientTaxNo: activeOrg.client_tax_no,
            clientTaxOffice: activeOrg.client_tax_office,
            clientAddress: activeOrg.client_address,
            clientContact: activeOrg.client_contact,
            startDate: activeOrg.start_date,
            endDate: activeOrg.end_date,
            targetAnimalCount: activeOrg.target_animal_count,
            status: activeOrg.status,
            description: activeOrg.description,
            generalNotes: activeOrg.general_notes,
            createdAt: activeOrg.created_at,
            updatedAt: activeOrg.updated_at,
          },
          organizations: orgData,
          cuttingLocations,
          parties,
          shipments: filteredShipments,
          slaughterBatches: filteredSlaughters,
          storageRecords: filteredStorage,
          deliveries: filteredDeliveries,
          invoices: filteredInvoices,
          documents,
          reports: filteredReports,
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
            totalDocumentsCount: documents.length,
            missingDocumentsCount: 0,
            discrepancies: {
              unshippedAnimals: Math.max(0, totalAnimalCount - totalShipped),
              unslaughteredShippedAnimals: Math.max(0, totalShipped - totalSlaughtered),
              unstoredOrUndeliveredKg: Math.max(0, totalCarcass - totalDeliveredKg),
            },
          },
        });
      }
    } catch (err) {
      console.warn("Supabase fetch warning, falling back to in-memory store:", err);
    }
  }

  // Fallback to inMemoryStore
  let filteredShipments = inMemoryStore.shipments;
  let filteredSlaughters = inMemoryStore.slaughterBatches;
  let filteredStorage = inMemoryStore.storageRecords;
  let filteredDeliveries = inMemoryStore.deliveries;
  let filteredInvoices = inMemoryStore.invoices;
  let filteredReports = inMemoryStore.reports;

  if (locationId && locationId !== "all") {
    filteredShipments = filteredShipments.filter((s) => s.destinationLocationId === locationId);
    filteredSlaughters = filteredSlaughters.filter((b) => b.cuttingLocationId === locationId);
    filteredStorage = filteredStorage.filter((st) => st.cuttingLocationId === locationId);
    filteredDeliveries = filteredDeliveries.filter((d) => d.cuttingLocationId === locationId);
    filteredInvoices = filteredInvoices.filter(
      (inv) => !inv.cuttingLocationId || inv.cuttingLocationId === locationId
    );
    filteredReports = filteredReports.filter((rep) => rep.cuttingLocationId === locationId);
  }

  const totalShipped = filteredShipments.reduce((acc, s) => acc + s.animalCount, 0);
  const totalSlaughtered = filteredSlaughters.reduce((acc, b) => acc + b.animalCount, 0);
  const totalCarcass = filteredSlaughters.reduce((acc, b) => acc + b.totalCarcassWeightKg, 0);
  const totalStoredKg = filteredStorage.reduce((acc, st) => acc + st.storedQuantityKg, 0);
  const totalDeliveredKg = filteredDeliveries.reduce((acc, d) => acc + d.deliveredQuantityKg, 0);
  const totalInvoiceAmount = filteredInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);

  return NextResponse.json({
    success: true,
    source: "in_memory_seed",
    organization: inMemoryStore.organizations[0],
    organizations: inMemoryStore.organizations,
    parties: inMemoryStore.parties,
    contracts: inMemoryStore.contracts,
    cuttingLocations: inMemoryStore.locations,
    shipments: filteredShipments,
    slaughterBatches: filteredSlaughters,
    storageRecords: filteredStorage,
    invoices: filteredInvoices,
    deliveries: filteredDeliveries,
    documents: inMemoryStore.documents,
    reports: filteredReports,
    totalAnimalCount: inMemoryStore.animals.length,
    stats: {
      totalTargetAnimals: inMemoryStore.organizations[0]?.targetAnimalCount || 350,
      totalPurchasedAnimals: inMemoryStore.animals.length,
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
      totalDocumentsCount: inMemoryStore.documents.length,
      missingDocumentsCount: 0,
      discrepancies: {
        unshippedAnimals: inMemoryStore.animals.length - totalShipped,
        unslaughteredShippedAnimals: totalShipped - totalSlaughtered,
        unstoredOrUndeliveredKg: totalCarcass - totalDeliveredKg,
      },
    },
  });
}

/**
 * POST: Create organization, seed full demo, or save individual entity (party, location, shipment, storage, delivery)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabaseServerClient();

    // ------------------------------------------------------------------------
    // Action: Seed Full Demo to Supabase
    // ------------------------------------------------------------------------
    if (action === "seed_demo_to_supabase") {
      if (!supabase) {
        return NextResponse.json(
          { success: false, error: "Supabase istemcisi yapılandırılamadı." },
          { status: 500 }
        );
      }

      // 1. Insert organization
      const { error: orgErr } = await supabase.from("kurban_process_organizations").upsert({
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

      if (orgErr) {
        return NextResponse.json(
          { success: false, error: `Organizasyon kayıt hatası: ${orgErr.message}` },
          { status: 500 }
        );
      }

      // 2. Insert Cutting Locations
      for (const loc of SEED_CUTTING_LOCATIONS) {
        const { error: locErr } = await supabase.from("kurban_cutting_locations").upsert({
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
        if (locErr) {
          return NextResponse.json(
            { success: false, error: `Kesim yeri kayıt hatası: ${locErr.message}` },
            { status: 500 }
          );
        }
      }

      // 3. Insert Parties
      for (const p of SEED_PARTIES) {
        const { error: partyErr } = await supabase.from("kurban_parties").upsert({
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
        if (partyErr) {
          return NextResponse.json(
            { success: false, error: `Paydaş firma kayıt hatası: ${partyErr.message}` },
            { status: 500 }
          );
        }
      }

      // 4. Insert Reports & Sections
      for (const rep of SEED_REPORTS) {
        const { error: repErr } = await supabase.from("kurban_reports").upsert({
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

        if (repErr) {
          return NextResponse.json(
            { success: false, error: `Rapor kayıt hatası: ${repErr.message}` },
            { status: 500 }
          );
        }

        if (rep.sections && rep.sections.length > 0) {
          for (const sec of rep.sections) {
            const { error: secErr } = await supabase.from("kurban_report_sections").upsert({
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
            if (secErr) {
              return NextResponse.json(
                { success: false, error: `Rapor bölüm kayıt hatası: ${secErr.message}` },
                { status: 500 }
              );
            }
          }
        }
      }

      // 5. Batch insert animals (50 per batch)
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
        const { error: animalBatchErr } = await supabase.from("kurban_animals").upsert(batch);
        if (animalBatchErr) {
          return NextResponse.json(
            { success: false, error: `Hayvan grubu kayıt hatası: ${animalBatchErr.message}` },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: "350 hayvan, 2 kesimhane ve tüm süreç kayıtları Supabase'e başarıyla aktarıldı.",
      });
    }

    // ------------------------------------------------------------------------
    // Entity CRUD: Party, Location, Shipment, Storage, Delivery
    // ------------------------------------------------------------------------
    if (body.entityType && body.data) {
      const { entityType, data } = body;
      const orgId = await getActiveOrganizationId(supabase, data.organizationId);
      const entityId = ensureUUID(data.id);

      // --- 1. PARTY ---
      if (entityType === "party") {
        const item: KurbanParty = {
          id: entityId,
          organizationId: orgId,
          partyType: data.partyType || "supplier_seller",
          name: data.name,
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
            console.error("Supabase party upsert error:", dbErr);
            return NextResponse.json(
              { success: false, error: `Paydaş Supabase'e kaydedilemedi: ${dbErr.message}` },
              { status: 500 }
            );
          }
        }

        const idx = inMemoryStore.parties.findIndex((p) => p.id === item.id);
        if (idx >= 0) inMemoryStore.parties[idx] = item;
        else inMemoryStore.parties.unshift(item);

        return NextResponse.json({
          success: true,
          party: item,
          message: "Paydaş / Firma başarıyla kaydedildi.",
        });
      }

      // --- 2. LOCATION ---
      if (entityType === "location") {
        const item: KurbanCuttingLocation = {
          id: entityId,
          organizationId: orgId,
          name: data.name,
          locationCode: data.locationCode || `KSM-0${inMemoryStore.locations.length + 1}`,
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
            console.error("Supabase location upsert error:", dbErr);
            return NextResponse.json(
              { success: false, error: `Kesim yeri Supabase'e kaydedilemedi: ${dbErr.message}` },
              { status: 500 }
            );
          }
        }

        const idx = inMemoryStore.locations.findIndex((l) => l.id === item.id);
        if (idx >= 0) inMemoryStore.locations[idx] = item;
        else inMemoryStore.locations.push(item);

        return NextResponse.json({
          success: true,
          location: item,
          message: "Kesim yeri başarıyla kaydedildi.",
        });
      }

      // --- 3. SHIPMENT ---
      if (entityType === "shipment") {
        const destLocId = await getActiveLocationId(supabase, data.destinationLocationId);

        const item: KurbanShipment = {
          id: entityId,
          organizationId: orgId,
          destinationLocationId: destLocId,
          destinationLocationName: data.destinationLocationName || "Kesimhane",
          shipmentNo: data.shipmentNo || `SVK-2026-00${inMemoryStore.shipments.length + 1}`,
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

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_shipments").upsert({
            id: item.id,
            organization_id: item.organizationId,
            destination_location_id: item.destinationLocationId,
            shipment_no: item.shipmentNo,
            shipment_date: item.shipmentDate,
            origin_address: item.originAddress,
            carrier_company: item.carrierCompany || null,
            vehicle_plate: item.vehiclePlate, // NOT NULL satisfies postgres constraint
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
            console.error("Supabase shipment upsert error:", dbErr);
            return NextResponse.json(
              { success: false, error: `Sevk tırı Supabase'e kaydedilemedi: ${dbErr.message}` },
              { status: 500 }
            );
          }
        }

        const idx = inMemoryStore.shipments.findIndex((s) => s.id === item.id);
        if (idx >= 0) inMemoryStore.shipments[idx] = item;
        else inMemoryStore.shipments.unshift(item);

        return NextResponse.json({
          success: true,
          shipment: item,
          message: "Sevk tırı başarıyla kaydedildi.",
        });
      }

      // --- 4. STORAGE ---
      if (entityType === "storage") {
        const cutLocId = isUUID(data.cuttingLocationId)
          ? data.cuttingLocationId
          : await getActiveLocationId(supabase, data.cuttingLocationId);

        const item: KurbanStorageRecord = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: cutLocId,
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

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_storage_records").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: item.cuttingLocationId,
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
            console.error("Supabase storage upsert error:", dbErr);
            return NextResponse.json(
              { success: false, error: `Soğuk depo kaydı Supabase'e kaydedilemedi: ${dbErr.message}` },
              { status: 500 }
            );
          }
        }

        const idx = inMemoryStore.storageRecords.findIndex((st) => st.id === item.id);
        if (idx >= 0) inMemoryStore.storageRecords[idx] = item;
        else inMemoryStore.storageRecords.unshift(item);

        return NextResponse.json({
          success: true,
          storage: item,
          message: "Soğuk depo kaydı başarıyla kaydedildi.",
        });
      }

      // --- 5. DELIVERY ---
      if (entityType === "delivery") {
        const cutLocId = isUUID(data.cuttingLocationId)
          ? data.cuttingLocationId
          : await getActiveLocationId(supabase, data.cuttingLocationId);

        const item: KurbanDelivery = {
          id: entityId,
          organizationId: orgId,
          cuttingLocationId: cutLocId,
          deliveryNo: data.deliveryNo || `TSL-2026-00${inMemoryStore.deliveries.length + 1}`,
          recipientCompany: data.recipientCompany || "Alıcı Firma",
          deliveryDate: data.deliveryDate || new Date().toISOString().split("T")[0],
          deliveredQuantityKg: Number(data.deliveredQuantityKg) || 0,
          deliveredAnimalCount: Number(data.deliveredAnimalCount) || 0,
          outgoingInvoiceNo: data.outgoingInvoiceNo || "",
          dispatchNoteNo: data.dispatchNoteNo || `IRS-${Date.now().toString().slice(-6)}`,
          deliveryAddress: data.deliveryAddress || "Müşteri Teslim Adresi",
          recipientPerson: data.recipientPerson || "Yetkili",
          deliveredByPerson: data.deliveredByPerson || "Sevkiyat Sorumlusu",
          transportType: data.transportType || "company_vehicle",
          // Araç plakası kullanıcı için opsiyoneldir. Boş ise Postgres NOT NULL hatasını önlemek için varsayılan değer gönderilir.
          vehiclePlate: data.vehiclePlate?.trim() || "Plakasız / Belirtilmedi",
          driverName: data.driverName || "Şoför",
          transportCost: Number(data.transportCost) || 0,
          status: data.status || "completed",
          notes: data.notes || "",
          createdAt: data.createdAt || new Date().toISOString(),
        };

        if (supabase) {
          const { error: dbErr } = await supabase.from("kurban_deliveries").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: item.cuttingLocationId,
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
            console.error("Supabase delivery upsert error:", dbErr);
            return NextResponse.json(
              {
                success: false,
                error: `Taşıma / Teslimat aracı Supabase'e kaydedilemedi: ${dbErr.message}`,
              },
              { status: 500 }
            );
          }
        }

        const idx = inMemoryStore.deliveries.findIndex((d) => d.id === item.id);
        if (idx >= 0) inMemoryStore.deliveries[idx] = item;
        else inMemoryStore.deliveries.unshift(item);

        return NextResponse.json({
          success: true,
          delivery: item,
          message: "Taşıma / Teslimat aracı başarıyla kaydedildi.",
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
 * DELETE: Delete a party, location, shipment, storage record, or delivery
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

    if (entityType === "party") {
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_parties").delete().eq("id", id);
        if (error) {
          return NextResponse.json(
            { success: false, error: `Paydaş silinemedi: ${error.message}` },
            { status: 500 }
          );
        }
      }
      inMemoryStore.parties = inMemoryStore.parties.filter((p) => p.id !== id);
      return NextResponse.json({ success: true, message: "Paydaş firma silindi." });
    }

    if (entityType === "location") {
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_cutting_locations").delete().eq("id", id);
        if (error) {
          return NextResponse.json(
            { success: false, error: `Kesim yeri silinemedi: ${error.message}` },
            { status: 500 }
          );
        }
      }
      inMemoryStore.locations = inMemoryStore.locations.filter((l) => l.id !== id);
      return NextResponse.json({ success: true, message: "Kesim yeri silindi." });
    }

    if (entityType === "shipment") {
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_shipments").delete().eq("id", id);
        if (error) {
          return NextResponse.json(
            { success: false, error: `Sevk tırı silinemedi: ${error.message}` },
            { status: 500 }
          );
        }
      }
      inMemoryStore.shipments = inMemoryStore.shipments.filter((s) => s.id !== id);
      return NextResponse.json({ success: true, message: "Sevk tırı silindi." });
    }

    if (entityType === "storage") {
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_storage_records").delete().eq("id", id);
        if (error) {
          return NextResponse.json(
            { success: false, error: `Soğuk depo kaydı silinemedi: ${error.message}` },
            { status: 500 }
          );
        }
      }
      inMemoryStore.storageRecords = inMemoryStore.storageRecords.filter((st) => st.id !== id);
      return NextResponse.json({ success: true, message: "Soğuk depo kaydı silindi." });
    }

    if (entityType === "delivery") {
      if (supabase && isUUID(id)) {
        const { error } = await supabase.from("kurban_deliveries").delete().eq("id", id);
        if (error) {
          return NextResponse.json(
            { success: false, error: `Taşıma aracı silinemedi: ${error.message}` },
            { status: 500 }
          );
        }
      }
      inMemoryStore.deliveries = inMemoryStore.deliveries.filter((d) => d.id !== id);
      return NextResponse.json({ success: true, message: "Taşıma aracı kaydı silindi." });
    }

    return NextResponse.json({ success: false, error: "Geçersiz entityType." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Silme hatası" },
      { status: 500 }
    );
  }
}
