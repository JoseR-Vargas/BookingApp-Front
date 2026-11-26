import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The routing contract is under test, not the pages themselves.
vi.mock('./pages/Home.jsx', () => ({ default: () => <p>home page</p> }));
vi.mock('./pages/Login.jsx', () => ({ default: () => <p>login page</p> }));
vi.mock('./pages/Admin.jsx', () => ({ default: () => <p>admin page</p> }));
vi.mock('./pages/CancelBooking.jsx', () => ({ default: () => <p>cancel page</p> }));

import App from './App.jsx';

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <App />
  </MemoryRouter>,
);

beforeEach(() => {
  sessionStorage.clear();
});

describe('App routing', () => {
  it('redirects an unauthenticated /admin visit to the login page', () => {
    renderAt('/admin');

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('admin page')).not.toBeInTheDocument();
  });

  it('shows the admin panel to an authenticated session', async () => {
    sessionStorage.setItem('isAdmin', 'true');

    renderAt('/admin');

    expect(await screen.findByText('admin page')).toBeInTheDocument();
  });

  it('keeps /login and / public', () => {
    renderAt('/login');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('serves the cancel page at /cancelar/:token without any session', () => {
    renderAt('/cancelar/some-token');

    expect(screen.getByText('cancel page')).toBeInTheDocument();
  });

  it('serves the home page at /', () => {
    renderAt('/');
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it.each([
    ['/admin.html', 'login page'],
    ['/login.html', 'login page'],
    ['/index.html', 'home page'],
  ])('legacy URL %s still resolves (unauthenticated)', (path, expected) => {
    renderAt(path);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('legacy /admin.html reaches the panel when authenticated', async () => {
    sessionStorage.setItem('isAdmin', 'true');

    renderAt('/admin.html');

    expect(await screen.findByText('admin page')).toBeInTheDocument();
  });
});

describe('App routing per business (spec 19)', () => {
  // MemoryRouter does not move the address bar, which the session keys and the X-Tenant header read.
  const renderBusiness = (path) => {
    window.history.pushState({}, '', path);
    return renderAt(path);
  };

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('serves the home of a business under /n/<slug>', async () => {
    const { installMockHttp } = await import('./test/mockHttp.js');
    installMockHttp(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    renderBusiness('/n/sur');

    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('keeps the admin session of each business apart', async () => {
    sessionStorage.setItem('isAdmin', 'true'); // the default business only
    const { installMockHttp } = await import('./test/mockHttp.js');
    installMockHttp(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    renderBusiness('/n/sur/admin');

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('admin page')).not.toBeInTheDocument();
  });

  it('shows a notice with a link to the front page for an unknown business', async () => {
    const { installMockHttp } = await import('./test/mockHttp.js');
    installMockHttp(async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ statusCode: 404, message: 'Negocio no encontrado' }),
    }));
    renderBusiness('/n/no-existe');

    expect(await screen.findByText('No encontramos este negocio. Revisa el enlace.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la portada' })).toHaveAttribute('href', '/');
  });

  it('shows a notice for a suspended business', async () => {
    const { installMockHttp } = await import('./test/mockHttp.js');
    installMockHttp(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ statusCode: 403, message: 'Este negocio no está disponible.' }),
    }));
    renderBusiness('/n/pausado');

    expect(await screen.findByText('Este negocio no está disponible en este momento.')).toBeInTheDocument();
  });
});
