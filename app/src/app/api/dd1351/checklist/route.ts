import { NextResponse } from "next/server";
import { DEMO_PHASE_2_FORM_FILL_INPUT } from "@/lib/travelclaim/dd1351FormFilling";
import { buildReviewerChecklistMarkdown } from "@/lib/travelclaim/dd1351ExportPacket";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(
    buildReviewerChecklistMarkdown(DEMO_PHASE_2_FORM_FILL_INPUT),
    {
      headers: {
        "content-disposition": 'attachment; filename="reviewer_checklist.md"',
        "content-type": "text/markdown; charset=utf-8",
      },
    },
  );
}
