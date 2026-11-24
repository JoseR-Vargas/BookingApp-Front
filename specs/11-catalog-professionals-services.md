# SPEC 11 — Catálogo hexagonal (1/2): profesionales, servicios, selección y fotos

> **Status:** aprobado
> **Depends on:** SPEC 10
> **Date:** 2026-11-23
> **Objective:** Migrar a arquitectura hexagonal con `Result` los profesionales, los servicios, la selección de servicios y las fotos del catálogo, dejando una fachada temporal para los módulos que todavía no migran.

---

## Por qué existe esta spec

`catalog` es el módulo más grande (unas 3 800 líneas) y el más compartido: `bookings`, `availability`, `admin` y el bot de WhatsApp llaman a 12 métodos de `CatalogService`. Mezcla seis responsabilidades: profesionales, servicios, selección de servicios, fotos, locales con horarios, y ajustes de la página pública. Por eso se parte en dos specs:

- **Esta (11):** profesionales, servicios, selección de servicios y fotos.
- **Spec 12:** locales, horarios, ajustes de la página pública y la migración al local "Principal".

Dos acoples concretos que esta spec corrige:

- Borrar un profesional consulta hoy la colección de reservas (`bookingModel.countDocuments`) desde el servicio de catálogo. Con puertos, `catalog` pregunta por la actividad de reservas a través de un puerto y no conoce esa colección.
- Las reglas de negocio (qué profesionales puede ofrecer cada servicio, cuándo se puede borrar a uno, cómo se arma el identificador) están escritas junto a las consultas de Mongoose.

## Alcance

**Dentro (backend `BookingApp_Back`, módulo `src/catalog`):**

- Dominio: modelos `Professional` y `Service`, reglas de nombre/precio/duración, generación del identificador, reglas de borrado y regla de **selección de servicios**.
- Aplicación: puertos y casos de uso de profesionales, servicios, fotos y selección.
- Infraestructura: entidades y mapeadores de Mongo, repositorios de Mongo y en memoria, controladores nuevos para las rutas de profesionales y servicios, y los adaptadores de los puertos que miran fuera de `catalog`.
- **Fachada temporal** `CatalogService` y `CatalogAdminService` con los mismos métodos que usan los módulos sin migrar.
- `catalog` se agrega a `MIGRATED_MODULES` y a `RESULT_MODULES` (reglas del test de arquitectura sobre sus carpetas `domain/` y `application/`).

**Fuera de alcance (otras specs):**

- Locales, horarios, ajustes de la página pública y su migración: spec 12.
- `availability` y `bookings` (spec 13), `admin`, `auth` y `email` (spec 14), y el bot de WhatsApp (spec 25).
- Cambiar rutas, cuerpos, estados o mensajes de la API.
- Aislamiento por negocio.
- El front.

## Modelo de datos

La colección y los documentos de `professionals` y `services` no cambian.

```text
src/catalog/
  domain/
    professional.ts              Professional, ProfessionalPhoto
    service.ts                   Service
    professional.rules.ts        nombre, especialidad, experiencia, locales mínimos
    service.rules.ts             nombre, descripción, precio, duración, profesionales
    slug.rules.ts                slugify + candidatos -2, -3 (pura)
    deletion.rules.ts            puede borrarse un profesional / un servicio
    service-selection.rules.ts   vacía, repetida, desconocida -> Result
    catalog.errors.ts            errores de dominio con sus mensajes actuales
  application/
    ports/
      professional.reader.ts / professional.writer.ts
      service.reader.ts / service.writer.ts
      professional-photo.store.ts          leer, guardar y quitar la foto
      booking-activity.port.ts             BookingActivity (reservas, sin conocer su colección)
      location-directory.port.ts           LocationDirectory (temporal, hasta la spec 12)
      clock.port.ts                        (ya existe en shared)
    use-cases/
      professionals/ list, create, update, set-photo, remove-photo, get-photo, deactivate, delete-permanently
      services/      list, create, update, deactivate, delete-permanently
      resolve-service-selection.use-case.ts
  infrastructure/
    persistence/mongo/   professional.entity, service.entity, mappers, repositorios
    persistence/in-memory/
    bookings/mongo-booking-activity.adapter.ts      lee la colección de reservas
    locations/mongo-location-directory.adapter.ts   lee la colección de locales
    http/
      professionals-admin.controller.ts + input
      services-admin.controller.ts + input
      catalog-photo.controller.ts      GET /catalog/professionals/:id/photo
  catalog.service.ts / catalog-admin.service.ts   fachada temporal (marcada @deprecated)
```

**Puertos que miran fuera de catalog** (los dos son provisionales y se reemplazan al migrar el módulo dueño del dato):

| Puerto | Métodos | Adaptador hoy | Reemplazo |
| --- | --- | --- | --- |
| `BookingActivity` | `countUpcomingConfirmed(professionalId, today)`, `hasAny(professionalId)` | lee la colección de reservas | spec 13 (`bookings`) |
| `LocationDirectory` | `activeIds()`, `defaultId()` | lee la colección de locales | spec 12 (`locations`) |

**Selección de servicios.** La regla pura devuelve `Err` con un error de dominio que lleva `failure: 'empty' | 'duplicate' | 'unknown'` y `serviceId`. La fachada lo convierte en el `ServiceSelectionError` de siempre, para que `bookings` y `availability` (que lo reconocen con `instanceof`) no cambien.

**Errores de dominio** (mensajes exactos de hoy):

| Falla | `kind` | Mensaje |
| --- | --- | --- |
| Profesional inexistente | `not-found` | `Professional "<id>" not found` |
| Servicio inexistente | `not-found` | `Service "<id>" not found` |
| Profesional con reservas futuras | `conflict` | el actual de `deleteProfessionalPermanently` |
| Único profesional de un servicio | `conflict` | el actual |
| Servicio con reservas | `conflict` | el actual |
| Datos inválidos (nombre, precio, duración...) | `validation` | los actuales de `catalog-validation.ts` |
| Profesional sin locales activos | `validation` | `El profesional debe trabajar en al menos un local activo.` |

**Fachada temporal.** Mantiene exactamente: `getCatalog`, `getAdminCatalog`, `findProfessional`, `findService`, `resolveServices(ids, locationId?)`, `getProfessionalsForService`, `getProfessionalPhoto`, y los métodos de locales y horarios que siguen sin migrar. `getCatalog` y `getAdminCatalog` arman su respuesta con los casos de uso nuevos y con lo que aún no migró. Los métodos de profesionales y servicios de `CatalogAdminService` desaparecen: sus rutas pasan a los controladores nuevos.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Mover a `domain/` las reglas hoy mezcladas en `catalog-validation.ts`, `catalog.service.ts`, `catalog-admin.service.ts` y `service-selection.ts`, como funciones puras que devuelven `Result`. Tests unitarios puros; los mensajes quedan idénticos.
2. **Puertos y casos de uso.** Escritos contra repositorios en memoria. Un caso de uso por acción. `Clock` inyectado donde haga falta.
3. **Adaptadores de persistencia.** Entidades, mapeadores y repositorios de Mongo y en memoria; suite de contrato de cada puerto corriendo contra ambos (`npm test` y `npm run test:int`). Incluir los casos: identificador único con sufijo `-2`, `-3` ante colisión, inserción atómica sin pisar, foto con bytes, profesional sin `locationIds`.
4. **Adaptadores de puertos externos.** `BookingActivity` y `LocationDirectory` de Mongo, con test de integración contra la base de pruebas.
5. **Controladores nuevos.** Rutas de profesionales y servicios (las mismas, con el mismo guard) y de la foto pública, con sus DTO de entrada. Las suites HTTP actuales (`admin.http.spec.ts` para esas rutas, los specs de borrado y de foto) se conservan con las mismas aserciones.
6. **Fachada.** `CatalogService` y `CatalogAdminService` pasan a envolver los casos de uso, con las mismas firmas y las excepciones de antes. Los otros módulos no cambian.
7. **Limpieza.** Borrar el código viejo de profesionales y servicios, `catalog.testing.ts` en lo que ya no se usa, y dejar `catalog` en las dos listas del test de arquitectura.
8. **Cierre.** Comparación antes y después de las respuestas HTTP de todas las rutas de profesionales, servicios, foto y catálogo; verificación completa.

## Criterios de aceptación

- [ ] Todas las rutas de profesionales, servicios, foto y catálogo responden exactamente igual que antes: mismos códigos, cuerpos y mensajes.
- [ ] `catalog/domain/**` y `catalog/application/**` no importan Mongoose, HTTP ni `infrastructure/**`, y no contienen `throw`, `new Date()` ni `process.env` (lo comprueba el test de arquitectura).
- [ ] Borrar un profesional con reservas futuras o que es el único de un servicio sigue dando `409` con el mismo mensaje, sin que `catalog` conozca la colección de reservas.
- [ ] `resolveServices` sigue lanzando `ServiceSelectionError` para los consumidores sin migrar, y las suites de `bookings`, `availability` y el bot pasan sin cambios.
- [ ] Una falla de la base (el repositorio lanza) da `500`, no `400` ni `409`.
- [ ] Los repositorios de Mongo y en memoria pasan la misma suite de contrato.
- [ ] La suite HTTP de profesionales y servicios corre completa sobre los adaptadores en memoria (prueba de cambio de base).
- [ ] Dos creaciones simultáneas con el mismo nombre dan identificadores distintos (`-2`, `-3`) sin pisarse.
- [ ] La fachada está marcada como temporal y no tiene lógica de negocio.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front.

## Decisiones

- **Sí:** partir `catalog` en dos specs, núcleo (esta) y locales (spec 12), decidido por el usuario.
- **Sí:** fachada temporal con la misma interfaz, decidido por el usuario: `bookings`, `availability`, `admin` y el bot no se tocan en esta spec. La fachada se borra cuando cada consumidor migre.
- **Sí:** puerto `BookingActivity` con un adaptador que lee la colección de reservas, decidido por el usuario. Cuando `bookings` migre, el adaptador pide el dato a ese módulo.
- **Sí:** `LocationDirectory` como puerto provisional para validar los locales del profesional, por la misma razón: el dueño del dato (`locations`) migra en la spec 12.
- **Sí:** las reglas de borrado son funciones puras que reciben los datos (conteos, servicios afectados) y devuelven `Result`; el caso de uso reúne los datos por los puertos.
- **Sí:** el error de selección sigue siendo `ServiceSelectionError` hacia afuera (la fachada lo traduce), y es un error de dominio con `failure` hacia adentro.
- **Sí:** la inserción con identificador único es responsabilidad del adaptador (atomicidad de la base); el dominio solo genera los candidatos.
- **Sí:** puertos de lectura y de escritura separados por entidad (`ProfessionalReader` / `ProfessionalWriter`).
- **No:** migrar a `Result` los consumidores sin migrar: la fachada traduce a excepciones.
- **No:** mover `getCatalog` entero: queda en la fachada porque incluye locales y horarios (spec 12).
- **No:** transacciones nuevas: la ventana entre "comprobar reservas" y "borrar" sigue documentada como hoy.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambia una respuesta de la API sin querer | Comparación HTTP antes y después, suites HTTP existentes con las mismas aserciones y e2e completo. |
| La fachada pierde una excepción que otro módulo espera (`ServiceSelectionError`, `NotFoundException`) | Test de la fachada por cada método consumido, y las suites de `bookings`, `availability` y el bot sin tocar. |
| Un puerto provisional se queda para siempre | Cada uno tiene en la spec el módulo y la spec que lo reemplaza; `docs/architecture.md` lo lista. |
| Se rompe el orden de seed de `onModuleInit` (profesionales, servicios, ajustes, local Principal) | Se mantiene el mismo orden; tests de arranque con base vacía y con base ya sembrada. |
| El borrado con reservas futuras pierde su comprobación | Test por cada rama (reservas futuras, único profesional, ambas) y suite de contrato de `BookingActivity` contra Mongo. |
| Dos estilos conviviendo dentro de `src/catalog` | Las carpetas `domain/`, `application/` e `infrastructure/` están claramente separadas de los archivos viejos de la raíz; `AGENTS.md` lo indica y el estilo viejo no se extiende. |

## Lo que **no** está en esta spec

- Locales, horarios, ajustes de la página pública y la migración al local Principal (spec 12).
- `availability`, `bookings`, `admin`, `auth`, `email` y WhatsApp (specs 13, 14 y 25).
- Aislamiento por negocio y cualquier cambio en el front.
