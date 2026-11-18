# SPEC 02 — Cancelación de reservas por link con token

> **Status:** aprobado
> **Depends on:** SPEC 01 (`01-dashboard-config-admin`, ya implementada; su archivo no está hoy en `specs/`, ver Precondiciones)
> **Date:** 2026-11-15
> **Objective:** Permitir que el cliente cancele su reserva sin crear cuenta, desde un link con token secreto, hasta 1 minuto antes de la hora de inicio.

---
si
## Por qué existe esta spec

Hoy el cliente no tiene forma de cancelar. El único camino es `PATCH /bookings/:id` con `status: 'cancelled'` o `DELETE`, y ambos son **públicos** (los usa el panel admin). Además existe una regla de 5 horas (`APP_CONFIG.CANCELLATION_HOURS` y el texto del email de confirmación) que no aplica en ninguna pantalla.

Se descartó el login con Google: para cancelar no hace falta identidad, basta con probar que se posee la reserva. Un token aleatorio de un solo uso por reserva lo resuelve sin modelo de usuario ni sesiones.

Sin proteger los endpoints actuales la regla del minuto sería decorativa, porque cualquiera podría saltársela con `PATCH`. Por eso la spec cierra también ese hueco.

## Precondiciones

- `feat/dashboard-config-admin` está mergeada en `master` de **ambos** repos. En este checkout `master` no la contiene (no hay `playwright.config.js` ni `@playwright/test` en el front), aunque las ramas existen en `origin`. Hay que actualizar `master` antes de empezar.
- `ADMIN_API_KEY` y `BUSINESS_TIMEZONE` definidas en el entorno del backend.
- Los working trees están limpios (los cambios ajenos van a stash antes de crear la rama).

## Alcance

**Dentro:**

- Rama `feat/booking-cancellation` en `BookingApp_Front` y `BookingApp_Back` (propuesta, cambiar si se prefiere otro nombre).
- Backend: cada reserva nueva genera un token de cancelación. Solo se guarda su hash SHA-256.
- Backend: dos endpoints públicos por token, uno para consultar y otro para cancelar.
- Regla de tiempo: se puede cancelar mientras `ahora <= inicio de la reserva − 1 minuto`, medido en `BUSINESS_TIMEZONE`. Desde ese minuto en adelante no.
- Backend: `GET /bookings`, `GET /bookings/statistics`, `GET /bookings/:id`, `PATCH /bookings/:id` y `DELETE /bookings/:id` pasan a exigir `ADMIN_API_KEY`.
- Backend: evento de socket `bookingCancelled` con datos mínimos.
- Email de confirmación con el link de cancelación, reemplazando el texto de las 5 horas.
- Email al cliente cuando cancela por link. Aviso al admin por WhatsApp con el mecanismo de `AdminBookingNotifier`.
- Frontend: página `/cancelar/:token`.
- Frontend: el modal de confirmación de reserva muestra el link de cancelación.
- Frontend admin: las llamadas a reservas envían la clave, y la tabla de reservas tiene un botón "Cancelar" sin restricción horaria. El panel se actualiza con `bookingCancelled`.
- Eliminar `CANCELLATION_HOURS` y `canCancelBooking`.
- Verificación del flujo con Playwright contra backend local y base descartable.

**Fuera de alcance (otras specs):**

- Login o registro con Google, cuentas de usuario y "Mis reservas".
- Reprogramar una reserva. Solo se cancela.
- Que el cliente pueda cancelar reservas anteriores a esta spec (no tienen token). Solo el admin puede.
- Entregar el link por el bot de WhatsApp. Las reservas del bot no tienen email.
- Aviso al cliente cuando el **admin** cancela. El admin lo conoce y puede avisarle.
- Quitar los datos personales del evento `newBooking` del socket, que hoy es público.
- Limitar la frecuencia de requests (rate limiting).
- Reembolsos, cargos o penalizaciones.

## Modelo de datos

**Backend: campo nuevo en `Booking` (`src/bookings/schemas/booking.schema.ts`).**

```ts
@Prop({ type: String, select: false })
cancelTokenHash?: string; // SHA-256 hex del token. Nunca el token en claro.

// Índice nuevo: búsqueda por hash.
BookingSchema.index({ cancelTokenHash: 1 }, { unique: true, sparse: true });
```

Convenciones:

- Token: 32 bytes de `crypto.randomBytes`, codificados en base64url (43 caracteres).
- El token en claro solo existe en la respuesta de `POST /bookings` y en el email de confirmación. No se loguea.
- `select: false` evita que las consultas devuelvan el hash. Un documento recién guardado sí lo contiene, así que se elimina explícitamente de la respuesta, del socket y del email.
- El estado de la reserva sigue siendo `confirmed` | `cancelled`. Cancelar libera el turno porque el índice único ignora las canceladas.
- Las reservas anteriores no tienen `cancelTokenHash`. Son válidas y no se migran.

**Contrato HTTP.** Todo bajo el prefijo global `/api`.

```
POST /bookings                    (público, sin cambios de entrada)
  -> reserva (sin cancelTokenHash) + { cancelToken: string }

GET  /bookings/cancel/:token      (público)
  -> 200 { state: 'cancellable' | 'closed' | 'cancelled',
           services: [{ name }], professional: { name }, date, time }
  -> 404 token inexistente o inválido
  -> 503 BUSINESS_TIMEZONE sin definir o inválida

POST /bookings/cancel/:token      (público)
  -> 200 { state: 'cancelled', ...mismo resumen }   (idempotente si ya estaba cancelada)
  -> 409 pasado el límite (state 'closed')
  -> 404 token inexistente
  -> 503 BUSINESS_TIMEZONE sin definir o inválida

GET /bookings, /bookings/statistics, /bookings/:id, PATCH /bookings/:id, DELETE /bookings/:id
  -> requieren Authorization: Bearer <ADMIN_API_KEY>, si no 401
```

`state` en el `GET`: `cancelled` si el estado es `cancelled`, `closed` si ya pasó el límite, `cancellable` en el resto. El resumen nunca incluye nombre, teléfono ni email del cliente.

**Socket.** `bookingCancelled` emite solo `{ id, status: 'cancelled' }`.

**Variables de entorno nuevas (`.env.example`).**

```
PUBLIC_APP_URL=                           # base del front, ej. https://tu-dominio. Si falta, el email sale sin link.
WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME=      # plantilla aprobada por Meta. Si falta, no se envía el aviso por WhatsApp.
```

**Frontend: archivos nuevos propuestos.**

- `src/pages/CancelBooking.jsx`
- `src/services/cancellationService.js`

**Backend: archivos nuevos propuestos.**

- `src/bookings/cancellation.ts` (token, hash y regla del minuto, funciones puras)
- `docs/booking-cancellation.md`

## Plan de implementación

Cada paso deja el sistema funcional. Pasos 2 a 8 en backend, 9 a 12 en frontend.

1. Actualizar `master` en ambos repos y confirmar que contiene la spec 01 (existen `src/admin/` en el back y `src/state/catalogState.jsx` en el front, y los tests pasan). Crear `feat/booking-cancellation` en ambos.
2. **BE.** `src/bookings/cancellation.ts` con `generateCancelToken()`, `hashCancelToken()` y `canCancelAt(date, time, now)`, con la regla del minuto. Tests primero, incluyendo el límite exacto (T−60 s permitido, T−59 s no) y el cambio de día.
3. **BE.** Campo `cancelTokenHash` e índice. `BookingsService.create` genera el token, guarda el hash y devuelve la reserva sin hash más `cancelToken`. El gateway recibe una copia sin el hash.
4. **BE.** `getCancellation(token)` y `cancelByToken(token)` en `BookingsService`, con las rutas `GET` y `POST /bookings/cancel/:token`. La hora actual sale de `BUSINESS_TIMEZONE` con el helper existente de `whatsapp/bot/business-time.ts`. Sin zona válida responde 503.
5. **BE.** `AdminKeyGuard` sobre las cinco rutas de reservas listadas. `BookingsModule` importa `AuthModule`. `POST /bookings`, `POST /bookings/availability` y las rutas de cancelación siguen públicas. Actualizar los specs del controller.
6. **BE.** `BookingsGateway.notifyBookingCancelled` emite `bookingCancelled` con `{ id, status }`. Se llama desde `cancelByToken`.
7. **BE.** `EmailService`: el email de confirmación reemplaza "al menos 5 horas de anticipación" por un botón con `${PUBLIC_APP_URL}/cancelar/<token>` (sin `PUBLIC_APP_URL` omite el bloque y la frase). Nuevo `sendCancellationConfirmation`. Ambos son no críticos: un fallo se loguea y no rompe la cancelación.
8. **BE.** `AdminBookingNotifier.notifyCancelledBooking`, con los mismos 6 parámetros que el aviso de nueva reserva y la plantilla de `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME`. Si la variable falta, omite con un warning. Documentar en `.env.example` y `docs/booking-cancellation.md`.
9. **FE.** Eliminar `CANCELLATION_HOURS` de `appConfig.js` y `canCancelBooking` de `format.js` con sus tests. `cancellationService.js` y la página `CancelBooking.jsx` con la ruta `/cancelar/:token` en `App.jsx`. Estados: cargando, token inválido, cancelable, ya cancelada, cerrada y cancelada con éxito (con enlace "Reservar de nuevo"). La cancelación pide confirmación con el diálogo existente.
10. **FE.** `bookingService.createBooking` conserva `cancelToken`. El `ConfirmationModal` muestra el link `${window.location.origin}/cancelar/<token>` con "Copiar enlace" y un aviso de hasta cuándo se puede cancelar.
11. **FE admin.** Las funciones de reservas de `adminService.js` (`getBookings`, `getStatistics`, `deleteBooking`) envían `Authorization: Bearer` por `adminRequest`, con el manejo de 401 que ya existe. Agregar `cancelBooking(id)` con `PATCH { status: 'cancelled' }`.
12. **FE admin.** Botón "Cancelar" en `BookingsTable` con `ConfirmDialog`, visible solo en reservas confirmadas y sin restricción horaria. `realtimeService` escucha `bookingCancelled` y actualiza la fila.
13. **E2E.** `e2e/specs/booking-cancellation/booking-cancellation.spec.js` sobre la infraestructura de Playwright de la spec 01 (Mongo descartable `booking_e2e`, backend desde un directorio sin `.env`, mail y WhatsApp bloqueados). Para el estado "cerrada" se inserta una reserva pasada directamente en la base descartable, con un token cuyo hash calcula el test.

## Criterios de aceptación

- [ ] `npx jest` en el backend y `npm test` en el front pasan sin fallos.
- [ ] `npx tsc --noEmit -p tsconfig.build.json` en el backend y `npm run build` en el front terminan sin errores.
- [ ] `POST /bookings` devuelve `cancelToken` de 43 caracteres y la respuesta no contiene `cancelTokenHash`.
- [ ] En Mongo el documento guarda `cancelTokenHash` y no el token en claro.
- [ ] `GET /bookings/cancel/<token>` devuelve servicios, profesional, fecha y hora, sin nombre, teléfono ni email del cliente.
- [ ] Con la hora de negocio en `inicio − 60 s` la cancelación se acepta. En `inicio − 59 s`, en `inicio` y después de `inicio`, responde 409.
- [ ] Una reserva cancelada deja libre su turno: la disponibilidad lo ofrece de nuevo.
- [ ] Cancelar dos veces con el mismo token responde 200 la segunda vez y no cambia nada.
- [ ] Un token inexistente responde 404.
- [ ] Con `BUSINESS_TIMEZONE` sin definir, `GET` y `POST /bookings/cancel/:token` responden 503.
- [ ] Sin `Authorization` o con clave incorrecta, `GET /bookings`, `/statistics`, `/:id`, `PATCH` y `DELETE` responden 401.
- [ ] `POST /bookings` y `POST /bookings/availability` siguen funcionando sin clave.
- [ ] El evento de socket `bookingCancelled` contiene solo `id` y `status`, y ningún payload de socket contiene `cancelTokenHash`.
- [ ] El email de confirmación contiene el link `/cancelar/<token>` y ya no contiene "5 horas".
- [ ] Una falla del envío de email o del aviso por WhatsApp no impide que la cancelación termine en 200.
- [ ] Sin `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME` no se intenta enviar el aviso al admin.
- [ ] La página `/cancelar/<token>` muestra el resumen y, tras confirmar, el mensaje de cancelación con "Reservar de nuevo".
- [ ] La misma página muestra mensajes distintos para token inválido, ya cancelada y "ya no se puede cancelar".
- [ ] El modal de confirmación de reserva muestra el link de cancelación y "Copiar enlace".
- [ ] `CANCELLATION_HOURS` y `canCancelBooking` ya no existen en el código.
- [ ] El panel admin carga la tabla de reservas con la clave guardada, y un 401 lo devuelve a `/login`.
- [ ] El botón "Cancelar" del admin cancela una reserva futura y una reserva a menos de 1 minuto de empezar, sin restricción.
- [ ] Una cancelación hecha por el cliente actualiza la tabla del admin sin recargar la página.
- [ ] El test de Playwright pasa de punta a punta, dos corridas seguidas.
- [ ] La base `booking_e2e` se elimina al terminar y no se escribe nada en la base real.

## Decisiones

- **Sí:** link con token secreto, sin login. Es lo más simple y no cambia la forma de reservar. **No:** login con Google, por tamaño (modelo de usuario, OAuth, sesiones) y porque solo se justifica con "Mis reservas". **No:** cancelar por teléfono o email, porque son datos adivinables.
- **Sí:** guardar solo el hash SHA-256 del token. Una filtración de la base no permite cancelar reservas. El token no se puede reenviar después, y no hace falta: se entrega al reservar y por email.
- **Sí:** la regla de 5 horas se elimina. **Sí:** el corte es `inicio − 1 minuto`, medido con `BUSINESS_TIMEZONE`, porque `date` y `time` son texto sin zona.
- **Sí:** `BUSINESS_TIMEZONE` es obligatoria para cancelar por link y falla cerrado con 503. **No:** una zona por defecto, porque adivinaría la ubicación y permitiría o negaría cancelaciones en el momento equivocado. La variable ya la exige el bot.
- **Sí:** proteger `GET`, `PATCH` y `DELETE` de `/bookings` con `ADMIN_API_KEY`, reutilizando `AdminKeyGuard` de la spec 01. **No:** dejarlos abiertos, porque la regla del minuto se podría esquivar.
- **Sí:** el admin cancela siempre, sin restricción horaria, con un botón que marca `status: 'cancelled'` y conserva el historial. **No:** usar "Eliminar" para cancelar, porque borra el historial.
- **Sí:** las reservas existentes sin token solo las cancela el admin. **No:** migrarlas, porque no hay forma de entregar el link a esos clientes.
- **Sí:** cancelar es idempotente: repetirlo no es un error. **Sí:** el 404 no distingue entre token mal formado y token inexistente, para no revelar nada.
- **Sí:** el email y el aviso por WhatsApp son no críticos y se disparan solo en la cancelación por link. **No:** avisar al cliente cuando cancela el admin.
- **Sí:** el aviso de WhatsApp al admin usa una plantilla nueva configurable por entorno. La plantilla actual es de "nueva reserva" y reutilizarla confundiría al admin. Crearla y aprobarla en Meta lo hace el usuario fuera del código, y sin ella el aviso simplemente no sale.
- **Sí:** el link del email se arma con `PUBLIC_APP_URL`, variable nueva, porque el backend no conoce la URL del front. El link del modal se arma con `window.location.origin`.
- **Sí:** el commit y el push los hace el usuario (`AutoCommitSteps: false`).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Proteger las rutas de reservas rompe cualquier cliente que las use sin clave (panel viejo en caché, scripts propios). | El panel se actualiza en el paso 11. Los scripts externos como `check-bookings.js` del backend se revisan en ese paso. |
| `BUSINESS_TIMEZONE` ausente o inválida en producción deja la cancelación por link en 503. | Falla visible y con mensaje claro. Queda como precondición y en `.env.example`. |
| El evento `newBooking` del socket es público y ya emite datos del cliente. | Fuera de alcance. Esta spec garantiza que el hash del token nunca viaja en el socket y que `bookingCancelled` solo lleva `id` y `status`. |
| Token de 256 bits en la URL puede quedar en el historial del navegador o en logs del hosting. | Es de un solo propósito, y la cancelación es la única acción que permite. No se loguea en el backend. |
| El aviso al admin por WhatsApp requiere una plantilla de Meta que todavía no existe. | Variable opcional: sin plantilla, se omite con un warning y el admin ve el cambio por el socket. |
| El corte exacto de 1 minuto depende del reloj del servidor. | La regla es una función pura con tests de borde (±1 s). Se usa el reloj del backend, no el del navegador. |

## Lo que **no** está en esta spec

- Login o registro con Google y "Mis reservas".
- Reprogramar reservas.
- Cancelación por link de las reservas anteriores a esta spec.
- Link de cancelación para reservas hechas por el bot de WhatsApp.
- Aviso al cliente cuando cancela el admin.
- Quitar datos personales del evento `newBooking` del socket.
- Rate limiting.
- Reembolsos o penalizaciones.

Cada uno de estos puntos, si se hace, va en su propia spec.

---

## Revisión posterior: el modal ya no muestra el link (2026-11-18)

Esta sección reemplaza lo que el resto de la spec dice sobre el link en el modal de confirmación (alcance, paso 10 y criterio de aceptación sobre "Copiar enlace").

- El modal de confirmación **no muestra el link de cancelación ni el botón "Copiar enlace"**. En su lugar dice: `"Para cancelar la reserva puedes hacerlo desde el email."`.
- El link sigue viajando **solo en el email de confirmación**, y la página `/cancelar/:token` no cambia.
- El backend sigue devolviendo `cancelToken` en la respuesta de creación (el email se arma con él). El frontend ya no lo guarda en el estado ni lo muestra.
