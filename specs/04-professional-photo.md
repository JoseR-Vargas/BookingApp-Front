# SPEC 04 — Foto de perfil de los profesionales, cargada desde el admin

> **Status:** implementado
> **Depends on:** SPEC 01 (`01-dashboard-config-admin`), SPEC 03 (`03-branding-by-admin`)
> **Date:** 2026-11-17
> **Objective:** Permitir que el admin cargue o cambie la foto de perfil de cada profesional desde la pestaña "Profesionales" y mostrarla redonda en el modal de reserva y en el admin.

---

## Por qué existe esta spec

Hoy un profesional se identifica solo por su nombre. El campo `avatar` del modelo guarda un ícono de Font Awesome (`fas fa-user`) que ya no se muestra en ninguna pantalla, porque se quitaron los íconos decorativos. Una foto da confianza al cliente cuando elige con quién reservar.

La carga de imágenes ya existe: el logo del negocio (SPEC 03) acepta PNG, JPG o WebP de hasta 200 KB, comprobados por sus primeros bytes, y se guarda en MongoDB. La foto del profesional usa las mismas reglas y la misma validación.

## Precondiciones

- Los PR de SPEC 03 y de la paleta de colores están mergeados en `master` de **ambos** repos (PR #23 a #26 del front y #9 y #10 del back, ya mergeados).
- La rama `feat/profile-pic-professional` sale de `master` actualizado en `BookingApp_Front` y en `BookingApp_Back`.
- Los working trees están limpios, salvo la carpeta `.vscode/` del backend, que no es parte de esta feature.
- `ADMIN_API_KEY` está definida en el entorno del backend.

## Alcance

**Dentro:**

- Rama `feat/profile-pic-professional` en ambos repos.
- Backend: cada profesional puede tener una foto guardada en su documento de MongoDB.
- Backend: endpoint público para servir la foto, y endpoints del admin (con `ADMIN_API_KEY`) para subirla, cambiarla y quitarla.
- Backend: `POST /api/admin/professionals` acepta una foto opcional, para crear el profesional y su foto en una sola operación.
- Backend: las respuestas del catálogo público y del admin agregan `photoUrl` a cada profesional.
- Backend: la validación del logo (tipo por primeros bytes, 200 KB, sin SVG) pasa a un módulo común que usan el logo y la foto.
- Front: en el formulario de "Nuevo profesional" y "Editar profesional", un campo "Foto de perfil" con vista previa redonda, botón para elegir archivo y botón "Quitar foto".
- Front: la foto es **opcional**. El formulario la invita a cargar, pero se puede guardar sin ella.
- Front: antes de subirla, el navegador recorta un cuadrado del centro y lo reduce a **256 x 256 px** en JPEG.
- Front: componente `ProfessionalAvatar`: foto redonda (`rounded-full`, `object-cover`) o, sin foto, un círculo del color del acento con las iniciales del nombre.
- Front: la foto aparece en tres lugares: la tarjeta de profesional del modal de reserva, la lista de profesionales de Configuración y la columna de profesional de la tabla de Reservas del admin.

**Fuera de alcance (otras specs):**

- Foto en la confirmación de reserva, la página de cancelación, el filtro de profesionales, las tarjetas de servicio, el dashboard y los emails.
- Recortador manual con zoom y arrastre.
- Foto en servicios, o foto del cliente.
- Almacenamiento externo (Cloudinary, S3).
- Varias fotos por profesional o galería.
- Migrar o borrar el campo `avatar` (el ícono de Font Awesome). Queda sin usar, como hoy.
- Convertir HEIC u otros formatos. Solo PNG, JPG y WebP.

## Modelo de datos

**Backend: campo nuevo en `ProfessionalRecord` (`src/catalog/schemas/professional.schema.ts`).**

```ts
export interface ProfessionalPhoto {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: Buffer;
  updatedAt: Date;
}

// En ProfessionalRecord:
@Prop({ type: Object, default: null })
photo: ProfessionalPhoto | null;
```

Un profesional sin foto, o creado antes de esta spec, tiene `photo: null` o no tiene el campo. Los dos casos se leen como "sin foto".

**Respuestas del catálogo.** `GET /api/catalog` y `GET /api/admin/catalog` agregan `photoUrl` a cada profesional. Los bytes de la foto nunca viajan en esas respuestas.

```json
{
  "id": "alex-garcia",
  "name": "Alex García",
  "specialty": "Especialista",
  "photoUrl": "/api/catalog/professionals/alex-garcia/photo?v=1763400000000"
}
```

`photoUrl` es `null` sin foto. `v` es `photo.updatedAt` en milisegundos: una foto nueva tiene URL nueva y el navegador no muestra una vieja de su caché.

**Endpoints:**

| Método y ruta | Acceso | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `GET /api/catalog/professionals/:id/photo` | público | — | bytes de la foto con su `Content-Type`, o 404 |
| `POST /api/admin/professionals` | `ADMIN_API_KEY` | los campos de hoy + `photoDataUrl` (opcional) | el profesional creado, con `photoUrl` |
| `PUT /api/admin/professionals/:id/photo` | `ADMIN_API_KEY` | `{ dataUrl: 'data:image/jpeg;base64,...' }` | el profesional, con `photoUrl` |
| `DELETE /api/admin/professionals/:id/photo` | `ADMIN_API_KEY` | — | el profesional, con `photoUrl: null` |

`PATCH /api/admin/professionals/:id` sigue sin aceptar la foto: ignora `photo` y `photoDataUrl`, como ignora el resto de los campos no editables.

La foto se sirve también para un profesional inactivo, porque la tabla de Reservas del admin muestra reservas de profesionales desactivados.

**Reglas de validación (backend, fuente de verdad):**

- Tipo: PNG, JPEG o WebP, comprobado por los primeros bytes del archivo. El tipo declarado en el `data:` tiene que coincidir con esos bytes. SVG no se acepta.
- Tamaño: máximo **200 KB** ya decodificado.
- Errores: `400` con el mensaje `"La foto debe ser PNG, JPG o WebP de hasta 200 KB."`. Un profesional inexistente devuelve `404`.
- Las reglas son las mismas que las del logo. Solo cambia la palabra del mensaje.

**Front: recorte y reducción** (`src/utils/resizeImage.js`).

```js
// Devuelve un data URL 'data:image/jpeg;base64,...' de 256x256.
// Recorta el cuadrado central de la imagen, rellena de blanco lo transparente y comprime a calidad 0.85.
resizeToSquareJpeg(file, { size: 256, quality: 0.85 }) // => Promise<string>
```

- El archivo original acepta PNG, JPG o WebP de hasta **10 MB**: se reduce en el navegador, así que el límite de 200 KB se aplica al resultado.
- Si el navegador no puede leer la imagen (por ejemplo un HEIC), el panel muestra `"No pudimos leer la imagen. Usa un PNG, JPG o WebP."` y no sube nada.
- Un archivo de otro tipo o de más de 10 MB muestra `"La foto debe ser PNG, JPG o WebP de hasta 10 MB."` y no sube nada.

## Plan de implementación

**Backend (`BookingApp_Back`):**

1. Crear la rama `feat/profile-pic-professional` desde `master`.
2. `src/common/image-data-url.ts`: mover desde `src/branding/branding-validation.ts` la lectura del `data:` URL, la comprobación de tipo por primeros bytes y el límite de 200 KB, con el mensaje como parámetro. El logo pasa a usarlo con su mensaje actual. Los tests de branding siguen verdes sin cambios. Tests unitarios del módulo nuevo.
3. `src/catalog/schemas/professional.schema.ts`: campo `photo`. `src/catalog/catalog.service.ts`: `photoUrl` en `toPublicProfessional` y en `toAdminProfessional`. Las consultas de profesionales excluyen `photo.data` (`.select('-photo.data')`) y leen solo `photo.updatedAt`, para que el catálogo no cargue las imágenes. Tests: `photoUrl` con y sin foto, y que ninguna respuesta incluya bytes.
4. `src/catalog/catalog.controller.ts`: `GET /catalog/professionals/:id/photo` (404 sin foto o sin profesional, `Content-Type` de la foto, `Cache-Control: public, max-age=86400`). Tests HTTP.
5. `src/admin/admin.controller.ts` y `src/catalog/catalog-admin.service.ts`: `PUT` y `DELETE /admin/professionals/:id/photo`, y `photoDataUrl` opcional en `POST /admin/professionals`. Tests HTTP de 401 sin clave, 400 por regla, 404 por profesional inexistente y 200 válido. Test de que `PATCH` ignora la foto.

**Front (`BookingApp_Front`):**

6. Crear la rama `feat/profile-pic-professional` desde `master`.
7. `src/utils/resizeImage.js`: `resizeToSquareJpeg`. Tests con una imagen de prueba: sale de 256 x 256, es JPEG y pesa menos de 200 KB.
8. `src/utils/assetUrl.js` con `backendAssetUrl(path)` y `src/services/adminService.js` con `uploadProfessionalPhoto(id, dataUrl)` y `deleteProfessionalPhoto(id)`. `createProfessional` envía `photoDataUrl` cuando se le pasa. `brandLogoSrc` usa `backendAssetUrl`. Tests de método, ruta y clave.
9. `src/components/ui/ProfessionalAvatar.jsx`: foto redonda con `object-cover`, tamaños `sm`, `md` y `lg`, iniciales sobre círculo del color del acento sin foto, y mismo respaldo si la imagen falla al cargar. `alt` vacío (decorativa: el nombre ya está al lado). Tests: con foto, sin foto, iniciales de uno y de dos nombres, y falla de carga.
10. `src/components/admin/config/ProfessionalsTab.jsx`: campo "Foto de perfil" en el formulario (vista previa redonda, "Elegir foto", "Quitar foto", errores debajo del campo). Al crear, la foto va junto con el profesional. Al editar, "Elegir foto" y "Quitar foto" actúan al guardar. La lista muestra `ProfessionalAvatar` junto al nombre. Tests.
11. `src/components/booking/ProfessionalCard.jsx`: `ProfessionalAvatar` en la tarjeta, arriba del nombre en pantallas anchas y a la izquierda en la versión compacta. Tests.
12. `src/components/admin/BookingsTable.jsx` y `src/hooks/useAdminData.js`: el admin lee `GET /api/admin/catalog` y la columna de profesional muestra `ProfessionalAvatar` junto al nombre, buscando la foto por `professional.id` de la reserva. Si el profesional ya no existe, muestra las iniciales. Tests.
13. Prueba de punta a punta con Playwright contra backend local y base descartable (`e2e/specs/professional-photo/`).

## Criterios de aceptación

- [ ] `GET /api/catalog` y `GET /api/admin/catalog` devuelven `photoUrl` en cada profesional: una URL con `?v=` si tiene foto, `null` si no. Ninguna respuesta trae bytes de la foto.
- [ ] `GET /api/catalog/professionals/:id/photo` responde sin clave, con el `Content-Type` de la foto. Devuelve 404 si el profesional no tiene foto o no existe, y sirve la foto de un profesional inactivo.
- [ ] `PUT` y `DELETE /api/admin/professionals/:id/photo` sin `ADMIN_API_KEY` devuelven 401. Con un profesional inexistente devuelven 404.
- [ ] Una foto PNG, JPG o WebP de 200 KB o menos se guarda. Una de más de 200 KB, un SVG, o un archivo `.jpg` que no es una imagen devuelve 400 con `"La foto debe ser PNG, JPG o WebP de hasta 200 KB."`.
- [ ] `POST /api/admin/professionals` con `photoDataUrl` válido crea el profesional con foto. Con `photoDataUrl` inválido devuelve 400 y **no crea el profesional**.
- [ ] `PATCH /api/admin/professionals/:id` con `photoDataUrl` o `photo` no cambia la foto.
- [ ] `DELETE /api/admin/professionals/:id/photo` deja `photoUrl: null` y el profesional sigue activo.
- [ ] El logo del negocio sigue aceptando y rechazando los mismos archivos que antes (los tests de branding no cambian).
- [ ] En "Nuevo profesional" hay un campo "Foto de perfil" opcional. Se puede crear un profesional sin elegir foto.
- [ ] Al elegir una foto de 3 MB, el formulario la reduce a 256 x 256 JPEG de menos de 200 KB y muestra la vista previa redonda antes de guardar.
- [ ] Un archivo de más de 10 MB, un SVG o un HEIC muestra su mensaje y no llama al backend.
- [ ] Al editar un profesional se puede cambiar la foto y quitarla con "Quitar foto". Los cambios se aplican al guardar.
- [ ] La tarjeta de profesional del modal de reserva muestra la foto redonda; sin foto, el círculo con las iniciales (por ejemplo `AG`).
- [ ] La lista de profesionales de Configuración y la columna de profesional de la tabla de Reservas muestran la foto o las iniciales.
- [ ] Si la imagen falla al cargar, se ven las iniciales y no un ícono de imagen rota.
- [ ] Se ve bien a 1440px y a 390px: la foto es un círculo perfecto y la tarjeta no cambia de altura entre un profesional con foto y uno sin ella.
- [ ] Pasan los tests del backend (`npm test`) y del front (`npm test`), y la prueba de Playwright del paso 13.

## Decisiones

- **Sí:** guardar la foto en MongoDB, hasta 200 KB, como el logo. No suma servicios ni claves externas.
- **No:** Cloudinary o S3. Agregan cuenta y claves para una imagen de 20 KB.
- **Sí:** el navegador recorta y reduce a 256 x 256 antes de subir. La foto siempre queda cuadrada, pesa poco y se ve redonda sin que el admin edite nada.
- **No:** recortador manual. Mejor resultado, pero exige una librería nueva y mucho más trabajo para este alcance.
- **No:** recortar solo con CSS. Una foto horizontal quedaría cortada de forma fea.
- **Sí:** JPEG de salida con fondo blanco. Pesa menos que un PNG de una foto y no depende de que el navegador sepa codificar WebP.
- **Sí:** el archivo original puede pesar hasta 10 MB, porque se reduce antes de subir. El límite de 200 KB del backend se aplica a lo que se sube.
- **Sí:** foto opcional al crear. No bloquea crear un profesional si no se tiene la foto a mano.
- **Sí:** sin foto, un círculo con iniciales. No se usan íconos ni emojis.
- **Sí:** mismas reglas de validación que el logo, en un módulo común, para que no se desalineen.
- **Sí:** la foto se sirve en su propio endpoint y el catálogo solo trae `photoUrl`. El catálogo se pide en cada visita al sitio y no puede cargar las imágenes.
- **Sí:** se sirve la foto de profesionales inactivos. La tabla de Reservas del admin muestra reservas de profesionales desactivados.
- **Sí:** `POST` acepta la foto. Crear el profesional y subir la foto en dos pedidos dejaría un profesional sin foto si el segundo falla.
- **No:** reutilizar el campo `avatar`. Guarda un ícono de Font Awesome; mezclarlo con una foto confundiría el modelo. Queda sin usar.
- **No:** foto en la confirmación, la cancelación, el filtro ni los emails. Quedan para otras specs.
- **Sí:** la rama sale de `master` después de mergear los PR de SPEC 03 y de colores.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las consultas de profesionales cargan los bytes de las fotos y hacen lento el catálogo | Paso 3: las consultas excluyen `photo.data`. Test de que el catálogo no incluye bytes. |
| Una foto en HEIC (iPhone) no se puede leer en el navegador | Mensaje claro `"No pudimos leer la imagen. Usa un PNG, JPG o WebP."`. Convertir HEIC queda fuera de alcance. |
| El navegador muestra una foto vieja desde su caché | La URL lleva `?v=<updatedAt>`: una foto nueva tiene URL nueva. |
| Un archivo que dice ser una imagen no lo es | Validación por primeros bytes en el backend, y que el tipo declarado coincida. |
| El módulo común del paso 2 rompe la validación del logo | Los tests de branding existentes no cambian y deben seguir verdes. |
| Un profesional desactivado sigue con la foto pública | La foto es accesible por URL aunque esté inactivo. Es un dato que ya era público mientras estuvo activo. |

## Lo que **no** está en esta spec

- Foto en la confirmación, la cancelación, el filtro, las tarjetas de servicio, el dashboard y los emails.
- Recortador manual con zoom y arrastre.
- Almacenamiento externo de las fotos.
- Fotos de servicios o de clientes, y galerías.
- Migrar o borrar el campo `avatar`.
- Convertir HEIC.

Cada uno, si llega, va en su propia spec.
