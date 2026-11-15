# SPEC 01 — Panel de configuración del negocio en el admin

> **Status:** implementado
> **Depends on:** ninguna
> **Date:** 2026-11-14
> **Objective:** Agregar al panel admin una sección "Configuración" para gestionar profesionales, servicios (nombre, descripción, precio, duración) y horarios de apertura por día, persistidos en backend y consumidos por el sitio público.

---

## Por qué existe esta spec

Hoy el catálogo vive hardcodeado en dos lugares que hay que mantener iguales a mano: `BookingApp_Back/src/catalog/catalog.config.ts` y `BookingApp_Front/src/config/appConfig.js`. Cambiar un precio o un horario exige tocar código y desplegar.

Además, el backend no tiene autenticación. El login del front (`src/services/authService.js`) compara `admin` / `admin123` en el cliente. Exponer endpoints de escritura sobre el catálogo sin auth permitiría que cualquiera cambie precios y horarios, por eso esta spec incluye un guard mínimo.

## Alcance

**Dentro:**

- Rama `feat/dashboard-config-admin` en ambos repos (`BookingApp_Front` y `BookingApp_Back`).
- Backend: colecciones Mongo `professionals`, `services` y `business_settings`, sembradas con los valores actuales de `catalog.config.ts` si están vacías.
- Backend: `CatalogService` pasa a leer de Mongo. `GET /catalog` mantiene su forma actual y devuelve solo profesionales y servicios activos.
- Backend: `AdminKeyGuard` con la variable de entorno `ADMIN_API_KEY`, aplicado a los endpoints nuevos de `/admin/*`.
- Backend: endpoints admin para crear y editar profesionales y servicios, baja lógica, y guardar el horario semanal.
- Horario por día: abierto o cerrado, con hora de apertura y cierre en pasos de 30 min (`HH:mm`). La grilla de turnos sigue fija en 30 min y la ocupación sigue calculándose con la lógica actual del backend (`availability.calculator.ts`).
- Frontend público: carga el catálogo desde `GET /catalog` y deja de usar `APP_CONFIG.PROFESSIONALS`, `SERVICES` y `BUSINESS_HOURS`. Si la carga falla, el modal de reserva muestra un error con "Reintentar".
- Frontend admin: sección "Configuración" en el sidebar con tres pestañas: Profesionales, Servicios y Horarios.
- Login del front validado contra el backend con `ADMIN_API_KEY`.
- Verificación del flujo completo con Playwright contra un backend local y una base Mongo descartable.
- Los cambios quedan en staged changes en ambos repos. No se hace commit ni push.

**Fuera de alcance (otras specs):**

- Multi-negocio o multi-tenant, con varios admins y negocios aislados.
- Usuarios y contraseñas en base de datos o JWT.
- Proteger los endpoints existentes de reservas (`GET /bookings`, `PATCH`, `DELETE`, `statistics`). Hoy son públicos y siguen igual.
- Horario distinto por profesional, descansos y feriados.
- Cambiar el intervalo de 30 min o la regla de ocupación.
- Editar `rating` y `avatar` de profesionales, o el ícono de servicios. Quedan con valores por defecto.
- Subir fotos de profesionales.
- Cambios de comportamiento en el bot de WhatsApp. Solo se admiten los cambios mecánicos (`await`) que exige que `CatalogService` sea asíncrono.
- Migrar reservas existentes cuando cambia el horario. Las reservas quedan intactas.

## Modelo de datos

**Backend: colecciones Mongo nuevas.**

```ts
// professionals
{
  id: string;          // slug generado del nombre, único e inmutable (ej. 'alex-garcia')
  name: string;
  specialty: string;
  experience: string;  // texto libre, ej. '8 años'
  rating: number;      // default 5; no editable en esta spec
  avatar: string;      // default 'fas fa-user'; no editable
  active: boolean;     // default true
}

// services
{
  id: string;          // slug generado del nombre, único e inmutable
  name: string;
  description: string;
  price: number;       // entero >= 0
  duration: number;    // minutos, entero de 5 a 480
  professionals: string[]; // ids de professionals que lo ofrecen
  icon: string;        // default 'fas fa-star'; no editable
  active: boolean;     // default true
}

// business_settings (un único documento, key = 'schedule')
{
  key: 'schedule';
  weekly: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { closed: true } | { closed: false; open: string; close: string }>;
  slotIntervalMinutes: 30; // fijo
}
```

Convenciones:

- `open` y `close` son strings `HH:mm`, múltiplos de 30 min, con `open < close`. Reemplazan los enteros de hora actuales de `DaySchedule` en `catalog.config.ts`.
- `0` = domingo, igual que `Date.getDay()`.
- Los `id` sembrados conservan los valores actuales (`alex-garcia`, `maria-lopez`, `consulta-inicial`, `servicio-basico`, `servicio-premium`, `sesion-expres`) para no invalidar reservas existentes.
- Las reservas siguen guardando nombres y ids embebidos. No cambia `booking.schema.ts`.

**Contrato HTTP nuevo.** Todos requieren `Authorization: Bearer <ADMIN_API_KEY>`.

```
GET    /admin/session                  -> 200 { ok: true } | 401
GET    /admin/catalog                  -> { professionals, services, schedule }  (incluye inactivos)
POST   /admin/professionals            -> crea
PATCH  /admin/professionals/:id        -> edita name, specialty, experience, active
DELETE /admin/professionals/:id        -> baja lógica (active = false)
POST   /admin/services                 -> crea
PATCH  /admin/services/:id             -> edita name, description, price, duration, professionals, active
DELETE /admin/services/:id             -> baja lógica (active = false)
PUT    /admin/schedule                 -> { schedule, affectedBookings: number }
```

`affectedBookings` es la cantidad de reservas con `status != 'cancelled'` y `date >= hoy` cuyo día quedó cerrado o cuyos `slots` caen fuera del nuevo horario. No se bloquea el guardado.

**Frontend: archivos nuevos propuestos.**

- `src/services/catalogService.js` (fetch de `GET /catalog`)
- `src/state/catalogState.jsx` (`CatalogProvider` y `useCatalog`)
- `src/components/admin/config/ConfigSection.jsx`
- `src/components/admin/config/ProfessionalsTab.jsx`
- `src/components/admin/config/ServicesTab.jsx`
- `src/components/admin/config/ScheduleTab.jsx`

## Plan de implementación

Cada paso deja el sistema funcional y se puede commitear solo. Pasos 1 a 6 en backend, 7 a 14 en frontend.

1. En ambos repos: `git switch -c feat/dashboard-config-admin`. Confirmar antes que el working tree no mezcla cambios ajenos (hoy el front tiene `.atl/` y `odd/` sin commitear, que no se stagean).
2. **BE.** Schemas Mongoose de `professionals`, `services` y `business_settings` y siembra idempotente desde `catalog.config.ts` (upsert por `id`, segura ante instancias serverless concurrentes). Sin cambiar aún quién lee el catálogo.
3. **BE.** `CatalogService` asíncrono y respaldado por Mongo. Sin caché en memoria: Vercel corre varias instancias y una caché quedaría desactualizada. `GET /catalog` mantiene su forma y filtra inactivos. Agregar `await` en `availability.service.ts`, `bookings.service.ts` y `whatsapp/bot/bot.handler.ts`. Actualizar sus specs.
4. **BE.** `DaySchedule.open/close` pasan a `HH:mm` en `catalog.config.ts` y `buildDaySlots` en `availability.calculator.ts`. Tests de calculadora actualizados. La grilla resultante es idéntica a la actual para los horarios sembrados.
5. **BE.** `AdminKeyGuard` en `src/auth/`, con `crypto.timingSafeEqual` y falla cerrado (rechaza todo) si `ADMIN_API_KEY` no está definida. Controller `GET /admin/session`. Spec del guard.
6. **BE.** Endpoints admin de profesionales y servicios, con validación manual en `catalog-validation.ts` (sin `class-validator`, que no está instalado) y generación de `id` con sufijo ante colisión. Luego `PUT /admin/schedule` con `affectedBookings`. Con specs.
7. **FE.** `catalogService.js` y `CatalogProvider`. Los componentes de reserva (`ServiceSelectionStep`, `ScheduleStep`) y `utils/schedule.js` leen del contexto. Estado de carga y error con "Reintentar" en el modal de reserva.
8. **FE.** Quitar `PROFESSIONALS`, `SERVICES` y `BUSINESS_HOURS` de `appConfig.js`. Mover los datos de los tests a un fixture `src/test/catalogFixture.js` y actualizar `backendContract.test.js` y `BookingModal.test.jsx`.
9. **FE.** `authService.login` valida contra `GET /admin/session` enviando la clave como Bearer y guarda la clave en `sessionStorage`. Se elimina `admin` / `admin123`. `adminService.js` agrega funciones para los endpoints nuevos con el header de auth.
10. **FE.** Item "Configuración" en `adminSections.js`, `ConfigSection` con las tres pestañas y render en `Admin.jsx`. Pestaña Profesionales: listar, crear, editar y activar o desactivar.
11. **FE.** Pestaña Servicios: listar, crear, editar y activar o desactivar, con selector de profesionales que lo ofrecen y duración libre de 5 a 480 min.
12. **FE.** Pestaña Horarios: por día, toggle cerrado, selectores de apertura y cierre en pasos de 30 min. Tras guardar, si `affectedBookings > 0` muestra una advertencia con la cantidad.
13. **E2E.** Agregar `@playwright/test` como devDependency en el front (hoy no está declarado), `playwright.config.js` y `e2e/specs/admin-config/admin-config.spec.js`. Se ejecuta contra backend local con `MONGO_URI=mongodb://localhost:27017/booking_e2e` y una `ADMIN_API_KEY` de prueba. Solo datos ficticios.
14. Stagear los cambios en ambos repos con `git add`, sin commit ni push. Excluir `.atl/`, `odd/` y `specs/` si el usuario no los quiere en el commit.

## Criterios de aceptación

- [x ] `npx jest` en el backend y `npm test` en el front pasan sin fallos.
- [ x] `npm run build` en el front y `npx nest build` en el backend terminan sin errores.
- [ x] Con la base vacía, el backend arranca y `GET /catalog` devuelve los 2 profesionales, 4 servicios y el horario actuales.
- [ x] `GET /availability` devuelve los mismos turnos que antes de la spec para los datos sembrados.
- [ x] Sin header `Authorization`, o con una clave incorrecta, cualquier ruta `/admin/*` responde 401.
- [ ]x Con `ADMIN_API_KEY` sin definir, cualquier ruta `/admin/*` responde 401.
- [ x] El login con `admin` / `admin123` ya no funciona. El login con la `ADMIN_API_KEY` correcta entra al panel.
- [ x] El sidebar del admin muestra "Configuración" con las pestañas Profesionales, Servicios y Horarios.
- [ x] Crear un profesional desde el admin lo hace aparecer en el modal de reserva del sitio público sin desplegar.
- [ x] Desactivar un profesional lo oculta del sitio público. Sus reservas existentes siguen visibles en la tabla de reservas.
- [x ] Crear un servicio con nombre, descripción, precio y duración lo muestra en el sitio público con esos valores.
- [ x] Un servicio de 50 min bloquea 2 turnos de 30 min, como antes.
- [x ] Cerrar el sábado desde Horarios hace que `GET /availability` de un sábado devuelva `closed: true`.
- [x ] Cambiar el cierre de un día a 18:00 hace que el último turno ofrecido de ese día sea consistente con ese cierre.
- [x ] Guardar un horario que deja reservas futuras fuera de rango muestra la advertencia con la cantidad correcta y las reservas siguen en la base.
- [x ] Un horario con `open >= close`, o con minutos distintos de `00` y `30`, es rechazado con 400 y la UI muestra el error.
- [x ] Una duración menor a 5 o mayor a 480, o un precio negativo, es rechazado con 400.
- [x ] Si `GET /catalog` falla, el modal de reserva muestra un error y "Reintentar" recupera el flujo.
- [x ] El test de Playwright recorre admin: login, crear profesional, crear servicio, cambiar horario y reservar desde el sitio público. Pasa de punta a punta.
- [x ] La base `booking_e2e` se elimina al terminar y no se escribe nada en la base real.
- [ x] `git status` muestra los cambios staged en ambos repos y no hay commits nuevos hechos por el agente.

## Decisiones

- **Sí:** un solo negocio y un solo admin. Es lo que existe hoy. Multi-tenant toca reservas, login, URLs y bot, y va en su propia spec.
- **Sí:** `ADMIN_API_KEY` en variable de entorno con guard de Nest. Cierra el hueco con poco código. **No:** JWT con usuarios en Mongo, por tamaño. **No:** dejar el login solo en el cliente, porque cualquiera podría editar precios.
- **Sí:** en el login se conserva el campo usuario solo como etiqueta visible y el campo contraseña se valida como la `ADMIN_API_KEY`. Esta interpretación la tomé yo, no estaba definida: revisarla.
- **Sí:** Mongo con colecciones nuevas y siembra desde `catalog.config.ts`, porque el backend ya usa Mongoose y se conservan los `id` existentes.
- **Sí:** baja lógica (`active: false`). **No:** borrado real, porque rompería el historial de reservas.
- **Sí:** horario por día con `HH:mm` en pasos de 30 min. **No:** un horario único para todos los días.
- **Sí:** permitir cambios de horario con reservas futuras afectadas, con advertencia posterior al guardado. **No:** bloquear el cambio.
- **Sí:** campos editables del profesional: `name`, `specialty`, `experience`, `active`. `rating` y `avatar` quedan por defecto, porque el rating es un dato que el admin no debería inventar.
- **Sí:** duración de servicio en minutos libres de 5 a 480 y ícono por defecto. Tu respuesta "2 a" la interpreté como la opción recomendada. La regla de redondeo a bloques de 30 min ya existe en el backend.
- **Sí:** leer el catálogo de Mongo en cada request, sin caché. **No:** caché en memoria, por las instancias serverless de Vercel.
- **Sí:** el front público consume `GET /catalog`, que ya existe. **No:** un endpoint nuevo para el sitio público.
- **Sí:** validación manual de payloads. **No:** agregar `class-validator`, que hoy no es dependencia.
- **Sí:** agregar `@playwright/test` como devDependency. Hoy el repo tiene `tests/example.spec.js` pero la dependencia no está declarada.
- **Sí:** rama `feat/dashboard-config-admin` en ambos repos y cambios en staged. El commit y el push los hace el usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los endpoints de reservas (`PATCH`, `DELETE`, listado) siguen públicos. | Queda anotado como fuera de alcance. Proteger esas rutas va en una spec propia. |
| La clave admin viaja en cada request y se guarda en `sessionStorage`. | Se sirve solo por HTTPS en producción. No se loguea. Se compara con `timingSafeEqual`. Se mantiene el bloqueo por intentos del front. |
| Hacer `CatalogService` asíncrono toca `availability.service.ts`, `bookings.service.ts` y el bot. | Paso 3 aislado, con los tests del backend pasando antes de seguir. Solo se agregan `await`. |
| Dos instancias serverless siembran a la vez. | La siembra usa upsert por `id`, idempotente. |
| Un servicio queda sin profesionales activos tras una baja. | La disponibilidad devuelve sin turnos para ese servicio. La UI admin marca el servicio como "sin profesionales". |
| El front tiene cambios sin commitear ajenos a esta spec. | El paso 14 stagea solo los archivos de esta feature. |
| El Playwright de prueba escribe en una base. | Base `booking_e2e` aislada, datos ficticios, se elimina al terminar. Nunca se apunta a la `MONGO_URI` real. |

## Lo que **no** está en esta spec

- Multi-negocio con varios admins.
- Usuarios y JWT en base de datos.
- Protección de los endpoints existentes de reservas.
- Horarios por profesional, descansos y feriados.
- Edición de `rating`, `avatar` e ícono.
- Cambios de comportamiento en el bot de WhatsApp.
- Commit y push de los cambios.

Cada uno de estos puntos, si se hace, va en su propia spec.
