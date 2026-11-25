# SPEC 22 — Límites de Atlas gratis: caché, respaldo y almacenamiento

> **Status:** Aprobado (el usuario pidió seguir sin pausas)
> **Depends on:** SPEC 21
> **Date:** 2026-11-25
> **Objective:** Que la app aguante en el plan gratuito de Atlas (0,5 GB, 100 operaciones por segundo, sin respaldos automáticos) sin caerse, sin llenar la base y sin perder datos.

---

## Por qué existe esta spec

Atlas gratuito tiene tres límites que hoy no controlamos:

1. **100 operaciones por segundo**, compartidas entre todos los negocios. La página pública `/disponibilidad` hace **una consulta de disponibilidad por día** (hasta 14 días) en cada visita, y cada consulta de disponibilidad cuenta los bloques ocupados de cada profesional. Un你不要 de visitas puede agotar el cupo y hacer lento todo lo demás.
2. **0,5 GB de datos e índices**, contando índices. Los bytes de las fotos de profesionales y logos pesan, y las colecciones del bot (conversaciones y mensajes procesados) crecen sin límite.
3. **Sin respaldos automáticos** (solo hay una vista previa privada). Si la base se daña, se pierden las reservas.

Además, el cluster se pausa a los 30 días sin conexiones.

Esta spec pone los límites bajo control: caché, cuotas, limpieza automática y un respaldo que se pueda hacer a mano con una instrucción clara.

## Alcance

**Dentro:**

**Backend:**

- **Caché de disponibilidad** con TTL corto (por defecto 60 segundos), por negocio, fecha, servicio y local. Se guarda en memoria del proceso (no en Mongo, para no gastar operaciones); con varias instancias, cada una tiene la suya (se acepta: 60 s de desfase es tolerable y se documenta).
- La caché se invalida al crear, editar, cancelar o borrar una reserva de ese negocio, y al cambiar el horario de un local.
- **Límite de pedidos por IP** en los endpoints públicos (`/api/availability`, `/api/public-availability`, `POST /api/bookings`): por ejemplo 120 pedidos por minuto. Respuesta `429` con un mensaje claro.
- **Cuota de almacenamiento por negocio**: se mide el tamaño de sus documentos (con la estimations del comando `collStats` o contando los documentos) y se avisa al `owner` cuando pasa el 70 % y el 90 % del tope que se le asigne. Al pasar el 100 %, el negocio queda bloqueado para crear reservas nuevas, como la prueba gratuita (spec 21) pero con otro mensaje.
- **Limpieza automática** de los datos del bot: `conversation_states` y `processed_messages` de más de N días (por defecto 90) se borran con un índice TTL. Los `bookings` no se borran nunca.
- **Script de respaldo** `npm run db:backup` que vuelca la base a `backups/<fecha>` con `mongodump`, y `npm run db:restore <carpeta>` que la restaura. Verifica que la carpeta destino no existe antes de escribir.
- **Documentación de operación** en `docs/atlas-limits.md`: límites, cómo medir el uso, cómo respaldar y restaurar, qué pasa si se pausa el cluster, y la checklist antes de migrar.

**Front:**

- Aviso en el panel del `owner` cuando el negocio está cerca del tope de su cuota de datos, o cuando el backend devuelve el bloqueo por cuota.
- Mensaje claro cuando la API responde `429` (demasiadas peticiones) en vez de un error genérico.

**Fuera de alcance (otras specs):**

- Cambiar de plan de Atlas (M10 u otro): esta spec deja el sistema dentro del gratuito.
- Caché distribuida (Redis) o en Mongo.
- Plan de respaldo continuo del proveedor (no está disponible en el gratuito).
- Reducir el tamaño de las fotos más allá de lo que ya hace `resizeImage` (el front ya recorta a un cuadrado y comprime; se documenta el límite actual).
- Cobro por uso (spec 23).

## Modelo de datos

```ts
// Nuevos campos en el negocio
interface TenantRecord {
  // ...lo de las specs 18 a 21
  storageQuotaBytes: number | null;   // tope asignado; null = sin tope (por defecto, 50 MB)
  storageUsedBytes: number;           // última medición
  storageMeasuredAt: Date | null;     // cuándo se midió
}
```

**Valores por defecto** (ajustables por el dueño del sistema):
- Caché de disponibilidad: 60 s.
- Límite por IP: 120 pedidos por minuto en los endpoints públicos.
- Cuota por negocio: 50 MB (las fotos y logos son lo que pesa).
- Avisos: 70 % y 90 % del tope.
- Retención del bot: 90 días.

**Limpieza por TTL:** `processed_messages` con `createdAt` + TTL de 90 días; `conversation_states` con `updatedAt` + TTL de 90 días. `bookings`, `locations`, `professionals`, `services`, `admin_users` y `admin_sessions` nunca se borran por TTL (las sesiones sí, por su propia caducidad).

**Reglas que se conservan:** la disponibilidad sigue siendo correcta (la caché se invalida al cambiar algo); el límite por IP no afecta a las rutas de admin ni a los clientes del bot; una respuesta `429` no rompe la reserva ya creada; el respaldo es una copia consistente y el script se niega a sobrescribir una carpeta existente.

## Plan de implementación

Cada paso deja el sistema funcionando y con `npm test` en verde.

1. **Caché de disponibilidad.** Puerto `AvailabilityCache` (interfaz en `application`, implementación en memoria en `infrastructure`), con TTL, clave por negocio/fecha/servicio/local, e invalidación. Casos en el contrato: hit, expiración, invalidación al reservar y al cambiar el horario. La caché no cambia la respuesta HTTP.
2. **Límite por IP.** Adaptador de rate limit en memoria, con limpieza de las entradas vencidas; aplicado a las tres rutas públicas. `429` con el mensaje `Demasiadas peticiones. Intenta más tarde.`
3. **Cuota de almacenamiento.** Medición (tamaño de documentos e índices por negocio), aviso en el panel y bloqueo al superar el tope. Un job diario o una medición al vuelo cuando el panel lo pide.
4. **TTL del bot.** Índices TTL en `processed_messages` y `conversation_states`, con test de integración (un documento vencido se borra).
5. **Scripts de respaldo y restauración.** `npm run db:backup` y `npm run db:restore`, con comprobaciones (carpeta destino inexistente, URI presente, aviso de qué base se va a tocar).
6. **Front.** Aviso de cuota en el panel y mensaje de `429`.
7. **Documentación y cierre.** `docs/atlas-limits.md` con la checklist de operación; e2e de la caché (dos pedidos seguidos y una reserva que invalida) y del `429`; verificación completa.

## Criterios de aceptación

- [ ] Dos pedidos seguidos de disponibilidad dentro del TTL no hacen una segunda consulta a la base (se comprueba en la suite de integración con un contador).
- [ ] Crear una reserva invalida la caché de ese negocio, así que el turno tomado desaparece de inmediato.
- [ ] Cambiar el horario de un local invalida la caché de sus fechas.
- [ ] Los endpoints públicos responden `429` con un mensaje claro al superar el límite por IP, y las rutas de admin no se ven afectadas.
- [ ] El panel avisa al `owner` al pasar el 70 % y el 90 % de su cuota, y al superarla el negocio no acepta reservas nuevas.
- [ ] Los documentos del bot de más de 90 días se borran solos; las reservas nunca.
- [ ] `npm run db:backup` crea una copia en `backups/<fecha>` y no sobrescribe una carpeta existente; `npm run db:restore` la restaura.
- [ ] La doc `docs/atlas-limits.md` explica los límites, cómo medirlos, cómo respaldar y qué hacer si el cluster se pausa.
- [ ] Pasan `npm test`, `npm run test:int`, `tsc`, `vitest`, `vite build` y el e2e completo.

## Decisiones

- **Sí:** la caché vive en memoria del proceso, no en Mongo: no gasta operaciones (que es justo lo que se quiere aliviar) y 60 segundos de desfase es aceptable.
- **Sí:** la cuota de almacenamiento se mide y se avisa; el bloqueo por cuota reutiliza el patrón de la prueba gratuita (spec 21) en vez de inventar otro.
- **Sí:** limpieza por TTL en las colecciones del bot, que son las que crecen solas; las reservas no se tocan nunca.
- **Sí:** el respaldo es un script manual con `mongodump`: el plan gratuito no tiene respaldos automáticos y no hay dónde meterlos.
- **No:** Redis ni caché en Mongo (dependencia nueva y gasto de operaciones).
- **No:** subir el plan de Atlas (decisión del dueño del sistema, documentada).
- **No:** borrar datos de clientes por cuota sin avisar antes.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La caché muestra un turno ya tomado | Se invalida al crear, editar y cancelar reservas, y al cambiar horarios; la base sigue siendo la autoridad al reservar. |
| El límite por IP bloquea a un cliente legítimo | Tope alto (120/min), solo en rutas públicas, y se aplica por IP con ventana deslizante. |
| Un TTL borra algo que hacía falta | Solo aplica a las dos colecciones del bot, con 90 días; el bot solo necesita la conversación reciente. |
| El respaldo queda a medias | Script con carpeta nueva por fecha y verificación de que la base origen es la esperada; la restauración se prueba en la base de pruebas. |
| La medición de almacenamiento consume operaciones | Medición poco frecuente (a demanda del panel o diaria) y con una sola consulta de estadísticas. |

## Lo que **no** está en esta spec

- Cambiar de plan de Atlas, caché distribuida, respaldos del proveedor y cobro por uso (specs 23 a 26).
