import type { SoldierData } from "./claim-types";

export type SyntheticSoldierProfile = {
  id: string;
  label: string;
  branch: string;
  travelerName: string;   // matches TravelAuthorization.travelerName for detection
  coPrompt: string;       // injected into CO chat to create the authorization
  soldierData: SoldierData;
};

export const SYNTHETIC_SOLDIERS: SyntheticSoldierProfile[] = [
  {
    id: "army-e4",
    label: "SPC Doe · Army E-4 · Fort Liberty",
    branch: "army",
    travelerName: "DOE, ALEX M",
    coPrompt:
      "I need to authorize TDY for DOE, ALEX M, grade E-4, 1st Battalion 508th PIR 82nd Airborne Division at Fort Liberty, NC. Branch: Army. " +
      "Mission: Joint training briefing at the Pentagon. Destination: Washington, DC. Travel dates: 2026-05-12 to 2026-05-15. " +
      "Authorized transport: commercial flight. Rental car authorized — required for mission site transit, no government vehicle available. " +
      "Lodging authorized, per diem locality Washington DC Metro. Order number: TDY-2026-00421. Approving official: CPT MORGAN, R.",
    soldierData: {
      dodIdPlaceholder: "XXX-XX-5678",
      mailingAddress: "1234 Demo Street, Fayetteville, NC 28301",
      email: "alex.m.doe.mil@army.test",
      phone: "555-010-1234",
      eftSelected: true,
      gtccUsed: true,
      gtccSplitDisbursementAmount: null,
      gtccOutstandingBalance: null,
      itinerary: [
        {
          date: "2026-05-12",
          place: "Fort Liberty, NC to Raleigh-Durham Airport, NC",
          modeCode: "PA",
          modeLabel: "Privately Owned Conveyance + Automobile",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: null,
          pocMiles: 52,
        },
        {
          date: "2026-05-12",
          place: "Raleigh-Durham Airport, NC to Washington, DC (DCA)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 184,
          pocMiles: null,
        },
        {
          date: "2026-05-13",
          place: "Washington, DC (lodging)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 184,
          pocMiles: null,
        },
        {
          date: "2026-05-14",
          place: "Washington, DC (lodging)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 184,
          pocMiles: null,
        },
        {
          date: "2026-05-15",
          place: "Washington, DC (DCA) to Raleigh-Durham Airport, NC",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "MC",
          reasonLabel: "Mission Complete",
          lodgingCost: null,
          pocMiles: null,
        },
      ],
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
          category: "Parking at RDU airport",
          amount: 45,
          receiptRequired: false,
          receiptAttached: false,
        },
        {
          date: "2026-05-12",
          category: "Checked baggage fee",
          amount: 35,
          receiptRequired: false,
          receiptAttached: false,
        },
      ],
      deductibleMeals: "No government meals provided",
      claimantSignatureDate: "2026-05-16",
      attachments: [
        { key: "orders", label: "Orders or travel authorization", attached: true },
        { key: "lodgingReceipt", label: "Lodging receipt", attached: true },
        { key: "rentalCarReceipt", label: "Rental car receipt", attached: true },
        { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: true },
        { key: "gtccStatement", label: "GTCC statement", attached: false },
        { key: "approvingOfficialReview", label: "Approving official review", attached: false },
      ],
    },
  },
  {
    id: "af-o3",
    label: "Capt Smith · Air Force O-3 · Langley",
    branch: "air-force",
    travelerName: "SMITH, JORDAN R",
    coPrompt:
      "I need to authorize TDY for SMITH, JORDAN R, grade O-3, 94th Fighter Squadron 1st Fighter Wing at Langley AFB, VA. Branch: Air Force. " +
      "Mission: Readiness review conference at HQ Air Combat Command. Destination: Washington, DC. Travel dates: 2026-06-03 to 2026-06-05. " +
      "Authorized transport: POV — driving is cost-effective vs commercial flight for this distance. Rental car not authorized. " +
      "Lodging authorized, per diem locality Washington DC Metro. Order number: AF-TDY-2026-00893. Approving official: Lt Col HAYES, P.",
    soldierData: {
      dodIdPlaceholder: "XXX-XX-2345",
      mailingAddress: "456 Officer Row, Hampton, VA 23665",
      email: "jordan.r.smith@us.af.test",
      phone: "555-020-2345",
      eftSelected: true,
      gtccUsed: true,
      gtccSplitDisbursementAmount: null,
      gtccOutstandingBalance: null,
      itinerary: [
        {
          date: "2026-06-03",
          place: "Langley AFB, VA to Washington, DC (DCA)",
          modeCode: "PA",
          modeLabel: "Privately Owned Conveyance + Automobile",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 210,
          pocMiles: 168,
        },
        {
          date: "2026-06-04",
          place: "Washington, DC (lodging)",
          modeCode: "PA",
          modeLabel: "Privately Owned Conveyance + Automobile",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 210,
          pocMiles: null,
        },
        {
          date: "2026-06-05",
          place: "Washington, DC to Langley AFB, VA",
          modeCode: "PA",
          modeLabel: "Privately Owned Conveyance + Automobile",
          reasonCode: "MC",
          reasonLabel: "Mission Complete",
          lodgingCost: null,
          pocMiles: 168,
        },
      ],
      expenses: [
        {
          date: "2026-06-03",
          category: "Tolls (I-95 corridor)",
          amount: 18,
          receiptRequired: false,
          receiptAttached: false,
        },
      ],
      deductibleMeals: "No government meals provided",
      claimantSignatureDate: "2026-06-06",
      attachments: [
        { key: "orders", label: "Orders or travel authorization", attached: true },
        { key: "lodgingReceipt", label: "Lodging receipt", attached: true },
        { key: "rentalCarReceipt", label: "Rental car receipt", attached: false },
        { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: false },
        { key: "gtccStatement", label: "GTCC statement", attached: false },
        { key: "approvingOfficialReview", label: "Approving official review", attached: false },
      ],
    },
  },
  {
    id: "navy-e6",
    label: "PO1 Garcia · Navy E-6 · Norfolk",
    branch: "navy",
    travelerName: "GARCIA, MARIA L",
    coPrompt:
      "I need to authorize TDY for GARCIA, MARIA L, grade E-6, USS Gerald R. Ford CVN-78 at Naval Station Norfolk, VA. Branch: Navy. " +
      "Mission: Fleet logistics coordination at Naval Base San Diego. Destination: San Diego, CA. Travel dates: 2026-05-20 to 2026-05-22. " +
      "Authorized transport: commercial flight. Rental car authorized — installation spans multiple piers, no shuttle available. " +
      "Lodging authorized, per diem locality San Diego. Order number: NAVY-TDY-2026-01144. Approving official: CDR PARK, S.",
    soldierData: {
      dodIdPlaceholder: "XXX-XX-3456",
      mailingAddress: "789 Sailor Blvd, Norfolk, VA 23511",
      email: "maria.l.garcia@navy.test",
      phone: "555-030-3456",
      eftSelected: true,
      gtccUsed: true,
      gtccSplitDisbursementAmount: 380,
      gtccOutstandingBalance: 380,
      itinerary: [
        {
          date: "2026-05-20",
          place: "Naval Station Norfolk, VA to San Diego, CA (SAN)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 155,
          pocMiles: null,
        },
        {
          date: "2026-05-21",
          place: "San Diego, CA (lodging)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 155,
          pocMiles: null,
        },
        {
          date: "2026-05-22",
          place: "San Diego, CA (SAN) to Naval Station Norfolk, VA",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "MC",
          reasonLabel: "Mission Complete",
          lodgingCost: null,
          pocMiles: null,
        },
      ],
      expenses: [
        {
          date: "2026-05-20",
          category: "Rental car",
          amount: 180,
          receiptRequired: true,
          receiptAttached: true,
        },
        {
          date: "2026-05-20",
          category: "Checked baggage fee",
          amount: 35,
          receiptRequired: false,
          receiptAttached: false,
        },
      ],
      deductibleMeals: "No government meals provided",
      claimantSignatureDate: "2026-05-23",
      attachments: [
        { key: "orders", label: "Orders or travel authorization", attached: true },
        { key: "lodgingReceipt", label: "Lodging receipt", attached: true },
        { key: "rentalCarReceipt", label: "Rental car receipt", attached: true },
        { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: true },
        { key: "gtccStatement", label: "GTCC statement", attached: true },
        { key: "approvingOfficialReview", label: "Approving official review", attached: false },
      ],
    },
  },
  {
    id: "marines-e5",
    label: "Sgt Johnson · Marines E-5 · Camp Lejeune",
    branch: "marines",
    travelerName: "JOHNSON, MARCUS T",
    coPrompt:
      "I need to authorize TDY for JOHNSON, MARCUS T, grade E-5, 1st Battalion 6th Marines 2nd Marine Division at Camp Lejeune, NC. Branch: Marine Corps. " +
      "Mission: Infantry tactics course at Marine Corps Base Quantico. Destination: Quantico, VA. Travel dates: 2026-07-08 to 2026-07-10. " +
      "Authorized transport: POV — driving is most cost-effective. Rental car not authorized. " +
      "Lodging authorized, per diem locality Northern Virginia. Government mess available at Quantico — meals partially deductible. " +
      "Order number: USMC-TDY-2026-00567. Approving official: Maj TORRES, D.",
    soldierData: {
      dodIdPlaceholder: "XXX-XX-4567",
      mailingAddress: "321 Marine Drive, Jacksonville, NC 28540",
      email: "marcus.t.johnson@usmc.test",
      phone: "555-040-4567",
      eftSelected: true,
      gtccUsed: false,
      gtccSplitDisbursementAmount: null,
      gtccOutstandingBalance: null,
      itinerary: [
        {
          date: "2026-07-08",
          place: "Camp Lejeune, NC to Quantico, VA",
          modeCode: "PA",
          modeLabel: "Privately Owned Conveyance + Automobile",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 130,
          pocMiles: 420,
        },
        {
          date: "2026-07-10",
          place: "Quantico, VA to Camp Lejeune, NC",
          modeCode: "PA",
          modeLabel: "Privately Owned Conveyance + Automobile",
          reasonCode: "MC",
          reasonLabel: "Mission Complete",
          lodgingCost: null,
          pocMiles: 420,
        },
      ],
      expenses: [
        {
          date: "2026-07-08",
          category: "Fuel (receipts on file)",
          amount: 90,
          receiptRequired: true,
          receiptAttached: true,
        },
      ],
      deductibleMeals: "Government mess available — 2 deductible meals per day",
      claimantSignatureDate: "2026-07-11",
      attachments: [
        { key: "orders", label: "Orders or travel authorization", attached: true },
        { key: "lodgingReceipt", label: "Lodging receipt", attached: true },
        { key: "rentalCarReceipt", label: "Rental car receipt", attached: false },
        { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: false },
        { key: "gtccStatement", label: "GTCC statement", attached: false },
        { key: "approvingOfficialReview", label: "Approving official review", attached: false },
      ],
    },
  },
  {
    id: "army-gs12",
    label: "Ms. Chen · Army Civilian GS-12 · Pentagon",
    branch: "army",
    travelerName: "CHEN, PATRICIA A",
    coPrompt:
      "I need to authorize TDY for CHEN, PATRICIA A, grade GS-12, Office of the Deputy Chief of Staff G-4 at Pentagon, Arlington, VA. Branch: Army (civilian). " +
      "Mission: Logistics systems review conference at Fort Leavenworth. Destination: Fort Leavenworth, KS. Travel dates: 2026-06-15 to 2026-06-17. " +
      "Authorized transport: commercial flight. Rental car authorized — Fort Leavenworth lacks adequate public transit for off-post conference venues. " +
      "Lodging authorized, per diem locality Kansas City MO/KS. Order number: DA-CIV-TDY-2026-00312. Approving official: SES WILLIAMS, K.",
    soldierData: {
      dodIdPlaceholder: "XXX-XX-6789",
      mailingAddress: "555 Civilian Court, Alexandria, VA 22301",
      email: "patricia.a.chen@army.test",
      phone: "555-050-6789",
      eftSelected: true,
      gtccUsed: true,
      gtccSplitDisbursementAmount: null,
      gtccOutstandingBalance: null,
      itinerary: [
        {
          date: "2026-06-15",
          place: "Pentagon, Arlington, VA to Fort Leavenworth, KS (MCI)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 115,
          pocMiles: null,
        },
        {
          date: "2026-06-16",
          place: "Fort Leavenworth, KS (lodging)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 115,
          pocMiles: null,
        },
        {
          date: "2026-06-17",
          place: "Fort Leavenworth, KS (MCI) to Pentagon, Arlington, VA",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "MC",
          reasonLabel: "Mission Complete",
          lodgingCost: null,
          pocMiles: null,
        },
      ],
      expenses: [
        {
          date: "2026-06-15",
          category: "Rental car",
          amount: 145,
          receiptRequired: true,
          receiptAttached: true,
        },
        {
          date: "2026-06-15",
          category: "Airport parking (DCA)",
          amount: 60,
          receiptRequired: false,
          receiptAttached: false,
        },
      ],
      deductibleMeals: "No government meals provided",
      claimantSignatureDate: "2026-06-18",
      attachments: [
        { key: "orders", label: "Orders or travel authorization", attached: true },
        { key: "lodgingReceipt", label: "Lodging receipt", attached: true },
        { key: "rentalCarReceipt", label: "Rental car receipt", attached: true },
        { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: true },
        { key: "gtccStatement", label: "GTCC statement", attached: false },
        { key: "approvingOfficialReview", label: "Approving official review", attached: false },
      ],
    },
  },
  {
    id: "coast-guard-e7",
    label: "CPO Rivera · Coast Guard E-7 · Cape Cod",
    branch: "coast-guard",
    travelerName: "RIVERA, JAMES E",
    coPrompt:
      "I need to authorize TDY for RIVERA, JAMES E, grade E-7, Sector Southeastern New England at Air Station Cape Cod, MA. Branch: Coast Guard. " +
      "Mission: Annual readiness review at Coast Guard Headquarters. Destination: Washington, DC. Travel dates: 2026-08-04 to 2026-08-06. " +
      "Authorized transport: commercial flight. Rental car not authorized — Metro accessible from hotel to HQ. " +
      "Lodging authorized, per diem locality Washington DC Metro. Order number: USCG-TDY-2026-00778. Approving official: LCDR OKAFOR, N.",
    soldierData: {
      dodIdPlaceholder: "XXX-XX-7890",
      mailingAddress: "888 Coast Road, Bourne, MA 02532",
      email: "james.e.rivera@uscg.test",
      phone: "555-060-7890",
      eftSelected: true,
      gtccUsed: true,
      gtccSplitDisbursementAmount: 200,
      gtccOutstandingBalance: 200,
      itinerary: [
        {
          date: "2026-08-04",
          place: "Air Station Cape Cod, MA to Washington, DC (DCA)",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "TD",
          reasonLabel: "Temporary Duty",
          lodgingCost: 195,
          pocMiles: null,
        },
        {
          date: "2026-08-06",
          place: "Washington, DC (DCA) to Air Station Cape Cod, MA",
          modeCode: "CP",
          modeLabel: "Commercial transportation, own expense + Plane",
          reasonCode: "MC",
          reasonLabel: "Mission Complete",
          lodgingCost: null,
          pocMiles: null,
        },
      ],
      expenses: [
        {
          date: "2026-08-04",
          category: "Checked baggage fee",
          amount: 35,
          receiptRequired: false,
          receiptAttached: false,
        },
      ],
      deductibleMeals: "No government meals provided",
      claimantSignatureDate: "2026-08-07",
      attachments: [
        { key: "orders", label: "Orders or travel authorization", attached: true },
        { key: "lodgingReceipt", label: "Lodging receipt", attached: true },
        { key: "rentalCarReceipt", label: "Rental car receipt", attached: false },
        { key: "flightItinerary", label: "Commercial flight ticket or itinerary", attached: true },
        { key: "gtccStatement", label: "GTCC statement", attached: true },
        { key: "approvingOfficialReview", label: "Approving official review", attached: false },
      ],
    },
  },
];

export function findSyntheticSoldier(travelerName: string): SyntheticSoldierProfile | undefined {
  return SYNTHETIC_SOLDIERS.find(
    (s) => s.travelerName.toLowerCase() === travelerName.toLowerCase(),
  );
}
