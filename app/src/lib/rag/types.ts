export type RagCitation = {
  documentId: string;
  title: string;
  branch: string;
  page: number;
  sourcePath: string;
};

export type RagChunk = {
  id: string;
  text: string;
  vector: Record<string, number>;
  citation: RagCitation;
};

export type RagIndex = {
  version: number;
  generatedAt: string;
  vectorizer: {
    kind: "hashed-tfidf";
    dimensions: number;
    maxChunkWords: number;
    chunkOverlapWords: number;
  };
  documents: Array<{
    id: string;
    title: string;
    branch: string;
    path: string;
    sha256: string;
    pageCount: number;
  }>;
  idf: Record<string, number>;
  chunks: RagChunk[];
};

export type RagSearchResult = {
  chunkId: string;
  score: number;
  text: string;
  citation: RagCitation;
};
