import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import Setup from './Setup.jsx';

const catalog = {
  professionals: [], services: [], locations: [{ id: 'principal', name: 'Principal', slug: 'principal', active: true }],
  schedule: { weekly: {}, slotIntervalMinutes: 30, startIntervalMinutes: 30 },
  publicAvailability: { enabled: false, days: 7, serviceIds: null },
};

beforeEach(() => {
  installMockHttp(vi.fn(async () => ({ ok: true, status: 200, json: async () => catalog })));
});

afterEach(() => restoreHttp());

describe('Setup wizard', () => {
  const renderWizard = () => render(<MemoryRouter><Setup /></MemoryRouter>);

  it('starts on the services step and offers to skip it', async () => {
    renderWizard();
    expect(await screen.findByRole('heading', { name: 'Tus servicios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atrás' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saltar' })).toBeInTheDocument();
  });

  it('moves forward, skips and goes back through the four steps', async () => {
    const actor = userEvent.setup();
    renderWizard();
    await screen.findByRole('heading', { name: 'Tus servicios' });

    await actor.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('heading', { name: 'Tu equipo' })).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(screen.getByRole('heading', { name: 'Tus horarios' })).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('heading', { name: 'Tu página pública' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terminar' })).toHaveAttribute('href', '/admin');

    await actor.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByRole('heading', { name: 'Tus horarios' })).toBeInTheDocument();
  });

  it('lets the visitor jump to any step', async () => {
    const actor = userEvent.setup();
    renderWizard();
    await screen.findByRole('heading', { name: 'Tus servicios' });
    await actor.click(screen.getByTestId('setup-step-share'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tu página pública' })).toBeInTheDocument());
  });
});
