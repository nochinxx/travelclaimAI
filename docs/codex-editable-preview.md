# Codex Task: Editable Form Preview (CRUD) for Soldier Voucher

## Context

TravelClaim AI is a Next.js 16 / React 19 / Tailwind v4 app (pnpm workspace in `app/`).
Supabase is the database. All API routes are in `src/app/api/`.

The soldier fills a DD Form 1351-2 travel voucher. After filling data via chat or pre-fill,
they land on the form preview at:

  `/claim/[token]/preview`  →  `src/app/claim/[token]/preview/page.tsx`

This page is currently a **read-only server component** that renders 21 form blocks.
It fetches the claim, merges auth + soldier data with `mergeClaimToFormInput()`, and
calls `buildDd1351FormFillPreview()` to get the block list.

## What to build

Make the preview page **inline-editable**. The soldier should be able to click any
non-locked block, edit the value, and save it back to Supabase without leaving the page.

### Rules

**Locked (read-only) blocks** — populated by the CO's `TravelAuthorization`, never editable
by the soldier:
- Block 2 (Name)
- Block 3 (Grade)
- Block 5 (Purpose / claimant type)
- Block 8 (Order number)
- Block 11 (Organization and station)
- Block 17 (Duration of travel — derived from auth dates)
- Block 21 (Approving official)

**Editable blocks** — soldier-owned fields that map to `SoldierData`:
- Block 1: EFT selected, GTCC used, split disbursement amount
- Block 4: DoD ID / SSN placeholder
- Block 6: Mailing address and email
- Block 7: Daytime telephone
- Block 9: Previous advances
- Block 15: Itinerary rows (date, place, mode, reason, lodging cost, POC miles)
- Block 16: POC travel (derived from itinerary but can be overridden)
- Block 18: Expense rows (date, category, amount, receipt attached)
- Block 19: Deductible meals
- Block 20: Claimant signature date

**No deleting required fields.** Blocks 1, 4, 6, 7, 15, 20 are required — the UI should
prevent clearing them entirely. Warn but don't block on optional fields.

### UX pattern

- Each editable block card has an **Edit** button (pencil icon or text).
- Clicking Edit turns the block into an inline form:
  - Simple text/date fields for scalar values (address, phone, date)
  - For Block 15 (itinerary): row-level edit/add/delete — but at least one row must remain
  - For Block 18 (expenses): same as itinerary
  - Save / Cancel buttons on each block
- On Save:
  1. Update the local `SoldierData` state
  2. PATCH `/api/claim/[token]` with the full updated `soldierData`
  3. Re-derive the block preview from the updated merged input (client-side, pure function call)
  4. Show a "Saved" confirmation for 2s then dismiss
- Validation: run `buildDd1351ValidationFindings()` after each save and refresh the sidebar
  findings panel live.

### Architecture decisions

- **Convert the preview page to a client component** (`"use client"`).
  Keep the data fetch as a server action or a `useEffect` against `GET /api/claim/[token]`.
- Keep `mergeClaimToFormInput`, `buildDd1351FormFillPreview`, and
  `buildDd1351ValidationFindings` as pure client-side calls — they are already pure
  TypeScript with no server deps, so they run fine in the browser.
- Store the live `SoldierData` in a `useState`. Derive `preview` and `findings`
  on every render from that state (no extra API calls for preview computation).
- PATCH is the only write — always send the full `soldierData` object, not partial patches.

## Key files to read before coding

```
src/app/claim/[token]/preview/page.tsx   ← convert this to client component + add edit
src/app/api/claim/[token]/route.ts       ← GET and PATCH endpoints (already exist)
src/lib/travelclaim/claim-types.ts       ← TravelAuthorization, SoldierData, mergeClaimToFormInput
src/lib/travelclaim/dd1351FormFilling.ts ← Dd1351FormFillInput, buildDd1351FormFillPreview, block types
src/lib/travelclaim/dd1351ExportPacket.ts← buildDd1351ValidationFindings
src/lib/travelclaim/synthetic-soldiers.ts← SoldierData shape reference
```

## Design language

Match the existing UI:
- `border border-zinc-200 bg-white` cards
- `border-amber-300` for blocks needing review
- Teal (`teal-700`) for interactive / action elements
- `text-sm` throughout
- No border-radius on cards (the app uses square corners)
- Tailwind v4 — no `@apply`, utility classes only

## Out of scope for this task

- PDF generation (handled by teammate in `dd1351PdfFill.ts`)
- Auth / user accounts
- Deleting the claim itself
- Changing CO-locked fields (Block 2, 3, 5, 8, 11, 17, 21)
