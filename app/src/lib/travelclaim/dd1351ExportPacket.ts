import {
  DD1351_FORM_FILL_DISCLAIMER,
  DD1351_STALE_GUIDE_WARNING,
  buildDd1351FormFillPreview,
  type Dd1351BlockPreview,
  type Dd1351FormFillInput,
  type Dd1351FormFillPreview,
} from "./dd1351FormFilling";

export type Dd1351ValidationSeverity = "error" | "warning" | "info";

export interface Dd1351ValidationFinding {
  severity: Dd1351ValidationSeverity;
  code: string;
  message: string;
  sourceHint: string;
  relatedBlock: number | null;
  recommendedFix: string;
}

export interface Dd1351SourceSnippet {
  title: string;
  pageOrBlockHint: string;
  note: string;
}

export interface Dd1351AuditPacket {
  artifact: "voucher_audit.json";
  generatedAt: string;
  syntheticDataOnly: true;
  privacyWarning: string;
  staleGuideWarning: string;
  disclaimer: string;
  packageStatus: string[];
  travelerSummary: {
    name: string;
    grade: string;
    organization: string;
    station: string;
  };
  tripSummary: {
    purpose: string;
    travelOrderNumber: string;
    travelStartDate: string;
    travelEndDate: string;
    gtccUsed: boolean;
  };
  voucherData: Dd1351FormFillInput;
  attachmentChecklist: Dd1351FormFillInput["attachments"];
  validationFindings: Dd1351ValidationFinding[];
  dd1351Preview: Dd1351FormFillPreview;
  sourceSnippetsUsed: Dd1351SourceSnippet[];
}

const DD1351_PRIVACY_WARNING =
  "Filled DD Form 1351-2 outputs may contain sensitive personal information. This hackathon artifact uses fake demo data only.";

const LOCAL_SOURCE_SNIPPETS: Dd1351SourceSnippet[] = [
  {
    title: "DD Form 1351-2, Travel Voucher or Subvoucher, Nov 2025",
    pageOrBlockHint: "Blocks 1-21",
    note: "Used as the current target form for the block preview and export packet.",
  },
  {
    title: "How to Fill Out a DD Form 1351-2 Travel Voucher, June 2016",
    pageOrBlockHint: "Block-level filling guide",
    note: DD1351_STALE_GUIDE_WARNING,
  },
];

export function buildDd1351AuditPacket(
  input: Dd1351FormFillInput,
  generatedAt = new Date().toISOString(),
): Dd1351AuditPacket {
  const preview = buildDd1351FormFillPreview(input);
  const validationFindings = buildDd1351ValidationFindings(input, preview);

  return {
    artifact: "voucher_audit.json",
    generatedAt,
    syntheticDataOnly: true,
    privacyWarning: DD1351_PRIVACY_WARNING,
    staleGuideWarning: DD1351_STALE_GUIDE_WARNING,
    disclaimer: DD1351_FORM_FILL_DISCLAIMER,
    packageStatus: buildPackageStatus(input, validationFindings),
    travelerSummary: {
      name: input.traveler.name,
      grade: input.traveler.grade,
      organization: input.traveler.organization,
      station: input.traveler.station,
    },
    tripSummary: {
      purpose: input.travelPurpose,
      travelOrderNumber: input.travelOrderNumber,
      travelStartDate: input.travelStartDate,
      travelEndDate: input.travelEndDate,
      gtccUsed: input.gtcc.used,
    },
    voucherData: input,
    attachmentChecklist: input.attachments,
    validationFindings,
    dd1351Preview: preview,
    sourceSnippetsUsed: LOCAL_SOURCE_SNIPPETS,
  };
}

export function buildReviewerChecklistMarkdown(
  input: Dd1351FormFillInput,
  generatedAt = new Date().toISOString(),
): string {
  const audit = buildDd1351AuditPacket(input, generatedAt);
  const groupedFindings = groupFindingsBySeverity(audit.validationFindings);
  const blocksNeedingReview = audit.dd1351Preview.blocks.filter(
    (block) => block.needsReview,
  );

  return [
    "# TravelClaim AI Reviewer Checklist",
    "",
    `Generated: ${audit.generatedAt}`,
    "",
    "## Privacy and Scope",
    "",
    `- ${audit.privacyWarning}`,
    `- ${audit.disclaimer}`,
    `- ${audit.staleGuideWarning}`,
    "",
    "## Package Status",
    "",
    ...audit.packageStatus.map((status) => `- ${status}`),
    "",
    "## Traveler Summary",
    "",
    `- Name: ${audit.travelerSummary.name}`,
    `- Grade: ${audit.travelerSummary.grade}`,
    `- Organization: ${audit.travelerSummary.organization}`,
    `- Station: ${audit.travelerSummary.station}`,
    "",
    "## Trip Summary",
    "",
    `- Purpose: ${audit.tripSummary.purpose}`,
    `- Travel period: ${audit.tripSummary.travelStartDate} to ${audit.tripSummary.travelEndDate}`,
    `- Travel order: ${audit.tripSummary.travelOrderNumber}`,
    `- GTCC used: ${formatYesNo(audit.tripSummary.gtccUsed)}`,
    "",
    "## Attachment Checklist",
    "",
    ...audit.attachmentChecklist.map(
      (attachment) =>
        `- ${attachment.attached ? "[x]" : "[ ]"} ${attachment.label}`,
    ),
    "",
    "## Validation Findings",
    "",
    ...formatFindingGroup("Errors", groupedFindings.error),
    "",
    ...formatFindingGroup("Warnings", groupedFindings.warning),
    "",
    ...formatFindingGroup("Info", groupedFindings.info),
    "",
    "## DD Form 1351-2 Block Review",
    "",
    ...formatBlockReview(blocksNeedingReview),
    "",
    "## Source Snippets Used",
    "",
    ...audit.sourceSnippetsUsed.map(
      (source) =>
        `- ${source.title} (${source.pageOrBlockHint}): ${source.note}`,
    ),
    "",
    "## Human Review Note",
    "",
    "TravelClaim AI prepares a cleaner package for review. Finance, DTS, DFAS, and approving officials still make the official determinations.",
    "",
  ].join("\n");
}

export function buildDd1351ValidationFindings(
  input: Dd1351FormFillInput,
  preview = buildDd1351FormFillPreview(input),
): Dd1351ValidationFinding[] {
  const findings: Dd1351ValidationFinding[] = [];
  const attachments = new Map(
    input.attachments.map((attachment) => [attachment.key, attachment]),
  );

  if (input.gtcc.used && input.gtcc.splitDisbursementAmount === null) {
    findings.push({
      severity: "error",
      code: "GTCC_SPLIT_DISBURSEMENT_REQUIRED",
      message: "GTCC was used, but split disbursement amount needs user input.",
      sourceHint: "TravelClaim AI validation rule for DD Form 1351-2 Block 1.",
      relatedBlock: 1,
      recommendedFix:
        "Ask the traveler for the split disbursement amount before submission.",
    });
  }

  if (
    input.gtcc.used &&
    input.gtcc.outstandingBalance !== null &&
    input.gtcc.splitDisbursementAmount !== null &&
    input.gtcc.splitDisbursementAmount < input.gtcc.outstandingBalance
  ) {
    findings.push({
      severity: "warning",
      code: "GTCC_SPLIT_LESS_THAN_BALANCE",
      message:
        "Split disbursement is less than the known outstanding GTCC balance.",
      sourceHint: "TravelClaim AI validation rule for GTCC review.",
      relatedBlock: 1,
      recommendedFix:
        "Review the GTCC balance and split disbursement before approval.",
    });
  }

  if (!attachments.get("orders")?.attached) {
    findings.push({
      severity: "error",
      code: "ORDERS_REQUIRED",
      message: "Orders or travel authorization are not attached.",
      sourceHint: "DD Form 1351-2 Block 8 review.",
      relatedBlock: 8,
      recommendedFix: "Attach the travel orders or authorization.",
    });
  }

  if (input.itinerary.some((row) => row.lodgingCost !== null)) {
    if (!attachments.get("lodgingReceipt")?.attached) {
      findings.push({
        severity: "error",
        code: "LODGING_RECEIPT_REQUIRED",
        message: "Lodging is claimed, but the lodging receipt is missing.",
        sourceHint: "TravelClaim AI validation rule for lodging documentation.",
        relatedBlock: 15,
        recommendedFix: "Attach the lodging receipt before submission.",
      });
    }
  }

  for (const expense of input.expenses) {
    if (expense.amount >= 75 && !expense.receiptAttached) {
      findings.push({
        severity: "error",
        code: "EXPENSE_OVER_75_RECEIPT_REQUIRED",
        message: `${expense.category} is ${formatMoney(expense.amount)}, but no receipt is attached.`,
        sourceHint:
          "TravelClaim AI validation rule for reimbursable expense receipts.",
        relatedBlock: 18,
        recommendedFix: `Attach the ${expense.category.toLowerCase()} receipt or mark the package incomplete.`,
      });
    }
  }

  const hasCommercialFlight = input.itinerary.some(
    (row) => row.modeCode === "CP" || row.modeCode === "TP",
  );
  if (hasCommercialFlight && !attachments.get("flightItinerary")?.attached) {
    findings.push({
      severity: "warning",
      code: "COMMERCIAL_FLIGHT_DOC_REQUIRED",
      message:
        "Commercial flight travel is listed, but ticket or itinerary documentation is not attached.",
      sourceHint: "TravelClaim AI validation rule for commercial travel review.",
      relatedBlock: 15,
      recommendedFix: "Attach the commercial flight ticket or itinerary.",
    });
  }

  for (const row of input.itinerary) {
    if (!hasSpecificLocation(row.place)) {
      findings.push({
        severity: "warning",
        code: "ITINERARY_LOCATION_NEEDS_CITY_STATE",
        message: `Itinerary location may need city/state or city/country: ${row.place}`,
        sourceHint: "TravelClaim AI validation rule for DD Form 1351-2 Block 15.",
        relatedBlock: 15,
        recommendedFix: "Replace vague places with city/state or city/country.",
      });
    }
  }

  const finalStop = input.itinerary.at(-1);
  if (finalStop && finalStop.reasonCode !== "MC") {
    findings.push({
      severity: "warning",
      code: "FINAL_STOP_SHOULD_BE_MC",
      message: "Final itinerary stop should normally use MC for Mission Complete.",
      sourceHint: "TravelClaim AI validation rule for itinerary stop codes.",
      relatedBlock: 15,
      recommendedFix: "Review the final itinerary reason code.",
    });
  }

  if (input.claimantSignatureDate === null) {
    findings.push({
      severity: "warning",
      code: "CLAIMANT_SIGNATURE_REQUIRED",
      message: "Claimant signature and date still need review.",
      sourceHint: "DD Form 1351-2 Block 20 review.",
      relatedBlock: 20,
      recommendedFix:
        "Have the claimant sign and date after travel is complete.",
    });
  } else if (input.claimantSignatureDate < input.travelEndDate) {
    findings.push({
      severity: "error",
      code: "CLAIMANT_SIGNATURE_BEFORE_TRAVEL_END",
      message:
        "Claimant signature date is before the travel completion date.",
      sourceHint: "TravelClaim AI validation rule for DD Form 1351-2 Block 20.",
      relatedBlock: 20,
      recommendedFix:
        "Use a claimant signature date on or after travel completion.",
    });
  }

  if (input.approvingOfficial === null) {
    findings.push({
      severity: "warning",
      code: "APPROVING_OFFICIAL_REVIEW_REQUIRED",
      message: "Approving official review is still needed.",
      sourceHint: "DD Form 1351-2 Block 21 review.",
      relatedBlock: 21,
      recommendedFix: "Route the package to the approving official.",
    });
  }

  if (input.deductibleMeals === "Needs user input") {
    findings.push({
      severity: "warning",
      code: "DEDUCTIBLE_MEALS_NEEDS_INPUT",
      message: "Government or deductible meals need user input.",
      sourceHint: "DD Form 1351-2 Block 19 review.",
      relatedBlock: 19,
      recommendedFix:
        "Ask the traveler to confirm government-provided or deductible meals.",
    });
  }

  for (const block of preview.blocks) {
    if (block.needsReview && !findings.some((finding) => finding.relatedBlock === block.block)) {
      findings.push({
        severity: "info",
        code: `BLOCK_${block.block}_NEEDS_REVIEW`,
        message: `Block ${block.block} - ${block.title} needs review.`,
        sourceHint: "DD Form 1351-2 block preview.",
        relatedBlock: block.block,
        recommendedFix: block.note,
      });
    }
  }

  return findings;
}

function buildPackageStatus(
  input: Dd1351FormFillInput,
  findings: Dd1351ValidationFinding[],
): string[] {
  const statuses = new Set<string>();

  if (findings.some((finding) => finding.code.includes("RECEIPT"))) {
    statuses.add("Missing receipts");
  }

  if (
    findings.some(
      (finding) => finding.code === "GTCC_SPLIT_DISBURSEMENT_REQUIRED",
    )
  ) {
    statuses.add("Needs split disbursement");
  }

  if (input.approvingOfficial === null) {
    statuses.add("Needs approving official");
  }

  if (statuses.size === 0) {
    statuses.add("Ready for review");
  }

  return [...statuses];
}

function groupFindingsBySeverity(findings: Dd1351ValidationFinding[]) {
  return {
    error: findings.filter((finding) => finding.severity === "error"),
    warning: findings.filter((finding) => finding.severity === "warning"),
    info: findings.filter((finding) => finding.severity === "info"),
  };
}

function formatFindingGroup(
  title: string,
  findings: Dd1351ValidationFinding[],
): string[] {
  if (findings.length === 0) {
    return [`### ${title}`, "", "- None"];
  }

  return [
    `### ${title}`,
    "",
    ...findings.map(
      (finding) =>
        `- [${finding.code}] ${finding.message} Fix: ${finding.recommendedFix}`,
    ),
  ];
}

function formatBlockReview(blocks: Dd1351BlockPreview[]): string[] {
  if (blocks.length === 0) {
    return ["- No blocks are currently flagged for review."];
  }

  return blocks.map(
    (block) =>
      `- [ ] Block ${block.block} - ${block.title}: ${block.note}`,
  );
}

function hasSpecificLocation(place: string): boolean {
  return /\b[A-Z]{2}\b/.test(place) || /\b[A-Za-z]+,\s+[A-Za-z]+/.test(place);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}
