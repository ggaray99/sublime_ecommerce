# Admin Orders redesign (stage 3)

Objective: redesign the admin Orders module (list and detail) on the design system, Shopify Admin as UX reference, without new states or rule changes. Branch `feat/admin-orders` from `f37a296`. Delivery: ask-on-risk. Runner: `npm.cmd test`, `npm.cmd run lint`, `DATABASE_URL= npm.cmd run build`.

## Specs

- S1 Audit: "Analizar todas las rutas y pantallas de pedidos. Revisar el modelo de datos y los estados existentes. Identificar las transiciones permitidas. Revisar pagos, envíos, clientes y productos asociados. Documentar problemas de UX y funcionalidades existentes. Identificar qué componentes de Productos se pueden reutilizar." "No inventar estados ni modificar reglas de negocio." → `docs/admin-orders-audit.md`.
- S2 List: "Búsqueda por número de pedido y cliente. Filtros combinables. Filtros por fecha. Estado de pago. Estado de preparación. Estado de envío. Pestañas o vistas por estado cuando aporten valor. Tabla responsive. Selección múltiple. Acciones masivas. Paginación. Ordenamiento." "Resolver correctamente el comportamiento de la barra de selección compartida con Productos y Encargos."
- S3 Detail sections: "Identificación del pedido. Estado de pago. Estado de preparación. Estado de envío. Información del cliente. Productos y variantes. Cantidades y precios. Descuentos. Costos de envío. Total. Dirección de entrega o retiro. Información de pago. Timeline de actividad. Acciones disponibles." "Diferenciar claramente los estados de pago y fulfillment."
- S4 Actions: "Confirmación de pagos cuando corresponda. Actualización de preparación. Gestión de envíos. Actualización de estados. Cancelaciones. Registro de actividad." "Respetar las validaciones y transiciones existentes."
- S5 Design system: "Botones. Badges. Tablas. Filtros. Dialogs. Toasts. Formularios. Timeline." "No crear variantes visuales innecesarias."
- S6 QA: "Diferentes estados de pedido. Pagos pendientes y confirmados. Pedidos enviados y no enviados. Búsquedas y filtros. Acciones individuales y masivas. Historial. Permisos. Responsive a 1366, 1024 y 390 px." "Ejecutar lint, build y tests." "Generar capturas reales de las pantallas principales."
- S7 Restrictions: "No modificar la tienda pública. No alterar contratos de API sin justificación. No cambiar el esquema de base de datos sin necesidad. No inventar datos ni estados. No modificar reglas de negocio para resolver cuestiones visuales. Mantener compatibilidad con rutas existentes." "No comenzar Clientes hasta completar y validar Pedidos." "Documentar todos los cambios, riesgos y pendientes."
- Assumption (documented, O4): "Estado de preparación" does not exist in the model; it is not invented. The paid-not-delivered step shows as "Sin enviar"/"Para retirar".

## Tasks

- T1 S1 inline — audit `docs/admin-orders-audit.md`. Status: done.
- T2 S2,S3 inline — `src/server/orders/status-view.ts` payment/delivery views and filters over the single status. RED (module missing) → GREEN 4/4. Status: done.
- T3 S2,S5 delegated (writer A, parallel with T4) — list: search, filters, dates, sort, pagination, tabs, responsive table, bulk "Marcar entregado", shared SelectionBar fix (O11). RED (modules missing) → GREEN 17/17. Status: done (browser QA in T5).
- T4 S3,S4,S5 delegated (writer B, parallel with T3) — detail page, Timeline component, payments card, per-action dialogs. RED (module missing) → GREEN 11/11. Commit 1232809. Status: done (browser QA in T5).
- T5 S6,S7 inline — QA on staging, screenshots, delivery doc `docs/admin-orders-redesign.md`. Status: done (see L4).

## Log

- L1 (2026-11-27) User pasted the stage-3 brief: "Iniciamos el siguiente módulo: PEDIDOS." (full brief: audit, list, detail, actions, design system, QA, restrictions; "No comenzar Clientes hasta completar y validar Pedidos.").
- L2 Audit by a read-only explorer + staging screenshots; O1–O13 and three rule findings left for the user (coupon use not returned on cancel, needs_review dead end, no Actividad entries). Route: T3 and T4 independent with disjoint surfaces → two writers in parallel. Decisions: payment/delivery are derived display views; only bulk "Marcar entregado"; no new states.
- L3 (2026-11-27) Writers returned. A: searchOrders/countToDeliver (read-only), order-search.ts, tabs Todos/Por cobrar/Sin enviar/Para retirar/En revisión, ?estado= kept with an "Estado: X · Quitar" line, bulk fulfillOrders over markFulfilled, SelectionBar always rendered at fixed height with idleHint (shared), export button on the design-system Button. B: two-column detail, Mercado Pago payments read-only (payments-view.ts), Timeline in ui, per-action dialogs keeping orderAction fields (actions.ts unchanged). Dates apply with Buscar/Enter (auto-submit would fire while typing). Combined: 737/737, tsc, lint 0, build green.
- L4 (2026-11-27) User: "dale, subilo a QA y validalo con Chrome". QA fc51c99. Created SUB-1011 (shipping, transfer) and SUB-1012 (pickup) in the staging store with test data; confirmed payment, shipped (validation checked), cancelled, bulk-delivered SUB-1011+SUB-1010 (SUB-1009 skipped). Search/filters/dates/sort/?estado= OK. Selection bar: Pedidos and Encargos 0 px shift; Productos 4 px when its hint shows → fixed (count line-height and actions min-height 32px). 1366 screenshots; 1024 via zoom; 390 via popup script. SUB-1006 untouched.
