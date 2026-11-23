# SPEC 05 — Intervalo entre turnos configurable en Horarios

> **Status:** Implementado
> **Depends on:** SPEC 01 (`01-dashboard-config-admin`)
> **Date:** 2026-11-19
> **Objective:** Permitir que el admin elija cada cuántos minutos se ofrecen turnos al público (30 min, 1 h, 3 h…) desde la pestaña "Horarios", sin cambiar cómo se ocupa la agenda.

---

## Por qué existe esta spec

Hoy el público ve una hora de inicio cada 30 minutos, sin importar cuánto dure el servicio. Un negocio cuyos servicios duran 3 horas ve 09:00, 09:30, 10:00… aunque solo quiera ofrecer 09:00, 12:00 y 15:00.

Hay que separar dos cosas:

- **Qué horas se ofrecen.** Es lo que cambia esta spec.
- **Cómo se ocupa la agenda.** Sigue en bloques de 30 minutos (`booking.slots` y el índice único de Mongo). **No se toca**: cambiarlo exigiría migrar reservas existentes, como ya pasó con el paso de 60 a 30 minutos.

Las horas ofrecidas son siempre un **subconjunto** de la grilla de 30 minutos. Por eso no hay migración y las reservas existentes no se ven afectadas.

## Precondiciones

- La rama `feat/schedule-start-interval` sale de `master` actualizado en `BookingApp_Front` y en `BookingApp_Back`.
- Los working trees están limpios, salvo los archivos propios del usuario en el front (`.gitignore`, `package.json`, `marketing/`, `playwright.marketing.config.js`, `Claude outputs/`), que no son parte de esta feature.
- El Mongo descartable de e2e está en Docker (`booking-e2e-mongo`, puerto 27018).

## Alcance

**Dentro:**

- Backend: campo `startIntervalMinutes` en el horario (colección `business_settings`). Múltiplo de 30, de 30 a 480 minutos. Por defecto 30.
- Backend: las horas ofrecidas de un día son `apertura + k × intervalo`, solo si están libres y el servicio cabe antes del cierre.
- Backend: una única función `offeredStarts` concentra la regla, para que una spec futura (horas específicas por día) solo cambie esa función.
- Backend: `GET /api/availability` (y por eso el bot de WhatsApp) devuelve solo las horas ofrecidas.
- Backend: al crear o editar una reserva se rechaza una hora que no se ofrece, con el mismo error de hoy.
- Backend: `PUT /api/admin/schedule` acepta `startIntervalMinutes` (opcional). `GET /api/catalog` y `GET /api/admin/catalog` lo devuelven.
- Front: selector "Intervalo entre turnos" en Horarios, con una pista de la duración del servicio más largo y una vista previa de las horas que verá el público.
- Front: el cálculo de respaldo (`src/utils/schedule.js`) usa el mismo intervalo.
- Documentación: `docs/booking-slots.md` del backend.

**Fuera de alcance (otras specs):**

- Horas específicas por día (pausa de almuerzo, turnos irregulares).
- Intervalo distinto por servicio o por día.
- Cambiar la grilla de ocupación de 30 minutos, o permitir horas como 09:15.
- Capacidad de varios turnos a la misma hora.
- Cualquier cambio a las reservas ya existentes.

## Modelo de datos

**Backend: campo nuevo en `BusinessSettingsRecord` (`src/catalog/schemas/business-settings.schema.ts`) y en `WeeklySchedule` (`src/catalog/catalog.config.ts`).**

```ts
// En BusinessSettingsRecord:
/** Minutes between the start times offered to the public. A multiple of 30. */
@Prop({ type: Number, default: 30 })
startIntervalMinutes: number;

// En WeeklySchedule:
startIntervalMinutes: number; // siempre presente en las respuestas
```

Un documento guardado antes de esta spec no tiene el campo y se lee como `30`: el comportamiento es idéntico al de hoy.

**Regla de las horas ofrecidas** (`src/availability/availability.calculator.ts`).

```ts
// Para un día abierto, las horas de la grilla de 30 min que cumplen:
//   (minutos(hora) - minutos(apertura)) % startIntervalMinutes === 0
offeredStarts(dayOfWeek: DayOfWeek, schedule: WeeklySchedule): string[]
```

La hora final se ofrece solo si además está libre y el servicio completo cabe antes del cierre (la regla de contigüidad de hoy sigue igual).

**Ejemplo** (apertura 09:00, cierre 20:00):

| Intervalo | Servicio de 30 min | Servicio de 3 h |
| --- | --- | --- |
| 30 (hoy) | 09:00, 09:30 … 19:30 | 09:00, 09:30 … 17:00 |
| 180 | 09:00, 12:00, 15:00, 18:00 | 09:00, 12:00, 15:00 |

**Endpoint.**

| Método y ruta | Acceso | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `PUT /api/admin/schedule` | `ADMIN_API_KEY` | `{ weekly, startIntervalMinutes? }` | `{ schedule: { weekly, slotIntervalMinutes, startIntervalMinutes }, affectedBookings }` |

- Si `startIntervalMinutes` **no viene**, se conserva el valor guardado. Un cliente viejo que solo manda `weekly` no lo reinicia a 30.
- Si viene y no es un entero múltiplo de 30 entre 30 y 480, responde `400` con `"El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480."`.

**Errores al reservar.** Una hora no ofrecida devuelve el error de hoy: `"Error de validación: el horario <hora> no está disponible para <servicios> el <fecha>"`.

## Plan de implementación

**Backend (`BookingApp_Back`):**

1. Crear la rama `feat/schedule-start-interval` desde `master`.
2. `availability.calculator.ts`: `offeredStarts` y su uso. Tests unitarios: intervalo 30 igual a hoy, 60, 180, apertura no redonda (09:30), día cerrado, el último turno que no cabe.
3. `business-settings.schema.ts`, `catalog.config.ts`, `catalog.service.ts` (`getSchedule`, valor por defecto 30 para documentos viejos) y `catalog-validation.ts` (`startIntervalMinutes` opcional con su mensaje). Tests.
4. `catalog-admin.service.ts` y `admin.controller.ts`: `saveSchedule` guarda el intervalo, o conserva el guardado si no viene, y lo devuelve. Tests HTTP: 401 sin clave, 400 por valor inválido, "no viene = se conserva", y que `GET /api/catalog` lo devuelve.
5. `availability.service.ts` y `bookings.service.ts` (`windowSlotsFor`): ofrecer y validar solo las horas ofrecidas. Tests HTTP: con intervalo 180 la disponibilidad trae solo 09:00, 12:00, 15:00 y crear una reserva a las 10:00 devuelve el error. Una reserva existente fuera de las nuevas horas sigue válida.
6. `docs/booking-slots.md`: la regla nueva.

**Front (`BookingApp_Front`):**

7. Crear la rama `feat/schedule-start-interval` desde `master`.
8. `src/utils/schedule.js`: el cálculo de respaldo usa el intervalo del catálogo. `src/services/adminService.js`: `saveSchedule` acepta el intervalo. Tests.
9. `src/components/admin/config/ScheduleTab.jsx` y `ConfigSection.jsx`: selector "Intervalo entre turnos" (30 min, 1 h, 1 h 30 min … 8 h), pista "Tu servicio más largo dura N min" y vista previa de las horas del primer día abierto. Tests.
10. Prueba de punta a punta con Playwright (`e2e/specs/schedule-interval/`). Su limpieza restaura el intervalo en 30, porque el helper de e2e `saveSchedule` no lo reinicia.

## Criterios de aceptación

- [ ] Sin tocar nada, el público ve las mismas horas de siempre (cada 30 minutos). Un documento guardado antes de esta spec se comporta igual.
- [ ] `GET /api/catalog` y `GET /api/admin/catalog` devuelven `startIntervalMinutes` en el horario.
- [ ] `PUT /api/admin/schedule` con `startIntervalMinutes: 180` lo guarda y lo devuelve. Con 45, 0, 500 o un texto devuelve 400 con el mensaje de arriba.
- [ ] `PUT /api/admin/schedule` sin `startIntervalMinutes` no cambia el valor guardado.
- [ ] `PUT /api/admin/schedule` sin `ADMIN_API_KEY` devuelve 401.
- [ ] Con intervalo 180 y horario 09:00 a 20:00, `GET /api/availability` de un servicio de 30 minutos devuelve 09:00, 12:00, 15:00 y 18:00. Para uno de 3 horas devuelve 09:00, 12:00 y 15:00.
- [ ] Con intervalo 180, crear una reserva a las 10:00 devuelve el error `"Error de validación: el horario 10:00 no está disponible …"`, y a las 12:00 se crea.
- [ ] Una reserva creada antes del cambio, en una hora que ya no se ofrece, sigue existiendo y no cuenta como "fuera de horario" al guardar el horario.
- [ ] El bot de WhatsApp ofrece las mismas horas que la API (lee `getAvailability`).
- [ ] En Horarios hay un selector "Intervalo entre turnos", la pista de la duración del servicio más largo y una vista previa de horas que cambia al elegir otro valor.
- [ ] Al guardar, el público ve el nuevo intervalo en el modal de reserva.
- [ ] El cálculo de respaldo del front ofrece las mismas horas que el backend.
- [ ] Pasan los tests del backend (`npm test`) y del front (`npm test`), y la prueba de Playwright del paso 10.

## Decisiones

- **Sí:** el intervalo es global, en `business_settings`. Cubre el caso "servicios de 3 horas" con un campo.
- **Sí:** las horas se cuentan desde la apertura del día (`apertura + k × intervalo`). Un local que abre a las 09:30 con intervalo de 1 hora ofrece 09:30, 10:30…
- **Sí:** múltiplos de 30 entre 30 y 480. Mantiene las horas ofrecidas sobre la grilla de ocupación.
- **No:** cambiar la grilla de 30 minutos. Rompería `booking.slots` y el índice único.
- **Sí:** una sola función `offeredStarts`. Hay 4 lugares que usan la regla y no pueden divergir.
- **Sí:** la regla se valida al crear y al editar una reserva (`windowSlotsFor`). Sin eso se podría reservar una hora no ofrecida llamando a la API.
- **Sí:** "no viene = se conserva" en el `PUT`. Un cliente viejo no debe reiniciar el intervalo.
- **Sí:** las reservas existentes fuera de las nuevas horas se conservan sin aviso. Siguen siendo válidas y el aviso de "fuera de horario" mide otra cosa (apertura y cierre).
- **No:** intervalo por día ni por servicio. Si un negocio mezcla servicios muy distintos, va en otra spec.
- **No:** horas específicas por día. Si un negocio necesita pausas, va en otra spec que solo cambia `offeredStarts`.
- **Sí:** la pista del servicio más largo ayuda a elegir bien. Con servicios de 3 horas y un intervalo de 2 horas quedan huecos sin ofrecer.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un lugar usa la grilla de 30 minutos y no la regla nueva | `offeredStarts` es la única fuente. Tests en disponibilidad, creación de reserva y respaldo del front. |
| Un cliente viejo manda solo `weekly` y reinicia el intervalo | "No viene = se conserva", con test. |
| La prueba de punta a punta deja el intervalo en 180 y rompe las demás | La limpieza lo restaura a 30 y el helper de e2e se actualiza. |
| Un intervalo mal elegido deja huecos (servicios de 3 h con intervalo de 2 h) | La pista de la duración más larga y la vista previa. |
| El admin mueve una reserva a una hora no ofrecida y se rechaza | Es consistente con el resto. Si hace falta una excepción manual, va en otra spec. |

## Lo que **no** está en esta spec

- Horas específicas por día, pausas o turnos irregulares.
- Intervalo por servicio o por día.
- Cambiar la grilla de 30 minutos o permitir minutos sueltos.
- Capacidad de varios turnos simultáneos.

Cada uno, si llega, va en su propia spec.
