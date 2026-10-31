Objective: online payments with Mercado Pago (Checkout Pro) and one-click account linking (OAuth) from Admin → Integraciones. Test mode first.
Branch: feat/mercadopago (from feat/vps-self-hosting @ cdea515) · Delivery: ask-on-risk (chain strategy asked before opening PRs) · Runner: `npm.cmd test` (node --test + PGlite), `npm.cmd run lint`, `npm.cmd run build`.

## Specs

- **S1 — Connect from the admin.** "que el usuario vea en el admin una pantalla "integraciones" y que de a "conectar mercado pago" y pueda conectarse con la cuenta desde la que va a cobrar". Owner-only. OAuth authorization_code flow (`https://auth.mercadopago.com/authorization`, `POST https://api.mercadopago.com/oauth/token`) with `state` (CSRF) and PKCE S256. The screen shows the connected account and a "Desconectar" action. Connect/disconnect are written to `audit_logs` (entity `integration`).
- **S2 — "necesito que sea facil de usar".** The owner never copies keys. Errors (denied authorization, expired state, MP down) show a clear Spanish message on the Integraciones page.
- **S3 — Secrets at rest.** Access and refresh tokens are stored encrypted (AES-256-GCM, key from env), never logged or sent to the browser. Tokens are refreshed before expiry; MP rotates the refresh token on every refresh, so the new one is always saved.
- **S4 — "la idea es cobrar con mercado pago".** Checkout Pro: on a `pending_payment` order the customer sees "Pagar con Mercado Pago"; the server creates a preference with the seller token (`external_reference` = order id, `notification_url`, `back_urls` to the order page, `auto_return: approved`, expiry = stock reservation end) and redirects to `init_point`. Card data never touches Sublime. Shown only when MP is connected, payments are enabled and the order did not choose transfer.
- **S5 — Webhook.** `POST /api/mercadopago/webhook` validates `x-signature` (HMAC-SHA256 hex over `id:{data.id};request-id:{x-request-id};ts:{ts};` with the app's webhook secret), fetches the payment from MP, checks order, amount and currency, and on `approved` calls the existing `confirmPayment` (actor `mercadopago`). Acceptance (auditoría v1.1): "aprobado, rechazado, duplicado, inválido, tardío y pendiente" all handled. Answers 200 for handled/duplicate/ignored, 401 for bad signature, 5xx on transient errors so MP retries.
- **S6 — Environment gating.** Works where configured (MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, MERCADOPAGO_WEBHOOK_SECRET, PAYMENTS_ENCRYPTION_KEY); production also needs `SUBLIME_PAYMENTS_IN_PRODUCTION=enabled`. Without config the admin explains what is missing and checkout keeps the current manual flow. MP routes stay reachable during maintenance (proxy).
- **S7 — Docs.** Setup steps (create the MP application, redirect URL, webhook URL + secret, test users, PKCE), env vars, and test-mode → live checklist.

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S3, S6 | inline | pending | |
| T2 | S1, S2, S3, S6 | inline | pending | |
| T3 | S4 | inline | pending | |
| T4 | S5 | inline | pending | |
| T5 | S7 | inline | pending | |

T1 config + encryption helper · T2 migration, account repository, OAuth routes, admin UI · T3 preference + pay button · T4 webhook + payment records · T5 docs.
Route evidence: no Writer trigger (units depend on each other; no parallelism); all inline. Risk: items 2 (credentials) and 1 (payment state) → independent verifier at feature end.

## Log

- **L1 (2026-10-31, user):** "bien chat, necesitamos ahora terminar el ecommerce, la idea es cobrar con mercado pago, podria conectarte al mcp de mercado pago y que crees la integracion? necesito que sea facil de usar, que el usuario vea en el admin una pantalla "integraciones" y que de a "conectar mercado pago" y pueda conectarse con la cuenta desde la que va a cobrar, se puede eso?"
- **L2 (user):** "pero el dueño de sublime, tendra que darme client_id y client_secret para conectarse? o no es necesario?" → answered: the app credentials belong to the integrator; the owner only authorizes. Recommended creating the app on the developer's account for testing, decide before launch.
- **L3 (user):** "dale avancemos" — explicit approval for payments (AGENTS.md / pendientes 5.1), test mode first.
- **L4:** Mapping (explorer): `confirmPayment` (src/server/orders/repository.ts:395) handles pending/expired/needs_review; no encryption helper; proxy OPEN_DURING_MAINTENANCE lacks `/api/mercadopago`; next migration 0019; tests use PGlite + migrations.
- **L5:** MCP of Mercado Pago is beta and only documents `search_documentation`; not needed. Docs verified: auth code 10 min, access token 180 days, refresh rotates refresh token, webhook HMAC-SHA256 manifest above, `test_token: "true"` yields sandbox credentials.
