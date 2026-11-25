# SPEC 18 — Aislamiento de datos por negocio (backend)

> **Status:** Aprobado (el usuario pidió seguir sin pausas; las decisiones de diseño son las que eligió antes: `X-Tenant`, clave única de admin por ahora, `/` sigue sirviendo al negocio por defecto, alta por script, bot fuera)
> **Depends on:** SPEC 17
> **Date:** 2026-11-25
> **Objective:** Que cada documento pertenezca a un negocio y que el backend solo pueda leer y escribir los del negocio del pedido, sin cambiar nada para el negocio actual.

---

## Por qué existe esta spec

Para vender la app a varios negocios, todos comparten el mismo backend y la misma base de MongoDB Atlas gratis. Atlas gratis permite 0,5 GB, 100 operaciones por segundo y como máximo 500 colecciones y 100 bases: una base o una colección por negocio se acabaría en unas decenas de clientes. El patrón es **colecciones compartidas con `tenantId` en cada documento** y un filtro que se aplica solo, de modo que ninguna consulta pueda olvidarlo.

Es la spec de más riesgo del plan: un error es una fuga de datos entre negocios. Por eso falla cerrado (una consulta sin negocio es un error, nunca "todos los datos") y la puerta de calidad son las pruebas de aislamiento.

**Cómo encaja la arquitectura hexagonal.** `domain` y `application` no conocen el negocio: los casos de uso piden y guardan sin pasar ningún `tenantId`. El negocio actual lo da un puerto (`TenantContext`) y lo aplican los **adaptadores de persistencia** y el borde HTTP. Si mañana se cambia de base, el nuevo adaptador debe pasar la misma suite de contrato de aislamiento.

Mientras la spec 19 (front por ruta) no exista, todo pedido sin `X-Tenant` usa el negocio por defecto: el sistema sigue funcionando con un solo negocio, igual que hoy.

## Alcance

**Dentro (backend `BookingApp_Back`):**

- Entidad **Tenant** (`slug`, nombre, estado, marca de "por defecto") y su módulo hexagonal `tenancy`.
- `tenantId` en `professionals`, `services`, `locations`, `business_settings`, `branding` y `bookings`.
- **Migración idempotente con modo de prueba**: crea el negocio por defecto, completa `tenantId` en lo existente y reemplaza los índices únicos por versiones con `tenantId`.
- Puerto `TenantContext` (en `shared/application`), adaptador de `AsyncLocalStorage` y **middleware** que lo resuelve desde `X-Tenant`.
- **Plugin de Mongoose `tenantScope`** en `shared/infrastructure/mongo`, aplicado a los seis esquemas: agrega el filtro a toda consulta, actualización, borrado, conteo y agregación, y completa `tenantId` al guardar. Los repositorios en memoria particionan por negocio.
- Las suites de contrato de los puertos ganan casos de **aislamiento** (dos negocios) y las corren todos los adaptadores.
- Operaciones entre negocios, explícitas y en lista cerrada: buscar una reserva por token de cancelación y resolver el negocio.
- **Tiempo real**: el socket exige la clave de admin y emite solo a la sala de su negocio (cierra la fuga actual).
- Scripts `npm run tenant:create` y `npm run tenant:migrate -- --dry-run`.
- Pruebas de aislamiento por HTTP contra Mongo real y documentación en `docs/tenancy.md`.
- Cambio mínimo en el front (`realtimeService.js` y `Admin.jsx`) para que el panel siga recibiendo avisos con el socket autenticado.

**Fuera de alcance (otras specs):**

- Rutas `/n/<slug>` y `X-Tenant` desde el navegador: spec 19.
- Cuentas de admin, contraseñas y roles: spec 20. Mientras tanto la clave `ADMIN_API_KEY` única vale para cualquier negocio: riesgo aceptado y anotado.
- Registro de negocios y asistente: spec 21. Límites de Atlas gratis (caché, límite de pedidos, TTL, respaldos): spec 22.
- Planes y cobro, recordatorios y panel del dueño: specs 23 a 25.
- **Bot de WhatsApp**: spec 26; corre siempre en el negocio por defecto y sus colecciones (`conversation_states`, `processed_messages`) no cambian.
- Zona horaria (`BUSINESS_TIMEZONE`) y `PUBLIC_APP_URL` por negocio.
- Cambiar el slug de un negocio, suspender o borrar negocios desde una interfaz.

## Modelo de datos

```ts
// Colección nueva: tenants
interface TenantRecord {
  _id: ObjectId;            // es el tenantId que llevan los demás documentos
  slug: string;             // único: /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
  name: string;             // 1 a 80 caracteres
  status: 'active' | 'suspended';
  isDefault: boolean;       // exactamente uno
  createdAt: Date;
}
// Índices: { slug: 1 } único; índice parcial único sobre isDefault: true.
```

**Slugs reservados:** `admin`, `api`, `n`, `login`, `cancelar`, `disponibilidad`, `platform`, `www`, `app`, `static`, `assets`.

| Colección | Índice antes | Índice después |
| --- | --- | --- |
| `professionals` | `{ id }` único | `{ tenantId, id }` único |
| `services` | `{ id }` único | `{ tenantId, id }` único |
| `locations` | `{ id }` único | `{ tenantId, id }` único |
| `business_settings` | `{ key }` único | `{ tenantId, key }` único |
| `branding` | `{ key }` único | `{ tenantId, key }` único |
| `bookings` (ocupación) | `{ professional.id, date, slots }` parcial único | `{ tenantId, professional.id, date, slots }` parcial único (mismo filtro) |
| `bookings` (token) | `{ cancelTokenHash }` único disperso | sin cambios: el token es aleatorio y global |

Los índices viejos **se eliminan** en la migración (si no, dos negocios no podrían tener un "Alex García"). Se agrega `{ tenantId, date }` en `bookings`.

**Contexto y resolución.**

```ts
// src/shared/application/tenant-context.port.ts
interface TenantContext { current(): { id: string; slug: string }; }   // lanza TenantContextError si no hay
// src/shared/infrastructure/tenancy/
//   async-local-storage-tenant-context.ts   adaptador
//   tenant.middleware.ts                    X-Tenant -> contexto
//   unscoped.ts                             unscoped(reason, fn): excepción explícita y auditable
```

| Pedido | Resultado |
| --- | --- |
| Sin `X-Tenant` | negocio por defecto |
| `X-Tenant` válido, existente y activo | ese negocio |
| formato inválido o inexistente | `404` `Negocio no encontrado` |
| negocio `suspended` | `403` `Este negocio no está disponible.` |

La resolución se guarda en caché 60 segundos por slug (Atlas gratis limita a 100 operaciones por segundo).

**Plugin `tenantScope`** intercepta `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `countDocuments`, `distinct`, `exists`, `aggregate` (antepone `$match`), `insertMany` y `save`/`create`. Sin contexto y sin `unscoped`, lanza `TenantContextError`. Una consulta con un `tenantId` distinto del contexto también lanza el error.

**Usos de `unscoped`** (lista cerrada, con prueba que falla si aparece otro): (1) migración y scripts; (2) `BookingReader.findByCancelToken`, que después continúa dentro del negocio de esa reserva; (3) resolución del negocio (colección `tenants`, sin `tenantId`).

**Tiempo real.** El socket exige `auth: { key, username?, tenant? }` en el handshake con la misma regla del guard de admin (puerto `AdminCredentials`); sin credenciales válidas se desconecta. Entra a la sala `tenant:<tenantId>` y los avisos `newBooking` y `bookingCancelled` se emiten solo a esa sala.

**Scripts.**

```text
npm run tenant:create -- --slug barberia-x --name "Barbería X"
  crea el negocio, su local "Principal" con el horario semilla y sus ajustes; sin profesionales ni servicios
npm run tenant:migrate -- --dry-run
  solo cuenta y reporta lo que migraría; sin --dry-run migra
```

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Módulo `tenancy` y puerto.** Entidad, reglas de slug, servicio de resolución con caché, puerto `TenantContext` y su adaptador `AsyncLocalStorage`; tests puros y con adaptador en memoria.
2. **Migración y negocio por defecto.** Crea el negocio por defecto, completa `tenantId` solo donde falta, elimina los índices viejos y crea los nuevos; idempotente y con `--dry-run`. Tests de integración: base vacía, con datos, segunda ejecución sin cambios.
3. **Plugin `tenantScope`.** Probado operación por operación contra Mongo real (incluidos agregación y `upsert`), todavía sin aplicar.
4. **Middleware y aplicación del plugin.** Middleware global, plugin en los seis esquemas, siembras y migración de arranque dentro del contexto por defecto, `unscoped` en la búsqueda por token, y el bot en el contexto por defecto. Los repositorios en memoria particionan por negocio. Los tests existentes pasan sin cambios.
5. **Suites de contrato con aislamiento.** Cada suite de repositorio gana los casos de dos negocios (no ve, no edita, no borra, mismo `id` en ambos) y corren contra Mongo y memoria.
6. **Tiempo real autenticado y por sala.** Handshake con `AdminCredentials`, salas por negocio; cambio mínimo en el front.
7. **Scripts** `tenant:create` y `tenant:migrate`, con tests de integración.
8. **Suite de aislamiento HTTP.** Por HTTP y contra Mongo real, con dos negocios: cada ruta pública y de admin, vista desde A, no devuelve ni modifica nada de B. Incluye el mismo slug de profesional en ambos, que la ocupación de uno no bloquee al otro, el token de cancelación y el socket.
9. **Documentación y cierre.** `docs/tenancy.md` (modelo, migración, respaldo y restauración en Atlas gratis, cómo agregar una colección nueva sin olvidar el plugin), actualizar docs de módulos y correr el e2e completo.

## Criterios de aceptación

- [ ] Con la base actual, tras arrancar existe el negocio por defecto y los documentos de las seis colecciones tienen `tenantId`; arrancar de nuevo no cambia nada y `--dry-run` no escribe y reporta conteos.
- [ ] Los índices únicos viejos ya no existen y los nuevos incluyen `tenantId`.
- [ ] Sin `X-Tenant`, todos los endpoints responden lo mismo que antes y el e2e completo pasa sin cambios.
- [ ] Con `X-Tenant` de otro negocio, catálogo, marca, horario, locales, disponibilidad, `/api/public-availability`, reservas y estadísticas devuelven solo datos de ese negocio.
- [ ] Dos negocios pueden tener profesional, servicio y local con el mismo `id` sin conflicto, y reservar a uno no bloquea al del mismo `id` del otro negocio.
- [ ] Una reserva, un profesional, un servicio o un local de B no se puede leer, editar, cancelar ni borrar desde A, ni conociendo su id (`404`).
- [ ] El enlace de cancelar funciona sin `X-Tenant` y solo cancela esa reserva.
- [ ] `X-Tenant` inexistente o inválido da `404` `Negocio no encontrado`; negocio suspendido da `403` `Este negocio no está disponible.`
- [ ] Una consulta sin contexto lanza `TenantContextError` (probado) y una prueba falla si aparece un `unscoped` fuera de la lista cerrada.
- [ ] `domain` y `application` no importan nada de `tenancy` ni de `tenantId` (lo comprueba el test de arquitectura).
- [ ] El socket sin credenciales se desconecta y un admin de un negocio no recibe avisos de otro.
- [ ] `npm run tenant:create` crea un negocio utilizable y rechaza slugs inválidos, repetidos o reservados.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** colecciones compartidas con `tenantId`: una base o colección por negocio no cabe en Atlas gratis.
- **Sí:** el filtro lo aplica un plugin de Mongoose en infraestructura, no cada repositorio a mano: olvidar un filtro sería una fuga.
- **Sí:** falla cerrado: sin contexto, error.
- **Sí:** el dominio y los casos de uso no conocen el negocio; un puerto lo expone y los adaptadores lo aplican (cambiar de base exige pasar el mismo contrato de aislamiento).
- **Sí:** encabezado `X-Tenant` y no prefijo en la API; sin encabezado, negocio por defecto (decidido por el usuario).
- **Sí:** misma clave `ADMIN_API_KEY` para cualquier negocio hasta la spec 20 (decidido por el usuario); riesgo anotado.
- **Sí:** crear negocios con script, no con endpoint público (decidido por el usuario).
- **Sí:** el bot queda fuera y corre en el negocio por defecto (decidido por el usuario).
- **Sí:** `tenantId` como `ObjectId`, no el slug, para poder cambiar el slug sin reescribir documentos.
- **Sí:** pruebas de integración contra la Mongo de Docker del e2e, sin dependencias nuevas.
- **Sí:** el socket exige la clave de admin: hoy emite reservas completas, con datos del cliente, a cualquiera que se conecte.
- **No:** una base ni un prefijo de colección por negocio.
- **No:** cambiar el contrato de ninguna ruta pública.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una consulta se escapa del filtro y mezcla datos entre negocios | Plugin que falla cerrado, prueba operación por operación, contrato de aislamiento en cada puerto y suite HTTP con dos negocios. |
| La migración deja datos sin `tenantId` o conserva un índice viejo | Idempotente, con `--dry-run`, tests de integración y `mongodump` previo sobre Atlas. |
| Código fuera de un pedido (arranque, temporizadores, el bot) no tiene contexto | Siembras y bot corren en el contexto por defecto; el error explícito delata cualquier otro caso. |
| Las tareas en segundo plano (avisos) pierden el contexto | `AsyncLocalStorage` se propaga por las promesas del pedido; test que crea una reserva y comprueba los avisos. |
| El socket autenticado rompe el aviso en vivo del panel | Cambio mínimo en el front dentro de esta spec y prueba del aviso. |
| Las 100 operaciones por segundo de Atlas gratis se agotan | Caché de 60 s de la resolución; el filtro viaja en la misma consulta. |
| Un adaptador de otra base olvida el aislamiento | Las suites de contrato de aislamiento son parte de lo que debe pasar. |

## Lo que **no** está en esta spec

- Rutas por negocio en el navegador (spec 19), cuentas de admin (spec 20), registro de negocios, límites de Atlas, planes y cobro, recordatorios, panel del dueño y bot de WhatsApp (specs 21 a 26).
