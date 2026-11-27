# Admin Customers redesign (stage 4)

Objective: redesign the admin Customers module (list and profile) on the design system, Shopify Admin as UX reference, with only reliable metrics and no change to customer identity or relations. Branch `feat/admin-customers` from `af142c4` (after the order rules, `c8d55a8`). Delivery: ask-on-risk. Runner: `npm.cmd test`, `npm.cmd run lint`, `DATABASE_URL= npm.cmd run build`.

## Specs

- S1 Audit: "Realizar una auditoría previa del módulo y diseñar una experiencia integral inspirada en Shopify Admin." → `docs/admin-customers-audit.md` (C1–C11).
- S2 List: "Nombre. Email. Teléfono. Cantidad de pedidos. Total comprado, si existe información confiable. Fecha de registro. Búsqueda y filtros. Ordenamiento y paginación."
- S3 Profile: "Información personal. Datos de contacto. Direcciones. Historial de pedidos. Encargos de Custom Lab asociados. Actividad relevante. Métricas disponibles."
- S4 Experience: "Navegación rápida entre clientes y pedidos. Estados vacíos. Acciones contextuales. Formularios consistentes. Responsive. Reutilización del Design System y de los componentes de Productos y Pedidos."
- S5 Restrictions: "No duplicar clientes. No alterar relaciones existentes. No inventar métricas. No modificar esquemas de base de datos sin justificación. Mantener permisos y validaciones. No afectar la tienda pública."
- S6 QA: "Validar búsquedas, filtros, perfiles, relaciones con pedidos, encargos y permisos." "Probar 1366, 1024 y 390 px." "Ejecutar lint, build y tests." "Generar capturas reales y documentar auditoría, implementación, resultados y pendientes."
- S7 "No comenzar Inventario ni Custom Lab hasta completar esta etapa."
- Decisions (from the audit): ownership stays `customer_id`; guest records with the same email are shown apart and never counted; "Total pagado" = paid + shipped + fulfilled, computed like `orderTotalMinor`; `needs_review` shown as a separate count; the canonical profile URL is the auth user id (`customers.id` links keep working by redirect); no admin edit actions (would need a `customer` audit entity = migration).

## Tasks

- T0 inline — order business rules 1 and 3 (`docs/admin-orders-rules.md`): 3ed6d2c, 6cedd11, c8d55a8; independent verifier PASS. Status: done, on QA.
- T1 S1 inline — audit `docs/admin-customers-audit.md` (0008066). Status: done.
- T2 S2,S4,S5 delegated (writer A, parallel with T3) — list. RED (module missing) → GREEN 12/12. Commit 2397d82. Status: done (browser QA in T4).
- T3 S3,S4,S5 delegated (writer B, parallel with T2) — profile. RED (modules missing) → GREEN 9/9. Commit 74ab008. Status: done (browser QA in T4).
- T4 S6 inline — QA on staging, screenshots, delivery doc `docs/admin-customers-redesign.md`. Status: done (see L5).

## Log

- L1 (2026-11-27) User pasted the stage-4 brief: "Antes de comenzar Clientes, documentá estas decisiones de negocio" (three order rules) and "SIGUIENTE ETAPA: CLIENTES" (full brief above). L1b: "dale, implementalas ahora antes de Clientes". L1c: "subilo a qa y segui con lo otro".
- L2 Audit by a read-only explorer; C1–C11. Route: T2 and T3 independent with disjoint surfaces (list queries stay in src/server/customers/admin.ts; profile queries in a new src/server/customers/profile.ts) → two writers in parallel.
- L3 (2026-11-27) QA c8d55a8: Actividad shows order events (SUB-1011 Pendiente → Pago confirmado → Enviado → Entregado, SUB-1012 cancelled) with links and humanized actors; "Ver anteriores" pages 50 + 50 with the new cursor, no overlap. Pre-existing: Actividad shows UTC times while orders show Argentina time (pending).
- L4 (2026-11-27) Writers returned. A: read-only search() in admin.ts (list/count/get unchanged), customer-search.ts, filters Mostrar/Alta desde-hasta/Ordenar, 50 per page, count = matches. B: canonical redirect to auth user id, metrics from spentMinor + review count (profile.ts reviewOrderCount), orders with status-view badges, encargos with typed contact + Contacto distinto, Timeline of order and encargo events, guest matches by email apart. Combined: 772/772, tsc, lint 0, build green.
- L5 (2026-11-27) User: "dale, subilo a QA y validalo con Chrome". QA b8149a7: list search/filters/sorts/dates/count OK; profile metrics ($5.600 = SUB-1010 + SUB-1011), ENC-5002/5003 show Contacto distinto (typed contact facundo, owned by Administrador), redirect from order link to canonical profile, empty states, 1024 zoom screenshots, 390 popup no overflow. Guest matches not visible on staging (no data); covered by tests.
