# SPEC 21 — Alta de negocios y asistente de configuración

> **Status:** Aprobado (el usuario pidió seguir sin pausas)
> **Depends on:** SPEC 20
> **Date:** 2026-11-25
> **Objective:** Que alguien pueda crear su negocio por su cuenta, con su marca y sus horarios, sin intervención del dueño del sistema.

---

## Por qué existe esta spec

Con cuentas de admin (spec 20), un negocio ya puede tener sus usuarios. Falta el paso de entrada: hoy crear un negocio es una tarea manual (base de datos, clave de admin, catálogo). Para vender en autoservicio, alguien tiene que poder crear el suyo, poner su nombre y logo, definir sus horarios y servicios, y empezar a recibir reservas.

Esta spec hace ese paso, y de paso define lo que es una "prueba gratuita": un negocio nuevo empieza con un límite de tiempo o de reservas, para poder usarlo sin pagar antes de decidir.

## Alcance

**Dentro:**

**Backend:**

- `POST /api/signup` público: crea el negocio y su primer usuario `owner` en una sola operación, y devuelve la sesión iniciada (cookie), como hace el login.
- Datos mínimos del alta: nombre del negocio, nombre del administrador, correo, contraseña, slug sugerido (único, reservado o derivado del nombre; el usuario puede ajustarlo).
- El negocio nace con: local "Principal", horario semilla (el de hoy, lunes a viernes 09:00 a 20:00 y sábado 09:00 a 18:00, el de la app actual), la página pública apagada y sin servicios ni profesionales.
- Asistente de configuración por pasos, todo opcional y guardable de a uno: servicios (nombre, duración, precio, qué profesionales los ofrecen), profesionales (nombre, especialidad, experiencia), horarios por local y la página pública (días a mostrar y servicios publicados).
- Límite de la prueba gratuita: un negocio nuevo tiene `trialEndsAt` (por ejemplo 14 días) y un tope de reservas. Al llegar al tope, el negocio queda en modo solo lectura: no acepta reservas nuevas, el panel avisa y ofrece activarlo. Las cuentas y el catálogo siguen accesibles.
- `GET /api/admin/trial` (o el mismo `GET /api/admin/session`) devuelve el estado de la prueba: días restantes, reservas hechas y tope, y si está bloqueada.
- Correo de bienvenida al administrador con el enlace del panel (si el envío de correo está configurado; si no, el alta funciona igual y el correo queda pendiente).

**Front:**

- Página `/empezar`: alta en un paso (nombre, administrador, correo, contraseña) y, al entrar, el asistente por pasos.
- Asistente: servicios → profesionales → horarios → página pública. Puede saltear cualquier paso y volver atrás; guarda cada paso.
- Panel: aviso de la prueba (días restantes y reservas hechas) y estado bloqueado con una llamada a la acción.
- Enlace "Empezar" en la portada.

**Fuera de alcance (otras specs):**

- Cobro y planes (spec 22): aquí solo el estado de la prueba y el bloqueo.
- Verificación de correo, captcha, límite de intentos de alta y antiflood.
- Importar un negocio existente desde otra herramienta.
- Dominio propio por negocio (queda preparado el slug).
- Personalizar el asistente con más campos.

## Modelo de datos

```ts
// El negocio gana dos campos
interface TenantRecord {
  // ...lo de la spec 18
  trialEndsAt: Date | null;      // null = sin prueba (negocio ya pagado o creado por el dueño)
  bookingQuota: number | null;   // tope de reservas de la prueba; null = sin tope
}
```

Reglas de la prueba (valores iniciales, ajustables por el dueño del sistema):
- `trialEndsAt`: ahora + 14 días.
- `bookingQuota`: 20 reservas creadas.

Al vencer el tiempo o al llegar al tope, el negocio queda bloqueado para reservas nuevas: el POST de reservas responde `403` con `Este negocio alcanzó el límite de su prueba.` El panel y el catálogo siguen funcionando, y el `owner` ve el aviso con qué hacer.

**Reglas que se conservan:** un slug inválido o repetido se rechaza con un mensaje claro; la contraseña del alta cumple las reglas de la spec 20; el alta no envía correos si el correo no está configurado; los datos de un negocio nuevo nunca se mezclan con otro (el aislamiento de la spec 18).

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Reglas del alta (nombre, slug único y reservado, correo, contraseña) y de la prueba (tiempo, tope, estado), como funciones puras con `Result`; tests.
2. **Casos de uso.** `SignUpBusiness` (crea negocio, local, horario semilla, usuario `owner` y sesión en una operación) y `GetTrialStatus`; tests con adaptadores en memoria.
3. **Endpoints.** `POST /api/signup` (público) y el estado de la prueba en la sesión de admin; rate limit básico por IP para el alta.
4. **Bloqueo de reservas.** El POST de reservas de un negocio bloqueado responde `403` con el mensaje; el e2e lo cubre.
5. **Correo de bienvenida.** Extender el módulo `email` con la plantilla; si el envío no está configurado, el alta sigue y queda un aviso en el log.
6. **Front: `/empezar`.** Formulario de alta y manejo de error (slug repetido, correo inválido, contraseña débil).
7. **Front: asistente.** Cuatro pasos, guardados de a uno, con salto y vuelta atrás; usa los endpoints de admin ya existentes para servicios, profesionales, horarios y página pública.
8. **Front: aviso de prueba y bloqueo.** En el panel, con días restantes, reservas hechas y el estado bloqueado.
9. **Cierre.** E2E del recorrido completo: alta → asistente con un servicio, un profesional y un horario → reserva pública → aviso de la prueba. Verificación completa.

## Criterios de aceptación

- [ ] Con el formulario de alta, alguien crea su negocio y entra al panel ya con sesión iniciada, sin intervención del dueño del sistema.
- [ ] El negocio nuevo tiene local "Principal", horario semilla, página pública apagada y sin servicios ni profesionales.
- [ ] Un slug inválido, repetido o reservado se rechaza con un mensaje claro y el alta no crea nada.
- [ ] El asistente guarda cada paso de a uno, se puede saltear y se puede volver atrás.
- [ ] Con los datos del asistente, el sitio público del negocio muestra sus servicios, profesionales y horarios y acepta una reserva.
- [ ] La prueba gratuita avisa los días restantes y las reservas hechas.
- [ ] Al llegar al tope de reservas o al vencer la prueba, el negocio no acepta reservas nuevas (`403` con mensaje) y el panel sigue funcionando con el aviso.
- [ ] Un alta repetida desde la misma IP queda limitada.
- [ ] Los datos de dos negocios creados por el alta no se mezclan (el aislamiento de la spec 18 lo cubre).
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** el alta crea negocio, local, horario semilla y el primer `owner` en una sola operación, y devuelve la sesión: nadie tiene que cambiar una clave a mano.
- **Sí:** la prueba gratuita se modela con `trialEndsAt` y `bookingQuota` en el negocio, no con un servicio aparte: son dos campos y una regla.
- **Sí:** al vencer la prueba el negocio queda bloqueado para reservas nuevas, no se borra ni se oculta: el cliente ve su datos y puede decidir.
- **Sí:** el asistente guarda de a uno y todo es opcional: nadie tiene que seguirlo entero.
- **Sí:** el correo de bienvenida es opcional: el alta no depende del correo configurado.
- **No:** verificación de correo ni captcha en esta spec (el rate limit por IP es lo mínimo).
- **No:** cobro (spec 22).
- **No:** importar negocios ni dominios propios.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Abuso del alta (bots, spam) | Rate limit por IP, slugs reservados, y la prueba que limita las reservas. |
| Un alta a medias deja basura | El negocio y su `owner` se crean en una operación; si algo falla, no queda nada. |
| El bloqueo de la prueba sorprende al cliente | Aviso con días y reservas desde el primer día, y el panel lo repite. |
| El asistente obliga a un camino único | Todos los pasos son opcionales y saltables. |

## Lo que **no** está en esta spec

- Cobro y planes (spec 22), verificación de correo, captcha, importación de negocios, dominios propios y todo lo demás comercial (specs 23 a 26).
