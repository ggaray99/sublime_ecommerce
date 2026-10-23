# Fase 6 — Envíos

Estado: **activa en staging** (migración 0009 y seed demo `0003_shipping_demo` aplicados el 23/10/2026). Producción sigue con el checkout simulado.

Corresponde a la fila 6 del roadmap técnico:

> Reglas manuales y por provincia, localidad y código postal, retiro, foto del costo en cada pedido y seguimiento.
> **Aceptación:** precedencia inequívoca; costo y cobertura validados en el servidor.

## Reglas de envío

| Tipo | Ejemplo | Prioridad |
| --- | --- | --- |
| Código postal o rango | CP 5500, o 5500 a 5599 | 1 (gana siempre) |
| Localidad | Godoy Cruz (Mendoza) | 2 |
| Provincia | Mendoza | 3 |
| Resto del país | Todo lo demás | 4 |

Cada regla tiene:
- **costo**;
- **gratis desde** (subtotal de productos, opcional);
- **plazo** en días hábiles (mínimo y máximo);
- **cobertura**: se puede marcar "sin cobertura" para una zona, por ejemplo Tierra del Fuego;
- **activa o inactiva**.

**Precedencia inequívoca:**
- Se aplica la regla **activa más específica**, incluido el caso "sin cobertura".
- La base de datos **impide** dos reglas activas del mismo nivel para la misma zona: no se superponen rangos de CP (restricción de exclusión), y no se repiten localidad, provincia ni la regla general (índices únicos). Así una dirección nunca tiene dos reglas posibles.
- Si no hay ninguna regla aplicable, no hay envío a esa zona y el cliente puede elegir retiro.

**Coincidencias:**
- El CP se compara por su parte numérica (`M5500ABC` → 5500).
- La localidad se compara sin distinguir mayúsculas ni acentos, y siempre dentro de su provincia.

Código: `src/server/shipping/rules.ts` (lógica pura, que comparten el checkout del navegador, el servidor y el simulador) y `src/server/shipping/repository.ts`.

## Retiro en el taller

Dirección, horarios e indicaciones, configurables y desactivables. El retiro es sin cargo. Si está desactivado, el checkout ofrece solo envío.

## Checkout

- Al completar provincia, localidad y CP, el resumen muestra **el costo, el plazo y desde cuánto es gratis** (estimación en el navegador). En zonas sin cobertura aparece el aviso.
- **Al confirmar, el servidor vuelve a cotizar** con las reglas vigentes. Una zona sin cobertura se rechaza con el mensaje en el campo de CP.
- El pedido guarda una **foto del envío**: costo, regla, si fue gratis y el plazo. Si después se cambian o borran reglas, los pedidos hechos no cambian.
- El total del pedido es productos + envío.

## Despacho y seguimiento

- Estado nuevo: **Enviado**.
- Un pedido pagado con envío se marca "Enviado" cargando **empresa de envío, código y enlace de seguimiento** (opcional, solo `https://`). Después se marca "Entregado".
- Un pedido con retiro pasa directo de "Pago confirmado" a "Entregado" ("Retirado en el taller").
- El cliente ve el seguimiento en la página del pedido.

## Panel: `/admin/envios`

- Tabla de reglas con tipo, zona, costo, envío gratis y plazo; editar y borrar (con confirmación).
- Formulario de alta y edición. Los campos cambian según el tipo y hay una opción "sin cobertura".
- **Simulador "Probar una dirección":** indica qué regla se aplica y cuánto costaría, con el subtotal que se quiera probar.
- Configuración del retiro.
- Todo cambio queda en la auditoría (`shipping.create`, `shipping.update`, `shipping.delete`, `shipping.pickup`).

## Datos de demostración (solo staging)

`db/seed/0003_shipping_demo.sql`. **No se debe correr en producción.**

| Regla | Costo | Gratis desde | Plazo |
| --- | --- | --- | --- |
| Mendoza Capital (CP 5500) | $ 2.000 | $ 40.000 | 1 a 2 días |
| Godoy Cruz | $ 2.500 | $ 40.000 | 1 a 2 días |
| Provincia de Mendoza | $ 4.500 | $ 60.000 | 2 a 3 días |
| Tierra del Fuego | sin cobertura | — | — |
| Resto del país | $ 9.500 | — | 5 a 8 días |

El retiro es una dirección de demo en Mendoza. Hay que reemplazar todo por los valores reales del negocio.

## Pruebas

- `tests/shipping.test.mjs` (13):
  - reglas: lectura de CP y localidades, precedencia en los cuatro niveles, misma localidad en otra provincia, costo, envío gratis y plazo, zonas sin cobertura y sin reglas, validación;
  - base de datos: rechazo de rangos superpuestos y zonas repetidas (las inactivas no cuentan), edición y borrado auditados;
  - pedidos: el checkout cobra el envío cotizado en el servidor y lo guarda, envío gratis por monto, zona sin cobertura rechazada, retiro gratis y desactivable;
  - despacho: enviado con seguimiento antes de entregado; retiro entregado directo.
- `tests/orders.test.mjs` actualizado: los pedidos llevan su envío.
- Total del proyecto: **210 tests**. Lint, typecheck y los dos builds OK. La migración y la restricción de exclusión funcionan en Neon (staging).

**Pendiente de probar en la preview:** un pedido con envío a CP 5500, otro a "San Rafael, Mendoza" con más de $ 60.000 (envío gratis), uno a Tierra del Fuego (rechazado), cargar el seguimiento y verlo como cliente.
