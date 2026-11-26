# SPEC 13 — Disponibilidad hexagonal

> **Status:** Implementado
> **Depends on:** SPEC 12
> **Date:** 2026-11-25
> **Objective:** Migrar a arquitectura hexagonal con `Result` el módulo `availability` (disponibilidad por fecha y la vista pública de turnos), sin cambiar ninguna ruta ni respuesta, y con la fachada temporal que usa el bot.

---

## Por qué existe esta spec

`availability` es el módulo más pequeño que queda con Mongoose y con acoples directos: `AvailabilityService` consulta la colección de reservas (`bookingModel.find`) y llama a `CatalogService`; `PublicAvailabilityService` importa `getBusinessNow` desde el módulo del bot de WhatsApp. Con puertos, `availability` pregunta por "bloques ocupados", "catálogo" y "hora del negocio" sin conocer Mongoose, el catálogo ni el bot.

El plan antes tenía `availability` y `bookings` juntos (spec 13). `bookings` es tan grande como `catalog` (unas 1 160 líneas, con notificaciones, cancelación por token y estadísticas), así que se parte: esta spec es `availability` y la spec 14 es `bookings`.

## Alcance

**Dentro (backend `BookingApp_Back`, módulo `src/availability`):**

- Dominio: reglas puras de ocupación que hoy viven en `availability.calculator.ts` (`occupiedSlots`, `freeStartTimes`, `windowSlots`) y la regla que arma la disponibilidad de un día y la vista pública (unión de profesionales por hora, horas pasadas de hoy).
- Aplicación: puertos y casos de uso de `GetAvailability` y `GetPublicAvailability`.
- Infraestructura: adaptadores de los puertos, controladores (`GET /api/availability`, `GET /api/public-availability`) con sus entradas, y el módulo como raíz de composición.
- **Fachada temporal** `AvailabilityService` con la misma firma que usa el bot (`getAvailability(date, serviceIds, locationId?)`), y `availability.calculator.ts` como archivo de reexportación para `bookings`, `schedule-impact` y `bot.messages`, que no se tocan.
- `availability` se agrega a `MIGRATED_MODULES` y `RESULT_MODULES`.

**Fuera de alcance (otras specs):**

- `bookings` (spec 14), `admin`, `auth` y `email` (spec 17) y el bot de WhatsApp (spec 26).
- Cambiar rutas, cuerpos, estados o mensajes de la API.
- Caché de disponibilidad (spec de límites de Atlas).
- Aislamiento por negocio (spec 18).
- El front.

## Modelo de datos

No hay datos persistidos nuevos. Los bloques ocupados salen de la colección `bookings`, que no cambia.

```text
src/availability/
  domain/
    occupancy.rules.ts          occupiedSlots, freeStartTimes, windowSlots (puras; el horario viene de shared/domain/schedule)
    day-availability.rules.ts   disponibilidad de un día para un servicio: por profesional, horas libres ∩ ofrecidas
    public-view.rules.ts        unión de profesionales por hora, quitar horas pasadas de hoy, recorte de días
    availability.errors.ts      InvalidDate (validation), PublishedServiceNotFound (not-found), LocationNotFound (not-found), ServiceSelection...
  application/
    ports/
      occupied-slots.reader.ts       OccupiedSlotsReader: bloques ocupados por fecha y profesionales
      catalog-lookup.port.ts         CatalogLookup: ubicación, selección de servicios, locales activos, ajustes públicos, catálogo público
      business-clock.port.ts         BusinessClock: fecha de hoy y hora actual del negocio (BUSINESS_TIMEZONE)
    use-cases/ get-availability.use-case.ts, get-public-availability.use-case.ts
  infrastructure/
    persistence/mongo/        MongoOccupiedSlotsReader (lee la colección de reservas; provisional)
    persistence/in-memory/
    catalog/                  CatalogFacadeLookup: adaptador que envuelve CatalogService (provisional)
    system-business-clock.ts  adaptador del reloj (usa BUSINESS_TIMEZONE)
    http/                     availability.controller.ts, public-availability.controller.ts, inputs
  availability.service.ts / availability.calculator.ts     fachada y reexportación temporales
```

**Puertos provisionales** (se reemplazan al migrar el módulo dueño del dato):

| Puerto | Adaptador hoy | Reemplazo |
| --- | --- | --- |
| `OccupiedSlotsReader` | lee la colección de reservas | spec 14 (`bookings`) |
| `CatalogLookup` | envuelve la fachada `CatalogService` | cuando se borre la fachada (specs 17 y 26) |

**Errores de dominio** (mensajes exactos de hoy):

| Falla | `kind` | Mensaje |
| --- | --- | --- |
| Fecha inválida | `validation` | `date must be a valid YYYY-MM-DD date` |
| `serviceIds` ausente o con ids vacíos | `validation` | los actuales del controlador |
| Local desconocido o inactivo | `not-found` | `Location "<id>" not found` |
| Servicio desconocido | `not-found` | `Service "<id>" not found` |
| Selección vacía o repetida | `validation` | los actuales de `ServiceSelectionError` |
| Servicio no publicado | `not-found` | `Service "<id>" not found` |

**Reglas que se conservan sin cambios:** `GET /api/public-availability` con la página apagada responde `{ "enabled": false }`; las horas pasadas de hoy solo se quitan con `BUSINESS_TIMEZONE`; hoy es la fecha del negocio o, sin zona, la fecha UTC; la ocupación sigue siendo por profesional (la reserva en otro local ocupa los mismos bloques).

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Mover a `domain/` las reglas de ocupación y las de armado del día y de la vista pública, como funciones puras con `Result` donde pueden fallar. Los specs del calculador siguen pasando sin cambios a través de la reexportación.
2. **Puertos y casos de uso** contra adaptadores en memoria. `BusinessClock` inyectado: ningún caso de uso usa `new Date()` ni `process.env`.
3. **Adaptadores.** `MongoOccupiedSlotsReader`, el lector en memoria, `CatalogFacadeLookup` y `SystemBusinessClock`; suite de contrato de `OccupiedSlotsReader` contra ambos (`npm test` y `npm run test:int`) con: reservas canceladas que no ocupan, dos locales del mismo profesional, bloques de reservas multi-servicio.
4. **Controladores nuevos** con las mismas rutas y entradas; las suites HTTP actuales se conservan con las mismas aserciones.
5. **Fachada y limpieza.** `AvailabilityService` envuelve el caso de uso con la misma firma y las excepciones de antes (`BadRequestException`, `NotFoundException`, `LocationNotFoundError`, `ServiceSelectionError`); borrar el código viejo. `public-availability.service.ts` deja de importar del bot.
6. **Cierre.** Comparación antes y después de las respuestas HTTP de ambas rutas (válidas e inválidas); verificación completa.

## Criterios de aceptación

- [ ] `GET /api/availability` y `GET /api/public-availability` responden exactamente igual que antes: mismos códigos, cuerpos y mensajes.
- [ ] `availability/domain/**` y `availability/application/**` no importan Mongoose, HTTP ni `infrastructure/**`, y no contienen `throw`, `new Date()` ni `process.env` (lo comprueba el test de arquitectura).
- [ ] `availability` no importa nada del módulo `whatsapp`.
- [ ] El bot y `bookings` pasan sus suites sin cambios (fachada y reexportación).
- [ ] Los specs del calculador pasan sin cambios.
- [ ] Una falla de la base (el lector lanza) da `500`.
- [ ] El lector de bloques de Mongo y el en memoria pasan la misma suite de contrato.
- [ ] La suite HTTP de disponibilidad corre completa sobre los adaptadores en memoria (prueba de cambio de base).
- [ ] La ocupación de un profesional en un local bloquea las mismas horas en el otro (probado).
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front.

## Decisiones

- **Sí:** partir `availability` y `bookings` en dos specs (13 y 14), como se hizo con `catalog`.
- **Sí:** `OccupiedSlotsReader` y `CatalogLookup` son puertos provisionales con adaptadores que envuelven lo que existe hoy, igual que `BookingActivity` en la spec 11.
- **Sí:** `BusinessClock` como puerto en vez de importar `getBusinessNow` del módulo del bot: `availability` no puede depender de WhatsApp.
- **Sí:** `availability.calculator.ts` sigue existiendo solo para reexportar, hasta que migren `bookings`, `schedule-impact` y el bot.
- **Sí:** mismos mensajes y estados; los errores de dominio llevan `kind` y el filtro único los traduce.
- **No:** caché de disponibilidad (consume lo mismo que hoy: una consulta por día).
- **No:** cambiar la regla de horas pasadas ni la zona horaria.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambia una hora ofrecida | Los specs del calculador, los de disponibilidad y los e2e de intervalo, horas por día y varios locales pasan sin cambios. |
| El cuerpo de un error cambia de forma (`error: "Bad Request"` extra) | Se compara el cuerpo antes y después; los clientes leen solo `message`. Cualquier diferencia se reporta. |
| El adaptador de Mongo cuenta reservas canceladas como ocupadas | Caso explícito en la suite de contrato. |
| El bot deja de recibir lo que espera | La fachada mantiene firma y excepciones; la suite del bot sin tocar. |

## Lo que **no** está en esta spec

- `bookings` (spec 14), `admin`, `auth` y `email` (spec 17), WhatsApp (spec 26) y el aislamiento por negocio (spec 18).
