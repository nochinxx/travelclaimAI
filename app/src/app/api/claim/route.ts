import { createClaim, generateShareToken } from "@/lib/travelclaim/claims-client";
import type { TravelAuthorization } from "@/lib/travelclaim/claim-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNTHETIC_AUTHORIZATIONS: Record<string, TravelAuthorization> = {
  "army-e4": {
    branch: "army",
    travelerName: "DOE, ALEX M",
    travelerGrade: "E-4",
    travelerOrganization: "1st Battalion 508th PIR 82nd Airborne Division",
    travelerStation: "Fort Liberty, NC",
    orderNumber: "TDY-2026-00421",
    missionDescription: "Joint training briefing at the Pentagon",
    destination: "Washington, DC",
    authorizedStartDate: "2026-05-12",
    authorizedEndDate: "2026-05-15",
    authorizedTransportMode: "commercial flight",
    rentalCarAuthorized: true,
    rentalCarJustification: "Required for mission site transit, no government vehicle available",
    lodgingAuthorized: true,
    perDiemLocality: "Washington DC Metro",
    approvingOfficialName: "CPT MORGAN, R.",
    jtrCitations: ["JTR 020209"],
  },
  "af-o3": {
    branch: "air-force",
    travelerName: "SMITH, JORDAN R",
    travelerGrade: "O-3",
    travelerOrganization: "94th Fighter Squadron 1st Fighter Wing",
    travelerStation: "Langley AFB, VA",
    orderNumber: "AF-TDY-2026-00893",
    missionDescription: "Readiness review conference at HQ Air Combat Command",
    destination: "Washington, DC",
    authorizedStartDate: "2026-06-03",
    authorizedEndDate: "2026-06-05",
    authorizedTransportMode: "POV",
    rentalCarAuthorized: false,
    lodgingAuthorized: true,
    perDiemLocality: "Washington DC Metro",
    approvingOfficialName: "Lt Col HAYES, P.",
    jtrCitations: ["JTR 020210", "JTR 020303"],
  },
  "navy-e6": {
    branch: "navy",
    travelerName: "GARCIA, MARIA L",
    travelerGrade: "E-6",
    travelerOrganization: "USS Gerald R. Ford CVN-78",
    travelerStation: "Naval Station Norfolk, VA",
    orderNumber: "NAVY-TDY-2026-01144",
    missionDescription: "Fleet logistics coordination at Naval Base San Diego",
    destination: "San Diego, CA",
    authorizedStartDate: "2026-05-20",
    authorizedEndDate: "2026-05-22",
    authorizedTransportMode: "commercial flight",
    rentalCarAuthorized: true,
    rentalCarJustification: "Installation spans multiple piers, no shuttle available",
    lodgingAuthorized: true,
    perDiemLocality: "San Diego",
    approvingOfficialName: "CDR PARK, S.",
    jtrCitations: ["JTR 020209"],
  },
  "marines-e5": {
    branch: "marines",
    travelerName: "JOHNSON, MARCUS T",
    travelerGrade: "E-5",
    travelerOrganization: "1st Battalion 6th Marines 2nd Marine Division",
    travelerStation: "Camp Lejeune, NC",
    orderNumber: "USMC-TDY-2026-00567",
    missionDescription: "Infantry tactics course at Marine Corps Base Quantico",
    destination: "Quantico, VA",
    authorizedStartDate: "2026-07-08",
    authorizedEndDate: "2026-07-10",
    authorizedTransportMode: "POV",
    rentalCarAuthorized: false,
    lodgingAuthorized: true,
    perDiemLocality: "Northern Virginia",
    approvingOfficialName: "Maj TORRES, D.",
    jtrCitations: ["JTR 020210", "JTR 020303", "JTR 020304"],
    specialInstructions: "Government mess available at Quantico; meals partially deductible.",
  },
  "army-gs12": {
    branch: "army",
    travelerName: "CHEN, PATRICIA A",
    travelerGrade: "GS-12",
    travelerOrganization: "Office of the Deputy Chief of Staff G-4",
    travelerStation: "Pentagon, Arlington, VA",
    orderNumber: "DA-CIV-TDY-2026-00312",
    missionDescription: "Logistics systems review conference at Fort Leavenworth",
    destination: "Fort Leavenworth, KS",
    authorizedStartDate: "2026-06-15",
    authorizedEndDate: "2026-06-17",
    authorizedTransportMode: "commercial flight",
    rentalCarAuthorized: true,
    rentalCarJustification: "Fort Leavenworth lacks adequate public transit for off-post conference venues",
    lodgingAuthorized: true,
    perDiemLocality: "Kansas City MO/KS",
    approvingOfficialName: "SES WILLIAMS, K.",
    jtrCitations: ["JTR 020209"],
  },
  "coast-guard-e7": {
    branch: "coast-guard",
    travelerName: "RIVERA, JAMES E",
    travelerGrade: "E-7",
    travelerOrganization: "Sector Southeastern New England",
    travelerStation: "Air Station Cape Cod, MA",
    orderNumber: "USCG-TDY-2026-00778",
    missionDescription: "Annual readiness review at Coast Guard Headquarters",
    destination: "Washington, DC",
    authorizedStartDate: "2026-08-04",
    authorizedEndDate: "2026-08-06",
    authorizedTransportMode: "commercial flight",
    rentalCarAuthorized: false,
    lodgingAuthorized: true,
    perDiemLocality: "Washington DC Metro",
    approvingOfficialName: "LCDR OKAFOR, N.",
    jtrCitations: ["JTR 020210", "JTR 020303"],
  },
};

export async function GET() {
  return Response.json({ message: "Use POST /api/chat with role=co to create a claim." });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    syntheticSoldierId?: string;
  } | null;

  const syntheticSoldierId = body?.syntheticSoldierId;
  const authData = syntheticSoldierId ? SYNTHETIC_AUTHORIZATIONS[syntheticSoldierId] : null;

  if (!syntheticSoldierId || !authData) {
    return Response.json({ error: "Unknown synthetic soldier." }, { status: 400 });
  }

  const shareToken = generateShareToken();
  try {
    await createClaim(authData, shareToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create demo claim.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ shareToken });
}
