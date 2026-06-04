import { NextRequest, NextResponse } from "next/server";
import { syncMicrosoftFormsResponses } from "@/lib/microsoft-forms-sync";

export async function POST(req: NextRequest) {
  try {
    const result = await syncMicrosoftFormsResponses();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors || [],
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Sync failed: ${error}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message:
      "POST to this endpoint to trigger Microsoft Forms auto-sync",
    endpoint: "/api/sync/forms",
  });
}
