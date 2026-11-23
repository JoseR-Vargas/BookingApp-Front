# SPEC 06 — Horas de inicio por día en Horarios

> **Status:** Implementado
> **Depends on:** SPEC 05 (`05-schedule-start-interval`)
> **Date:** 2026-11-19
> **Objective:** Permitir que el admin elija, día por día, las horas exactas que se ofrecen al público (lunes 09:00, 12:00, 16:00; martes 10:00, 15:00), con pausas y turnos irregulares.

---

## Por qué existe esta spec

SPEC 05 dejó un intervalo global. No sirve si el lunes y el martes necesitan horas distintas, o si hay una pausa de almuerzo. `offeredStarts` ya es el único lugar de la regla: esta spec solo la extiende.

La ocupación sigue en bloques de 30 minutos (`booking.slots`, índice único). Las horas elegidas son siempre un subconjunto de esa grilla: sin migración.

## Precondiciones

- SPEC 05 implementada y commiteada (la rama de esta spec sale de ella o de `master` si ya se mergeó).
- Mongo descartable de e2e en Docker (`booking-e2e-mongo`).

## Alcance

**Dentro:**

- Backend: cada día abierto puede tener `starts` (lista opcional de horas `HH:mm`). Con `starts`, el público ve exactamente esas horas (si están libres y el servicio cabe antes del cierre). Sin `starts`, rige el intervalo global de SPEC 05.
- Backend: `PUT /api/admin/schedule` valida y guarda `starts` por día. `GET /api/catalog` y `GET /api/admin/catalog` lo devuelven.
- Backend: crear o editar una reserva rechaza una hora fuera de la lista del día (mismo error de hoy).
- Front: en cada día abierto, la lista de horas se edita marcando bloques de 30 min, con "Usar el intervalo general" y "Copiar a otros días".
- Front: la vista previa y el cálculo de respaldo respetan `starts`.
- Documentación: `docs/booking-slots.md`.

**Fuera de alcance:**

- Excepciones por fecha concreta (feriados, un día suelto).
- Horas distintas por profesional o por servicio.
- Cambiar la grilla de 30 minutos (nada de 09:15).
- Cambios a reservas existentes.

## Modelo de datos

Día abierto en `weekly`:

```ts
{ closed: false, open: 'HH:mm', close: 'HH:mm', starts?: string[] }
```

**Regla** (`offeredStarts`, única fuente):

1. Día cerrado → `[]`.
2. Con `starts` → esas horas.
3. Sin `starts` → regla de SPEC 05 (`apertura + k × intervalo`).

La contigüidad de hoy sigue igual: la hora se ofrece solo si todos sus bloques están libres y el servicio cabe antes del cierre.

**Validación de `starts`** (400 con el mensaje exacto):

| Caso | Mensaje |
| --- | --- |
| No es una lista de textos `HH:mm`, está vacía, o repite horas | `Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.` |
| Una hora no cae en la grilla de 30 min, o está fuera de `[apertura, cierre)` | `Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.` |

- Se guardan ordenadas.
- `starts` en un día cerrado se ignora (no se guarda).
- Si `starts` **no viene** para un día, se borra su lista y rige el intervalo global (el `PUT` reemplaza todo el `weekly`, como hoy).

**Ejemplo** (09:00 a 20:00, intervalo global 30):

| Día | `starts` | El público ve |
| --- | --- | --- |
| Lunes | `["09:00","12:00","16:00"]` | 09:00, 12:00, 16:00 |
| Martes | sin `starts` | 09:00, 09:30 … 19:30 |

## Plan de implementación

**Backend (`BookingApp_Back`):**

1. `availability.calculator.ts`: `offeredStarts` usa `starts` del día. Tests: sin `starts` igual a SPEC 05; con `starts`; pausa de almuerzo; día cerrado; hora que no cabe.
2. `catalog.config.ts`, `catalog-validation.ts`: tipo y validación de `starts` con los dos mensajes. Tests por caso.
3. `catalog-admin.service.ts`: guarda y devuelve `starts` (ordenadas, sin ellas en días cerrados). Tests HTTP: guarda, devuelve en `GET /api/catalog`, 400, 401.
4. `bookings.service.ts` (`windowSlotsFor`) y disponibilidad: ya pasan por `offeredStarts`; tests con `starts` distintos por día.
5. `docs/booking-slots.md`.

**Front (`BookingApp_Front`):**

6. `src/utils/schedule.js`: `offeredStartTimes` y el respaldo aceptan `starts`.
7. `ScheduleTab.jsx`: por día abierto, bloques de 30 min marcables entre apertura y cierre; botón "Usar el intervalo general" (borra la lista) y "Copiar a otros días". Si cambia apertura o cierre, se descartan las horas que quedan fuera. La vista previa sigue mostrando el primer día abierto con su lista; los bloques marcados de cada día son su propia vista previa. Tests.
8. `adminService.js`: `saveSchedule` envía `starts` dentro de cada día. Tests.
9. Prueba de punta a punta (`e2e/specs/schedule-start-times/`); la limpieza restaura el horario semilla sin `starts`.

## Criterios de aceptación

- [ ] Sin configurar nada, todo se comporta como en SPEC 05.
- [ ] `PUT /api/admin/schedule` con `starts` en el lunes lo guarda ordenado y `GET /api/catalog` lo devuelve.
- [ ] Con lunes `["09:00","12:00","16:00"]`, la disponibilidad del lunes devuelve solo esas horas (las libres) y el martes sigue con su regla.
- [ ] Crear una reserva el lunes a las 10:00 devuelve `Error de validación: el horario 10:00 no está disponible …`; a las 12:00 se crea.
- [ ] Una lista vacía, repetida, con formato malo, fuera del horario o fuera de la grilla devuelve 400 con el mensaje que corresponde.
- [ ] Un `PUT` sin `starts` en un día borra su lista y vuelve al intervalo global.
- [ ] Sin `ADMIN_API_KEY`, 401.
- [ ] Una reserva existente fuera de la nueva lista sigue válida.
- [ ] El bot de WhatsApp ofrece las mismas horas (lee `getAvailability`).
- [ ] En Horarios se marcan bloques por día, la vista previa los refleja y al guardar el modal público los muestra.
- [ ] Pasan `npm test` en ambos repos y el e2e.

## Decisiones

- **Sí:** lista de horas por día (opción 2): cubre intervalos, pausas y turnos irregulares.
- **Sí:** `starts` opcional; sin él rige el intervalo global. Los horarios actuales no cambian.
- **Sí:** el `PUT` reemplaza todo el `weekly`, como hoy; omitir `starts` en un día lo borra.
- **Sí:** solo múltiplos de 30 dentro del horario. Mantiene todo sobre la grilla de ocupación.
- **Sí:** una sola función `offeredStarts` (regla única).
- **No:** excepciones por fecha, por profesional o por servicio.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambiar apertura o cierre deja horas fuera del día | El front las descarta; el backend rechaza con 400. |
| Un cliente viejo manda `weekly` sin `starts` y borra las listas | Es el contrato (reemplazo total); el front siempre reenvía `starts`. Tests. |
| Una lista muy corta deja al público sin horas | La vista previa lo muestra antes de guardar. |
| El e2e deja `starts` guardadas y rompe otros tests | La limpieza restaura el horario semilla. |
