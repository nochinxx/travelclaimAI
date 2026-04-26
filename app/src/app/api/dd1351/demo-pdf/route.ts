import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { fillDd1351Pdf } from "@/lib/travelclaim/dd1351PdfFill";
import { DEMO_PHASE_2_FORM_FILL_INPUT } from "@/lib/travelclaim/dd1351FormFilling";

export const runtime = "nodejs";

export async function GET() {
  const templatePath = join(process.cwd(), "data", "reference", "dd1351-2.pdf");
  let templateBytes = new Uint8Array();

  try {
    templateBytes = await readFile(templatePath);
  } catch {
    templateBytes = new Uint8Array();
  }

  const result = await fillDd1351Pdf(templateBytes, DEMO_PHASE_2_FORM_FILL_INPUT);
  const bodyBytes = new Uint8Array(result.bytes);
  const bodyBuffer = bodyBytes.buffer.slice(
    bodyBytes.byteOffset,
    bodyBytes.byteOffset + bodyBytes.byteLength,
  );
  const body = new Blob([bodyBuffer], { type: "application/pdf" });

  return new NextResponse(body, {
    headers: {
      "content-disposition": 'attachment; filename="filled_dd1351_2_demo.pdf"',
      "content-type": "application/pdf",
      "x-travelclaim-pdf-mode": result.mode,
      "x-travelclaim-pdf-warnings": encodeURIComponent(
        result.warnings.join(" | "),
      ),
    },
  });
}
