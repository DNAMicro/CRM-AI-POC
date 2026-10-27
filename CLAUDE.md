# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server (Next.js 16, localhost:3000)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run db:seed` — seed the SQLite database via `npx tsx scripts/seed.ts`

## Environment

Requires `OPENROUTER_API_KEY` in `.env.local`. Optional `OPENROUTER_MODEL` (defaults to `google/gemini-3.1-flash-lite-preview`). The LLM is accessed via OpenAI-compatible client pointed at OpenRouter.

## Architecture

This is a conversational CRM app — a chat interface where an LLM assistant answers questions about contacts, deals, and activities using tool calls against a local SQLite database.

### Data layer
- **SQLite via better-sqlite3** (`src/lib/db.ts`) — single file at `data/crm.db`, auto-creates schema and seeds on first access. Configured as `serverExternalPackages` in next.config.ts.
- Three tables: `contacts`, `deals`, `activities` with foreign keys between them.
- Static seed data lives in `src/data/` (contacts, deals, activities).

### LLM tool-calling pipeline
1. `src/app/api/chat/route.ts` — POST endpoint, runs an OpenAI-compatible tool-calling loop (max 5 iterations).
2. `src/lib/llm/tools.ts` — defines CRM_TOOLS as OpenAI function-calling schema (dashboard stats, query contacts/deals, pipeline board, custom SQL, inline forms).
3. `src/lib/llm/tool-executor.ts` — executes tool calls server-side, returns `{ richBlocks, rawData }`. Rich blocks drive the UI components.
4. `src/lib/llm/system-prompt.ts` — system prompt with CRM context rules and suggested-chips JSON format.

### Frontend
- Single-page app: `page.tsx` renders `AppShell` which provides conversation + detail panel contexts.
- **State management**: React Context + `useReducer` pattern, split into state/actions contexts (`useConversation`, `useDetailPanel`).
- **Layout**: three-column — `LeftSidebar` | `ConversationPanel` | `RightDetailPanel`.
- **Rich response components** (`src/components/rich-responses/`): StatCardGrid, DataTable, PipelineBoard, ActivityTimeline, ContactCard, DealSummary, ActionButtons, InlineForm. Each renders a specific `RichBlock` type.
- **UI primitives** (`src/components/ui/`): shadcn/ui components using class-variance-authority, tailwind-merge, and @base-ui/react.

### API routes
- `POST /api/chat` — LLM conversation with tool calling
- `GET /api/stats` — dashboard statistics (used for greeting)
- `GET/POST /api/contacts`, `GET /api/contacts/[id]` — contact CRUD
- `GET/POST /api/deals`, `GET /api/deals/[id]` — deal CRUD
- `GET /api/activities` — activity list

### Key types
- `src/types/crm.ts` — Contact, Deal, Activity, PipelineStage
- `src/types/conversation.ts` — Message, RichBlock, RichBlockType, ChipAction, CRMContext, form-related types
