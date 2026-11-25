# SPEC 14 — Reservas hexagonal

> **Status:** Implementado (2026-11-25)
> **Depends on:** SPEC 13
> **Date:** 2026-11-25
> **Objective:** Migrar a arquitectura hexagonal con `Result` el módulo `bookings` (crear, leer, editar, borrar, cancelar con enlace, consultar disponibilidad de una hora y estadísticas), con las notificaciones como puertos, sin cambiar ninguna ruta ni mensaje.

---

## Por qué existe esta spec

`BookingsService` tiene unas 700 líneas y mezcla todo: valida contra el catálogo, consulta bloques ocupados, guarda en Mongoose, mapea el error de clave duplicada a un mensaje, genera y verifica el token de cancelación, avisa por WebSocket, por email y por WhatsApp al administrador, y calcula estadísticas. Los errores de negocio son `Error` con texto y el controlador decide si es un `400` buscando marcas dentro del mensaje (`'Ya existe una reserva'`, `'Error de validación'`).

Con puertos y `DomainError` con `kind`, esa búsqueda de texto desaparece, las tres notificaciones pasan a ser un puerto de "mejor esfuerzo", y esta spec reemplaza los puertos provisionales que dejaron las specs 11 y 13.

## Alcance

**Dentro (backend `BookingApp_Back`, módulo `src/bookings`):**

- Dominio: modelo `Booking`, reglas de creación y edición (campos requeridos, ventana de horas, conflicto de bloques, local del profesional), reglas del token de cancelación (formato, ventana de cancelación) y estadísticas.
- Aplicación: puertos y casos de uso de crear, listar, leer, editar, borrar, consultar y cancelar por enlace, consultar disponibilidad de una hora y estadísticas.
- Infraestructura: entidad y mapeador de Mongo, repositorios de Mongo y en memoria con su suite de contrato, controladores con sus entradas, adaptadores de notificación (socket, email, WhatsApp del administrador) y de generación de tokens, y el módulo como raíz de composición.
- **Puertos provisionales de las specs 11 y 13 que se reemplazan aquí:** `BookingActivity` (catalog) y `OccupiedSlotsReader` (availability) pasan a implementarse sobre el repositorio de reservas, sin leer la colección desde otro módulo.
- **Fachada temporal** `BookingsService` con las firmas que usa el bot (`create` y las que el bot llame), y la regla de errores de siempre para los consumidores sin migrar.
- `bookings` se agrega a `MIGRATED_MODULES` y `RESULT_MODULES`.

**Fuera de alcance (otras specs):**

- Autenticar el socket y las salas por negocio (spec 18), emails con la marca de cada negocio (spec 17) y migrar el bot (spec 26): los adaptadores de notificación envuelven lo que existe hoy.
- `admin`, `auth` y `email` (spec 17).
- Cambiar rutas, cuerpos, estados o mensajes, o la forma de los documentos.
- Aislamiento por negocio.
- El front.

## Modelo de datos

La colección `bookings` y sus índices no cambian (incluido el índice único parcial por profesional, fecha y bloque).

```text
src/bookings/
  domain/
    booking.ts                 Booking, BookedService, BookingStatus
    booking.rules.ts           campos requeridos, ventana, conflicto, profesional en el local
    cancellation.rules.ts      formato del token, estado y ventana de cancelación (zona horaria como dato)
    statistics.rules.ts        totales
    booking.errors.ts          errores de dominio con los mensajes actuales
  application/
    ports/
      booking.reader.ts / booking.writer.ts   consultas y escritura; el escritor informa el conflicto de bloque
      cancel-tokens.port.ts                   generar y calcular el hash del token
      booking-notifier.port.ts                aviso de creada y de cancelada (mejor esfuerzo, nunca rechaza)
      booking-statistics.reader.ts
      catalog-lookup.port.ts                  catálogo (provisional, envuelve la fachada)
      business-clock.port.ts                  (de availability)
    use-cases/ create, list, get, update, delete, get-cancellation, cancel-by-token, check-slot, statistics
  infrastructure/
    persistence/mongo/        entity, mapper, MongoBookingRepository, MongoBookingStatistics
    persistence/in-memory/
    notifications/            SocketBookingNotifier, EmailBookingNotifier, AdminWhatsappNotifier + CompositeBookingNotifier
    crypto/                   NodeCancelTokens
    http/                     bookings.controller.ts + inputs + presenter
  bookings.service.ts         fachada temporal
```

**Errores de dominio** (mensajes exactos de hoy; los estados de hoy se conservan):

| Falla | `kind` | HTTP | Mensaje |
| --- | --- | --- | --- |
| Faltan fecha, hora, profesional o datos del cliente | `validation` | 400 | `Fecha y hora son requeridas` / `Profesional es requerido` / `Datos del cliente son requeridos` |
| Servicio, local, profesional, hora o ventana inválidos | `validation` | 400 | los `Error de validación: ...` actuales |
| Bloque ya ocupado | `validation` | 400 | `Ya existe una reserva para <profesional> el <fecha> a las <hora>` |
| Token mal formado o desconocido | `not-found` | 404 | `Reserva no encontrada` |
| Cancelar fuera de plazo | `conflict` | 409 | `Ya no es posible cancelar esta reserva` |
| Zona horaria no verificable | `unavailable` | 503 | `No se puede verificar el horario del negocio. Intenta más tarde.` |

Se agrega el `kind` `unavailable` (503) a `DomainErrorFilter`, porque hoy es una `ServiceUnavailableException`.

**Cuerpo de los errores 400.** Hoy `BookingsController` responde con `HttpException(mensaje, 400)`, cuyo cuerpo es `{ statusCode, message }`; con el filtro único pasa a ser `{ statusCode, message, error: "Bad Request" }`. Es una diferencia **aceptada y documentada**: ningún cliente (front, bot ni tests) lee `error`, y el front usa `message`. Cualquier otra diferencia es una falla.

**Reglas que se conservan** (hay tests que las fijan): una reserva por WhatsApp no tiene email y no manda confirmación por email; los tres avisos son de mejor esfuerzo y nunca hacen fallar la reserva; el aviso al administrador se espera con un tope de 5 segundos; cancelar es atómico sobre el estado (de dos pedidos simultáneos solo uno cancela y es idempotente); un booking sin `location` pertenece al local por defecto; el token en claro solo se devuelve al crear y nunca se guarda ni se expone su hash; la estadística de "hoy" usa la fecha UTC como hoy.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Mover reglas de creación, edición, conflicto, cancelación y estadísticas a `domain/` como funciones puras con `Result`. Tests unitarios con los mensajes actuales y su orden.
2. **Puertos y casos de uso** contra adaptadores en memoria, un caso de uso por acción. Reloj y tokens inyectados.
3. **Persistencia.** Entidad, mapeador y repositorio de Mongo y en memoria con suite de contrato (`npm test` y `npm run test:int`): conflicto por bloque duplicado, cancelación atómica, token con hash que no se expone, reserva sin `location`, estadísticas, y las consultas de ocupación que necesita `availability`.
4. **Notificaciones.** Adaptadores de socket, email y WhatsApp envolviendo los servicios actuales, con mejor esfuerzo y tope de 5 s para el aviso al administrador. Test de que un aviso que falla no falla la reserva.
5. **Reemplazo de puertos provisionales.** `OccupiedSlotsReader` y `BookingActivity` se implementan sobre el repositorio de reservas. Para no crear una dependencia circular entre módulos, `BookingActivity` y `OccupiedSlotsReader` se exponen desde un módulo pequeño (`BookingReadModule`) que no importa `catalog` ni `availability`. Se borran los adaptadores que leían la colección desde otro módulo.
6. **Controlador y fachada.** Controlador con las mismas rutas, mismos guards y entradas; `BookingsService` como fachada fina con las firmas del bot. Las suites HTTP actuales se conservan con las mismas aserciones.
7. **Limpieza y cierre.** Borrar el código viejo, actualizar `docs/architecture.md` (ya no quedan puertos de reservas provisionales) y `docs/booking-slots.md`; comparación antes y después de las respuestas HTTP de todas las rutas de reservas; verificación completa.

## Criterios de aceptación

- [ ] Todas las rutas de reservas responden igual que antes: mismos códigos, y mismo `message`. La única diferencia de cuerpo permitida es el campo extra `error` en los 400.
- [ ] `bookings/domain/**` y `bookings/application/**` no importan Mongoose, HTTP, `socket.io`, `nodemailer` ni `infrastructure/**`, y no contienen `throw`, `new Date()` ni `process.env`.
- [ ] El controlador ya no decide el estado buscando texto en el mensaje: lo decide el `kind` del error.
- [ ] Un aviso (socket, email o WhatsApp) que falla no hace fallar la creación ni la cancelación.
- [ ] Dos cancelaciones simultáneas del mismo token cancelan una vez y ambas responden el resumen (idempotente).
- [ ] El token en claro solo aparece en la respuesta de creación; el hash no sale en ninguna respuesta.
- [ ] `catalog` y `availability` ya no leen la colección de reservas: usan los puertos implementados por `bookings`, sin dependencia circular de módulos.
- [ ] El bot pasa su suite sin cambios.
- [ ] Una falla de la base da `500`.
- [ ] El repositorio de Mongo y el en memoria pasan la misma suite de contrato.
- [ ] La suite HTTP de reservas corre completa sobre los adaptadores en memoria (prueba de cambio de base).
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front.

## Decisiones

- **Sí:** los avisos son un puerto de mejor esfuerzo (nunca rechaza), con tres adaptadores que envuelven socket, email y WhatsApp; así `bookings` no conoce `socket.io`, `nodemailer` ni WhatsApp.
- **Sí:** generación y hash del token son un puerto (`CancelTokens`): usa `crypto` y azar, que no pueden vivir en dominio ni casos de uso.
- **Sí:** nuevo `kind` `unavailable` → 503, para conservar ese estado sin que el dominio conozca HTTP.
- **Sí:** el conflicto por bloque ocupado sigue siendo 400 (no 409): se conserva el contrato actual con `kind: 'validation'`.
- **Sí:** diferencia aceptada y documentada: el campo `error: "Bad Request"` en los 400 de reservas.
- **Sí:** un módulo pequeño de solo lectura (`BookingReadModule`) para no crear una dependencia circular entre `catalog`, `availability` y `bookings`.
- **Sí:** el mapeador de Mongo conserva exactamente la forma de los documentos que devuelve el panel de admin (incluidos `_id`, `__v` y los campos que hoy salen).
- **No:** autenticar el socket ni salas por negocio (spec 18).
- **No:** cambiar la estadística de "hoy" a la zona del negocio.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambia la forma del documento que ve el panel de admin | Comparación HTTP antes y después de `GET /bookings`, `GET /bookings/:id` y la respuesta de creación; el e2e del panel. |
| Una notificación que falla rompe la reserva | Test por cada adaptador y por el compuesto. |
| La cancelación deja de ser atómica | Contrato de Mongo con dos cancelaciones simultáneas. |
| Dependencia circular entre módulos de Nest | `BookingReadModule` sin imports de `catalog` ni `availability`; el arranque de la app se prueba. |
| El bot recibe otra excepción de la que espera | La fachada traduce `Result` a las excepciones de antes y su suite pasa sin cambios. |

## Desvíos (decididos al implementar, 2026-11-25)

- **Los 400 ahora llevan `error: "Bad Request"`.** El filtro único de Nest añade ese campo. Es la única diferencia de cuerpo permitida y ningún cliente lo lee.
- **Un POST sin fecha, hora o datos del cliente ahora responde `400` en vez de `500`.** Antes el mensaje no coincidía con las marcas de error de negocio y caía en 500; ahora es un 400 con el mismo texto. Es una corrección, no una regresión.
- **Los puertos provisionales no se reemplazaron.** `catalog` (pregunta por reservas) y `availability` (bloques ocupados) siguen enlazando un adaptador que lee la colección de reservas desde su propia infraestructura. El módulo de lectura intermedio (`BookingsReadModule`) se probó y se descartó: Nest no resolvía el token entre módulos y el grafo quedaba circular. Los adaptadores nuevos (`MongoBookingActivityReader`, `BookingActivityAdapter`, `BookingOccupiedSlotsReader`) quedan listos para cuando `catalog` y `availability` migren.
- **Los specs del servicio y de locations viejos se borraron** (2 972 líneas): probaban la implementación eliminada. Su cobertura vive ahora en el spec de casos de uso (727 líneas), el contrato del repositorio (memoria y Mongo) y el diferencial HTTP de 71 casos. Lo que no estaba cubierto se escribió de nuevo: los avisos (token al email, orden, mejor esfuerzo, tope de 5 s) y los specs HTTP de acceso y de cancelación.
- **El comparador HTTP dio 71 casos:** 51 idénticos, 17 con el campo `error` documentado y 3 con el cambio 500 → 400. Ninguna otra diferencia.

## Lo que **no** está en esta spec

- Socket autenticado y emails por negocio (specs 17 y 18), `admin`, `auth` y `email` (spec 17), WhatsApp (spec 26) y el aislamiento por negocio (spec 18).
