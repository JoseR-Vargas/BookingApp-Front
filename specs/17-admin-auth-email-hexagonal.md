# SPEC 17 — Admin, auth y email hexagonal

> **Status:** Aprobado (el usuario pidió seguir sin pausas)
> **Depends on:** SPEC 14
> **Date:** 2026-11-25
> **Objective:** Migrar a arquitectura hexagonal con `Result` los módulos `admin`, `auth` y `email`, sin cambiar ninguna ruta, mensaje ni correo.

---

## Por qué existe esta spec

Son los tres módulos chicos que quedan fuera de WhatsApp (unas 470 líneas en total), pero con acoples que importan antes del multi-negocio:

- `auth`: el guard compara la clave de admin y el usuario leyendo `process.env` directamente. Con cuentas de admin (spec 19) esa lectura será una base de datos; hoy tiene que ser un puerto.
- `email`: `EmailService` mezcla las plantillas (texto puro) con el envío por `MailerService` y con `process.env.PUBLIC_APP_URL`. Las plantillas son reglas puras; el envío es un adaptador.
- `admin`: `ScheduleImpactService` consulta la colección de reservas desde el módulo de administración y usa `new Date()` y `process.env`.

## Alcance

**Dentro (backend `BookingApp_Back`):**

- `auth`: dominio de credenciales de admin (regla "falla cerrado", usuario obligatorio solo si está configurado), puerto `AdminCredentials` con adaptador de entorno que compara en tiempo constante, el guard como adaptador HTTP y el controlador de sesión.
- `email`: plantillas de confirmación y de cancelación como funciones puras; casos de uso `SendBookingConfirmation` y `SendCancellationConfirmation`; puerto `EmailSender` con adaptador sobre `MailerService`; puerto de configuración para la URL pública.
- `admin`: caso de uso `CountAffectedBookings` (reservas futuras fuera de horario) con puertos sobre el repositorio de reservas, la fecha del negocio y la zona horaria; `GET /api/admin/catalog` sigue llamando al catálogo.
- Los adaptadores `EmailBookingNotifier` de `bookings` pasan a llamar a los casos de uso de `email`, y se conservan las firmas que usa `EmailService` para los consumidores sin migrar.
- `admin`, `auth` y `email` se agregan a `MIGRATED_MODULES` y `RESULT_MODULES`.

**Fuera de alcance (otras specs):**

- Cuentas de admin con contraseña y roles (spec 19): aquí solo se deja el puerto.
- Emails con la marca de cada negocio y el aislamiento por negocio (spec 18).
- El bot de WhatsApp (spec 26).
- Cambiar rutas, mensajes o el texto y el diseño de los correos.
- El front.

## Modelo de datos

No hay datos persistidos nuevos.

```text
src/auth/
  domain/       admin-credentials.rules.ts   regla: sin clave configurada nada pasa; usuario obligatorio si está configurado
  application/  ports/admin-credentials.port.ts   AdminCredentials { isValid(bearer, username): boolean }
                use-cases/verify-admin-credentials.use-case.ts
  infrastructure/ env-admin-credentials.ts (ADMIN_API_KEY / ADMIN_USERNAME, comparación en tiempo constante)
                  admin-key.guard.ts  (adaptador HTTP; mismo 401 para todo fallo)
                  admin-session.controller.ts
src/email/
  domain/       booking-email.templates.ts   asunto y cuerpo de cada correo (puras; la URL pública es un dato)
  application/  ports/email-sender.port.ts, public-app-url.port.ts
                use-cases/send-booking-confirmation.use-case.ts, send-cancellation-confirmation.use-case.ts
  infrastructure/ mailer-email-sender.ts  env-public-app-url.ts
src/admin/
  domain/       schedule-impact.rules.ts   isOutsideSchedule (pura)
  application/  ports/upcoming-bookings.reader.ts   (lo implementa bookings)
                use-cases/count-affected-bookings.use-case.ts
  infrastructure/ (controladores y presenter)
```

**Reglas que se conservan** (hay tests que las fijan): el guard falla cerrado sin `ADMIN_API_KEY`; compara clave y usuario siempre, y todo fallo da el mismo `401` sin revelar cuál falló; el correo de confirmación incluye el enlace de cancelación solo si `PUBLIC_APP_URL` es una URL `http(s)` válida; los correos escapan el HTML de los datos del cliente; una reserva sin email no manda correo.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Reglas de credenciales, plantillas de correo y `isOutsideSchedule` como funciones puras con sus tests (los mensajes y textos actuales, byte por byte en los correos).
2. **Puertos y casos de uso** contra adaptadores en memoria.
3. **Adaptadores.** Credenciales de entorno, remitente sobre `MailerService`, URL pública y el lector de reservas futuras; suite de contrato donde aplique (lector contra Mongo y memoria).
4. **Guard y controladores.** El guard queda como adaptador HTTP con las mismas respuestas; las suites HTTP existentes de auth y admin se conservan con las mismas aserciones.
5. **Fachadas y consumidores.** `EmailService` queda como fachada fina con las mismas firmas; `ScheduleImpactService` se reemplaza por el caso de uso y los controladores de catálogo que lo usaban pasan a llamarlo.
6. **Cierre.** Comparación antes y después de las respuestas de `GET /admin/session`, `GET /admin/catalog` y del contenido exacto de los dos correos; verificación completa.

## Criterios de aceptación

- [ ] `GET /api/admin/session` y `GET /api/admin/catalog` y las rutas que usan `affectedBookings` responden igual que antes; los dos correos salen con el mismo asunto y el mismo HTML.
- [ ] El guard responde el mismo `401` ante clave ausente, incorrecta, sin usuario o con usuario incorrecto, y falla cerrado sin clave configurada.
- [ ] `auth`, `email` y `admin` no leen `process.env` ni `new Date()` fuera de `infrastructure/`; sus capas puras no importan Mongoose, HTTP ni `nodemailer`.
- [ ] Un envío de correo que falla no hace fallar la reserva (se conserva el mejor esfuerzo).
- [ ] El lector de reservas futuras de Mongo y el en memoria pasan la misma suite de contrato.
- [ ] `bookings` y el bot pasan sus suites sin cambios.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, el lint del código nuevo y el e2e completo del front.

## Decisiones

- **Sí:** las credenciales de admin son un puerto: la spec 19 lo reemplaza por cuentas en base de datos sin tocar el guard.
- **Sí:** la comparación en tiempo constante vive en el adaptador (usa `crypto`), el dominio solo decide qué comparar.
- **Sí:** las plantillas de correo son funciones puras: se prueban sin enviar nada y se comparan byte por byte.
- **Sí:** el envío de correo es un puerto (`EmailSender`): cambiar de proveedor es un adaptador.
- **No:** cambiar el contenido ni el diseño de los correos.
- **No:** cuentas, contraseñas, sesiones ni roles (spec 19).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambia un byte de un correo | Comparación antes y después del asunto y el HTML de los dos correos. |
| El guard deja pasar o rechaza distinto | Las suites de `admin-key.guard`, de usuario y de las rutas protegidas pasan sin cambios. |
| El conteo `affectedBookings` cambia | Los specs de `schedule-impact` conservan sus aserciones; contrato del lector. |

## Lo que **no** está en esta spec

- Cuentas de admin (spec 19), emails por negocio y aislamiento (spec 18) y el bot (spec 26).
