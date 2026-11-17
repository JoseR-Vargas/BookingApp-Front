import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteLogo, saveBranding, uploadLogo } from '../../../services/adminService.js';
import { BrandingContext } from '../../../state/brandingState.jsx';
import { toast } from '../../../ui/toast.js';
import BrandingTab from './BrandingTab.jsx';

vi.mock('../../../services/adminService.js', () => ({
  saveBranding: vi.fn(),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(),
}));
vi.mock('../../../ui/toast.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SAVED = {
  businessName: 'Barbería Don Pepe',
  colors: { accent: '#c9a96e', background: '#0d0d0d', text: '#f5f0e8', button: null },
  logoUrl: null,
};

const rootVar = (name) => document.documentElement.style.getPropertyValue(name);

function renderTab(branding = SAVED) {
  const setBranding = vi.fn();
  const utils = render(
    <BrandingContext.Provider value={{ ...branding, status: 'ready', setBranding, refresh: vi.fn() }}>
      <BrandingTab />
    </BrandingContext.Provider>,
  );
  return { ...utils, setBranding };
}

const hexInput = (label) => screen.getByLabelText(`${label} (hexadecimal)`);

async function typeHex(user, label, value) {
  const input = hexInput(label);
  await user.clear(input);
  await user.type(input, value);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('BrandingTab', () => {
  it('previews a color change on the page before saving', async () => {
    const user = userEvent.setup();
    renderTab();

    await typeHex(user, 'Acento', '#3366cc');

    expect(rootVar('--brand-accent')).toBe('#3366cc');
    expect(saveBranding).not.toHaveBeenCalled();
  });

  it('saves the name and colors and publishes the saved branding', async () => {
    const user = userEvent.setup();
    const saved = { ...SAVED, businessName: 'Peluquería Sol', colors: { ...SAVED.colors, accent: '#3399ff' } };
    saveBranding.mockResolvedValue(saved);
    const { setBranding } = renderTab();

    const name = screen.getByLabelText('Nombre del negocio');
    await user.clear(name);
    await user.type(name, '  Peluquería Sol  ');
    await typeHex(user, 'Acento', '#3399ff');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveBranding).toHaveBeenCalledWith({
      businessName: 'Peluquería Sol',
      colors: { accent: '#3399ff', background: '#0d0d0d', text: '#f5f0e8', button: null },
    });
    await waitFor(() => expect(setBranding).toHaveBeenCalledWith(saved));
    expect(toast.success).toHaveBeenCalledWith('Marca guardada');
  });

  it('sends an empty name as null', async () => {
    const user = userEvent.setup();
    saveBranding.mockResolvedValue({ ...SAVED, businessName: null });
    renderTab();

    await user.clear(screen.getByLabelText('Nombre del negocio'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveBranding).toHaveBeenCalledWith(expect.objectContaining({ businessName: null }));
  });

  it('blocks saving when the text does not contrast with the background', async () => {
    const user = userEvent.setup();
    renderTab();

    await typeHex(user, 'Fondo', '#888888');
    await typeHex(user, 'Texto', '#777777');
    await typeHex(user, 'Acento', '#000000');

    expect(screen.getByText('El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(saveBranding).not.toHaveBeenCalled();
  });

  it('sends the button color only when it is enabled', async () => {
    const user = userEvent.setup();
    saveBranding.mockResolvedValue(SAVED);
    renderTab();

    await user.click(screen.getByLabelText('Botones con otro color'));
    await typeHex(user, 'Botones', '#e0c080');
    expect(rootVar('--brand-button')).toBe('#e0c080');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveBranding).toHaveBeenCalledWith(
      expect.objectContaining({ colors: expect.objectContaining({ button: '#e0c080' }) }),
    );
  });

  it('shows the backend error when saving fails', async () => {
    const user = userEvent.setup();
    saveBranding.mockRejectedValue(new Error('El nombre del negocio puede tener hasta 60 caracteres.'));
    renderTab();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El nombre del negocio puede tener hasta 60 caracteres.')).toBeInTheDocument();
  });

  it('"Descartar" goes back to the saved colors', async () => {
    const user = userEvent.setup();
    renderTab();

    await typeHex(user, 'Acento', '#3366cc');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(hexInput('Acento')).toHaveValue('#c9a96e');
    expect(rootVar('--brand-accent')).toBe('#c9a96e');
  });

  it('"Restaurar colores originales" loads the default palette without saving', async () => {
    const user = userEvent.setup();
    renderTab({ ...SAVED, colors: { accent: '#3366cc', background: '#ffffff', text: '#111111', button: '#224488' } });

    await user.click(screen.getByRole('button', { name: 'Restaurar colores originales' }));

    expect(hexInput('Acento')).toHaveValue('#f62039');
    expect(hexInput('Fondo')).toHaveValue('#111111');
    expect(hexInput('Texto')).toHaveValue('#ffffff');
    expect(hexInput('Botones')).toHaveValue('#295294');
    expect(screen.getByLabelText('Botones con otro color')).toBeChecked();
    expect(saveBranding).not.toHaveBeenCalled();
  });

  it('restores the saved colors when leaving the tab without saving', async () => {
    const user = userEvent.setup();
    const { unmount } = renderTab();

    await typeHex(user, 'Acento', '#3366cc');
    unmount();

    expect(rootVar('--brand-accent')).toBe('#c9a96e');
  });

  describe('logo', () => {
    const file = (type, size) => new File([new Uint8Array(size)], 'logo', { type });

    it('rejects a file that is not PNG, JPG or WebP, or is over 200 KB, without uploading', async () => {
      renderTab();
      const input = screen.getByLabelText('Subir logo');

      fireEvent.change(input, { target: { files: [file('image/svg+xml', 10)] } });
      expect(await screen.findByText('El logo debe ser PNG, JPG o WebP de hasta 200 KB.')).toBeInTheDocument();

      fireEvent.change(input, { target: { files: [file('image/png', 200 * 1024 + 1)] } });
      expect(screen.getByText('El logo debe ser PNG, JPG o WebP de hasta 200 KB.')).toBeInTheDocument();
      expect(uploadLogo).not.toHaveBeenCalled();
    });

    it('uploads a valid logo as a data URL and publishes the result', async () => {
      const saved = { ...SAVED, logoUrl: '/api/branding/logo?v=5' };
      uploadLogo.mockResolvedValue(saved);
      const { setBranding } = renderTab();

      await act(async () => {
        fireEvent.change(screen.getByLabelText('Subir logo'), { target: { files: [file('image/png', 1024)] } });
      });

      await waitFor(() => expect(uploadLogo).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)));
      await waitFor(() => expect(setBranding).toHaveBeenCalledWith(saved));
    });

    it('"Quitar logo" deletes the current logo', async () => {
      const user = userEvent.setup();
      const saved = { ...SAVED, logoUrl: null };
      deleteLogo.mockResolvedValue(saved);
      const { setBranding } = renderTab({ ...SAVED, logoUrl: '/api/branding/logo?v=5' });

      expect(screen.getByRole('img', { name: 'Logo actual' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Quitar logo' }));

      expect(deleteLogo).toHaveBeenCalled();
      await waitFor(() => expect(setBranding).toHaveBeenCalledWith(saved));
    });
  });
});
