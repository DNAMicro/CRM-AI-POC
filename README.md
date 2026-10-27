# CRM AI — Conversational CRM (Proof of Concept)

A CRM you talk to. Ask questions in plain English ("which deals close this month?", "log a call with Rachel") and an LLM answers by calling tools against a local SQLite database, rendering the results as interactive cards, tables, pipeline boards and forms instead of plain text.

Built with Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui and better-sqlite3. LLM access goes through [OpenRouter](https://openrouter.ai) using the OpenAI-compatible SDK, so any OpenRouter model can be used.

## Features

- **Chat-first interface:** a tool-calling loop (`/api/chat`) lets the model query contacts, deals, activities and tasks, run read queries, and fill inline forms.
- **Rich responses:** stat cards, data tables, a pipeline board, activity timelines, contact and deal cards, and action buttons, all rendered from structured "rich blocks".
- **Debug panel:** every tool call shows the SQL it ran, with parameters.
- **Tasks and follow-ups:** due reminders and contacts that need a follow-up.
- **Files:** upload attachments, import contacts from CSV, export to CSV.
- **Optional integrations:** Gmail and Office 365 (OAuth email sync and send) and Twilio SMS. The app runs fine without any of them.

## Quick start

Requires **Node.js 22+**.

```bash
git clone git@github.com:DNAMicro/CRM-AI-POC.git
cd CRM-AI-POC
npm install
cp .env.example .env.local     # then set OPENROUTER_API_KEY
npm run dev
```

Open <http://localhost:5555>.

## Demo data

The repo ships a ready-made demo database, `data/demo.db`, with fictional data: 15 contacts, 15 deals and 20 activities. On first start the app copies it to `data/crm.db`, which is your working database and is git-ignored, so your changes never touch the demo copy or end up in a commit.

To reset to the demo data, stop the server and delete the working database:

```bash
rm data/crm.db*
```

`npm run db:seed` rebuilds `data/crm.db` from the static seed data in `src/data/` instead.

## Configuration

All settings live in `.env.local` (git-ignored). See [`.env.example`](.env.example) for the full list.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | LLM access |
| `OPENROUTER_MODEL` | no | Model id, default `google/gemini-3.1-flash-lite-preview` |
| `ENCRYPTION_SECRET` | no | Encrypts stored OAuth and Twilio tokens; if unset, a random key is written to `.encryption-key` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Gmail integration |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` | no | Office 365 integration |

Twilio credentials are entered on the in-app **Settings** page and stored encrypted in the local database.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server on port 5555, listening on all interfaces |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run db:seed` | Recreate `data/crm.db` from seed data |

## Project layout

```
src/app/            pages and API routes (chat, contacts, deals, tasks, gmail, sms, ...)
src/lib/db.ts       SQLite schema, demo-DB bootstrap, queries
src/lib/llm/        tool definitions, tool executor, system prompt
src/components/     chat UI, rich-response components, shadcn/ui primitives
src/data/           static seed data
data/demo.db        committed demo database
```

## Security notes

This is a **proof of concept for local use**. It is not hardened for deployment:

- **No authentication.** Anyone who can reach the server can read and change CRM data and, if connected, send email and SMS. `npm run dev` listens on `0.0.0.0`, so it is reachable from your local network; bind to `localhost` or put it behind auth before exposing it.
- The Gmail and Office 365 OAuth callbacks don't verify the OAuth `state` parameter, and the Twilio webhook doesn't verify request signatures.
- Secrets belong in `.env.local`. `.env*` (except `.env.example`), `.encryption-key`, the working database and uploads are all git-ignored. Don't commit them.
