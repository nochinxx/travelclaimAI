import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const corpusRoot = path.join(repoRoot, "corpus", "regulations");
const manifestPath = path.join(corpusRoot, "manifest.json");
const outputDir = path.join(corpusRoot, "index");
const outputPath = path.join(outputDir, "regulations-index.json");
const cacheDir = path.join(repoRoot, ".cache", "rag");
const extractorSource = path.join(__dirname, "pdfkit-extract.swift");
const extractorBinary = path.join(cacheDir, "pdfkit-extract");
const moduleCache = path.join(cacheDir, "swift-module-cache");

const VECTOR_DIMENSIONS = 1024;
const MAX_CHUNK_WORDS = 520;
const CHUNK_OVERLAP_WORDS = 80;
const MIN_CHUNK_WORDS = 45;
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

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function normalizeText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function tokenize(text) {
  return text
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{1,}/g)
    ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? [];
}

function hashToken(token) {
  const digest = createHash("sha1").update(token).digest();
  return digest.readUInt32BE(0) % VECTOR_DIMENSIONS;
}

function termCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function vectorize(tokens, idf) {
  const counts = termCounts(tokens);
  const hashed = new Map();

  for (const [token, count] of counts) {
    const weight = (1 + Math.log(count)) * (idf[token] ?? 1);
    const index = hashToken(token);
    hashed.set(index, (hashed.get(index) ?? 0) + weight);
  }

  let norm = 0;
  for (const weight of hashed.values()) {
    norm += weight * weight;
  }

  const divisor = Math.sqrt(norm) || 1;
  return Object.fromEntries(
    [...hashed.entries()]
      .map(([index, weight]) => [index, Number((weight / divisor).toFixed(6))])
      .sort((a, b) => Number(a[0]) - Number(b[0])),
  );
}

function compileExtractor() {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(moduleCache, { recursive: true });

  if (existsSync(extractorBinary)) {
    return extractorBinary;
  }

  execFileSync("swiftc", [extractorSource, "-o", extractorBinary], {
    cwd: repoRoot,
    env: { ...process.env, CLANG_MODULE_CACHE_PATH: moduleCache },
    stdio: "inherit",
  });

  return extractorBinary;
}

function extractPages(pdfPath) {
  const binary = compileExtractor();
  const output = execFileSync(binary, [pdfPath], {
    cwd: repoRoot,
    maxBuffer: 200 * 1024 * 1024,
    encoding: "utf8",
  });

  return JSON.parse(output);
}

function splitWords(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function chunkPage({ document, page, text }) {
  const words = splitWords(text);
  const chunks = [];

  if (words.length < MIN_CHUNK_WORDS) {
    return chunks;
  }

  for (let start = 0; start < words.length; start += MAX_CHUNK_WORDS - CHUNK_OVERLAP_WORDS) {
    const slice = words.slice(start, start + MAX_CHUNK_WORDS);
    if (slice.length < MIN_CHUNK_WORDS) {
      break;
    }

    const pageText = slice.join(" ");
    chunks.push({
      id: `${document.id}:p${page}:c${chunks.length + 1}`,
      text: pageText,
      tokens: tokenize(pageText),
      citation: {
        documentId: document.id,
        title: document.title,
        branch: document.branch,
        page,
        sourcePath: document.path,
      },
    });
  }

  return chunks;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const documents = [];
const chunks = [];

for (const document of manifest.documents) {
  const pdfPath = path.join(corpusRoot, document.path);
  const actualHash = sha256(pdfPath);
  if (actualHash !== document.sha256) {
    throw new Error(`Checksum mismatch for ${document.id}: expected ${document.sha256}, got ${actualHash}`);
  }

  const pages = extractPages(pdfPath);
  documents.push({
    id: document.id,
    title: document.title,
    branch: document.branch,
    path: document.path,
    sha256: document.sha256,
    pageCount: pages.length,
  });

  for (const page of pages) {
    const text = normalizeText(page.text);
    chunks.push(...chunkPage({ document, page: page.page, text }));
  }
}

const documentFrequency = {};
for (const chunk of chunks) {
  for (const token of new Set(chunk.tokens)) {
    documentFrequency[token] = (documentFrequency[token] ?? 0) + 1;
  }
}

const idf = {};
for (const [token, frequency] of Object.entries(documentFrequency)) {
  idf[token] = Number((Math.log((chunks.length + 1) / (frequency + 1)) + 1).toFixed(6));
}

const indexedChunks = chunks.map((chunk) => ({
  id: chunk.id,
  text: chunk.text,
  vector: vectorize(chunk.tokens, idf),
  citation: chunk.citation,
}));

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceManifestVersion: manifest.version,
      vectorizer: {
        kind: "hashed-tfidf",
        dimensions: VECTOR_DIMENSIONS,
        maxChunkWords: MAX_CHUNK_WORDS,
        chunkOverlapWords: CHUNK_OVERLAP_WORDS,
      },
      documents,
      idf,
      chunks: indexedChunks,
    },
    null,
    2,
  )}\n`,
);

console.log(`Indexed ${indexedChunks.length} chunks from ${documents.length} documents.`);
console.log(outputPath);
