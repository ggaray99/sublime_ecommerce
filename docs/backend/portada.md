# Portada editable

La primera sección de la tienda ("PEGÁ TU IDENTIDAD.") se edita en **Panel → Portada** (`/admin/portada`).

| Qué se edita | Detalle |
| --- | --- |
| Textos | Texto chico de arriba, título en dos líneas (blanco y celeste, hasta 18 caracteres cada una), presentación y sello redondo (vacío = sin sello) |
| Botones | Texto y destino de dos botones. Solo links de la tienda que empiezan con `/` (ej.: `/tienda?categoria=stickers`); el segundo botón es opcional |
| Collage | Tres productos visibles en la tienda, en orden. Se usa la foto principal de cada uno, con nombre y precio |

- Se guarda en `store_settings` (clave `home_hero`); cada cambio queda en `audit_logs` (entidad `home`, migración `0013_home_settings`).
- La tienda lo muestra al instante (la portada se refresca al guardar).
- Si un producto elegido se oculta o se borra, su lugar lo ocupa uno de los de siempre; sin nada guardado, la portada muestra el contenido original.
- Código: `src/server/home/`, `src/app/admin/portada/`, `src/components/admin/home-forms.tsx`. Pruebas: `tests/home-settings.test.mjs`.
