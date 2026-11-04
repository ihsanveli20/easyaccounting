import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { QurbanRecord, QurbanShareholder, QurbanMedia } from "../../types/kurban";

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

/**
 * Optional image upload to Supabase Storage bucket 'qurban-media'
 * If bucket doesn't exist or upload fails, falls back gracefully to original URL/base64
 */
async function processMediaUpload(
  supabase: any,
  qurbanNo: string,
  media: QurbanMedia[]
): Promise<QurbanMedia[]> {
  if (!media || !Array.isArray(media) || media.length === 0) return [];

  const processedList: QurbanMedia[] = [];

  for (const item of media) {
    let finalUrl = item.url;

    if (item.url && item.url.startsWith("data:image/")) {
      try {
        const matches = item.url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          const ext = mimeType.split("/")[1] || "jpg";
          const safeQurbanNo = (qurbanNo || "qurban").replace(/[^a-zA-Z0-9_-]/g, "_");
          const fileName = `${safeQurbanNo}_${item.type}_${Date.now()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("qurban-media")
            .upload(fileName, buffer, {
              contentType: mimeType,
              cacheControl: "31536000, public",
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from("qurban-media")
              .getPublicUrl(fileName);

            if (publicUrlData?.publicUrl) {
              finalUrl = publicUrlData.publicUrl;
            }
          }
        }
      } catch (err) {
        console.warn("Storage upload fallback for media:", err);
      }
    }

    processedList.push({
      ...item,
      url: finalUrl,
    });
  }

  return processedList;
}

/**
 * Maps Supabase relational rows (qurbans + qurban_shareholders + qurban_media)
 * to application QurbanRecord
 */
export function mapSupabaseToQurban(row: any): QurbanRecord {
  const shareholders: QurbanShareholder[] = (row.qurban_shareholders || [])
    .sort((a: any, b: any) => (a.share_index || 0) - (b.share_index || 0))
    .map((s: any) => ({
      id: s.id,
      shareIndex: s.share_index || 1,
      fullName: s.full_name || "",
      phone: s.phone || "",
      shareRate: s.share_rate || "1/7",
      targetWeightKg: s.target_weight_kg ? Number(s.target_weight_kg) : undefined,
      actualWeightKg: s.actual_weight_kg ? Number(s.actual_weight_kg) : undefined,
      sharePrice: Number(s.share_price) || 0,
      isPaid: Boolean(s.is_paid),
      paymentMethod: s.payment_method || "nakit",
      isDelivered: Boolean(s.is_delivered),
      deliveryDate: s.delivery_date ? String(s.delivery_date) : undefined,
      deliveryTime: s.delivery_time ? String(s.delivery_time) : undefined,
      deliveredTo: s.delivered_to || undefined,
      specialRequests: s.special_requests || undefined,
    }));

  const media: QurbanMedia[] = (row.qurban_media || []).map((m: any) => ({
    id: m.id,
    type: m.type,
    title: m.title || "",
    url: m.url || "",
    uploadedAt: m.uploaded_at || row.created_at,
  }));

  return {
    id: row.id,
    qurbanNo: row.qurban_no,
    earTagNo: row.ear_tag_no || "",
    animalType: row.animal_type || "buyukbas_tosun",
    animalTypeLabel: row.animal_type_label || undefined,
    status: row.status || "incoming",
    originCity: row.origin_city || "",
    originFarm: row.origin_farm || "",
    truckPlate: row.truck_plate || "",
    driverName: row.driver_name || undefined,
    driverPhone: row.driver_phone || undefined,
    dispatchNoteNo: row.dispatch_note_no || undefined,
    arrivalDate: row.arrival_date ? String(row.arrival_date) : new Date().toISOString().split("T")[0],
    invoiceNo: row.invoice_no || "",
    invoiceDate: row.invoice_date ? String(row.invoice_date) : new Date().toISOString().split("T")[0],
    supplierName: row.supplier_name || "",
    purchasePrice: Number(row.purchase_price) || 0,
    additionalCosts: row.additional_costs ? Number(row.additional_costs) : undefined,
    slaughterhouseName: row.slaughterhouse_name || "",
    slaughterDate: row.slaughter_date ? String(row.slaughter_date) : new Date().toISOString().split("T")[0],
    slaughterTime: row.slaughter_time || undefined,
    slaughterOrderNo: row.slaughter_order_no ? Number(row.slaughter_order_no) : undefined,
    butcherTeam: row.butcher_team || undefined,
    liveWeightKg: row.live_weight_kg ? Number(row.live_weight_kg) : undefined,
    carcassWeightKg: row.carcass_weight_kg ? Number(row.carcass_weight_kg) : undefined,
    boneWeightKg: row.bone_weight_kg ? Number(row.bone_weight_kg) : undefined,
    totalShares: Number(row.total_shares) || 7,
    shareholders,
    media,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

/**
 * GET: Fetch all Qurban records with their shareholders and media
 */
export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured", qurbans: [] },
      { status: 200 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let query = supabase
      .from("qurbans")
      .select(`
        *,
        qurban_shareholders (*),
        qurban_media (*)
      `)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `qurban_no.ilike.%${search}%,ear_tag_no.ilike.%${search}%,truck_plate.ilike.%${search}%,origin_city.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, qurbans: [] },
        { status: 200 }
      );
    }

    const qurbans = (data || []).map(mapSupabaseToQurban);

    return NextResponse.json({
      success: true,
      count: qurbans.length,
      qurbans,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch qurbans", qurbans: [] },
      { status: 500 }
    );
  }
}

/**
 * POST: Create a new Qurban record or bulk create
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    // Check if bulk insert request
    if (body.bulk && Array.isArray(body.records)) {
      const recordsToInsert = body.records;
      const createdList: QurbanRecord[] = [];

      for (const item of recordsToInsert) {
        const qurbanRow = {
          qurban_no: item.qurbanNo || `KRB-${Date.now()}`,
          ear_tag_no: item.earTagNo || "",
          animal_type: item.animalType || "buyukbas_tosun",
          animal_type_label: item.animalTypeLabel || "Büyükbaş Tosun",
          status: item.status || "incoming",
          origin_city: item.originCity || "",
          origin_farm: item.originFarm || null,
          truck_plate: (item.truckPlate || "").toUpperCase(),
          driver_name: item.driverName || null,
          driver_phone: item.driverPhone || null,
          dispatch_note_no: item.dispatchNoteNo || null,
          arrival_date: item.arrivalDate || new Date().toISOString().split("T")[0],
          invoice_no: item.invoiceNo || null,
          invoice_date: item.invoiceDate || null,
          supplier_name: item.supplierName || null,
          purchase_price: Number(item.purchasePrice) || 0,
          additional_costs: Number(item.additionalCosts) || 0,
          slaughterhouse_name: item.slaughterhouse_name || item.slaughterhouseName || null,
          slaughter_date: item.slaughterDate || null,
          slaughter_time: item.slaughterTime || null,
          slaughter_order_no: item.slaughterOrderNo ? Number(item.slaughterOrderNo) : null,
          butcher_team: item.butcherTeam || null,
          live_weight_kg: Number(item.liveWeightKg) || 0,
          carcass_weight_kg: Number(item.carcassWeightKg) || 0,
          bone_weight_kg: Number(item.boneWeightKg) || 0,
          total_shares: Number(item.totalShares) || 7,
          notes: item.notes || null,
        };

        const { data: qData, error: qErr } = await supabase
          .from("qurbans")
          .insert(qurbanRow)
          .select()
          .single();

        if (qErr) {
          console.error("Bulk qurban insert error:", qErr);
          continue;
        }

        const newQurbanId = qData.id;

        // Shareholders
        if (Array.isArray(item.shareholders) && item.shareholders.length > 0) {
          const sRows = item.shareholders.map((s: any, idx: number) => ({
            qurban_id: newQurbanId,
            share_index: s.shareIndex || idx + 1,
            full_name: s.fullName || `Hissedar ${idx + 1}`,
            phone: s.phone || null,
            share_rate: s.shareRate || "1/7",
            target_weight_kg: Number(s.targetWeightKg) || 0,
            actual_weight_kg: Number(s.actualWeightKg) || 0,
            share_price: Number(s.sharePrice) || 0,
            is_paid: Boolean(s.isPaid),
            payment_method: s.paymentMethod || "nakit",
            is_delivered: Boolean(s.isDelivered),
            delivery_date: s.deliveryDate || null,
            delivery_time: s.deliveryTime || null,
            delivered_to: s.deliveredTo || null,
            special_requests: s.specialRequests || null,
          }));

          await supabase.from("qurban_shareholders").insert(sRows);
        }

        createdList.push({ ...item, id: newQurbanId });
      }

      return NextResponse.json({
        success: true,
        message: `${createdList.length} adet kurban kaydı Supabase'e başarıyla aktarıldı.`,
        count: createdList.length,
      });
    }

    // Single Record Creation
    const q: Partial<QurbanRecord> = body;

    const qurbanRow: any = {
      qurban_no: (q.qurbanNo || "").trim(),
      ear_tag_no: (q.earTagNo || "").trim(),
      animal_type: q.animalType || "buyukbas_tosun",
      animal_type_label: q.animalTypeLabel || "Büyükbaş Tosun",
      status: q.status || "incoming",
      origin_city: (q.originCity || "").trim(),
      origin_farm: (q.originFarm || "").trim() || null,
      truck_plate: (q.truckPlate || "").trim().toUpperCase(),
      driver_name: (q.driverName || "").trim() || null,
      driver_phone: (q.driverPhone || "").trim() || null,
      dispatch_note_no: (q.dispatchNoteNo || "").trim() || null,
      arrival_date: q.arrivalDate || new Date().toISOString().split("T")[0],
      invoice_no: (q.invoiceNo || "").trim() || null,
      invoice_date: q.invoiceDate || null,
      supplier_name: (q.supplierName || "").trim() || null,
      purchase_price: Number(q.purchasePrice) || 0,
      additional_costs: Number(q.additionalCosts) || 0,
      slaughterhouse_name: (q.slaughterhouseName || "").trim() || null,
      slaughter_date: q.slaughterDate || null,
      slaughter_time: q.slaughterTime || null,
      slaughter_order_no: q.slaughterOrderNo ? Number(q.slaughterOrderNo) : null,
      butcher_team: (q.butcherTeam || "").trim() || null,
      live_weight_kg: Number(q.liveWeightKg) || 0,
      carcass_weight_kg: Number(q.carcassWeightKg) || 0,
      bone_weight_kg: Number(q.boneWeightKg) || 0,
      total_shares: Number(q.totalShares) || 7,
      notes: q.notes || null,
    };

    const { data: insertedQurban, error: qError } = await supabase
      .from("qurbans")
      .insert(qurbanRow)
      .select()
      .single();

    if (qError) {
      return NextResponse.json(
        { success: false, error: qError.message },
        { status: 400 }
      );
    }

    const qurbanId = insertedQurban.id;

    // Insert Shareholders
    if (Array.isArray(q.shareholders) && q.shareholders.length > 0) {
      const shareholderRows = q.shareholders.map((s, idx) => ({
        qurban_id: qurbanId,
        share_index: s.shareIndex || idx + 1,
        full_name: s.fullName || "",
        phone: s.phone || null,
        share_rate: s.shareRate || "1/7",
        target_weight_kg: Number(s.targetWeightKg) || 0,
        actual_weight_kg: Number(s.actualWeightKg) || 0,
        share_price: Number(s.sharePrice) || 0,
        is_paid: Boolean(s.isPaid),
        payment_method: s.paymentMethod || "nakit",
        is_delivered: Boolean(s.isDelivered),
        delivery_date: s.deliveryDate || null,
        delivery_time: s.deliveryTime || null,
        delivered_to: s.deliveredTo || null,
        special_requests: s.specialRequests || null,
      }));

      await supabase.from("qurban_shareholders").insert(shareholderRows);
    }

    // Process and Insert Media
    if (Array.isArray(q.media) && q.media.length > 0) {
      const processedMedia = await processMediaUpload(supabase, q.qurbanNo || "KRB", q.media);
      const mediaRows = processedMedia.map((m) => ({
        qurban_id: qurbanId,
        type: m.type,
        title: m.title || "Belge / Fotoğraf",
        url: m.url,
      }));

      await supabase.from("qurban_media").insert(mediaRows);
    }

    // Fetch complete inserted record
    const { data: completeData } = await supabase
      .from("qurbans")
      .select(`
        *,
        qurban_shareholders (*),
        qurban_media (*)
      `)
      .eq("id", qurbanId)
      .single();

    return NextResponse.json({
      success: true,
      qurban: completeData ? mapSupabaseToQurban(completeData) : null,
      message: "Kurban kaydı başarıyla oluşturuldu.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create qurban" },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update an existing Qurban record
 */
export async function PUT(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured" },
      { status: 500 }
    );
  }

  try {
    const body: QurbanRecord = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Kurban ID zorunludur." },
        { status: 400 }
      );
    }

    const qurbanRow: any = {
      qurban_no: (body.qurbanNo || "").trim(),
      ear_tag_no: (body.earTagNo || "").trim(),
      animal_type: body.animalType || "buyukbas_tosun",
      animal_type_label: body.animalTypeLabel || "Büyükbaş Tosun",
      status: body.status || "incoming",
      origin_city: (body.originCity || "").trim(),
      origin_farm: (body.originFarm || "").trim() || null,
      truck_plate: (body.truckPlate || "").trim().toUpperCase(),
      driver_name: (body.driverName || "").trim() || null,
      driver_phone: (body.driverPhone || "").trim() || null,
      dispatch_note_no: (body.dispatchNoteNo || "").trim() || null,
      arrival_date: body.arrivalDate || new Date().toISOString().split("T")[0],
      invoice_no: (body.invoiceNo || "").trim() || null,
      invoice_date: body.invoiceDate || null,
      supplier_name: (body.supplierName || "").trim() || null,
      purchase_price: Number(body.purchasePrice) || 0,
      additional_costs: Number(body.additionalCosts) || 0,
      slaughterhouse_name: (body.slaughterhouseName || "").trim() || null,
      slaughter_date: body.slaughterDate || null,
      slaughter_time: body.slaughterTime || null,
      slaughter_order_no: body.slaughterOrderNo ? Number(body.slaughterOrderNo) : null,
      butcher_team: (body.butcherTeam || "").trim() || null,
      live_weight_kg: Number(body.liveWeightKg) || 0,
      carcass_weight_kg: Number(body.carcassWeightKg) || 0,
      bone_weight_kg: Number(body.boneWeightKg) || 0,
      total_shares: Number(body.totalShares) || 7,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };

    // Update parent record
    const { error: updateErr } = await supabase
      .from("qurbans")
      .update(qurbanRow)
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 400 }
      );
    }

    // Refresh Shareholders: Delete existing and re-insert updated list
    if (Array.isArray(body.shareholders)) {
      await supabase.from("qurban_shareholders").delete().eq("qurban_id", id);

      if (body.shareholders.length > 0) {
        const sRows = body.shareholders.map((s, idx) => ({
          qurban_id: id,
          share_index: s.shareIndex || idx + 1,
          full_name: s.fullName || "",
          phone: s.phone || null,
          share_rate: s.shareRate || "1/7",
          target_weight_kg: Number(s.targetWeightKg) || 0,
          actual_weight_kg: Number(s.actualWeightKg) || 0,
          share_price: Number(s.sharePrice) || 0,
          is_paid: Boolean(s.isPaid),
          payment_method: s.paymentMethod || "nakit",
          is_delivered: Boolean(s.isDelivered),
          delivery_date: s.deliveryDate || null,
          delivery_time: s.deliveryTime || null,
          delivered_to: s.deliveredTo || null,
          special_requests: s.specialRequests || null,
        }));

        await supabase.from("qurban_shareholders").insert(sRows);
      }
    }

    // Refresh Media
    if (Array.isArray(body.media)) {
      await supabase.from("qurban_media").delete().eq("qurban_id", id);

      if (body.media.length > 0) {
        const processed = await processMediaUpload(supabase, body.qurbanNo || "KRB", body.media);
        const mRows = processed.map((m) => ({
          qurban_id: id,
          type: m.type,
          title: m.title || "Belge / Fotoğraf",
          url: m.url,
        }));

        await supabase.from("qurban_media").insert(mRows);
      }
    }

    // Fetch updated record
    const { data: updatedData } = await supabase
      .from("qurbans")
      .select(`
        *,
        qurban_shareholders (*),
        qurban_media (*)
      `)
      .eq("id", id)
      .single();

    return NextResponse.json({
      success: true,
      qurban: updatedData ? mapSupabaseToQurban(updatedData) : null,
      message: "Kurban kaydı başarıyla güncellendi.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update qurban" },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Delete a Qurban record by ID (Cascade deletes shareholders & media)
 */
export async function DELETE(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured" },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch {
        // query param is fine
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Silinecek kurban ID'si belirtilmelidir." },
        { status: 400 }
      );
    }

    const { error: delErr } = await supabase
      .from("qurbans")
      .delete()
      .eq("id", id);

    if (delErr) {
      return NextResponse.json(
        { success: false, error: delErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Kurban kaydı ve ilişkili tüm veriler Supabase'den silindi.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete qurban" },
      { status: 500 }
    );
  }
}
