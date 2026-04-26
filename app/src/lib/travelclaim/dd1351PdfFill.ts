import {
  PDFCheckBox,
  PDFDocument,
  PDFTextField,
  StandardFonts,
  rgb,
  type PDFPage,
} from "pdf-lib";
import {
  buildDd1351FormFillPreview,
  DEMO_PHASE_2_FORM_FILL_INPUT,
  type Dd1351ExpenseRow,
  type Dd1351FormFillInput,
  type Dd1351ItineraryRow,
} from "./dd1351FormFilling";

export type Dd1351PdfMode =
  | "template-fields"
  | "template-overlay"
  | "fallback-generated";

export interface Dd1351PdfResult {
  bytes: Uint8Array;
  fieldNames: string[];
  mode: Dd1351PdfMode;
  warnings: string[];
}

export async function fillDd1351Pdf(
  templateBytes: Uint8Array,
  input: Dd1351FormFillInput = DEMO_PHASE_2_FORM_FILL_INPUT,
): Promise<Dd1351PdfResult> {
  try {
    const pdf = await PDFDocument.load(templateBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const warnings: string[] = [];
    const fieldNames = getFieldNames(pdf, warnings);
    const nativeFieldsFilled = fillNativeFields(pdf, input, fieldNames);

    await drawTemplateOverlay(pdf, input);

    return {
      bytes: await pdf.save(),
      fieldNames,
      mode: nativeFieldsFilled ? "template-fields" : "template-overlay",
      warnings,
    };
  } catch (error) {
    const warnings = [
      `Could not populate the DD Form 1351-2 template with pdf-lib: ${formatError(error)}`,
      "Generated a synthetic fallback PDF instead. Use an unencrypted, parser-compatible DD Form 1351-2 template for direct official-form overlay.",
    ];

    return {
      bytes: await createFallbackPdf(input, warnings),
      fieldNames: [],
      mode: "fallback-generated",
      warnings,
    };
  }
}

export async function inspectDd1351PdfFields(
  templateBytes: Uint8Array,
): Promise<{ fieldNames: string[]; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    const pdf = await PDFDocument.load(templateBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    return {
      fieldNames: getFieldNames(pdf, warnings),
      warnings,
    };
  } catch (error) {
    return {
      fieldNames: [],
      warnings: [`Could not inspect DD Form 1351-2 fields: ${formatError(error)}`],
    };
  }
}

function getFieldNames(pdf: PDFDocument, warnings: string[]): string[] {
  try {
    return pdf
      .getForm()
      .getFields()
      .map((field) => field.getName());
  } catch (error) {
    warnings.push(`No usable native PDF fields found: ${formatError(error)}`);
    return [];
  }
}

function fillNativeFields(
  pdf: PDFDocument,
  input: Dd1351FormFillInput,
  fieldNames: string[],
): boolean {
  if (fieldNames.length === 0) {
    return false;
  }

  const form = pdf.getForm();
  const address = parseAddress(input.traveler.mailingAddress);
  let filled = false;

  filled = setCheckbox(form, fieldNames, ["eft", "electronic"], input.eftSelected) || filled;
  filled = setText(form, fieldNames, ["name"], input.traveler.name) || filled;
  filled = setText(form, fieldNames, ["grade"], input.traveler.grade) || filled;
  filled = setText(form, fieldNames, ["ssn"], input.traveler.dodIdOrSsnPlaceholder) || filled;
  filled = setText(form, fieldNames, ["dod id"], input.traveler.dodIdOrSsnPlaceholder) || filled;
  filled = setCheckbox(form, fieldNames, ["tdy"], true) || filled;
  filled = setCheckbox(form, fieldNames, ["member"], true) || filled;
  filled = setText(form, fieldNames, ["street"], address.street) || filled;
  filled = setText(form, fieldNames, ["city"], address.city) || filled;
  filled = setText(form, fieldNames, ["state"], address.state) || filled;
  filled = setText(form, fieldNames, ["zip"], address.zip) || filled;
  filled = setText(form, fieldNames, ["mail"], input.traveler.email) || filled;
  filled = setText(form, fieldNames, ["telephone"], input.traveler.phone) || filled;
  filled = setText(form, fieldNames, ["phone"], input.traveler.phone) || filled;
  filled = setText(form, fieldNames, ["order"], input.travelOrderNumber) || filled;
  filled = setText(form, fieldNames, ["authorization"], input.travelOrderNumber) || filled;
  filled = setText(form, fieldNames, ["advance"], input.previousAdvances ?? "None") || filled;
  filled =
    setText(
      form,
      fieldNames,
      ["organization"],
      `${input.traveler.organization}, ${input.traveler.station}`,
    ) || filled;

  return filled;
}

async function drawTemplateOverlay(pdf: PDFDocument, input: Dd1351FormFillInput) {
  const pages = pdf.getPages();

  if (pages.length === 0) {
    return;
  }

  const page = pages[0];
  const address = parseAddress(input.traveler.mailingAddress);
  await pdf.embedFont(StandardFonts.Helvetica);

  markBox(page, 40, 718);
  markBox(page, 418, 679);
  markBox(page, 498, 679);
  drawText(page, input.traveler.name, 40, 676, 205);
  drawText(page, input.traveler.grade, 255, 676, 45);
  drawText(page, input.traveler.dodIdOrSsnPlaceholder, 366, 677, 48, 7);
  drawText(page, address.street, 40, 648, 145);
  drawText(page, address.city, 194, 648, 105);
  drawText(page, address.state, 309, 648, 30);
  drawText(page, address.zip, 346, 648, 60);
  drawText(page, input.traveler.email, 40, 621, 365);
  drawText(page, input.traveler.phone, 40, 594, 95);
  drawText(page, input.travelOrderNumber, 159, 594, 100);
  drawText(page, input.previousAdvances ?? "None", 278, 594, 120);
  drawText(
    page,
    `${input.traveler.organization}, ${input.traveler.station}`,
    40,
    570,
    230,
  );
  drawItineraryRows(page, input.itinerary);
  drawExpenseRows(page, input.expenses);
  drawText(page, input.deductibleMeals, 340, 206, 160, 7);
  drawText(page, input.claimantSignatureDate ?? "Claimant review required", 40, 166, 210);
  drawText(
    page,
    input.approvingOfficial ?? "Approving official review required",
    40,
    118,
    185,
  );
  drawText(page, "TravelClaim AI demo fill - synthetic data only", 390, 36, 160, 6);
}

async function createFallbackPdf(
  input: Dd1351FormFillInput,
  warnings: string[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 744;
  const preview = buildDd1351FormFillPreview(input);

  page.drawText("DD Form 1351-2 Demo Fill Packet", {
    x: 40,
    y,
    font: bold,
    size: 18,
  });
  y -= 24;
  page.drawText("Fallback generated PDF - synthetic data only", {
    x: 40,
    y,
    font,
    size: 10,
    color: rgb(0.55, 0.18, 0.1),
  });
  y -= 28;

  for (const block of preview.blocks) {
    if (y < 72) {
      page = pdf.addPage([612, 792]);
      y = 744;
    }

    page.drawText(`Block ${block.block}: ${block.title}`, {
      x: 40,
      y,
      font: bold,
      size: 9,
      color: block.needsReview ? rgb(0.55, 0.28, 0.05) : rgb(0.08, 0.12, 0.1),
    });
    y -= 13;

    const values = Array.isArray(block.value) ? block.value : [block.value];
    for (const value of values) {
      page.drawText(truncate(value, 100), {
        x: 54,
        y,
        font,
        size: 7.2,
      });
      y -= 10;
    }
    y -= 6;
  }

  if (warnings.length > 0 && y > 64) {
    page.drawText("Generation notes available in response headers.", {
      x: 40,
      y,
      font,
      size: 7,
      color: rgb(0.45, 0.2, 0.05),
    });
  }

  return pdf.save();
}

function drawItineraryRows(page: PDFPage, rows: Dd1351ItineraryRow[]) {
  rows.slice(0, 7).forEach((row, index) => {
    const y = 437 - index * 19;
    drawText(page, shortDate(row.date), 38, y, 24, 7);
    drawText(page, row.place, 84, y, 185, 6.5);
    drawText(page, row.modeCode, 281, y, 22);
    drawText(page, row.reasonCode, 313, y, 24);
    drawText(page, moneyOrBlank(row.lodgingCost), 350, y, 34, 7);
    drawText(page, row.pocMiles === null ? "" : String(row.pocMiles), 392, y, 24, 7);
  });
}

function drawExpenseRows(page: PDFPage, rows: Dd1351ExpenseRow[]) {
  rows.slice(0, 8).forEach((row, index) => {
    const y = 275 - index * 10;
    drawText(page, shortDate(row.date), 38, y, 32, 7);
    drawText(page, row.category, 74, y, 140, 7);
    drawText(page, money(row.amount), 229, y, 43, 7);
    drawText(page, row.receiptAttached ? "Yes" : "Needs receipt", 278, y, 48, 6.5);
  });
}

function setText(
  form: ReturnType<PDFDocument["getForm"]>,
  fieldNames: string[],
  needles: string[],
  value: string,
): boolean {
  const name = findFieldName(fieldNames, needles);
  if (!name) return false;

  const field = form.getFieldMaybe(name);
  if (field instanceof PDFTextField) {
    field.setText(value);
    return true;
  }

  return false;
}

function setCheckbox(
  form: ReturnType<PDFDocument["getForm"]>,
  fieldNames: string[],
  needles: string[],
  checked: boolean,
): boolean {
  const name = findFieldName(fieldNames, needles);
  if (!name) return false;

  const field = form.getFieldMaybe(name);
  if (field instanceof PDFCheckBox) {
    if (checked) field.check();
    else field.uncheck();
    return true;
  }

  return false;
}

function findFieldName(fieldNames: string[], needles: string[]) {
  return fieldNames.find((fieldName) => {
    const normalized = fieldName.toLowerCase();
    return needles.every((needle) => normalized.includes(needle));
  });
}

function markBox(page: PDFPage, x: number, y: number) {
  page.drawLine({ start: { x, y }, end: { x: x + 9, y: y + 9 }, thickness: 1 });
  page.drawLine({ start: { x: x + 9, y }, end: { x, y: y + 9 }, thickness: 1 });
}

function drawText(page: PDFPage, text: string, x: number, y: number, max = 120, size = 8) {
  const font = page.doc.embedStandardFont(StandardFonts.Helvetica);
  page.drawText(truncateByWidth(text, max, size, font), {
    x,
    y,
    size,
    font,
    color: rgb(0.02, 0.08, 0.04),
  });
}

function parseAddress(address: string) {
  const [street = "", city = "", stateZip = ""] = address
    .split(",")
    .map((part) => part.trim());
  const stateZipMatch = stateZip.match(/^([A-Z]{2})\s+(.+)$/);

  return {
    city,
    state: stateZipMatch?.[1] ?? "",
    street,
    zip: stateZipMatch?.[2] ?? "",
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function moneyOrBlank(value: number | null) {
  return value === null ? "" : money(value);
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year.slice(-2)}` : value;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function truncateByWidth(
  value: string,
  maxWidth: number,
  size: number,
  font: ReturnType<PDFPage["doc"]["embedStandardFont"]>,
) {
  let next = value;
  while (font.widthOfTextAtSize(next, size) > maxWidth && next.length > 4) {
    next = `${next.slice(0, -4)}...`;
  }
  return next;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
