# SPEC 07 — Página pública de disponibilidad (link en vivo)

> **Status:** Aprobado (el usuario pidió "implementa la propuesta" con la opción 2 en la pregunta de la reserva)
> **Depends on:** SPEC 05 y SPEC 06 (horas ofrecidas), SPEC 03 (marca)
> **Date:** 2026-11-21
> **Reemplaza:** el borrador anterior "imagen descargable" (descartado por el usuario).
> **Objective:** Un link público que muestra, en tiempo real, qué turnos hay libres según lo que el admin decidió publicar, para poner en estados de WhatsApp, bio de Instagram, etc. Tocar una hora lleva a reservar.

---

## Por qué existe esta spec

Una imagen descargada queda vieja apenas entra una reserva, y con muchos profesionales no escala. Un link consulta la disponibilidad real en cada visita: siempre está al día.

La vista es **general**: por día, las horas en que **al menos un profesional** está libre. No hace falta elegir profesional para mirar.

## Precondiciones

- SPEC 05 y SPEC 06 implementadas (rama `feat/schedule-start-interval`).
- Mongo descartable de e2e en Docker (`booking-e2e-mongo`).

## Alcance

**Dentro, backend (`BookingApp_Back`):**

- Ajustes de publicación guardados en `business_settings`: `publicAvailability = { enabled, days, serviceIds }`.
  - `enabled`: por defecto `false` (la página no existe hasta que el admin la activa).
  - `days`: entero de 1 a 14, por defecto 7.
  - `serviceIds`: lista de ids de servicio publicados, o `null` = todos los servicios activos (por defecto).
- `PUT /api/admin/public-availability` (con `ADMIN_API_KEY`): guarda los ajustes. `GET /api/admin/catalog` los devuelve en `publicAvailability`.
- `GET /api/public-availability?serviceId=<id>` (público, sin clave): devuelve la disponibilidad general de hoy y los siguientes `days - 1` días para un servicio.
- Las horas salen de `AvailabilityService.getAvailability` (misma regla que el modal y el bot): intervalo, horas por día y reservas.

**Dentro, front (`BookingApp_Front`):**

- Página pública `/disponibilidad`: elige servicio y muestra los días con sus horas libres. Es mobile-first.
- Al tocar una hora se pide elegir profesional **entre los que están libres a esa hora**; luego se abre el modal de reserva ya con servicio, fecha, hora y profesional, directo en el paso de datos del cliente.
- Pestaña **"Compartir"** en Configuración: activar o apagar la página, cuántos días mostrar, qué servicios publicar, y el link para copiar.

**Fuera de alcance:**

- Elegir qué profesionales se publican (se usan los activos que ofrecen el servicio).
- Reservar sin elegir profesional (asignación automática).
- Horas distintas para la página pública y para el modal de reserva.
- Imagen descargable, caché del servidor, analíticas, dominio propio.
- Cambiar el contrato de `POST /api/bookings`.

## Modelo de datos

```ts
// business_settings (mismo documento del horario; se lee con default si falta)
publicAvailability: { enabled: boolean; days: number; serviceIds: string[] | null }
```

Un documento guardado antes de esta spec se lee como `{ enabled: false, days: 7, serviceIds: null }`.

**`PUT /api/admin/public-availability`**

| Cuerpo | Respuesta |
| --- | --- |
| `{ enabled, days, serviceIds }` (los tres obligatorios) | `{ publicAvailability }` |

Errores 400 (mensaje exacto):

| Caso | Mensaje |
| --- | --- |
| `enabled` no es booleano | `El estado de la página pública debe ser verdadero o falso.` |
| `days` no es un entero de 1 a 14 | `La cantidad de días debe ser un entero entre 1 y 14.` |
| `serviceIds` no es `null` ni una lista sin repetidos de textos, o una lista vacía | `Los servicios publicados deben ser null (todos) o una lista sin repetidos con al menos un servicio.` |
| algún id no existe como servicio | `Alguno de los servicios publicados no existe.` |

Sin clave: 401.

**`GET /api/public-availability`**

- Con la página apagada: `200 { "enabled": false }` (sin datos de servicios ni horas).
- Encendida, sin `serviceId`: usa el primer servicio publicado. Con `serviceId` no publicado, inexistente o inactivo: `404`.
- Respuesta:

```json
{
  "enabled": true,
  "services": [{ "id": "corte", "name": "Corte", "duration": 30 }],
  "serviceId": "corte",
  "days": [
    {
      "date": "2026-11-23",
      "closed": false,
      "times": [
        { "time": "09:00", "professionals": [{ "id": "alex-garcia", "name": "Alex García" }] }
      ]
    }
  ]
}
```

- `times` ordenadas; cada hora lista los profesionales libres en ella (al menos uno). Un día cerrado: `closed: true, times: []`. Un día lleno: `closed: false, times: []`.
- Si no hay servicios publicables: `services: []`, `serviceId: null`, `days: []`.
- "Hoy" es la fecha del negocio (`BUSINESS_TIMEZONE`; sin ella, la fecha UTC). Con `BUSINESS_TIMEZONE` definida, las horas de hoy que ya pasaron no se devuelven. Sin ella no se filtra la hora (nunca se oculta un turno por una zona incorrecta).
- No expone precios, datos de clientes ni cuántas reservas hay.

## Plan de implementación

**Backend:**

1. `catalog.config.ts` / `business-settings.schema.ts` / `catalog.service.ts`: tipo y lectura de `publicAvailability` con default; `getAdminCatalog` lo incluye. Tests.
2. `catalog-validation.ts` y `catalog-admin.service.ts`: `parsePublicAvailability` con los cuatro mensajes (el cuarto en el servicio, contra los servicios existentes) y `savePublicAvailability`. `admin.controller.ts`: `PUT /admin/public-availability`. Tests HTTP: guarda, 400 por caso, 401, default.
3. `src/availability/public-availability.service.ts` y controlador `GET /api/public-availability`: combina `getAvailability` de cada día. Tests: página apagada, unión de horas y profesionales, día cerrado, día lleno, servicio no publicado 404, `days` respetado, sin profesionales ficticios.
4. `docs/public-availability.md` (nuevo, inglés).

**Front:**

5. `src/services/publicAvailabilityService.js` y `adminService.js` (`savePublicAvailability`). Tests.
6. `src/utils/publicAvailability.js`: etiquetas de día y agrupación de las horas para la lista; tests.
7. `src/pages/Availability.jsx` + ruta `/disponibilidad` en `App.jsx`: selector de servicio, lista por día, chips de hora, estado cargando / error / apagada / sin turnos. Tests.
8. Elegir profesional al tocar una hora y abrir `BookingModal` con `prefill` (servicio, fecha, hora, profesional → paso 3). Tests del modal con `prefill` y de que sin `prefill` se comporta igual.
9. `ShareTab.jsx` + pestaña "Compartir" (`ConfigSection.jsx`): interruptor, días, servicios, link copiable. Tests.
10. Prueba de punta a punta (`e2e/specs/public-availability/`): activar desde el panel, abrir `/disponibilidad`, ver horas, tocar una, elegir profesional, completar la reserva; la hora desaparece. La limpieza apaga la página y borra la reserva.
11. Revisión visual (captura móvil y escritorio).

## Criterios de aceptación

- [ ] Por defecto `GET /api/public-availability` responde `{ "enabled": false }` y `/disponibilidad` dice que no está disponible.
- [ ] El admin activa la página en Configuración → Compartir, elige días y servicios, y copia el link `…/disponibilidad`.
- [ ] `PUT /api/admin/public-availability` valida con los mensajes exactos y devuelve 401 sin clave.
- [ ] La página muestra por día las horas en que al menos un profesional está libre, iguales a las que ofrecería el modal.
- [ ] Las horas respetan el intervalo, las horas por día (SPEC 05/06) y las reservas ya hechas; con otro servicio (otra duración) cambian.
- [ ] Con `BUSINESS_TIMEZONE` definida, hoy no muestra horas que ya pasaron.
- [ ] Un día cerrado dice "Cerrado"; un día sin horas dice "Sin turnos".
- [ ] Tocar una hora pide elegir entre los profesionales libres a esa hora y abre el modal de reserva con todo preseleccionado, en el paso de datos.
- [ ] Reservar así crea la reserva y esa hora deja de aparecer en la página.
- [ ] Sin `prefill`, el modal de reserva se comporta exactamente igual que antes.
- [ ] Un servicio no publicado devuelve 404 y no aparece en la página.
- [ ] Pasan `npm test` en ambos repos, `vite build`, `tsc` y el e2e.

## Decisiones

- **Sí:** vista general (unión de profesionales) con elección de profesional al tocar la hora. Lo eligió el usuario (opción 2): no cambia el contrato de reservas.
- **Sí:** un endpoint público nuevo en vez de 7–14 pedidos del navegador por 10 profesionales.
- **Sí:** reutilizar `getAvailability`, la única fuente de las horas. La página y el modal nunca discrepan.
- **Sí:** apagada por defecto. Nada se publica sin que el admin lo active.
- **Sí:** `days` 1–14, con 7 por defecto.
- **Sí:** `serviceIds: null` = todos los activos; así un servicio nuevo se publica solo, y el admin puede restringirlo.
- **Sí:** las horas pasadas de hoy se filtran en el backend con `BUSINESS_TIMEZONE` (la misma que usan el bot y el aviso de reservas fuera de horario). Sin esa variable no se filtra.
- **Sí:** el link es la ruta del front (`/disponibilidad`); no hay dominio ni token.
- **No:** elegir profesionales a publicar, asignación automática, caché, imagen.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Endpoint público barato de abusar: hasta 14 consultas a la base por pedido | Tope de 14 días y solo con la página activa; se mide en el e2e. Un rate limit o caché va en otra spec si hace falta. |
| La página muestra una hora que otro acaba de reservar | Al reservar, el backend valida igual (`checkAvailability` y el índice único); el modal informa el conflicto como hoy. |
| El modal con `prefill` rompe el flujo normal | Tests de ambos caminos; sin `prefill` el código no cambia. |
| `BUSINESS_TIMEZONE` sin definir: se verían horas de hoy ya pasadas | No se filtra por una zona incorrecta; el modal de reserva ya se comporta igual. Documentado. |
| Se publica un servicio que luego se elimina | `serviceIds` se filtra contra los servicios activos al leer; no devuelve ids rotos. |

## Lo que **no** está en esta spec

- Elegir profesionales a publicar, reserva sin profesional, caché, analíticas, dominio propio, imagen descargable.
