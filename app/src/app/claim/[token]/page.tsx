"use client";

import { use, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { MarkdownMessage } from "@/components/markdown-message";
import { findSyntheticSoldier } from "@/lib/travelclaim/synthetic-soldiers";
import type { SoldierData, TravelClaim, TravelAuthorization } from "@/lib/travelclaim/claim-types";
import type { RagSearchResult } from "@/lib/rag/types";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ragResults?: RagSearchResult[];
};

type ApiMessage = { role: "user" | "assistant"; content: string };

type ReceiptDraft = {
  date: string;
  merchant: string;
  amount: number | null;
  category: string;
  receipt_type: string;
  payment_method: string;
  requires_receipt: boolean;
  needs_review: boolean;
  notes: string;
};

type ClaimAttachment = {
  id: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  status: string;
  signedUrl: string | null;
  extractedData: Partial<ReceiptDraft>;
  confirmedData: Partial<ReceiptDraft>;
  createdAt: string;
};

const RECEIPT_CATEGORIES = [
  "lodging",
  "transportation",
  "parking",
  "tolls",
  "baggage",
  "rental_car",
  "fuel",
  "registration_fee",
  "other",
];

export default function SoldierClaimPage({
  params,
}: Readonly<{
  params: Promise<{ token: string }>;
}>) {
  const { token } = use(params);

  const [claim, setClaim] = useState<TravelClaim | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [attachments, setAttachments] = useState<ClaimAttachment[]>([]);
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<string, ReceiptDraft>>({});
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(0);

  function nextMessageId(prefix: "u" | "a") {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  }

  useEffect(() => {
    fetch(`/api/claim/${token}`)
      .then((r) => r.json())
      .then((data: TravelClaim | { error: string }) => {
        if ("error" in data) {
          setClaimError(data.error);
        } else {
          setClaim(data);
        }
      })
      .catch(() => setClaimError("Failed to load claim."));
  }, [token]);

  useEffect(() => {
    let active = true;

    fetch(`/api/claim/${token}/attachments`)
      .then((response) =>
        response.json().then((payload) => ({
          ok: response.ok,
          payload,
        })),
      )
      .then(({ ok, payload }) => {
        if (!active) return;
        if (!ok) throw new Error(payload.error ?? "Failed to load attachments.");
        const nextAttachments = payload.attachments as ClaimAttachment[];
        setAttachments(nextAttachments);
        setAttachmentDrafts((current) => ({
          ...Object.fromEntries(
            nextAttachments.map((attachment) => [
              attachment.id,
              buildReceiptDraft(attachment.confirmedData, attachment.extractedData),
            ]),
          ),
          ...current,
        }));
      })
      .catch((error) => {
        if (!active) return;
        setAttachmentError(error instanceof Error ? error.message : "Failed to load attachments.");
      });

    return () => {
      active = false;
    };
  }, [token]);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function send(text = input) {
    const trimmed = text.trim();
    if (!trimmed || loading || !claim?.authData) return;

    setInput("");
    setChatError(null);

    const userMessage: UIMessage = { id: nextMessageId("u"), role: "user", content: trimmed };
    const next = [...messages, userMessage];
    setMessages(next);
    setLoading(true);
    scrollToBottom();

    const apiMessages: ApiMessage[] = next.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          role: "soldier",
          authData: claim.authData,
          branch: claim.authData.branch ?? null,
          claimToken: token,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setChatError(payload.error ?? "Chat failed.");
        return;
      }

      if (payload.soldierDataSaved) {
        setLastSaved(new Date().toLocaleTimeString());
      }

      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId("a"),
          role: "assistant",
          content: payload.text,
          ragResults: payload.ragResults?.length ? payload.ragResults : undefined,
        },
      ]);
    } catch {
      setChatError("Network error — please try again.");
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  function onSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    void send();
  }

  async function loadAttachments() {
    const response = await fetch(`/api/claim/${token}/attachments`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load attachments.");
    const nextAttachments = payload.attachments as ClaimAttachment[];
    setAttachments(nextAttachments);
    setAttachmentDrafts((current) => ({
      ...Object.fromEntries(
        nextAttachments.map((attachment) => [
          attachment.id,
          buildReceiptDraft(attachment.confirmedData, attachment.extractedData),
        ]),
      ),
      ...current,
    }));
  }

  async function uploadReceipt(file: File | null) {
    if (!file || uploading) return;

    setUploading(true);
    setAttachmentError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`/api/claim/${token}/attachments`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Receipt upload failed.");

      const attachment = payload.attachment as ClaimAttachment;
      setAttachments((current) => [attachment, ...current.filter((item) => item.id !== attachment.id)]);
      setAttachmentDrafts((current) => ({
        ...current,
        [attachment.id]: buildReceiptDraft(attachment.confirmedData, attachment.extractedData),
      }));
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Receipt upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function updateAttachmentDraft(
    attachmentId: string,
    field: keyof ReceiptDraft,
    value: string | number | boolean | null,
  ) {
    setAttachmentDrafts((current) => ({
      ...current,
      [attachmentId]: {
        ...current[attachmentId],
        [field]: value,
      },
    }));
  }

  async function confirmAttachment(attachmentId: string) {
    const draft = attachmentDrafts[attachmentId];
    if (!draft) return;

    setAttachmentError(null);

    try {
      const response = await fetch(`/api/claim/${token}/attachments/${attachmentId}/confirm`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmedData: draft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not confirm receipt.");

      setClaim((current) =>
        current ? { ...current, soldierData: payload.soldierData, status: "in_progress" } : current,
      );
      setLastSaved(new Date().toLocaleTimeString());
      await loadAttachments();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not confirm receipt.");
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (claimError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="flex max-w-sm flex-col gap-4 border border-red-200 bg-white p-6">
          <p className="text-sm font-semibold text-red-700">Claim not found</p>
          <p className="text-sm text-zinc-600">{claimError}</p>
          <Link href="/" className="text-sm text-teal-700 hover:underline">
            ← Back to TravelClaim AI
          </Link>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-zinc-400">Loading authorization...</p>
      </div>
    );
  }

  const currentClaim = claim;
  const auth = currentClaim.authData as TravelAuthorization;
  const syntheticProfile = findSyntheticSoldier(auth.travelerName);

  async function prefill() {
    if (!syntheticProfile) return;
    const soldierData = mergePrefillSoldierData(
      currentClaim.soldierData,
      syntheticProfile.soldierData,
    );

    setPrefilling(true);
    try {
      await fetch(`/api/claim/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soldierData,
          status: "in_progress",
        }),
      });
      globalThis.location.href = `/claim/${token}/preview`;
    } finally {
      setPrefilling(false);
    }
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-stone-50 text-zinc-950">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 hover:text-teal-900"
        >
          ← TravelClaim AI
        </Link>
        <span className="text-zinc-300">|</span>
        <h1 className="text-sm font-semibold">Your Travel Voucher</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/claim/${token}/preview`}
            className="text-xs text-zinc-500 underline-offset-2 hover:text-teal-700 hover:underline"
          >
            View form →
          </Link>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
            {claim.status === "authorized" ? "Authorized — awaiting your info" : claim.status}
          </span>
        </div>
      </header>

      {/* Pre-fill test data banner */}
      {syntheticProfile && (
        <div className="shrink-0 flex items-center justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-5 py-3">
          <p className="text-xs text-zinc-600">
            Test profile detected — pre-fill all of <span className="font-semibold">{syntheticProfile.label}</span>&apos;s data instantly.
          </p>
          <button
            onClick={() => void prefill()}
            disabled={prefilling}
            className="shrink-0 border border-zinc-950 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:bg-zinc-400"
          >
            {prefilling ? "Filling..." : "Pre-fill & view form"}
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden lg:flex-row flex-col">
        {/* Authorization panel */}
        <aside className="shrink-0 overflow-y-auto border-b border-zinc-200 bg-white lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-4 px-4 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Pre-authorized by CO
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                These fields are already filled — just confirm your actual travel matched.
              </p>
            </div>

            <AuthRow label="Name" value={auth.travelerName} />
            <AuthRow label="Grade" value={auth.travelerGrade} />
            <AuthRow label="Organization" value={auth.travelerOrganization} />
            <AuthRow label="Duty station" value={auth.travelerStation} />
            <AuthRow label="Order number" value={auth.orderNumber} />
            <AuthRow label="Mission" value={auth.missionDescription} />
            <AuthRow label="Destination" value={auth.destination} />
            <AuthRow
              label="Travel dates"
              value={`${auth.authorizedStartDate} → ${auth.authorizedEndDate}`}
            />
            <AuthRow label="Transport mode" value={auth.authorizedTransportMode} />
            <AuthRow
              label="Rental car"
              value={
                auth.rentalCarAuthorized
                  ? `Authorized — ${auth.rentalCarJustification ?? "see orders"}`
                  : "Not authorized"
              }
              highlight={auth.rentalCarAuthorized}
            />
            <AuthRow
              label="Lodging"
              value={
                auth.lodgingAuthorized
                  ? `Authorized · Per diem: ${auth.perDiemLocality}`
                  : "Not authorized"
              }
              highlight={auth.lodgingAuthorized}
            />
            <AuthRow label="Approving official" value={auth.approvingOfficialName} />

            {auth.jtrCitations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-400">JTR citations</p>
                {auth.jtrCitations.map((c) => (
                  <p key={c} className="mt-0.5 text-xs text-zinc-500">
                    {c}
                  </p>
                ))}
              </div>
            )}

            {auth.specialInstructions && (
              <AuthRow label="Special instructions" value={auth.specialInstructions} />
            )}

            <div className="border-t border-zinc-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Receipts
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Upload receipt images for Block 18 expenses. PDFs are stored, but image uploads work best for OCR.
              </p>
              <label className="mt-3 block cursor-pointer border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-center text-xs font-semibold text-zinc-700 transition hover:border-teal-700 hover:text-teal-700">
                {uploading ? "Uploading..." : "Upload receipt"}
                <input
                  className="hidden"
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void uploadReceipt(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {attachmentError && (
                <p className="mt-2 text-xs leading-5 text-red-700">{attachmentError}</p>
              )}
              <p className="mt-2 text-xs text-zinc-400">
                {attachments.length} attachment{attachments.length === 1 ? "" : "s"} on this claim.
              </p>
            </div>
          </div>
        </aside>

        {/* Chat panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.length === 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-6 text-zinc-500">
                    Your travel authorization is loaded. I know what your CO pre-approved — now help me fill in your actual travel details and expenses.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      "What expenses do I need receipts for?",
                      "Walk me through what I still need to fill",
                      "I used a rental car — what do I need to claim it?",
                      "What are the per diem rules for my destination?",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => void send(s)}
                        className="border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-700 transition hover:border-teal-700 hover:text-zinc-950"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Uploaded receipts
                  </p>
                  {attachments.map((attachment) => (
                    <ReceiptAttachmentCard
                      attachment={attachment}
                      draft={attachmentDrafts[attachment.id]}
                      key={attachment.id}
                      onConfirm={() => void confirmAttachment(attachment.id)}
                      onDraftChange={(field, value) =>
                        updateAttachmentDraft(attachment.id, field, value)
                      }
                    />
                  ))}
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[85%] whitespace-pre-wrap px-4 py-3 text-sm leading-6 bg-zinc-950 text-white">
                      {message.content}
                    </div>
                  ) : (
                    <MarkdownMessage
                      text={message.content}
                      className="max-w-[85%] border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 [&>*+*]:mt-2 [&>ul]:space-y-1 [&>ol]:space-y-1"
                    />
                  )}

                  {message.ragResults && message.ragResults.length > 0 && (
                    <div className="flex w-full max-w-[85%] flex-col gap-1.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                        Regulation sources
                      </p>
                      {message.ragResults.slice(0, 3).map((r) => (
                        <div
                          key={r.chunkId}
                          className="border border-zinc-100 bg-white px-3 py-2"
                        >
                          <p className="text-xs font-medium text-teal-700">
                            {r.citation.title} · p.&nbsp;{r.citation.page}
                            <span className="ml-2 font-normal text-zinc-400">
                              score {r.score}
                            </span>
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                            {r.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex items-start">
                  <div className="border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-400">
                    Checking regulations...
                  </div>
                </div>
              )}

              {chatError && (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {chatError}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </main>

          <footer className="shrink-0 border-t border-zinc-200 bg-white px-4 py-4">
            {lastSaved && (
              <p className="mx-auto mb-2 max-w-2xl text-xs text-teal-700">
                Progress saved at {lastSaved}
              </p>
            )}
            <form className="mx-auto flex max-w-2xl gap-3" onSubmit={onSubmit}>
              <textarea
                className="min-h-[44px] flex-1 resize-none border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                placeholder="Enter your travel details or ask about your entitlements... (Enter to send)"
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="h-11 bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                Send
              </button>
            </form>
          </footer>
        </div>
      </div>
    </div>
  );
}

function ReceiptAttachmentCard({
  attachment,
  draft,
  onDraftChange,
  onConfirm,
}: Readonly<{
  attachment: ClaimAttachment;
  draft?: ReceiptDraft;
  onDraftChange: (field: keyof ReceiptDraft, value: string | number | boolean | null) => void;
  onConfirm: () => void;
}>) {
  const value = draft ?? buildReceiptDraft(attachment.confirmedData, attachment.extractedData);
  const isConfirmed = attachment.status === "confirmed";

  return (
    <article className="border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-zinc-800">
          {attachment.fileName ?? "Uploaded receipt"}
        </p>
        <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500">
          {attachment.status}
        </span>
        {attachment.signedUrl && (
          <a
            className="ml-auto text-xs font-semibold text-teal-700 hover:underline"
            href={attachment.signedUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            View file
          </a>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <input
            className="w-full border border-zinc-300 px-2 py-2 text-sm"
            type="date"
            value={value.date}
            onChange={(event) => onDraftChange("date", event.target.value)}
          />
        </Field>
        <Field label="Merchant">
          <input
            className="w-full border border-zinc-300 px-2 py-2 text-sm"
            value={value.merchant}
            onChange={(event) => onDraftChange("merchant", event.target.value)}
          />
        </Field>
        <Field label="Amount">
          <input
            className="w-full border border-zinc-300 px-2 py-2 text-sm"
            min="0"
            step="0.01"
            type="number"
            value={value.amount ?? ""}
            onChange={(event) =>
              onDraftChange("amount", event.target.value ? Number(event.target.value) : null)
            }
          />
        </Field>
        <Field label="Category">
          <select
            className="w-full border border-zinc-300 px-2 py-2 text-sm"
            value={value.category}
            onChange={(event) => onDraftChange("category", event.target.value)}
          >
            {RECEIPT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Receipt type">
          <input
            className="w-full border border-zinc-300 px-2 py-2 text-sm"
            value={value.receipt_type}
            onChange={(event) => onDraftChange("receipt_type", event.target.value)}
          />
        </Field>
        <Field label="Payment method">
          <input
            className="w-full border border-zinc-300 px-2 py-2 text-sm"
            value={value.payment_method}
            onChange={(event) => onDraftChange("payment_method", event.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className="min-h-20 w-full resize-none border border-zinc-300 px-2 py-2 text-sm"
          value={value.notes}
          onChange={(event) => onDraftChange("notes", event.target.value)}
        />
      </Field>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            checked={value.requires_receipt}
            type="checkbox"
            onChange={(event) => onDraftChange("requires_receipt", event.target.checked)}
          />
          Receipt required
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            checked={value.needs_review}
            type="checkbox"
            onChange={(event) => onDraftChange("needs_review", event.target.checked)}
          />
          Needs review
        </label>
        <button
          className="ml-auto bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          onClick={onConfirm}
          type="button"
        >
          {isConfirmed ? "Update confirmed expense" : "Confirm expense"}
        </button>
      </div>
    </article>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function buildReceiptDraft(
  confirmedData: Partial<ReceiptDraft> = {},
  extractedData: Partial<ReceiptDraft> = {},
): ReceiptDraft {
  const source = Object.keys(confirmedData).length ? confirmedData : extractedData;
  return {
    date: source.date ?? "",
    merchant: source.merchant ?? "",
    amount: typeof source.amount === "number" ? source.amount : null,
    category: source.category ?? "other",
    receipt_type: source.receipt_type ?? "receipt",
    payment_method: source.payment_method ?? "",
    requires_receipt: source.requires_receipt ?? true,
    needs_review: source.needs_review ?? true,
    notes: source.notes ?? "",
  };
}

function mergePrefillSoldierData(current: SoldierData, prefill: SoldierData): SoldierData {
  const prefillExpenses = prefill.expenses ?? [];
  const prefillAttachmentIds = new Set(
    prefillExpenses
      .map((expense) => expense.attachment_id)
      .filter((id): id is string => Boolean(id)),
  );
  const preservedReceiptExpenses = (current.expenses ?? []).filter(
    (expense) => expense.attachment_id && !prefillAttachmentIds.has(expense.attachment_id),
  );

  return {
    ...current,
    ...prefill,
    expenses: [...prefillExpenses, ...preservedReceiptExpenses],
    attachments: mergeAttachmentStatuses(current.attachments ?? [], prefill.attachments ?? []),
  };
}

function mergeAttachmentStatuses(
  current: NonNullable<SoldierData["attachments"]>,
  prefill: NonNullable<SoldierData["attachments"]>,
) {
  const currentByKey = new Map(current.map((attachment) => [attachment.key, attachment]));
  const merged = prefill.map((attachment) => {
    const existing = currentByKey.get(attachment.key);
    return existing ? { ...attachment, attached: attachment.attached || existing.attached } : attachment;
  });
  const prefillKeys = new Set(prefill.map((attachment) => attachment.key));
  return [...merged, ...current.filter((attachment) => !prefillKeys.has(attachment.key))];
}

function AuthRow({
  label,
  value,
  highlight = false,
}: Readonly<{
  label: string;
  value: string;
  highlight?: boolean;
}>) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm ${highlight ? "font-medium text-teal-700" : "text-zinc-700"}`}>
        {value}
      </p>
    </div>
  );
}
