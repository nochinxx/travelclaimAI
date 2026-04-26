import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TravelClaim } from "@/lib/travelclaim/claim-types";
import {
  CLAIM_ATTACHMENTS_BUCKET,
  extractTextWithGoogleVision,
  parseReceiptText,
  sanitizeReceiptFileName,
  validateReceiptFile,
  validateSupportingDocumentFile,
} from "@/lib/travelclaim/receipt-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimAttachmentRow = {
  id: string;
  claim_id: string;
  storage_path: string;
  attachment_type?: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  ocr_text: string | null;
  extracted_data: Record<string, unknown>;
  confirmed_data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!isAttachmentBackendConfigured()) {
    return Response.json({
      attachments: [],
      unavailable: "Receipt upload is disabled in this local demo until the Supabase service role key is configured.",
    });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const claim = await getClaimByToken(supabase, token);
    if (!claim) return Response.json({ error: "Claim not found." }, { status: 404 });

    const { data, error } = await supabase
      .from("claim_attachments")
      .select("*")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const attachments = await Promise.all(
      (data as ClaimAttachmentRow[]).map(async (row) => ({
        ...toAttachment(row),
        signedUrl: await createSignedUrl(supabase, row.storage_path),
      })),
    );

    return Response.json({ attachments });
  } catch (error) {
    const message = errorMessage(error, "Unknown attachment fetch error.");
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!isAttachmentBackendConfigured()) {
    return Response.json(
      { error: "Receipt upload requires the Supabase service role key." },
      { status: 503 },
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const claim = await getClaimByToken(supabase, token);
    if (!claim) return Response.json({ error: "Claim not found." }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "An attachment file is required." }, { status: 400 });
    }

    const attachmentType = normalizeAttachmentType(formData.get("attachmentType"));
    const validationError =
      attachmentType === "supporting_document"
        ? validateSupportingDocumentFile(file)
        : validateReceiptFile(file);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const safeName = sanitizeReceiptFileName(file.name);
    const folder = attachmentType === "supporting_document" ? "supporting-documents" : "attachments";
    const storagePath = `claims/${claim.id}/${folder}/${Date.now()}-${safeName}`;

    const upload = await supabase.storage
      .from(CLAIM_ATTACHMENTS_BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: file.type,
        upsert: false,
      });

    if (upload.error) throw upload.error;

    const inserted = await supabase
      .from("claim_attachments")
      .insert({
        claim_id: claim.id,
        storage_path: storagePath,
        attachment_type: attachmentType,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        status: "uploaded",
      })
      .select("*")
      .single();

    if (inserted.error) throw inserted.error;

    if (attachmentType === "supporting_document") {
      return Response.json({
        attachment: {
          ...toAttachment(inserted.data as ClaimAttachmentRow),
          signedUrl: await createSignedUrl(
            supabase,
            (inserted.data as ClaimAttachmentRow).storage_path,
          ),
        },
      });
    }

    const updated = await runOcrAndUpdateAttachment(
      supabase,
      inserted.data as ClaimAttachmentRow,
      fileBytes,
      file.type,
    );

    return Response.json({
      attachment: {
        ...toAttachment(updated),
        signedUrl: await createSignedUrl(supabase, updated.storage_path),
      },
    });
  } catch (error) {
    const message = errorMessage(error, "Unknown attachment upload error.");
    return Response.json({ error: message }, { status: 503 });
  }
}

async function runOcrAndUpdateAttachment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: ClaimAttachmentRow,
  fileBytes: Uint8Array,
  fileType: string,
) {
  try {
    const ocr = await extractTextWithGoogleVision(fileBytes, fileType);
    const extractedData = parseReceiptText(ocr.text, ocr.warning);
    const nextStatus = ocr.text.trim() ? "needs_confirmation" : "failed";

    const { data, error } = await supabase
      .from("claim_attachments")
      .update({
        ocr_text: ocr.text,
        extracted_data: extractedData,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (error) throw error;
    return data as ClaimAttachmentRow;
  } catch (error) {
    const extractedData = parseReceiptText("", "OCR failed. Enter receipt details manually.");
    const { data, error: updateError } = await supabase
      .from("claim_attachments")
      .update({
        extracted_data: {
          ...extractedData,
          notes: error instanceof Error ? error.message : extractedData.notes,
        },
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    return data as ClaimAttachmentRow;
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

async function createSignedUrl(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  storagePath: string,
) {
  const { data, error } = await supabase.storage
    .from(CLAIM_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);

  if (error) return null;
  return data.signedUrl;
}

function toAttachment(row: ClaimAttachmentRow) {
  return {
    id: row.id,
    claimId: row.claim_id,
    storagePath: row.storage_path,
    attachmentType: row.attachment_type ?? "receipt",
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    ocrText: row.ocr_text,
    extractedData: row.extracted_data,
    confirmedData: row.confirmed_data,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAttachmentType(value: FormDataEntryValue | null) {
  return value === "supporting_document" ? "supporting_document" : "receipt";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function isAttachmentBackendConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
