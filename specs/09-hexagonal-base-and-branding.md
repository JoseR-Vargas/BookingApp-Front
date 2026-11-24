# SPEC 09 — Arquitectura hexagonal ligera: base y piloto con `branding`

> **Status:** aprobado
> **Depends on:** SPEC 08
> **Date:** 2026-11-23
> **Objective:** Dejar establecida la arquitectura hexagonal ligera del backend (capas, puertos, adaptadores, test de arquitectura y pruebas de contrato) y migrar el módulo `branding` como piloto, sin cambiar su comportamiento.

---

## Por qué existe esta spec

Hoy 27 archivos del backend dependen de Mongoose. Los servicios mezclan reglas de negocio con consultas, así que cambiar de base de datos obligaría a reescribir casi todo. Atlas gratis tiene 0,5 GB y 100 operaciones por segundo: es probable que haya que mudarse. El objetivo es que ese día solo haya que escribir adaptadores nuevos y cambiar una línea de enlace, sin tocar reglas de negocio ni casos de uso.

Esta spec fija el molde y lo prueba con el módulo más chico (`branding`, unas 140 líneas de servicio). Los demás módulos se migran uno por spec (11 a 14), y WhatsApp al final con el bot (spec 25). El aislamiento por negocio (spec 17) se construye después, sobre esta arquitectura, como trabajo de los adaptadores de persistencia.

Reglas que gobiernan todo el proyecto (ya escritas como skills `hexagonal-architecture` y `solid-composition`, y como `AGENTS.md` en el backend):

- Cada módulo tiene `domain`, `application`, `infrastructure`; las importaciones solo van hacia adentro.
- `domain` es TypeScript puro; `application` solo importa `domain` (y de Nest únicamente `@Injectable` e `@Inject`).
- Los repositorios devuelven modelos de dominio, nunca documentos de Mongoose.
- Responsabilidad única, inversión de dependencias, composición antes que herencia y patrón adaptador en infraestructura.

## Alcance

**Dentro (backend `BookingApp_Back`):**

- `docs/architecture.md`: estructura, reglas, cómo agregar un módulo y cómo cambiar de base de datos.
- Núcleo compartido `src/shared/`: `DomainError` con su `kind`, y un filtro de excepciones que traduce errores de dominio a HTTP.
- **Test de arquitectura** `src/architecture.spec.ts`, con la lista `MIGRATED_MODULES` que crece spec a spec.
- **Pruebas de contrato**: un patrón compartido para correr una misma suite contra cada adaptador de un puerto.
- Arnés de integración `npm run test:int` contra la Mongo de Docker del e2e.
- Migración de `branding`: dominio, puertos, casos de uso, adaptador de Mongo, adaptador en memoria, controladores y DTO de entrada.
- Mover `toBuffer` (que `catalog` importa hoy desde `branding`) a `src/shared/infrastructure/mongo/`.
- Commit de las skills y de `AGENTS.md` ya creados.

**Fuera de alcance (otras specs):**

- Migrar `catalog`, `availability`, `bookings`, `admin`, `auth`, `email` (specs 11 a 14) y WhatsApp (spec 25).
- Aislamiento por negocio, rutas por negocio y cuentas de admin (specs 17 en adelante).
- Cambiar de base de datos de verdad: solo se demuestra que el diseño lo permite.
- Cambiar cualquier ruta, respuesta, código de estado o mensaje de la API.
- Tocar el front.

## Modelo de datos

Esta spec no introduce datos persistidos nuevos: la colección `branding` y su forma no cambian. Lo que cambia es dónde vive cada cosa.

```text
src/shared/
  domain/domain-error.ts                  DomainError { kind: 'validation'|'not-found'|'conflict'|'forbidden', message }
  infrastructure/http/domain-error.filter.ts
  infrastructure/mongo/to-buffer.ts       normaliza el Binary de Mongo (antes en branding.service)

src/branding/
  domain/
    branding.ts                 Branding, BrandColors, BrandLogo, DEFAULT_COLORS
    branding.rules.ts           colores válidos, contraste, tipos y tamaño de logo (reglas puras)
    branding.errors.ts          InvalidBrandingError, InvalidLogoError (extienden DomainError, kind 'validation')
  application/
    ports/
      branding.reader.ts        BrandingReader { find(): Promise<Branding | null> }  + BRANDING_READER
      branding.writer.ts        BrandingWriter { saveBranding(...); saveLogo(...); deleteLogo() } + BRANDING_WRITER
      clock.port.ts             Clock { now(): Date } + CLOCK   (para updatedAt del logo)
    use-cases/
      get-branding.use-case.ts
      get-logo.use-case.ts
      save-branding.use-case.ts
      save-logo.use-case.ts
      delete-logo.use-case.ts
  infrastructure/
    persistence/mongo/
      branding.entity.ts        el esquema actual (BrandingRecord), privado a esta carpeta
      branding.mapper.ts        entidad <-> modelo de dominio
      mongo-branding.repository.ts   implementa Reader y Writer envolviendo el modelo (composición)
    persistence/in-memory/
      in-memory-branding.repository.ts
    http/
      branding.controller.ts
      branding-admin.controller.ts
      branding.input.ts         DTO de entrada: forma del cuerpo, límites de tamaño, conversión a comando
      branding.presenter.ts     modelo de dominio -> respuesta pública (logoUrl con ?v=)
    system.clock.ts             Clock real (adaptador)
  branding.module.ts            raíz de composición: enlaza tokens con adaptadores
```

Un puerto de lectura y otro de escritura (`BrandingReader`, `BrandingWriter`) en lugar de un repositorio único: los casos de uso que solo leen no dependen de métodos de escritura.

**Test de arquitectura (reglas verificables):**

| Carpeta | No puede importar |
| --- | --- |
| `*/domain/**` | `@nestjs/*`, `mongoose`, `rxjs`, `express`, `socket.io`, `nodemailer`, `application/**`, `infrastructure/**`, `process.env`, `new Date()` |
| `*/application/**` | `mongoose`, `@nestjs/mongoose`, `@nestjs/platform-express`, `socket.io`, `nodemailer`, `infrastructure/**`; de `@nestjs/*` solo `@nestjs/common` y solo `Injectable` e `Inject` |
| `src/shared/domain/**` | lo mismo que `domain` |

Las reglas se aplican a `src/shared/**` y a los módulos de `MIGRATED_MODULES`. Un módulo no migrado queda exento hasta que su spec lo agregue a la lista.

**Contrato de un puerto.** Cada puerto exporta `describeXContract(nombre, fabrica)`. El adaptador de memoria y el de Mongo llaman a esa función desde sus propios specs; el de Mongo corre con `npm run test:int` (la Mongo de Docker, en una base de pruebas aparte que se limpia entre pruebas; si no está disponible, **falla con un mensaje claro** y no se salta en silencio).

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Base y reglas.** Commit de `.agents/skills/` y `AGENTS.md`. Crear `src/shared/` con `DomainError`, el filtro de excepciones (con sus tests: cada `kind` produce su estado HTTP y el mensaje exacto) y `docs/architecture.md`. Registrar el filtro como global. Sin efecto en los módulos existentes.
2. **Test de arquitectura.** `src/architecture.spec.ts` con `MIGRATED_MODULES = []` y la regla de `src/shared`. Incluir un test del propio test: carpetas de prueba con una violación deliberada deben hacerlo fallar.
3. **Arnés de integración.** `npm run test:int` (configuración de jest separada) y helper de conexión a la Mongo de Docker con limpieza entre pruebas y error claro si no hay Docker.
4. **`branding` dominio.** Mover a `domain/` las reglas hoy mezcladas en `branding-validation.ts` y en `branding.service.ts` (colores por defecto, contraste, tipos y tamaño de logo, "botón sigue al acento si no hay color"). Tests unitarios puros; los mensajes de error quedan idénticos a los actuales.
5. **`branding` aplicación.** Puertos y casos de uso, probados con el adaptador en memoria. `Clock` inyectado: el `updatedAt` del logo ya no usa `new Date()`.
6. **`branding` infraestructura.** Entidad, mapper y repositorio de Mongo; repositorio en memoria; suite de contrato corriendo contra ambos. Mover `toBuffer` a `src/shared/infrastructure/mongo/` y actualizar el import de `catalog`.
7. **`branding` HTTP y módulo.** Controladores delgados que llaman casos de uso, DTO de entrada, presenter y `branding.module.ts` como raíz de composición. Los specs HTTP actuales (`branding.http.spec.ts`) se conservan con las mismas aserciones y pasan a correr sobre el adaptador en memoria; se borra el servicio viejo, `branding.testing.ts` y el esquema duplicado.
8. **Cierre.** `MIGRATED_MODULES = ['branding']`, prueba de cambio de base (el módulo corre entero con el adaptador en memoria sin tocar casos de uso ni dominio), docs actualizadas y verificación completa.

## Criterios de aceptación

- [ ] Las rutas de marca (`GET /api/branding`, `GET /api/branding/logo`, `PUT /api/admin/branding`, `PUT` y `DELETE` del logo) responden exactamente lo mismo que antes: mismos códigos, cuerpos y mensajes de error.
- [ ] `src/branding/domain/**` y `src/branding/application/**` no importan `mongoose`, `@nestjs/mongoose`, nada de HTTP ni `infrastructure/**`, y el test de arquitectura lo comprueba.
- [ ] El test de arquitectura falla ante una violación deliberada (probado con carpetas de ejemplo) y pasa en el repositorio.
- [ ] Ningún caso de uso contiene `new Date()`, `process.env` ni referencias a Mongoose.
- [ ] El repositorio de Mongo y el de memoria pasan la misma suite de contrato (`npm run test:int` y `npm test`).
- [ ] El módulo `branding` funciona de punta a punta con el adaptador en memoria enlazado, sin cambiar dominio ni casos de uso (prueba HTTP completa).
- [ ] Un error de dominio nunca es una `HttpException`; el filtro lo traduce según su `kind`.
- [ ] `catalog` sigue funcionando y ya no importa nada de `src/branding/`.
- [ ] `docs/architecture.md` explica en pasos cómo agregar un módulo y cómo cambiar la base de datos.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front sin cambios.

## Decisiones

- **Sí:** hexagonal ligera con tres capas por módulo (`src/<módulo>/{domain,application,infrastructure}`), decidido por el usuario.
- **Sí:** `application` puede usar `@Injectable` e `@Inject` de Nest y nada más (decidido por el usuario): los casos de uso quedan simples y el dominio queda libre de framework.
- **Sí:** migrar todo el backend salvo WhatsApp, un módulo por spec, con los tests actuales como red de seguridad (decidido por el usuario). WhatsApp va al final con el bot.
- **Sí:** adaptadores en memoria y suites de contrato en lugar de dobles de modelos de Mongoose (decidido por el usuario). Es lo que hace segura una mudanza de base: la base nueva es válida solo si pasa el contrato.
- **Sí:** test de arquitectura propio, sin dependencias nuevas (decidido por el usuario).
- **Sí:** el módulo piloto es `branding`: el más chico, con reglas reales y solo dos controladores.
- **Sí:** puertos de lectura y escritura separados (ISP), en vez de un repositorio con todos los métodos.
- **Sí:** `Clock` como puerto. `new Date()` dentro de un caso de uso lo haría imposible de probar y lo ataría al sistema.
- **Sí:** los errores de dominio llevan un `kind` semántico y un único filtro de infraestructura lo traduce a HTTP; el dominio nunca conoce códigos de estado.
- **Sí:** composición en el adaptador: el repositorio de Mongo envuelve el modelo; nada hereda de una clase base de repositorios.
- **Sí:** el test de arquitectura exime a los módulos aún no migrados, con la lista `MIGRATED_MODULES`, para no frenar el avance.
- **No:** rehacer los controladores como clases abstractas ni usar herencia para compartir comportamiento.
- **No:** una librería de inyección propia o un contenedor aparte: se usa el de Nest, solo en la raíz de composición y en los decoradores permitidos.
- **No:** `eslint-plugin-boundaries` ni otra dependencia para vigilar las capas.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La migración cambia sin querer un mensaje, código o campo de la API | Se conservan los specs HTTP existentes con las mismas aserciones (caracterización) y el e2e completo del front. |
| El adaptador en memoria y el de Mongo se comportan distinto | Una única suite de contrato corre contra ambos, incluidos los casos de documento ausente y valores por defecto. |
| El test de arquitectura da falsos negativos (no detecta un import) | Se prueba a sí mismo con violaciones deliberadas, y revisa imports estáticos, `require` y `import()` dinámicos. |
| Los tests de integración dejan de correr por falta de Docker y nadie lo nota | `test:int` falla con un mensaje claro y el cierre exige correrlo. |
| Se hace una abstracción de más (puertos para todo) y el módulo pierde claridad | Un puerto por dependencia externa real y por consumidor; la regla "puerto pequeño" está en la skill. |
| `toBuffer` movido rompe la foto de profesionales | Test de integración con `catalog` antes y después, y el e2e de foto de perfil. |
| Dos estilos conviviendo durante varias specs | La lista `MIGRATED_MODULES` y `AGENTS.md` marcan claramente qué está migrado; el estilo viejo no se extiende. |

## Lo que **no** está en esta spec

- La migración de `catalog`, `availability`, `bookings`, `admin`, `auth` y `email` (specs 11 a 14) y de WhatsApp (spec 25).
- Aislamiento por negocio y todo el camino comercial (specs 17 a 24).
- Una segunda base de datos real: solo la prueba de que el diseño la admite.
