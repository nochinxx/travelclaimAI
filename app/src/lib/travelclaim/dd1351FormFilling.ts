export type Dd1351ModeCode = "PA" | "TP" | "CP";

export type Dd1351ReasonCode = "TD" | "MC" | "AT" | "LV" | "AD" | "AR";

export type Dd1351AttachmentKey =
  | "orders"
  | "lodgingReceipt"
  | "rentalCarReceipt"
  | "flightItinerary"
  | "gtccStatement"
  | "approvingOfficialReview";

export interface Dd1351Traveler {
  name: string;
  grade: string;
  dodIdOrSsnPlaceholder: string;
  mailingAddress: string;
  email: string;
  phone: string;
  organization: string;
  station: string;
}

export interface Dd1351GtccInfo {
  used: boolean;
  splitDisbursementAmount: number | null;
  outstandingBalance: number | null;
}

export interface Dd1351ItineraryRow {
  date: string;
  place: string;
  modeCode: Dd1351ModeCode;
  modeLabel: string;
  reasonCode: Dd1351ReasonCode;
  reasonLabel: string;
  lodgingCost: number | null;
  pocMiles: number | null;
}

export interface Dd1351ExpenseRow {
  date: string;
  category: string;
  amount: number;
  receiptRequired: boolean;
  receiptAttached: boolean;
}

export interface Dd1351AttachmentStatus {
  key: Dd1351AttachmentKey;
  label: string;
  attached: boolean;
}

export interface Dd1351FormFillInput {
  traveler: Dd1351Traveler;
  travelPurpose: "TDY";
  claimantType: "Member/Employee";
  eftSelected: boolean;
  gtcc: Dd1351GtccInfo;
  travelOrderNumber: string;
  previousAdvances: string | null;
  travelStartDate: string;
  travelEndDate: string;
  itinerary: Dd1351ItineraryRow[];
  pocTravelOverride?: string | null;
  expenses: Dd1351ExpenseRow[];
  deductibleMeals: string;
  claimantSignatureDate: string | null;
  approvingOfficial: string | null;
  attachments: Dd1351AttachmentStatus[];
}

export interface Dd1351BlockPreview {
  block: number;
  title: string;
  value: string | string[];
  needsReview: boolean;
  note: string;
}

export interface Dd1351FormFillPreview {
  form: "DD Form 1351-2";
  version: "Nov 2025";
  cuiWhenFilled: true;
  syntheticDataOnly: true;
  disclaimer: string;
  staleGuideWarning: string;
  missingAttachments: string[];
  blocks: Dd1351BlockPreview[];
}

export const DD1351_FORM_FILL_DISCLAIMER =
  "This tool assists travelers and reviewers. It does not replace DTS, DFAS, a finance office, an approving official, or an official entitlement determination. Demo data is synthetic only.";

export const DD1351_STALE_GUIDE_WARNING =
  "The 2016 guide is useful for block-level filling guidance, but its form-version instruction is stale. TravelClaim AI targets DD Form 1351-2, Nov 2025.";

export const DEMO_PHASE_2_FORM_FILL_INPUT: Dd1351FormFillInput = {
  traveler: {
    name: "DOE, ALEX M",
    grade: "E-4",
    dodIdOrSsnPlaceholder: "XXX-XX-1234",
    mailingAddress: "1234 Demo Street, Fayetteville, NC 28301",
    email: "alex.m.doe.mil@example.mil",
    phone: "555-010-1351",
    organization: "Demo Company, 1st Battalion",
    station: "Fort Liberty, NC",
  },
  travelPurpose: "TDY",
  claimantType: "Member/Employee",
  eftSelected: true,
  gtcc: {
    used: true,
    splitDisbursementAmount: null,
    outstandingBalance: null,
  },
  travelOrderNumber: "TDY-2026-00421",
  previousAdvances: null,
  travelStartDate: "2026-05-12",
  travelEndDate: "2026-05-15",
  itinerary: [
    {
      date: "2026-05-12",
      place: "Fort Liberty, NC to Raleigh-Durham Airport, NC",
      modeCode: "PA",
      modeLabel: "Privately Owned Conveyance + Automobile",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: null,
      pocMiles: null,
    },
    {
      date: "2026-05-12",
      place: "Raleigh-Durham Airport, NC to Washington, DC",
      modeCode: "CP",
      modeLabel: "Commercial transportation, own expense + Plane",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: 184,
      pocMiles: null,
    },
    {
      date: "2026-05-15",
      place: "Washington, DC to Fort Liberty, NC",
      modeCode: "CP",
      modeLabel: "Commercial transportation, own expense + Plane",
      reasonCode: "MC",
      reasonLabel: "Mission Complete",
      lodgingCost: null,
      pocMiles: null,
    },
  ],
  pocTravelOverride: null,
  expenses: [
    {
      date: "2026-05-12",
      category: "Rental car",
      amount: 250,
      receiptRequired: true,
      receiptAttached: true,
    },
  ],
  deductibleMeals: "Needs user input",
  claimantSignatureDate: null,
  approvingOfficial: null,
  attachments: [
    {
      key: "orders",
      label: "Orders or travel authorization",
      attached: true,
    },
    {
      key: "lodgingReceipt",
      label: "Lodging receipt",
      attached: false,
    },
    {
      key: "rentalCarReceipt",
      label: "Rental car receipt",
      attached: true,
    },
    {
      key: "flightItinerary",
      label: "Commercial flight ticket or itinerary",
      attached: false,
    },
    {
      key: "approvingOfficialReview",
      label: "Approving official review",
      attached: false,
    },
  ],
};

export const DEMO_DD1351_ALIGNMENT_TEST_INPUT: Dd1351FormFillInput = {
  traveler: {
    name: "DOE, ALEX M",
    grade: "E-4",
    dodIdOrSsnPlaceholder: "XXX-XX-1234",
    mailingAddress: "1234 Demo Street, Fayetteville, NC 28301",
    email: "alex.m.doe.mil@example.mil",
    phone: "555-010-1351",
    organization: "Demo Company, 1st Battalion",
    station: "Fort Liberty, NC",
  },
  travelPurpose: "TDY",
  claimantType: "Member/Employee",
  eftSelected: true,
  gtcc: {
    used: true,
    splitDisbursementAmount: 430.25,
    outstandingBalance: 430.25,
  },
  travelOrderNumber: "TDY-2026-00421",
  previousAdvances: "$120.00",
  travelStartDate: "2026-05-12",
  travelEndDate: "2026-05-15",
  itinerary: [
    {
      date: "2026-05-12",
      place: "Fort Liberty, NC to Raleigh-Durham Airport, NC",
      modeCode: "PA",
      modeLabel: "Privately Owned Conveyance + Automobile",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: null,
      pocMiles: 78,
    },
    {
      date: "2026-05-12",
      place: "Raleigh-Durham Airport, NC to Washington, DC",
      modeCode: "CP",
      modeLabel: "Commercial transportation, own expense + Plane",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: 184,
      pocMiles: null,
    },
    {
      date: "2026-05-13",
      place: "Washington, DC to Arlington, VA",
      modeCode: "PA",
      modeLabel: "Privately Owned Conveyance + Automobile",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: 184,
      pocMiles: 12,
    },
    {
      date: "2026-05-14",
      place: "Arlington, VA to Washington, DC",
      modeCode: "PA",
      modeLabel: "Privately Owned Conveyance + Automobile",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: 184,
      pocMiles: 12,
    },
    {
      date: "2026-05-15",
      place: "Washington, DC to Raleigh-Durham Airport, NC",
      modeCode: "CP",
      modeLabel: "Commercial transportation, own expense + Plane",
      reasonCode: "TD",
      reasonLabel: "Temporary Duty",
      lodgingCost: null,
      pocMiles: null,
    },
    {
      date: "2026-05-15",
      place: "Raleigh-Durham Airport, NC to Fort Liberty, NC",
      modeCode: "PA",
      modeLabel: "Privately Owned Conveyance + Automobile",
      reasonCode: "MC",
      reasonLabel: "Mission Complete",
      lodgingCost: null,
      pocMiles: 78,
    },
  ],
  pocTravelOverride: null,
  expenses: [
    {
      date: "2026-05-12",
      category: "Rental car",
      amount: 250,
      receiptRequired: true,
      receiptAttached: true,
    },
    {
      date: "2026-05-12",
      category: "Airport parking",
      amount: 48,
      receiptRequired: false,
      receiptAttached: true,
    },
    {
      date: "2026-05-13",
      category: "Tolls",
      amount: 18.5,
      receiptRequired: false,
      receiptAttached: true,
    },
    {
      date: "2026-05-13",
      category: "Baggage fee",
      amount: 35,
      receiptRequired: false,
      receiptAttached: true,
    },
    {
      date: "2026-05-14",
      category: "Conference parking",
      amount: 28,
      receiptRequired: false,
      receiptAttached: true,
    },
  ],
  deductibleMeals: "2026-05-13:2; 2026-05-14:1",
  claimantSignatureDate: "2026-05-16",
  approvingOfficial: "SMITH, JORDAN CPT",
  attachments: [
    {
      key: "orders",
      label: "Orders or travel authorization",
      attached: true,
    },
    {
      key: "lodgingReceipt",
      label: "Lodging receipt",
      attached: true,
    },
    {
      key: "rentalCarReceipt",
      label: "Rental car receipt",
      attached: true,
    },
    {
      key: "flightItinerary",
      label: "Commercial flight ticket or itinerary",
      attached: true,
    },
    {
      key: "gtccStatement",
      label: "GTCC statement",
      attached: true,
    },
    {
      key: "approvingOfficialReview",
      label: "Approving official review",
      attached: true,
    },
  ],
};

export function buildDd1351FormFillPreview(
  input: Dd1351FormFillInput,
): Dd1351FormFillPreview {
  const missingAttachments = input.attachments
    .filter((attachment) => !attachment.attached)
    .map((attachment) => attachment.label);

  return {
    form: "DD Form 1351-2",
    version: "Nov 2025",
    cuiWhenFilled: true,
    syntheticDataOnly: true,
    disclaimer: DD1351_FORM_FILL_DISCLAIMER,
    staleGuideWarning: DD1351_STALE_GUIDE_WARNING,
    missingAttachments,
    blocks: [
      buildBlock(1, "Payment", [
        `EFT selected: ${formatYesNo(input.eftSelected)}`,
        `GTCC used: ${formatYesNo(input.gtcc.used)}`,
        `Split disbursement amount: ${formatCurrencyOrNeedsInput(
          input.gtcc.splitDisbursementAmount,
        )}`,
      ], input.gtcc.used && input.gtcc.splitDisbursementAmount === null, "GTCC use requires split disbursement review."),
      buildBlock(2, "Name", input.traveler.name, false, "Synthetic traveler name only."),
      buildBlock(3, "Grade", input.traveler.grade, false, "Use the traveler's current grade."),
      buildBlock(4, "SSN or DoD ID", input.traveler.dodIdOrSsnPlaceholder, false, "Use a fake placeholder in demos; filled real forms can contain sensitive personal information."),
      buildBlock(5, "Type of Payment", [
        `Purpose: ${input.travelPurpose}`,
        `Claimant type: ${input.claimantType}`,
      ], false, "Demo scope targets TDY for a member or employee."),
      buildBlock(6, "Mailing Address and Email", [
        input.traveler.mailingAddress,
        input.traveler.email,
      ], false, "Synthetic contact details only."),
      buildBlock(7, "Daytime Telephone", input.traveler.phone, false, "Synthetic phone number only."),
      buildBlock(8, "Travel Order or Authorization Number", input.travelOrderNumber, input.travelOrderNumber.trim().length === 0, "Orders or travel authorization must be attached."),
      buildBlock(9, "Previous Advances", input.previousAdvances ?? "None", false, "Use None when no previous advance was paid."),
      buildBlock(10, "For D.O. Use Only", "Leave blank for traveler-prepared demo package.", false, "Finance or disbursing office review area."),
      buildBlock(11, "Organization and Station", [
        input.traveler.organization,
        input.traveler.station,
      ], false, "Matches the traveler organization and permanent duty station."),
      buildBlock(12, "Dependents", "N/A for this single-member TDY demo.", false, "Expand later for dependent travel scenarios."),
      buildBlock(13, "Address of Dependents", "N/A for this single-member TDY demo.", false, "Expand later for dependent travel scenarios."),
      buildBlock(14, "Household Goods", "N/A for this TDY demo.", false, "Household goods shipment is outside the current TDY voucher slice."),
      buildBlock(15, "Itinerary", input.itinerary.map(formatItineraryRow), input.itinerary.length === 0, "Rows should include date, place, mode, reason for stop, lodging, and POC miles when applicable."),
      buildBlock(16, "POC Travel", formatPocTravel(input.itinerary, input.pocTravelOverride ?? null), false, "Review if the traveler drove POV to or from an airport. A manual override can replace the derived itinerary summary."),
      buildBlock(17, "Duration of Travel", formatTravelDuration(input.travelStartDate, input.travelEndDate), false, "Travel duration is derived from the itinerary dates."),
      buildBlock(18, "Reimbursable Expenses", input.expenses.map(formatExpenseRow), input.expenses.length === 0, "Rental car and other reimbursable costs appear here."),
      buildBlock(19, "Government or Deductible Meals", input.deductibleMeals, input.deductibleMeals === "Needs user input", "Traveler should confirm government-provided or deductible meals."),
      buildBlock(20, "Claimant Signature and Date", input.claimantSignatureDate ?? "Needs claimant review and signature date", input.claimantSignatureDate === null, "Claimant signature date should be on or after travel completion."),
      buildBlock(21, "Approving Official", input.approvingOfficial ?? "Needs approving official review", input.approvingOfficial === null, "Approving official review remains required before submission."),
    ],
  };
}

function buildBlock(
  block: number,
  title: string,
  value: string | string[],
  needsReview: boolean,
  note: string,
): Dd1351BlockPreview {
  return {
    block,
    title,
    value,
    needsReview,
    note,
  };
}

function formatItineraryRow(row: Dd1351ItineraryRow): string {
  return [
    row.date,
    row.place,
    `${row.modeCode} (${row.modeLabel})`,
    `${row.reasonCode} (${row.reasonLabel})`,
    `Lodging: ${formatCurrencyOrNone(row.lodgingCost)}`,
    `POC miles: ${row.pocMiles ?? "None"}`,
  ].join(" | ");
}

function formatExpenseRow(row: Dd1351ExpenseRow): string {
  return [
    row.date,
    row.category,
    formatCurrency(row.amount),
    `Receipt required: ${formatYesNo(row.receiptRequired)}`,
    `Receipt attached: ${formatYesNo(row.receiptAttached)}`,
  ].join(" | ");
}

function formatPocTravel(
  itinerary: Dd1351ItineraryRow[],
  override: string | null,
): string | string[] {
  if (override && override.trim().length > 0) {
    return override
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  const pocRows = itinerary.filter((row) => row.modeCode === "PA");

  if (pocRows.length === 0) {
    return "No POC travel identified.";
  }

  return pocRows.map(formatItineraryRow);
}

function formatTravelDuration(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;

  if (!Number.isFinite(inclusiveDays) || inclusiveDays < 1) {
    return `${startDate} to ${endDate} (needs review)`;
  }

  return `${startDate} to ${endDate} (${inclusiveDays} inclusive days)`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatCurrencyOrNeedsInput(value: number | null): string {
  return value === null ? "Needs user input" : formatCurrency(value);
}

function formatCurrencyOrNone(value: number | null): string {
  return value === null ? "None" : formatCurrency(value);
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}
