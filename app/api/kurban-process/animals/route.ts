import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SEED_ANIMALS, SEED_ORGANIZATION_ID } from "../../../utils/kurbanProcessSeed";
import { KurbanAnimal } from "../../../types/kurbanProcess";

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

// In-memory animals store initialized with 350 seed animals
let memoryAnimals: KurbanAnimal[] = [...SEED_ANIMALS];

/**
 * GET: Fetch animals with search, filter by cutting location, status & pagination
 */
export async function GET(request: Request) {
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

      if (locationId && locationId !== "all") {
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
        const mappedAnimals: KurbanAnimal[] = data.map((a: any) => ({
          id: a.id,
          organizationId: a.organization_id,
          cuttingLocationId: a.cutting_location_id,
          earTagNo: a.ear_tag_no,
          animalType: a.animal_type,
          animalTypeLabel: a.animal_type_label,
          breed: a.breed,
          gender: a.gender,
          birthDate: a.birth_date,
          ageMonths: a.age_months,
          passportNo: a.passport_no,
          farmRegNo: a.farm_reg_no,
          farmName: a.farm_name,
          healthDocNo: a.health_doc_no,
          passportFileUrl: a.passport_file_url,
          healthDocFileUrl: a.health_doc_file_url,
          liveWeightKg: Number(a.live_weight_kg) || 0,
          carcassWeightKg: Number(a.carcass_weight_kg) || 0,
          status: a.status,
          notes: a.notes,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
        }));

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

    // Bulk creation
    if (body.bulk && Array.isArray(body.animals)) {
      const incoming: KurbanAnimal[] = body.animals.map((a: any, idx: number) => ({
        id: a.id || `animal-imp-${Date.now()}-${idx}`,
        organizationId: a.organizationId || SEED_ORGANIZATION_ID,
        cuttingLocationId: a.cuttingLocationId || undefined,
        earTagNo: a.earTagNo || `TR34-${Date.now()}-${idx}`,
        animalType: a.animalType || "buyukbas_tosun",
        animalTypeLabel: a.animalTypeLabel || "Büyükbaş Tosun",
        breed: a.breed || "Simental",
        gender: a.gender || "male",
        birthDate: a.birthDate || "2024-04-15",
        ageMonths: Number(a.ageMonths) || 24,
        passportNo: a.passportNo || `PAS-${a.earTagNo}`,
        farmRegNo: a.farmRegNo || "TR-36-004128",
        farmName: a.farmName || "Besi İşletmesi",
        healthDocNo: a.healthDocNo || `VET-${Date.now()}`,
        liveWeightKg: Number(a.liveWeightKg) || 650,
        carcassWeightKg: Number(a.carcassWeightKg) || 365,
        status: a.status || "purchased",
        notes: a.notes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // Update memory store
      memoryAnimals = [...incoming, ...memoryAnimals];

      // Also try to bulk insert to Supabase
      const supabase = getSupabaseServerClient();
      if (supabase) {
        try {
          const dbRows = incoming.map((a) => ({
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

          await supabase.from("kurban_animals").upsert(dbRows);
        } catch (dbErr) {
          console.warn("Supabase bulk animals insert warning:", dbErr);
        }
      }

      return NextResponse.json({
        success: true,
        count: incoming.length,
        message: `${incoming.length} adet hayvan kaydı başarıyla eklendi.`,
      });
    }

    // Single animal creation
    const newAnimal: KurbanAnimal = {
      id: body.id || `animal-${Date.now()}`,
      organizationId: body.organizationId || SEED_ORGANIZATION_ID,
      cuttingLocationId: body.cuttingLocationId,
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

    // Try Supabase insert
    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        await supabase.from("kurban_animals").insert({
          id: newAnimal.id,
          organization_id: newAnimal.organizationId,
          cutting_location_id: newAnimal.cuttingLocationId,
          ear_tag_no: newAnimal.earTagNo,
          animal_type: newAnimal.animalType,
          animal_type_label: newAnimal.animalTypeLabel,
          breed: newAnimal.breed,
          gender: newAnimal.gender,
          birth_date: newAnimal.birthDate,
          age_months: newAnimal.ageMonths,
          passport_no: newAnimal.passportNo,
          farm_reg_no: newAnimal.farmRegNo,
          farm_name: newAnimal.farmName,
          health_doc_no: newAnimal.healthDocNo,
          live_weight_kg: newAnimal.liveWeightKg,
          carcass_weight_kg: newAnimal.carcassWeightKg,
          status: newAnimal.status,
          notes: newAnimal.notes,
        });
      } catch (e) {
        console.warn("Single animal Supabase insert fallback:", e);
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
    if (supabase) {
      try {
        await supabase
          .from("kurban_animals")
          .update({
            cutting_location_id: body.cuttingLocationId,
            ear_tag_no: body.earTagNo,
            animal_type: body.animalType,
            breed: body.breed,
            gender: body.gender,
            birth_date: body.birthDate,
            age_months: body.ageMonths,
            passport_no: body.passportNo,
            farm_reg_no: body.farmRegNo,
            farm_name: body.farmName,
            health_doc_no: body.healthDocNo,
            live_weight_kg: body.liveWeightKg,
            carcass_weight_kg: body.carcassWeightKg,
            status: body.status,
            notes: body.notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.id);
      } catch (e) {
        console.warn("Animal update Supabase fallback:", e);
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
    if (supabase) {
      try {
        await supabase.from("kurban_animals").delete().eq("id", id);
      } catch (e) {
        console.warn("Animal delete Supabase fallback:", e);
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
