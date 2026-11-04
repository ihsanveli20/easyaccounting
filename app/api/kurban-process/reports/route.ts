import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SEED_REPORTS } from "../../../utils/kurbanProcessSeed";
import { KurbanReport, KurbanReportSection } from "../../../types/kurbanProcess";

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

      if (reportId) {
        query = query.eq("id", reportId);
      } else if (locationId && locationId !== "all") {
        query = query.eq("cutting_location_id", locationId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const mappedReports: KurbanReport[] = data.map((r: any) => ({
          id: r.id,
          organizationId: r.organization_id,
          cuttingLocationId: r.cutting_location_id,
          cuttingLocationName: r.cutting_location_name,
          reportNo: r.report_no,
          title: r.title,
          reportDate: r.report_date,
          reportPeriod: r.report_period,
          preparedBy: r.prepared_by,
          status: r.status,
          clientCompanyName: r.client_company_name,
          executiveSummary: r.executive_summary,
          evaluationNotes: r.evaluation_notes,
          finalResultSummary: r.final_result_summary,
          metadata: r.metadata,
          sections: (r.kurban_report_sections || [])
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((s: any) => ({
              id: s.id,
              reportId: s.report_id,
              sectionKey: s.section_key,
              sectionTitle: s.section_title,
              orderIndex: s.order_index,
              isEnabled: s.is_enabled,
              contentHtml: s.content_html,
              customNotes: s.custom_notes,
              includeTables: s.include_tables,
              pageBreakAfter: s.page_break_after,
              createdAt: s.created_at,
            })),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));

        return NextResponse.json({
          success: true,
          source: "supabase",
          reports: mappedReports,
        });
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
    result = result.filter((r) => r.cuttingLocationId === locationId);
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
    if (supabase) {
      try {
        await supabase
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

        // If sections provided, upsert them
        if (body.sections && Array.isArray(body.sections)) {
          for (const s of body.sections) {
            await supabase.from("kurban_report_sections").upsert({
              id: s.id,
              report_id: body.id,
              section_key: s.sectionKey,
              section_title: s.sectionTitle,
              order_index: s.orderIndex,
              is_enabled: s.isEnabled,
              content_html: s.contentHtml,
              custom_notes: s.customNotes,
              include_tables: s.includeTables,
              page_break_after: s.pageBreakAfter,
            });
          }
        }
      } catch (e) {
        console.warn("Supabase report update fallback:", e);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Resmi rapor ve bölümleri başarıyla kaydedildi.",
      report: memoryReports.find((r) => r.id === body.id),
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

    const revision = {
      id: `rev-${Date.now()}`,
      report_id: reportId,
      title: title || `Revizyon ${new Date().toLocaleDateString("tr-TR")}`,
      snapshot_data: snapshotData || {},
      saved_by: savedBy || "Sistem Yetkilisi",
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        await supabase.from("kurban_report_revisions").insert(revision);
      } catch (e) {
        console.warn("Revision insert fallback:", e);
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
