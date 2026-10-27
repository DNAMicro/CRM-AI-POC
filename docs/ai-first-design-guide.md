# AI-First Application Design Guide

> **Purpose of this document.** This is a pattern guide for building *AI-first* applications, written to be handed to a planning or coding agent at the start of a project. It describes **how an AI-first app should think and behave** — the interaction model, the response architecture, and the safety rails.
>
> These are **general guidelines**, independent of any particular domain or tech stack. Apply them to whatever you are building. Where an example is given, it is illustrative only — translate it into your own domain's nouns and verbs. The value here is the *architecture and interaction model*, not any specific feature set.

---

## 1. The thesis: conversation is the primary interface

A traditional application is a tree of screens. The user learns where things live — a page for creating records, a page for filtering them, a page for reports, a settings panel — and navigates that tree by hand. The UI is a fixed map the user must memorize.

An **AI-first application inverts this**. The primary surface is a single conversation. The user states intent in natural language ("show me what needs attention today", "draft a reply to this", "how has this trended over the quarter?") and the system:

1. Figures out what data or action that intent requires,
2. Performs it through well-defined tools,
3. Renders a **purpose-built, rich UI response** inline in the conversation,
4. Suggests natural next steps.

The interface is **generated per-intent** rather than pre-built per-screen. The user never has to know where a feature "lives" — they ask, and the right view materializes.

### The litmus test for every feature

> *"Can the user accomplish this entirely through conversation?"*

If yes, the conversational path is the **primary** implementation. A dedicated page or screen is the **exception**, justified only when direct manipulation is genuinely faster than describing the intent (e.g. drag-and-drop reordering, a freeform canvas, a complex multi-field form the user wants to scan all at once). Default to conversation; reach for bespoke screens reluctantly.

This is the single most important idea in the document. Everything else is mechanics in service of it.

---

## 2. The response is a dual (really, triple) channel

A naive chatbot returns text. An AI-first app returns **three coordinated channels** in every assistant turn:

| Channel | Role | Rule of thumb |
|---|---|---|
| **Text** | Narration & context | 1–3 sentences. Frames the data; never *repeats* what the UI already shows. |
| **Rich UI blocks** | The heavy lifting | Structured, interactive components that present the actual data/result. |
| **Suggested next-actions** | Forward momentum | 2–4 tappable chips offering natural follow-ups. |

The text gives a one-line framing with the key figure in bold. The rich block is the sortable table or chart that lets the user actually explore the underlying data. The chips offer the likely follow-ups in context.

**Design implication:** the model's job is not to *describe* data in prose — it is to *fetch* data and *choose how to render it*. Keep prose lean. Let components carry the information density. A wall of text is an AI-first failure mode.

### How the channels are assembled (reference mechanics)

A robust way to assemble these channels is a **tool-calling loop** behind a single endpoint:

- The model is called with the system prompt, trimmed conversation history, and the user message.
- While the model returns tool calls (capped at a small number of iterations to bound cost/latency), each tool is executed server-side. Every tool returns **two things**: `rawData` (fed back to the model so it can reason about results) and `richBlocks` (accumulated to render in the UI).
- When the model finally returns prose instead of tool calls, that text is the narration channel.
- The suggested next-actions are emitted by the model as a structured block (e.g. a fenced JSON array) at the end of its text, then parsed out and stripped from the displayed text. A defaulting layer supplies generic suggestions if the model omits them.

The key architectural insight: **tools return data for the model AND presentation for the user, in one pass.** The model orchestrates; it does not hand-author markup.

---

## 3. Tools are the only way to touch the world

The model never invents facts and never mutates state directly. Every read and every write goes through an explicitly defined **tool** (a.k.a. function call) with a typed schema. This gives you grounding, auditability, and safety rails for free.

Principles:

- **Never fabricate.** The system prompt must forbid inventing numbers, names, or results. If the model needs data, it calls a tool. If a tool returns nothing, the honest answer is "nothing found", not a plausible guess.
- **One tool per coherent capability.** Name tools by *user intent*, not by database operation — e.g. "get an overview", "query records with filters", "get one record's full detail", "render a grouped board", "run a constrained custom query", "prepare a form", "perform an outward action".
- **Provide an escape hatch.** A single constrained "run a custom read query" tool (with a strict allow-list — read-only, no writes, no schema changes) lets the model answer the long tail of questions you didn't anticipate, without you predefining a tool for every possible slice. This is what keeps an AI-first app from feeling brittle.
- **Look things up before acting.** When the user references an entity by name, the model must first resolve that name to an ID via a query tool, *then* act. Bake this ordering into the system prompt.

---

## 4. Two tiers of generated UI

This is the crux of *how* rich responses get built. There are two complementary mechanisms, and a good AI-first app uses both.

### Tier 1 — Curated components (for the common, recurring views)

For the handful of views that appear constantly in your domain, build **typed, first-class components** with their own data contracts. Examples of generally useful ones: a stat/metric grid, a sortable data table, a status board, a detail card, a timeline, a compose-and-review surface, and an inline form. Each corresponds to a known block type with a strict schema.

Use Tier 1 when:
- The view is high-traffic and deserves polish and interaction (sorting, clicking a row to open a detail panel, submitting a form).
- The interaction is non-trivial (forms that persist data, editors, boards with drag).

### Tier 2 — Generative composable UI (for everything else)

You cannot — and should not — predefine a component for every possible visualization a user might ask for. So provide a **constrained, composable layout-tree** that the model can assemble freely. The model emits a JSON tree of **primitive nodes**, and a single renderer walks the tree and draws it.

A good primitive vocabulary to adapt:

- **Layout primitives:** `grid` (1–4 columns), `stack` (horizontal/vertical), `card`, `divider`.
- **Text primitives:** `heading`, `text` (with inline emphasis), `key-value` pairs, `list`, `callout` (info/warning/success/error).
- **Data-viz primitives:** `metric` (big number + trend), `stat-row`, `progress-bar`, `badge-group`, `table`, `bar-chart`, a `chart` node supporting pie / donut / line / area / vertical-bar, and `timeline`.

The model fetches real data with a Tier-1 tool, then calls a single "generate UI" tool, passing a layout tree whose nodes contain the **actual data values**. The renderer recursively draws nodes, with a **depth cap** (e.g. max nesting of 5) so a malformed or adversarial tree can't blow up the UI.

> **This is the heart of AI-first richness.** The richer your primitive vocabulary, the more the model can build *without you writing new code*. When a new need arises ("show me a funnel", "compare these side by side", "a dashboard of three charts"), the answer is usually a new *primitive node type*, not a new bespoke component. **Prefer extending the primitive vocabulary over creating one-off components.** Reports, analytics, comparisons, and ad-hoc dashboards should compose primitives, not ship as hardcoded screens.

### Choosing a tier

- Simple lookups and the core recurring views → **Tier 1** (curated).
- Novel visualizations, analytics, comparisons, anything you didn't anticipate → **Tier 2** (generative).
- The system prompt should tell the model exactly when to use each, with concrete examples, so it doesn't reach for the generative path on a simple table or vice versa.

---

## 5. Forms and actions live inside the conversation

AI-first does not mean "no forms" — it means forms **come to the user inside the conversation**, pre-filled, instead of the user navigating to a form page.

### The prepare-form pattern (for creating/editing)

When the user expresses intent to add or change data, the model:

1. Extracts every value it can from the natural-language message.
2. Resolves any referenced entities to IDs (querying first if needed).
3. Calls a "prepare form" tool that emits an **inline form block**, pre-filled with the extracted values.
4. The form renders in the conversation; the user reviews, tweaks, and submits. Submission hits a normal API endpoint.

The user did the thinking in one sentence; the system did the data entry. The form exists for *review and correction*, not blank data entry.

### The review-before-action pattern (for outward or destructive actions)

For anything that **leaves the system or is hard to undo** — sending a message, deleting a record, making an external API call — the model must **never auto-execute**. Instead:

- It composes the full artifact (e.g. writes a complete, polished message body — not a stub, not a restatement of the request) and presents it in a **review surface**.
- The user reads it and explicitly confirms/sends.
- For deletions, the model asks for confirmation and waits for an affirmative reply before calling the tool.

> This is both a safety property and a trust property. The user stays in control of every consequential action. Encode it as a hard rule in the system prompt, not a soft suggestion.

---

## 6. The system prompt is the product's behavior spec

In an AI-first app, a large share of "the product" lives in the system prompt. It is where you encode:

- **Grounding rules** — always use tools, never fabricate.
- **Tone & verbosity** — concise text, let components do the work, emphasize key figures.
- **Tool-routing guidance** — which tool for which intent, with examples ("when the user asks for a chart, fetch data then call the generate-UI tool with a chart node containing real values").
- **Action discipline** — look up IDs before acting; review before send; confirm before delete.
- **Domain facts** — today's date, enum values, ordering of states, units.
- **The next-actions contract** — the exact format for emitting suggestions.

Treat the system prompt as versioned, reviewable source. When behavior is wrong, the fix is often a prompt change, not a code change. Keep it specific and example-driven; vague instructions produce vague behavior.

---

## 7. Suggested next-actions keep the conversation moving

After every response, the model proposes 2–4 **chips** — short, tappable suggestions for what the user might want next, chosen contextually from a known vocabulary of intents. Clicking a chip is equivalent to typing that intent.

Why this matters: a blank conversation prompt is intimidating and gives no sense of what's possible. Chips are **conversational affordances** — they teach the user what the system can do, in context, without a menu. They are the AI-first replacement for navigation.

Implementation notes: chips have a stable `intent` identifier (and optional params like an entity ID), so the front end can map a tap to a concrete query. The model emits them in a structured block; a defaulting layer ensures there are always *some* chips even if the model forgets.

---

## 8. Supporting structure (the parts that aren't the conversation)

A few non-conversational pieces are legitimate and necessary:

- **A detail panel / inspector.** Clicking an entity (a table row, a card) can open a side panel with full detail. This is direct manipulation layered *on top of* conversational results — complementary, not a replacement.
- **Persistent navigation for genuinely separate modes.** Things like an inbox, a settings page for credentials/integrations, or a billing screen are reasonable as dedicated surfaces. The test from §1 still applies: only build the screen if conversation genuinely can't serve it.
- **Live ambient signals.** Badges (unread counts, items needing attention) and periodic polling keep the shell feeling alive without the user asking.
- **Context carry-over.** Pass a compact "current context" (e.g. selected entity, active filter) and trimmed recent history to the model so follow-ups like "now show me just the active ones" resolve correctly. Trim and truncate history to control token cost.

---

## 9. Safety, grounding, and cost rails (don't skip these)

AI-first apps fail in characteristic ways. Build these guards in from the start:

- **Bounded tool loops.** Cap the model's tool-calling iterations per turn so it can't loop forever.
- **Read/write separation on the escape-hatch tool.** The free-form query tool must be read-only via an allow/deny list (no writes, no schema changes, no destructive verbs).
- **Render depth caps & null-tolerance.** The generative renderer must cap nesting and gracefully ignore malformed nodes — the model *will* occasionally emit a bad tree.
- **No fabrication, enforced by prompt and by design.** If data isn't from a tool, it doesn't get stated as fact.
- **Human-in-the-loop for consequences.** Review-before-send and confirm-before-delete (see §5).
- **Graceful degradation.** If the model is misconfigured or errors, return a useful message and default suggestions, never a blank screen.

---

## 10. A checklist for "is this design AI-first?"

When planning a feature, verify:

- [ ] The primary path is conversational; any dedicated screen is justified by the §1 test.
- [ ] Every data read/write goes through a typed tool; nothing is fabricated.
- [ ] The response uses the right tier: curated component for core views, generative primitives for novel ones — and we extended the primitive vocabulary rather than hardcoding a new screen where possible.
- [ ] Text narration is concise; components carry the information density.
- [ ] Creating/editing happens via pre-filled inline forms, not blank form pages.
- [ ] Outward/destructive actions are reviewed and confirmed, never auto-executed.
- [ ] The turn ends with 2–4 contextual next-action suggestions.
- [ ] Loop limits, read-only query enforcement, and render depth caps are in place.
- [ ] New behavior was achieved by editing the system prompt and/or adding a primitive, before resorting to new bespoke UI code.

---

### One-paragraph summary to anchor on

> Build the app so the user *talks to it* instead of *navigating it*. Every turn, the model interprets intent, fetches data and performs actions exclusively through typed tools (never fabricating), and answers with a concise sentence plus a rich, purpose-built UI block — drawn either from a small set of polished curated components or composed on the fly from a rich vocabulary of layout/data-viz primitives — and finishes by suggesting the next few natural actions. Creating data happens through pre-filled inline forms; consequential actions are always reviewed and confirmed. The richer your primitive vocabulary and the sharper your system prompt, the more the app can do without new code. The conversation is the product; dedicated screens are the rare exception.
</content>
</invoke>
