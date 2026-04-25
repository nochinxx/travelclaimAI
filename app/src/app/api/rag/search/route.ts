import { searchRegulations } from "@/lib/rag/search";
import { hasSupabaseRagConfig, searchSupabaseRegulations } from "@/lib/rag/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    limit?: unknown;
  } | null;

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const limit = typeof body?.limit === "number" ? Math.min(Math.max(body.limit, 1), 12) : 6;

  if (!query) {
    return Response.json({ error: "A non-empty query is required." }, { status: 400 });
  }

  try {
    if (hasSupabaseRagConfig()) {
      return Response.json({
        query,
        source: "supabase",
        results: await searchSupabaseRegulations(query, {
          authorization: request.headers.get("authorization"),
          limit,
        }),
      });
    }

    return Response.json({ query, source: "local", results: searchRegulations(query, limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RAG search error.";
    return Response.json(
      {
        error: "RAG search is not available. Check Supabase/Gemini env vars or run `pnpm rag:index` for local fallback.",
        detail: message,
      },
      { status: 503 },
    );
  }
}
