# Sublime Custom Lab: auditoría y plan V1

Estado (24/10/2026): **implementado en staging** (rama `feat/vps-self-hosting`), dentro de **Personalizados** (`/encargos`).

| Fase | Estado |
| --- | --- |
| L1 · Datos y circuito | ✅ Migración 0014, roles de archivo, outbox, WhatsApp en Panel → Ajustes |
| L2 · Stickers | ✅ `/encargos/stickers`: subida, quitado de fondo (liso o degradado) con sensibilidad, contorno de 32 px exacto, tamaño de 4 a 6 cm, cantidades, aviso de dpi, planchas automáticas; el servidor genera el PNG de cada plancha y el **PSD para el plotter** |
| L3 · Remeras | ✅ `/encargos/remeras`: negra o blanca, frente o espalda, 4 diseños del catálogo (vectoriales, 2400 px) o uno propio, ubicación y tamaño dentro de 28 × 35 cm, talles XS–XXL; el servidor genera el mockup y la estampa a 300 dpi |
| L4 · Panel | ✅ El detalle del encargo muestra las vistas previas y los archivos originales y de producción (PSD/PNG), con descarga privada |
| L5 · Avisos | ✅ Botón de WhatsApp en la página del encargo; procesador del outbox cada minuto (`deploy/outbox.sh`). Canal: webhook opcional (`NOTIFY_WEBHOOK_URL`, por ejemplo un flujo de n8n). Sin canal, los avisos quedan pendientes. Email: fuera de V1 |
| L6 · Pruebas | ✅ Pruebas automáticas de procesamiento, planchas, PSD, pedidos y outbox; recorrido completo en el navegador (sticker y remera) |
| L7 · Quitado de fondo con IA | Pendiente de decisión |

**Pendientes del negocio:**
- Probar un PSD en el programa del plotter.
- Cargar el WhatsApp en Panel → Ajustes.
- Si se quieren avisos inmediatos, armar un webhook en n8n.
- Conseguir en alta resolución las estampas de remeras propias (las 4 del catálogo son vectoriales y ya están bien).

## 0. Decisiones L0 (24/10/2026)

| Tema | Decisión |
| --- | --- |
| Plancha | **21 × 29 cm**. En las **4 esquinas** hay una zona de **1,5 × 1,5 cm** reservada para las guías de registro del troquel: ahí no puede ir ningún sticker. Referencia: la foto de plancha que mandó el negocio |
| Tamaño de sticker | El cliente lo elige entre **4 y 6 cm** (el lado mayor del diseño, sin contar el borde blanco) |
| Planchas | Se calculan **solas** a partir del tamaño y la cantidad. El sistema acomoda los diseños para aprovechar al máximo la plancha |
| Diseños de remera | 4 PNG en `drive-download-20261024T224333Z-1-001.zip` (raíz del repo, sin versionar). Antes de usarlos: verificar transparencia y resolución, pasarlos a `public/lab/designs/` y no versionar el zip |
| WhatsApp | El número se configura **desde el panel** (`store_settings`, clave `contact`), no en el código |
| Email | **Fuera de V1.** El outbox se crea igual, para sumarlo después sin tocar el flujo |
| Formato para la imprenta | **PSD** (lo usa el plotter): una plancha por archivo, con capas separadas (diseños, contorno blanco, línea de corte y guías de las esquinas). Además, un **PDF o PNG** de cada plancha para verla fácil en el panel. El PSD se genera en el servidor con `ag-psd` (MIT, JavaScript puro, escribe PSD con capas). Hay que confirmar la versión y que el plotter abra el archivo con una plancha de prueba |
| Contorno blanco | **32 px a 300 dpi ≈ 2,7 mm** (300 dpi confirmado por el negocio). Es fijo y no lo ajusta el cliente. Se calcula con distancia euclídea exacta, así que sale redondeado como un troquel |
| Separación | **2 mm** entre stickers (decisión técnica: el contorno blanco ya da margen) y 3 mm al borde de la plancha. Capacidad con stickers cuadrados: 4 cm → 21, 5 cm → 12, 6 cm → 10 por plancha |

### Armado de planchas (algoritmo V1)

- **Área útil:** 21 × 29 cm menos un margen de seguridad de 3 mm en los bordes. Además, cada esquina de 1,5 × 1,5 cm cuenta como obstáculo, así que el centro de los bordes sí se aprovecha, como en la foto de referencia.
- **Medida de cada pieza:** el rectángulo que ocupa el diseño ya con su contorno blanco (tamaño elegido + 2 × 32 px, unos 2,7 mm por lado a 300 dpi), más 3 mm de separación para la cuchilla.
- **Acomodo:** algoritmo **MaxRects** (empaquetado de rectángulos con obstáculos), probando cada pieza a 0° y 90°. El resultado es una lista de planchas con la posición de cada pieza.
  - Con diseños de proporciones distintas, se acomodan de mayor a menor.
  - Con el mismo tamaño, sale una grilla y el resultado es determinístico.
- **Cantidad de planchas:** sale de empaquetar todas las copias pedidas. El navegador lo muestra al instante ("tu pedido entra en 2 planchas, 34 stickers por plancha") y el servidor lo recalcula al guardar.
- **Mejora posterior (fuera de V1):** encastrar por la silueta real, no por el rectángulo, para ganar espacio con formas irregulares.
- **Vista previa:** una imagen de cada plancha con las piezas ubicadas, para el cliente y para el panel. El archivo de producción de cada plancha se genera en el servidor (`sharp`), con las guías de las esquinas.
- **Pruebas:**
  - ninguna pieza toca las esquinas reservadas ni se sale del área;
  - nunca hay dos piezas superpuestas;
  - un mismo pedido da siempre el mismo resultado;
  - la cantidad de planchas coincide con la que se espera para casos conocidos (por ejemplo, 4 cm o 6 cm cuadrados).

## 1. Arquitectura actual (verificada)

| Área | Estado real |
| --- | --- |
| Stack | Next.js 16.4.2 (App Router, `cacheComponents`), React 19.3, TypeScript estricto, ESLint. Pruebas con `node --test` sobre PGlite (240 casos) |
| Hosting | VPS de Hostinger con Docker y Traefik. Staging con despliegue automático desde la rama. Una imagen por entorno (`deploy/`) |
| Base | PostgreSQL 17 con `pg` y repositorios de SQL plano (`QueryFn`). Las escrituras atómicas se hacen en una sola sentencia (CTE). Las migraciones son versionadas y con checksum |
| Auth | Better Auth en la app. Admins en `admin_users` (owner / editor). Cada mutación revalida al admin (`requireAdmin`) |
| Archivos | Disco del VPS (`MEDIA_ROOT`), con un área `public/` servida por `/media/*` y otra `private/` servida solo por rutas que chequean permisos |
| Imágenes | `sniffImage` / `inspectImage` validan el tipo por contenido. **`sharp` es devDependency**: solo lo usan las pruebas y el pipeline de Next |
| Encargos | Fase 7 completa: `custom_requests` + `custom_request_files` + `custom_request_events`, link privado con token, presupuesto, aceptar o rechazar, panel `/admin/encargos` y descarga protegida |
| Catálogo | Productos con variantes de hasta 2 opciones (`option_names` y valores por variante), por ejemplo Talle y Color en remeras. Hay mockups de remera blanca y negra, frente y espalda, en `scripts/art/assets/` |
| Notificaciones | **No hay**: ni email (falta elegir proveedor, pendiente 4.3) ni WhatsApp |
| Límite de subida | `bodySizeLimit: 4.4mb` en Server Actions. Venía del límite de Vercel; **en el VPS se puede subir** |

## 2. Qué se reutiliza

- **Encargos (casi todo el circuito):**
  - `src/server/custom-requests/` (repositorio, validación, estados, idempotencia, límite por hora);
  - `src/app/encargo/[id]` (página privada con token);
  - `/admin/encargos` (detalle, presupuesto, estados, historial);
  - `/api/encargos/[id]/archivos/[fileId]` (descarga privada).
  - El Lab es **un tipo de encargo**, no un sistema aparte.
- **Archivos privados:** `src/server/media/private-files.ts` y `disk.ts`, con rutas seguras, nombres aleatorios y descarga solo para el cliente con su token, su sesión o un admin.
- **Validación de imágenes:** `src/server/media/image-file.ts`.
- **Variantes:** `src/server/admin/variants*.ts` para validar del lado del servidor el color y el talle elegidos.
- **UI del panel:** `Field`, `Status`, `ConfirmButton`, la barra de admin y los estilos `account__section` y `admin-table`.
- **Mockups de remera:** `scripts/art/assets/shirt-{white,black}-{front,back}.png`.

## 3. Arquitectura recomendada

```
Navegador                                Servidor (Next, mismo contenedor)            Disco privado / Postgres
─────────────────────────────            ──────────────────────────────────           ─────────────────────────
/lab/sticker  /lab/remera                Server Action "enviar al Lab"
 editor react-konva (carga diferida)  →   1. valida tipo, tamaño y píxeles (sharp)  →  private/lab/<id>/original.*
 quitar fondo liso (canvas)               2. recalcula contorno y prueba de          →  private/lab/<id>/produccion.png
 contorno de vista previa                    producción con sharp (no confía en el      private/lab/<id>/vista-previa.png
 vista previa PNG                            navegador)                             →  custom_requests (+kind, config)
                                          3. valida config (tamaño, cantidad,           custom_request_files (+role)
                                             variante real)                             notification_outbox (misma sentencia)
                                          4. guarda todo en una sola transacción
                                                                                      Cron (cada minuto) → procesa el outbox:
                                                                                      email (cuando haya proveedor) y aviso al admin
```

- **Editor: react-konva.** El modelo declarativo encaja con React 19. Trae `Transformer` para mover, escalar y rotar, pesa menos que Fabric y alcanza para "una imagen sobre una plantilla". Se carga solo en `/lab/*` con `next/dynamic` (`ssr: false`). Hay que confirmar la versión compatible con React 19.3 antes de instalarla.
  - **Fabric.js 6:** tiene más herramientas de dibujo y texto que no necesitamos, y es imperativo, lo que obliga a sincronizarlo a mano con React.
  - **Canvas propio:** sin dependencias, pero habría que reimplementar los controles de transformación, el arrastre táctil y la accesibilidad.
- **El servidor manda.** La vista previa del navegador es comercial. El archivo para producción lo regenera el servidor con `sharp` desde el original, con los parámetros validados. Nunca se usa el PNG que mandó el cliente como archivo de producción.
- **Sin servicios nuevos en V1.** Todo corre en la app actual. Recién en la fase opcional de quitado de fondo con IA se evalúa un procesador aparte.

## 4. Modelo de datos (migración `0014_custom_lab.sql`)

```sql
ALTER TABLE custom_requests
  ADD COLUMN kind   text NOT NULL DEFAULT 'free' CHECK (kind IN ('free', 'sticker', 'tshirt')),
  ADD COLUMN config jsonb NOT NULL DEFAULT '{}'::jsonb;  -- validado en el servidor; versión en config.v

ALTER TABLE custom_request_files
  ADD COLUMN role   text NOT NULL DEFAULT 'reference'
    CHECK (role IN ('reference', 'original', 'preview', 'production')),
  ADD COLUMN width  integer, ADD COLUMN height integer;
-- además: ampliar content_type si hiciera falta (sigue sin SVG ni HEIC)

CREATE TABLE notification_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,                       -- 'request.created', 'request.quoted', …
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
```

**Contenido de `config`:**
- **Sticker:** `{ v, widthCm, heightCm, quantity, borderMm, scale, offset, bgRemoved }`.
- **Remera:** `{ v, productId, variantId, side, designSource: 'catalog' | 'upload', designId, scale, x, y }`.

El servidor recalcula el tamaño final y el DPI. La variante tiene que existir, estar activa y pertenecer al producto.

## 5. Archivos, procesamiento y seguridad

- **Almacenamiento:** `private/lab/<requestId>/` con nombres aleatorios. Nada del Lab se sirve por `/media/*`, y las descargas pasan por la ruta protegida que ya existe.
- **Límites:**
  - archivo de hasta 15 MB (subir `bodySizeLimit` a ~16 MB; el VPS no tiene el tope de Vercel);
  - hasta 40 megapíxeles, con `sharp({ limitInputPixels })` contra imágenes bomba;
  - EXIF quitado y orientación corregida;
  - solo PNG, JPG y WebP.
- **DPI:** para el tamaño elegido se exigen ≥150 dpi para aceptar y se recomiendan 300. La advertencia se calcula en el navegador y se confirma en el servidor.
- **Contorno blanco** (navegador y servidor, mismo algoritmo):
  1. tomar el alfa;
  2. dilatarlo `borderMm` (blur gaussiano + umbral);
  3. suavizarlo;
  4. rellenarlo de blanco;
  5. componer la imagen encima.

  En producción se agrega una línea de corte (path) como capa aparte o PNG de máscara. El formato exacto depende de la imprenta (decisión pendiente).
- **Abuso:**
  - límite por email (ya existe, 5 por hora) y clave de idempotencia (ya existe);
  - casilla de derechos de uso de la imagen;
  - el procesamiento corre en el servidor con un tope de tiempo.
- **`sharp` pasa a dependencia de producción.** Licencia Apache-2.0 (libvips LGPL), sin problema para uso comercial.

## 6. Quitar el fondo: alternativas

| Opción | Calidad | Costo | Licencia / riesgo | Para V1 |
| --- | --- | --- | --- | --- |
| **Fondo liso por color** (relleno desde los bordes con tolerancia, en canvas y repetido en el servidor con sharp) | Buena en logos y dibujos sobre fondo plano, que es el caso típico de un sticker | 0 | Código propio | **Sí** |
| PNG con transparencia subido por el cliente | Perfecta | 0 | — | **Sí** (se detecta solo) |
| Modelo de IA en el servidor (rembg o ISNet/BiRefNet vía `onnxruntime-node`) | Muy buena en fotos | 0 USD, pero ~150–400 MB de modelo y CPU (el VPS tiene 2 vCPU) | Modelos MIT o Apache (revisar cada uno). En Python sería un servicio aparte | Fase opcional |
| API externa (remove.bg, Photoroom, Clipdrop) | Muy buena | ~USD 0,05–0,20 por imagen, más una cuenta | Las imágenes de clientes salen a un tercero (privacidad) | Fase opcional, con aprobación |
| `@imgly/background-removal` (en el navegador) | Buena | 0 | **AGPL-3.0**: obliga a liberar el código o a pagar licencia comercial | **No** |

## 7. Notificaciones y errores

- **Outbox:**
  1. La fila de `notification_outbox` se inserta **en la misma sentencia** que el encargo, así nunca se avisa de algo que no se guardó.
  2. Un procesador (ruta interna protegida con token, que el cron del VPS llama cada minuto) envía los mensajes y reintenta con backoff exponencial.
  3. Después de 5 fallos marca `failed`, y se puede ver en el panel.
- **Email:** necesita aprobar un proveedor (por ejemplo Resend) y un remitente en `consulte.app`. Mientras no exista, el outbox acumula y el panel muestra los encargos nuevos, como hoy.
- **WhatsApp:**
  - **V1:** un link `wa.me/<número>?text=Hola, consulto por el encargo ENC-5001` en la confirmación y en el panel. Sin API ni costo.
  - **La API de WhatsApp Business:** fuera de V1, porque lleva costo, la aprobación de Meta y plantillas.
- **Opcional, aviso inmediato al dueño:** n8n, que ya corre en el VPS, puede consumir el outbox o un webhook interno y mandar el aviso por el canal que ya use.
- **Errores visibles para el cliente:** imagen inválida, resolución baja, archivo grande o procesamiento agotado. Son mensajes en español y el diseño no se pierde: queda en `sessionStorage`.

## 8. Archivos a crear o modificar

**Crear:**
- **Migración:** `db/migrations/0014_custom_lab.sql`.
- **Servidor:**
  - `src/server/lab/`: `config.ts` (validación), `sticker.ts` (contorno y producción con sharp), `tshirt.ts` (composición sobre la plantilla), `background.ts` (fondo liso);
  - `src/server/notifications/outbox.ts` y `src/app/api/internal/notifications/route.ts`.
- **Páginas:** `src/app/lab/page.tsx`, `src/app/lab/sticker/page.tsx`, `src/app/lab/remera/page.tsx`, `src/app/lab/actions.ts`.
- **Componentes:** `src/components/lab/` (`sticker-editor.tsx`, `tshirt-editor.tsx`, `contour.ts`, `bg-flood.ts`, `dpi.ts`).
- **Recursos:** `public/lab/templates/` (plantillas de remera con el área de impresión definida en `src/lib/lab-templates.ts`).
- **Pruebas:** `tests/lab-config.test.mjs`, `tests/lab-sticker.test.mjs` (contorno y DPI con sharp), `tests/outbox.test.mjs`.

**Modificar:**
- **Encargos:** `src/server/custom-requests/repository.ts` (kind, config, roles de archivo, outbox) y `src/components/requests/request-view.tsx` (vista previa y config).
- **Panel:** `/admin/encargos/[id]` (vista previa, originales, producción y config).
- **Configuración y deploy:** `next.config.ts` (`bodySizeLimit`), `package.json` (`sharp` a dependencies, `react-konva` + `konva`), `deploy/` (cron del outbox).
- **Navegación:** `mainNav` ("Custom Lab").

## 9. Fases y criterios de aceptación

| Fase | Alcance | Listo cuando |
| --- | --- | --- |
| **L0 · Decisiones** | Tamaños y precios base del sticker, grosores de borde, formato que pide la imprenta, diseños de catálogo para remera (necesitan PNG transparente), número de WhatsApp | Respuestas cargadas en este documento |
| **L1 · Datos y circuito** | Migración 0014. Repositorio con kind, config y roles de archivo. Límite de subida de 16 MB. sharp en producción. Outbox (solo guarda) | Pruebas PGlite: un encargo del Lab se crea en una sola sentencia con archivos y outbox; config inválida y variante ajena se rechazan |
| **L2 · Editor de stickers** | Subida, quitado de fondo liso, contorno ajustable, escala y posición, tamaño y cantidad, advertencia de DPI, vista previa, envío | En 1366 y 390 px. Se genera la prueba de producción en el servidor. Un PNG transparente y un JPG con fondo liso dan un contorno correcto. Una imagen de baja resolución avisa |
| **L3 · Editor de remeras** | Plantillas blanca y negra (frente y espalda), área de impresión, diseño del catálogo o propio, color y talle según las variantes reales | La variante se valida en el servidor; la composición del servidor coincide con la vista previa (±2 %) |
| **L4 · Panel** | En `/admin/encargos/[id]`: vista previa, original, producción, config legible y descarga privada | Solo admin y cliente acceden; nada aparece en `/media/*` |
| **L5 · Notificaciones** | Procesador del outbox, link de WhatsApp, email con el proveedor aprobado | Sin proveedor: queda pendiente sin errores. Con proveedor: 1 email por encargo, con reintentos |
| **L6 · Endurecimiento** | Pruebas de punta a punta en staging, accesibilidad (teclado y lector en el editor), rendimiento en celular | Lint, tipos, build y pruebas en verde. Recorrido completo en staging |
| L7 · Opcional | Quitado de fondo con IA (modelo local o API) | Solo con aprobación de costo y privacidad |

## 10. Riesgos, decisiones y pruebas

- **Riesgos:**
  - la CPU del VPS (2 vCPU) al procesar imágenes grandes: se mitiga con el tope de píxeles y procesando de a una por vez;
  - la diferencia de color RGB (pantalla) contra la impresión: avisar en la UI;
  - que el contorno no sirva para el troquel real: validar con la imprenta antes de L2;
  - los derechos sobre imágenes de terceros: términos más casilla;
  - los editores táctiles en celular.
- **Decisiones pendientes:**
  - formato de producción (PNG 300 dpi con capa de corte, PDF o SVG);
  - tamaños y precios;
  - si se cotiza automáticamente o a mano (V1: a mano, como los encargos);
  - proveedor de email;
  - número de WhatsApp;
  - arte transparente de los diseños para remera.
- **Costos externos posibles:**
  - proveedor de email (Resend, nivel gratuito para empezar);
  - API de quitado de fondo, solo si se aprueba L7.
  - El resto no tiene costo nuevo.
- **Pruebas:**
  - **unitarias:** config, DPI, contorno con sharp (comparación de máscaras), fondo liso;
  - **repositorio:** PGlite;
  - **seguridad:** acceso a archivos privados, imagen bomba, tipos falsos;
  - **visual en staging:** 1366, 768 y 390 px;
  - **flujo completo:** del encargo a la respuesta del panel.
