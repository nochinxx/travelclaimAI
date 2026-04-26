"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TravelClaim, TravelAuthorization } from "@/lib/travelclaim/claim-types";
import type { RagSearchResult } from "@/lib/rag/types";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ragResults?: RagSearchResult[];
};

type ApiMessage = { role: "user" | "assistant"; content: string };

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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function send(text = input) {
    const trimmed = text.trim();
    if (!trimmed || loading || !claim?.authData) return;

    setInput("");
    setChatError(null);

    const userMessage: UIMessage = { id: `u-${Date.now()}`, role: "user", content: trimmed };
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
          id: `a-${Date.now()}`,
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

  const auth = claim.authData as TravelAuthorization;

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
        <span className="ml-auto rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
          {claim.status === "authorized" ? "Authorized — awaiting your info" : claim.status}
        </span>
      </header>

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

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "bg-zinc-950 text-white"
                        : "border border-zinc-200 bg-white text-zinc-800"
                    }`}
                  >
                    {message.content}
                  </div>

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
