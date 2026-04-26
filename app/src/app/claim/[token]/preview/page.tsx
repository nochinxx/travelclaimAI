import { getClaimByToken } from "@/lib/travelclaim/claims-client";
import { mergeClaimToFormInput } from "@/lib/travelclaim/claim-types";
import { buildDd1351FormFillPreview } from "@/lib/travelclaim/dd1351FormFilling";
import { buildDd1351ValidationFindings } from "@/lib/travelclaim/dd1351ExportPacket";
import type { Dd1351BlockPreview } from "@/lib/travelclaim/dd1351FormFilling";
import type { Dd1351ValidationFinding } from "@/lib/travelclaim/dd1351ExportPacket";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClaimPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claim = await getClaimByToken(token).catch(() => null);

  if (!claim || !claim.authData) notFound();

  const formInput = mergeClaimToFormInput(claim.authData, claim.soldierData);
  const preview = buildDd1351FormFillPreview(formInput);
  const findings = buildDd1351ValidationFindings(formInput);

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const blocksNeedingReview = preview.blocks.filter((b) => b.needsReview);

  return (
    <section className="grid min-h-screen bg-stone-50 text-zinc-950 lg:grid-cols-[320px_1fr]">
      {/* Sidebar */}
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

          {/* Traveler */}
          <div className="flex flex-col gap-1.5 border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Traveler</p>
            <p className="text-sm font-semibold">{formInput.traveler.name}</p>
            <p className="text-sm text-zinc-600">{formInput.traveler.grade} · {formInput.traveler.organization}</p>
            <p className="text-sm text-zinc-600">{formInput.traveler.station}</p>
          </div>

          {/* Trip */}
          <div className="flex flex-col gap-1.5 border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Trip</p>
            <p className="text-sm">{formInput.travelStartDate} → {formInput.travelEndDate}</p>
            <p className="text-sm text-zinc-600">Orders: {formInput.travelOrderNumber}</p>
          </div>

          {/* Validation summary */}
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

          {/* Missing attachments */}
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

          {/* Needs review */}
          {blocksNeedingReview.length > 0 && (
            <div className="flex flex-col gap-2 border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                Needs review ({blocksNeedingReview.length})
              </p>
              {blocksNeedingReview.map((b) => (
                <p key={b.block} className="text-sm text-amber-800">Block {b.block} — {b.title}</p>
              ))}
            </div>
          )}

          <p className="text-xs leading-5 text-zinc-400">{preview.disclaimer}</p>
        </div>
      </aside>

      {/* Blocks */}
      <main className="px-5 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
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

function BlockCard({ block }: Readonly<{ block: Dd1351BlockPreview }>) {
  const values = Array.isArray(block.value) ? block.value : [block.value];
  return (
    <article className={`border bg-white p-4 ${block.needsReview ? "border-amber-300" : "border-zinc-200"}`}>
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
          <p key={i} className="text-sm leading-6 text-zinc-700">{line}</p>
        ))}
      </div>
      {block.note && <p className="mt-3 text-xs leading-5 text-zinc-400">{block.note}</p>}
    </article>
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
      {findings.map((f) => (
        <p key={f.code} className={`text-sm ${styles.text}`}>
          Block {f.relatedBlock} — {f.message}
        </p>
      ))}
    </div>
  );
}
