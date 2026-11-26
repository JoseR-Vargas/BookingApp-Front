# SPEC 26 — Fuera WhatsApp: el bot y el envío

> **Status:** Implementado (2026-11-26)
> **Depends on:** SPEC 24
> **Date:** 2026-11-25 (reescrita el 2026-11-26)
> **Objective:** Quitar WhatsApp del producto: ni el bot que responde y reserva, ni el envío de avisos y recordatorios. Todo lo demás sigue igual.

---

## Por qué cambió

Esta spec nació para migrar el bot de WhatsApp a la arquitectura hexagonal y que atendiera por negocio. El dueño del producto decidió otra cosa: **WhatsApp sale del producto**. No es una migración, es una eliminación.

Lo que se borra, en dos partes que antes eran separadas:

1. **El bot de entrada:** el cliente escribía al número del negocio y el bot contestaba y armaba la reserva. Era unas 3.700 líneas que mezclaban el flujo de la conversación con el acceso a la base.
2. **El envío de WhatsApp:** los avisos al administrador y los recordatorios al cliente salían por ese canal.

## Qué se eliminó

**Backend:**

- `src/whatsapp/` completo: el bot (`bot/`), el webhook, el cliente de la API de Meta, la configuración, la seguridad de la firma, el parser del payload, las colecciones `conversation_states` y `processed_messages`, los servicios de estado y de mensajes procesados, y el módulo (con sus dos variantes: la API y la que usaba el bot).
- El aviso al administrador por WhatsApp (`AdminWhatsappBookingNotifier`) y el módulo `WhatsappApiModule` de reservas. El aviso en vivo por socket y el correo al cliente quedan.
- El canal de WhatsApp de los recordatorios: el tipo `ReminderChannel` es `['email']`, el remitente de WhatsApp y su simulador, y la fábrica de remitentes.
- Las variables `WHATSAPP_*` de `.env.example` y el documento `docs/whatsapp-setup.md`.

**Front:**

- El canal de WhatsApp de la pestaña "Recordatorios": queda solo el correo.
- El icono de WhatsApp del pie de página (los enlaces sociales son de la empresa, no del producto).

**Lo que se mudó en lugar de borrarse:**

- `src/whatsapp/bot/business-time.ts` pasó a `src/shared/domain/business-time.ts`: lo usaban las reglas de horarios del admin y las de cancelación. El reloj dejó de ser un valor por defecto (la regla de arquitectura no permite `new Date()` en el dominio) y ahora lo pasa quien llama.

## Reglas que se conservan

- **Las reservas siguen siendo iguales**: el mismo caso de uso, los mismos horarios, los mismos locales.
- **La página pública sigue igual**: catálogo, marca, disponibilidad y reserva.
- **Los recordatorios siguen existiendo**, pero por correo. Un cliente sin correo no recibe nada.
- **El aviso al administrador sigue existiendo** por el socket (el panel se actualiza solo) y por correo al cliente.
- **La configuración del negocio** sigue teniendo interruptor, anticipación y plantilla.

## Criterios de aceptación

- [x] No queda ningún módulo de WhatsApp en el backend, ni archivos, ni referencias en el código.
- [x] Los recordatorios salen solo por correo, con el mismo interruptor, anticipación, plantilla, idempotencia y reintentos.
- [x] El aviso al administrador sigue llegando por el socket en vivo y el correo al cliente sigue igual.
- [x] La página pública y el panel funcionan igual que antes.
- [x] Las pruebas de integración no dejan correos reales (esto se corrigió de paso: aparecía un detalle).
- [x] Pasan `npm test`, `npm run test:int`, `tsc`, `eslint`, `vitest`, `vite build` y el e2e completo.

## Lo que **no** está en esta spec

- Un canal nuevo de mensajes (SMS, push, Telegram): si alguna vez se quiere, es un puerto más, como el de pagos.
- Notificaciones al administrador por correo: hoy el administrador se entera por el panel en vivo.
- La recuperación del bot en el futuro: la arquitectura lo يسمح (el puerto `MessageSender` sigue existiendo), pero el código está borrado.

## Desvíos (al implementar, 2026-11-26)

- **El canal de WhatsApp se borró del tipo, no solo del adaptador.** `ReminderChannel` es `['email']`: no queda un canal que nunca se pueda usar.
- **Las pruebas que medían "ambos canales"** se reescribieron para el correo (una reserva con teléfono y correo ahora genera un recordatorio, no dos).
- **Un cliente sin correo no se avisa.** La API exige el teléfono del cliente, pero el correo es opcional: sin correo no hay recordatorio.
- **Corrección de paso:** las pruebas de integración estaban enviando correos reales por la cuenta de Gmail del desarrollador (y ya habían golpeado el límite diario de envíos). Ahora el entorno de pruebas anula las credenciales y apunta el mailer a un puerto local cerrado, y el host y el puerto del mailer salen del entorno (`MAIL_HOST`, `MAIL_PORT`).

## El panel sin socket en vivo (2026-11-26)

Al desplegar en Vercel se comprobó que el backend desplegado responde `404` en `/socket.io`: una
función serverless no puede mantener una conexión abierta ni compartir el estado del servidor de
Socket.IO entre invocaciones. El problema no era el proxy ni la cookie, sino la arquitectura.

Mientras el backend siga en Vercel, el panel **sondea**: `GET /api/bookings/ids` (solo ids, sin datos
del cliente) cada 5 segundos, solo con la pestaña visible. Lo que ya se conoce se marca, así que
una reserva nunca se avisa dos veces (el socket, cuando funciona, marca lo suyo). Cuando el backend
pase a un host con proceso vivo, el socket vuelve y los dos caminos conviven.

## Verificación

- `npm test`: 2190 de 2192 (los 2 de siempre en `src/main.spec.ts`).
- `npm run test:int`: 258 de 258.
- `npx tsc --noEmit`: limpio. `eslint` de los archivos tocados: limpio.
- Front: `vitest` 1224 pasan y 5 saltados, `vite build` limpio.
- E2E completo: 83 de 83 (el de recordatorios, con un caso nuevo: un cliente sin correo no recibe nada).
