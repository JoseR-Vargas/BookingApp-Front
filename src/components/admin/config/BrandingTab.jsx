// "Marca" tab (SPEC 03): brand colors, business name and logo. Color edits are previewed live on
// the whole page (the brand CSS variables on <html>) and only persisted with "Guardar"; leaving
// the tab or "Descartar" puts the saved colors back. The logo is uploaded / removed right away.

import { useEffect, useRef, useState } from 'react';
import { deleteLogo, saveBranding, uploadLogo } from '../../../services/adminService.js';
import { brandLogoSrc } from '../../../services/brandingService.js';
import { useBranding } from '../../../state/brandingState.jsx';
import { DEFAULT_COLORS, applyBrandColors, isHexColor, validateBrandColors } from '../../../theme/brandTheme.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import Card from '../Card.jsx';
import { CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

export const MAX_NAME_LENGTH = 60;
const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_ERROR = 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.';
const NAME_ERROR = `El nombre del negocio puede tener hasta ${MAX_NAME_LENGTH} caracteres.`;

const COLOR_FIELDS = [
  { key: 'accent', label: 'Acento', hint: 'Enlaces, bordes y detalles destacados.' },
  { key: 'background', label: 'Fondo', hint: 'Fondo de la web y del panel.' },
  { key: 'text', label: 'Texto', hint: 'Títulos y textos principales.' },
];

const toForm = ({ businessName, colors }) => ({
  businessName: businessName ?? '',
  accent: colors.accent,
  background: colors.background,
  text: colors.text,
  useButton: Boolean(colors.button),
  button: colors.button || colors.accent,
});

const toColors = (form) => ({
  accent: form.accent.toLowerCase(),
  background: form.background.toLowerCase(),
  text: form.text.toLowerCase(),
  button: form.useButton ? form.button.toLowerCase() : null,
});

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

function ColorField({ id, label, hint, value, error, onChange }) {
  return (
    <div>
      <label htmlFor={`${id}-picker`} className="mb-2 inline-block text-sm font-semibold tracking-wide text-text-secondary">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={`${id}-picker`}
          type="color"
          value={isHexColor(value) ? value.toLowerCase() : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border-subtle bg-bg-tertiary p-1"
        />
        <input
          id={id}
          data-testid={id}
          type="text"
          aria-label={`${label} (hexadecimal)`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          value={value}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value.trim())}
          className={`${CONTROL} font-mono`}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}

export default function BrandingTab() {
  const branding = useBranding();
  const { setBranding } = branding;
  const [form, setForm] = useState(() => toForm(branding));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInput = useRef(null);

  // The colors the backend holds: what "Descartar" and leaving the tab go back to.
  const savedColors = useRef(branding.colors);
  savedColors.current = branding.colors;
  useEffect(() => () => applyBrandColors(savedColors.current), []);

  // Live preview. Also re-applied after a logo change, because publishing the new branding resets
  // the page to the saved colors while the form may still hold unsaved edits.
  const colors = toColors(form);
  const previewKey = JSON.stringify(colors);
  useEffect(() => {
    applyBrandColors(JSON.parse(previewKey));
  }, [previewKey, branding]);

  const colorErrors = validateBrandColors(colors);
  const nameError = form.businessName.trim().length > MAX_NAME_LENGTH ? NAME_ERROR : '';
  const invalid = Object.keys(colorErrors).length > 0 || Boolean(nameError);

  const update = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (invalid) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveBranding({ businessName: form.businessName.trim() || null, colors });
      setBranding(saved);
      setForm(toForm(saved));
      toast.success('Marca guardada');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(toForm(branding));
    setError('');
  };

  const restoreDefaults = () => update(toForm({ businessName: form.businessName, colors: DEFAULT_COLORS }));

  const handleLogo = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
      setLogoError(LOGO_ERROR);
      return;
    }
    setLogoError('');
    setLogoBusy(true);
    try {
      setBranding(await uploadLogo(await readAsDataUrl(file)));
      toast.success('Logo actualizado');
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    setLogoError('');
    setLogoBusy(true);
    try {
      setBranding(await deleteLogo());
      toast.success('Logo eliminado');
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setLogoBusy(false);
    }
  };

  const logoSrc = brandLogoSrc(branding.logoUrl);

  return (
    <div className="grid gap-6">
      <Card title="Logo">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-bg-tertiary">
            {logoSrc ? (
              <img src={logoSrc} alt="Logo actual" className="size-full object-contain" />
            ) : (
              <span className="text-xs text-text-muted">Sin logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="branding-logo" className="text-sm font-semibold text-text-secondary">Subir logo</label>
            <input
              id="branding-logo"
              ref={fileInput}
              data-testid="branding-logo"
              type="file"
              accept={LOGO_TYPES.join(',')}
              disabled={logoBusy}
              onChange={handleLogo}
              className="text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-bg-tertiary file:px-3 file:py-1.5 file:text-text-primary"
            />
            <p className="text-xs text-text-muted">PNG, JPG o WebP de hasta 200 KB. Aparece al lado de "BookingApp".</p>
          </div>
          {logoSrc && (
            <Button variant="outline" size="sm" disabled={logoBusy} onClick={removeLogo}>
              Quitar logo
            </Button>
          )}
        </div>
        <FormError message={logoError} testId="branding-logo-error" />
      </Card>

      <Card title="Nombre y colores">
        <form onSubmit={handleSubmit} noValidate>
          <Field id="branding-name" label="Nombre del negocio" className="mb-6">
            <input
              id="branding-name"
              data-testid="branding-name"
              type="text"
              maxLength={MAX_NAME_LENGTH}
              placeholder="Tu tiempo, nuestra prioridad"
              value={form.businessName}
              onChange={(event) => update({ businessName: event.target.value })}
              className={CONTROL}
            />
            <p className="mt-1 text-xs text-text-muted">
              Reemplaza el título del inicio. Vacío muestra el texto por defecto. {form.businessName.trim().length}/{MAX_NAME_LENGTH}
            </p>
            {nameError && <p className="mt-1 text-sm text-error">{nameError}</p>}
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <ColorField
                key={key}
                id={`branding-${key}`}
                label={label}
                hint={hint}
                value={form[key]}
                error={colorErrors[key]}
                onChange={(value) => update({ [key]: value })}
              />
            ))}

            <div>
              <label htmlFor="branding-use-button" className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-secondary">
                <input
                  id="branding-use-button"
                  type="checkbox"
                  checked={form.useButton}
                  onChange={(event) => update({ useButton: event.target.checked })}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Botones con otro color
              </label>
              {form.useButton && (
                <ColorField
                  id="branding-button"
                  label="Botones"
                  hint="Color de los botones principales. Sin él, los botones usan el acento."
                  value={form.button}
                  error={colorErrors.button}
                  onChange={(value) => update({ button: value })}
                />
              )}
            </div>
          </div>

          <p className="mt-6 text-xs text-text-muted">
            Los cambios se ven en la página mientras editas. Se publican recién al guardar.
          </p>
          <FormError message={error} testId="branding-error" />

          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button variant="outline" size="sm" onClick={restoreDefaults}>Restaurar colores originales</Button>
            <Button variant="outline" size="sm" onClick={discard}>Descartar</Button>
            <SaveButton saving={saving} disabled={invalid} testId="branding-save">Guardar</SaveButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

