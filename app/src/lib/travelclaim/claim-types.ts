import type {
  Dd1351FormFillInput,
  Dd1351ItineraryRow,
  Dd1351ExpenseRow,
  Dd1351AttachmentStatus,
} from "./dd1351FormFilling";

// What the CO provides when creating the authorization.
// Maps to the "pre-known" blocks of DD 1351-2.
export type TravelAuthorization = {
  travelerName: string;           // "DOE, ALEX M"
  travelerGrade: string;          // "E-4"
  travelerOrganization: string;
  travelerStation: string;
  orderNumber: string;
  missionDescription: string;
  destination: string;
  authorizedStartDate: string;    // YYYY-MM-DD
  authorizedEndDate: string;      // YYYY-MM-DD
  authorizedTransportMode: string;
  rentalCarAuthorized: boolean;
  rentalCarJustification?: string;
  lodgingAuthorized: boolean;
  perDiemLocality: string;
  approvingOfficialName: string;
  jtrCitations: string[];
  specialInstructions?: string;
};

// What the soldier fills in after the trip.
export type SoldierData = {
  dodIdPlaceholder?: string;
  mailingAddress?: string;
  email?: string;
  phone?: string;
  eftSelected?: boolean;
  gtccUsed?: boolean;
  gtccSplitDisbursementAmount?: number | null;
  gtccOutstandingBalance?: number | null;
  itinerary?: Dd1351ItineraryRow[];
  expenses?: Dd1351ExpenseRow[];
  deductibleMeals?: string;
  claimantSignatureDate?: string | null;
  attachments?: Dd1351AttachmentStatus[];
};

export type ClaimStatus = "authorized" | "in_progress" | "submitted";

export type TravelClaim = {
  id: string;
  shareToken: string;
  status: ClaimStatus;
  authData: TravelAuthorization | null;
  soldierData: SoldierData;
  createdAt: string;
  updatedAt: string;
};

// Merges CO authorization + soldier data into a complete Dd1351FormFillInput
// for use with the existing form preview and audit packet builders.
export function mergeClaimToFormInput(
  authData: TravelAuthorization,
  soldierData: SoldierData,
): Dd1351FormFillInput {
  return {
    traveler: {
      name: authData.travelerName,
      grade: authData.travelerGrade,
      organization: authData.travelerOrganization,
      station: authData.travelerStation,
      dodIdOrSsnPlaceholder: soldierData.dodIdPlaceholder ?? "Pending",
      mailingAddress: soldierData.mailingAddress ?? "Pending",
      email: soldierData.email ?? "Pending",
      phone: soldierData.phone ?? "Pending",
    },
    travelPurpose: "TDY",
    claimantType: "Member/Employee",
    eftSelected: soldierData.eftSelected ?? false,
    gtcc: {
      used: soldierData.gtccUsed ?? false,
      splitDisbursementAmount: soldierData.gtccSplitDisbursementAmount ?? null,
      outstandingBalance: soldierData.gtccOutstandingBalance ?? null,
    },
    travelOrderNumber: authData.orderNumber,
    previousAdvances: null,
    travelStartDate: authData.authorizedStartDate,
    travelEndDate: authData.authorizedEndDate,
    itinerary: soldierData.itinerary ?? [],
    expenses: soldierData.expenses ?? [],
    deductibleMeals: soldierData.deductibleMeals ?? "Needs user input",
    claimantSignatureDate: soldierData.claimantSignatureDate ?? null,
    approvingOfficial: authData.approvingOfficialName,
    attachments: soldierData.attachments ?? [
      { key: "orders", label: "Orders or travel authorization", attached: true },
      { key: "lodgingReceipt", label: "Lodging receipt", attached: false },
      { key: "rentalCarReceipt", label: "Rental car receipt", attached: authData.rentalCarAuthorized },
      { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: false },
      { key: "gtccStatement", label: "GTCC statement", attached: false },
      { key: "approvingOfficialReview", label: "Approving official review", attached: false },
    ],
  };
}
