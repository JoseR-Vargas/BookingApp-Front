import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockHttp, restoreHttp } from '../../../test/mockHttp.js';

vi.mock('../../../ui/toast.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import UsersTab from './UsersTab.jsx';
import { toast } from '../../../ui/toast.js';

const user = (overrides) => ({
  id: '1', email: 'ana@sur.com', name: 'Ana', role: 'owner', active: true, createdAt: '2030-01-01T00:00:00.000Z', lastLoginAt: null, ...overrides,
});

let users;
let calls;

beforeEach(() => {
  users = [user(), user({ id: '2', email: 'leo@sur.com', name: 'Leo', role: 'staff' })];
  calls = [];
  installMockHttp(vi.fn(async (url, init) => {
    calls.push([init.method, url.replace(/^https?:\/\/[^/]+/, ''), init.body && JSON.parse(init.body)]);
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (init.method === 'GET') return { ok: true, status: 200, json: async () => users };
    if (init.method === 'POST' && path === '/api/admin/users') {
      const body = JSON.parse(init.body);
      users = [...users, user({ id: '3', ...body })];
      return { ok: true, status: 201, json: async () => users[2] };
    }
    if (path.endsWith('/deactivate')) {
      users = users.map((u) => (u.id === '2' ? { ...u, active: false } : u));
      return { ok: true, status: 201, json: async () => users[1] };
    }
    if (path.endsWith('/role')) {
      return {
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ statusCode: 409, message: 'Debe quedar al menos un dueño activo.' }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }));
  vi.clearAllMocks();
});

afterEach(() => restoreHttp());

describe('UsersTab', () => {
  it('lists the accounts of the business', async () => {
    render(<UsersTab />);
    expect(await screen.findByText('ana@sur.com')).toBeInTheDocument();
    expect(screen.getByText('leo@sur.com')).toBeInTheDocument();
  });

  it('creates a user and reloads the list', async () => {
    const actor = userEvent.setup();
    render(<UsersTab />);
    await screen.findByText('ana@sur.com');
    await actor.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await actor.type(screen.getByLabelText('Nombre'), 'Mia');
    await actor.type(screen.getByLabelText('Correo'), 'mia@sur.com');
    await actor.type(screen.getByLabelText(/Contraseña/), 'long-enough-pass');
    await actor.click(screen.getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Usuario creado'));
    expect(calls).toContainEqual(['POST', '/api/admin/users', { name: 'Mia', email: 'mia@sur.com', password: 'long-enough-pass', role: 'staff' }]);
    expect(await screen.findByText('mia@sur.com')).toBeInTheDocument();
  });

  it('deactivates a user', async () => {
    const actor = userEvent.setup();
    render(<UsersTab />);
    const row = (await screen.findByText('leo@sur.com')).closest('tr');
    await actor.click(within(row).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Usuario desactivado'));
    expect(calls).toContainEqual(['POST', '/api/admin/users/2/deactivate', undefined]);
  });

  it('shows the backend message when the last owner would be left out', async () => {
    const actor = userEvent.setup();
    render(<UsersTab />);
    await screen.findByText('ana@sur.com');
    await actor.selectOptions(screen.getByLabelText('Rol de ana@sur.com'), 'viewer');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Debe quedar al menos un dueño activo.'));
  });
});
