import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockHttp, restoreHttp } from '../../../test/mockHttp.js';

vi.mock('../../../ui/toast.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PlanTab from './PlanTab.jsx';
import { toast } from '../../../ui/toast.js';

let session;
let calls;
let assign;

const PRO = {
  planId: 'pro', status: 'active', currentPeriodEnd: '2030-02-15T00:00:00.000Z', cancelAtPeriodEnd: false,
  limits: { professionals: 3, locations: 2, bookingsPerMonth: 500, publicPage: true, reminders: true },
  usage: { professionals: 2, locations: 1, bookingsThisMonth: 40 },
};

beforeEach(() => {
  session = { ok: true, user: { role: 'owner' }, plan: null };
  calls = [];
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign, pathname: '/admin' });
  installMockHttp(vi.fn(async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    calls.push([init.method, path, init.body && JSON.parse(init.body)]);
    if (path === '/api/admin/session') return { ok: true, status: 200, json: async () => session };
    if (path.endsWith('/checkout')) return { ok: true, status: 201, json: async () => ({ checkoutUrl: 'https://pay.example/c/1' }) };
    return { ok: true, status: 201, json: async () => ({}) };
  }));
  vi.clearAllMocks();
});

afterEach(() => {
  restoreHttp();
  vi.unstubAllGlobals();
});

describe('PlanTab', () => {
  it('offers the paid plans when the business has no subscription', async () => {
    render(<PlanTab />);
    expect(await screen.findByText(/Todavía no contrataste un plan/)).toBeInTheDocument();
    expect(screen.getByTestId('plan-choose-pro')).toBeInTheDocument();
    expect(screen.getByTestId('plan-choose-negocio')).toBeInTheDocument();
  });

  it('sends the owner to the payment page of the gateway', async () => {
    const actor = userEvent.setup();
    render(<PlanTab />);
    await actor.click(await screen.findByTestId('plan-choose-pro'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/c/1'));
    expect(calls).toContainEqual(['POST', '/api/admin/subscription/checkout', { planId: 'pro' }]);
  });

  it('shows the current plan, its renewal and its usage', async () => {
    session = { ...session, plan: PRO };
    render(<PlanTab />);
    const current = await screen.findByTestId('plan-current');
    expect(current).toHaveTextContent('Pro · Activo');
    expect(current).toHaveTextContent('Se renueva el');
    expect(current).toHaveTextContent('2 de 3 profesionales');
    expect(current).toHaveTextContent('40 de 500 reservas este mes');
    expect(screen.getByText('Tu plan actual')).toBeInTheDocument();
  });

  it('cancels at the end of the period and can resume', async () => {
    const actor = userEvent.setup();
    session = { ...session, plan: PRO };
    render(<PlanTab />);
    await actor.click(await screen.findByRole('button', { name: 'Cancelar al final del período' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('La suscripción terminará al final del período'));
    expect(calls).toContainEqual(['POST', '/api/admin/subscription/cancel', undefined]);

    session = { ...session, plan: { ...PRO, cancelAtPeriodEnd: true } };
    render(<PlanTab />);
    await actor.click(await screen.findByRole('button', { name: 'Reanudar' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Suscripción reanudada'));
  });

  it('warns when the payment is overdue and the business keeps working', async () => {
    session = { ...session, plan: { ...PRO, status: 'past_due' } };
    render(<PlanTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu negocio sigue funcionando');
  });
});
