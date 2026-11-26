import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockHttp, restoreHttp } from '../../../test/mockHttp.js';

vi.mock('../../../ui/toast.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RemindersTab from './RemindersTab.jsx';

let state;
let calls;

const base = () => ({
  config: { enabled: true, channels: ['email'], hoursBefore: [24, 3], template: 'Hola {cliente}' },
  allowsReminders: true,
  counters: { days: 30, sent: 12, failed: 1 },
  recent: [
    { bookingId: 'b1', kind: '24h', channel: 'email', sentAt: '2030-01-10T10:00:00.000Z', ok: true, error: null, attempts: 1 },
    { bookingId: 'b2', kind: '3h', channel: 'email', sentAt: '2030-01-11T10:00:00.000Z', ok: false, error: 'smtp down', attempts: 2 },
  ],
});

beforeEach(() => {
  state = base();
  calls = [];
  installMockHttp(vi.fn(async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    calls.push([init.method, path, init.body && JSON.parse(init.body)]);
    if (init.method === 'PUT') {
      state = { ...state, config: JSON.parse(init.body) };
    }
    return { ok: true, status: 200, json: async () => state };
  }));
});

afterEach(() => restoreHttp());

describe('RemindersTab', () => {
  it('shows the configuration, the counters and the last sent reminders', async () => {
    render(<RemindersTab />);
    expect(await screen.findByTestId('reminders-counters')).toHaveTextContent('12 enviados, 1 fallidos');
    expect(screen.getByTestId('reminders-enabled')).toBeChecked();
    expect(screen.getByTestId('reminders-channel-email')).toBeChecked();
    expect(screen.getByTestId('reminders-hour-24')).toBeChecked();
    expect(screen.getByTestId('reminders-hour-1')).not.toBeChecked();
    const recent = screen.getByTestId('reminders-recent');
    expect(recent).toHaveTextContent('24h');
    expect(recent).toHaveTextContent('smtp down');
    expect(recent).toHaveTextContent('2 intentos');
  });

  it('saves the configuration the owner chose', async () => {
    const actor = userEvent.setup();
    render(<RemindersTab />);
    await screen.findByTestId('reminders-counters');
    await actor.click(screen.getByTestId('reminders-hour-1'));
    await actor.click(screen.getByTestId('reminders-enabled'));
    await actor.click(screen.getByRole('button', { name: 'Guardar recordatorios' }));

    await waitFor(() => expect(calls).toContainEqual(['PUT', '/api/admin/reminders', {
      enabled: false,
      channels: ['email'],
      hoursBefore: [24, 3, 1],
      template: 'Hola {cliente}',
    }]));
  });

  it('says the plan does not include reminders', async () => {
    state = { ...base(), allowsReminders: false };
    render(<RemindersTab />);
    expect(await screen.findByText(/Tu plan no incluye recordatorios/)).toBeInTheDocument();
  });
});
