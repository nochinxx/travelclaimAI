export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claim creation is handled by the Gemini chat engine via the create_authorization tool.
// This route exists as a future extension point for direct programmatic creation.
export async function GET() {
  return Response.json({ message: "Use POST /api/chat with role=co to create a claim." });
}
