"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { MarkdownMessage } from "@/components/markdown-message";
import type { RagSearchResult } from "@/lib/rag/types";

type UIMessage = {
  role: "user" | "assistant";
  content: string;
  ragResults?: RagSearchResult[];
};

type ApiMessage = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "I need to file a TDY claim — where do I start?",
  "Is a rental car reimbursable during TDY?",
  "What receipts do I need for lodging?",
  "How does GTCC split disbursement work?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function send(text = input) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setError(null);

    const userMessage: UIMessage = { role: "user", content: trimmed };
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
        body: JSON.stringify({ messages: apiMessages }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Chat failed.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  const turns = Math.floor(messages.length / 2);

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
        <h1 className="text-sm font-semibold">Claim Assistant</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/dd1351"
            className="text-xs text-zinc-500 underline-offset-2 hover:text-teal-700 hover:underline"
          >
            View form preview
          </Link>
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-400">
            Gemini · {turns === 0 ? "ready" : `${turns} turn${turns === 1 ? "" : "s"}`}
          </span>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-6 text-zinc-500">
                Ask about travel policy or walk me through your trip and I&apos;ll help fill the DD&nbsp;1351-2.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
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

          {messages.map((message, index) => (
            <div
              key={index}
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
                    <div key={r.chunkId} className="border border-zinc-100 bg-white px-3 py-2">
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
                Thinking...
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
            placeholder="Describe your travel or ask a policy question... (Enter to send)"
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
