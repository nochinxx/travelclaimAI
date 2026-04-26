"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { RagSearchResult } from "@/lib/rag/types";

type SearchState =
  | { status: "idle"; results: RagSearchResult[]; error?: undefined }
  | { status: "loading"; results: RagSearchResult[]; error?: undefined }
  | { status: "ready"; results: RagSearchResult[]; error?: undefined }
  | { status: "error"; results: RagSearchResult[]; error: string };

const starterQueries = [
  "When is a rental car reimbursable?",
  "What are meal per diem rules during official travel?",
  "What receipts are required for lodging?",
];

export function SearchPanel() {
  const [query, setQuery] = useState(starterQueries[0]);
  const [state, setState] = useState<SearchState>({ status: "idle", results: [] });

  async function runSearch(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      return;
    }

    setQuery(trimmed);
    setState((current) => ({ status: "loading", results: current.results }));

    const response = await fetch("/api/rag/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: trimmed, limit: 6 }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setState({
        status: "error",
        results: [],
        error: payload.error ?? "Search failed.",
      });
      return;
    }

    setState({ status: "ready", results: payload.results });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  return (
    <section className="grid min-h-screen bg-stone-50 text-zinc-950 lg:grid-cols-[360px_1fr]">
      <aside className="border-b border-zinc-200 bg-white px-5 py-6 lg:border-b-0 lg:border-r">
        <div className="mx-auto flex max-w-5xl flex-col gap-7 lg:mx-0">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-teal-700">
              TravelClaim AI
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-normal">
              Regulations retrieval
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Search the local Joint Travel Regulations and service-specific policy PDFs.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              <Link href="/claim/new" className="text-sm font-medium text-teal-700 hover:text-teal-900">
                → New travel authorization (CO)
              </Link>
              <Link href="/chat" className="text-sm font-medium text-teal-700 hover:text-teal-900">
                → Claim assistant (soldier)
              </Link>
              <Link href="/dd1351" className="text-sm font-medium text-teal-700 hover:text-teal-900">
                → DD 1351-2 form preview
              </Link>
            </div>
          </div>

          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label className="text-sm font-medium text-zinc-800" htmlFor="rag-query">
              Claim question
            </label>
            <textarea
              id="rag-query"
              className="min-h-32 resize-none border border-zinc-300 bg-white p-3 text-sm leading-6 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              className="h-11 bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={state.status === "loading"}
              type="submit"
            >
              {state.status === "loading" ? "Searching..." : "Search corpus"}
            </button>
          </form>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Quick queries
            </p>
            {starterQueries.map((starter) => (
              <button
                className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm text-zinc-700 transition hover:border-teal-700 hover:text-zinc-950"
                key={starter}
                onClick={() => void runSearch(starter)}
                type="button"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="px-5 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {state.status === "error" ? (
            <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {state.error}
            </div>
          ) : null}

          {state.results.length === 0 && state.status !== "error" ? (
            <div className="flex min-h-72 items-center justify-center border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              Run a search to inspect ranked policy passages with citations.
            </div>
          ) : null}

          {state.results.map((result) => (
            <article className="border border-zinc-200 bg-white p-4" key={result.chunkId}>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                <span>{result.citation.title}</span>
                <span className="text-zinc-300">/</span>
                <span>Page {result.citation.page}</span>
                <span className="ml-auto text-teal-700">Score {result.score}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-800">{result.text}</p>
              <p className="mt-4 font-mono text-xs text-zinc-500">
                {result.chunkId} · {result.citation.sourcePath}
              </p>
            </article>
          ))}
        </div>
      </main>
    </section>
  );
}
