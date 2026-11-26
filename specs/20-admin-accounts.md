# SPEC 20 — Cuentas de admin con contraseña y roles

> **Status:** Implementado (2026-11-26)
> **Depends on:** SPEC 19
> **Date:** 2026-11-25
> **Objective:** Que cada negocio tenga sus propios usuarios de admin con contraseña, y que el panel acceda con una sesión en vez de una clave compartida.

---

## Por qué existe esta spec

Hoy el admin entra con una clave compartida del backend (`ADMIN_API_KEY`) y, si está configurado, un usuario. Con varios negocios eso no sirve: la misma clave abriría cualquier negocio, y no hay forma de saber quién cambió qué, ni de desactivar a alguien sin rotar la clave para todos.

La spec 17 dejó el puerto `AdminCredentials` listo para esto. Esta spec lo implementa con cuentas reales.

## Alcance

**Dentro:**

**Backend (`BookingApp_Back`):**

- Colección `admin_users`: `{ _id, tenantId, email, name, passwordHash, role, active, createdAt, lastLoginAt }`.
- Roles: `owner` (todo), `staff` (reservas y consulta de disponibilidad; no toca servicios, profesionales, horarios, locales, marca ni la página pública) y `viewer` (solo lectura).
- Contraseñas con hash (bcrypt o scrypt; Argon2 si la dependencia ya está disponible, si no `bcrypt`), mínimo 10 caracteres, comparación en tiempo constante.
- Sesiones: token opaco con caducidad (por ejemplo 7 días), guardado en hash, y revocación al cerrar sesión o al desactivar el usuario.
- `POST /api/admin/session` (entrar), `DELETE /api/admin/session` (salir) y `GET /api/admin/session` (estado). Hoy `GET` comprueba la clave; pasa a devolver la sesión.
- El guard de admin acepta **sesión** (cookie `HttpOnly` + `SameSite=Lax`) y, durante la transición, la clave actual. La clave se puede apagar por negocio.
- `GET /api/admin/catalog` y las rutas de lectura de reservas siguen igual para los tres roles; las de escritura se cierran por rol y devuelven `403` con un mensaje claro.
- Puerto `AdminCredentials` (spec 17) pasa a leer de la base, con un adaptador de entorno que sigue sirviendo la clave actual.
- Endpoints de administración de usuarios, solo para `owner`: listar, crear, cambiar rol, desactivar, rotar contraseña.

**Front (`BookingApp_Front`):**

- Login con correo y contraseña (en vez de la clave).
- Sesión con cookie: el front ya no guarda la clave en `sessionStorage`.
- Cierre de sesión y vencimiento: al vencer, al panel lo manda al login con un aviso.
- Ocultar según rol: un `staff` no ve las pestañas "Servicios", "Horarios", "Marca" ni "Compartir"; el backend sigue siendo la autoridad.
- Gestión de usuarios (solo `owner`): listar, crear, cambiar rol, desactivar.
- Mensajes de error en español y sin revelar si el correo existe.

**Fuera de alcance (otras specs):**

- Registro público de cuentas: los usuarios los crea el `owner` (spec 21 habilita el alta de negocios).
- Recuperar contraseña por correo: se hace con el `owner` por ahora.
- Cambio de contraseña propio: entra en una spec posterior.
- Facturación por usuario, auditoría detallada, permisos finos por recurso.
- Multi-factor.

## Modelo de datos

```ts
interface AdminUserRecord {
  _id: ObjectId;
  tenantId: ObjectId;          // el negocio al que pertenece
  email: string;               // minúscula, único por negocio
  name: string;                // 1 a 80 caracteres
  passwordHash: string;        // nunca sale del backend
  role: 'owner' | 'staff' | 'viewer';
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}
// Índices: { tenantId, email } único; { tenantId, role }.

interface AdminSessionRecord {
  _id: ObjectId;
  tenantId: ObjectId;
  userId: ObjectId;
  tokenHash: string;           // el token en claro solo se devuelve al crear la sesión
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
}
// Índices: { tokenHash } único; { expiresAt } con TTL (limpieza automática).
```

**Roles y permisos.**

| Acción | `owner` | `staff` | `viewer` |
| --- | --- | --- | --- |
| Ver reservas, disponibilidad y estadísticas | Sí | Sí | Sí |
| Crear, editar, cancelar y eliminar reservas | Sí | Sí | No |
| Servicios, profesionales, horarios, locales, marca, página pública | Sí | No | No |
| Gestión de usuarios | Sí | No | No |

**Reglas que se conservan:** `GET /api/admin/session` con la clave actual sigue respondiendo `{"ok": true}`; toda ruta de admin sin credencial válida sigue dando `401`; el mensaje de error del login no revela si el correo existe; la cookie de sesión es `HttpOnly` y `Secure` en producción.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio y hashing.** Reglas de contraseña, correo y rol; hash y comparación con el algoritmo elegido; tests puros (el hash no necesita base de datos).
2. **Puertos y casos de uso** de usuarios y sesiones, con adaptadores en memoria.
3. **Persistencia.** Esquema, repositorios de usuarios y sesiones, suite de contrato contra Mongo y memoria; el índice TTL de sesiones.
4. **Sesión y guard.** Endpoints de entrar, salir y estado; guard que acepta sesión y, durante la transición, la clave; cookies `HttpOnly`; `403` por rol con mensaje claro.
5. **Administración de usuarios.** Endpoints solo `owner` y sus tests.
6. **Front.** Login con correo y contraseña, sesión por cookie, cierre de sesión, aviso de vencimiento, ocultar pestañas por rol y la pestaña de usuarios para `owner`. Tests de componente.
7. **Cierre.** E2E de dos negocios con dos usuarios y dos roles: el `staff` no ve ni toca la configuración, el `owner` sí, y un usuario desactivado no puede entrar. Verificación completa.

## Criterios de aceptación

- [x] El `owner` entra con correo y contraseña, la sesión sobrevive a recargar y cierra al cerrar sesión.
- [x] Un usuario desactivado o con contraseña equivocada no puede entrar, y el mensaje no revela si el correo existe.
- [x] La sesión vencida manda al login con un aviso claro.
- [x] Un `staff` no ve las pestañas de configuración en el panel y el backend responde `403` si las llama igual.
- [x] Un `viewer` no puede crear, editar ni cancelar reservas.
- [x] El `owner` puede crear un usuario, cambiarle el rol y desactivarlo.
- [x] Los usuarios son por negocio: el mismo correo en dos negocios son dos cuentas y el token de sesión de uno no vale en el otro.
- [x] Durante la transición, la clave actual sigue funcionando hasta que se apague por negocio.
- [x] Ninguna respuesta del backend devuelve `passwordHash` ni el token en claro (salvo al crear la sesión).
- [x] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** sesiones con token opaco y cookie `HttpOnly`, en vez de guardar la clave en el navegador: la clave en `sessionStorage` es accesible a cualquier script de la página.
- **Sí:** tres roles simples (`owner`, `staff`, `viewer`), no permisos finos por recurso.
- **Sí:** el token en claro solo se devuelve al crear la sesión; en la base queda su hash.
- **Sí:** el TTL de sesiones limpia las vencidas sin cron.
- **Sí:** la clave actual sigue funcionando durante la transición (se apaga por negocio cuando el negocio tenga su `owner`).
- **No:** correo de recuperación, registro público, 2FA, auditoría detallada.
- **No:** cambiar la contraseña propia en esta spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un token de sesión se filtra | Solo se guarda el hash; cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción; TTL de 7 días. |
| Se confunden los roles | Tabla de permisos en la spec y tests por rol en el front y en el backend. |
| Un negocio queda sin `owner` | El `owner` no se puede degradar ni desactivar a sí mismo si es el último; mensaje de error. |
| La clave compartida sigue abierta | Se apaga por negocio al crear el primer `owner`; queda anotado en `docs/tenancy.md`. |

## Desvíos (al implementar, 2026-11-26)

- **Las claves de sesión** llevan `tenantId` primero (`{tenantId, tokenHash}`), no `{tokenHash}` global: un token de un negocio no vale en otro. Solo el índice TTL de `expiresAt` no lleva `tenantId`.
- **Errores 401:** los errores de credenciales son de clase `forbidden` en el dominio y el borde HTTP los responde como `401` (`respondAuth`), para no tocar el catálogo compartido de errores.
- **Rutas sin `@Roles`:** cualquier rol lee (`GET`/`HEAD`/`OPTIONS`); escribir es solo del dueño. Una ruta nueva nace cerrada. La clave compartida cuenta como dueño.
- **La clave compartida se apaga por negocio** con `ADMIN_KEY_DISABLED_TENANTS` (slugs separados por coma).
- **Login en el front:** si el usuario tiene `@` se intenta la sesión con correo y contraseña; si falla (o no tiene `@`) se prueba la clave compartida. Así la transición no rompe nada. El rol y el modo se guardan en `sessionStorage` solo para mostrar u ocultar; el backend decide.
- **El socket** acepta la cookie de sesión además de la clave (`withCredentials`).
- **Bootstrap:** `npm run admin:create -- --tenant <slug> --email <e> --name <n> --password <p>` crea el primer dueño. Documentado en `docs/admin-accounts.md` del backend.
- **Sin reactivar** usuarios desactivados, sin limitar intentos en el servidor, y la regla del último dueño es leer-y-escribir (no atómica): riesgos aceptados y anotados.
- **Producción:** la cookie es `SameSite=Lax`. Con el front en `vercel.app` y el back en otro dominio, el navegador no la envía en pedidos entre sitios distintos. Hace falta un dominio común (proxy o dominio propio) o `SameSite=None; Secure`. Pendiente de decidir antes de apagar la clave compartida.

## Lo que **no** está en esta spec

- Registro público de cuentas y alta de negocios (spec 21), recuperación de contraseña, 2FA, auditoría y facturación por usuario (specs 22 a 26).
