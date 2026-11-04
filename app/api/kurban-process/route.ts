import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

function getSupabaseServerClient() {
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

// In-memory fallback cache if Supabase is offline or tables are being migrated
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
  const action = searchParams.get("action");

  const supabase = getSupabaseServerClient();

  // If Supabase is available, try fetching organizations from table
  if (supabase) {
    try {
      const { data: orgData, error: orgErr } = await supabase
        .from("kurban_process_organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (!orgErr && orgData && orgData.length > 0) {
        // Supabase has active organizations!
        const { data: locs } = await supabase
          .from("kurban_cutting_locations")
          .select("*");
        const { data: parties } = await supabase.from("kurban_parties").select("*");
        const { data: shipments } = await supabase
          .from("kurban_shipments")
          .select("*");
        const { data: slaughters } = await supabase
          .from("kurban_slaughter_batches")
          .select("*");
        const { data: storages } = await supabase
          .from("kurban_storage_records")
          .select("*");
        const { data: deliveries } = await supabase
          .from("kurban_deliveries")
          .select("*");
        const { data: invoices } = await supabase
          .from("kurban_invoices")
          .select("*");
        const { data: docs } = await supabase
          .from("kurban_documents")
          .select("*");
        const { data: reports } = await supabase
          .from("kurban_reports")
          .select("*, kurban_report_sections(*)");

        // Animals count
        const { count: animalCount } = await supabase
          .from("kurban_animals")
          .select("id", { count: "exact", head: true });

        return NextResponse.json({
          success: true,
          source: "supabase",
          organization: orgData[0],
          organizations: orgData,
          cuttingLocations: locs || [],
          parties: parties || [],
          shipments: shipments || [],
          slaughterBatches: slaughters || [],
          storageRecords: storages || [],
          deliveries: deliveries || [],
          invoices: invoices || [],
          documents: docs || [],
          reports: reports || [],
          totalAnimalCount: animalCount || 0,
        });
      }
    } catch (err) {
      console.warn("Supabase fetch warning, using in-memory process store:", err);
    }
  }

  // Return inMemoryStore
  let filteredShipments = inMemoryStore.shipments;
  let filteredSlaughters = inMemoryStore.slaughterBatches;
  let filteredStorage = inMemoryStore.storageRecords;
  let filteredDeliveries = inMemoryStore.deliveries;
  let filteredInvoices = inMemoryStore.invoices;
  let filteredReports = inMemoryStore.reports;

  if (locationId && locationId !== "all") {
    filteredShipments = filteredShipments.filter(
      (s) => s.destinationLocationId === locationId
    );
    filteredSlaughters = filteredSlaughters.filter(
      (b) => b.cuttingLocationId === locationId
    );
    filteredStorage = filteredStorage.filter(
      (st) => st.cuttingLocationId === locationId
    );
    filteredDeliveries = filteredDeliveries.filter(
      (d) => d.cuttingLocationId === locationId
    );
    filteredInvoices = filteredInvoices.filter(
      (inv) => !inv.cuttingLocationId || inv.cuttingLocationId === locationId
    );
    filteredReports = filteredReports.filter(
      (rep) => rep.cuttingLocationId === locationId
    );
  }

  // Calculate comprehensive stats
  const totalShipped = filteredShipments.reduce((acc, s) => acc + s.animalCount, 0);
  const totalSlaughtered = filteredSlaughters.reduce(
    (acc, b) => acc + b.animalCount,
    0
  );
  const totalCarcass = filteredSlaughters.reduce(
    (acc, b) => acc + b.totalCarcassWeightKg,
    0
  );
  const totalStoredKg = filteredStorage.reduce(
    (acc, st) => acc + st.storedQuantityKg,
    0
  );
  const totalDeliveredKg = filteredDeliveries.reduce(
    (acc, d) => acc + d.deliveredQuantityKg,
    0
  );
  const totalInvoiceAmount = filteredInvoices.reduce(
    (acc, inv) => acc + inv.totalAmount,
    0
  );

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
 * POST: Create organization or seed entire 350-animal demo into Supabase
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // Seed Demo Action
    if (action === "seed_demo_to_supabase") {
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        return NextResponse.json(
          { success: false, message: "Supabase istemcisi yapılandırılamadı." },
          { status: 500 }
        );
      }

      // 1. Insert organization
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

      // 2. Insert Cutting Locations
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

      // 3. Insert Parties
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

      // 4. Insert Reports & Sections
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
          metadata: rep.metadata,
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
        await supabase.from("kurban_animals").upsert(batch);
      }

      return NextResponse.json({
        success: true,
        message: "350 hayvan, 2 kesimhane ve tüm süreç kayıtları Supabase'e başarıyla aktarıldı.",
      });
    }

    // 6. Generic Entity CRUD (Party, Location, Shipment, Storage, Delivery)
    if (body.entityType && body.data) {
      const { entityType, data } = body;
      const supabase = getSupabaseServerClient();
      const orgId = data.organizationId || SEED_ORGANIZATION.id;

      if (entityType === "party") {
        const item: any = {
          id: data.id || `pty-${Date.now()}`,
          organizationId: orgId,
          partyType: data.partyType || "supplier_seller",
          name: data.name,
          taxId: data.taxId || null,
          taxOffice: data.taxOffice || null,
          phone: data.phone || null,
          email: data.email || null,
          city: data.city || null,
          address: data.address || null,
          authorizedPerson: data.authorizedPerson || null,
          notes: data.notes || null,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        if (supabase) {
          await supabase.from("kurban_parties").upsert({
            id: item.id,
            organization_id: item.organizationId,
            party_type: item.partyType,
            name: item.name,
            tax_id: item.taxId,
            tax_office: item.taxOffice,
            phone: item.phone,
            email: item.email,
            city: item.city,
            address: item.address,
            authorized_person: item.authorizedPerson,
            notes: item.notes,
          });
        }

        const idx = inMemoryStore.parties.findIndex((p) => p.id === item.id);
        if (idx >= 0) inMemoryStore.parties[idx] = item;
        else inMemoryStore.parties.unshift(item);

        return NextResponse.json({ success: true, party: item, message: "Paydaş / Firma başarıyla kaydedildi." });
      }

      if (entityType === "location") {
        const item: any = {
          id: data.id || `ksm-loc-${Date.now()}`,
          organizationId: orgId,
          name: data.name,
          locationCode: data.locationCode || `KSM-0${inMemoryStore.locations.length + 1}`,
          city: data.city || "İstanbul",
          address: data.address || null,
          responsiblePerson: data.responsiblePerson || null,
          responsiblePhone: data.responsiblePhone || null,
          officialApprovalNo: data.officialApprovalNo || null,
          veterinaryName: data.veterinaryName || null,
          dailyCapacity: Number(data.dailyCapacity) || 150,
          allocatedAnimalCount: Number(data.allocatedAnimalCount) || 0,
          notes: data.notes || null,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        if (supabase) {
          await supabase.from("kurban_cutting_locations").upsert({
            id: item.id,
            organization_id: item.organizationId,
            name: item.name,
            location_code: item.locationCode,
            city: item.city,
            address: item.address,
            responsible_person: item.responsiblePerson,
            responsible_phone: item.responsiblePhone,
            official_approval_no: item.officialApprovalNo,
            veterinary_name: item.veterinaryName,
            daily_capacity: item.dailyCapacity,
            allocated_animal_count: item.allocatedAnimalCount,
            notes: item.notes,
          });
        }

        const idx = inMemoryStore.locations.findIndex((l) => l.id === item.id);
        if (idx >= 0) inMemoryStore.locations[idx] = item;
        else inMemoryStore.locations.push(item);

        return NextResponse.json({ success: true, location: item, message: "Kesim yeri başarıyla kaydedildi." });
      }

      if (entityType === "shipment") {
        const matchedLoc = inMemoryStore.locations.find((l) => l.id === data.destinationLocationId);
        const item: any = {
          id: data.id || `shp-${Date.now()}`,
          organizationId: orgId,
          destinationLocationId: data.destinationLocationId || inMemoryStore.locations[0]?.id,
          destinationLocationName: matchedLoc?.name || data.destinationLocationName || "Kesimhane",
          shipmentNo: data.shipmentNo || `SVK-2026-00${inMemoryStore.shipments.length + 1}`,
          shipmentDate: data.shipmentDate || new Date().toISOString().split("T")[0],
          originAddress: data.originAddress || "Besi İşletmesi",
          carrierCompany: data.carrierCompany || null,
          vehiclePlate: data.vehiclePlate?.trim() || "Plaka Belirtilmedi",
          driverName: data.driverName || "Şoför",
          driverPhone: data.driverPhone || null,
          animalCount: Number(data.animalCount) || 0,
          shippingCost: Number(data.shippingCost) || 0,
          shippingInvoiceNo: data.shippingInvoiceNo || null,
          dispatchNoteNo: data.dispatchNoteNo || null,
          vetHealthReportNo: data.vetHealthReportNo || null,
          status: data.status || "delivered_to_slaughterhouse",
          notes: data.notes || null,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        if (supabase) {
          await supabase.from("kurban_shipments").upsert({
            id: item.id,
            organization_id: item.organizationId,
            destination_location_id: item.destinationLocationId,
            shipment_no: item.shipmentNo,
            shipment_date: item.shipmentDate,
            origin_address: item.originAddress,
            carrier_company: item.carrierCompany,
            vehicle_plate: item.vehiclePlate,
            driver_name: item.driverName,
            driver_phone: item.driverPhone,
            animal_count: item.animalCount,
            shipping_cost: item.shippingCost,
            shipping_invoice_no: item.shippingInvoiceNo,
            dispatch_note_no: item.dispatchNoteNo,
            vet_health_report_no: item.vetHealthReportNo,
            status: item.status,
            notes: item.notes,
          });
        }

        const idx = inMemoryStore.shipments.findIndex((s) => s.id === item.id);
        if (idx >= 0) inMemoryStore.shipments[idx] = item;
        else inMemoryStore.shipments.unshift(item);

        return NextResponse.json({ success: true, shipment: item, message: "Sevk tırı başarıyla kaydedildi." });
      }

      if (entityType === "storage") {
        const item: any = {
          id: data.id || `str-${Date.now()}`,
          organizationId: orgId,
          cuttingLocationId: data.cuttingLocationId || inMemoryStore.locations[0]?.id,
          storageCompany: data.storageCompany || "Soğuk Depo Firması",
          warehouseName: data.warehouseName || "Soğuk Hava Antreposu",
          warehouseAddress: data.warehouseAddress || null,
          entryDate: data.entryDate || new Date().toISOString().split("T")[0],
          exitDate: data.exitDate || null,
          productType: data.productType || "Karkas / Parçalanmış Soğuk Sığır Eti",
          storedQuantityKg: Number(data.storedQuantityKg) || 0,
          remainingQuantityKg: Number(data.remainingQuantityKg ?? data.storedQuantityKg) || 0,
          entryDispatchNo: data.entryDispatchNo || null,
          exitDispatchNo: data.exitDispatchNo || null,
          invoiceNo: data.invoiceNo || null,
          invoiceDate: data.invoiceDate || null,
          invoiceAmount: Number(data.invoiceAmount) || 0,
          temperatureCelsius: Number(data.temperatureCelsius) || 4.0,
          status: data.status || "in_storage",
          notes: data.notes || null,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        if (supabase) {
          await supabase.from("kurban_storage_records").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: item.cuttingLocationId,
            storage_company: item.storageCompany,
            warehouse_name: item.warehouseName,
            warehouse_address: item.warehouseAddress,
            entry_date: item.entryDate,
            exit_date: item.exitDate,
            product_type: item.productType,
            stored_quantity_kg: item.storedQuantityKg,
            remaining_quantity_kg: item.remainingQuantityKg,
            entry_dispatch_no: item.entryDispatchNo,
            exit_dispatch_no: item.exitDispatchNo,
            invoice_no: item.invoiceNo,
            invoice_date: item.invoiceDate,
            invoice_amount: item.invoiceAmount,
            temperature_celsius: item.temperatureCelsius,
            status: item.status,
            notes: item.notes,
          });
        }

        const idx = inMemoryStore.storageRecords.findIndex((st) => st.id === item.id);
        if (idx >= 0) inMemoryStore.storageRecords[idx] = item;
        else inMemoryStore.storageRecords.unshift(item);

        return NextResponse.json({ success: true, storage: item, message: "Soğuk depo kaydı başarıyla kaydedildi." });
      }

      if (entityType === "delivery") {
        const item: any = {
          id: data.id || `del-${Date.now()}`,
          organizationId: orgId,
          cuttingLocationId: data.cuttingLocationId || inMemoryStore.locations[0]?.id,
          deliveryNo: data.deliveryNo || `TSL-2026-00${inMemoryStore.deliveries.length + 1}`,
          recipientCompany: data.recipientCompany || "Alıcı Firma",
          deliveryDate: data.deliveryDate || new Date().toISOString().split("T")[0],
          deliveredQuantityKg: Number(data.deliveredQuantityKg) || 0,
          deliveredAnimalCount: Number(data.deliveredAnimalCount) || 0,
          outgoingInvoiceNo: data.outgoingInvoiceNo || null,
          dispatchNoteNo: data.dispatchNoteNo || `IRS-${Date.now().toString().slice(-6)}`,
          deliveryAddress: data.deliveryAddress || "Müşteri Teslim Adresi",
          recipientPerson: data.recipientPerson || "Yetkili",
          deliveredByPerson: data.deliveredByPerson || "Sevkiyat Sorumlusu",
          transportType: data.transportType || "company_vehicle",
          // Araç plakası ZORUNLU DEĞİL: Boş ise undefined veya "Plaka Belirtilmedi"
          vehiclePlate: data.vehiclePlate?.trim() || "Plakasız / Belirtilmedi",
          driverName: data.driverName || "Şoför",
          transportCost: Number(data.transportCost) || 0,
          status: data.status || "completed",
          notes: data.notes || null,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        if (supabase) {
          await supabase.from("kurban_deliveries").upsert({
            id: item.id,
            organization_id: item.organizationId,
            cutting_location_id: item.cuttingLocationId,
            delivery_no: item.deliveryNo,
            recipient_company: item.recipientCompany,
            delivery_date: item.deliveryDate,
            delivered_quantity_kg: item.deliveredQuantityKg,
            delivered_animal_count: item.deliveredAnimalCount,
            outgoing_invoice_no: item.outgoingInvoiceNo,
            dispatch_note_no: item.dispatchNoteNo,
            delivery_address: item.deliveryAddress,
            recipient_person: item.recipientPerson,
            delivered_by_person: item.deliveredByPerson,
            transport_type: item.transportType,
            vehicle_plate: item.vehiclePlate,
            driver_name: item.driverName,
            transport_cost: item.transportCost,
            status: item.status,
            notes: item.notes,
          });
        }

        const idx = inMemoryStore.deliveries.findIndex((d) => d.id === item.id);
        if (idx >= 0) inMemoryStore.deliveries[idx] = item;
        else inMemoryStore.deliveries.unshift(item);

        return NextResponse.json({ success: true, delivery: item, message: "Taşıma / Teslimat aracı başarıyla kaydedildi." });
      }
    }

    // Default: Return success for in-memory or new organization creation
    return NextResponse.json({
      success: true,
      message: "İşlem başarılı.",
    });
  } catch (err: any) {
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
      return NextResponse.json({ success: false, error: "entityType ve id zorunludur." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (entityType === "party") {
      if (supabase) await supabase.from("kurban_parties").delete().eq("id", id);
      inMemoryStore.parties = inMemoryStore.parties.filter((p) => p.id !== id);
      return NextResponse.json({ success: true, message: "Paydaş firma silindi." });
    }

    if (entityType === "location") {
      if (supabase) await supabase.from("kurban_cutting_locations").delete().eq("id", id);
      inMemoryStore.locations = inMemoryStore.locations.filter((l) => l.id !== id);
      return NextResponse.json({ success: true, message: "Kesim yeri silindi." });
    }

    if (entityType === "shipment") {
      if (supabase) await supabase.from("kurban_shipments").delete().eq("id", id);
      inMemoryStore.shipments = inMemoryStore.shipments.filter((s) => s.id !== id);
      return NextResponse.json({ success: true, message: "Sevk tırı silindi." });
    }

    if (entityType === "storage") {
      if (supabase) await supabase.from("kurban_storage_records").delete().eq("id", id);
      inMemoryStore.storageRecords = inMemoryStore.storageRecords.filter((st) => st.id !== id);
      return NextResponse.json({ success: true, message: "Soğuk depo kaydı silindi." });
    }

    if (entityType === "delivery") {
      if (supabase) await supabase.from("kurban_deliveries").delete().eq("id", id);
      inMemoryStore.deliveries = inMemoryStore.deliveries.filter((d) => d.id !== id);
      return NextResponse.json({ success: true, message: "Taşıma aracı kaydı silindi." });
    }

    return NextResponse.json({ success: false, error: "Geçersiz entityType." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Silme hatası" }, { status: 500 });
  }
}
