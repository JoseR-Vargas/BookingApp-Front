import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import Signup from './Signup.jsx';

let calls;
let answer;

const renderPage = () => render(
  <MemoryRouter initialEntries={['/empezar']}>
    <Routes>
      <Route path="/empezar" element={<Signup />} />
      <Route path="/n/:slug/asistente" element={<p>wizard</p>} />
    </Routes>
  </MemoryRouter>,
);

async function fill(actor, { name = 'Barbería Sur', slug } = {}) {
  await actor.type(screen.getByLabelText('Nombre del negocio'), name);
  if (slug !== undefined) {
    await actor.clear(screen.getByLabelText('Dirección de tu negocio'));
    await actor.type(screen.getByLabelText('Dirección de tu negocio'), slug);
  }
  await actor.type(screen.getByLabelText('Tu nombre'), 'Ana');
  await actor.type(screen.getByLabelText('Correo'), 'ana@sur.com');
  await actor.type(screen.getByLabelText(/Contraseña/), 'correct-horse-1');
}

beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  answer = {
    ok: true,
    status: 201,
    json: async () => ({ ok: true, tenant: { slug: 'barberia-sur', name: 'Barbería Sur' }, user: { id: '1', email: 'ana@sur.com', name: 'Ana', role: 'owner' } }),
  };
  installMockHttp(vi.fn(async (url, init) => {
    calls.push([init.method, url.replace(/^https?:\/\/[^/]+/, ''), init.body && JSON.parse(init.body)]);
    return answer;
  }));
});

afterEach(() => restoreHttp());

describe('Signup page', () => {
  it('suggests the address from the name and shows it', async () => {
    const actor = userEvent.setup();
    renderPage();
    await actor.type(screen.getByLabelText('Nombre del negocio'), 'Barbería Sur');
    expect(screen.getByLabelText('Dirección de tu negocio')).toHaveValue('barberia-sur');
    expect(screen.getByText('Tus clientes entrarán por /n/barberia-sur')).toBeInTheDocument();
  });

  it('creates the business, keeps the session of that business and goes to the wizard', async () => {
    const actor = userEvent.setup();
    renderPage();
    await fill(actor);
    await actor.click(screen.getByRole('button', { name: 'Crear mi negocio' }));

    expect(await screen.findByText('wizard')).toBeInTheDocument();
    expect(calls[0]).toEqual(['POST', '/api/signup', {
      businessName: 'Barbería Sur', adminName: 'Ana', email: 'ana@sur.com', password: 'correct-horse-1', slug: 'barberia-sur',
    }]);
    expect(sessionStorage.getItem('isAdmin:barberia-sur')).toBe('true');
    expect(sessionStorage.getItem('adminRole:barberia-sur')).toBe('owner');
    expect(sessionStorage.getItem('adminKey:barberia-sur')).toBeNull();
    expect(sessionStorage.getItem('isAdmin')).toBeNull();
  });

  it('keeps an address the visitor edited', async () => {
    const actor = userEvent.setup();
    renderPage();
    await fill(actor, { slug: 'mi-barberia' });
    await actor.click(screen.getByRole('button', { name: 'Crear mi negocio' }));
    await screen.findByText('wizard');
    expect(calls[0][2].slug).toBe('mi-barberia');
  });

  it('shows the backend message and stays on the form when the address is taken', async () => {
    answer = {
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ statusCode: 409, message: 'El slug "barberia-sur" ya está en uso.' }),
    };
    const actor = userEvent.setup();
    renderPage();
    await fill(actor);
    await actor.click(screen.getByRole('button', { name: 'Crear mi negocio' }));

    await waitFor(() => expect(screen.getByTestId('signup-error')).toHaveTextContent('ya está en uso'));
    expect(screen.queryByText('wizard')).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });
});
