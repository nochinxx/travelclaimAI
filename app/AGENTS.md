<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TravelClaim AI Agent Notes

## Product Overview

TravelClaim AI helps US military members and DoD civilians complete DD Form 1351-2 (Travel Voucher) claims. It has two roles:

- **CO / Authorizing Official** — creates a travel authorization via chat, verified against JTR. Generates a shareable link for the soldier.
- **Soldier / Traveler** — opens the shared link, sees pre-authorized fields, fills actual travel details and expenses via chat.

---

## Two-Role Claim Workflow

```
CO opens /claim/new
  → chats with Gemini (CO system prompt)
  → Gemini searches JTR before confirming any authorization
  → Gemini calls create_authorization tool when all fields confirmed
  → claim saved to Supabase travel_claims with a share token
  → CO gets shareable link: /claim/[token]

Soldier opens /claim/[token]
  → page fetches claim from Supabase via GET /api/claim/[token]
  → pre-authorized fields shown in sidebar (read-only)
  → chats with Gemini (soldier system prompt + auth context injected)
  → Gemini calls update_claim_fields tool as soldier confirms details
  → progress saved to travel_claims.soldier_data via PATCH /api/claim/[token]
  → "Progress saved at HH:MM:SS" shown in footer when data is written
```

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Regulation search (RAG) |
| `/chat` | General claim assistant (no pre-loaded auth) |
| `/dd1351` | Demo DD 1351-2 block preview with synthetic data |
| `/claim/new` | CO interface — create a travel authorization |
| `/claim/[token]` | Soldier interface — fill actual travel details |

---

## Gemini Chat Engine

`src/lib/ai/gemini-chat.ts`

Three roles, each with a different system prompt:

- `co` — CO_SYSTEM_PROMPT. Tools: `search_regulations`, `create_authorization`
- `soldier` — `buildSoldierSystemPrompt(authData)`. Tools: `search_regulations`, `update_claim_fields`
- `general` — GENERAL_SYSTEM_PROMPT. Tools: `search_regulations`

`ChatOptions`:
```ts
{
  role?: "co" | "soldier" | "general";
  authData?: TravelAuthorization | null;  // injected into soldier system prompt
  branch?: string | null;                 // scopes RAG to JTR + this branch supplement
  claimToken?: string | null;             // update_claim_fields writes to this claim
}
```

`ChatReply`:
```ts
{
  text: string;
  ragResults: RagSearchResult[];
  createdClaimToken?: string;   // set when CO finalizes an authorization
  soldierDataSaved?: boolean;   // set when soldier data is written to Supabase
}
```

Tool dispatch is split into `dispatchTool()` → `handleSearchRegulations()`, `handleCreateAuthorization()`, `handleUpdateClaim()`. Keep these separate to stay under the cognitive complexity limit.

---

## RAG Architecture

Supabase in production; local JSON TF-IDF index as dev fallback.

**Production search flow:**
1. PDFs ingested once: text extraction → chunking → Gemini embeddings → stored in Supabase.
2. Query time: embed query with Gemini → call `hybrid_match_regulation_chunks` RPC → ranked text chunks returned.
3. Chunks (text content) live IN Supabase. PDFs are not read at query time.

**Local fallback:**
- `pnpm rag:index` builds `../corpus/regulations/index/regulations-index.json` (gitignored).
- Active only when `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `GEMINI_API_KEY` are unset.

**Branch filtering:**
Both `hybrid_match_regulation_chunks` and `match_regulation_chunks` accept `branch_filter text default null`. When set, results are scoped to that branch **plus** `branch = 'joint'` (JTR). Never exclude the JTR — it is the universal baseline for all DoD personnel.

Valid branch values: `army`, `navy`, `air-force`, `marines`, `coast-guard`, `joint`.

---

## Corpus

Five PDFs, all embedded in Supabase:

| ID | Title | Branch |
|---|---|---|
| `jtr` | Joint Travel Regulations | `joint` |
| `air-force` | Air Force Travel Regulation | `air-force` |
| `army` | Army Travel Regulation | `army` |
| `marines` | Marine Corps Travel Regulation | `marines` |
| `navy` | Navy Travel Regulation | `navy` |

The JTR is the universal baseline. Branch supplements add branch-specific rules on top. Both the CO (making authorization decisions) and the soldier (claiming expenses) benefit from regulation search.

---

## Supabase Schema

Migrations in `../supabase/migrations/` — run in order in the Supabase SQL editor:

### `20260425230000_rag_schema.sql`
- `rag_documents` — source document metadata (`id`, `external_id`, `title`, `branch`, `visibility`, etc.)
- `rag_document_chunks` — chunk content + `pgvector` embedding (768-dim) + FTS tsvector
- `rag_document_owners` — many-to-many private document access
- `match_regulation_chunks` — semantic vector search RPC
- `hybrid_match_regulation_chunks` — semantic + keyword hybrid search RPC
- RLS enabled. Public corpus: `visibility = 'public'`, `owner_id = null`.

### `20260426000000_travel_claims.sql`
- `travel_claims` — stores CO authorization + soldier data per claim
  - `share_token text unique` — URL-safe secret; anyone with it can read/update
  - `status` — `authorized` | `in_progress` | `submitted`
  - `auth_data jsonb` — `TravelAuthorization` (CO-provided)
  - `soldier_data jsonb` — `SoldierData` (soldier-provided, written incrementally)
- RLS: permissive for now (token acts as the secret). Tighten with user auth when accounts are added.

### `20260426010000_branch_filter.sql`
- Replaces both RPC functions to add `branch_filter text default null`.
- Scopes semantic and keyword CTEs to the filtered branch + JTR before scoring.

---

## Embeddings

- Model: `gemini-embedding-001`
- Dimensions: `768`
- Task types: `RETRIEVAL_DOCUMENT` (ingestion), `RETRIEVAL_QUERY` (search)
- Helper: `src/lib/rag/gemini.ts`

Do not change dimensions without a full DB migration and re-ingestion. Keep consistent across `GEMINI_EMBEDDING_DIMENSIONS`, the migration (`extensions.vector(768)`), and all ingestion scripts.

---

## Key Types

`src/lib/travelclaim/claim-types.ts`:
- `ServiceBranch` — `"army" | "navy" | "air-force" | "marines" | "coast-guard" | "joint"`
- `TravelAuthorization` — CO-provided fields: traveler identity, `branch`, order number, authorized dates/transport/lodging, JTR citations
- `SoldierData` — soldier-provided fields: contact info, GTCC, itinerary, expenses, signature
- `TravelClaim` — full Supabase record
- `mergeClaimToFormInput(auth, soldier)` — combines both halves into `Dd1351FormFillInput` for the form preview and audit packet builders

`src/lib/travelclaim/dd1351FormFilling.ts`:
- `Dd1351FormFillInput` — complete DD 1351-2 input shape (21 blocks)
- `buildDd1351FormFillPreview(input)` — maps input to block-by-block preview
- `DEMO_PHASE_2_FORM_FILL_INPUT` — synthetic demo data (used by `/dd1351` and download routes)

`src/lib/travelclaim/dd1351ExportPacket.ts`:
- `buildDd1351AuditPacket(input)` — full validation + audit JSON
- `buildReviewerChecklistMarkdown(input)` — Markdown checklist for the approving official
- `buildDd1351ValidationFindings(input)` — standalone validation rules

`src/lib/travelclaim/dd1351PdfFill.ts`:
- Requires `pdf-lib` (not yet installed). Do not import from this file until the dependency is added.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Gemini chat. Body: `{ messages, role?, authData?, branch?, claimToken? }` |
| `GET` | `/api/claim/[token]` | Fetch a claim by share token |
| `PATCH` | `/api/claim/[token]` | Update soldier data. Body: `{ soldierData, status? }` |
| `POST` | `/api/rag/search` | RAG search (Supabase or local fallback). Body: `{ query, limit? }` |
| `GET` | `/api/dd1351/audit` | Download audit JSON (demo data) |
| `GET` | `/api/dd1351/checklist` | Download reviewer checklist Markdown (demo data) |
| `GET` | `/api/dd1351/demo-pdf` | Download demo-filled PDF (requires pdf-lib) |

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only; for trusted ingestion scripts

GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768
GEMINI_CHAT_MODEL=gemini-2.5-flash  # free tier; swap to gemini-2.0-flash with billing
```

---

## Synthetic Test Soldiers

Six profiles on `/claim/new` for testing the CO workflow. Click any card to inject the soldier's info as the first message.

| ID | Label | Branch |
|---|---|---|
| `army-e4` | SPC Doe · Army E-4 · Fort Liberty | army |
| `af-o3` | Capt Smith · Air Force O-3 · Langley | air-force |
| `navy-e6` | PO1 Garcia · Navy E-6 · Norfolk | navy |
| `marines-e5` | Sgt Johnson · Marines E-5 · Camp Lejeune | marines |
| `army-gs12` | Ms. Chen · Army Civilian GS-12 · Pentagon | army |
| `coast-guard-e7` | CPO Rivera · Coast Guard E-7 · Cape Cod | coast-guard |

---

## Commands

Run from `app/`:

```bash
pnpm dev        # start dev server
pnpm build      # production build
pnpm lint       # ESLint
pnpm rag:index  # build local TF-IDF fallback index from corpus PDFs
```

---

## Documentation

Extended RAG/Supabase notes: `../docs/rag-supabase.md`

Update that file when changing embedding dimensions, Supabase table/function contracts, ingestion assumptions, or permission behavior.
