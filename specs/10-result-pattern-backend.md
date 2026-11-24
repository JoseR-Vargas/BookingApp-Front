# SPEC 10 — Patrón Result en el backend

> **Status:** aprobado
> **Depends on:** SPEC 09
> **Date:** 2026-11-23
> **Objective:** Que las reglas de negocio y los casos de uso del backend informen sus fallas como un valor `Result` en lugar de lanzar excepciones, empezando por el módulo `branding`.

---

## Por qué existe esta spec

Hoy una regla que falla lanza una excepción: el llamador no lo ve en la firma, puede olvidar atraparla, y el flujo de negocio queda escondido en `try/catch` y en el filtro de excepciones. Con `Result<T, E>` la falla es parte del tipo: el compilador obliga a decidir qué hacer con ella antes de usar el valor.

La arquitectura hexagonal ya separa los errores de negocio (`DomainError`) de las fallas de infraestructura. Esta spec termina de trazar esa línea:

- Una falla **de negocio** (dato inválido, no encontrado, conflicto) viaja como valor: `Err(DomainError)`.
- Una falla **de infraestructura** (la base no responde) sigue siendo una excepción y termina en un `500`: ningún caso de uso puede resolverla.

Va antes de migrar `catalog` (spec 11) para que ese módulo y los siguientes nazcan con Result y no haya que reescribirlos.

## Alcance

**Dentro (backend `BookingApp_Back`):**

- `Result<T, E>` propio, sin dependencias, en `src/shared/domain/result.ts`.
- Reglas de dominio y casos de uso de `branding` devuelven `Result`.
- Puente en infraestructura que convierte un `Err` en la respuesta HTTP a través del filtro único que ya existe.
- Regla nueva en el test de arquitectura: ningún `throw` en `domain/**` ni en `application/use-cases/**`.
- Actualizar las skills `hexagonal-architecture` y `solid-composition`, `AGENTS.md` y `docs/architecture.md`.

**Fuera de alcance (otras specs):**

- Migrar otros módulos: `catalog`, `availability`, `bookings`, `admin`, `auth`, `email` (specs 11 a 14) nacen con Result dentro de su propia spec. WhatsApp, spec 25.
- Que los repositorios devuelvan `Result`: siguen devolviendo el modelo o `null`.
- Una librería externa (`neverthrow`, `fp-ts`).
- Cambiar rutas, códigos de estado, cuerpos o mensajes de la API.
- Tocar el front.

## Modelo de datos

Esta spec no introduce datos persistidos.

```ts
// src/shared/domain/result.ts  (TypeScript puro)
export type Result<T, E extends DomainError = DomainError> = Ok<T> | Err<E>;

export interface Ok<T>  { readonly ok: true;  readonly value: T }
export interface Err<E> { readonly ok: false; readonly error: E }

ok<T>(value: T): Ok<T>
err<E>(error: E): Err<E>
map<T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E>
andThen<T, U, E>(r: Result<T, E>, f: (v: T) => Result<U, E>): Result<U, E>
mapErr<T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F>
match<T, E, R>(r: Result<T, E>, h: { ok(v: T): R; err(e: E): R }): R
unwrapOr<T, E>(r: Result<T, E>, fallback: T): T
```

La unión discriminada por `ok` obliga a estrechar el tipo (`if (r.ok)`) antes de leer `value`: el compilador impide usar un resultado sin mirar si falló. Las funciones auxiliares nunca lanzan.

**Forma de las capas después de esta spec:**

| Capa | Forma |
| --- | --- |
| `domain` (reglas) | `validateBranding(input): Result<Branding, InvalidBrandingError>` |
| `application` (casos de uso) | `execute(cmd): Promise<Result<PublicBranding, DomainError>>` |
| `application` (puertos) | sin cambios: `find(): Promise<Branding \| null>`, las fallas de infraestructura lanzan |
| `infrastructure/http` | `respond(result)`: devuelve el valor o lanza el `DomainError` en el borde para que lo traduzca el filtro único |

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **`Result` y sus auxiliares.** `src/shared/domain/result.ts` con tests unitarios puros: `ok`/`err`, `map`, `andThen`, `mapErr`, `match`, `unwrapOr`, estrechamiento de tipos, y que ninguna auxiliar lanza aunque el callback reciba un valor raro.
2. **Regla en el test de arquitectura.** El escáner detecta `throw` (con el árbol de TypeScript, no con texto) en `domain/**` y `application/use-cases/**`. Nueva lista `RESULT_MODULES = []`; la regla solo se aplica a los módulos de esa lista. Se prueba con fixtures: un `throw` debe fallar, un `return err(...)` debe pasar.
3. **Dominio de `branding` con Result.** Las reglas (`branding.rules.ts`) devuelven `Result`; los errores siguen siendo `DomainError` con los mismos mensajes. Se adaptan los tests de reglas (mismas aserciones de mensajes y orden de validación).
4. **Casos de uso de `branding` con Result.** Los cinco casos de uso devuelven `Promise<Result<...>>`, encadenan las reglas con `andThen` y ya no lanzan. Se adaptan sus tests con el adaptador en memoria.
5. **Borde HTTP.** `respond(result)` en `src/shared/infrastructure/http/` y controladores de `branding` que lo usan. Un test comprueba que una falla de infraestructura (el repositorio lanza) produce `500` y no `400`.
6. **Reglas del proyecto.** `RESULT_MODULES = ['branding']`. Actualizar las skills (nueva regla dura: las fallas de negocio son `Result`, nunca `throw` en dominio ni casos de uso), `AGENTS.md` y la sección "Errors as values" de `docs/architecture.md`.
7. **Cierre.** Verificación completa y comparación de las respuestas HTTP de `branding` antes y después (mismos estados, cuerpos y mensajes).

## Criterios de aceptación

- [ ] Las rutas de marca responden exactamente lo mismo que antes: mismos códigos, cuerpos y mensajes, incluido el orden en que se detectan los errores.
- [ ] `src/shared/domain/result.ts` no importa nada fuera de `src/shared/domain` y ninguna de sus funciones lanza.
- [ ] Ninguna regla de `branding/domain` ni caso de uso de `branding/application/use-cases` contiene `throw`, y el test de arquitectura lo comprueba.
- [ ] El test de arquitectura falla ante un `throw` en un módulo de `RESULT_MODULES` (fixture) y pasa en el repositorio.
- [ ] Cada falla de negocio de `branding` se prueba como `Err` en la regla y en el caso de uso, con su mensaje exacto.
- [ ] Una falla de infraestructura (por ejemplo, el repositorio lanza) produce `500`, nunca `400`.
- [ ] Los repositorios siguen devolviendo el modelo o `null`, sin `Result`.
- [ ] Las skills, `AGENTS.md` y `docs/architecture.md` describen la regla.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front sin cambios.

## Decisiones

- **Sí:** `Result` propio y sin dependencias (decidido por el usuario): unas pocas líneas, y el dominio no queda atado a una librería.
- **Sí:** `Result` en reglas y casos de uso; las fallas de infraestructura siguen siendo excepciones (decidido por el usuario). No son un caso de negocio y ningún caso de uso puede resolverlas.
- **Sí:** esta spec va antes de migrar `catalog` (decidido por el usuario): el resto de los módulos nacen con Result y se migran una sola vez.
- **Sí:** unión discriminada por `ok` en vez de clases `Ok`/`Err` con métodos: es composición, sin herencia, y el compilador estrecha el tipo.
- **Sí:** el borde HTTP convierte un `Err` lanzando el `DomainError` para el filtro que ya existe. Hay un único lugar donde un error de negocio se vuelve HTTP, y el formato de respuesta sigue idéntico.
- **Sí:** los puertos no cambian: ausencia es `null`. Un `Result` en un puerto obligaría a cada adaptador a clasificar errores de base de datos.
- **Sí:** regla de arquitectura "sin `throw` en dominio y casos de uso", aplicada por módulo con `RESULT_MODULES`, con el mismo mecanismo de `MIGRATED_MODULES`.
- **No:** `neverthrow`, `fp-ts` ni `Either` con `left`/`right` (decidido por el usuario).
- **No:** `Result` en los repositorios.
- **No:** cambiar los mensajes de error ni el orden de las validaciones.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un caso de uso ignora un `Err` y sigue como si nada | La unión discriminada impide leer `value` sin estrechar; cada caso de uso tiene un test por cada falla. |
| Se cambia el orden de validación sin querer y cambia el mensaje que ve el usuario | Se conservan las aserciones de orden de `branding.rules.spec.ts` y las de `branding.http.spec.ts`. |
| Una falla de infraestructura se confunde con una de negocio y devuelve `400` | Test explícito de que un repositorio que lanza produce `500`. |
| Dos estilos de error conviviendo (Result en `branding`, excepciones en los demás módulos) | `RESULT_MODULES` marca qué módulos ya cumplen; las skills prohíben extender el estilo viejo. |
| La regla "sin `throw`" da falsos positivos con errores de programación (invariantes imposibles) | La regla solo cubre `domain` y `use-cases`; las invariantes imposibles se expresan con tipos, y cualquier excepción real se discute caso por caso. |

## Lo que **no** está en esta spec

- La migración de los demás módulos a Result (cada uno la trae en su spec: 11 a 14, y WhatsApp en la 25).
- `Result` en los puertos de persistencia.
- Cualquier cambio en el front.
