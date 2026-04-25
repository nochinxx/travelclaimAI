import { embedGeminiQuery } from "./gemini";
import type { RagSearchResult } from "./types";

type SupabaseChunk = {
  chunk_id: string;
  title: string;
  branch: string | null;
  source_path: string | null;
  page_number: number | null;
  content: string;
  similarity: number;
  keyword_rank?: number;
  metadata?: Record<string, unknown>;
};

export function hasSupabaseRagConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.GEMINI_API_KEY,
  );
}

export async function searchSupabaseRegulations(
  query: string,
  options: {
    authorization?: string | null;
    limit?: number;
  } = {},
): Promise<RagSearchResult[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase URL and anon key are required for Supabase RAG search.");
  }

  const embedding = await embedGeminiQuery(query);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/hybrid_match_regulation_chunks`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: options.authorization ?? `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query_text: query,
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: options.limit ?? 6,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase RAG search failed with ${response.status}: ${await response.text()}`);
  }

  const rows = (await response.json()) as SupabaseChunk[];

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    score: Number(row.similarity.toFixed(4)),
    text: makeSnippet(row.content, query),
    citation: {
      documentId: String(row.metadata?.externalDocumentId ?? ""),
      title: row.title,
      branch: row.branch ?? "unknown",
      page: row.page_number ?? 0,
      sourcePath: row.source_path ?? "",
    },
  }));
}

function makeSnippet(text: string, query: string) {
  const terms = query
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{1,}/g)
    ?.filter((term) => term.length > 2) ?? [];
  const lower = text.toLowerCase();
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstHit === undefined) {
    return text.length > 520 ? `${text.slice(0, 520).trim()}...` : text;
  }

  const start = Math.max(0, firstHit - 180);
  const end = Math.min(text.length, firstHit + 420);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
