import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SoldierData, TravelClaim } from "@/lib/travelclaim/claim-types";
import type { Dd1351AttachmentStatus, Dd1351ExpenseRow } from "@/lib/travelclaim/dd1351FormFilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmedReceiptData = {
  date?: string;
  merchant?: string;
  amount?: number | null;
  category?: string;
  receipt_type?: string;
  payment_method?: string;
  requires_receipt?: boolean;
  needs_review?: boolean;
  notes?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; attachmentId: string }> },
) {
  const { token, attachmentId } = await params;
  const body = (await request.json().catch(() => null)) as {
    confirmedData?: ConfirmedReceiptData;
  } | null;

  if (!body?.confirmedData) {
    return Response.json({ error: "confirmedData is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const claim = await getClaimByToken(supabase, token);
    if (!claim) return Response.json({ error: "Claim not found." }, { status: 404 });

    const attachmentResult = await supabase
      .from("claim_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("claim_id", claim.id)
      .maybeSingle();

    if (attachmentResult.error) throw attachmentResult.error;
    if (!attachmentResult.data) return Response.json({ error: "Attachment not found." }, { status: 404 });

    const confirmedData = normalizeConfirmedData(body.confirmedData);
    const soldierData = mergeConfirmedReceiptIntoSoldierData(
      claim.soldierData ?? {},
      attachmentId,
      confirmedData,
    );

    const attachmentUpdate = await supabase
      .from("claim_attachments")
      .update({
        confirmed_data: confirmedData,
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attachmentId)
      .select("*")
      .single();

    if (attachmentUpdate.error) throw attachmentUpdate.error;

    const claimUpdate = await supabase
      .from("travel_claims")
      .update({
        soldier_data: soldierData,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id);

    if (claimUpdate.error) throw claimUpdate.error;

    return Response.json({ success: true, attachment: attachmentUpdate.data, soldierData });
  } catch (error) {
    const message = errorMessage(error, "Unknown attachment confirmation error.");
    return Response.json({ error: message }, { status: 503 });
  }
}

async function getClaimByToken(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  token: string,
): Promise<TravelClaim | null> {
  const { data, error } = await supabase
    .from("travel_claims")
    .select("*")
    .eq("share_token", token)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    shareToken: data.share_token,
    status: data.status,
    authData: data.auth_data,
    soldierData: data.soldier_data,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as TravelClaim;
}

function normalizeConfirmedData(data: ConfirmedReceiptData) {
  return {
    date: data.date ?? "",
    merchant: data.merchant ?? "",
    amount: typeof data.amount === "number" ? data.amount : null,
    category: data.category ?? "other",
    receipt_type: data.receipt_type ?? "receipt",
    payment_method: data.payment_method ?? "",
    requires_receipt: data.requires_receipt ?? true,
    needs_review: data.needs_review ?? false,
    notes: data.notes ?? "Confirmed from uploaded receipt.",
  };
}

function mergeConfirmedReceiptIntoSoldierData(
  current: SoldierData,
  attachmentId: string,
  confirmed: ReturnType<typeof normalizeConfirmedData>,
): SoldierData {
  const expenses = current.expenses ?? [];
  const expense: Dd1351ExpenseRow = {
    attachment_id: attachmentId,
    date: confirmed.date,
    merchant: confirmed.merchant,
    amount: confirmed.amount ?? 0,
    category: confirmed.category,
    payment_method: confirmed.payment_method,
    receiptRequired: confirmed.requires_receipt,
    receiptAttached: true,
    receipt_uploaded: true,
    needs_review: confirmed.needs_review,
    notes: confirmed.notes,
  };

  const existingIndex = expenses.findIndex((item) => item.attachment_id === attachmentId);
  const nextExpenses =
    existingIndex >= 0
      ? expenses.map((item, index) => (index === existingIndex ? expense : item))
      : [...expenses, expense];

  return {
    ...current,
    expenses: nextExpenses,
    attachments: updateAttachmentChecklist(current.attachments ?? [], confirmed.category),
  };
}

function updateAttachmentChecklist(
  attachments: Dd1351AttachmentStatus[],
  category: string,
): Dd1351AttachmentStatus[] {
  const key =
    category === "lodging"
      ? "lodgingReceipt"
      : category === "rental_car"
        ? "rentalCarReceipt"
        : null;

  if (!key) return attachments;

  return attachments.map((attachment) =>
    attachment.key === key ? { ...attachment, attached: true } : attachment,
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
