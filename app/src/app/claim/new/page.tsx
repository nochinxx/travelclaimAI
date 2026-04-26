"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { MarkdownMessage } from "@/components/markdown-message";
import { SYNTHETIC_SOLDIERS } from "@/lib/travelclaim/synthetic-soldiers";
import type { RagSearchResult } from "@/lib/rag/types";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ragResults?: RagSearchResult[];
};

type ApiMessage = { role: "user" | "assistant"; content: string };

export default function NewClaimPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(0);

  function nextMessageId(prefix: "u" | "a") {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  }

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function send(text = input) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setError(null);

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
        body: JSON.stringify({ messages: apiMessages, role: "co" }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Chat failed.");
        return;
      }

      if (payload.createdClaimToken) {
        setShareToken(payload.createdClaimToken);
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
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  function onSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    void send();
  }

  const origin = globalThis.window === undefined ? "" : globalThis.location.origin;
  const claimUrl = shareToken ? `${origin}/claim/${shareToken}` : null;

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
        <h1 className="text-sm font-semibold">New Travel Authorization</h1>
        <span className="ml-auto rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
          CO / Authorizing Official
        </span>
      </header>

      {/* Share link banner — shown once authorization is created */}
      {claimUrl && (
        <div className="shrink-0 border-b border-teal-200 bg-teal-50 px-5 py-4">
          <p className="text-sm font-semibold text-teal-800">
            Authorization created — share this link with the soldier:
          </p>
          <div className="mt-2 flex items-center gap-3">
            <code className="flex-1 break-all rounded border border-teal-200 bg-white px-3 py-2 text-xs text-teal-900">
              {claimUrl}
            </code>
            <button
              onClick={() => void navigator.clipboard.writeText(claimUrl)}
              className="shrink-0 border border-teal-700 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-700 hover:text-white transition"
            >
              Copy
            </button>
            <a
              href={claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-teal-700 hover:text-teal-700 transition"
            >
              Preview
            </a>
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="flex flex-col gap-5">
              <p className="text-sm leading-6 text-zinc-500">
                Describe the travel you want to authorize, or pick a test soldier below to start with their info pre-loaded. I&apos;ll check everything against JTR and generate a shareable link.
              </p>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Test soldiers — click to load
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SYNTHETIC_SOLDIERS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => void send(s.coPrompt)}
                      className="flex flex-col gap-0.5 border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-teal-700"
                    >
                      <span className="text-sm font-medium text-zinc-800">{s.label}</span>
                      <span className="text-xs capitalize text-zinc-400">{s.branch.replace("-", " ")}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Or describe manually
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    "I need to authorize TDY travel for a soldier to Washington DC",
                    "Open a travel auth for a commercial flight + rental car",
                    "Authorize POV travel to a nearby installation",
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
                    JTR sources
                  </p>
                  {message.ragResults.slice(0, 3).map((r) => (
                    <div key={r.chunkId} className="border border-zinc-100 bg-white px-3 py-2">
                      <p className="text-xs font-medium text-teal-700">
                        {r.citation.title} · p.&nbsp;{r.citation.page}
                        <span className="ml-2 font-normal text-zinc-400">score {r.score}</span>
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
                Checking JTR...
              </div>
            </div>
          )}

          {error && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="shrink-0 border-t border-zinc-200 bg-white px-4 py-4">
        <form className="mx-auto flex max-w-2xl gap-3" onSubmit={onSubmit}>
          <textarea
            className="min-h-[44px] flex-1 resize-none border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
            placeholder="Describe the travel to authorize... (Enter to send)"
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
  );
}
