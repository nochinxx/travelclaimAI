import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getClaimByToken } from "@/lib/travelclaim/claims-client";
import { mergeClaimToFormInput } from "@/lib/travelclaim/claim-types";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const claim = await getClaimByToken(token).catch(() => null);

  if (!claim?.authData) {
    return Response.json({ error: "Claim not found." }, { status: 404 });
  }

  const formInput = mergeClaimToFormInput(claim.authData, claim.soldierData);

  // Production: delegate to the Python PDF microservice on Railway
  const pdfServiceUrl = process.env.DD1351_PDF_SERVICE_URL;
  if (pdfServiceUrl) {
    return callPdfService(pdfServiceUrl, formInput, token);
  }

  // Local fallback: spawn the Python script directly
  return runLocalPython(formInput, token);
}

async function callPdfService(
  serviceUrl: string,
  formInput: unknown,
  token: string,
) {
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/generate-dd1351`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(formInput),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string };
    return Response.json(
      { error: payload.detail ?? "PDF service returned an error." },
      { status: 502 },
    );
  }

  const pdfBytes = await response.arrayBuffer();
  return new NextResponse(pdfBytes, {
    headers: {
      "content-disposition": `attachment; filename="dd1351-${token}.pdf"`,
      "content-type": "application/pdf",
    },
  });
}

async function runLocalPython(formInput: unknown, token: string) {
  const officialTemplate = join(process.cwd(), "data", "reference", "dd1351-2.original-official.pdf");
  const fallbackTemplate = join(process.cwd(), "data", "reference", "dd1351-2.pdf");
  const templatePath = existsSync(officialTemplate) ? officialTemplate : fallbackTemplate;
  const scriptPath = join(process.cwd(), "scripts", "fill_dd1351_official.py");

  if (!existsSync(templatePath)) {
    return Response.json({ error: "DD1351 PDF template is missing. Set DD1351_PDF_SERVICE_URL to use the PDF microservice." }, { status: 503 });
  }

  if (!existsSync(scriptPath)) {
    return Response.json({ error: "DD1351 filler script is missing. Set DD1351_PDF_SERVICE_URL to use the PDF microservice." }, { status: 503 });
  }

  const workDir = await mkdtemp(join(tmpdir(), "travelclaim-dd1351-"));
  const inputPath = join(workDir, "claim-input.json");
  const outputPath = join(workDir, "dd1351.pdf");

  try {
    await writeFile(inputPath, JSON.stringify(formInput, null, 2), "utf8");

    const python = process.env.DD1351_PYTHON_BIN ?? (process.platform === "win32" ? "python" : "python3");
    await execFileAsync(python, [scriptPath, templatePath, inputPath, outputPath], {
      timeout: 30_000,
    });

    const pdfBytes = await readFile(outputPath);
    return new NextResponse(pdfBytes, {
      headers: {
        "content-disposition": `attachment; filename="dd1351-${token}.pdf"`,
        "content-type": "application/pdf",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error.";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { force: true, recursive: true }).catch(() => undefined);
  }
}
