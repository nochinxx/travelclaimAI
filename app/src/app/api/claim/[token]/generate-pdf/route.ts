import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  if (!claim || !claim.authData) {
    return Response.json({ error: "Claim not found." }, { status: 404 });
  }

  const officialTemplatePath = join(process.cwd(), "data", "reference", "dd1351-2.original-official.pdf");
  const fallbackTemplatePath = join(process.cwd(), "data", "reference", "dd1351-2.pdf");
  const templatePath = existsSync(officialTemplatePath) ? officialTemplatePath : fallbackTemplatePath;
  const scriptPath = join(process.cwd(), "scripts", "fill_dd1351_official.py");

  if (!existsSync(templatePath)) {
    return Response.json({ error: "DD1351 PDF template is missing." }, { status: 503 });
  }

  if (!existsSync(scriptPath)) {
    return Response.json({ error: "DD1351 PDF filler script is missing." }, { status: 503 });
  }

  const workDir = await mkdtemp(join(tmpdir(), "travelclaim-dd1351-"));
  const inputPath = join(workDir, "claim-input.json");
  const outputPath = join(workDir, "dd1351.pdf");

  try {
    const formInput = mergeClaimToFormInput(claim.authData, claim.soldierData);
    await writeFile(inputPath, JSON.stringify(formInput, null, 2), "utf8");

    const python = resolvePythonExecutable();
    await execFileAsync(python, [scriptPath, templatePath, inputPath, outputPath], {
      cwd: process.cwd(),
      timeout: 30_000,
      windowsHide: true,
    });

    const pdfBytes = await readFile(outputPath);
    const bodyBytes = new Uint8Array(pdfBytes);
    const bodyBuffer = bodyBytes.buffer.slice(
      bodyBytes.byteOffset,
      bodyBytes.byteOffset + bodyBytes.byteLength,
    );
    const body = new Blob([bodyBuffer], { type: "application/pdf" });

    return new NextResponse(body, {
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

function resolvePythonExecutable() {
  if (process.env.DD1351_PYTHON_BIN) {
    return process.env.DD1351_PYTHON_BIN;
  }

  const userProfile = process.env.USERPROFILE;
  if (userProfile) {
    const probeVenvPython = join(userProfile, "pdf-probe", ".venv", "Scripts", "python.exe");
    if (existsSync(probeVenvPython)) {
      return probeVenvPython;
    }
  }

  return process.platform === "win32" ? "python" : "python3";
}
