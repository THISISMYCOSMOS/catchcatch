import type { LegalDocument } from "@/lib/legal/documents";
import styles from "./legal-document.module.css";

type LegalBlock =
  | { kind: "heading"; level: 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; start?: number; items: string[] };

type LegalDocumentContentProps = {
  document: LegalDocument;
  className?: string;
};

export function LegalDocumentContent({ document, className }: LegalDocumentContentProps) {
  const blocks = parseMarkdown(document.markdown);

  return (
    <article className={[styles.content, className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return block.level === 3
            ? <h2 key={`${block.text}-${index}`}>{block.text}</h2>
            : <h3 key={`${block.text}-${index}`}>{block.text}</h3>;
        }

        if (block.kind === "paragraph") {
          return <p key={`${block.text}-${index}`}>{block.text}</p>;
        }

        const items = block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>);
        return block.ordered
          ? <ol start={block.start} key={`ordered-${index}`}>{items}</ol>
          : <ul key={`unordered-${index}`}>{items}</ul>;
      })}
    </article>
  );
}

function parseMarkdown(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];

  for (const sourceLine of markdown.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line) continue;

    const heading = /^(#{3,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 3 | 4, text: heading[2] });
      continue;
    }

    const orderedItem = /^(\d+)\.\s+(.+)$/.exec(line);
    if (orderedItem) {
      appendListItem(blocks, true, orderedItem[2], Number(orderedItem[1]));
      continue;
    }

    const unorderedItem = /^-\s+(.+)$/.exec(line);
    if (unorderedItem) {
      appendListItem(blocks, false, unorderedItem[1]);
      continue;
    }

    blocks.push({ kind: "paragraph", text: line });
  }

  return blocks;
}

function appendListItem(blocks: LegalBlock[], ordered: boolean, item: string, start?: number) {
  const lastBlock = blocks.at(-1);
  if (lastBlock?.kind === "list" && lastBlock.ordered === ordered) {
    lastBlock.items.push(item);
    return;
  }

  blocks.push({ kind: "list", ordered, start, items: [item] });
}
