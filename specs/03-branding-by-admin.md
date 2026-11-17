# SPEC 03 — Marca del negocio editable desde el admin (colores, logo y nombre)

> **Status:** Aprobado
> **Depends on:** SPEC 01 (`01-dashboard-config-admin`), SPEC 02 (`02-booking-cancellation`)
> **Date:** 2026-11-16
> **Objective:** Permitir que el admin elija 3 o 4 colores de la web, cargue el logo del negocio y su nombre desde Configuración, y que toda la app los use.

---

## Por qué existe esta spec

Hoy la marca está fija en el código: colores dorado y negro en `src/index.css`, el texto "BookingApp" sin logo y el título "Tu tiempo, nuestra prioridad" en el inicio. Cada instalación es un negocio distinto, así que el admin necesita adaptar la web a su marca sin tocar código.

Los estilos son compartidos entre la web pública y el admin. Por eso un único juego de variables CSS alcanza para cambiar toda la app.

## Precondiciones

- `feat/styles-desktop-refactoring` está commiteada y mergeada en `master` del front (modales, íconos, favicon).
- `master` de ambos repos está actualizado con `origin/master`.
- La rama `feat/change-colors-by-admin` sale de `master` en `BookingApp_Front` y en `BookingApp_Back`.
- `ADMIN_API_KEY` está definida en el entorno del backend (SPEC 01).

## Alcance

**Dentro:**

- Rama `feat/change-colors-by-admin` en ambos repos.
- Backend: colección `branding` con un único documento (nombre, colores y logo).
- Backend: endpoints públicos para leer la marca y el logo, y endpoints admin (con `ADMIN_API_KEY`) para guardar colores y nombre, subir el logo y borrarlo.
- Backend: validación de formato de color, contraste mínimo, largo del nombre, y tipo y tamaño del logo.
- Front: nueva pestaña **"Marca"** en Configuración del admin, al lado de "Profesionales", "Servicios" y "Horarios".
- Front: 3 colores obligatorios (**Acento**, **Fondo**, **Texto**) y 1 opcional (**Acento secundario**). El resto de los tonos se derivan solos.
- Front: vista previa en vivo en el panel, botón "Descartar" y botón "Restaurar colores originales".
- Front: los colores guardados se aplican a la web pública, al admin, al login y a la página de cancelación `/cancelar/:token`.
- Front: el logo aparece a la izquierda de "BookingApp" en la barra superior, el pie de página, la barra lateral del admin y el login.
- Front: el nombre del negocio reemplaza el título del inicio "Tu tiempo, nuestra prioridad". Sin nombre cargado se sigue viendo ese texto.
- Front: los colores guardados se recuerdan en el navegador, para que al recargar no se vea el dorado un instante antes de los colores propios.
- Front: el CSS deja de tener el dorado y los fondos escritos a mano en los tonos derivados, y los calcula desde las 4 variables base.

**Fuera de alcance (otras specs):**

- Varios negocios en la misma instalación (multi-tenant).
- Colores y logo en los emails del backend.
- Cambiar el favicon por el logo cargado.
- Cambiar la tipografía, los textos de las secciones o el texto del pie "Tu tiempo, nuestra prioridad.".
- Colores de los gráficos del admin (`BookingsChart.jsx`, `ServicesChart.jsx`), de los estados (éxito, error, aviso, info) y de la validación del formulario (`ClientFormStep.jsx`).
- Paletas predefinidas.
- Guardar el logo en un servicio externo (Cloudinary, S3).
- Historial de cambios de marca.

## Modelo de datos

**Backend: nueva colección `branding` (`src/branding/schemas/branding.schema.ts`).**

```ts
export const BRANDING_KEY = 'branding';

@Schema({ collection: 'branding', versionKey: false })
export class BrandingRecord {
  @Prop({ type: String, required: true, default: BRANDING_KEY })
  key: string; // índice único: siempre un solo documento

  @Prop({ type: String, default: null })
  businessName: string | null; // recortado, 1 a 60 caracteres, o null

  @Prop({ type: Object, required: true })
  colors: BrandColors;

  @Prop({ type: Object, default: null })
  logo: { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: Buffer; updatedAt: Date } | null;
}

type BrandColors = {
  accent: string;                  // '#rrggbb', obligatorio
  background: string;              // '#rrggbb', obligatorio
  text: string;                    // '#rrggbb', obligatorio
  accentSecondary: string | null;  // '#rrggbb' u null
};
```

**Valores por defecto** (sin documento guardado, o al restaurar): son los colores actuales de la web.

```ts
const DEFAULT_COLORS: BrandColors = {
  accent: '#c9a96e',
  background: '#0d0d0d',
  text: '#f5f0e8',
  accentSecondary: null,
};
```

**Respuesta pública `GET /api/branding`** (no incluye el logo en sí, solo su URL):

```json
{
  "businessName": "Barbería Don Pepe",
  "colors": { "accent": "#c9a96e", "background": "#0d0d0d", "text": "#f5f0e8", "accentSecondary": null },
  "logoUrl": "/api/branding/logo?v=1763300000000"
}
```

`logoUrl` es `null` sin logo. `v` es `logo.updatedAt` en milisegundos, para que el navegador no muestre un logo viejo de su caché.

**Endpoints:**

| Método y ruta | Acceso | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `GET /api/branding` | público | — | marca, como arriba |
| `GET /api/branding/logo` | público | — | bytes del logo con su `Content-Type`, o 404 |
| `PUT /api/admin/branding` | `ADMIN_API_KEY` | `{ businessName, colors }` | marca guardada |
| `PUT /api/admin/branding/logo` | `ADMIN_API_KEY` | `{ dataUrl: 'data:image/png;base64,...' }` | marca guardada |
| `DELETE /api/admin/branding/logo` | `ADMIN_API_KEY` | — | marca guardada |

**Reglas de validación (backend, fuente de verdad; el front repite las de color y nombre para avisar antes):**

- Color: `^#[0-9a-fA-F]{6}$`. Se guarda en minúsculas.
- Contraste (fórmula de luminancia relativa de WCAG 2.1):
  - Texto contra Fondo: mínimo **4.5:1**.
  - Acento contra Fondo: mínimo **3:1**.
  - Acento secundario contra Fondo: mínimo **3:1**, si está cargado.
- Nombre: se recorta. Vacío se guarda como `null`. Máximo **60** caracteres.
- Logo: PNG, JPEG o WebP, comprobado por los primeros bytes del archivo y no solo por la extensión. Máximo **200 KB** ya decodificado. SVG no se acepta.
- Errores: `400` con mensaje en español. Ejemplos:
  - `"El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1)."`
  - `"El acento no contrasta lo suficiente con el fondo (mínimo 3:1)."`
  - `"El logo debe ser PNG, JPG o WebP de hasta 200 KB."`
  - `"El nombre del negocio puede tener hasta 60 caracteres."`

**Front: variables CSS base** (en `src/index.css`, sobrescritas en tiempo de ejecución en `document.documentElement`):

```css
--brand-accent: #c9a96e;
--brand-accent-secondary: initial; /* sin valor: se deriva del acento */
--brand-bg: #0d0d0d;
--brand-text: #f5f0e8;
```

**Tonos derivados con `color-mix()`** (reemplazan los valores escritos a mano):

| Variable actual | Se calcula como |
| --- | --- |
| `--color-bg-primary` | `--brand-bg` |
| `--color-bg-secondary` / `--color-bg-tertiary` | fondo mezclado con 4% / 8% de texto |
| `--surface-1` / `--surface-2` | fondo mezclado con 12% / 15% de texto |
| `--color-accent` | `--brand-accent` |
| `--color-accent-light` | `--brand-accent-secondary`, o el acento aclarado un 20% |
| `--color-accent-dark` | acento oscurecido un 20% |
| `--color-accent-muted`, `--color-border`, `--border-line-*`, `--shadow-accent` | acento con transparencia (15%, 20%, 20–50%, 25%) |
| `--primary-50` … `--primary-950` | escala del acento mezclado con blanco o negro |
| `--color-text-primary` | `--brand-text` |
| `--color-text-secondary` / `--color-text-muted` | texto mezclado con 35% / 65% de fondo |
| `--color-text-inverse` | `--brand-bg` |
| `--color-border-subtle` | texto con 6% de opacidad |
| fondo y puntos del inicio (`Hero.jsx`) | fondo y acento con transparencia |

**Front: caché local** en `localStorage`, clave `branding:v1`:

```js
{ colors: { accent, background, text, accentSecondary }, businessName }
```

Un script chico en `index.html` lo lee antes de cargar React y aplica las 4 variables. Si no hay nada guardado o el valor no es válido, no hace nada y quedan los colores por defecto.

## Plan de implementación

**Backend (`BookingApp_Back`):**

1. Crear la rama `feat/change-colors-by-admin` desde `master`.
2. `src/branding/branding-validation.ts`: validación de color, contraste WCAG, nombre y logo (tipo por primeros bytes y tamaño). Tests unitarios de cada regla y de cada mensaje de error.
3. `src/branding/schemas/branding.schema.ts` y `src/branding/branding.service.ts`: leer la marca (con valores por defecto si no hay documento), guardar colores y nombre, guardar y borrar el logo. Tests.
4. `src/branding/branding.controller.ts`: `GET /branding` y `GET /branding/logo` (404 sin logo, `Content-Type` del logo, `Cache-Control` público). Registrar `BrandingModule` en `src/app.module.ts`. Tests HTTP.
5. `src/branding/branding-admin.controller.ts`: `PUT /admin/branding`, `PUT /admin/branding/logo` y `DELETE /admin/branding/logo` con `AdminKeyGuard`. Tests HTTP de 401 sin clave, 400 por regla y 200 válido.
6. `src/main.ts`: subir el límite del cuerpo JSON a `1mb`, porque el logo en base64 pesa hasta unos 270 KB y el límite por defecto es 100 KB. Test de que un logo de 200 KB entra y uno de 201 KB devuelve 400.

**Front (`BookingApp_Front`):**

7. Crear la rama `feat/change-colors-by-admin` desde `master`.
8. `src/index.css`: agregar las 4 variables `--brand-*` y pasar todos los tonos derivados de la tabla a `color-mix()`. `Hero.jsx` usa las variables en su fondo y sus puntos. Con los valores por defecto la web se ve igual que antes: se comparan capturas de inicio, modal de reserva y admin. Actualizar `src/styles/tokens.test.js`.
9. `src/theme/brandTheme.js`: aplicar los colores a `document.documentElement`, calcular contraste (misma fórmula que el backend), y leer y escribir la caché `branding:v1`. Tests.
10. `index.html`: script que aplica la caché antes de cargar React. Test de que con caché inválida no rompe.
11. `src/services/brandingService.js` (`getBranding`) y, en `src/services/adminService.js`, `saveBranding`, `uploadLogo` y `deleteLogo`. Tests de método, ruta y clave.
12. `src/state/brandingState.jsx`: `BrandingProvider` y `useBranding`. Carga la marca al iniciar, aplica los colores, actualiza la caché y expone `refresh`. Si el backend falla se quedan la caché o los valores por defecto. Montarlo en la raíz de la app, para que cubra la web pública, el admin, el login y `/cancelar/:token`. Tests.
13. `src/components/ui/BrandMark.jsx`: logo (si hay) más "BookingApp". Usarlo en `Navbar.jsx`, `Footer.jsx`, `Sidebar.jsx` y `Login.jsx`. El texto alternativo del logo es el nombre del negocio, o "Logo" sin nombre. Tests.
14. `Hero.jsx`: muestra `businessName` en el título. Sin nombre, sigue el texto actual "Tu tiempo, nuestra prioridad". Tests de ambos casos.
15. `src/components/admin/config/BrandingTab.jsx` y nueva pestaña "Marca" en `ConfigSection.jsx`. Contenido:
    - Selector de color y campo hexadecimal para Acento, Fondo y Texto, más Acento secundario con casilla "Usar acento secundario".
    - Campo "Nombre del negocio" (máximo 60) y carga de logo con vista previa y botón "Quitar logo".
    - Vista previa en vivo en el panel mientras se edita.
    - Botones "Guardar", "Descartar" (vuelve a lo guardado) y "Restaurar colores originales" (carga los valores por defecto en el formulario; se guardan recién con "Guardar").
    - Error de contraste o de logo debajo del campo, con "Guardar" deshabilitado mientras haya errores.
    - Si el admin sale de la pestaña sin guardar, los colores vuelven a los guardados.
16. Prueba de punta a punta con Playwright contra backend local y base descartable: cambiar colores, nombre y logo, guardar, recargar el inicio y verificar el resultado.

## Criterios de aceptación

- [ ] Sin marca guardada, el inicio, el modal de reserva, el login y el admin se ven igual que en `master` (capturas a 1440px y 390px).
- [ ] `GET /api/branding` responde sin clave y devuelve `businessName`, `colors` y `logoUrl`.
- [ ] `PUT /api/admin/branding`, `PUT /api/admin/branding/logo` y `DELETE /api/admin/branding/logo` sin `ADMIN_API_KEY` devuelven 401.
- [ ] Guardar sin Acento, Fondo o Texto devuelve 400. Guardar con o sin Acento secundario devuelve 200.
- [ ] Un color que no cumple `#rrggbb` devuelve 400.
- [ ] Texto `#777777` sobre Fondo `#888888` devuelve 400 con `"El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1)."`, y el panel muestra el mismo error sin llamar al backend.
- [ ] Un nombre de 61 caracteres devuelve 400. Un nombre vacío o solo con espacios se guarda como `null`.
- [ ] Un logo PNG, JPG o WebP de 200 KB o menos se guarda. Uno de más de 200 KB, un SVG, o un archivo `.png` que no es PNG devuelve 400.
- [ ] Al cambiar un color en la pestaña "Marca", el panel cambia de color antes de guardar.
- [ ] "Descartar" vuelve a los colores guardados. "Restaurar colores originales" carga dorado `#c9a96e`, fondo `#0d0d0d` y texto `#f5f0e8` en el formulario.
- [ ] Después de guardar, recargar el inicio muestra los colores nuevos sin ver el dorado ni un instante.
- [ ] El logo aparece a la izquierda de "BookingApp" en la barra superior, el pie, la barra lateral del admin y el login. Sin logo, solo se ve "BookingApp".
- [ ] Con nombre cargado, el título del inicio muestra el nombre. Sin nombre, muestra "Tu tiempo, nuestra prioridad".
- [ ] La página `/cancelar/:token` usa los colores guardados.
- [ ] Con el backend caído, la web carga con los últimos colores guardados en el navegador, o con los por defecto si no hay.
- [ ] Pasan los tests del backend (`npm test`) y del front (`npm test`), y la prueba de Playwright del paso 16.

## Decisiones

- **Sí:** 3 colores obligatorios (Acento, Fondo, Texto) más 1 opcional (Acento secundario), y el resto derivado. Cumple "mínimo 3, máximo 4" y mantiene la web coherente.
- **No:** paletas predefinidas. Dan menos libertad que la pedida.
- **No:** 3 o 4 colores sin rol. No se sabría cuál es fondo y cuál acento.
- **Sí:** tonos derivados con `color-mix()` en CSS. JavaScript solo escribe 4 variables, y las de Preline (`--primary-*`, `--border-line-*`, `--surface-*`) siguen solas.
- **Sí:** el nombre reemplaza el título del inicio, y sin nombre queda el texto actual. El nombre es opcional.
- **Sí:** el título con nombre se muestra en un solo color. El resaltado en acento de la última palabra ("prioridad") solo aplica al texto por defecto.
- **Sí:** el logo se guarda en MongoDB, hasta 200 KB, en PNG, JPG o WebP. No suma servicios ni claves externas.
- **No:** SVG. Puede llevar código incrustado y no hace falta para un logo chico.
- **Sí:** el logo se sirve en `GET /api/branding/logo`, aparte de `GET /api/branding`. Así la marca pesa poco y el navegador guarda el logo en caché.
- **Sí:** contraste mínimo WCAG AA, validado en el backend y repetido en el front. Bloquea el guardado.
- **Sí:** un negocio por instalación, con un único documento `branding`, igual que el horario de SPEC 01.
- **No:** reutilizar la colección `business_settings`. Tiene otro esquema (el horario semanal); una colección propia evita mezclar formatos.
- **Sí:** caché `branding:v1` en el navegador y script en `index.html`, para que no se vea el dorado un instante al cargar.
- **No:** emails, favicon, gráficos ni colores de estado. Quedan para otras specs.
- **Sí:** la rama sale de `master` después de mergear `feat/styles-desktop-refactoring`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Queda algún color escrito a mano y no cambia con la marca | El paso 8 busca `#c9a96e`, `rgba(201, 169, 110` y los fondos `#0d0d0d`, `#141414`, `#1c1c1c` en `src/`. Solo quedan los excluidos en Alcance. |
| Un fondo claro deja ilegibles sombras y overlays pensados para fondo oscuro | Las sombras quedan negras (siguen funcionando). Probar a mano con fondo claro (`#ffffff`, texto `#1a1a1a`) y anotar lo que haga falta en otra spec. |
| Navegador sin `color-mix()` | Lo soportan Chrome 111+, Safari 16.2+ y Firefox 113+. En navegadores más viejos quedan los colores por defecto. |
| Un logo grande hace lento el `PUT` | Límite de 200 KB y límite del cuerpo JSON en `1mb`. |
| La caché local tiene colores viejos si otro admin cambió la marca | `BrandingProvider` siempre pide la marca al backend y la actualiza. La caché solo cubre el primer instante. |
| Un dueño quiere un texto distinto al nombre en el título | Fuera de alcance. Puede ir en otra spec con un campo "lema". |

## Lo que **no** está en esta spec

- Varios negocios en la misma instalación.
- Marca en los emails.
- Logo como favicon.
- Tipografías, textos de secciones o el texto del pie.
- Colores de gráficos, estados y validación de formularios.
- Paletas predefinidas, almacenamiento externo del logo, historial de cambios.

Cada uno, si llega, va en su propia spec.

---

## Revisión posterior: paleta negra y color de botones (2026-11-16)

Esta sección reemplaza lo que el resto de la spec dice sobre el dorado y sobre el acento secundario.

- **Colores por defecto** (livery Haas): fondo `#111111`, texto `#ffffff`, acento azul `#5b8dd9`, botones `#f62039`.
- **El azul `#295294` original no sirve como acento sobre negro.** Su contraste es 2.45:1 y la regla exige 3:1. Se usa `#5b8dd9` (5.6:1) y `#295294` queda libre para rellenos.
- **Los 4 colores editables son Fondo, Texto, Acento y Botones.** Botones es opcional y reemplaza al "acento secundario". Sin color de botones, los botones usan el acento.
- **El campo `accentSecondary` pasa a llamarse `button`** en la API, la base y el front. Un documento guardado antes del cambio se lee con `button: null`, así sus botones siguen usando el acento como antes.
- **Contraste de Botones contra el fondo:** mínimo 3:1, con el mismo mensaje de error: `"El color de los botones no contrasta lo suficiente con el fondo (mínimo 3:1)."`.
- **Variables CSS:** `--brand-button` reemplaza a `--brand-accent-secondary`. Los botones usan `--button`, `--button-hover` y `--button-active`.
- **Grises neutros:** el texto secundario y el atenuado son mezclas del texto con el fondo, sin tinte del acento.
- **Caché del navegador:** la clave pasa a `branding:v2`, para no aplicar colores guardados con el formato anterior.

### Segunda revisión: acento fucsia y botones azules (2026-11-16)

Esta sección reemplaza los valores de acento y botones de la revisión anterior.

- **Acento:** `#f62039` (fucsia). Se usa en enlaces, bordes, selección, precios y textos destacados.
- **Botones:** `#295294` (azul). El hover se calcula en `90% azul + 10% blanco` (`--button-hover`).
- **Texto de los botones: se elige automáticamente**, blanco o negro según lo que se lea mejor sobre el botón. Sobre `#295294` el blanco da 7.7:1; el negro daría 2.45:1 y no se leería. La regla garantiza 4.5:1 con el botón para cualquier color. Se calcula en `buttonTextColor` de `src/theme/brandTheme.js` y también en el script de `index.html`.
- **Contraste de Botones contra el fondo: mínimo 2:1** (antes 3:1). Un botón es una superficie con su propia etiqueta, así que su legibilidad se garantiza con el color del texto, no con el contraste contra la página. `#295294` sobre el fondo negro da 2.45:1 y se acepta. Mensaje: `"El color de los botones no contrasta lo suficiente con el fondo (mínimo 2:1)."`.
- **Variable nueva:** `--brand-button-text`, que alimenta `--button-text` y el texto de los botones. El "check" del servicio elegido usa texto oscuro sobre el acento fucsia.
