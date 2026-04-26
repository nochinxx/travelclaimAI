# TravelClaim AI

TravelClaim AI helps a CO create a DD Form 1351-2 travel authorization, gives the traveler a claim link, captures traveler details and receipts, and generates a filled voucher preview/PDF.

## Team

- Noah Bran
- Mario Jimenez
- Omar Ferrufino

## Track

GenAI.mil

## What We Built

TravelClaim AI is a generative AI workflow for military travel voucher preparation. It supports a two-role claim process:

- A CO/Authorizing Official creates a travel authorization through chat.
- The app checks travel rules against a RAG-backed regulation search.
- The traveler opens a secure claim link and fills in actual travel details.
- The traveler can upload receipt images for reimbursable expenses.
- Google Cloud Vision OCR extracts receipt text.
- The traveler confirms or edits extracted receipt fields.
- Confirmed receipt data is added to DD Form 1351-2 Block 18.
- Supplemental documents can be uploaded and stored with the claim package without OCR.
- The app generates a DD1351-2 preview and an official filled PDF.

The goal is to reduce voucher friction, improve receipt validation, and help travelers and reviewers prepare cleaner travel claims.

## Datasets And APIs Used

- **Joint Travel Regulations (JTR)**: source regulation corpus for travel entitlement search.
- **Branch travel regulation PDFs**: supplemental regulation corpus for Army, Navy, Air Force, Marine Corps, and Coast Guard workflows.
- **Supabase Postgres**: stores travel claims, RAG documents/chunks, receipt attachments, and supplemental documents.
- **Supabase Storage**: stores uploaded receipt images, PDFs, and supplemental claim documents in a private bucket.
- **Supabase pgvector**: stores 768-dimensional regulation embeddings for semantic retrieval.
- **Gemini API**: powers the chat assistant and regulation-grounded claim guidance.
- **Gemini Embeddings (`gemini-embedding-001`)**: embeds regulation chunks and search queries for RAG.
- **Google Cloud Vision OCR**: extracts text from uploaded receipt images.
- **Official DD Form 1351-2 PDF template**: filled locally through the Python PDF script.

## Local Setup

Install app dependencies:

```bash
pnpm install
```

Install the Python PDF dependencies used by the official DD1351-2 filler:

```bash
python3 -m pip install --user -r requirements-pdf.txt
```

Create `app/.env.local` with local secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768
GEMINI_CHAT_MODEL=gemini-2.5-flash

GOOGLE_APPLICATION_CREDENTIALS=/Users/YOUR_NAME/keys/travelclaim-vision-ocr.json
```

Do not commit `.env.local` or Google service-account JSON files.

## Google Vision OCR

Receipt OCR uses Google Cloud Vision through `@google-cloud/vision`.

For local development, put the service-account JSON outside the repo, for example:

```bash
/Users/YOUR_NAME/keys/travelclaim-vision-ocr.json
```

Then point `GOOGLE_APPLICATION_CREDENTIALS` at that file in `.env.local`.

For deployment, use a secure hosting environment variable instead:

```bash
GOOGLE_CLOUD_VISION_CREDENTIALS_JSON=
```

The JSON key is a secret. Share it only through a secure channel.

## Supabase Setup

Run the SQL migrations in `../supabase/migrations/` against the shared Supabase project.

Required pieces include:

- `travel_claims` for claim authorization and soldier data.
- RAG tables/functions for regulation search.
- `claim_attachments` for receipts and supplemental documents.
- Private Supabase Storage bucket: `claim-attachments`.

After adding or changing Supabase tables, reload the API schema cache:

```sql
notify pgrst, 'reload schema';
```

## Receipt And Attachment Workflow

On `/claim/[token]`, the traveler can:

- Upload a receipt image.
- Let Google Vision OCR extract text.
- Review/edit extracted date, merchant, amount, category, receipt type, and payment method.
- Confirm the receipt into `soldier_data.expenses` for DD1351-2 Block 18.
- Add supporting documents that are stored with the claim package but are not OCR-scanned and do not update form fields.

Receipt images work best for OCR. PDFs can be stored as attachments, but direct PDF OCR is not the supported local path right now.

## DD1351-2 PDF

The app can generate a filled official DD1351-2 PDF using:

- `scripts/fill_dd1351_official.py`
- `data/reference/dd1351-2.original-official.pdf`
- Python packages from `requirements-pdf.txt`

If PDF generation fails with `ModuleNotFoundError: No module named 'pypdf'`, run:

```bash
python3 -m pip install --user -r requirements-pdf.txt
```

## Run Locally

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

Useful routes:

- `/claim/new` creates a CO authorization.
- `/claim/[token]` is the traveler claim page.
- `/claim/[token]/preview` shows the DD1351-2 preview.
- `/` searches regulations through RAG.

## Checks

Before pushing:

```bash
pnpm lint
pnpm build
```

If `pnpm build` fails locally with a Turbopack worker/port permission error in a sandboxed environment, rerun it normally from your terminal.
