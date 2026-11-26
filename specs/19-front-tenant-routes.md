# SPEC 19 — Front por negocio: rutas `/n/<slug>` y encabezado `X-Tenant`

> **Status:** Implementado (2026-11-26)
> **Depends on:** SPEC 18
> **Date:** 2026-11-25
> **Objective:** Que el front sirva cada negocio en su propia ruta `/n/<slug>` y mande ese negocio al backend en cada pedido, sin cambiar las URLs que ya existen.

---

## Por qué existe esta spec

El backend ya sabe aislar los datos por negocio (spec 18) y espera un encabezado `X-Tenant`. Falta la otra mitad: que el navegador diga en cada pedido a qué negocio pertenece.

La ruta por negocio es la opción 2 que eligió el usuario: no necesita comprar un dominio con DNS comodín ni configurarlo, y funciona en cualquier hosting. La raíz `/` sigue sirviendo al negocio por defecto, así que los enlaces que ya compartiste no se rompen.

## Alcance

**Dentro (front `BookingApp_Front`):**

- Resolver el negocio desde la ruta: `/n/<slug>/`, `/n/<slug>/disponibilidad`, `/n/<slug>/admin`, `/n/<slug>/login`.
- Un `TenantProvider` que expone el `slug` (o `null` para el negocio por defecto) y lo inyecta en el cliente HTTP.
- `X-Tenant` en **todas** las peticiones al backend (públicas y de admin), vía el interceptor de axios.
- El catálogo, la marca, la página de disponibilidad, el modal de reserva y el panel se cargan del negocio de la ruta.
- El enlace de cancelar (`/cancelar/<token>`) sigue siendo global: el token identifica la reserva (spec 18 lo resuelve sin `X-Tenant`).
- Enlace "copiar" del link público: `/n/<slug>/disponibilidad` cuando la página está en la raíz, y `/n/<slug>/disponibilidad` cuando ya está en una ruta de negocio.
- Si el `slug` no existe o está suspendido, la página avisa y no rompe.
- Sesión de admin por negocio: la clave se guarda por negocio (el mismo `sessionStorage` con el `slug` como parte de la clave), para que un mismo navegador pueda entrar a dos negocios.

**Fuera de alcance (otras specs):**

- Cuentas de admin con contraseña y roles (spec 20): la clave única sigue sirviendo.
- Registro de negocios y asistente de alta (spec 21).
- Dominio propio por negocio y DNS comodín: queda preparado el slug en la ruta, pero no se compra nada.
- Cambiar el slug de un negocio.
- Traducir la interfaz a otro idioma por negocio.

## Modelo de datos

No hay datos persistidos nuevos en el front. El estado del negocio:

```text
src/tenancy/
  tenant-context.jsx        TenantProvider + useTenant() -> { slug: string|null, isDefault: boolean }
  tenant-resolver.js        resuelve el slug de la ruta (parseo y validación)
  tenant-storage.js         sesión de admin por negocio (clave: tenant:<slug>|default)
  tenant-link.js            arma un enlace del front para un negocio dado
```

**Rutas.**

| Ruta | Servida por | Negocio |
| --- | --- | --- |
| `/` | Home | por defecto |
| `/disponibilidad` | Availability | por defecto |
| `/login` | Login | por defecto |
| `/admin` | Admin | por defecto |
| `/cancelar/:token` | CancelBooking | global (el token manda) |
| `/n/:slug` | Home | ese negocio |
| `/n/:slug/disponibilidad` | Availability | ese negocio |
| `/n/:slug/login` | Login | ese negocio |
| `/n/:slug/admin` | Admin | ese negocio |
| `/n/:slug/cancelar/:token` | CancelBooking | ese negocio (redirige al global) |

**Encabezado.**

| Cliente | `X-Tenant` |
| --- | --- |
| Navegador en `/` o `/n/principal` | se manda `principal` (o no se manda: el backend usa el por defecto) |
| Navegador en `/n/<otro>` | se manda `<otro>` |

El interceptor de axios de `src/core/http` agrega el encabezado si hay `slug`; las rutas del negocio por defecto no lo mandan, así que el backend aplica su negocio por defecto.

**Reglas que se conservan:** los textos de la interfaz, los mensajes de error y el diseño no cambian; `/` sigue funcionando igual; el enlace de cancelar sigue funcionando sin contexto de negocio; el panel de admin sigue entrando con la misma clave.

## Plan de implementación

Cada paso deja el sitio funcionando y con `vitest` en verde.

1. **Contexto y resolución.** `TenantProvider`, `useTenant`, parseo del slug y sus reglas (formato, longitud, slug inexistente). Tests.
2. **Cliente HTTP.** Interceptor de axios que agrega `X-Tenant`; `apiClient` no cambia su firma. Test de que la cabecera llega (con el doble de red actual).
3. **Rutas.** `App.jsx` con las rutas por negocio; las rutas existentes siguen igual. Cada página envuelve su contenido en el `TenantProvider` con el slug de la ruta.
4. **Carga de datos.** Catálogo, marca y disponibilidad se piden al negocio de la ruta; un slug inexistente o suspendido avisa con un mensaje y un enlace a la portada, sin pantalla en blanco.
5. **Sesión de admin por negocio.** La clave se guarda por negocio; entrar y salir de un negocio no pisa la sesión de otro. El panel de un negocio no muestra datos de otro (el backend ya lo garantiza).
6. **Enlaces y link público.** La pestaña "Compartir" copia `/n/<slug>/disponibilidad` cuando el panel está en la raíz, y el enlace del negocio correcto cuando ya está en una ruta de negocio.
7. **Socket.** `realtimeService.js` manda el negocio en el handshake y el panel escucha solo los avisos de su negocio (el backend ya separa por sala en la spec 18).
8. **E2E y cierre.** Prueba de punta a punta con dos negocios: el catálogo, la marca, la disponibilidad y la reserva del negocio B no aparecen en A; el panel de B no ve las reservas de A. Verificación completa.

## Criterios de aceptación

- [x] `/` sigue sirviendo el negocio por defecto, con las mismas pantallas y sin cambios en los textos.
- [x] `/n/<slug>` sirve el negocio de ese slug: catálogo, marca, horarios, locales y disponibilidad son los suyos.
- [x] Todas las peticiones al backend desde `/n/<slug>` llevan `X-Tenant: <slug>`, y desde `/` no lo llevan.
- [x] Un slug inexistente o suspendido muestra un mensaje claro y un enlace a la portada, no una pantalla en blanco ni un error sin explicar.
- [x] El enlace de cancelar (`/cancelar/<token>`) sigue funcionando sin contexto de negocio.
- [x] El panel de admin de un negocio no muestra ni permite tocar datos de otro, ni con la misma clave.
- [x] La sesión de admin de un negocio no se pisa al entrar a otro en el mismo navegador.
- [x] El link público que se copia desde "Compartir" apunta al negocio correcto.
- [x] El socket del panel solo recibe avisos de su negocio.
- [x] Pasan `vitest`, `vite build` y el e2e completo (con los casos nuevos de dos negocios).

## Decisiones

- **Sí:** la ruta `/n/<slug>` (decidido por el usuario): no necesita DNS comodín ni comprar nada.
- **Sí:** la raíz sigue siendo el negocio por defecto: los enlaces compartidos no se rompen.
- **Sí:** el encabezado `X-Tenant` lo agrega un interceptor de axios en un solo lugar (spec 15 dejó el cliente listo para esto).
- **Sí:** la sesión de admin se guarda por negocio: un mismo navegador puede manejar dos negocios.
- **Sí:** el enlace de cancelar sigue global: el token identifica la reserva.
- **No:** comprar ni configurar dominios.
- **No:** cambiar textos ni diseño.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Se rompe un enlace ya compartido | Las rutas actuales siguen iguales; solo se agregan rutas nuevas. |
| La cabecera se pierde en alguna llamada | Un solo interceptor; test de que la llega en las peticiones públicas y de admin. |
| Fuga de datos entre negocios en el panel | El backend ya aísla; el e2e de dos negocios lo comprueba de punta a punta. |
| Un slug mal escrito rompe el sitio | Mensaje claro y enlace a la portada; nunca pantalla en blanco. |

## Desvíos (al implementar, 2026-11-26)

- **El negocio sale de la barra de direcciones** (`window.location`), no de un estado de React: el interceptor de axios y las claves de sesión lo leen cuando se necesitan, así no hay nada que sincronizar. `TenantProvider` y `useTenant()` existen para los componentes.
- **El enlace de cancelar lleva el negocio**: `/n/<slug>/cancelar/<token>` para los negocios que no son el por defecto. El backend arma el enlace de los correos con el negocio de la reserva (`TenantPublicAppUrl`). Sin negocio en la ruta cae en el por defecto. Esto reemplaza la idea de "cancelar global sin negocio", que el aislamiento de la spec 18 no permite.
- **El aviso de negocio inexistente o suspendido** sale de pedir `/api/branding` al entrar a `/n/<slug>` (404 o 403).
- **El interceptor es síncrono** (`synchronous: true`): uno asíncrono rompía las pruebas con relojes falsos del login.
- **CORS** del backend permite `X-Tenant`.
- **E2E:** `e2e/specs/multi-tenant` (5 casos). El negocio de prueba se crea y se borra con `mongosh` sobre la base desechable.

## Lo que **no** está en esta spec

- Cuentas de admin (spec 20), registro y alta de negocios (spec 21), dominios propios, y todo lo comercial (specs 22 a 26).
