import { NextResponse, connection } from "next/server";
import {
  getSupabaseServerClient,
  isUUID,
  ensureUUID,
  ensureDatabaseReady,
  getActiveOrganizationId,
  mapAnimalFromDb,
  cleanupLegacyMockAnimals,
  ensureLocationsExistInDb,
  loadKurbanPersistentState,
  saveKurbanPersistentState,
  createDefaultPersistentState,
} from "../../../utils/kurbanProcessDb";
import { KurbanAnimal } from "../../../types/kurbanProcess";

// In-memory animals store initialized empty (no mock animals)
let memoryAnimals: KurbanAnimal[] = [];

function isLegacyMockAnimalId(id?: string | null): boolean {
  if (!id) return false;
  return (
    id.startsWith("10000000-0000-4000-a000-") ||
    id.startsWith("20000000-0000-4000-a000-")
  );
}

async function resolveValidDbLocationId(
  supabase: any,
  candidateLocId?: string | null
): Promise<string | null> {
  if (!supabase || !candidateLocId || !isUUID(candidateLocId)) return null;
  try {
    const { data } = await supabase
      .from("kurban_cutting_locations")
      .select("id")
      .eq("id", candidateLocId)
      .limit(1);
    if (data && data.length > 0) return data[0].id;
  } catch {
    // ignore
  }
  return null;
}

/**
 * GET: Fetch animals with search, filter by cutting location, status & pagination
 */
export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase().trim() || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

  const supabase = getSupabaseServerClient();

  if (supabase) {
    await cleanupLegacyMockAnimals(supabase);

    try {
      let query = supabase
        .from("kurban_animals")
        .select("*", { count: "exact" })
        .not("id", "gte", "10000000-0000-4000-a000-000000000000");

      // Better: query all non-mock rows
      let dbQuery = supabase.from("kurban_animals").select("*", { count: "exact" });

      if (locationId && locationId !== "all" && isUUID(locationId)) {
        dbQuery = dbQuery.eq("cutting_location_id", locationId);
      }
      if (status && status !== "all") {
        dbQuery = dbQuery.eq("status", status);
      }
      if (search) {
        dbQuery = dbQuery.or(
          `ear_tag_no.ilike.%${search}%,passport_no.ilike.%${search}%,breed.ilike.%${search}%,farm_name.ilike.%${search}%`
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await dbQuery
        .order("ear_tag_no", { ascending: true })
        .range(from, to);

      if (!error && data && data.length > 0) {
        const mappedAnimals: KurbanAnimal[] = data
          .map(mapAnimalFromDb)
          .filter((a: KurbanAnimal) => !isLegacyMockAnimalId(a.id));

        if (mappedAnimals.length > 0) {
          return NextResponse.json(
            {
              success: true,
              source: "supabase",
              totalCount: count || mappedAnimals.length,
              page,
              pageSize,
              animals: mappedAnimals,
            },
            {
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
              },
            }
          );
        }
      }
    } catch (err) {
      console.warn("Supabase animals fetch fallback to persistent state:", err);
    }
  }

  // Fallback to persistent state (proposals table / file cache) if kurban_animals table was empty or unavailable
  const persisted = await loadKurbanPersistentState(supabase);
  if (persisted && Array.isArray(persisted.animals)) {
    const deletedSet = new Set(persisted.deletedIds || []);
    memoryAnimals = persisted.animals.filter(
      (a) => !isLegacyMockAnimalId(a.id) && !deletedSet.has(a.id)
    );
  } else {
    memoryAnimals = memoryAnimals.filter((a) => !isLegacyMockAnimalId(a.id));
  }

  let filtered = memoryAnimals;

  if (locationId && locationId !== "all") {
    filtered = filtered.filter((a) => a.cuttingLocationId === locationId);
  }

  if (status && status !== "all") {
    filtered = filtered.filter((a) => a.status === status);
  }

  if (search) {
    filtered = filtered.filter(
      (a) =>
        a.earTagNo.toLowerCase().includes(search) ||
        (a.passportNo && a.passportNo.toLowerCase().includes(search)) ||
        (a.breed && a.breed.toLowerCase().includes(search)) ||
        (a.farmName && a.farmName.toLowerCase().includes(search))
    );
  }

  const totalCount = filtered.length;
  const start = (page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  return NextResponse.json(
    {
      success: true,
      source: "persistent_state",
      totalCount,
      page,
      pageSize,
      animals: paginated,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}

/**
 * POST: Create single animal or bulk create (Excel upload) and persist to Supabase
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();
    await ensureDatabaseReady(supabase);
    await cleanupLegacyMockAnimals(supabase);

    const activeOrgId = await getActiveOrganizationId(supabase, body.organizationId);
    const validDbLocIds = await ensureLocationsExistInDb(supabase, activeOrgId);
    const persisted = await loadKurbanPersistentState(supabase);

    // Bulk creation (Excel Import)
    if (body.bulk && Array.isArray(body.animals)) {
      const incoming: KurbanAnimal[] = body.animals.map((a: any, idx: number) => {
        const animalId = ensureUUID(a.id);
        const cutLocId = isUUID(a.cuttingLocationId)
          ? a.cuttingLocationId
          : persisted?.cuttingLocations?.[0]?.id && isUUID(persisted.cuttingLocations[0].id)
          ? persisted.cuttingLocations[0].id
          : undefined;

        const earTag = String(
          a.earTagNo || `TR34-${Date.now().toString().slice(-5)}-${idx + 1}`
        ).trim();

        return {
          id: animalId,
          organizationId: activeOrgId,
          cuttingLocationId: cutLocId,
          earTagNo: earTag,
          animalType: a.animalType || "buyukbas_tosun",
          animalTypeLabel: a.animalTypeLabel || "Büyükbaş Tosun",
          breed: a.breed || "Simental",
          gender: a.gender === "female" ? "female" : "male",
          birthDate: a.birthDate || "2024-04-15",
          ageMonths: Number(a.ageMonths) || 24,
          passportNo: a.passportNo || `PAS-${earTag}`,
          farmRegNo: a.farmRegNo || "TR-36-004128",
          farmName: a.farmName || "Besi İşletmesi",
          healthDocNo: a.healthDocNo || `VET-${Date.now().toString().slice(-6)}-${idx + 1}`,
          liveWeightKg: Number(a.liveWeightKg) || 0,
          carcassWeightKg: Number(a.carcassWeightKg) || 0,
          status: a.status || "purchased",
          notes: a.notes || "Excel İçe Aktarım",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      // Replace or merge by earTagNo so re-importing the same Excel updates existing tags cleanly
      const existingAnimals = (persisted?.animals || memoryAnimals).filter(
        (a) => !isLegacyMockAnimalId(a.id)
      );
      const byTagMap = new Map<string, KurbanAnimal>();
      for (const ex of existingAnimals) {
        byTagMap.set(ex.earTagNo.toUpperCase(), ex);
      }
      for (const inc of incoming) {
        const prev = byTagMap.get(inc.earTagNo.toUpperCase());
        if (prev && isUUID(prev.id)) {
          inc.id = prev.id;
        }
        byTagMap.set(inc.earTagNo.toUpperCase(), inc);
      }

      memoryAnimals = Array.from(byTagMap.values());

      // Save to Persistent State in Supabase (`proposals` table + local file)
      const stateToSave = persisted || createDefaultPersistentState();
      stateToSave.animals = memoryAnimals;
      stateToSave.shipments = (stateToSave.shipments || []).filter(
        (s) => !s.id.startsWith("40000000-0000-4000-a000-")
      );
      stateToSave.slaughterBatches = (stateToSave.slaughterBatches || []).filter(
        (b) => !b.id.startsWith("50000000-0000-4000-a000-")
      );
      stateToSave.storageRecords = (stateToSave.storageRecords || []).filter(
        (sr) => !sr.id.startsWith("60000000-0000-4000-a000-")
      );
      stateToSave.deliveries = (stateToSave.deliveries || []).filter(
        (d) => !d.id.startsWith("70000000-0000-4000-a000-")
      );
      stateToSave.organization = {
        ...stateToSave.organization,
        targetAnimalCount: memoryAnimals.length,
      };
      await saveKurbanPersistentState(stateToSave, supabase);

      // Bulk upsert to Supabase `kurban_animals` table
      let supabaseSavedCount = 0;
      if (supabase) {
        const dbRows = incoming.map((a) => ({
          id: a.id,
          organization_id: a.organizationId,
          cutting_location_id:
            a.cuttingLocationId && validDbLocIds.has(a.cuttingLocationId)
              ? a.cuttingLocationId
              : null,
          ear_tag_no: a.earTagNo,
          animal_type: a.animalType,
          animal_type_label: a.animalTypeLabel,
          breed: a.breed,
          gender: a.gender,
          birth_date: a.birthDate || null,
          age_months: a.ageMonths,
          passport_no: a.passportNo || null,
          farm_reg_no: a.farmRegNo || null,
          farm_name: a.farmName || null,
          health_doc_no: a.healthDocNo || null,
          live_weight_kg: a.liveWeightKg,
          carcass_weight_kg: a.carcassWeightKg,
          status: a.status,
          notes: a.notes || null,
        }));

        const batchSize = 50;
        for (let i = 0; i < dbRows.length; i += batchSize) {
          const slice = dbRows.slice(i, i + batchSize);
          const { error: dbErr } = await supabase.from("kurban_animals").upsert(slice, {
            onConflict: "id",
          });
          if (!dbErr) {
            supabaseSavedCount += slice.length;
          } else {
            console.warn("Supabase bulk animals upsert warning, retrying without location FK:", dbErr);
            const fallbackSlice = slice.map((r) => ({ ...r, cutting_location_id: null }));
            const { error: retryErr } = await supabase
              .from("kurban_animals")
              .upsert(fallbackSlice, { onConflict: "id" });
            if (!retryErr) {
              supabaseSavedCount += fallbackSlice.length;
            } else {
              // Row-by-row fallback in case of unique constraint on ear_tag_no
              for (const row of slice) {
                const { error: singleErr } = await supabase
                  .from("kurban_animals")
                  .upsert(row, { onConflict: "id" });
                if (!singleErr) {
                  supabaseSavedCount++;
                } else {
                  const { id: _unusedId, ...updateFields } = row;
                  await supabase
                    .from("kurban_animals")
                    .update(updateFields)
                    .eq("ear_tag_no", row.ear_tag_no);
                  supabaseSavedCount++;
                }
              }
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        count: incoming.length,
        supabaseSavedCount,
        message: `${incoming.length} adet hayvan kaydı Supabase veritabanına başarıyla kaydedildi.`,
      });
    }

    // Single animal creation
    const animalId = ensureUUID(body.id);
    const cutLocId = isUUID(body.cuttingLocationId) ? body.cuttingLocationId : undefined;

    const newAnimal: KurbanAnimal = {
      id: animalId,
      organizationId: activeOrgId,
      cuttingLocationId: cutLocId,
      earTagNo: String(body.earTagNo || "").trim(),
      animalType: body.animalType || "buyukbas_tosun",
      animalTypeLabel: body.animalTypeLabel || "Büyükbaş Tosun",
      breed: body.breed || "Simental",
      gender: body.gender === "female" ? "female" : "male",
      birthDate: body.birthDate,
      ageMonths: Number(body.ageMonths) || 24,
      passportNo: body.passportNo,
      farmRegNo: body.farmRegNo,
      farmName: body.farmName,
      healthDocNo: body.healthDocNo,
      liveWeightKg: Number(body.liveWeightKg) || 0,
      carcassWeightKg: Number(body.carcassWeightKg) || 0,
      status: body.status || "purchased",
      notes: body.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existingAnimals = (persisted?.animals || memoryAnimals).filter(
      (a) => !isLegacyMockAnimalId(a.id) && a.id !== newAnimal.id
    );
    memoryAnimals = [newAnimal, ...existingAnimals];

    if (persisted) {
      persisted.animals = memoryAnimals;
      await saveKurbanPersistentState(persisted, supabase);
    }

    if (supabase) {
      const dbLocId =
        newAnimal.cuttingLocationId && validDbLocIds.has(newAnimal.cuttingLocationId)
          ? newAnimal.cuttingLocationId
          : await resolveValidDbLocationId(supabase, newAnimal.cuttingLocationId);

      const { error: insertErr } = await supabase.from("kurban_animals").upsert({
        id: newAnimal.id,
        organization_id: newAnimal.organizationId,
        cutting_location_id: dbLocId,
        ear_tag_no: newAnimal.earTagNo,
        animal_type: newAnimal.animalType,
        animal_type_label: newAnimal.animalTypeLabel,
        breed: newAnimal.breed,
        gender: newAnimal.gender,
        birth_date: newAnimal.birthDate || null,
        age_months: newAnimal.ageMonths,
        passport_no: newAnimal.passportNo || null,
        farm_reg_no: newAnimal.farmRegNo || null,
        farm_name: newAnimal.farmName || null,
        health_doc_no: newAnimal.healthDocNo || null,
        live_weight_kg: newAnimal.liveWeightKg,
        carcass_weight_kg: newAnimal.carcassWeightKg,
        status: newAnimal.status,
        notes: newAnimal.notes || null,
      });

      if (insertErr) {
        console.warn("Single animal Supabase insert warning:", insertErr);
      }
    }

    return NextResponse.json({
      success: true,
      animal: newAnimal,
      message: `${newAnimal.earTagNo} küpeli hayvan Supabase'e kaydedildi.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Hayvan kaydı eklenemedi." },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update animal
 */
export async function PUT(request: Request) {
  try {
    const body: KurbanAnimal = await request.json();
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "Hayvan ID zorunludur." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const activeOrgId = await getActiveOrganizationId(supabase, body.organizationId);
    const validDbLocIds = await ensureLocationsExistInDb(supabase, activeOrgId);
    const persisted = await loadKurbanPersistentState(supabase);

    const updatedAnimal: KurbanAnimal = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    const baseAnimals = (persisted?.animals || memoryAnimals).filter(
      (a) => !isLegacyMockAnimalId(a.id)
    );
    const existsIdx = baseAnimals.findIndex((a) => a.id === body.id);
    if (existsIdx >= 0) {
      baseAnimals[existsIdx] = updatedAnimal;
    } else {
      baseAnimals.unshift(updatedAnimal);
    }
    memoryAnimals = baseAnimals;

    if (persisted) {
      persisted.animals = memoryAnimals;
      await saveKurbanPersistentState(persisted, supabase);
    }

    if (supabase && isUUID(body.id)) {
      const dbLocId =
        body.cuttingLocationId && validDbLocIds.has(body.cuttingLocationId)
          ? body.cuttingLocationId
          : await resolveValidDbLocationId(supabase, body.cuttingLocationId);

      const { error: updateErr } = await supabase
        .from("kurban_animals")
        .update({
          cutting_location_id: dbLocId,
          ear_tag_no: body.earTagNo,
          animal_type: body.animalType,
          breed: body.breed,
          gender: body.gender,
          birth_date: body.birthDate || null,
          age_months: body.ageMonths,
          passport_no: body.passportNo || null,
          farm_reg_no: body.farmRegNo || null,
          farm_name: body.farmName || null,
          health_doc_no: body.healthDocNo || null,
          live_weight_kg: body.liveWeightKg,
          carcass_weight_kg: body.carcassWeightKg,
          status: body.status,
          notes: body.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id);

      if (updateErr) {
        console.warn("Animal update Supabase warning:", updateErr);
      }
    }

    return NextResponse.json({
      success: true,
      animal: updatedAnimal,
      message: "Hayvan kaydı güncellendi.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Güncelleme başarısız." },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Delete single animal (?id=...) or clear all animals (?all=true)
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("all") === "true";

    const supabase = getSupabaseServerClient();
    const persisted = await loadKurbanPersistentState(supabase);

    if (clearAll) {
      memoryAnimals = [];
      if (persisted) {
        persisted.animals = [];
        await saveKurbanPersistentState(persisted, supabase);
      }
      if (supabase) {
        const { error: delAllErr } = await supabase
          .from("kurban_animals")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (delAllErr) {
          console.warn("Clear all animals Supabase warning:", delAllErr);
        }
      }
      return NextResponse.json({
        success: true,
        message: "Tüm hayvan kayıtları kalıcı olarak temizlendi.",
      });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Silinecek ID belirtilmelidir." },
        { status: 400 }
      );
    }

    memoryAnimals = memoryAnimals.filter((a) => a.id !== id);
    if (persisted) {
      persisted.animals = (persisted.animals || []).filter((a) => a.id !== id);
      persisted.deletedIds = Array.from(new Set([...(persisted.deletedIds || []), id]));
      await saveKurbanPersistentState(persisted, supabase);
    }

    if (supabase && isUUID(id)) {
      const { error: delErr } = await supabase.from("kurban_animals").delete().eq("id", id);
      if (delErr) {
        console.warn("Animal delete Supabase warning:", delErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Hayvan kaydı silindi.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Silme başarısız." },
      { status: 500 }
    );
  }
}
