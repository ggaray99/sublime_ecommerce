# Puntos de venta

Lugares donde se consiguen productos Sublime: se cargan en el panel y se muestran en un mapa público.

| Qué | Dónde |
| --- | --- |
| Página pública | `/puntos` ("Dónde comprar" en el menú) |
| Panel | `/admin/puntos` |
| Base | `points_of_sale` (migración `0012_points_of_sale`); cada cambio queda en `audit_logs` (entidad `point`) |
| Código | `src/server/points/`, `src/lib/points.ts`, `src/components/points/points-map.tsx`, `src/components/admin/point-forms.tsx` |
| Pruebas | `tests/points.test.mjs` |

## Cómo cargar un punto

1. **Panel → Puntos de venta**: nombre, tipo, dirección, localidad, provincia, horarios, teléfono, Instagram y qué se consigue ahí.
2. **Ubicación exacta (opcional)**: en Google Maps buscá el lugar, tocá "Compartir", copiá el link y pegalo. También sirve escribir "latitud, longitud". Si no la cargás, el mapa busca la dirección.
3. **Mostrar en el mapa**: destildalo para ocultar un punto sin borrarlo.

Los links cortos de Google (`maps.app.goo.gl/…`) no traen las coordenadas: en ese caso abrí el link y copiá la dirección larga del navegador, que sí las tiene.

## El mapa

Usa el mapa de Google embebido **sin clave**: muestra el punto elegido con su marcador, y cada punto tiene "Cómo llegar" (abre Google Maps con el recorrido). Cuando hay puntos en más de una localidad aparece un filtro por localidad.

**Pendiente de decisión:** para ver **todos los marcadores a la vez** en un solo mapa hace falta la API de Google Maps (Maps JavaScript API) con una clave restringida al dominio. Requiere un proyecto en Google Cloud con facturación activada; con el tráfico esperado entra en el uso gratuito. Si se aprueba, se cambia solo el componente del mapa.
