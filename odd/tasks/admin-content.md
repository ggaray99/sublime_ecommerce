# Admin: category images, editable contact/pages, customers panel
Branch `feat/admin-content` (from `origin/main`). Delivery: `ask-on-risk`; QA only when the user says so, never production. Runner: `node --test` (PGlite), plus `npm.cmd run lint` and `npm.cmd run build`.

## Specs
- **S1** Category image: "cuando agrego una categoría no puedo ponerle la imagen que quiero o no puedo cambiar imagen de categoría". The create form accepts an optional image; the list flags categories without one; the stale "falta conectar Vercel Blob" copy is fixed.
- **S2** "donde cargo las políticas, contactos y redes": Ajustes edits contact data (email, phone, address, hours, Instagram, Facebook, TikTok) and the texts of Políticas, Envíos, Preguntas frecuentes and Nosotros. Empty data is not shown; pages without saved text keep the current text.
- **S3** "Panel para administrar gente que se va registrando / pedidos por usuario / resetear contraseña / etc": Admin → Clientes with search, sign-up date, order count and total; customer page with data, addresses, orders and custom requests. Password reset: pending the user's choice (admin one-time link vs. email provider). Assumption: block/unblock is part of "etc"; it waits for the same decision because it touches auth.

## Tasks
- [x] T1 · S1 · inline · e56e049
- [x] T2 · S2 · inline · e1cec34 (RED: tests/site-content.test.mjs module missing → GREEN 9/9)
- [x] T3 · S3 (list + detail, read-only) · inline · 5cb21ad (RED: tests/customers-admin.test.mjs module missing → GREEN 3/3)
- T4 · S3 (password reset, block) · blocked on the user's decision

## Log
- L1 (2026-11-10) User: "Panel para administrar gente que se va registrando / pedidos por usuario / resetear contraseña / etc // cuando agrego una categoría no puedo ponerle la imagen que quiero o no puedo cambiar imagen de categoría // donde cargo las políticas, contactos y redes"
- L2 (2026-11-10) User: "avanza con el orden propuesto, pero no subas a produccion". Order 1 → 2 → 3. The reset question (a: admin link, b: email) is still unanswered.
- L3 Finding: the image upload already exists on the category edit page (`hasMediaStorage()`), not on the create form. Contact and page texts are hardcoded in `src/data/site.ts`; only WhatsApp is editable (`src/server/settings/contact.ts`). No email provider in the project.
- L4 (2026-11-11) T1–T3 done on `feat/admin-content`, not pushed. Full suite 381/381, lint clean, `next build` OK. RDD off (clone-local). Customers list starts from `auth_users` (a customers row only exists after opening Mi cuenta); guest orders are not linked to accounts. Next: T4 waits for the reset decision; QA only when the user says so.
