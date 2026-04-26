import { NextResponse } from "next/server";
import { DEMO_PHASE_2_FORM_FILL_INPUT } from "@/lib/travelclaim/dd1351FormFilling";
import { buildDd1351AuditPacket } from "@/lib/travelclaim/dd1351ExportPacket";

export const runtime = "nodejs";

export async function GET() {
  const auditPacket = buildDd1351AuditPacket(DEMO_PHASE_2_FORM_FILL_INPUT);

  return NextResponse.json(auditPacket, {
    headers: {
      "content-disposition": 'attachment; filename="voucher_audit.json"',
    },
  });
}
