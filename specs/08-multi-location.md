# SPEC 08 — Varios locales (etapa 1: base)

> **Status:** Aprobado (el usuario eligió la opción B y que un profesional pueda rotar entre locales)
> **Depends on:** SPEC 05, 06 y 07
> **Date:** 2026-11-23
> **Objective:** Que un negocio con más de un local administre todo desde un solo panel: cada local con su dirección y su horario, profesionales que rotan entre locales, y reservas que guardan el local.

---

## Por qué existe esta spec

Hoy la app asume un solo lugar: un horario único, profesionales y servicios globales, y la reserva no sabe en qué local es. Un negocio con dos locales hoy tendría que montar dos instalaciones.

La ocupación ya está del lado correcto: el índice único es por **profesional**, fecha y bloque, no por local. Un profesional que rota no puede quedar reservado en dos locales a la misma hora, sin código nuevo.

## Alcance de la etapa 1

**Dentro (backend `BookingApp_Back` y front `BookingApp_Front`):**

- Entidad **Local** con nombre, dirección y **su propio horario** (semana, intervalo y horas por día de SPEC 05/06).
- Migración automática y sin pérdida: se crea el local **"Principal"** con el horario que ya existe. Todo lo existente queda en él.
- Cada profesional trabaja en **uno o varios** locales.
- La reserva guarda el local. La disponibilidad se calcula por local.
- Admin: pestaña **"Locales"** (crear, editar, desactivar), "Horarios" con selector de local, y locales en el formulario del profesional.
- Reserva pública: si hay más de un local activo, se elige el local en el paso "Fecha y Hora"; si hay uno, nada cambia.
- Página pública `/disponibilidad`: selector de local cuando hay más de uno.

**Fuera de alcance (etapa 2):**

- Bot de WhatsApp con varios locales: sigue usando el local principal. Documentado.
- Dirección del local en el email de confirmación.
- Reportes y filtros del panel por local.
- Servicios distintos o precios distintos por local.
- Días concretos en que un profesional va a cada local: un profesional asignado a un local se ofrece en **todo** el horario de ese local.
- Mover una reserva existente a otro local.

## Contrato

**Datos**

- Colección `locations`: `{ id (slug del nombre, único), name, address, active, weekly, slotIntervalMinutes (30), startIntervalMinutes, createdAt }`.
- **Local principal** (`id: "principal"`, `name: "Principal"`, `address: ""`): se crea al iniciar si `locations` está vacía, copiando `weekly` y `startIntervalMinutes` de `business_settings` (o el horario semilla si no hay). Idempotente: no duplica ni pisa nada. Es el **local por defecto**: el activo más antiguo.
- Profesional: `locationIds: string[]`. Un documento sin el campo se lee como `[<id del local por defecto>]`.
- Reserva: `location: { id, name }`. Una reserva sin el campo se lee como el local por defecto. No se reescriben reservas existentes.

**Lectura**

- `GET /api/catalog` agrega `locations: [{ id, name, address, schedule: { weekly, slotIntervalMinutes, startIntervalMinutes } }]` (solo activos) y `locations: string[]` en cada profesional (solo ids de locales activos). El `schedule` de nivel superior se mantiene y es el del local por defecto (compatibilidad).
- `GET /api/admin/catalog` agrega todos los locales, con `active`, y `locations` en cada profesional.
- `GET /api/availability?date&serviceIds[&locationId]`: sin `locationId` usa el local por defecto. Local inexistente o inactivo: `404` con `Location "<id>" not found`. Solo devuelve profesionales asignados a ese local, con el horario de ese local. La respuesta agrega `location: { id, name }`. La ocupación sigue siendo por profesional: una reserva en el otro local ocupa los mismos bloques.

**Reservas**

- `POST /api/bookings` acepta `location: { id }`. Sin él: se usa el local por defecto si hay **un solo** local activo; con varios: `400` `Error de validación: debes elegir un local`. Se valida que el profesional trabaje en el local (`Error de validación: <nombre> no trabaja en <local>`) y que la hora sea una hora ofrecida por el horario de **ese** local (mismo error de hoy). Se guarda `location: { id, name }`.
- `POST /api/bookings/availability` acepta `locationId` opcional (por defecto, el local por defecto).
- Editar una reserva (`PATCH`) valida contra el local guardado de la reserva; no permite cambiarlo.

**Admin** (todas con `ADMIN_API_KEY`; `401` sin ella)

- `POST /api/admin/locations` `{ name, address }` → `201` con el local (horario inicial: el semilla; intervalo 30).
- `PUT /api/admin/locations/:id` `{ name, address, active }`.
- `PUT /api/admin/locations/:id/schedule` `{ weekly, startIntervalMinutes? }` → `{ schedule, affectedBookings }`. Mismas validaciones y mensajes que `PUT /api/admin/schedule`. `affectedBookings` cuenta solo las reservas de ese local.
- `PUT /api/admin/schedule` no cambia su contrato: opera sobre el local por defecto.
- No se puede desactivar el último local activo: `400` `Debe quedar al menos un local activo.`
- Errores de validación (400): nombre vacío o de más de 80 caracteres `El nombre del local es obligatorio (máximo 80 caracteres).`; dirección de más de 200 `La dirección del local no puede superar los 200 caracteres.`
- `POST` y `PUT` de profesionales aceptan `locations: string[]` (ids de locales activos existentes, sin repetidos, al menos uno; por defecto `[<local por defecto>]`). Error: `El profesional debe trabajar en al menos un local activo.`

**Disponibilidad pública**

- `GET /api/public-availability?serviceId[&locationId]` suma `locations: [{ id, name }]` y `locationId`. Los ajustes (`days`, `serviceIds`) siguen siendo globales.

## Plan (tareas)

Ver `odd/tasks/multi-location.md`.

## Criterios de aceptación

- [ ] Con la base actual, tras migrar existe "Principal" con el horario previo y todo se ve y se reserva como antes, con un solo local y sin pasos nuevos.
- [ ] El admin crea el local "Centro" con dirección, le fija su propio horario (por ejemplo cada 1 h) y asigna a Alex a los dos locales y a María solo a "Principal".
- [ ] En la reserva pública se elige el local; solo aparecen los profesionales de ese local y sus horas siguen el horario de ese local.
- [ ] Reservar a Alex a las 11:00 en "Centro" bloquea las 11:00 de Alex en "Principal".
- [ ] Una reserva a una hora que el horario del local no ofrece, o con un profesional que no trabaja ahí, se rechaza con el mensaje de arriba.
- [ ] `/disponibilidad` muestra un selector de local cuando hay más de uno, y sus horas son las de ese local.
- [ ] El admin no puede desactivar el último local activo.
- [ ] Guardar el horario de un local cuenta solo las reservas futuras de ese local fuera de horario.
- [ ] Una reserva anterior a esta spec sigue valiendo y cuenta como del local principal.
- [ ] Pasan `npm test` en ambos repos, `tsc`, `vite build` y el e2e.

## Decisiones

- **Sí:** locales dentro de la misma app (opción B), no una instalación por local.
- **Sí:** el profesional rota entre locales; un profesional asignado a un local se ofrece en todo el horario de ese local.
- **Sí:** el horario es por local (la lógica de SPEC 05/06 no cambia, solo de dónde sale el horario).
- **Sí:** servicios, precios, ajustes de la página pública y marca siguen globales.
- **Sí:** migración al iniciar, idempotente, creando "Principal". Sin reescribir reservas: se leen con valor por defecto.
- **Sí:** compatibilidad: `GET /api/catalog` mantiene `schedule` y `PUT /api/admin/schedule` opera sobre el local por defecto. Los clientes que no conocen locales siguen funcionando mientras haya uno solo.
- **Sí:** con varios locales, reservar sin `location` es un error y no una suposición.
- **No:** el bot con varios locales, el email con dirección, reportes por local (etapa 2).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La migración duplica o pierde el horario | Idempotente, con tests (vacía, ya migrada, sin horario guardado). Copia, no mueve: `business_settings` no se borra. |
| Cambia el contrato de disponibilidad y reservas que consume el front y el bot | Todo lo nuevo es opcional y por defecto el local principal; los tests existentes deben seguir pasando sin cambios. |
| El bot reserva en el local por defecto con varios locales | Documentado como limitación de la etapa 1; se resuelve en la etapa 2. |
| Un profesional queda sin ningún local activo | No se ofrece en ningún lado; el admin lo ve en su formulario. Desactivar un local no borra la asignación. |
| Se pierde la unicidad entre locales | El índice único es por profesional, fecha y bloque: se cubre con un test que reserva el mismo profesional en dos locales. |

## Lo que **no** está en esta spec

- Bot, email con dirección, reportes por local, servicios por local, calendario por día de cada profesional entre locales, mover reservas entre locales.
