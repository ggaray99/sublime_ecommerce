# AGENTS.md

## Project rules
- Keep TypeScript strict and use App Router server components by default.
- Keep user-facing copy in Spanish (Argentina) and identify demo data and unavailable features.
- Do not add payments, authentication, database access, secrets, or production deployment without explicit approval.
- Run `npm.cmd run lint` and `npm.cmd run build` before proposing delivery.
- Prefer accessible HTML, keyboard-safe controls, semantic headings, and responsive layouts.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
