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
- T3 S2,S5 delegated (writer A, parallel with T4) — list: search, filters, dates, sort, pagination, tabs, responsive table, bulk "Marcar entregado", shared SelectionBar fix (O11). Status: pending.
- T4 S3,S4,S5 delegated (writer B, parallel with T3) — detail page, Timeline component, payments card, per-action dialogs. Status: pending.
- T5 S6,S7 inline — QA on staging, screenshots, delivery doc. Status: pending.

## Log

- L1 (2026-11-27) User pasted the stage-3 brief: "Iniciamos el siguiente módulo: PEDIDOS." (full brief: audit, list, detail, actions, design system, QA, restrictions; "No comenzar Clientes hasta completar y validar Pedidos.").
- L2 Audit by a read-only explorer + staging screenshots; O1–O13 and three rule findings left for the user (coupon use not returned on cancel, needs_review dead end, no Actividad entries). Route: T3 and T4 independent with disjoint surfaces → two writers in parallel. Decisions: payment/delivery are derived display views; only bulk "Marcar entregado"; no new states.
