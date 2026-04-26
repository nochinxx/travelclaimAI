"use client";

import { use, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { MarkdownMessage } from "@/components/markdown-message";
import { mergeClaimToFormInput, type SoldierData, type TravelAuthorization, type TravelClaim } from "@/lib/travelclaim/claim-types";
import {
  buildDd1351FormFillPreview,
  type Dd1351BlockPreview,
  type Dd1351ExpenseRow,
  type Dd1351ItineraryRow,
  type Dd1351ModeCode,
  type Dd1351ReasonCode,
} from "@/lib/travelclaim/dd1351FormFilling";
import {
  buildDd1351ValidationFindings,
  type Dd1351ValidationFinding,
} from "@/lib/travelclaim/dd1351ExportPacket";
import type { RagSearchResult } from "@/lib/rag/types";

export const dynamic = "force-dynamic";

const EDITABLE_BLOCKS = new Set([1, 4, 6, 7, 9, 15, 16, 18, 19, 20]);
const REQUIRED_BLOCKS = new Set([1, 4, 6, 7, 15, 20]);
const MODE_OPTIONS: Array<{ code: Dd1351ModeCode; label: string }> = [
  { code: "PA", label: "Privately Owned Conveyance + Automobile" },
  { code: "TP", label: "Government transportation" },
  { code: "CP", label: "Commercial transportation, own expense + Plane" },
];
const REASON_OPTIONS: Array<{ code: Dd1351ReasonCode; label: string }> = [
  { code: "TD", label: "Temporary Duty" },
  { code: "MC", label: "Mission Complete" },
  { code: "AT", label: "Authorized Delay" },
  { code: "LV", label: "Leave" },
  { code: "AD", label: "Authorized Deviation" },
  { code: "AR", label: "Awaiting Transportation" },
];

type EditableBlock = 1 | 4 | 6 | 7 | 9 | 15 | 16 | 18 | 19 | 20;
type DraftState =
  | { block: 1; eftSelected: boolean; gtccUsed: boolean; gtccSplitDisbursementAmount: string }
  | { block: 4; dodIdPlaceholder: string }
  | { block: 6; mailingAddress: string; email: string }
  | { block: 7; phone: string }
  | { block: 9; previousAdvances: string }
  | { block: 15; itinerary: Dd1351ItineraryRow[] }
  | { block: 16; pocTravelOverride: string }
  | { block: 18; expenses: Dd1351ExpenseRow[] }
  | { block: 19; deductibleMeals: string }
  | { block: 20; claimantSignatureDate: string };

type BlockHelpState = {
  loading?: boolean;
  error?: string;
  text?: string;
  ragResults?: RagSearchResult[];
};

export default function ClaimPreviewPage({
  params,
}: Readonly<{
  params: Promise<{ token: string }>;
}>) {
  const { token } = use(params);
  const [claim, setClaim] = useState<TravelClaim | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<EditableBlock | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedBlock, setSavedBlock] = useState<EditableBlock | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [blockHelp, setBlockHelp] = useState<Record<number, BlockHelpState>>({});

  useEffect(() => {
    fetch(`/api/claim/${token}`)
      .then((response) => response.json())
      .then((data: TravelClaim | { error: string }) => {
        if ("error" in data) {
          setClaimError(data.error);
          return;
        }

        if (!data.authData) {
          setClaimError("Claim is missing authorization data.");
          return;
        }

        setClaim(data);
      })
      .catch(() => setClaimError("Failed to load claim."));
  }, [token]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        globalThis.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  if (claimError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="flex max-w-sm flex-col gap-4 border border-red-200 bg-white p-6">
          <p className="text-sm font-semibold text-red-700">Preview unavailable</p>
          <p className="text-sm text-zinc-600">{claimError}</p>
          <Link href="/" className="text-sm text-teal-700 hover:underline">
            ← Back to TravelClaim AI
          </Link>
        </div>
      </div>
    );
  }

  if (!claim?.authData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-zinc-400">Loading form preview...</p>
      </div>
    );
  }

  const currentClaim = claim;
  const authData = currentClaim.authData as TravelAuthorization;
  const formInput = mergeClaimToFormInput(authData, currentClaim.soldierData);
  const preview = buildDd1351FormFillPreview(formInput);
  const findings = buildDd1351ValidationFindings(formInput);
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const blocksNeedingReview = preview.blocks.filter((block) => block.needsReview);

  function beginEdit(block: EditableBlock) {
    setEditingBlock(block);
    setDraft(buildDraft(block, currentClaim.soldierData));
    setEditError(null);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingBlock(null);
    setDraft(null);
    setEditError(null);
    setSaveError(null);
  }

  async function saveDraft() {
    if (!editingBlock || !draft) {
      return;
    }

    const result = buildSoldierDataPatch(editingBlock, draft, currentClaim.soldierData);
    if ("error" in result) {
      setEditError(result.error);
      return;
    }

    const previousClaim = currentClaim;
    const nextClaim = {
      ...currentClaim,
      status: "in_progress" as const,
      soldierData: result.soldierData,
    };

    setClaim(nextClaim);
    setSaving(true);
    setSaveError(null);
    setEditError(null);

    try {
      const response = await fetch(`/api/claim/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soldierData: result.soldierData,
          status: "in_progress",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to save changes.");
      }

      setEditingBlock(null);
      setDraft(null);
      setSavedBlock(editingBlock);
      if (savedTimerRef.current !== null) {
        globalThis.clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = globalThis.setTimeout(() => {
        setSavedBlock(null);
      }, 2000);
    } catch (error) {
      setClaim(previousClaim);
      setSaveError(error instanceof Error ? error.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function requestBlockHelp(block: Dd1351BlockPreview) {
    setBlockHelp((current) => ({
      ...current,
      [block.block]: { loading: true },
    }));

    const values = Array.isArray(block.value) ? block.value : [block.value];
    const prompt = [
      `Explain Block ${block.block} (${block.title}) on a DD Form 1351-2 in plain language for the traveler.`,
      "This is an inline preview help request, not a save request. Do not ask follow-up questions and do not update claim data.",
      "If receipt, reimbursability, or entitlement rules are relevant, search the regulations before answering.",
      "Respond with:",
      "1. Why this block is being flagged for review.",
      "2. What the traveler should confirm or edit.",
      "3. Any rule or documentation requirement that matters.",
      "Keep it concise and actionable.",
      "",
      `Traveler branch: ${authData.branch}`,
      `Authorized trip: ${authData.authorizedStartDate} to ${authData.authorizedEndDate}`,
      `Order number: ${authData.orderNumber}`,
      `Current block value: ${values.join(" || ")}`,
      `Preview note: ${block.note}`,
    ].join("\n");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          role: "general",
          branch: authData.branch,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        text?: string;
        ragResults?: RagSearchResult[];
      } | null;

      if (!response.ok || !payload?.text) {
        throw new Error(payload?.error ?? "Failed to load block guidance.");
      }

      setBlockHelp((current) => ({
        ...current,
        [block.block]: {
          text: payload.text,
          ragResults: payload.ragResults?.length ? payload.ragResults : undefined,
        },
      }));
    } catch (error) {
      setBlockHelp((current) => ({
        ...current,
        [block.block]: {
          error: error instanceof Error ? error.message : "Failed to load block guidance.",
        },
      }));
    }
  }

  return (
    <section className="grid min-h-screen bg-stone-50 text-zinc-950 lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-zinc-200 bg-white px-5 py-6 lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-6">
          <div>
            <Link
              href={`/claim/${token}`}
              className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 hover:text-teal-900"
            >
              ← Back to chat
            </Link>
            <h1 className="mt-3 text-2xl font-semibold leading-tight">DD Form 1351-2</h1>
            <p className="mt-1 text-xs text-zinc-500">Nov 2025 · Filled preview</p>
          </div>

          <div className="flex flex-col gap-1.5 border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Traveler</p>
            <p className="text-sm font-semibold">{formInput.traveler.name}</p>
            <p className="text-sm text-zinc-600">{formInput.traveler.grade} · {formInput.traveler.organization}</p>
            <p className="text-sm text-zinc-600">{formInput.traveler.station}</p>
          </div>

          <div className="flex flex-col gap-1.5 border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Trip</p>
            <p className="text-sm">{formInput.travelStartDate} → {formInput.travelEndDate}</p>
            <p className="text-sm text-zinc-600">Orders: {formInput.travelOrderNumber}</p>
          </div>

          {errors.length > 0 && (
            <FindingGroup title={`${errors.length} error${errors.length === 1 ? "" : "s"}`} findings={errors} color="red" />
          )}
          {warnings.length > 0 && (
            <FindingGroup title={`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`} findings={warnings} color="amber" />
          )}
          {errors.length === 0 && warnings.length === 0 && (
            <div className="border border-teal-200 bg-teal-50 px-4 py-3">
              <p className="text-sm font-medium text-teal-700">No errors or warnings</p>
            </div>
          )}

          {preview.missingAttachments.length > 0 && (
            <div className="flex flex-col gap-2 border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                Missing attachments
              </p>
              {preview.missingAttachments.map((label) => (
                <p key={label} className="text-sm text-red-800">{label}</p>
              ))}
            </div>
          )}

          {blocksNeedingReview.length > 0 && (
            <div className="flex flex-col gap-2 border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                Needs review ({blocksNeedingReview.length})
              </p>
              {blocksNeedingReview.map((block) => (
                <p key={block.block} className="text-sm text-amber-800">Block {block.block} — {block.title}</p>
              ))}
            </div>
          )}

          <p className="text-xs leading-5 text-zinc-400">{preview.disclaimer}</p>
        </div>
      </aside>

      <main className="px-5 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Form blocks</h2>
            <span className="text-sm text-zinc-500">{preview.blocks.length} total</span>
          </div>

          {preview.blocks.map((block) => (
            <BlockCard
              key={block.block}
              block={block}
              canEdit={EDITABLE_BLOCKS.has(block.block)}
              isEditing={editingBlock === block.block}
              isSaving={saving && editingBlock === block.block}
              saved={savedBlock === block.block}
              draft={editingBlock === block.block ? draft : null}
              error={editingBlock === block.block ? editError ?? saveError : null}
              help={blockHelp[block.block]}
              onEdit={() => beginEdit(block.block as EditableBlock)}
              onCancel={cancelEdit}
              onSave={() => void saveDraft()}
              onDraftChange={setDraft}
              onHelp={() => void requestBlockHelp(block)}
            />
          ))}
        </div>
      </main>
    </section>
  );
}

function BlockCard({
  block,
  canEdit,
  isEditing,
  isSaving,
  saved,
  draft,
  error,
  help,
  onEdit,
  onCancel,
  onSave,
  onDraftChange,
  onHelp,
}: Readonly<{
  block: Dd1351BlockPreview;
  canEdit: boolean;
  isEditing: boolean;
  isSaving: boolean;
  saved: boolean;
  draft: DraftState | null;
  error: string | null;
  help?: BlockHelpState;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDraftChange: Dispatch<SetStateAction<DraftState | null>>;
  onHelp: () => void;
}>) {
  const values = Array.isArray(block.value) ? block.value : [block.value];

  return (
    <article className={`border bg-white p-4 ${block.needsReview ? "border-amber-300" : "border-zinc-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Block {block.block}
        </span>
        <span className="text-sm font-semibold text-zinc-800">{block.title}</span>
        {saved && (
          <span className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
            Saved
          </span>
        )}
        {block.needsReview && !saved && (
          <span className="ml-auto bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Needs review
          </span>
        )}
        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={onEdit}
            className={`${saved || !block.needsReview ? "ml-auto" : ""} border border-teal-700 px-3 py-1 text-xs font-semibold text-teal-700 transition hover:bg-teal-700 hover:text-white`}
          >
            Edit
          </button>
        )}
        {!canEdit && (
          <span className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Locked
          </span>
        )}
      </div>

      {block.needsReview && !isEditing && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onHelp}
            disabled={help?.loading}
            className="border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-teal-700 hover:text-teal-700 disabled:text-zinc-400"
          >
            {help?.loading ? "Checking JTR guidance..." : "What needs review?"}
          </button>
        </div>
      )}

      {isEditing && draft ? (
        <div className="mt-4 flex flex-col gap-4">
          <BlockEditor block={block.block} draft={draft} onDraftChange={onDraftChange} />
          {error && (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {REQUIRED_BLOCKS.has(block.block) && (
            <p className="text-xs text-zinc-500">This block is required and cannot be cleared.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="border border-zinc-950 bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:border-zinc-400 disabled:bg-zinc-400"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 disabled:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {values.map((line, index) => (
            <p key={index} className="text-sm leading-6 text-zinc-700">{line}</p>
          ))}
        </div>
      )}

      {help && !isEditing && (
        <div className="mt-4 flex flex-col gap-3 border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            JTR guidance
          </p>
          {help.loading && (
            <p className="text-sm text-zinc-500">Consulting JTR data and building guidance...</p>
          )}
          {help.error && (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {help.error}
            </p>
          )}
          {help.text && (
            <MarkdownMessage
              text={help.text}
              className="text-sm leading-6 text-zinc-800 [&>*+*]:mt-2 [&>ul]:space-y-1 [&>ol]:space-y-1"
            />
          )}
          {help.ragResults && help.ragResults.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Regulation sources
              </p>
              {help.ragResults.slice(0, 3).map((result) => (
                <div key={result.chunkId} className="border border-zinc-200 bg-white px-3 py-2">
                  <p className="text-xs font-medium text-teal-700">
                    {result.citation.title} · p.&nbsp;{result.citation.page}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {result.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {block.note && <p className="mt-3 text-xs leading-5 text-zinc-400">{block.note}</p>}
    </article>
  );
}

function BlockEditor({
  block,
  draft,
  onDraftChange,
}: Readonly<{
  block: number;
  draft: DraftState;
  onDraftChange: Dispatch<SetStateAction<DraftState | null>>;
}>) {
  switch (block) {
    case 1:
      if (draft.block !== 1) return null;
      return (
        <>
          <ToggleField
            label="EFT selected"
            checked={draft.eftSelected}
            onChange={(value) => updateDraft(onDraftChange, 1, { eftSelected: value })}
          />
          <ToggleField
            label="GTCC used"
            checked={draft.gtccUsed}
            onChange={(value) => updateDraft(onDraftChange, 1, { gtccUsed: value })}
          />
          <TextField
            label="Split disbursement amount"
            type="number"
            step="0.01"
            value={draft.gtccSplitDisbursementAmount}
            onChange={(value) => updateDraft(onDraftChange, 1, { gtccSplitDisbursementAmount: value })}
            placeholder={draft.gtccUsed ? "Required when GTCC is used" : "Optional"}
          />
        </>
      );
    case 4:
      if (draft.block !== 4) return null;
      return (
        <TextField
          label="DoD ID / SSN placeholder"
          value={draft.dodIdPlaceholder}
          onChange={(value) => updateDraft(onDraftChange, 4, { dodIdPlaceholder: value })}
        />
      );
    case 6:
      if (draft.block !== 6) return null;
      return (
        <>
          <TextAreaField
            label="Mailing address"
            value={draft.mailingAddress}
            onChange={(value) => updateDraft(onDraftChange, 6, { mailingAddress: value })}
            rows={3}
          />
          <TextField
            label="Email"
            type="email"
            value={draft.email}
            onChange={(value) => updateDraft(onDraftChange, 6, { email: value })}
          />
        </>
      );
    case 7:
      if (draft.block !== 7) return null;
      return (
        <TextField
          label="Daytime telephone"
          value={draft.phone}
          onChange={(value) => updateDraft(onDraftChange, 7, { phone: value })}
        />
      );
    case 9:
      if (draft.block !== 9) return null;
      return (
        <TextField
          label="Previous advances"
          value={draft.previousAdvances}
          onChange={(value) => updateDraft(onDraftChange, 9, { previousAdvances: value })}
          placeholder="Leave blank when there were no advances"
        />
      );
    case 15:
      if (draft.block !== 15) return null;
      return (
        <ItineraryEditor
          rows={draft.itinerary}
          onChange={(itinerary) => updateDraft(onDraftChange, 15, { itinerary })}
        />
      );
    case 16:
      if (draft.block !== 16) return null;
      return (
        <TextAreaField
          label="POC travel override"
          value={draft.pocTravelOverride}
          onChange={(value) => updateDraft(onDraftChange, 16, { pocTravelOverride: value })}
          rows={4}
          placeholder="Leave blank to derive this block from itinerary rows"
        />
      );
    case 18:
      if (draft.block !== 18) return null;
      return (
        <ExpenseEditor
          rows={draft.expenses}
          onChange={(expenses) => updateDraft(onDraftChange, 18, { expenses })}
        />
      );
    case 19:
      if (draft.block !== 19) return null;
      return (
        <TextAreaField
          label="Deductible meals"
          value={draft.deductibleMeals}
          onChange={(value) => updateDraft(onDraftChange, 19, { deductibleMeals: value })}
          rows={3}
          placeholder="Leave blank to keep this block flagged for review"
        />
      );
    case 20:
      if (draft.block !== 20) return null;
      return (
        <TextField
          label="Claimant signature date"
          type="date"
          value={draft.claimantSignatureDate}
          onChange={(value) => updateDraft(onDraftChange, 20, { claimantSignatureDate: value })}
        />
      );
    default:
      return null;
  }
}

function ItineraryEditor({
  rows,
  onChange,
}: Readonly<{
  rows: Dd1351ItineraryRow[];
  onChange: (rows: Dd1351ItineraryRow[]) => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <div key={`${index}-${row.date}-${row.place}`} className="border border-zinc-200 bg-zinc-50 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Date"
              type="date"
              value={row.date}
              onChange={(value) => onChange(updateRow(rows, index, { date: value }))}
            />
            <TextField
              label="Place"
              value={row.place}
              onChange={(value) => onChange(updateRow(rows, index, { place: value }))}
            />
            <SelectField
              label="Mode"
              value={row.modeCode}
              options={MODE_OPTIONS.map((option) => ({
                value: option.code,
                label: `${option.code} — ${option.label}`,
              }))}
              onChange={(value) => {
                const option = MODE_OPTIONS.find((entry) => entry.code === value)!;
                onChange(
                  updateRow(rows, index, {
                    modeCode: option.code,
                    modeLabel: option.label,
                  }),
                );
              }}
            />
            <SelectField
              label="Reason"
              value={row.reasonCode}
              options={REASON_OPTIONS.map((option) => ({
                value: option.code,
                label: `${option.code} — ${option.label}`,
              }))}
              onChange={(value) => {
                const option = REASON_OPTIONS.find((entry) => entry.code === value)!;
                onChange(
                  updateRow(rows, index, {
                    reasonCode: option.code,
                    reasonLabel: option.label,
                  }),
                );
              }}
            />
            <TextField
              label="Lodging cost"
              type="number"
              step="0.01"
              value={row.lodgingCost?.toString() ?? ""}
              onChange={(value) => onChange(updateRow(rows, index, { lodgingCost: parseDraftNumber(value) }))}
              placeholder="Optional"
            />
            <TextField
              label="POC miles"
              type="number"
              step="1"
              value={row.pocMiles?.toString() ?? ""}
              onChange={(value) => onChange(updateRow(rows, index, { pocMiles: parseDraftInteger(value) }))}
              placeholder="Optional"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onChange(removeRow(rows, index))}
              disabled={rows.length === 1}
              className="border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500 disabled:text-zinc-400"
            >
              Delete row
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, createEmptyItineraryRow()])}
        className="self-start border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-700 hover:text-white"
      >
        Add itinerary row
      </button>
    </div>
  );
}

function ExpenseEditor({
  rows,
  onChange,
}: Readonly<{
  rows: Dd1351ExpenseRow[];
  onChange: (rows: Dd1351ExpenseRow[]) => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <div key={`${index}-${row.date}-${row.category}`} className="border border-zinc-200 bg-zinc-50 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Date"
              type="date"
              value={row.date}
              onChange={(value) => onChange(updateRow(rows, index, { date: value }))}
            />
            <TextField
              label="Category"
              value={row.category}
              onChange={(value) => onChange(updateRow(rows, index, { category: value }))}
            />
            <TextField
              label="Amount"
              type="number"
              step="0.01"
              value={Number.isFinite(row.amount) ? row.amount.toString() : ""}
              onChange={(value) => onChange(updateRow(rows, index, { amount: parseRequiredNumber(value) }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleField
                label="Receipt required"
                checked={row.receiptRequired}
                onChange={(value) => onChange(updateRow(rows, index, { receiptRequired: value }))}
              />
              <ToggleField
                label="Receipt attached"
                checked={row.receiptAttached}
                onChange={(value) => onChange(updateRow(rows, index, { receiptAttached: value }))}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onChange(removeRow(rows, index))}
              className="border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500"
            >
              Delete row
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, createEmptyExpenseRow()])}
        className="self-start border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-700 hover:text-white"
      >
        Add expense row
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  step,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "date" | "number";
  step?: string;
  placeholder?: string;
}>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        step={step}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-teal-700"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-teal-700"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-teal-700"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: Readonly<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <label className="flex items-center justify-between gap-3 border border-zinc-300 bg-white px-3 py-2">
      <span className="text-sm text-zinc-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-teal-700"
      />
    </label>
  );
}

function FindingGroup({
  title,
  findings,
  color,
}: Readonly<{
  title: string;
  findings: Dd1351ValidationFinding[];
  color: "red" | "amber";
}>) {
  const styles = {
    red: { border: "border-red-200", bg: "bg-red-50", title: "text-red-700", text: "text-red-800" },
    amber: { border: "border-amber-200", bg: "bg-amber-50", title: "text-amber-700", text: "text-amber-800" },
  }[color];

  return (
    <div className={`flex flex-col gap-2 border ${styles.border} ${styles.bg} p-4`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${styles.title}`}>{title}</p>
      {findings.map((finding) => (
        <p key={`${finding.code}-${finding.relatedBlock}`} className={`text-sm ${styles.text}`}>
          Block {finding.relatedBlock} — {finding.message}
        </p>
      ))}
    </div>
  );
}

function buildDraft(block: EditableBlock, soldierData: SoldierData): DraftState {
  switch (block) {
    case 1:
      return {
        block,
        eftSelected: soldierData.eftSelected ?? false,
        gtccUsed: soldierData.gtccUsed ?? false,
        gtccSplitDisbursementAmount:
          soldierData.gtccSplitDisbursementAmount?.toString() ?? "",
      };
    case 4:
      return { block, dodIdPlaceholder: soldierData.dodIdPlaceholder ?? "" };
    case 6:
      return {
        block,
        mailingAddress: soldierData.mailingAddress ?? "",
        email: soldierData.email ?? "",
      };
    case 7:
      return { block, phone: soldierData.phone ?? "" };
    case 9:
      return { block, previousAdvances: soldierData.previousAdvances ?? "" };
    case 15:
      return {
        block,
        itinerary:
          soldierData.itinerary?.length
            ? soldierData.itinerary.map((row) => ({ ...row }))
            : [createEmptyItineraryRow()],
      };
    case 16:
      return { block, pocTravelOverride: soldierData.pocTravelOverride ?? "" };
    case 18:
      return {
        block,
        expenses: soldierData.expenses?.map((row) => ({ ...row })) ?? [],
      };
    case 19:
      return { block, deductibleMeals: soldierData.deductibleMeals ?? "" };
    case 20:
      return { block, claimantSignatureDate: soldierData.claimantSignatureDate ?? "" };
  }
}

function buildSoldierDataPatch(
  block: EditableBlock,
  draft: DraftState,
  current: SoldierData,
): { soldierData: SoldierData } | { error: string } {
  switch (block) {
    case 1: {
      if (draft.block !== 1) return { error: "Block 1 editor is out of sync." };
      if (draft.gtccUsed && draft.gtccSplitDisbursementAmount.trim().length === 0) {
        return { error: "Split disbursement amount is required when GTCC is used." };
      }
      const splitAmount = draft.gtccSplitDisbursementAmount.trim().length === 0
        ? null
        : parseMoneyString(draft.gtccSplitDisbursementAmount);
      if (splitAmount === null && draft.gtccSplitDisbursementAmount.trim().length > 0) {
        return { error: "Split disbursement amount must be a valid number." };
      }
      return {
        soldierData: {
          ...current,
          eftSelected: draft.eftSelected,
          gtccUsed: draft.gtccUsed,
          gtccSplitDisbursementAmount: splitAmount,
        },
      };
    }
    case 4:
      if (draft.block !== 4) return { error: "Block 4 editor is out of sync." };
      if (draft.dodIdPlaceholder.trim().length === 0) {
        return { error: "DoD ID / SSN placeholder is required." };
      }
      return {
        soldierData: {
          ...current,
          dodIdPlaceholder: draft.dodIdPlaceholder.trim(),
        },
      };
    case 6:
      if (draft.block !== 6) return { error: "Block 6 editor is out of sync." };
      if (draft.mailingAddress.trim().length === 0 || draft.email.trim().length === 0) {
        return { error: "Mailing address and email are required." };
      }
      return {
        soldierData: {
          ...current,
          mailingAddress: draft.mailingAddress.trim(),
          email: draft.email.trim(),
        },
      };
    case 7:
      if (draft.block !== 7) return { error: "Block 7 editor is out of sync." };
      if (draft.phone.trim().length === 0) {
        return { error: "Daytime telephone is required." };
      }
      return {
        soldierData: {
          ...current,
          phone: draft.phone.trim(),
        },
      };
    case 9:
      if (draft.block !== 9) return { error: "Block 9 editor is out of sync." };
      return {
        soldierData: {
          ...current,
          previousAdvances: draft.previousAdvances.trim() || null,
        },
      };
    case 15:
      if (draft.block !== 15) return { error: "Block 15 editor is out of sync." };
      if (draft.itinerary.length === 0) {
        return { error: "At least one itinerary row is required." };
      }
      for (const row of draft.itinerary) {
        if (row.date.trim().length === 0 || row.place.trim().length === 0) {
          return { error: "Each itinerary row needs a date and place." };
        }
      }
      return {
        soldierData: {
          ...current,
          itinerary: draft.itinerary.map((row) => ({
            ...row,
            date: row.date.trim(),
            place: row.place.trim(),
          })),
        },
      };
    case 16:
      if (draft.block !== 16) return { error: "Block 16 editor is out of sync." };
      return {
        soldierData: {
          ...current,
          pocTravelOverride: draft.pocTravelOverride.trim() || null,
        },
      };
    case 18:
      if (draft.block !== 18) return { error: "Block 18 editor is out of sync." };
      for (const row of draft.expenses) {
        if (row.date.trim().length === 0 || row.category.trim().length === 0) {
          return { error: "Each expense row needs a date and category." };
        }
        if (!Number.isFinite(row.amount)) {
          return { error: "Each expense row needs a valid amount." };
        }
      }
      return {
        soldierData: {
          ...current,
          expenses: draft.expenses.map((row) => ({
            ...row,
            date: row.date.trim(),
            category: row.category.trim(),
          })),
        },
      };
    case 19:
      if (draft.block !== 19) return { error: "Block 19 editor is out of sync." };
      return {
        soldierData: {
          ...current,
          deductibleMeals: draft.deductibleMeals.trim() || undefined,
        },
      };
    case 20:
      if (draft.block !== 20) return { error: "Block 20 editor is out of sync." };
      if (draft.claimantSignatureDate.trim().length === 0) {
        return { error: "Claimant signature date is required." };
      }
      return {
        soldierData: {
          ...current,
          claimantSignatureDate: draft.claimantSignatureDate,
        },
      };
  }
}

function createEmptyItineraryRow(): Dd1351ItineraryRow {
  return {
    date: "",
    place: "",
    modeCode: "PA",
    modeLabel: "Privately Owned Conveyance + Automobile",
    reasonCode: "TD",
    reasonLabel: "Temporary Duty",
    lodgingCost: null,
    pocMiles: null,
  };
}

function createEmptyExpenseRow(): Dd1351ExpenseRow {
  return {
    date: "",
    category: "",
    amount: 0,
    receiptRequired: false,
    receiptAttached: false,
  };
}

function updateDraft<TBlock extends EditableBlock>(
  setDraft: Dispatch<SetStateAction<DraftState | null>>,
  block: TBlock,
  patch: Partial<Extract<DraftState, { block: TBlock }>>,
) {
  setDraft((current) => {
    if (!current || current.block !== block) {
      return current;
    }

    return {
      ...current,
      ...patch,
    } as Extract<DraftState, { block: TBlock }>;
  });
}

function updateRow<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
}

function removeRow<T>(rows: T[], index: number): T[] {
  if (rows.length === 1) {
    return rows;
  }

  return rows.filter((_, rowIndex) => rowIndex !== index);
}

function parseMoneyString(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDraftInteger(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRequiredNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
