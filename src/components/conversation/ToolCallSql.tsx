import type { DebugToolCall } from "@/types/conversation";

function hasParams(params: unknown[] | Record<string, unknown>): boolean {
  return Array.isArray(params) ? params.length > 0 : Object.keys(params).length > 0;
}

/** SQL statements a tool ran, shown under it in the tool-call debug panel. */
export function ToolCallSql({ toolCall }: { toolCall: DebugToolCall }) {
  const queries = toolCall.sql ?? [];
  if (queries.length === 0 && !toolCall.sqlOmitted) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {queries.map((q, i) => (
        <div key={i} className="rounded-md bg-background/60 border border-border/40 px-2.5 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">SQL</div>
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-all text-foreground/80">{q.sql}</pre>
          {hasParams(q.params) && (
            <pre className="mt-1 text-[10px] leading-relaxed whitespace-pre-wrap break-all text-indigo-600 dark:text-indigo-400">
              {JSON.stringify(q.params)}
            </pre>
          )}
        </div>
      ))}
      {toolCall.sqlOmitted ? (
        <div className="text-[10px] text-muted-foreground/60">
          + {toolCall.sqlOmitted} more {toolCall.sqlOmitted === 1 ? "query" : "queries"} not shown
        </div>
      ) : null}
    </div>
  );
}
