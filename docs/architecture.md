# Architecture

## Baseline
- Next.js App Router with TypeScript strict mode and Tailwind CSS v4.
- A server-rendered landing page in `src/app/page.tsx`; no client state is needed while the controls are disabled.
- Each static information route lives in its own App Router segment.
- CSS visuals are local and code-native, avoiding remote image dependencies during this prototype.

## Boundaries for future work
Introduce `src/features/<feature>` modules for catalog, cart, quotes and editor. Keep external systems behind adapters (payments, storage, fulfillment and CRM). Do not couple UI sections to provider SDKs.

## Quality
ESLint and Next's production build are the baseline gates. Add unit tests around pricing, cart and quote domain logic when those use cases exist; add end-to-end flows only after interactions are enabled.
