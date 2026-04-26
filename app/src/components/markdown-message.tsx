import type { ReactNode } from "react";

// Renders the markdown subset Gemini actually emits:
// **bold**, *bullet lists, numbered lists, and paragraphs.
// No external dependency — XSS-safe (no dangerouslySetInnerHTML).

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "heading"; level: number; text: string };

function parseBlocks(markdown: string): Block[] {
  const rawBlocks = markdown.split(/\n{2,}/);
  const blocks: Block[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    const ulPattern = /^[\*\-•]\s+(.+)/;
    const olPattern = /^\d+\.\s+(.+)/;
    const headingPattern = /^(#{1,4})\s+(.+)/;

    const isUl = lines.every((l) => ulPattern.test(l.trim()));
    const isOl = lines.every((l) => olPattern.test(l.trim()));
    const headingMatch = lines.length === 1 ? headingPattern.exec(lines[0].trim()) : null;

    if (headingMatch) {
      blocks.push({ kind: "heading", level: headingMatch[1].length, text: headingMatch[2] });
    } else if (isUl) {
      blocks.push({ kind: "ul", items: lines.map((l) => (ulPattern.exec(l.trim())?.[1] ?? l.trim())) });
    } else if (isOl) {
      blocks.push({ kind: "ol", items: lines.map((l) => (olPattern.exec(l.trim())?.[1] ?? l.trim())) });
    } else {
      blocks.push({ kind: "paragraph", text: lines.join(" ") });
    }
  }

  return blocks;
}

export function MarkdownMessage({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <p key={i} className="font-semibold">
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={i} className="list-disc pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={i} className="list-decimal pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}
