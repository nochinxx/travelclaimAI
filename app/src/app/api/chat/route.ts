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
    branch?: unknown;
    claimToken?: unknown;
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

  type ValidRole = "co" | "soldier" | "general";
  const validRoles: ValidRole[] = ["co", "soldier", "general"];
  const options: ChatOptions = {
    role: validRoles.includes(body.role as ValidRole) ? (body.role as ValidRole) : "general",
    authData: body.authData ? (body.authData as TravelAuthorization) : null,
    branch: typeof body.branch === "string" ? body.branch : null,
    claimToken: typeof body.claimToken === "string" ? body.claimToken : null,
  };

  try {
    const reply = await runGeminiChat(messages, options);
    return Response.json(reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 503 });
  }
}
