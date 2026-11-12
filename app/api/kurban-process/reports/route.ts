import { NextResponse, connection } from "next/server";
import { SEED_REPORTS } from "../../../utils/kurbanProcessSeed";
import {
  getSupabaseServerClient,
  isUUID,
  ensureUUID,
  getActiveOrganizationId,
  loadKurbanPersistentState,
  saveKurbanPersistentState,
  createDefaultPersistentState,
  syncLocationsWithSlaughterhouseParties,
  loadRelationalFallbackState,
  mapReportFromDb,
} from "../../../utils/kurbanProcessDb";
import { KurbanReport, KurbanReportSection } from "../../../types/kurbanProcess";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

// In-memory reports store
let memoryReports: KurbanReport[] = JSON.parse(JSON.stringify(SEED_REPORTS));

/**
 * GET: Fetch reports by location or reportId
 */
export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const reportId = searchParams.get("reportId");

  const supabase = getSupabaseServerClient();

  // 1. Check persistent state first
  const persisted = await loadKurbanPersistentState(supabase);
  if (persisted && persisted.isCustomized) {
    const synced = syncLocationsWithSlaughterhouseParties(persisted);
    let result = synced.reports || [];
    if (reportId) {
      result = result.filter((r) => r.id === reportId);
    } else if (locationId && locationId !== "all") {
      const matched = result.filter((r) => r.cuttingLocationId === locationId);
      if (matched.length > 0) result = matched;
    }
    memoryReports = synced.reports || [];
    return NextResponse.json(
      {
        success: true,
        source: "supabase_persistent_state",
        reports: result,
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  // 2. Check relational state (parties/locations + reports) before raw table/seed
  const relationalState = await loadRelationalFallbackState(supabase);
  if (relationalState) {
    let result = relationalState.reports || [];
    if (reportId) {
      result = result.filter((r) => r.id === reportId);
    } else if (locationId && locationId !== "all") {
      const matched = result.filter((r) => r.cuttingLocationId === locationId);
      if (matched.length > 0) result = matched;
    }
    memoryReports = relationalState.reports || [];
    return NextResponse.json(
      {
        success: true,
        source: "supabase_relational",
        reports: result,
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  // 3. Check relational table directly
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

        return NextResponse.json(
          {
            success: true,
            source: "supabase",
            reports: mappedReports,
          },
          { headers: NO_STORE_HEADERS }
        );
      } else {
        const { data: allData } = await supabase
          .from("kurban_reports")
          .select("*, kurban_report_sections(*)");
        if (allData && allData.length > 0) {
          return NextResponse.json(
            {
              success: true,
              source: "supabase_all",
              reports: allData.map((r: any) => mapReportFromDb(r)),
            },
            { headers: NO_STORE_HEADERS }
          );
        }
      }
    } catch (e) {
      console.warn("Supabase report fetch fallback:", e);
    }
  }

  // 4. Memory fallback
  let result = memoryReports;
  if (reportId) {
    result = result.filter((r) => r.id === reportId);
  } else if (locationId && locationId !== "all") {
    const matched = result.filter((r) => r.cuttingLocationId === locationId);
    if (matched.length > 0) result = matched;
  }

  return NextResponse.json(
    {
      success: true,
      source: "in_memory",
      reports: result,
    },
    { headers: NO_STORE_HEADERS }
  );
}

/**
 * PUT: Update report metadata or sections
 */
export async function PUT(request: Request) {
  try {
    const body: Partial<KurbanReport> & { sections?: KurbanReportSection[] } =
      await request.json();

    if (!body.id && !body.cuttingLocationId) {
      return NextResponse.json(
        { success: false, error: "Rapor ID veya kesim yeri ID zorunludur." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    // Load existing customized state OR initialize from real Supabase relational tables
    // (NEVER overwrite real relational org/parties/locations with mock seed data!)
    let baseState = await loadKurbanPersistentState(supabase);
    if (!baseState || !baseState.isCustomized) {
      const relational = await loadRelationalFallbackState(supabase);
      baseState = relational || baseState || createDefaultPersistentState();
    }
    const persisted = syncLocationsWithSlaughterhouseParties(baseState);

    // Match by report id first, then by cuttingLocationId so edited report replaces the synced report cleanly
    const pIdx = persisted.reports.findIndex(
      (r) =>
        (body.id && r.id === body.id) ||
        (body.cuttingLocationId && r.cuttingLocationId === body.cuttingLocationId)
    );

    let updatedReportObj: KurbanReport;
    if (pIdx !== -1) {
      const existingReport = persisted.reports[pIdx];
      updatedReportObj = {
        ...existingReport,
        ...body,
        id: existingReport.id,
        updatedAt: new Date().toISOString(),
      } as KurbanReport;
      persisted.reports[pIdx] = updatedReportObj;
    } else {
      updatedReportObj = {
        ...SEED_REPORTS[0],
        ...body,
        id: ensureUUID(body.id),
        updatedAt: new Date().toISOString(),
      } as KurbanReport;
      persisted.reports.push(updatedReportObj);
    }

    const savedToState = await saveKurbanPersistentState(persisted, supabase);

    // Update in memory store
    const idx = memoryReports.findIndex(
      (r) =>
        r.id === updatedReportObj.id ||
        (updatedReportObj.cuttingLocationId &&
          r.cuttingLocationId === updatedReportObj.cuttingLocationId)
    );
    if (idx !== -1) {
      memoryReports[idx] = updatedReportObj;
    } else {
      memoryReports.push(updatedReportObj);
    }

    // Also upsert into Supabase relational tables (kurban_reports & kurban_report_sections)
    let relationalSaved = false;
    if (supabase && isUUID(updatedReportObj.id) && isUUID(updatedReportObj.cuttingLocationId)) {
      try {
        const orgId = await getActiveOrganizationId(supabase, updatedReportObj.organizationId);
        const { error: repUpsertErr } = await supabase
          .from("kurban_reports")
          .upsert(
            {
              id: updatedReportObj.id,
              organization_id: orgId,
              cutting_location_id: updatedReportObj.cuttingLocationId,
              report_no: updatedReportObj.reportNo || `KRB-2026-${updatedReportObj.id.slice(0, 6)}`,
              title: updatedReportObj.title || "Kurban Kesim Denetim Raporu",
              report_date: updatedReportObj.reportDate || new Date().toISOString().split("T")[0],
              report_period: updatedReportObj.reportPeriod || "2026 Kurban Dönemi",
              prepared_by: updatedReportObj.preparedBy || "Operasyon Denetim Kurulu",
              status: updatedReportObj.status || "final_approved",
              client_company_name: updatedReportObj.clientCompanyName || "Alıcı Kurum",
              executive_summary: updatedReportObj.executiveSummary || "",
              evaluation_notes: updatedReportObj.evaluationNotes || "",
              final_result_summary: updatedReportObj.finalResultSummary || "",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (!repUpsertErr) {
          relationalSaved = true;
          if (updatedReportObj.sections && Array.isArray(updatedReportObj.sections)) {
            for (const s of updatedReportObj.sections) {
              const sectionId = ensureUUID(s.id);
              await supabase.from("kurban_report_sections").upsert(
                {
                  id: sectionId,
                  report_id: updatedReportObj.id,
                  section_key: s.sectionKey || "custom",
                  section_title: s.sectionTitle || "Bölüm",
                  order_index: s.orderIndex ?? 1,
                  is_enabled: Boolean(s.isEnabled ?? true),
                  content_html: s.contentHtml || "",
                  custom_notes: s.customNotes || "",
                  include_tables: Boolean(s.includeTables ?? true),
                  page_break_after: Boolean(s.pageBreakAfter ?? false),
                },
                { onConflict: "id" }
              );
            }
          }
        } else {
          console.warn("Supabase relational report upsert warning:", repUpsertErr);
        }
      } catch (e) {
        console.warn("Supabase relational report update warning:", e);
      }
    }

    if (supabase && !savedToState && !relationalSaved) {
      return NextResponse.json(
        {
          success: false,
          error: "Rapor değişiklikleri veritabanına kaydedilemedi. Lütfen tekrar deneyin.",
        },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Resmi rapor ve bölümleri başarıyla kaydedildi.",
        report: updatedReportObj,
      },
      { headers: NO_STORE_HEADERS }
    );
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
        console.warn("Supabase revision insert warning:", revErr);
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
