import { hasSupabaseRagConfig, searchSupabaseRegulations } from "@/lib/rag/supabase";
import { searchRegulations } from "@/lib/rag/search";
import { createClaim, generateShareToken, updateClaimSoldierData } from "@/lib/travelclaim/claims-client";
import type { RagSearchResult } from "@/lib/rag/types";
import type { TravelAuthorization, SoldierData } from "@/lib/travelclaim/claim-types";

const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash";
const MAX_TOOL_ITERATIONS = 6;

// ─── System prompts ──────────────────────────────────────────────────────────

const CO_SYSTEM_PROMPT = `You are TravelClaim AI, helping a Commanding Officer or Authorizing Official create a JTR-compliant travel authorization for a subordinate's DD Form 1351-2.

ACCURACY IS NON-NEGOTIABLE. Every authorization decision must be grounded in the Joint Travel Regulations (JTR). Call search_regulations before confirming any of the following — never authorize from memory alone:
- Whether a rental car is authorized and when justification is required
- Per diem locality and applicable rates for the destination
- Most cost-effective transportation requirement (JTR requires justification when commercial travel is more expensive)
- Any non-standard expense authorizations

Your process:
1. Collect required fields through conversation, one at a time
2. Search JTR before confirming any authorization decision — cite the section
3. When something is NOT authorized by JTR, say so clearly and explain why
4. When all required fields are confirmed, summarize the full authorization and ask the CO to confirm
5. After explicit confirmation, call create_authorization to save and generate the soldier's link

Required fields (must have all before creating):
- Traveler name (LAST, FIRST MI), grade, organization, duty station
- Travel order number (note if pending)
- Mission description and destination city/installation
- Authorized start and end dates (YYYY-MM-DD)
- Authorized transportation mode
- Rental car: authorized yes/no (if yes, JTR justification required)
- Lodging: authorized yes/no and per diem locality
- Approving official name

When you confirm a field or authorization, state it as: "Block X (Title): value"
When citing JTR: "Per JTR [chapter/section]: [what's authorized or required]"`;

function buildSoldierSystemPrompt(authData: TravelAuthorization): string {
  const authSummary = [
    `Traveler: ${authData.travelerName}, ${authData.travelerGrade}`,
    `Organization: ${authData.travelerOrganization} at ${authData.travelerStation}`,
    `Order number: ${authData.orderNumber}`,
    `Mission: ${authData.missionDescription}`,
    `Destination: ${authData.destination}`,
    `Authorized travel: ${authData.authorizedStartDate} to ${authData.authorizedEndDate}`,
    `Authorized transport: ${authData.authorizedTransportMode}`,
    `Rental car authorized: ${authData.rentalCarAuthorized ? `Yes — ${authData.rentalCarJustification ?? "see orders"}` : "No"}`,
    `Lodging authorized: ${authData.lodgingAuthorized ? `Yes, per diem locality: ${authData.perDiemLocality}` : "No"}`,
    `Approving official: ${authData.approvingOfficialName}`,
    authData.jtrCitations.length
      ? `JTR citations on file: ${authData.jtrCitations.join(", ")}`
      : "",
    authData.specialInstructions
      ? `Special instructions: ${authData.specialInstructions}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are TravelClaim AI, helping a traveler complete DD Form 1351-2 based on their pre-authorized travel order.

The authorization below was created by their commanding officer. You already know what was pre-authorized — do not re-ask for those fields unless the soldier says their actual travel differed from what was authorized.

--- AUTHORIZATION ON FILE ---
${authSummary}
--- END AUTHORIZATION ---

Your job:
1. Help the soldier fill in their portion of the claim (actual travel details and expenses)
2. Call search_regulations when they ask about reimbursability, receipt requirements, or entitlements — always search before answering policy questions
3. If what they're claiming differs from the authorization (e.g., they rented a car but it wasn't authorized), flag it clearly and search JTR for what that means
4. Guide them through the remaining fields one at a time

Still needed from the soldier:
- DoD ID (last 4) or SSN placeholder — Block 4
- Mailing address and email — Block 6
- Daytime phone — Block 7
- Actual itinerary legs: date, from→to, mode code (PA/TP/CP), reason code (TD/MC), lodging cost per night, POC miles if applicable — Block 15
- GTCC: was it used? split disbursement amount? — Block 1
- Reimbursable expenses with dates and amounts (rental car, baggage, parking, etc.) — Block 18
- Government-provided or deductible meals — Block 19
- Claimant signature date (must be on or after last travel day) — Block 20
- Receipt confirmation for each expense over $75

Be practical and conversational. One question at a time. When you note a filled field: "Block X (Title): value"`;
}

const GENERAL_SYSTEM_PROMPT = `You are TravelClaim AI, an assistant that helps US military members and DoD civilians prepare DD Form 1351-2 (Travel Voucher) claims.

You have one tool: search_regulations. Use it before answering any policy question — always search first, then answer using what you found.

When users give you travel details (trip dates, destinations, expenses, order numbers, personal info), map what they share to the correct form block and tell them what's still missing.

Key DD Form 1351-2 blocks:
Block 1 – Payment method (EFT, GTCC split disbursement amount)
Block 2 – Traveler name (LAST, FIRST MI)
Block 3 – Grade/rank
Block 4 – DoD ID or SSN (last 4 only in demos)
Block 5 – Travel purpose (TDY/PCS) and claimant type
Block 6 – Mailing address and email
Block 7 – Daytime telephone
Block 8 – Travel order or authorization number
Block 9 – Previous advances received
Block 11 – Organization and permanent duty station
Block 15 – Itinerary: each leg needs date, from→to, transport mode, reason, lodging cost, POC miles
Block 16 – POC travel summary
Block 17 – Travel duration (start to end, inclusive days)
Block 18 – Reimbursable expenses (rental car, baggage, etc.)
Block 19 – Government or deductible meals
Block 20 – Claimant signature date (on or after last travel day)
Block 21 – Approving official

Rules:
- When you fill a block: "Block X (Title): value"
- Ask for one missing piece at a time
- Never answer policy questions without searching first`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatRole = "general" | "co" | "soldier";

export type ChatOptions = {
  role?: ChatRole;
  authData?: TravelAuthorization | null;
  branch?: string | null;
  claimToken?: string | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatReply = {
  text: string;
  ragResults: RagSearchResult[];
  createdClaimToken?: string;
  soldierDataSaved?: boolean;
};

// ─── Gemini API types ─────────────────────────────────────────────────────────

type GeminiTextPart = { text: string };
type GeminiFunctionCallPart = { functionCall: { name: string; args: Record<string, unknown> } };
type GeminiFunctionResponsePart = {
  functionResponse: { name: string; response: Record<string, unknown> };
};
type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiApiResponse = {
  candidates?: Array<{ content: GeminiContent; finishReason?: string }>;
  error?: { message: string; code?: number };
};

// ─── Tool definitions ─────────────────────────────────────────────────────────

const SEARCH_REGULATIONS_TOOL = {
  name: "search_regulations",
  description:
    "Search the travel regulation corpus (JTR and service-specific regs) for policy. Always call this before answering a policy question.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Precise regulation search query. Use specific terminology (e.g. 'rental car authorization cost-effective', 'lodging receipt requirements TDY').",
      },
    },
    required: ["query"],
  },
};

const UPDATE_CLAIM_TOOL = {
  name: "update_claim_fields",
  description:
    "Save soldier-confirmed data to the claim. Call this whenever the soldier confirms one or more fields — do not wait until everything is collected. Can be called multiple times.",
  parameters: {
    type: "object",
    properties: {
      dodIdPlaceholder: { type: "string", description: "DoD ID last 4 or SSN placeholder" },
      mailingAddress: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      eftSelected: { type: "boolean" },
      gtccUsed: { type: "boolean" },
      gtccSplitDisbursementAmount: { type: "number" },
      deductibleMeals: { type: "string" },
      claimantSignatureDate: { type: "string", description: "YYYY-MM-DD, on or after last travel day" },
    },
  },
};

const CREATE_AUTHORIZATION_TOOL = {
  name: "create_authorization",
  description:
    "Call this only after summarizing the full authorization and receiving explicit confirmation from the CO. Saves the authorization to the database and generates a shareable link for the soldier.",
  parameters: {
    type: "object",
    properties: {
      travelerName: { type: "string", description: "LAST, FIRST MI" },
      travelerGrade: { type: "string" },
      travelerOrganization: { type: "string" },
      travelerStation: { type: "string" },
      orderNumber: { type: "string" },
      missionDescription: { type: "string" },
      destination: { type: "string" },
      authorizedStartDate: { type: "string", description: "YYYY-MM-DD" },
      authorizedEndDate: { type: "string", description: "YYYY-MM-DD" },
      authorizedTransportMode: { type: "string" },
      rentalCarAuthorized: { type: "boolean" },
      rentalCarJustification: { type: "string" },
      lodgingAuthorized: { type: "boolean" },
      perDiemLocality: { type: "string" },
      approvingOfficialName: { type: "string" },
      jtrCitations: { type: "array", items: { type: "string" } },
      specialInstructions: { type: "string" },
    },
    required: [
      "travelerName",
      "travelerGrade",
      "travelerOrganization",
      "travelerStation",
      "orderNumber",
      "missionDescription",
      "destination",
      "authorizedStartDate",
      "authorizedEndDate",
      "authorizedTransportMode",
      "rentalCarAuthorized",
      "lodgingAuthorized",
      "perDiemLocality",
      "approvingOfficialName",
      "jtrCitations",
    ],
  },
};

// ─── Core chat function ───────────────────────────────────────────────────────

function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

async function callGemini(
  contents: GeminiContent[],
  systemPrompt: string,
  tools: object[],
): Promise<GeminiApiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations: tools }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    },
  );

  return response.json() as Promise<GeminiApiResponse>;
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

type ToolResult = {
  response: Record<string, unknown>;
  ragResults?: RagSearchResult[];
  createdClaimToken?: string;
  soldierDataSaved?: boolean;
};

async function handleSearchRegulations(
  args: Record<string, unknown>,
  branch?: string | null,
): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query : "";
  try {
    const results = hasSupabaseRagConfig()
      ? await searchSupabaseRegulations(query, { limit: 5, branch: branch ?? null })
      : searchRegulations(query, 5);
    return {
      response: {
        results: results.map((r) => ({
          text: r.text,
          source: `${r.citation.title}, p. ${r.citation.page}`,
          score: r.score,
        })),
      },
      ragResults: results,
    };
  } catch {
    return { response: { results: [] } };
  }
}

async function handleCreateAuthorization(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const token = generateShareToken();
    await createClaim(args as unknown as TravelAuthorization, token);
    return { response: { success: true, shareToken: token }, createdClaimToken: token };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { response: { success: false, error: message } };
  }
}

async function handleUpdateClaim(
  args: Record<string, unknown>,
  claimToken?: string | null,
): Promise<ToolResult> {
  if (!claimToken) {
    return { response: { success: false, error: "No claim token in context." } };
  }
  try {
    await updateClaimSoldierData(claimToken, args as unknown as SoldierData, "in_progress");
    return { response: { success: true }, soldierDataSaved: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { response: { success: false, error: message } };
  }
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  options: ChatOptions,
): Promise<ToolResult> {
  if (name === "search_regulations") return handleSearchRegulations(args, options.branch);
  if (name === "create_authorization") return handleCreateAuthorization(args);
  if (name === "update_claim_fields") return handleUpdateClaim(args, options.claimToken);
  return { response: { error: `Unknown tool: ${name}` } };
}

function resolveSystemPrompt(role: ChatRole, authData: TravelAuthorization | null): string {
  if (role === "co") return CO_SYSTEM_PROMPT;
  if (role === "soldier" && authData) return buildSoldierSystemPrompt(authData);
  return GENERAL_SYSTEM_PROMPT;
}

function resolveTools(role: ChatRole): object[] {
  if (role === "co") return [SEARCH_REGULATIONS_TOOL, CREATE_AUTHORIZATION_TOOL];
  if (role === "soldier") return [SEARCH_REGULATIONS_TOOL, UPDATE_CLAIM_TOOL];
  return [SEARCH_REGULATIONS_TOOL];
}

export async function runGeminiChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatReply> {
  const role = options.role ?? "general";
  const authData = options.authData ?? null;
  const systemPrompt = resolveSystemPrompt(role, authData);
  const tools = resolveTools(role);

  const contents = toGeminiHistory(messages);
  const ragResults: RagSearchResult[] = [];
  let createdClaimToken: string | undefined;
  let soldierDataSaved = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await callGemini(contents, systemPrompt, tools);

    if (response.error) {
      throw new Error(`Gemini API error: ${response.error.message}`);
    }

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("Gemini returned no candidates.");

    const parts = candidate.content.parts;
    const functionCallPart = parts.find(
      (p): p is GeminiFunctionCallPart => "functionCall" in p,
    );

    if (!functionCallPart) {
      const text = parts
        .filter((p): p is GeminiTextPart => "text" in p)
        .map((p) => p.text)
        .join("");
      return { text, ragResults, createdClaimToken, soldierDataSaved };
    }

    contents.push({ role: "model", parts });

    const { name, args } = functionCallPart.functionCall;
    const result = await dispatchTool(name, args, options);

    if (result.ragResults) ragResults.push(...result.ragResults);
    if (result.createdClaimToken) createdClaimToken = result.createdClaimToken;
    if (result.soldierDataSaved) soldierDataSaved = true;

    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: result.response } }],
    });
  }

  const final = await callGemini(contents, systemPrompt, tools);
  const text =
    final.candidates?.[0]?.content.parts
      .filter((p): p is GeminiTextPart => "text" in p)
      .map((p) => p.text)
      .join("") ?? "Unable to generate a response. Please try again.";

  return { text, ragResults, createdClaimToken, soldierDataSaved };
}
