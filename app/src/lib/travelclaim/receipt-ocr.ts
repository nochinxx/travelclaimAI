import { ImageAnnotatorClient } from "@google-cloud/vision";

export const CLAIM_ATTACHMENTS_BUCKET = "claim-attachments";
export const MAX_RECEIPT_FILE_SIZE = 10 * 1024 * 1024;

export const ACCEPTED_RECEIPT_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export const ACCEPTED_SUPPORTING_DOCUMENT_FILE_TYPES = new Set([
  ...ACCEPTED_RECEIPT_FILE_TYPES,
]);

export type ReceiptExtraction = {
  date: string;
  merchant: string;
  amount: number | null;
  category: string;
  receipt_type: string;
  payment_method: string;
  confidence: number | null;
  requires_receipt: boolean;
  block_18_candidate: boolean;
  needs_review: boolean;
  notes: string;
};

let visionClient: ImageAnnotatorClient | null = null;

export function sanitizeReceiptFileName(fileName: string) {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

  return cleaned || "receipt";
}

export function validateReceiptFile(file: File) {
  if (!ACCEPTED_RECEIPT_FILE_TYPES.has(file.type)) {
    return "Upload a JPG, PNG, WebP, HEIC, or PDF receipt.";
  }

  if (file.size > MAX_RECEIPT_FILE_SIZE) {
    return "Receipt file must be 10 MB or smaller.";
  }

  return null;
}

export function validateSupportingDocumentFile(file: File) {
  if (!ACCEPTED_SUPPORTING_DOCUMENT_FILE_TYPES.has(file.type)) {
    return "Upload a JPG, PNG, WebP, HEIC, or PDF document.";
  }

  if (file.size > MAX_RECEIPT_FILE_SIZE) {
    return "Document file must be 10 MB or smaller.";
  }

  return null;
}

export async function extractTextWithGoogleVision(fileBytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") {
    return {
      text: "",
      warning:
        "PDF upload was stored, but Google Vision PDF OCR requires Google Cloud Storage. Upload a receipt image for automatic OCR.",
    };
  }

  const client = getVisionClient();
  const [result] = await client.textDetection({
    image: { content: Buffer.from(fileBytes).toString("base64") },
  });

  return {
    text: result.fullTextAnnotation?.text ?? result.textAnnotations?.[0]?.description ?? "",
    warning: "",
  };
}

export function parseReceiptText(ocrText: string, warning = ""): ReceiptExtraction {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = lines.join("\n");
  const amount = extractTotalAmount(lines);
  const category = suggestCategory(joined);
  const receiptType = suggestReceiptType(category, joined);
  const date = extractDate(joined);
  const merchant = extractMerchant(lines);
  const paymentMethod = extractPaymentMethod(joined);
  const isMeal = category === "meal";
  const requiresReceipt = category === "lodging" || (amount !== null && amount >= 75);
  const needsReview =
    Boolean(warning) ||
    !ocrText.trim() ||
    !date ||
    !merchant ||
    amount === null ||
    category === "other" ||
    isMeal;

  return {
    date,
    merchant,
    amount,
    category,
    receipt_type: receiptType,
    payment_method: paymentMethod,
    confidence: null,
    requires_receipt: requiresReceipt,
    block_18_candidate: !isMeal,
    needs_review: needsReview,
    notes: warning || buildNotes({ isMeal, category, amount, requiresReceipt }),
  };
}

function getVisionClient() {
  if (visionClient) return visionClient;

  const credentialsJson = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON;
  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson) as {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };
    visionClient = new ImageAnnotatorClient({
      credentials,
      projectId: credentials.project_id,
    });
    return visionClient;
  }

  visionClient = new ImageAnnotatorClient();
  return visionClient;
}

function extractMerchant(lines: string[]) {
  const ignored = /^(receipt|invoice|tax invoice|total|subtotal|amount|date|sale|merchant copy)$/i;
  return lines.find((line) => line.length >= 3 && !ignored.test(line) && !/\$?\d+\.\d{2}/.test(line)) ?? "";
}

function extractDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.]((?:20)?\d{2})\b/);
  if (us) return toIsoDate(normalizeYear(Number(us[3])), Number(us[1]), Number(us[2]));

  const named = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+([0-3]?\d),?\s+((?:20)?\d{2})\b/i,
  );
  if (named) {
    const month = monthNumber(named[1]);
    return month ? toIsoDate(normalizeYear(Number(named[3])), month, Number(named[2])) : "";
  }

  return "";
}

function extractTotalAmount(lines: string[]) {
  const totalLinePatterns = [
    /(?:grand\s+total|amount\s+due|balance\s+due|total)\D{0,20}(\$?\s*\d{1,5}(?:,\d{3})*\.\d{2})/i,
    /(\$?\s*\d{1,5}(?:,\d{3})*\.\d{2})\D{0,20}(?:total|amount\s+due|balance\s+due)/i,
  ];

  for (const line of [...lines].reverse()) {
    for (const pattern of totalLinePatterns) {
      const match = line.match(pattern);
      if (match) return parseMoney(match[1]);
    }
  }

  const allAmounts = lines
    .flatMap((line) => [...line.matchAll(/\$?\s*\d{1,5}(?:,\d{3})*\.\d{2}/g)].map((match) => parseMoney(match[0])))
    .filter((value): value is number => value !== null);

  return allAmounts.length ? Math.max(...allAmounts) : null;
}

function suggestCategory(text: string) {
  const lower = text.toLowerCase();
  if (/(hotel|inn|lodging|folio|room\s+charge|hilton|marriott|hyatt|ihg|holiday inn)/.test(lower)) return "lodging";
  if (/(rental|rent-a-car|enterprise|hertz|avis|budget|national|alamo)/.test(lower)) return "rental_car";
  if (/(fuel|gasoline|diesel|shell|exxon|chevron|bp\b|mobil)/.test(lower)) return "fuel";
  if (/(parking|garage|valet)/.test(lower)) return "parking";
  if (/(toll|turnpike)/.test(lower)) return "tolls";
  if (/(baggage|bag fee|checked bag|airline)/.test(lower)) return "baggage";
  if (/(registration|conference|symposium|training fee)/.test(lower)) return "registration_fee";
  if (/(taxi|uber|lyft|rideshare|shuttle|metro|train)/.test(lower)) return "transportation";
  if (/(restaurant|cafe|coffee|grill|diner|meal|food)/.test(lower)) return "meal";
  return "other";
}

function suggestReceiptType(category: string, text: string) {
  if (/folio/i.test(text)) return "lodging_folio";
  if (category === "lodging") return "lodging_receipt";
  if (category === "rental_car") return "rental_car_receipt";
  if (category === "fuel") return "fuel_receipt";
  if (category === "parking") return "parking_receipt";
  if (category === "tolls") return "toll_receipt";
  if (category === "baggage") return "baggage_receipt";
  if (category === "meal") return "meal_receipt";
  return "receipt";
}

function extractPaymentMethod(text: string) {
  const lower = text.toLowerCase();
  if (/(gtcc|government travel charge card|travel card)/.test(lower)) return "GTCC";
  if (/visa/.test(lower)) return "Visa";
  if (/master\s?card|mc\b/.test(lower)) return "Mastercard";
  if (/amex|american express/.test(lower)) return "American Express";
  if (/discover/.test(lower)) return "Discover";
  if (/cash/.test(lower)) return "Cash";
  return "";
}

function buildNotes({
  isMeal,
  category,
  amount,
  requiresReceipt,
}: {
  isMeal: boolean;
  category: string;
  amount: number | null;
  requiresReceipt: boolean;
}) {
  if (isMeal) return "Meals are normally covered by per diem and usually should not be added to Block 18.";
  if (category === "other") return "Could not confidently categorize this receipt.";
  if (requiresReceipt) return "Receipt is required based on lodging category or amount threshold.";
  if (amount === null) return "Could not find a total amount.";
  return "Extracted from uploaded receipt.";
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function toIsoDate(year: number, month: number, day: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

function monthNumber(value: string) {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.slice(0, 3).toLowerCase()) + 1;
}
