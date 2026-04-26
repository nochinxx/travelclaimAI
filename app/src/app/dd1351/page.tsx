import {
  buildDd1351FormFillPreview,
  DEMO_PHASE_2_FORM_FILL_INPUT,
  DD1351_FORM_FILL_DISCLAIMER,
} from "@/lib/travelclaim/dd1351FormFilling";
import type { Dd1351BlockPreview } from "@/lib/travelclaim/dd1351FormFilling";
import Link from "next/link";

export const metadata = {
  title: "DD Form 1351-2 Preview — TravelClaim AI",
};

export default function Dd1351Page() {
  const preview = buildDd1351FormFillPreview(DEMO_PHASE_2_FORM_FILL_INPUT);
  const traveler = DEMO_PHASE_2_FORM_FILL_INPUT.traveler;
  const blocksNeedingReview = preview.blocks.filter((b) => b.needsReview);

  return (
    <section className="grid min-h-screen bg-stone-50 text-zinc-950 lg:grid-cols-[360px_1fr]">
      {/* Sidebar */}
      <aside className="border-b border-zinc-200 bg-white px-5 py-6 lg:border-b-0 lg:border-r">
        <div className="mx-auto flex max-w-5xl flex-col gap-7 lg:mx-0">
          <div>
            <Link
              href="/"
              className="text-sm font-medium uppercase tracking-[0.16em] text-teal-700 hover:text-teal-900"
            >
              ← TravelClaim AI
            </Link>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-normal">
              DD Form 1351-2
            </h1>
            <p className="mt-1 text-xs font-medium text-zinc-500">Nov 2025 · Demo preview</p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Block-by-block preview of the travel voucher. Synthetic data only.
            </p>
          </div>

          {/* Traveler summary */}
          <div className="flex flex-col gap-2 border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Traveler
            </p>
            <p className="text-sm font-semibold">{traveler.name}</p>
            <p className="text-sm text-zinc-600">{traveler.grade} · {traveler.organization}</p>
            <p className="text-sm text-zinc-600">{traveler.station}</p>
            <p className="mt-1 text-xs text-zinc-500">{traveler.email}</p>
          </div>

          {/* Travel window */}
          <div className="flex flex-col gap-2 border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Travel period
            </p>
            <p className="text-sm">
              {DEMO_PHASE_2_FORM_FILL_INPUT.travelStartDate}
              {" → "}
              {DEMO_PHASE_2_FORM_FILL_INPUT.travelEndDate}
            </p>
            <p className="text-sm text-zinc-600">
              Orders: {DEMO_PHASE_2_FORM_FILL_INPUT.travelOrderNumber}
            </p>
          </div>

          <a
            className="border border-zinc-950 bg-zinc-950 px-4 py-3 text-center text-sm font-semibold text-white transition hover:border-teal-800 hover:bg-teal-800"
            href="/api/dd1351/demo-pdf"
          >
            Download demo-filled PDF
          </a>

          <div className="grid gap-2">
            <a
              className="border border-zinc-300 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:border-teal-800 hover:text-teal-800"
              href="/api/dd1351/audit"
            >
              Download audit JSON
            </a>
            <a
              className="border border-zinc-300 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:border-teal-800 hover:text-teal-800"
              href="/api/dd1351/checklist"
            >
              Download reviewer checklist
            </a>
          </div>

          {/* Review flags */}
          {blocksNeedingReview.length > 0 && (
            <div className="flex flex-col gap-2 border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                Needs review ({blocksNeedingReview.length})
              </p>
              {blocksNeedingReview.map((b) => (
                <p key={b.block} className="text-sm text-amber-800">
                  Block {b.block} — {b.title}
                </p>
              ))}
            </div>
          )}

          {/* Missing attachments */}
          {preview.missingAttachments.length > 0 && (
            <div className="flex flex-col gap-2 border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                Missing attachments
              </p>
              {preview.missingAttachments.map((label) => (
                <p key={label} className="text-sm text-red-800">
                  {label}
                </p>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs leading-5 text-zinc-400">{DD1351_FORM_FILL_DISCLAIMER}</p>
        </div>
      </aside>

      {/* Main — block list */}
      <main className="px-5 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Form blocks</h2>
            <span className="text-sm text-zinc-500">{preview.blocks.length} total</span>
          </div>

          {preview.blocks.map((block) => (
            <BlockCard key={block.block} block={block} />
          ))}
        </div>
      </main>
    </section>
  );
}

function BlockCard({ block }: { block: Dd1351BlockPreview }) {
  const values = Array.isArray(block.value) ? block.value : [block.value];

  return (
    <article
      className={`border bg-white p-4 ${
        block.needsReview ? "border-amber-300" : "border-zinc-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Block {block.block}
        </span>
        <span className="text-sm font-semibold text-zinc-800">{block.title}</span>
        {block.needsReview && (
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Needs review
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {values.map((line, i) => (
          <p key={i} className="text-sm leading-6 text-zinc-700">
            {line}
          </p>
        ))}
      </div>

      {block.note && (
        <p className="mt-3 text-xs leading-5 text-zinc-400">{block.note}</p>
      )}
    </article>
  );
}
