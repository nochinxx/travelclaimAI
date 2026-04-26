# Supabase RAG Plan

Supabase changes the RAG architecture from a local JSON retrieval file to a
Postgres-backed vector store with Row Level Security.

## Target Flow

1. Extract and chunk the regulation PDFs locally.
2. Generate embeddings with one consistent embedding model.
3. Upsert documents into `rag_documents`.
4. Upsert chunks plus embeddings into `rag_document_chunks`.
5. Query with `match_regulation_chunks` or `hybrid_match_regulation_chunks`.
6. Let Supabase RLS filter results by document permissions.

The migration in `supabase/migrations/20260425230000_rag_schema.sql` uses
`extensions.vector(768)` for `gemini-embedding-001`.

Google's Gemini docs say `gemini-embedding-001` defaults to 3072 dimensions, can
be truncated with `output_dimensionality`, and recommends 768, 1536, or 3072 for
common use. We are starting with 768 to reduce storage and search cost while
staying on a recommended size. If you choose 1536 or 3072 later, change every
`vector(768)` reference in the migration and set `GEMINI_EMBEDDING_DIMENSIONS`
to the same value before re-indexing.

## Permissions Model

- Public corpus documents, such as JTR/service regulations, should use
  `visibility = 'public'` and `owner_id = null`.
- User-uploaded or claim-specific documents should use `visibility = 'private'`
  and `owner_id = auth.uid()`.
- Shared private documents can grant access through `rag_document_owners`.

The search functions are normal SQL functions, so Supabase applies the table RLS
policies when authenticated users query them through the REST API or Supabase
client.

## App Changes Still Needed

- Add Supabase environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - a server-only service role key for trusted ingestion
- Add Gemini environment variables:
  - `GEMINI_API_KEY`
  - `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`
  - `GEMINI_EMBEDDING_DIMENSIONS=768`
- Run `pnpm rag:ingest` from `app/` to write the regulation corpus to Supabase.
  The script uses Gemini document embeddings with the `RETRIEVAL_DOCUMENT` task
  type.
- `/api/rag/search` already switches to Supabase RPC when the Supabase and Gemini
  environment variables are present. Otherwise, it uses the local JSON fallback.

The current local retriever can stay as a no-network development fallback.

## Ingestion

From `app/`:

```bash
pnpm rag:index
pnpm rag:ingest -- --dry-run
pnpm rag:ingest
```

`pnpm rag:ingest` reads `corpus/regulations/index/regulations-index.json`,
upserts public rows into `rag_documents`, embeds each chunk with
`gemini-embedding-001`, normalizes the 768-dimensional vectors, and upserts rows
into `rag_document_chunks`.

Useful options:

- `--dry-run`: inspect the planned ingestion without network writes.
- `--limit 10`: ingest only the first 10 chunks.
- `--start 100 --limit 50`: resume or test a range.
- `--batch-size 5`: control chunk upsert batch size.

The full corpus currently has 852 chunks, so ingestion will make one Gemini
embedding request per chunk. Re-running the script is safe because rows are
upserted by `external_id`.

If Gemini rate-limits the run, resume from the last completed chunk. For example,
if the output says `Upserted chunks 41-50 of 852`, continue with:

```bash
RAG_INGEST_DELAY_MS=1000 pnpm rag:ingest -- --start 50 --batch-size 5
```

The script retries 429 and 5xx embedding failures with exponential backoff. Tune
`RAG_INGEST_DELAY_MS` and `RAG_INGEST_MAX_RETRIES` if your Gemini quota is tight.
