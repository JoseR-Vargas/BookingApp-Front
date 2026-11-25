# SPEC 26 — Bot de WhatsApp hexagonal y por negocio

> **Status:** Aprobado (el usuario pidió seguir sin pausas; esta spec es la última del plan y el usuario pidió dejar el bot para el final)
> **Depends on:** SPEC 25
> **Date:** 2026-11-25
> **Objective:** Migrar el bot de WhatsApp a la arquitectura hexagonal y que hable con el negocio correcto y no solo con el principal.

---

## Por qué existe esta spec

El bot de WhatsApp es la última parte sin migrar: unas 1 440 líneas que mezclan el flujo de la conversación, el acceso a la base y el envío de mensajes. Además, con varios negocios tiene una limitación que ya se дра documentó: hoy trabaja siempre con el negocio por defecto y no puede reservar en otro.

Esta spec cierra las dos cosas: la migración a la arquitectura hexagonal y el negocio correcto.

## Alcance

**Dentro:**

- Migración del bot a `src/whatsapp/{domain,application,infrastructure}` con `Result`: reglas de conversación, casos de uso por paso (elegir servicio, profesional, día y hora) y adaptadores.
- **Negocio por número de teléfono**: cada negocio puede vincular su número de WhatsApp; el bot identifica el negocio por el número del que escribe. Sin número vinculado, el bot usa el negocio por defecto (comportamiento actual).
- La reserva que crea el bot pasa por los casos de uso de `bookings` (spec 14), con su local, sus horarios y sus servicios.
- El bot pasa a conocer los locales: hoy solo entiende un negocio, así que pregunta local cuando hay más de uno.
- Cancelación por el bot: el cliente puede cancelar con el mismo enlace que el email.
- Avisos al admin (spec 14) y recordatorios (spec 24) usan el mismo cliente de WhatsApp: un solo adaptador de envío.
- Colecciones `conversation_states` y `processed_messages` con `tenantId` (la spec 18 lo aplica a las colecciones del negocio; estas dos se incluyen).
- `docs/whatsapp.md`: cómo configurar un número, qué mensajes entiende el bot y sus límites.

**Fuera de alcance (otras specs):**

- Enviar mensajes proactivos por WhatsApp fuera de los recordatorios (spec 24) y los avisos al admin.
- Bot en varios idiomas.
- Bot con inteligencia artificial para conversar sin flujo fijo.
- Whatsapp Business API oficial (el bot usa el cliente que ya existe).
- Pagos por WhatsApp.

## Modelo de datos

```ts
interface WhatsappTenantLink {
  _id: ObjectId;
  tenantId: ObjectId;       // el negocio
  phoneNumber: string;      // E.164, único entre todos los negocios
  active: boolean;
  createdAt: Date;
}
// Índices: { phoneNumber } único.

interface ConversationStateRecord {
  _id: ObjectId;
  tenantId: ObjectId;       // nuevo (spec 18)
  phoneNumber: string;
  step: string;
  data: object;             // lo que el cliente ya eligió
  updatedAt: Date;
}
// Índices: { tenantId, phoneNumber } único; TTL por antiguedad (spec 22).

interface ProcessedMessageRecord {
  _id: ObjectId;
  tenantId: ObjectId;       // nuevo
  messageId: string;
  receivedAt: Date;
}
// Índices: { messageId } único; TTL por antigüedad (spec 22).
```

**Reglas que se conservan:** el bot atiende un mensaje por vez y no procesa dos veces el mismo mensaje; una conversación en curso se identifica por el número; el bot no pide ni guarda datos que no necesita; los mensajes del bot no incluyen datos de otros clientes.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Reglas del flujo de conversación (qué paso sigue, qué se puede elegir, cuándo se cancela) como funciones puras con `Result`; tests de cada rama del flujo actual.
2. **Puertos y casos de uso** con adaptadores en memoria: `ConversationStore`, `MessageSender` (WhatsApp), `BookingUseCases` (el caso de uso de crear reserva de la spec 14), `CatalogLookup`.
3. **Adaptadores.** `MongoConversationStore`, `WhatsappMessageSender` (el cliente que ya existe), `BookingCatalogLookup`; suite de contrato del store.
4. **Negocio por número.** `WhatsappTenantLink` y su caso de uso; el webhook resuelve el negocio por número y, si no hay vínculo, usa el principal; el estado de la conversación se guarda por negocio y número.
5. **El bot con locales.** Si el negocio tiene más de un local, el bot pregunta cuál; la reserva se crea en ese local.
6. **`tenantId` en las colecciones del bot** (si la spec 18 no las cubrió) y limpieza TTL (spec 22).
7. **Cierre.** E2E del bot: escribir desde un número vinculado a un negocio con dos locales, elegir servicio, local, día y hora, y ver la reserva creada en ese negocio; y desde un número sin vincular (negocio principal). Verificación completa.

## Criterios de aceptación

- [ ] El bot mantiene el flujo actual (elegir servicio, profesional, día y hora) con los mismos mensajes.
- [ ] Un mensaje de un número vinculado a un negocio crea la reserva en ese negocio, con sus servicios, horarios y local.
- [ ] Un número sin vincular sigue reservando en el negocio por defecto.
- [ ] Con más de un local, el bot pregunta el local y la reserva queda en el elegido.
- [ ] El bot no vuelve a procesar el mismo mensaje (idempotencia).
- [ ] Las conversaciones de un negocio no se mezclan con las de otro.
- [ ] La reserva creada por el bot aparece en el panel del negocio correcto y dispara los mismos avisos y recordatorios.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** el negocio se identifica por el número de teléfono, con un vínculo configurable: es la forma natural de saber a qué negocio pertenece una conversación.
- **Sí:** sin vínculo, el negocio por defecto: nadie pierde el bot actual al migrar.
- **Sí:** el bot crea la reserva con los casos de uso de `bookings`: no duplica las reglas de disponibilidad ni de local.
- **Sí:** las colecciones del bot llevan `tenantId`: sin eso, un número podría ver la conversación de otro.
- **No:** IA conversacional, proactividad extra, varios idiomas ni pagos por WhatsApp.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un número se vincula a dos negocios | Índice único por número y una sola clave activa. |
| Las conversaciones old de un negocio se mezclan | `tenantId` en el estado y la clave es `{tenantId, phoneNumber}`. |
| El bot se rompe con el flujo nuevo | Los tests del dominio cubren cada rama del flujo actual, y el e2e recorre el camino completo. |
| El bot queda sin respuestas si el negocio tiene otro catálogo | La resolución del negocio es por número y el flujo usa los casos de uso del negocio correcto. |

## Lo que **no** está en esta spec

- Conversación con IA, proactividad, otros idiomas, pagos por WhatsApp y Whatsapp Business API oficial.
