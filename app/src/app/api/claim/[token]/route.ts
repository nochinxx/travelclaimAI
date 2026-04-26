import { getClaimByToken, updateClaimSoldierData } from "@/lib/travelclaim/claims-client";
import type { SoldierData, ClaimStatus } from "@/lib/travelclaim/claim-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const claim = await getClaimByToken(token);
    if (!claim) {
      return Response.json({ error: "Claim not found." }, { status: 404 });
    }
    return Response.json(claim);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as {
    soldierData?: SoldierData;
    status?: ClaimStatus;
  } | null;

  if (!body?.soldierData) {
    return Response.json({ error: "soldierData is required." }, { status: 400 });
  }

  try {
    await updateClaimSoldierData(token, body.soldierData, body.status);
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 503 });
  }
}
