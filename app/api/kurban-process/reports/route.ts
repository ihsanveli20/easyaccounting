import { NextResponse } from "next/server";
import { SEED_REPORTS } from "../../../utils/kurbanProcessSeed";
import {
  getSupabaseServerClient,
  isUUID,
  ensureUUID,
  mapReportFromDb,
} from "../../../utils/kurbanProcessDb";
import { KurbanReport, KurbanReportSection } from "../../../types/kurbanProcess";

// In-memory reports store
let memoryReports: KurbanReport[] = JSON.parse(JSON.stringify(SEED_REPORTS));

/**
 * GET: Fetch reports by location or reportId
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const reportId = searchParams.get("reportId");

  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      let query = supabase
        .from("kurban_reports")
        .select("*, kurban_report_sections(*)");

      if (reportId && isUUID(reportId)) {
        query = query.eq("id", reportId);
      } else if (locationId && locationId !== "all" && isUUID(locationId)) {
        query = query.eq("cutting_location_id", locationId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const mappedReports: KurbanReport[] = data.map((r: any) =>
          mapReportFromDb(r)
        );

        return NextResponse.json({
          success: true,
          source: "supabase",
          reports: mappedReports,
        });
      } else {
        // If filtered query returned 0, return all reports from Supabase so reports never disappear
        const { data: allData } = await supabase
          .from("kurban_reports")
          .select("*, kurban_report_sections(*)");
        if (allData && allData.length > 0) {
          return NextResponse.json({
            success: true,
            source: "supabase_all",
            reports: allData.map((r: any) => mapReportFromDb(r)),
          });
        }
      }
    } catch (e) {
      console.warn("Supabase report fetch fallback:", e);
    }
  }

  // Memory fallback
  let result = memoryReports;
  if (reportId) {
    result = result.filter((r) => r.id === reportId);
  } else if (locationId && locationId !== "all") {
    const matched = result.filter((r) => r.cuttingLocationId === locationId);
    if (matched.length > 0) result = matched;
  }

  return NextResponse.json({
    success: true,
    source: "in_memory",
    reports: result,
  });
}

/**
 * PUT: Update report metadata or sections
 */
export async function PUT(request: Request) {
  try {
    const body: Partial<KurbanReport> & { sections?: KurbanReportSection[] } =
      await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "Rapor ID zorunludur." },
        { status: 400 }
      );
    }

    // Update in memory store
    const idx = memoryReports.findIndex((r) => r.id === body.id);
    if (idx !== -1) {
      memoryReports[idx] = {
        ...memoryReports[idx],
        ...body,
        updatedAt: new Date().toISOString(),
      };
    }

    // Update in Supabase
    const supabase = getSupabaseServerClient();
    if (supabase && isUUID(body.id)) {
      const { error: repErr } = await supabase
        .from("kurban_reports")
        .update({
          title: body.title,
          report_date: body.reportDate,
          report_period: body.reportPeriod,
          prepared_by: body.preparedBy,
          status: body.status,
          executive_summary: body.executiveSummary,
          evaluation_notes: body.evaluationNotes,
          final_result_summary: body.finalResultSummary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id);

      if (repErr) {
        console.error("Supabase report update error:", repErr);
        return NextResponse.json(
          {
            success: false,
            error: `Rapor Supabase'e kaydedilemedi: ${repErr.message}`,
          },
          { status: 500 }
        );
      }

      // If sections provided, upsert them
      if (body.sections && Array.isArray(body.sections)) {
        for (const s of body.sections) {
          const sectionId = ensureUUID(s.id);
          const { error: secErr } = await supabase.from("kurban_report_sections").upsert({
            id: sectionId,
            report_id: body.id,
            section_key: s.sectionKey,
            section_title: s.sectionTitle,
            order_index: s.orderIndex,
            is_enabled: Boolean(s.isEnabled ?? true),
            content_html: s.contentHtml || "",
            custom_notes: s.customNotes || "",
            include_tables: Boolean(s.includeTables ?? true),
            page_break_after: Boolean(s.pageBreakAfter ?? false),
          });

          if (secErr) {
            console.error("Supabase section update error:", secErr);
            return NextResponse.json(
              {
                success: false,
                error: `Rapor bölümü kaydedilemedi: ${secErr.message}`,
              },
              { status: 500 }
            );
          }
        }
      }

      // Fetch fresh updated report from Supabase
      const { data: updatedDbReport } = await supabase
        .from("kurban_reports")
        .select("*, kurban_report_sections(*)")
        .eq("id", body.id)
        .single();

      if (updatedDbReport) {
        const mapped = mapReportFromDb(updatedDbReport);
        return NextResponse.json({
          success: true,
          message: "Resmi rapor ve bölümleri başarıyla kaydedildi.",
          report: mapped,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Resmi rapor ve bölümleri başarıyla kaydedildi.",
      report: memoryReports.find((r) => r.id === body.id) || body,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Rapor güncellenemedi." },
      { status: 500 }
    );
  }
}

/**
 * POST: Save a snapshot revision (Geçmiş Rapor Revizyonu)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reportId, title, snapshotData, savedBy } = body;

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: "Rapor ID zorunludur." },
        { status: 400 }
      );
    }

    const revisionId = ensureUUID(body.id);
    const revision = {
      id: revisionId,
      report_id: reportId,
      title: title || `Revizyon ${new Date().toLocaleDateString("tr-TR")}`,
      snapshot_data: snapshotData || {},
      saved_by: savedBy || "Sistem Yetkilisi",
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseServerClient();
    if (supabase && isUUID(reportId)) {
      const { error: revErr } = await supabase.from("kurban_report_revisions").insert(revision);
      if (revErr) {
        console.error("Supabase revision insert error:", revErr);
        return NextResponse.json(
          {
            success: false,
            error: `Revizyon Supabase'e kaydedilemedi: ${revErr.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      revision,
      message: "Rapor revizyonu donduruldu ve kaydedildi.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Revizyon kaydedilemedi." },
      { status: 500 }
    );
  }
}
