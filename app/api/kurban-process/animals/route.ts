import { NextResponse, connection } from "next/server";
import { SEED_ANIMALS } from "../../../utils/kurbanProcessSeed";
import {
  getSupabaseServerClient,
  isUUID,
  ensureUUID,
  ensureDatabaseReady,
  getActiveOrganizationId,
  mapAnimalFromDb,
} from "../../../utils/kurbanProcessDb";
import { KurbanAnimal } from "../../../types/kurbanProcess";

// In-memory animals store initialized with seed animals
let memoryAnimals: KurbanAnimal[] = [...SEED_ANIMALS];

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
    try {
      let query = supabase.from("kurban_animals").select("*", { count: "exact" });

      if (locationId && locationId !== "all" && isUUID(locationId)) {
        query = query.eq("cutting_location_id", locationId);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      if (search) {
        query = query.or(
          `ear_tag_no.ilike.%${search}%,passport_no.ilike.%${search}%,breed.ilike.%${search}%,farm_name.ilike.%${search}%`
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query
        .order("ear_tag_no", { ascending: true })
        .range(from, to);

      if (!error && data && data.length > 0) {
        const mappedAnimals: KurbanAnimal[] = data.map(mapAnimalFromDb);

        return NextResponse.json({
          success: true,
          source: "supabase",
          totalCount: count || mappedAnimals.length,
          page,
          pageSize,
          animals: mappedAnimals,
        });
      }
    } catch (err) {
      console.warn("Supabase animals fetch fallback to memory:", err);
    }
  }

  // Memory fallback with filtering
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

  return NextResponse.json({
    success: true,
    source: "in_memory",
    totalCount,
    page,
    pageSize,
    animals: paginated,
  });
}

/**
 * POST: Create single animal or bulk create (Excel upload)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();
    await ensureDatabaseReady(supabase);
    const activeOrgId = await getActiveOrganizationId(supabase, body.organizationId);

    // Bulk creation
    if (body.bulk && Array.isArray(body.animals)) {
      const incoming: KurbanAnimal[] = body.animals.map((a: any, idx: number) => {
        const animalId = ensureUUID(a.id);
        const cutLocId = isUUID(a.cuttingLocationId) ? a.cuttingLocationId : undefined;

        return {
          id: animalId,
          organizationId: activeOrgId,
          cuttingLocationId: cutLocId,
          earTagNo: a.earTagNo || `TR34-${Date.now().toString().slice(-5)}-${idx + 1}`,
          animalType: a.animalType || "buyukbas_tosun",
          animalTypeLabel: a.animalTypeLabel || "Büyükbaş Tosun",
          breed: a.breed || "Simental",
          gender: a.gender || "male",
          birthDate: a.birthDate || "2024-04-15",
          ageMonths: Number(a.ageMonths) || 24,
          passportNo: a.passportNo || `PAS-${a.earTagNo || idx}`,
          farmRegNo: a.farmRegNo || "TR-36-004128",
          farmName: a.farmName || "Besi İşletmesi",
          healthDocNo: a.healthDocNo || `VET-${Date.now().toString().slice(-6)}`,
          liveWeightKg: Number(a.liveWeightKg) || 650,
          carcassWeightKg: Number(a.carcassWeightKg) || 365,
          status: a.status || "purchased",
          notes: a.notes || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      // Update memory store
      memoryAnimals = [...incoming, ...memoryAnimals];

      // Bulk insert to Supabase
      if (supabase) {
        const dbRows = incoming.map((a) => ({
          id: a.id,
          organization_id: a.organizationId,
          cutting_location_id: a.cuttingLocationId || null,
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
          const { error: dbErr } = await supabase.from("kurban_animals").upsert(slice);
          if (dbErr) {
            console.warn("Supabase bulk animals insert warning:", dbErr);
          }
        }
      }

      return NextResponse.json({
        success: true,
        count: incoming.length,
        message: `${incoming.length} adet hayvan kaydı başarıyla eklendi.`,
      });
    }

    // Single animal creation
    const animalId = ensureUUID(body.id);
    const cutLocId = isUUID(body.cuttingLocationId) ? body.cuttingLocationId : undefined;

    const newAnimal: KurbanAnimal = {
      id: animalId,
      organizationId: activeOrgId,
      cuttingLocationId: cutLocId,
      earTagNo: body.earTagNo,
      animalType: body.animalType || "buyukbas_tosun",
      animalTypeLabel: body.animalTypeLabel || "Büyükbaş Tosun",
      breed: body.breed || "Simental",
      gender: body.gender || "male",
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

    memoryAnimals = [newAnimal, ...memoryAnimals];

    if (supabase) {
      const dbLocId = await resolveValidDbLocationId(supabase, newAnimal.cuttingLocationId);
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
      message: `${newAnimal.earTagNo} küpeli hayvan kaydedildi.`,
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

    // Update in memory
    memoryAnimals = memoryAnimals.map((a) =>
      a.id === body.id ? { ...a, ...body, updatedAt: new Date().toISOString() } : a
    );

    // Update in Supabase
    const supabase = getSupabaseServerClient();
    if (supabase && isUUID(body.id)) {
      const dbLocId = await resolveValidDbLocationId(supabase, body.cuttingLocationId);

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
      animal: body,
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
 * DELETE: Delete animal
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Silinecek ID belirtilmelidir." },
        { status: 400 }
      );
    }

    memoryAnimals = memoryAnimals.filter((a) => a.id !== id);

    const supabase = getSupabaseServerClient();
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
