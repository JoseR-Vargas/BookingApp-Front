# SPEC 23 — Planes y cobro

> **Status:** Aprobado (el usuario pidió seguir sin pausas)
> **Depends on:** SPEC 22
> **Date:** 2026-11-25
> **Objective:** Que cada negocio que contrató un plan tenga sus límites, que el cobro se pueda hacer con una pasarela de pago en Uruguay o Latinoamérica, y que el sistema degrade con claridad cuando un plan se vence.

---

## Por qué existe esta spec

Hasta ahora la prueba gratuita (spec 21) y la cuota de datos (spec 22) son parches. Con planes el sistema tiene una forma simple de cobrar: el plan define qué puede hacer el negocio, y el pago lo habilita.

La pasarela se decide con el dueño del sistema. Se deja el diseño agnóstico del proveedor: un puerto de pago, con un adaptador para la pasarela elegida y otro de prueba para el desarrollo local.

## Alcance

**Dentro:**

**Backend:**

- Planes definidos en la configuración del sistema (no en la base), por ejemplo: `gratis` (1 profesional, 1 local, 50 reservas al mes, sin página pública), `pro` (3 profesionales, 2 locales, 500 reservas al mes, página pública) y `negocio` (10 profesionales, 5 locales, 2 000 reservas al mes, página pública). Los valores exactos los ajusta el dueño del sistema.
- Suscripción por negocio: `{ planId, status: 'trialing'|'active'|'past_due'|'canceled', currentPeriodEnd, cancelAtPeriodEnd }`.
- **Límites del plan aplicados en el backend**: al exceeded, la operación que lo excede responde `403` con un mensaje que dice qué límite se alcanzó y qué plan lo resuelve. La disponibilidad y la lectura nunca se bloquean.
- **Puerto de pago** (`PaymentGateway`) con un adaptador para la pasarela elegida y un adaptador de prueba (simula el pago y la cancelación). La pasarela se elige con configuración; el código no depende de ella.
- Flujo de alta de suscripción: el `owner` pide un plan, el backend crea el pago en la pasarela y devuelve el enlace de pago; al confirmar la pasarela (webhook firmado), la suscripción queda activa.
- **Webhooks** de la pasarela: firma verificada, idempotente (el mismo evento dos veces no cambia nada), y con manejo de `past_due` y `canceled`.
- Cancelación al fin del período (no inmediata) y reanudación.
- Facturación mensual: la pasarela cobra; el backend solo guarda el estado y el período.

**Front:**

- Página de planes en el panel ("Compartir" o una pestaña "Plan"): comparación de planes, botón de contratar, estado actual, fecha de renovación y cancelación.
- Avisos cuando el plan vence o queda impago, y cuando se alcanza un límite.

**Fuera de alcance (otras specs):**

- Cobro por uso o por número de clientes.
- Facturación electrónica e impuestos: los emite la pasarela.
- Códigos de descuento y descuentos.
- Facturación anual.
- Cambio de pasarela en caliente: el puerto lo permite, pero la elección se hace al desplegar.
- Panel del dueño del sistema para managing los planes (spec 25).

## Modelo de datos

```ts
interface SubscriptionRecord {
  _id: ObjectId;
  tenantId: ObjectId;              // único por negocio
  planId: 'gratis' | 'pro' | 'negocio';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  externalPaymentId: string | null; // id de la pasarela
  createdAt: Date;
  updatedAt: Date;
}
// Índices: { tenantId } único; { status }.

// Eventos de la pasarela, para idempotencia
interface PaymentEventRecord {
  _id: ObjectId;
  externalEventId: string;          // id del evento en la pasarela: único
  type: string;
  processedAt: Date;
}
// Índice: { externalEventId } único.
```

**Límites por plan** (configurables por el dueño del sistema):

| | `gratis` | `pro` | `negocio` |
| --- | --- | --- | --- |
| Profesionales | 1 | 3 | 10 |
| Locales | 1 | 2 | 5 |
| Reservas por mes | 50 | 500 | 2 000 |
| Página pública | No | Sí | Sí |
| Recordatorios (spec 24) | No | Sí | Sí |

**Reglas que se conservan:** el plan `gratis` no corta el acceso a los datos ni al panel (el negocio puede exportar o borrar lo suyo); un negocio `past_due` conserva su sitio público y sus reservas, y solo deja de aceptar bookings nuevos cuando se cancela; el webhook firmado es obligatorio: un evento sin firma válida se rechaza y se registra.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Reglas de plan y de límites (qué límite se excedió y con qué mensaje), y la máquina de estados de la suscripción (`trialing` → `active` → `past_due` → `canceled`, y la cancelación al fin del período). Funciones puras con `Result`; tests de cada transición y de cada límite.
2. **Puerto de pago y adaptadores.** `PaymentGateway` con su contrato (crear pago, verificar firma, interpretar el evento); adaptador de prueba para el desarrollo y el e2e; el adaptador real se elige por configuración.
3. **Suscripciones.** Casos de uso (pedir plan, confirmar pago, cancelar, reanudar, renewing) y persistencia con los índices; el evento de la pasarela se guarda por su id externo (idempotencia).
4. **Aplicación de límites.** Comprobación de límites en la creación de profesionales, locales y reservas; `403` con el mensaje del límite alcanzado. La disponibilidad y la lectura nunca se bloquean.
5. **Endpoints y webhook.** `GET /api/admin/subscription`, `POST /api/admin/subscription/checkout` (devuelve el enlace de pago), `POST /api/admin/subscription/cancel`, `POST /api/admin/subscription/resume` y `POST /api/webhooks/payments` (público, con firma verificada).
6. **Front.** Página de planes con comparación, estado actual, renovación y cancelación; avisos de límites y de vencimiento en el panel.
7. **Cierre.** E2E con el adaptador de prueba: contratar, pagar (simulado), exceder un límite, vencer el pago y cancelar; verificación completa.

## Criterios de aceptación

- [ ] El `owner` ve los planes, contrata uno y recibe un enlace de pago; al confirmar el pago (simulado en las pruebas) la suscripción queda activa y los límites del plan se aplican.
- [ ] Al alcanzar el límite de profesionales, locales o reservas, la operación que lo excede responde `403` con un mensaje que dice qué límite se alcanzó y qué plan lo resuelve.
- [ ] La disponibilidad, la lectura del panel y las reservas existentes nunca se bloquean por un límite.
- [ ] El webhook sin firma válida se rechaza; el mismo evento dos veces no cambia nada.
- [ ] Un negocio `past_due` conserva su sitio y sus reservas y avisa; al cancelarse deja de aceptar reservas nuevas.
- [ ] Cancelar no corta el acceso de inmediato: termina al final del período, y el `owner` puede reanudar antes.
- [ ] El `gratis` no impide ver, exportar ni borrar los datos del negocio.
- [ ] El panel muestra el plan actual, la fecha de renovación y los avisos de límites.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** los planes viven en la configuración del sistema, no en la base: cambian sin migración y los fija el dueño del sistema.
- **Sí:** el cobro lo hace la pasarela; el backend solo guarda el estado. Así no hay datos de tarjeta en nuestro lado.
- **Sí:** un puerto de pago con dos adaptadores (real y de prueba): el e2e no necesita la red ni credenciales.
- **Sí:** los límites se comprueban en el backend, no en el front: son la autoridad.
- **Sí:** cancelar al final del período y no de inmediato: nadie pierde su agenda por un clic.
- **Sí:** un `past_due` conserva el sitio: el negocio todavía tiene gente reservando.
- **No:** impuestos, facturas propias, descuentos ni códigos (la pasarela los resuelve).
- **No:** cobro por uso.
- **No:** cambiar de pasarela en caliente.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un webhook falso cambia el plan | Firma verificada y rejection de lo que no la tenga; la Spec 23 lo exige. |
| Un evento duplicado corta o reactiva un plan | Idempotencia por id externo del evento. |
| El límite corta el negocio por un error de conteo | Los límites cuentan solo lo del negocio y la lectura nunca se bloquea; el aviso va antes del corte. |
| La pasarela no responde | El estado del plan es el que el backend tiene; el webhook puede llegar tarde y el negocio sigue activo hasta que se confirme lo contrario. |

## Lo que **no** está en esta spec

- Recordatorios (spec 24), panel del dueño y página comercial (spec 25), bot de WhatsApp (spec 26), impuestos, descuentos y facturación anual.
