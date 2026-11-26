# SPEC 24 — Recordatorios de cita al cliente

> **Status:** Implementado (2026-11-26)
> **Depends on:** SPEC 23
> **Date:** 2026-11-25
> **Objective:** Que el cliente reciba un recordatorio de su cita antes de la hora, por el canal que el negocio elija, y que el negocio pueda configurarlo sin tocar código.

---

## Por qué existe esta spec

El "no-show" es la fuga de dinero más común en un negocio de servicios: una hora vacía que se pagó. El recordatorio previo es la palanca más barata. Además, el cliente hoy solo recibe el email de confirmación (y solo si lo escribió); en Uruguay, el canal que la gente realmente usa es WhatsApp.

El bot de WhatsApp ya sabe enviar mensajes (spec 26 lo migra), así que el canal principal es ese. El email queda como segundo canal.

## Alcance

**Dentro:**

**Backend:**

- Configuración por negocio: canal (WhatsApp, email, ambos, ninguno), anticipación (cuántas horas antes: por defecto 24 y 3), plantilla del mensaje y si se recuerda también a los que cancelaron.
- **Envío programado**: un proceso revisa las reservas cuya cita cae dentro de la ventana de recordatorio y que todavía no fueron recordadas, y envía el mensaje. Corre cada X minutos (por defecto 5) dentro del backend, sin depender de un cron externo.
- Idempotencia: cada reserva tiene un registro de qué recordatorios ya se enviaron (`reminders: [{ kind, sentAt, channel, ok }]`), para que un reintento no duplique el mensaje.
- **Reglas de negocio:** no se recuerda una reserva cancelada, ni una en el pasado, ni una ya recordada; el mensaje sale en la zona horaria del negocio.
- **Puerto de mensajería** (`MessageSender`) con un adaptador de WhatsApp (el cliente que ya existe) y otro de email (el módulo `email` de la spec 17). Envío de mejor esfuerzo: si falla, se registra y se reintenta en la próxima vuelta (hasta 3 intentos).
- **Opt-in y privacidad:** el mensaje incluye el nombre del negocio, la fecha, la hora, el profesional y el enlace de cancelar, y no incluye datos que el cliente no haya dado (teléfono y correo solo al cliente). Si el cliente no dejó teléfono ni correo, no hay recordatorio.
- **Endpoints de admin**: leer y guardar la configuración de recordatorios; ver los recordatorios enviados de una reserva.
- Aviso al `owner` de cuántos recordatorios se enviaron y cuántos fallaron, en el panel.

**Front:**

- Sección de recordatorios en el panel (dentro de "Compartir" o una pestaña nueva "Recordatorios"): canal, anticipación, plantilla, interruptor de encendido y una vista de los últimos enviados con su estado.
- Vista en el detalle de una reserva: qué recordatorios se enviaron y cuándo.

**Fuera de alcance (otras specs):**

- La fecha y hora local del negocio por negocio (spec 18 usa `BUSINESS_TIMEZONE` global; esta spec usa la global y lo anota).
- WhatsApp con plantillas aprobadas por la pasarela (la plantilla libre depende de lo que permita la pasarela; se documenta).
- Recordatorios por SMS o por push.
- Programación por día de la semana o días festivos.
- Marcar y pagar una seña con el recordatorio.
- Bot de WhatsApp migrado a hexagonal (spec 26): aquí se usa el cliente que ya existe.

## Modelo de datos

```ts
// Configuración por negocio
interface TenantRecord {
  // ...lo de las specs 18 a 23
  reminders: {
    enabled: boolean;
    channels: ('whatsapp' | 'email')[];
    hoursBefore: number[];        // por defecto [24, 3]
    template: string;              // con marcadores {cliente} {fecha} {hora} {profesional} {negocio} {cancelar}
  };
}

// Registro en la reserva
interface BookingRecord {
  // ...lo actual
  reminders?: { kind: string; channel: 'whatsapp' | 'email'; sentAt: Date; ok: boolean; error?: string }[];
}
```

**Valores por defecto:** canal `whatsapp` si el cliente dejó teléfono, `email` si no, y ambos si dejó los dos; anticipación 24 h y 3 h; plantilla con el nombre del negocio, la fecha y hora, el profesional y el enlace de cancelar.

**Reglas que se conservan:** el enlace de cancelar del recordatorio es el mismo token de la reserva (válido una vez); un cliente sin teléfono ni correo no recibe nada; el recordatorio nunca se manda más de una vez por tipo y ventana; un envío fallido no rompe nada más.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Reglas: qué reservas hay que recordar ahora, qué ventana corresponde, si ya se lembrou, y la sustitución de marcadores de la plantilla. Funciones puras con `Result`; tests con las horas y zonas horarias.
2. **Puerto y adaptadores.** `MessageSender` con su contrato; adaptador de WhatsApp (el cliente existente) y de email (el módulo `email` de la spec 17); un adaptador en memoria para las pruebas.
3. **Caso de uso y planificador.** `SendDueReminders` (qué recordatorios tocan y no se han enviado) y `SendReminder` (uno, con registro e idempotencia); pruebas con el reloj fijo.
4. **Persistencia.** Campo `reminders` en la reserva y configuración en el negocio; suite de contrato del registro.
5. **Programación.** Un servicio que corre cada X minutos dentro del backend, con arranque y parada limpios, y que no solapa vueltas (si una vuelta está corriendo, la siguiente espera). Sin cron externo.
6. **Endpoints y front.** Configuración en el admin y su pantalla; detalle en la reserva; aviso de conteos al `owner`.
7. **Cierre.** E2E: reserva creada → recordatorio pendiente → se envía una vez → no se repite; reserva cancelada → no se manda; cliente sin teléfono → no se manda. Verificación completa.

## Criterios de aceptación

- [x] Con los recordatorios activados, una reserva futura recibe el recordatorio en cada ventana configurada, y solo una vez por ventana.
- [x] Cancelar la reserva antes de la ventana evita el recordatorio.
- [x] Un cliente sin teléfono ni correo no recibe nada.
- [x] El mensaje incluye nombre del negocio, fecha, hora, profesional y el enlace de cancelar, y no incluye datos de otros clientes.
- [x] El enlace del recordatorio cancela esa reserva (es el mismo token) y solo esa.
- [x] Un envío fallido se registra como fallido y se reintenta en la siguiente vuelta, hasta 3 veces; no rompe el proceso.
- [x] Cambiar la configuración de recordatorios se aplica en la siguiente vuelta.
- [x] El `owner` ve en el panel la configuración, los últimos enviados con su estado y el conteo de envíos y fallos.
- [x] El proceso no solapa vueltas: si una está corriendo, la siguiente espera.
- [x] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** WhatsApp es el canal principal y el email el secundario, porque el cliente elige según lo que dejó.
- **Sí:** el recordatorio se programa dentro del backend, sin cron externo: en plataformas serverless el trabajo sin await se congela, y el proceso ya vive en el backend.
- **Sí:** el registro de recordatorios enviados va en la propia reserva: la idempotencia no depende de otro servicio.
- **Sí:** la ventana por defecto es 24 h y 3 h antes.
- **Sí:** el texto es configurable con marcadores, con una plantilla por defecto que ya incluye todo lo necesario.
- **No:** plantillas de WhatsApp aprobadas por la pasarela (depende de lo que permita el proveedor).
- **No:** recordatorios por SMS, push, días festivos ni por día de la semana.
- **No:** zona horaria por negocio (se usa la global; se anota como limitación hasta el multi-negocio completo).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Mensajes duplicados | Registro por tipo y ventana en la reserva; el planificador solo toma lo pendiente. |
| Un fallo del proveedor tapa el proceso | Envío de mejor esfuerzo con captura del error, reintento acotado y registro. |
| Spam | Dos ventanas por defecto, un mensaje corto y un opt-in en la configuración. |
| Vueltas solapadas | Cerrojo de una sola vuelta en curso. |
| Fuga de datos en el mensaje | La plantilla solo se completa con datos de esa reserva y del negocio. |

## Desvíos (al implementar, 2026-11-26)

- **Remitente de prueba:** `REMINDERS_SENDER=fake` usa un simulador (como la pasarela de pagos de la spec 23) para el desarrollo y el e2e; por defecto se usan WhatsApp y el correo de verdad.
- **Intervalo fraccionario:** `REMINDERS_INTERVAL_MINUTES` acepta decimales (0.05 = tres segundos) para que el e2e no espere cinco minutos. Por defecto, 5.
- **Un canal no configurado no es un fallo:** si WhatsApp o el correo no están configurados, el recordatorio se salta (queda pendiente para la próxima vuelta) y no se registra como error.
- **La reserva guarda el registro:** `reminders: [{ kind, channel, sentAt, ok, error, attempts }]`, un registro por ventana y canal. Un fallo se reintenta hasta 3 veces.
- **La ventana es `inicio - anticipación` hasta el inicio:** con la anticipación de 24 h, una reserva a 7 días todavía no se recuerda. El e2e abre la ventana a propósito para probar el caso de la reserva cancelada.
- **El plan manda:** el plan `gratis` de la spec 23 no permite recordatorios; un negocio sin suscripción sí puede.
- **Zona horaria:** la global `BUSINESS_TIMEZONE` (la spec 24 lo anota como limitación).
- **Cada negocio por su cuenta:** el planificador recorre los negocios y lee sus reservas dentro del scope de cada uno.

## Lo que **no** está en esta spec

- SMS, push, días festivos, programaciones por día, zonas horarias por negocio, seña al reservar y el bot de WhatsApp migrado (spec 26).
