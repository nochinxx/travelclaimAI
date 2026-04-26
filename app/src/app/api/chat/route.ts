import { runGeminiChat } from "@/lib/ai/gemini-chat";
import type { ChatMessage, ChatOptions } from "@/lib/ai/gemini-chat";
import type { TravelAuthorization } from "@/lib/travelclaim/claim-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    messages?: unknown;
    role?: unknown;
    authData?: unknown;
  } | null;

  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages array is required." }, { status: 400 });
  }

  const messages = body.messages as ChatMessage[];

  if (
    !messages.every(
      (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
  ) {
    return Response.json({ error: "Invalid message format." }, { status: 400 });
  }

  const options: ChatOptions = {
    role:
      body.role === "co" || body.role === "soldier" || body.role === "general"
        ? body.role
        : "general",
    authData: body.authData ? (body.authData as TravelAuthorization) : null,
  };

  try {
    const reply = await runGeminiChat(messages, options);
    return Response.json(reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 503 });
  }
}
