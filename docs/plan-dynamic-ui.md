# Plan: Dynamic UI Generation via Component Composition

## Context
The CRM chat has 16 pre-built rich block types (stat cards, data tables, pipeline board, etc.). When a user asks for something that doesn't fit — "show me a revenue breakdown by stage", "compare these two deals side by side", "activity summary dashboard" — they only get plain text. This feature lets the LLM compose custom UIs from primitives that match the existing glass design system.

## Approach
The LLM outputs a JSON layout tree of UI primitives. A recursive `DynamicUI` React component renders the tree using the same `glass-card`, `glass-surface`, typography, and color classes as existing components. No HTML injection, no iframes — native React rendering with the app's design system.

## Data Flow
```
User message
  → POST /api/chat
  → LLM call #1: calls data tool (query_deals, get_dashboard_stats, run_custom_query)
  → Tool executor returns { richBlocks, rawData }
  → rawData fed back to LLM
  → LLM call #2: calls generate_dynamic_ui with layout tree
  → Tool executor validates layout, wraps as { type: "dynamic-ui", data: { title, layout } }
  → Rich block accumulated in allRichBlocks
  → LLM call #3: generates final text + suggested chips
  → API returns { content, richBlocks, suggestedChips }
  → Frontend: RichBlockRenderer routes "dynamic-ui" to DynamicUI component
  → DynamicUI.renderNode() recursively renders layout tree
  → User sees dashboard/comparison/visualization matching glass design system
```

## Implementation Steps

### Step 1: Types — `src/types/conversation.ts`
- Add `"dynamic-ui"` to `RichBlockType` union
- Add discriminated union `DynamicUINode` with 12 primitive types:
  - **Layout**: `grid` (1-4 cols), `stack` (h/v), `card` (glass wrapper)
  - **Content**: `heading` (h1-h3), `text` (with bold markdown), `metric` (like StatCard), `badge-group`
  - **Data viz**: `progress-bar` (colored fill), `bar-chart` (horizontal bars), `table`, `list`
  - **Utility**: `divider`
- Add `DynamicUIData = { title?, description?, layout: DynamicUINode }`

### Step 2: Component — `src/components/rich-responses/DynamicUI.tsx` (NEW)
- Recursive `renderNode(node, depth)` function, capped at depth 5
- Reuse exact CSS patterns from existing components:
  - Metric: same classes as StatCardGrid (`glass-card rounded-xl`, `text-[10px] uppercase`, `text-2xl font-bold`, TrendingUp/TrendingDown icons)
  - Table: reuse shadcn Table/TableHeader/TableBody/TableRow/TableCell
  - Card: `glass-card rounded-xl p-4`
  - Outer wrapper: `my-4 glass-card rounded-xl` with optional title header
  - Typography: `text-[13px]`, `text-muted-foreground`, `font-semibold`
- Bar chart: horizontal bars using div width percentages + color classes
- Progress bar: horizontal fill bar matching app color palette
- Grid: `grid grid-cols-{N}` with responsive fallback

### Step 3: Wire Renderer — `src/components/conversation/MessageBubble.tsx`
- Import DynamicUI and DynamicUIData
- Add case `"dynamic-ui"` to RichBlockRenderer switch
- Extract `renderMarkdownBold` to be importable (or inline simple bold parsing in DynamicUI)

### Step 4: Tool Definition — `src/lib/llm/tools.ts`
- Add `generate_dynamic_ui` tool to CRM_TOOLS array
- Parameters: title (string), description (string), layout (object)
- Tool description documents all 12 node types with their properties

### Step 5: Tool Executor — `src/lib/llm/tool-executor.ts`
- Add `execGenerateDynamicUI(args)` — validates layout has a `type` property, wraps as `"dynamic-ui"` rich block
- Add `"generate_dynamic_ui"` case to executeTool switch

### Step 6: System Prompt — `src/lib/llm/system-prompt.ts`
- Add rule: "For CUSTOM VISUALIZATIONS (comparisons, breakdowns, funnels, dashboards), FIRST fetch data with existing tools, THEN call generate_dynamic_ui with a layout tree"
- Add guidance on when NOT to use it (simple lookups, pipeline board, basic tables)

## 13 Primitives

| Primitive | Type | Properties |
|-----------|------|------------|
| heading | content | level (1-3), text |
| text | content | content (supports **bold**), muted? |
| metric | content | label, value, subtext?, trend?, trendValue? |
| badge-group | content | badges: { text, color? }[] |
| progress-bar | data viz | label, value (0-100), color?, showValue?, suffix? |
| bar-chart | data viz | title?, bars: { label, value, color? }[], maxValue? |
| chart | data viz | chartType (pie/donut/line/area/vertical-bar), data: { label, value, color? }[], title?, showLegend?, showValues? |
| table | data viz | headers: string[], rows: string[][] |
| list | data viz | items: { label, value? }[], ordered? |
| grid | layout | columns (1-4), children: DynamicUINode[] |
| stack | layout | direction (vertical/horizontal), gap? (sm/md/lg), children |
| card | layout | title?, children: DynamicUINode[] |
| divider | utility | (no properties) |

## Edge Cases

| Edge Case | Handling |
|-----------|---------|
| Invalid layout (no `type`) | Executor returns error, LLM retries |
| Unknown node type | renderNode returns null (skip) |
| Nesting > 5 levels | renderNode caps recursion, returns null |
| Empty children array | Container renders empty — harmless |
| bar-chart all zeros | Zero-width bars — empty but not broken |
| Negative bar values | Clamp to 0 |
| progress-bar > 100 or < 0 | Clamp 0-100 |
| grid columns outside 1-4 | Default to 1 |
| Long metric text | CSS truncation |
| LLM skips data fetch | System prompt says "FIRST fetch data" |

## Design System Classes (to reuse)
- StatCardGrid: `glass-card rounded-xl px-4 py-3.5`, `text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.06em]`, `text-2xl font-bold text-foreground`
- DataTable: `glass-card rounded-xl overflow-hidden`, shadcn Table components, `text-[11px] uppercase tracking-wider`, `text-[13px] py-3`
- ContactCard: `glass-card rounded-xl p-5`, `text-[13px] text-muted-foreground`
- Outer wrapper: `my-4 glass-card rounded-xl`

## Verification
1. `npm run build` passes
2. Ask "show me a revenue breakdown by stage" → dynamic UI with metrics + bar chart
3. Ask "compare the top 2 deals side by side" → 2-column grid of cards
4. Ask "show pipeline" → uses existing get_pipeline_board (not dynamic UI)
5. Visual inspection: dynamic UI matches existing component styling
