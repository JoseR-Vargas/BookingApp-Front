# SPEC 12 — Catálogo hexagonal (2/2): locales, horarios y ajustes de la página pública

> **Status:** Implementado
> **Depends on:** SPEC 11
> **Date:** 2026-11-24
> **Objective:** Migrar a arquitectura hexagonal con `Result` los locales, sus horarios, los ajustes de la página pública y la migración al local "Principal", y dejar el modelo de horario como núcleo compartido que importan `catalog` y `availability`.

---

## Por qué existe esta spec

La spec 11 migró profesionales, servicios y fotos. Queda en `catalog` lo de locales: el esquema `locations`, la migración al local "Principal", la lectura de horarios, el alta y edición de locales, el guardado de horarios y los ajustes de `/disponibilidad`. Hoy esa lógica usa Mongoose directamente (`locations.ts`, `CatalogService`, `CatalogAdminService`).

Hay un acople que esta spec corrige a propósito: el **horario** (semana, intervalo, horas de inicio por día) es un dato de `catalog`, pero la regla que lo interpreta (`offeredStarts`, `buildDaySlots`) vive en `availability/availability.calculator.ts`. Si `availability` migra después (spec 13) importando a `catalog`, o al revés, nace una dependencia entre módulos hermanos. Por eso el **modelo de horario y sus reglas puras pasan a `src/shared/domain/schedule/`**, que importan ambos módulos sin depender uno del otro. Es también el cimiento que usará el aislamiento por negocio (spec 17).

## Alcance

**Dentro (backend `BookingApp_Back`):**

- `src/shared/domain/schedule/`: tipos `WeeklySchedule`, `DaySchedule`, `DayOfWeek` y las reglas puras de horario (`dayOfWeekFromIsoDate`, `toMinutes`, `buildDaySlots`, `offeredStarts`, `slotsRequired`), con sus tests. `availability.calculator.ts` las reexporta desde ahí sin cambiar su comportamiento ni sus firmas, y mantiene el resto (`occupiedSlots`, `freeStartTimes`, `windowSlots`).
- Dominio de locales en `src/catalog/domain/`: modelo `Location`, reglas de nombre y dirección, regla del local por defecto (el activo más antiguo), regla "debe quedar al menos un local activo", reglas de horario (parseo y validación de semana, intervalo y `starts`) y de ajustes de la página pública, todo con `Result` y los mensajes de hoy.
- Aplicación: puertos y casos de uso de locales (`LocationReader`/`LocationWriter`), horario por local, `PublicAvailabilitySettings` (`Reader`/`Writer`) y la migración (`EnsurePrincipalLocation`).
- Infraestructura: entidades y mapeadores de Mongo, repositorios de Mongo y en memoria con su suite de contrato, controladores nuevos para las rutas de locales, horario y ajustes, y la sembrada de arranque como adaptador.
- El puerto provisional `LocationDirectory` (spec 11) se reemplaza: `catalog` usa su propio `LocationReader`. Se borra el adaptador provisional.
- **Fachada temporal** `CatalogService` y `CatalogAdminService` con los mismos métodos que usan `bookings`, `availability`, `admin` y el bot (`getSchedule`, `getLocation`, `getActiveLocations`, `getDefaultLocationId`, `worksAtLocation`, `getPublicAvailability`, `saveSchedule`, `saveLocationSchedule`, `createLocation`, `updateLocation`, `savePublicAvailability`), traduciendo los `Result` a las excepciones de siempre (incluida `LocationNotFoundError`).
- `catalog` ya está en las listas del test de arquitectura; se agrega `src/shared/domain/schedule` a las reglas de `shared`.

**Fuera de alcance (otras specs):**

- `availability` y `bookings` (spec 13), `admin`, `auth` y `email` (spec 14) y el bot de WhatsApp (spec 25).
- Cambiar rutas, cuerpos, estados o mensajes de la API, o la forma de los documentos.
- Aislamiento por negocio (spec 17).
- El front.

## Modelo de datos

Las colecciones `locations` y `business_settings` y sus documentos no cambian.

```text
src/shared/domain/schedule/
  schedule.ts          WeeklySchedule, DaySchedule, DayOfWeek
  schedule.rules.ts    dayOfWeekFromIsoDate, toMinutes, buildDaySlots, offeredStarts, slotsRequired
  (+ specs, TypeScript puro)

src/catalog/
  domain/
    location.ts                Location
    location.rules.ts          nombre/dirección, local por defecto, último activo
    schedule-input.rules.ts    semana, intervalo y starts -> Result
    public-availability.rules.ts
    location.errors.ts         LocationNotFound (not-found), LastActiveLocation (conflict), ...
  application/
    ports/ location.reader.ts, location.writer.ts, public-availability.reader.ts, public-availability.writer.ts, legacy-schedule.reader.ts
    use-cases/locations/ list, get, resolve-default, create, update, save-schedule, works-at-location
    use-cases/settings/  get-public-availability, save-public-availability
    use-cases/ensure-principal-location.use-case.ts
  infrastructure/
    persistence/mongo/ location.entity, mapper, repositorios (locations y business_settings)
    persistence/in-memory/
    http/ locations-admin.controller.ts, schedule-admin.controller.ts, public-availability-admin.controller.ts + inputs
```

**Errores de dominio** (mensajes exactos de hoy; `LocationNotFoundError` sigue existiendo para los consumidores sin migrar):

| Falla | `kind` | Mensaje |
| --- | --- | --- |
| Local inexistente o inactivo | `not-found` | `Location "<id>" not found` |
| Desactivar el último local activo | `conflict` | `Debe quedar al menos un local activo.` |
| Nombre, dirección, horario, intervalo, `starts` o ajustes inválidos | `validation` | los actuales de `catalog-validation.ts` |

**Reglas que se conservan sin cambios** (hay tests que las fijan): el local por defecto es el activo más antiguo (desempate por orden de creación); la lectura de una base sin migrar da un "Principal" virtual con el horario heredado; la migración copia sin mover ni borrar `business_settings`, es atómica por id y no toca una colección ya poblada; `PUT /api/admin/schedule` actúa sobre el local por defecto y omitir `startIntervalMinutes` conserva el valor guardado.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Núcleo compartido de horario.** Mover los tipos y las reglas puras a `src/shared/domain/schedule/` con sus tests; `availability.calculator.ts` y `catalog.config.ts` los importan de ahí. Los specs existentes del calculador pasan sin cambios.
2. **Dominio de locales y ajustes.** Reglas puras con `Result` y los mensajes exactos de `catalog-validation.ts`. Tests unitarios puros.
3. **Puertos y casos de uso** contra repositorios en memoria, uno por acción.
4. **Adaptadores de persistencia.** Entidades, mapeadores y repositorios de Mongo y en memoria; suite de contrato de cada puerto contra ambos (`npm test` y `npm run test:int`). Cubrir: base sin migrar, migración idempotente y concurrente, "Principal" virtual, local por defecto, ajustes ausentes, `startIntervalMinutes` ausente.
5. **Controladores nuevos** de locales, horario y ajustes (mismas rutas y mismo guard), con las suites HTTP actuales conservadas con las mismas aserciones.
6. **Fachada.** `CatalogService` y `CatalogAdminService` envuelven los casos de uso con las mismas firmas y excepciones; se elimina `LocationDirectory` y su adaptador provisional.
7. **Limpieza.** Borrar `locations.ts` viejo y el código de locales de los servicios; actualizar `docs/architecture.md` (puertos provisionales restantes) y `docs/locations.md`.
8. **Cierre.** Comparación antes y después de las respuestas HTTP de todas las rutas de locales, horario, ajustes, catálogo público y de admin; verificación completa.

## Criterios de aceptación

- [ ] Todas las rutas de locales, horario, ajustes y catálogo responden exactamente igual que antes: mismos códigos, cuerpos y mensajes.
- [ ] `src/shared/domain/schedule/**`, `catalog/domain/**` y `catalog/application/**` no importan Mongoose, HTTP ni `infrastructure/**`, y no contienen `throw`, `new Date()` ni `process.env` (lo comprueba el test de arquitectura).
- [ ] `availability` y `catalog` no dependen uno del otro: ambos importan el horario desde `src/shared/domain/schedule`.
- [ ] Los specs del calculador de disponibilidad pasan sin cambios.
- [ ] Una base sin migrar sigue leyéndose como un "Principal" virtual, y arrancar dos veces no duplica ni modifica nada.
- [ ] No se puede desactivar el último local activo (`409` con el mismo mensaje).
- [ ] `bookings`, `availability`, `admin` y el bot pasan sus suites sin cambios; la fachada sigue lanzando `LocationNotFoundError`.
- [ ] Una falla de la base (el repositorio lanza) da `500`.
- [ ] Los repositorios de Mongo y en memoria pasan la misma suite de contrato.
- [ ] La suite HTTP de locales corre completa sobre los adaptadores en memoria (prueba de cambio de base).
- [ ] `LocationDirectory` y su adaptador provisional ya no existen.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front.

## Decisiones

- **Sí:** el modelo de horario y sus reglas puras van a `src/shared/domain/schedule/` (decidido por el usuario, opción 2): evita una dependencia entre `catalog` y `availability` y sirve al aislamiento por negocio.
- **Sí:** `availability.calculator.ts` reexporta las reglas movidas: `availability` no se toca hasta su spec.
- **Sí:** fachada temporal con la misma interfaz, igual que en la spec 11, hasta que cada consumidor migre.
- **Sí:** el puerto provisional `LocationDirectory` desaparece: el dueño del dato (`locations`) ya es hexagonal.
- **Sí:** la migración al "Principal" es un caso de uso con adaptador atómico por id; el dominio solo decide qué copiar.
- **Sí:** `business_settings` se lee por dos puertos (`LegacyScheduleReader` para la migración y `PublicAvailabilitySettings` para los ajustes), con el mismo documento por debajo.
- **No:** mover `offeredStarts` a `availability` ni a `catalog`.
- **No:** transacciones nuevas: la regla del último local activo sigue sin ser transaccional, como hoy.
- **No:** cambiar la forma de los documentos ni la numeración de ids de locales.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Mover las reglas de horario altera la disponibilidad | Los specs del calculador y de `availability` pasan sin cambios y el e2e de intervalo y horas por día. |
| La migración duplica o pierde el horario | Suite de contrato con base vacía, ya migrada, sin horario guardado y arranque concurrente. |
| Se rompe un consumidor que espera `LocationNotFoundError` | Tests de la fachada por cada método consumido y las suites de `bookings` y `availability` intactas. |
| Cambia el local por defecto al reordenar | Test de la regla del "activo más antiguo" con desempate. |
| Dos estilos conviviendo en `src/catalog` | `domain/`, `application/` e `infrastructure/` separados de los archivos viejos; el estilo viejo no se extiende. |

## Lo que **no** está en esta spec

- `availability`, `bookings`, `admin`, `auth`, `email` y WhatsApp (specs 13, 14 y 25).
- Aislamiento por negocio y cualquier cambio en el front.
