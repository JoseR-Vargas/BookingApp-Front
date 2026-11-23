# SPEC 15 — Axios como cliente HTTP del front

> **Status:** aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-11-23
> **Objective:** Reemplazar el `fetch` artesanal de `apiClient` por una instancia de axios que conserve exactamente los mismos mensajes, tiempos de espera y firmas para los servicios.

---

## Por qué existe esta spec

`src/core/apiClient.js` hace a mano lo que axios resuelve: construir la URL, serializar el cuerpo, medir un tiempo de espera con `AbortController`, interpretar el error del backend. Todos los servicios (`bookingService`, `adminService`, `authService`, `catalogService`, `brandingService`, `cancellationService`, `publicAvailabilityService`) pasan por ese único punto, y eso es lo que vale conservar.

Más adelante hay dos cosas que se resuelven mejor con interceptores de axios en un solo lugar: el encabezado `X-Tenant` por negocio (spec 17) y el cierre de sesión ante un `401` (hoy repetido en `adminService`). Esta spec deja ese terreno listo sin cambiar el comportamiento visible.

## Alcance

**Dentro (front `BookingApp_Front`):**

- Instalar `axios`.
- Una instancia de axios en `src/core/http/` con la URL base del backend y un tiempo de espera de 10 segundos.
- Una función que traduce un error de axios al mismo error que arma hoy `apiClient` (mensaje y `status`).
- `apiClient` mantiene sus métodos `request`, `get`, `post`, `put`, `patch` y `delete` con la misma firma, ahora sobre axios.
- Un ayudante de pruebas para simular la red sin `fetch` global, y migrar a él los 10 archivos de test que hoy usan `vi.stubGlobal('fetch')`.

**Fuera de alcance (otras specs):**

- Validación con zod (spec 16).
- Interceptores de `X-Tenant`, de cierre de sesión por `401` o de reintentos: esta spec solo deja el punto de enganche.
- Reintentos automáticos de red (los hace hoy `useAvailableTimes`).
- Cambiar las rutas, los cuerpos o los mensajes que ve el usuario.
- Tocar el backend.

## Modelo de datos

Esta spec no introduce datos. Contrato que se conserva (hoy en `apiClient.js`):

| Aspecto | Comportamiento actual que debe mantenerse |
| --- | --- |
| Firma | `apiClient.get(path, options)`, `post/put/patch(path, body, options)`, `delete(path, options)`, `request(method, path, body, options)` |
| Opciones | `{ headers, timeout }`; `timeout` por defecto 10 000 ms |
| Éxito | Devuelve el cuerpo ya convertido desde JSON |
| Error HTTP | `Error('HTTP error! status: <N>')`, o el `message` del cuerpo si es texto; si `message` no es texto, su `JSON.stringify`; si no hay `message`, el campo `error`; si el cuerpo no es JSON, el texto crudo |
| Estado | `error.status` con el código, como propiedad **no enumerable** (el error sigue siendo igual a un `new Error(mensaje)`) |
| Tiempo agotado | `Error('Timeout: La solicitud tardó demasiado tiempo. Por favor verifica tu conexión e intenta nuevamente.')` |
| Falla de red | El error original (por ejemplo `Failed to fetch`, que `useAvailableTimes` reconoce para reintentar) |
| Cuerpo | Solo se manda y se pone `Content-Type: application/json` cuando hay cuerpo |

```text
src/core/http/
  http-client.js        crea la instancia axios (baseURL, timeout) y la exporta
  to-http-error.js      error de axios -> Error con el mensaje y el status de arriba
src/core/apiClient.js   misma interfaz, implementada sobre http-client
src/test/mockHttp.js    instala un adaptador falso en la instancia para los tests
```

## Plan de implementación

Cada paso deja el sistema funcionando y con `vitest` en verde.

1. **Prueba de viabilidad.** Instalar `axios` y comprobar con un test que la instancia funciona en el entorno de pruebas (vitest con jsdom) usando un adaptador falso. Confirmar la forma de las fallas de red y de tiempo agotado que reporta axios (`ECONNABORTED`, `ERR_NETWORK`).
2. **`to-http-error.js`.** Función pura con una tabla de casos tomada de los tests actuales de `apiClient`: cuerpo con `message` de texto, `message` que no es texto, solo `error`, texto que no es JSON, cuerpo vacío, tiempo agotado y falla de red. Tests unitarios primero.
3. **`http-client.js` y `mockHttp.js`.** La instancia y el ayudante de pruebas que registra las llamadas (método, URL, encabezados, cuerpo) y responde con lo que el test indique.
4. **`apiClient` sobre axios.** Reescribir sus métodos manteniendo firma y comportamiento. Los tests de `apiClient` existentes se conservan con las mismas aserciones.
5. **Migrar los 10 archivos de test** que usan `vi.stubGlobal('fetch')` a `mockHttp`, conservando lo que verifican (URL, método, encabezados, cuerpo). Los tests que ya mockean el módulo de servicio no cambian.
6. **Cierre.** `vitest` completo, `vite build` (medir el tamaño del paquete antes y después y anotarlo), e2e completo y revisión de que ningún archivo fuera de `src/core/http`, `src/core/apiClient.js`, `src/test/` y los tests migrados cambió.

## Criterios de aceptación

- [ ] Todas las llamadas del front siguen funcionando: el e2e completo pasa sin cambios.
- [ ] Para cada fila de la tabla "Contrato que se conserva", un test lo comprueba contra la nueva implementación.
- [ ] `error.status` es no enumerable y el error compara igual que `new Error(mensaje)`.
- [ ] Un tiempo de espera por llamada (`options.timeout`) sigue funcionando y el valor por defecto es 10 000 ms.
- [ ] `useAvailableTimes` sigue reconociendo una falla de red para reintentar (no cambia su código ni sus tests).
- [ ] Ningún test usa `vi.stubGlobal('fetch')` salvo el que verifique de forma explícita el adaptador.
- [ ] Ningún servicio importa `axios` directamente: solo `src/core/http`.
- [ ] Se anota el cambio de tamaño del paquete tras `vite build`.
- [ ] Pasan `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** axios dentro de `apiClient` y no servicio por servicio (decidido por el usuario): un solo cliente, y el único lugar para los interceptores que vendrán.
- **Sí:** los servicios siguen llamando a `apiClient`: ningún servicio ni componente cambia.
- **Sí:** el error conserva exactamente el mensaje y el `status` actuales, porque la interfaz muestra esos textos y los tests los pinan.
- **Sí:** los tests simulan la red con un adaptador de axios, no con `fetch` global. Es más corto y no depende de que axios use `XHR` o `fetch` por debajo.
- **Sí:** el tiempo de espera lo maneja axios (`timeout`), no un `AbortController` propio.
- **No:** interceptores nuevos en esta spec: se agregan en las specs que los necesitan (17 y 18).
- **No:** reintentos automáticos dentro del cliente.
- **No:** exponer la instancia de axios a los componentes.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un mensaje de error cambia de redacción y un texto de la interfaz queda distinto | Tabla de casos con las aserciones actuales, y el e2e. |
| `error.status` pasa a ser enumerable y un test que compara errores falla | Test explícito de que es no enumerable. |
| axios en el navegador y en el entorno de pruebas se comportan distinto | El paso 1 lo comprueba antes de migrar nada; el e2e corre en el navegador real. |
| El paquete crece | Se mide y se anota; axios añade unos 13 kB gzip aproximados, a verificar. |
| La migración de 10 archivos de test pierde alguna aserción | Cada archivo se migra conservando sus aserciones, y se compara el conteo de tests antes y después. |

## Lo que **no** está en esta spec

- Validación de datos con zod (spec 16).
- `X-Tenant`, cierre de sesión global por `401` y cuentas de admin (specs 17 y 18).
- Cualquier cambio en el backend.
