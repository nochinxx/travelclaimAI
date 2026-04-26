# TravelClaim AI Regulations Corpus

This folder contains the seed PDFs used for the TravelClaim AI policy retrieval corpus.

## Files

- `raw/jtr.pdf` - Joint Travel Regulations
- `raw/air-force.pdf` - Air Force travel regulation
- `raw/army.pdf` - Army travel regulation
- `raw/marines.pdf` - Marine Corps travel regulation
- `raw/navy.pdf` - Navy travel regulation

`manifest.json` is the source of truth for ingestion metadata and checksum validation.

## Build the local RAG index

From `app/`, run:

```bash
pnpm rag:index
```

The indexer validates each PDF checksum, extracts page text with macOS PDFKit, chunks the
content, and writes a local hashed TF-IDF retrieval index to
`corpus/regulations/index/regulations-index.json`.

For the Supabase-backed implementation, use the local extractor as the ingestion
source and write chunks into the `rag_documents` and `rag_document_chunks` tables
created by `supabase/migrations/20260425230000_rag_schema.sql`. Embeddings should
be generated with `gemini-embedding-001` at 768 dimensions.

From `app/`, run:

```bash
pnpm rag:ingest -- --dry-run
pnpm rag:ingest
```

The ingestion script requires `SUPABASE_SERVICE_ROLE_KEY` in `app/.env.local`.
