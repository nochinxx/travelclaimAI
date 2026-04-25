const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const GEMINI_EMBEDDING_DIMENSIONS = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS ?? "768");

type GeminiEmbeddingResponse = {
  embedding?: {
    values?: number[];
  };
  embeddings?: Array<{
    values?: number[];
  }>;
};

export async function embedGeminiQuery(text: string) {
  return embedGemini(text, "RETRIEVAL_QUERY");
}

export async function embedGeminiDocument(text: string) {
  return embedGemini(text, "RETRIEVAL_DOCUMENT");
}

async function embedGemini(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT") {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for Gemini embeddings.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        taskType,
        output_dimensionality: GEMINI_EMBEDDING_DIMENSIONS,
        content: {
          parts: [{ text }],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini embedding request failed with ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as GeminiEmbeddingResponse;
  const values = payload.embedding?.values ?? payload.embeddings?.[0]?.values;

  if (!values?.length) {
    throw new Error("Gemini embedding response did not include vector values.");
  }

  return shouldNormalizeEmbedding() ? normalize(values) : values;
}

function shouldNormalizeEmbedding() {
  return GEMINI_EMBEDDING_MODEL === "gemini-embedding-001" && GEMINI_EMBEDDING_DIMENSIONS !== 3072;
}

function normalize(values: number[]) {
  const norm = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}
