import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RagIndex, RagSearchResult } from "./types";

const DEFAULT_LIMIT = 6;
const DEFAULT_INDEX_PATH = path.resolve(
  process.cwd(),
  "..",
  "corpus",
  "regulations",
  "index",
  "regulations-index.json",
);

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "cannot",
  "chapter",
  "each",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "his",
  "into",
  "may",
  "must",
  "not",
  "only",
  "other",
  "section",
  "shall",
  "should",
  "such",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "through",
  "under",
  "was",
  "were",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "you",
]);

let cachedIndex: RagIndex | null = null;

export function loadRagIndex(indexPath = DEFAULT_INDEX_PATH): RagIndex {
  if (!cachedIndex) {
    cachedIndex = JSON.parse(readFileSync(indexPath, "utf8")) as RagIndex;
  }

  return cachedIndex;
}

export function searchRegulations(query: string, limit = DEFAULT_LIMIT): RagSearchResult[] {
  const index = loadRagIndex();
  const queryVector = vectorize(tokenize(query), index.idf, index.vectorizer.dimensions);

  if (Object.keys(queryVector).length === 0) {
    return [];
  }

  return index.chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      score: cosineSimilarity(queryVector, chunk.vector),
      text: chunk.text,
      citation: chunk.citation,
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((result) => ({
      ...result,
      score: Number(result.score.toFixed(4)),
      text: makeSnippet(result.text, query),
    }));
}

function tokenize(text: string) {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9'-]{1,}/g)
      ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? []
  );
}

function hashToken(token: string, dimensions: number) {
  const digest = createHash("sha1").update(token).digest();
  return digest.readUInt32BE(0) % dimensions;
}

function vectorize(tokens: string[], idf: Record<string, number>, dimensions: number) {
  const counts = new Map<string, number>();
  const vector = new Map<number, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  for (const [token, count] of counts) {
    const weight = (1 + Math.log(count)) * (idf[token] ?? 1);
    const index = hashToken(token, dimensions);
    vector.set(index, (vector.get(index) ?? 0) + weight);
  }

  let norm = 0;
  for (const weight of vector.values()) {
    norm += weight * weight;
  }

  const divisor = Math.sqrt(norm) || 1;
  return Object.fromEntries([...vector.entries()].map(([key, value]) => [key, value / divisor]));
}

function cosineSimilarity(left: Record<string, number>, right: Record<string, number>) {
  let score = 0;
  const [smaller, larger] =
    Object.keys(left).length < Object.keys(right).length ? [left, right] : [right, left];

  for (const [index, weight] of Object.entries(smaller)) {
    score += weight * (larger[index] ?? 0);
  }

  return score;
}

function makeSnippet(text: string, query: string) {
  const terms = tokenize(query);
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
