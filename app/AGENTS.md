<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TravelClaim AI Agent Notes

## Current RAG Architecture

TravelClaim AI uses a Supabase-backed RAG architecture for production and a
local JSON retrieval index as a development fallback.

Production target:

1. Extract text from the regulation PDFs in `../corpus/regulations/raw`.
2. Chunk the extracted text with page/document metadata.
3. Generate embeddings with Gemini.
4. Store documents, chunks, metadata, and embeddings in Supabase Postgres using
   `pgvector`.
5. Query Supabase RPC functions for semantic or hybrid retrieval.
6. Let Supabase Row Level Security filter retrieved chunks by document
   permissions.

Local fallback:

- `pnpm rag:index` builds `../corpus/regulations/index/regulations-index.json`.
- `/api/rag/search` uses this local index only when Supabase/Gemini environment
  variables are not configured.
- The fallback is useful for offline development, but it is not the production
  source of truth.

## Supabase

The RAG schema lives at:

- `../supabase/migrations/20260425230000_rag_schema.sql`

Important tables/functions:

- `rag_documents`: source document metadata and ownership.
- `rag_document_owners`: many-to-many private document access grants.
- `rag_document_chunks`: chunk content, page metadata, full-text search vector,
  and `pgvector` embedding.
- `match_regulation_chunks`: semantic vector search.
- `hybrid_match_regulation_chunks`: semantic + keyword search.

The schema intentionally uses RLS. Do not bypass RLS in user-facing retrieval.
Public corpus documents should use `visibility = 'public'` and `owner_id = null`.
Private claim/user documents should use `visibility = 'private'` and
`owner_id = auth.uid()`.

There is no Supabase CLI config committed yet. Do not assume a project ref,
database password, or remote link exists unless the user provides it.

## Embeddings

Use Gemini for embeddings:

- Model: `gemini-embedding-001`
- Dimensions: `768`
- Document task type: `RETRIEVAL_DOCUMENT`
- Query task type: `RETRIEVAL_QUERY`

Keep the embedding dimension consistent across:

- `GEMINI_EMBEDDING_DIMENSIONS`
- `extensions.vector(768)` in the Supabase migration
- all ingestion embeddings
- all query embeddings

Google supports other dimensions for `gemini-embedding-001`, including 1536 and
3072, but changing dimensions requires a database migration and full re-index.
Do not mix vectors from different models or dimensions.

The query embedding helper is:

- `src/lib/rag/gemini.ts`

Supabase retrieval helper:

- `src/lib/rag/supabase.ts`

## Environment

Use `app/.env.example` as the source of expected variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768
```

A server-only Supabase service role key will be needed for trusted ingestion, but
it should not be exposed to client components.

## App Search Flow

The API route is:

- `src/app/api/rag/search/route.ts`

Behavior:

- If Supabase URL, Supabase anon key, and Gemini API key exist, search uses
  Gemini query embeddings and Supabase RPC.
- Otherwise, search falls back to local JSON retrieval from the generated corpus
  index.

The retrieval UI is:

- `src/app/search-panel.tsx`

## Corpus And Ingestion

Seed PDFs and manifest:

- `../corpus/regulations/raw/*.pdf`
- `../corpus/regulations/manifest.json`

Local extraction/index scripts:

- `../scripts/pdfkit-extract.swift`
- `../scripts/build-rag-index.mjs`

`build-rag-index.mjs` validates manifest checksums before indexing. It currently
builds a local hashed TF-IDF index. Production ingestion uses
`../scripts/ingest-rag-supabase.mjs`, embeds chunks with Gemini
`RETRIEVAL_DOCUMENT`, and writes to `rag_documents` and `rag_document_chunks`.

## Commands

Run from `app/`:

```bash
pnpm rag:index
pnpm rag:ingest -- --dry-run
pnpm rag:ingest
pnpm lint
pnpm build
pnpm dev
```

Notes:

- `pnpm build` may need permission outside the sandbox because Turbopack binds a
  local worker port during CSS processing.
- `pnpm rag:ingest` needs network access, `GEMINI_API_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key to client
  components.
- If Gemini rate-limits ingestion, resume from the last completed chunk with
  `RAG_INGEST_DELAY_MS=1000 pnpm rag:ingest -- --start <completed> --batch-size 5`.
- The app intentionally avoids `next/font/google` so production builds do not
  require network access for fonts.

## Documentation

RAG/Supabase notes live at:

- `../docs/rag-supabase.md`

Update that file when changing embedding dimensions, Supabase table/function
contracts, ingestion assumptions, or permission behavior.
