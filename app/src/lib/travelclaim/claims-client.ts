import type { TravelClaim, TravelAuthorization, SoldierData, ClaimStatus } from "./claim-types";
import { randomBytes } from "node:crypto";

type ClaimRow = {
  id: string;
  share_token: string;
  status: string;
  auth_data: Record<string, unknown>;
  soldier_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function base(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  return url.replace(/\/$/, "");
}

function headers() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
}

function rowToClaim(row: ClaimRow): TravelClaim {
  return {
    id: row.id,
    shareToken: row.share_token,
    status: row.status as ClaimStatus,
    authData: Object.keys(row.auth_data).length
      ? (row.auth_data as unknown as TravelAuthorization)
      : null,
    soldierData: row.soldier_data as unknown as SoldierData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function generateShareToken(): string {
  return randomBytes(16).toString("hex");
}

export async function createClaim(
  authData: TravelAuthorization,
  shareToken: string,
): Promise<TravelClaim> {
  const response = await fetch(`${base()}/rest/v1/travel_claims`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ share_token: shareToken, auth_data: authData, status: "authorized" }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create claim: ${await response.text()}`);
  }

  const rows = (await response.json()) as ClaimRow[];
  return rowToClaim(rows[0]);
}

export async function getClaimByToken(token: string): Promise<TravelClaim | null> {
  const response = await fetch(
    `${base()}/rest/v1/travel_claims?share_token=eq.${encodeURIComponent(token)}&limit=1`,
    { headers: headers() },
  );

  if (!response.ok) throw new Error(`Failed to fetch claim: ${await response.text()}`);

  const rows = (await response.json()) as ClaimRow[];
  return rows[0] ? rowToClaim(rows[0]) : null;
}

export async function updateClaimSoldierData(
  token: string,
  soldierData: SoldierData,
  status?: ClaimStatus,
): Promise<void> {
  const body: Record<string, unknown> = { soldier_data: soldierData };
  if (status) body.status = status;

  const response = await fetch(
    `${base()}/rest/v1/travel_claims?share_token=eq.${encodeURIComponent(token)}`,
    { method: "PATCH", headers: headers(), body: JSON.stringify(body) },
  );

  if (!response.ok) throw new Error(`Failed to update claim: ${await response.text()}`);
}
