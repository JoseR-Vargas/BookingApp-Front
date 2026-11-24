# SPEC 16 — Validación con zod en el front

> **Status:** implementado
> **Depends on:** SPEC 15
> **Date:** 2026-11-23
> **Objective:** Validar con esquemas de zod los formularios y las respuestas de la API del front, con un único lugar para cada contrato.

---

## Por qué existe esta spec

Hoy la validación está repartida: atributos HTML en el formulario de reserva (`checkValidity`), `if`s con mensajes en cada pestaña del panel (`ProfessionalsTab`, `LocationsTab`, `ShareTab`...), reglas sueltas en `utils/` y un test de contrato (`src/contract/backendContract.test.js`) que fija a mano lo que el front manda al backend. Y lo que el backend responde se usa sin comprobar: si un campo cambia de forma, la interfaz se rompe lejos de la causa.

Con esquemas de zod cada contrato se escribe una vez, se reutiliza en formularios y servicios, y un cambio de forma del backend falla en un punto claro, con un mensaje claro.

## Alcance

**Dentro (front `BookingApp_Front`):**

- Instalar `zod`.
- Esquemas de **formularios**: datos del cliente en la reserva, profesional, servicio, local, ajustes de la página pública, horario semanal, y los datos de la marca que hoy se validan a mano.
- Esquemas de **respuestas de la API**: catálogo público, catálogo de admin, disponibilidad, disponibilidad pública, reservas, estadísticas, marca y sesión.
- Una función `parseResponse(schema, data)` que se usa en los servicios y devuelve el dato o lanza un error de contrato.
- Mantener los mismos mensajes de error que ve hoy el usuario.

**Fuera de alcance (otras specs):**

- Cambiar los mensajes, el diseño o el comportamiento de los formularios.
- Una librería de formularios (`react-hook-form` u otra).
- Sanitización (`sanitizeInput` sigue igual) y reglas del backend.
- Validar el cuerpo que el front manda al backend con zod: ya lo cubre el test de contrato existente; se revisa si se puede apoyar en los mismos esquemas.
- Tipos de TypeScript: el front es JavaScript.

## Modelo de datos

Esta spec no introduce datos persistidos.

```text
src/schemas/
  api/                     una carpeta por contrato de respuesta
    catalog.schema.js      profesionales, servicios, locales, horario
    availability.schema.js
    public-availability.schema.js
    booking.schema.js
    branding.schema.js
    session.schema.js
  forms/
    client.schema.js       nombre, email, teléfono (reserva)
    professional.schema.js
    service.schema.js
    location.schema.js
    public-availability-settings.schema.js
    schedule.schema.js
  parse-response.js        parseResponse(schema, data) -> data | ContractError
  contract-error.js        ContractError extends Error
```

**Reglas de los esquemas de respuesta:**

| Regla | Comportamiento |
| --- | --- |
| Campos que la interfaz usa | Obligatorios y con su tipo |
| Campos que el backend agrega después | Se aceptan y se ignoran (`passthrough`), para no romper la app por un campo nuevo |
| Campo opcional (por ejemplo `locations`, `starts`) | Opcional con `.optional()`, igual que hoy el front lo trata |
| Falla | `ContractError('La respuesta del servidor no tiene el formato esperado.')`, y en desarrollo se registra el detalle de zod en la consola |

Un `ContractError` se maneja en la interfaz igual que cualquier otra falla de carga (el mismo estado de error con "Reintentar").

**Reglas de los esquemas de formulario:** los mismos mensajes de hoy, por ejemplo `'El nombre es obligatorio'`, `'Elige al menos un local'`, `'Elige al menos un servicio o publica todos'`. La función `validate(schema, values)` devuelve el primer mensaje o `null`.

## Plan de implementación

Cada paso deja el sistema funcionando y con `vitest` en verde.

1. **Instalar `zod` y la base.** `parse-response.js`, `contract-error.js` y un `validate` para formularios, con tests unitarios (válido, inválido, campo extra aceptado, mensaje exacto).
2. **Esquemas de respuesta.** Escribirlos contra los fixtures reales (`src/test/catalogFixture.js` y las respuestas del e2e). Un test por esquema con el fixture válido y con cada campo obligatorio ausente o de tipo incorrecto.
3. **Aplicar `parseResponse` en los servicios.** `catalogService`, `bookingService` (disponibilidad y creación), `publicAvailabilityService`, `brandingService`, `authService`, `adminService` (catálogo, reservas, estadísticas). Los tests de servicios comprueban que una respuesta mal formada rechaza con `ContractError`.
4. **Esquemas de formulario y sustitución de validaciones manuales.** Reemplazar los `if` con mensajes de `ProfessionalsTab`, `LocationsTab`, `ServicesTab`, `ShareTab` y `ScheduleTab`, y el chequeo del cliente en la reserva, conservando mensajes y comportamiento. Los tests de cada componente conservan sus aserciones.
5. **Estado de error de contrato en la interfaz.** Comprobar que una respuesta mal formada del catálogo, de la disponibilidad y de `/disponibilidad` muestra el estado de error con "Reintentar" y no una pantalla en blanco.
6. **Relación con el test de contrato.** Revisar `backendContract.test.js` y reutilizar los esquemas donde evite duplicar, sin relajar lo que ya fija.
7. **Cierre.** `vitest` completo, `vite build` (anotar el cambio de tamaño del paquete), e2e completo: el e2e pasa por el backend real, así que prueba también que los esquemas aceptan sus respuestas.

## Criterios de aceptación

- [ ] El e2e completo pasa sin cambios: los esquemas aceptan todas las respuestas reales del backend.
- [ ] Una respuesta del backend a la que le falta un campo obligatorio o lo trae con otro tipo rechaza con `ContractError` y la interfaz muestra su estado de error con "Reintentar".
- [ ] Un campo nuevo agregado por el backend no rompe nada.
- [ ] Cada formulario valida con su esquema y muestra exactamente los mismos mensajes que antes.
- [ ] Ya no quedan validaciones manuales con mensajes dentro de los componentes de formulario (salvo la regla puramente visual de HTML nativo).
- [ ] Cada esquema tiene un test con el caso válido y con cada campo obligatorio inválido.
- [ ] Ningún componente importa `zod`: solo `src/schemas` y, a través de ellos, los servicios y los formularios.
- [ ] Se anota el cambio de tamaño del paquete tras `vite build`.
- [ ] Pasan `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** validar formularios y respuestas de la API (decidido por el usuario). Las respuestas fallan en un solo punto y con un mensaje claro cuando el contrato se rompe.
- **Sí:** `passthrough` en las respuestas: el backend puede sumar campos sin romper el front (como pasó con `locations`, `starts` y `publicAvailability`).
- **Sí:** los esquemas viven en `src/schemas/` y se importan desde servicios y formularios; los componentes no conocen zod.
- **Sí:** los mensajes de los formularios se conservan idénticos: la interfaz y sus tests los pinan.
- **Sí:** un `ContractError` se trata como cualquier otra falla de carga, sin pantallas nuevas.
- **No:** `react-hook-form` ni otra librería de formularios.
- **No:** validar con zod el cuerpo que el front envía: ya lo cubre `backendContract.test.js`; se evita duplicar.
- **No:** convertir el front a TypeScript.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un esquema demasiado estricto rechaza una respuesta válida y deja una pantalla sin datos | Los esquemas se contrastan con los fixtures y con el e2e contra el backend real; solo lo que la interfaz usa es obligatorio. |
| Un cambio legítimo del backend deja el front en estado de error | Es el comportamiento buscado, con mensaje claro; se detecta en el e2e y en `backendContract.test.js`. |
| Un mensaje de formulario cambia sin querer | Los tests de cada componente conservan las aserciones de mensajes. |
| El paquete crece | Se mide y se anota; zod añade unos 13 kB gzip aproximados, a verificar. |
| El orden de las validaciones cambia el mensaje que ve el usuario | El esquema devuelve el primer error en el mismo orden de los `if` actuales y hay un test por mensaje. |

## Lo que **no** está en esta spec

- Un cambio de diseño o de textos en los formularios.
- Migrar a TypeScript o a otra librería de formularios.
- Cambios en el backend.
