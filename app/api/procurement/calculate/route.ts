import { NextResponse } from "next/server";
import { evaluateProcurementComparison } from "../../../utils/procurementEngine";
import { ProcurementComparison } from "../../../types/procurement";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const comparison = body?.comparison as ProcurementComparison | undefined;

    if (!comparison || !Array.isArray(comparison.needs) || !Array.isArray(comparison.quotes)) {
      return NextResponse.json(
        { success: false, error: "Geçersiz karşılaştırma verisi." },
        { status: 400 }
      );
    }

    const report = evaluateProcurementComparison(comparison);
    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Hesaplama doğrulanamadı.",
      },
      { status: 500 }
    );
  }
}

