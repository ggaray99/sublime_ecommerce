# Admin Inventory redesign (stage 5)

Objective: an inventory control center (summary, variant list, movements, detail, adjustments) on the design system, without new inventory rules. Branch `feat/admin-inventory` from `f6f9e04`. Delivery: ask-on-risk. Runner: `npm.cmd test`, `npm.cmd run lint`, `DATABASE_URL= npm.cmd run build`.

## Specs

- S1 Audit: "Analizar todas las rutas y pantallas de Inventario. Revisar el modelo de datos y las tablas relacionadas. Identificar cómo se calcula actualmente el stock. Investigar las reservas asociadas a pedidos. Revisar entradas, salidas y ajustes. Analizar la relación entre productos y variantes. Identificar estados de stock bajo. Documentar funcionalidades existentes y limitaciones." "No asumir que existen depósitos, múltiples ubicaciones o funcionalidades que no estén implementadas." → `docs/admin-inventory-audit.md`.
- S2 Resumen: "Total de productos y variantes administrados. Productos con stock bajo. Productos sin stock. Unidades disponibles. Unidades reservadas, si el modelo permite obtenerlas correctamente."
- S3 Listado: "Producto y miniatura. SKU. Variante. Stock físico. Stock reservado. Stock disponible. Estado de inventario." "Incluir búsqueda, filtros, ordenamiento y paginación."
- S4 Movimientos: "Entradas. Salidas. Ajustes. Motivo. Fecha. Usuario responsable. Referencia al pedido, cuando corresponda."
- S5 Detalle: "Información del producto. Variantes. Cantidades. Historial de movimientos. Reservas relacionadas. Disponibilidad."
- S6 Ajustes: "Cantidad actual. Cantidad a modificar. Resultado esperado. Motivo obligatorio cuando corresponda. Confirmación antes de aplicar. Feedback de resultado."
- S7 Rules: "Investigar y respetar las reglas existentes." "No implementar nuevas reglas de inventario sin documentar primero su necesidad y obtener aprobación."
- S8 Design system + "Corregir transversalmente la diferencia horaria de Admin → Actividad, mostrando fechas y horas en la zona horaria de Argentina, sin alterar los timestamps almacenados."
- S9 QA: "Búsqueda y filtros. Stock bajo y sin stock. Diferentes variantes. Entradas y salidas. Ajustes. Reservas. Cancelaciones. Movimientos asociados a pedidos. Historial y responsables. Permisos. Responsive: 1366, 1024 y 390 px." lint, build, tests, screenshots.
- S10 Restrictions: "No modificar la tienda pública. No duplicar lógica de inventario. No modificar contratos de API sin justificación. No modificar esquemas de base de datos sin necesidad y aprobación. No introducir datos ficticios. No cambiar reglas de negocio por cuestiones visuales. Mantener compatibilidad con los módulos anteriores." "No comenzar Custom Lab hasta completar y validar Inventario."

## Tasks

- T1 S8 inline — Actividad and Integraciones in Argentina time (display only). Commit 2bcaac5. Status: done.
- T2 S1,S7 inline — audit `docs/admin-inventory-audit.md` (rules verified; 7 rule decisions listed, not implemented). Status: done.
- T3 S4 inline — shared `src/server/inventory/movement-view.ts` + `movements.ts` (listInventoryMovements with order refs). RED (module missing) → GREEN 7/7. Status: done.
- T4 S2,S3,S4 delegated (writer A, parallel with T5) — /admin/inventario summary + list, /admin/inventario/movimientos, nav. RED → GREEN 14/14. Commit 9ee1b73. Status: done (browser QA in T6).
- T5 S5,S6 delegated (writer B, parallel with T4) — /admin/inventario/[productId] detail + adjustment dialog; product page movements via the shared view. RED → GREEN 16/16. Status: done (browser QA in T6).
- T6 S9 inline — QA, screenshots, delivery doc `docs/admin-inventory-redesign.md`. Status: done (see L4).

## Log

- L1 (2026-11-27) User pasted the stage-5 brief "Iniciamos la siguiente etapa del rediseño integral de Sublime Admin: INVENTARIO." (full brief above).
- L2 Audit by a read-only explorer: no inventory route; stock per variant (on_hand, reserved, available = on_hand − reserved); 7 movement reasons; reservations lifecycle verified; negative stock impossible (DB CHECKs); two low-stock definitions; late-payment sale has no order ref; recordCount race. Decisions: list by variant using productStockState per row; summary counts products like Productos/Inicio; adjustments through the existing countStockAction; no rule change.
- L3 (2026-11-27) Writers returned. A: summary (product counts via productFacets, units over tracked active variants), variant list with estado/categoria/reservado/activas filters and 5 sorts, movements page with order links; Inventario nav item. B: detail (all variants incl. inactive, totals over active, active reservations, movements 20/page), adjustment dialog over countStockAction (presentation-only: 'Sin cambios' message, extra revalidation), product page movement rows. Parent: filter label 'Con stock (incluye stock bajo)', removed unused CSS. 809/809, tsc, lint 0, build green.
- L4 (2026-11-27) User: "dale, subilo a QA y validalo con Chrome". QA a0b34d4 → 6185323. SUB-1013 reservation reflected (summary 1 reserved, STK-044 18/1/17, detail reservation + movements with order), cancel releases it. Bug found: first click on 'Revisar ajuste' applied the adjustment (React reused the button as the submit) → fixed with keys + preventDefault (6185323), re-verified (confirmation shown; +2/−2 on QA-REDISENO-01, note required, 'Sin cambios' on equal count). Actividad Stock in ART. 1024/390 via page zoom (window not resizable, popup hidden).
