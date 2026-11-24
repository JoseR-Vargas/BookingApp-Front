# SPEC 17 — Aislamiento de datos por negocio (backend)

> **Status:** aprobado (a rehacer sobre la arquitectura hexagonal)
> **Depends on:** SPEC 08
> **Date:** 2026-11-23
> **Objective:** Que cada documento de la base pertenezca a un negocio y que el backend solo pueda leer y escribir los del negocio del pedido, sin cambiar nada para el negocio actual.

---

> **Nota (2026-11-23):** este borrador se escribió antes de decidir la arquitectura hexagonal del backend (SPEC 09 a 14). Con puertos y adaptadores, el filtro por negocio deja de ser un plugin de Mongoose y pasa a ser trabajo de los adaptadores de persistencia, con un puerto `TenantContext` en `application`. Hay que reescribir *Alcance*, *Modelo de datos* y *Plan* cuando llegue su turno. Las decisiones sobre `X-Tenant`, la clave única de admin, la raíz `/`, el script de alta y el bot siguen vigentes. Los números de specs futuras de este texto quedaron desplazados; en el plan vigente el front por ruta es la spec 18, las cuentas de admin la 19 y el bot la 25.

## Por qué existe esta spec

Para vender la app a varios negocios, todos comparten el mismo backend y la misma base de MongoDB Atlas gratis. Hoy no hay noción de "negocio": un solo catálogo, una sola marca, un solo horario.

Atlas gratis permite 0,5 GB, 100 operaciones por segundo y como máximo 500 colecciones y 100 bases. Una base o una colección por negocio se acabaría en unas decenas de clientes. Por eso el patrón es **colecciones compartidas con `tenantId` en cada documento** y un filtro que el backend aplica solo, para que ninguna consulta pueda olvidarse de él.

Esta es la spec de más riesgo de todo el plan: un error aquí es una fuga de datos entre negocios. Por eso incluye pruebas de aislamiento como puerta de calidad, y falla cerrado: una consulta sin negocio es un error, nunca "todos los datos".

Mientras la spec 10 (front por ruta) no exista, todo pedido sin encabezado `X-Tenant` usa el negocio por defecto, así que el sistema sigue funcionando con un solo negocio, igual que hoy.

## Alcance

**Dentro (backend `BookingApp_Back`):**

- Entidad **Tenant** (negocio) con `slug`, nombre, estado y marca de "por defecto".
- `tenantId` en las colecciones `professionals`, `services`, `locations`, `business_settings`, `branding` y `bookings`.
- **Migración automática, idempotente y con modo de prueba**: crea el negocio por defecto, completa `tenantId` en lo existente y reemplaza los índices únicos por versiones que incluyen `tenantId`.
- **Contexto de negocio por pedido** (`AsyncLocalStorage`), resuelto del encabezado `X-Tenant`.
- **Plugin de Mongoose** que agrega el filtro de negocio a toda consulta, actualización, borrado, conteo y agregación, y completa `tenantId` al guardar.
- Rutas que dependen del token (cancelar con enlace) y el webhook del bot: contexto explícito y acotado.
- **Tiempo real**: el socket exige la clave de admin y emite solo a la sala de su negocio (cierra la fuga actual).
- Script `npm run tenant:create` y `npm run tenant:migrate -- --dry-run`.
- Pruebas de aislamiento contra una Mongo real (la de Docker del e2e) y documentación en `docs/tenancy.md`.
- Cambio mínimo en el front (`realtimeService.js` y `Admin.jsx`) para que el panel siga recibiendo avisos con el socket autenticado.

**Fuera de alcance (otras specs):**

- Rutas `/n/<slug>` y `X-Tenant` desde el navegador: **spec 10** (front por ruta).
- Cuentas de admin, contraseñas y roles por negocio: spec 11. Mientras tanto la clave `ADMIN_API_KEY` única sigue valiendo para cualquier negocio; es un riesgo aceptado y anotado.
- Registro de negocios y asistente inicial: spec 12.
- Límites de Atlas gratis (caché, límite de pedidos, TTL, respaldos): spec 13.
- Planes y cobro, recordatorios, panel del dueño: specs 14 a 16.
- **Bot de WhatsApp**: spec 17. Sus colecciones (`conversation_states`, `processed_messages`) no cambian y el bot corre siempre en el negocio por defecto.
- Zona horaria (`BUSINESS_TIMEZONE`) y `PUBLIC_APP_URL` por negocio: siguen siendo globales.
- Cambiar el slug de un negocio, suspender o borrar negocios desde una interfaz.

## Modelo de datos

```ts
// Colección nueva: tenants
interface TenantRecord {
  _id: ObjectId;            // es el tenantId que llevan los demás documentos
  slug: string;             // único, minúsculas: /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
  name: string;             // 1 a 80 caracteres
  status: 'active' | 'suspended';
  isDefault: boolean;       // exactamente uno: el negocio al que apunta todo lo anterior
  createdAt: Date;
}
// Índices: { slug: 1 } único. Un único documento con isDefault: true (índice parcial único).
```

**Slugs reservados** (no se pueden crear): `admin`, `api`, `n`, `login`, `cancelar`, `disponibilidad`, `platform`, `www`, `app`, `static`, `assets`.

**Documentos existentes** (campo nuevo `tenantId: ObjectId`, requerido y no editable después de crear):

| Colección | Índice antes | Índice después |
| --- | --- | --- |
| `professionals` | `{ id }` único | `{ tenantId, id }` único |
| `services` | `{ id }` único | `{ tenantId, id }` único |
| `locations` | `{ id }` único | `{ tenantId, id }` único |
| `business_settings` | `{ key }` único | `{ tenantId, key }` único |
| `branding` | `{ key }` único | `{ tenantId, key }` único |
| `bookings` (ocupación) | `{ professional.id, date, slots }` parcial único | `{ tenantId, professional.id, date, slots }` parcial único (mismo filtro) |
| `bookings` (token) | `{ cancelTokenHash }` único disperso | sin cambios: el token es aleatorio y global |

Los índices viejos se **eliminan** en la migración: un índice único viejo por `id` impediría que dos negocios tengan un "Alex García". Se agrega además `{ tenantId, date }` en `bookings` para las consultas del panel.

**Contexto de pedido.**

```ts
// src/tenancy/tenant-context.ts
TenantContext.run(tenant: { id: ObjectId; slug: string }, fn)   // contexto normal
TenantContext.current(): { id; slug }                          // lanza TenantContextError si no hay
TenantContext.unscoped(reason: string, fn)                      // excepción explícita y auditable
```

**Resolución del negocio** (middleware global):

| Pedido | Resultado |
| --- | --- |
| Sin `X-Tenant` | negocio por defecto |
| `X-Tenant: barberia-x` existente y activo | ese negocio |
| `X-Tenant` con formato inválido o negocio inexistente | `404` `Negocio no encontrado` |
| `X-Tenant` de un negocio `suspended` | `403` `Este negocio no está disponible.` |

El resultado se guarda en una caché en memoria de 60 segundos por slug (los negocios casi no cambian y Atlas gratis limita a 100 operaciones por segundo).

**Plugin de Mongoose `tenantScope`.** Se aplica a los seis esquemas. Intercepta `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `countDocuments`, `distinct`, `exists`, `aggregate` (antepone `$match: { tenantId }`), `insertMany` y `save`/`create`. Sin contexto y sin `unscoped`, lanza `TenantContextError`. Si una consulta ya trae un `tenantId` distinto del contexto, también lanza el error.

**Usos de `unscoped`** (lista cerrada, con prueba que falla si aparece otro):

1. Migración y script `tenant:create`.
2. Búsqueda de una reserva por `cancelTokenHash` (cancelar con enlace); después de encontrarla se continúa con `TenantContext.run` en el negocio de esa reserva.
3. Resolución del negocio (colección `tenants`, que no lleva `tenantId`).

**Tiempo real.** El socket pasa a exigir `auth: { key, username?, tenant? }` en el handshake, con la misma regla que `AdminKeyGuard` (se extrae a una función compartida). Sin credenciales válidas se desconecta. Al conectar entra a la sala `tenant:<tenantId>` y los avisos `newBooking` y `bookingCancelled` se emiten solo a esa sala.

**Script.**

```text
npm run tenant:create -- --slug barberia-x --name "Barbería X"
  crea el negocio, su local "Principal" con el horario semilla y sus ajustes por defecto; sin profesionales ni servicios
npm run tenant:migrate -- --dry-run
  solo cuenta y reporta lo que migraría, sin escribir nada
```

## Plan de implementación

Cada paso deja el sistema funcionando con un solo negocio.

1. **Esqueleto de `tenancy`.** Módulo `src/tenancy/` con el esquema `TenantRecord`, `TenantContext` (`AsyncLocalStorage`), `TenantService` con caché de 60 s y las reglas de slug. Tests unitarios. Sin efecto en el sistema todavía.
2. **Arnés de pruebas de integración.** Script `npm run test:int` y helper que se conecta a la Mongo de Docker del e2e (`mongodb://localhost:27018`, base de pruebas aparte), la limpia entre pruebas y **falla con un mensaje claro si no está disponible**. Ningún test de integración se salta en silencio.
3. **Migración y negocio por defecto.** Crea el negocio por defecto, agrega `tenantId` a todo lo existente (`updateMany` solo donde falta), elimina los índices únicos viejos y crea los nuevos. Idempotente, con `--dry-run`. Tests de integración: base vacía, base con datos, segunda ejecución sin cambios, un negocio ya existente.
4. **Plugin `tenantScope`.** Implementación y tests de integración operación por operación, incluida una agregación y un `upsert`. Todavía sin aplicarlo a los esquemas.
5. **Middleware y aplicación del plugin.** Middleware global de resolución de negocio, plugin en los seis esquemas, siembras de arranque (`CatalogService.onModuleInit`, locales) dentro del contexto del negocio por defecto, `unscoped` en cancelar por token, y el webhook del bot en el contexto por defecto. Los tests existentes deben seguir pasando; los que usan dobles de modelo siguen sin cambios.
6. **Tiempo real autenticado y por sala.** Función compartida de credenciales de admin, handshake, salas por negocio. Cambio mínimo en `realtimeService.js` y `Admin.jsx` del front para mandar la clave. Tests del gateway.
7. **Script `tenant:create`.** Crea un negocio completo y usable. Tests de integración.
8. **Suite de aislamiento.** Por HTTP y contra Mongo real: con dos negocios, cada ruta pública y de admin, vista desde el negocio A, no devuelve ni modifica nada del B. Incluye el mismo slug de profesional en ambos, la ocupación de un profesional que no bloquea al del otro negocio, el token de cancelación y el socket.
9. **Documentación y cierre.** `docs/tenancy.md` (modelo, migración, cómo respaldar y restaurar en Atlas gratis, cómo agregar una colección nueva sin olvidar el plugin), actualizar `docs/locations.md` y `docs/public-availability.md`, y comprobación final con el e2e completo.

## Criterios de aceptación

- [ ] Con la base actual, tras arrancar existe el negocio por defecto y todos los documentos de las seis colecciones tienen `tenantId`.
- [ ] Arrancar de nuevo no cambia nada (la migración es idempotente), y `--dry-run` no escribe nada y reporta los conteos.
- [ ] Los índices únicos viejos ya no existen y los nuevos incluyen `tenantId`.
- [ ] Sin `X-Tenant`, todos los endpoints responden lo mismo que antes de esta spec, y el e2e completo sigue pasando sin cambios.
- [ ] Con `X-Tenant` de otro negocio, el catálogo, la marca, el horario, los locales, la disponibilidad, `/api/public-availability`, las reservas y las estadísticas devuelven solo datos de ese negocio.
- [ ] Dos negocios pueden tener un profesional, servicio y local con el mismo `id` (por ejemplo `alex-garcia`) sin conflicto.
- [ ] Reservar a un profesional en el negocio A no bloquea al profesional del mismo `id` del negocio B.
- [ ] Una reserva, un profesional, un servicio o un local del negocio B no se puede leer, editar, cancelar ni borrar desde el negocio A, ni siquiera conociendo su id (responde `404`).
- [ ] El enlace de cancelar de una reserva funciona sin `X-Tenant` y solo cancela esa reserva.
- [ ] `X-Tenant` inexistente o con formato inválido da `404` `Negocio no encontrado`; un negocio suspendido da `403` `Este negocio no está disponible.`
- [ ] Una consulta sin contexto de negocio lanza `TenantContextError` (probado), y una prueba falla si aparece un uso de `unscoped` fuera de la lista cerrada.
- [ ] El socket sin credenciales válidas se desconecta, y un admin conectado a un negocio no recibe los avisos de otro.
- [ ] `npm run tenant:create` crea un negocio utilizable por la API y rechaza slugs inválidos, repetidos o reservados.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** colecciones compartidas con `tenantId`. Una base o colección por negocio no cabe en Atlas gratis (500 colecciones, 0,5 GB compartidos).
- **Sí:** el filtro lo aplica un plugin y no cada servicio a mano. Olvidar un filtro en una sola consulta sería una fuga.
- **Sí:** falla cerrado. Sin contexto, error; nunca "sin filtro".
- **Sí:** encabezado `X-Tenant` y no un prefijo en la API (decidido por el usuario). Las rutas de la API no cambian.
- **Sí:** sin encabezado, negocio por defecto (decidido por el usuario). Es lo que mantiene el sistema funcionando mientras el front no manda el encabezado.
- **Sí:** misma clave `ADMIN_API_KEY` para cualquier negocio hasta la spec 11 (decidido por el usuario). Queda anotado como riesgo.
- **Sí:** crear negocios con un script y no con un endpoint público (decidido por el usuario): menos superficie de ataque.
- **Sí:** el bot queda fuera y corre en el negocio por defecto (decidido por el usuario).
- **Sí:** `tenantId` como `ObjectId` y no el slug, para que cambiar el slug en el futuro no obligue a reescribir documentos.
- **Sí:** pruebas de integración contra la Mongo de Docker que ya usa el e2e, sin dependencias nuevas. Los dobles en memoria de los tests actuales no ejecutan plugins y no pueden probar el aislamiento.
- **Sí:** el socket exige la clave de admin. Hoy emite reservas completas, con datos del cliente, a cualquiera que se conecte; con varios negocios sería una fuga cruzada.
- **Sí:** la migración se queda en el código (idempotente y con `--dry-run`) aunque los datos de hoy sean de prueba, para poder reutilizarla con datos reales.
- **No:** una base por negocio, ni un prefijo de colección por negocio.
- **No:** cambiar el contrato de `POST /api/bookings` ni de ninguna ruta pública.
- **No:** `mongodb-memory-server` (dependencia nueva y descarga de un binario); se usa el Docker que ya hay.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una consulta se escapa del filtro y mezcla datos entre negocios | Plugin que falla cerrado, prueba operación por operación, suite de aislamiento por HTTP y lista cerrada de `unscoped` con prueba. |
| La migración deja datos sin `tenantId` o conserva un índice viejo | Idempotente, con `--dry-run`, con tests de integración y con un `mongodump` obligatorio antes de ejecutarla sobre Atlas. |
| Código que corre fuera de un pedido (arranque, temporizadores, el bot) no tiene contexto y falla | Siembras y bot ejecutan dentro del contexto del negocio por defecto; el error explícito delata cualquier otro caso. |
| Las tareas en segundo plano (el email de confirmación) pierden el contexto | `AsyncLocalStorage` se propaga por las promesas del pedido; test que envía una reserva y comprueba el email con la marca del negocio correcto. |
| Los tests de integración no corren por falta de Docker y nadie se entera | `test:int` falla con un mensaje claro; el cierre exige correrlo. |
| La clave única de admin da acceso a cualquier negocio | Riesgo aceptado hasta la spec 11; solo la conoce el dueño. Anotado en `docs/tenancy.md`. |
| El socket autenticado rompe el aviso en vivo del panel | Cambio mínimo en el front dentro de esta misma spec y una prueba e2e del aviso. |
| Los 100 operaciones por segundo de Atlas gratis se agotan con las consultas extra | Caché de 60 s de la resolución del negocio; el resto del filtro viaja dentro de la misma consulta, sin consultas adicionales. |

## Lo que **no** está en esta spec

- Rutas `/n/<slug>` en el navegador (spec 10).
- Cuentas y contraseñas de admin (spec 11).
- Registro, asistente de alta, límites de Atlas, planes y cobro, recordatorios, panel del dueño y bot de WhatsApp (specs 12 a 17).
