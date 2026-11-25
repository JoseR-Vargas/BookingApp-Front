# SPEC 25 — Panel del dueño y web del SaaS

> **Status:** Aprobado (el usuario pidió seguir sin pausas)
> **Depends on:** SPEC 24
> **Date:** 2026-11-25
> **Objective:** Que el dueño del sistema vea sus negocios, su estado de pago y su uso, y que tenga una web pública donde un negocio se registre y pague.

---

## Por qué existe esta spec

Hasta ahora el dueño del sistema solo tiene la base de datos y la consola. Con varios negocios necesita una respuesta a preguntas como: ¿quién está pagando?, ¿cuál negocio está llenando el espacio?, ¿alguien superó el límite?, ¿cuántas reservas hubo hoy?

Y del lado del cliente: hace falta una página donde un negocio se registre y pague sin hablar con nadie. La spec 21 da el alta en la app; esta da la puerta de entrada pública.

## Alcance

**Dentro:**

**Backend:**

- **API del dueño** (`/api/platform/*`), protegida con una clave de plataforma (distinta de la de admin de negocio), con:
  - Lista de negocios: nombre, slug, plan, estado de la prueba, estado de la suscripción, tamaño de datos, reservas del mes, último uso.
  - Detalle de un negocio: lo anterior más el conteo por profesional, servicio y local.
  - Acciones: suspender o reactivar un negocio, extender la prueba, cambiar el plan (sin pasar por la pasarela, para casos manuales), y Reset de la clave de un negocio.
  - Métricas agregadas: negocios totales, activos, en prueba, activos y suspendidos; reservas del día y del mes; ingresos estimados por plan (suma de suscripciones activas, no cobro real).
- **Página web del SaaS** (en el front, en `/` de un sitio aparte o en una ruta propia configurable): planes, precios, alta (que usa `POST /api/signup` de la spec 21), contacto y aviso de estado.
- El panel del dueño es una sección del panel existente con una clave de plataforma, no una aplicación aparte.

**Front:**

- Sección "Negocios" en el panel, visible solo con la clave de plataforma: tabla con los negocios y sus señales, detalle de cada uno y las acciones.
- Página pública del SaaS con los planes (los mismos de la spec 23) y el formulario de alta.

**Fuera de alcance (otras specs):**

- Cobrar desde el panel del dueño (la pasarela lo hace).
- Exportar datos de un negocio (se puede pedir; es una spec aparte).
- Métricas de negocio dentro del panel de cada cliente: ya existen (spec 01); aquí es la vista agregada.
- Migrar negocios entre planes con prorrateo.
- Facturación y conciliación con la pasarela.
- Multi-idioma de la web del SaaS.

## Modelo de datos

No hay datos persistidos nuevos: la vista del dueño se calcula sobre los negocios y las reservas.

**Reglas que se conservan:** la clave de plataforma no da acceso a los datos de cliente de un negocio (solo agregados y señales de negocio); suspender un negocio hace que sus rutas devuelvan `403` y no borra nada; extender la prueba suma días al `trialEndsAt`; cambiar el plan a mano deja constancia en el log del sistema.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Dominio.** Reglas del panel del dueño: qué se puede ver, qué acciones son válidas (no suspender el único negocio del sistema, no extender una prueba vencida sin reactivarla) y qué mensaje corresponde. Funciones puras con `Result`.
2. **Puertos y casos de uso** de la vista agregada: listar negocios, detalle, métricas del período, suspender/reactivar, extender prueba, cambiar plan, resetear clave.
3. **Endpoints de plataforma** con su propia clave (`PLATFORM_API_KEY`), fuera del guard de admin de negocio; agregados calculados con consultas agregadas (cuidado con el límite de 100 operaciones por segundo de Atlas: las métricas se cachean 60 s, como la disponibilidad).
4. **Front: sección "Negocios"** en el panel, visible solo con la clave de plataforma, con la tabla, el detalle y las acciones.
5. **Front: web del SaaS** con planes, precios y alta (reutilizando el formulario de la spec 21).
6. **Cierre.** E2E del recorrido del dueño (ver negocios, suspender, reactivar) y del alta desde la web del SaaS; verificación completa.

## Criterios de aceptación

- [ ] Con la clave de plataforma, el dueño ve la lista de negocios con plan, estado de pago, tamaño de datos y reservas del mes.
- [ ] El detalle de un negocio muestra el desglose por profesional, servicio y local.
- [ ] Las métricas agregadas del período son correctas y están cacheadas (no golpean la base en cada visita).
- [ ] Suspender un negocio hace que sus rutas respondan `403` y que no borre nada; reactivarlo lo devuelve.
- [ ] Extender la prueba suma días y queda registrado; cambiar el plan a mano deja constancia en el log del sistema.
- [ ] La clave de plataforma no permite leer datos de cliente de un negocio (solo agregados y señales).
- [ ] La web del SaaS muestra los planes y el alta crea el negocio y su primer usuario `owner`.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** el panel del dueño es una sección del panel existente, protegida con una clave de plataforma aparte: menos aplicaciones que mantener.
- **Sí:** solo agregados y señales de negocio; la clave de plataforma no da acceso a los datos personales de los clientes.
- **Sí:** las métricas se cachean 60 s: el límite de operaciones por segundo de Atlas es el límite real.
- **Sí:** la web del SaaS es pública y usa el alta de la spec 21.
- **No:** cobrar desde el panel del dueño.
- **No:** exportar datos ni auditar cambios de un negocio en detalle.
- **No:** métricas de uso dentro del panel de cada cliente (ya están).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La clave de plataforma se filtra y da control de todos los negocios | Clave aparte, fuera de la app del cliente; se puede rotar sin tocar los negocios; la web no la expone. |
| El panel del dueño consume operaciones | Métricas cacheadas 60 s y consultas agregadas, no una por negocio. |
| Suspender un negocio a la ligera | Se pide confirmación y queda registro; reactivar es una acción de un clic. |

## Lo que **no** está en esta spec

- Cobro desde el panel del dueño, exportación de datos, auditoría detallada, prorrateo y conciliación con la pasarela (specs 23 a 26).
