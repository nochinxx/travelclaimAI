import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

# Repo root is one level up from this file (pdf-service/)
REPO_ROOT = Path(__file__).parent.parent
APP_ROOT = REPO_ROOT / "app"

# fill_dd1351_official.py lives in app/scripts/
sys.path.insert(0, str(APP_ROOT / "scripts"))

app = FastAPI(title="TravelClaim PDF Service")

TEMPLATE_PATH = APP_ROOT / "data" / "reference" / "dd1351-2.original-official.pdf"


@app.get("/health")
def health():
    return {"ok": True, "template_exists": TEMPLATE_PATH.exists()}


@app.post(
    "/generate-dd1351",
    responses={
        400: {"description": "Invalid JSON body"},
        500: {"description": "PDF generation failed"},
        503: {"description": "PDF template not found"},
    },
)
async def generate_dd1351(request: Request):
    try:
        form_input = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    if not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=503, detail="PDF template not found.")

    with tempfile.TemporaryDirectory() as work_dir:
        input_path = Path(work_dir) / "claim-input.json"
        output_path = Path(work_dir) / "dd1351.pdf"

        input_path.write_text(json.dumps(form_input), encoding="utf-8")

        # Import and call fill_pdf directly — no subprocess needed
        import fill_dd1351_official  # noqa: PLC0415
        fill_dd1351_official.fill_pdf(
            TEMPLATE_PATH,
            input_path,
            output_path,
        )

        if not output_path.exists():
            raise HTTPException(status_code=500, detail="PDF was not generated.")

        pdf_bytes = output_path.read_bytes()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"content-disposition": "attachment; filename=dd1351.pdf"},
    )
