import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.join(repoRoot, "app");
const indexPath = path.join(repoRoot, "corpus", "regulations", "index", "regulations-index.json");

loadEnvFile(path.join(appRoot, ".env.local"));
loadEnvFile(path.join(appRoot, ".env"));

const args = parseArgs(process.argv.slice(2));
const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const embeddingDimensions = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS ?? "768");
const delayMs = Number(process.env.RAG_INGEST_DELAY_MS ?? "150");
const maxRetries = Number(process.env.RAG_INGEST_MAX_RETRIES ?? "5");
const batchSize = Number(args["batch-size"] ?? "10");
const dryRun = Boolean(args["dry-run"]);
const limit = args.limit ? Number(args.limit) : undefined;
const start = args.start ? Number(args.start) : 0;
const supabaseUrl = dryRun
  ? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(set NEXT_PUBLIC_SUPABASE_URL)")
  : requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = dryRun ? "" : requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const geminiApiKey = dryRun ? "" : requiredEnv("GEMINI_API_KEY");

if (embeddingDimensions !== 768) {
  console.warn(
    `Expected GEMINI_EMBEDDING_DIMENSIONS=768 for the current Supabase migration; got ${embeddingDimensions}.`,
  );
}

const index = JSON.parse(readFileSync(indexPath, "utf8"));
const chunks = index.chunks.slice(start, limit ? start + limit : undefined);

console.log(`Preparing to ingest ${chunks.length} chunks from ${index.documents.length} documents.`);
console.log(`Supabase: ${supabaseUrl}`);
console.log(`Embedding model: ${embeddingModel} (${embeddingDimensions} dimensions)`);

if (dryRun) {
  console.log("Dry run only. No Gemini or Supabase requests will be sent.");
  console.log({
    firstDocument: index.documents[0],
    firstChunk: {
      id: chunks[0]?.id,
      citation: chunks[0]?.citation,
      textPreview: chunks[0]?.text.slice(0, 160),
    },
  });
  process.exit(0);
}

const documentIdByExternalId = new Map();

for (const document of index.documents) {
  const [row] = await upsert("rag_documents", [toDocumentRow(document)], "external_id");
  documentIdByExternalId.set(document.id, row.id);
  console.log(`Upserted document ${document.id}: ${row.id}`);
}

let completed = 0;
for (let offset = 0; offset < chunks.length; offset += batchSize) {
  const batch = chunks.slice(offset, offset + batchSize);
  const rows = [];

  for (const chunk of batch) {
    const documentId = documentIdByExternalId.get(chunk.citation.documentId);
    if (!documentId) {
      throw new Error(`No Supabase document id found for ${chunk.citation.documentId}`);
    }

    const embedding = await embedDocument(chunk.text);
    rows.push(toChunkRow(chunk, documentId, embedding));
    completed += 1;

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  await upsert("rag_document_chunks", rows, "external_id", false);
  console.log(`Upserted chunks ${start + offset + 1}-${start + offset + batch.length} of ${start + chunks.length}`);
}

console.log(`Ingestion complete. Embedded and upserted ${completed} chunks.`);

function toDocumentRow(document) {
  return {
    external_id: document.id,
    title: document.title,
    branch: document.branch,
    source_path: document.path,
    checksum_sha256: document.sha256,
    visibility: "public",
    owner_id: null,
    metadata: {
      pageCount: document.pageCount,
      sourceManifestVersion: index.sourceManifestVersion,
    },
  };
}

function toChunkRow(chunk, documentId, embedding) {
  const chunkIndex = Number(chunk.id.match(/:c(\d+)$/)?.[1] ?? 0);

  return {
    document_id: documentId,
    external_id: chunk.id,
    content: chunk.text,
    page_number: chunk.citation.page,
    chunk_index: chunkIndex,
    token_count: countWords(chunk.text),
    metadata: {
      externalDocumentId: chunk.citation.documentId,
      sourcePath: chunk.citation.sourcePath,
      embeddingModel,
      embeddingDimensions,
    },
    embedding,
  };
}

async function embedDocument(text) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          taskType: "RETRIEVAL_DOCUMENT",
          output_dimensionality: embeddingDimensions,
          content: {
            parts: [{ text }],
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const waitMs = Math.min(60_000, 2 ** attempt * 2_000);
        console.warn(
          `Gemini embedding failed with ${response.status}; retrying in ${Math.round(waitMs / 1000)}s (${attempt + 1}/${maxRetries}).`,
        );
        await sleep(waitMs);
        continue;
      }

      throw new Error(`Gemini embedding failed with ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const values = payload.embedding?.values ?? payload.embeddings?.[0]?.values;

    if (!Array.isArray(values) || values.length !== embeddingDimensions) {
      throw new Error(`Gemini returned ${values?.length ?? 0} dimensions; expected ${embeddingDimensions}.`);
    }

    return shouldNormalizeEmbedding() ? normalize(values) : values;
  }

  throw new Error("Gemini embedding failed after retry attempts.");
}

async function upsert(table, rows, conflictTarget, returnRepresentation = true) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictTarget)}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: `resolution=merge-duplicates${returnRepresentation ? ",return=representation" : ""}`,
      },
      body: JSON.stringify(rows),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase upsert into ${table} failed with ${response.status}: ${await response.text()}`);
  }

  if (!returnRepresentation || response.status === 204) {
    return [];
  }

  return response.json();
}

function shouldNormalizeEmbedding() {
  return embeddingModel === "gemini-embedding-001" && embeddingDimensions !== 3072;
}

function normalize(values) {
  const norm = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Add it to app/.env.local or export it before running ingestion.`);
  }
  return value;
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [name, inlineValue] = arg.slice(2).split("=");
    const nextValue = rawArgs[index + 1];

    if (inlineValue !== undefined) {
      parsed[name] = inlineValue;
    } else if (!nextValue || nextValue.startsWith("--")) {
      parsed[name] = true;
    } else {
      parsed[name] = nextValue;
      index += 1;
    }
  }

  return parsed;
}

function loadEnvFile(filePath) {
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}
