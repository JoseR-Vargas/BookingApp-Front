import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockHttp, restoreHttp } from '../../test/mockHttp.js';

vi.mock('../../ui/toast.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PlatformSection from './PlatformSection.jsx';

const business = (overrides) => ({
  id: 'b1', slug: 'sur', name: 'Barbería Sur', status: 'active', isDefault: false,
  plan: { id: 'pro', name: 'Pro' }, subscriptionStatus: 'active',
  trial: { endsAt: '2030-01-01T00:00:00.000Z', daysLeft: 9 },
  bookingsThisMonth: 12, storage: { usedBytes: 1048576, quotaBytes: 52428800 },
  lastUseAt: '2026-11-25T09:00:00.000Z', ...overrides,
});

let calls;
let answer;
let businesses;

beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  answer = null;
  businesses = [business()];
  installMockHttp(vi.fn(async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    calls.push([init.method, path, init.headers && init.headers['x-platform-key'], init.body && JSON.parse(init.body)]);
    if (path === '/api/platform/tenants') {
      return { ok: true, status: 200, json: async () => ({ businesses }) };
    }
    if (path === '/api/platform/metrics') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          businesses: { total: 5, active: 4, inTrial: 2, suspended: 1 },
          bookings: { today: 7, thisMonth: 42 },
          estimatedRevenueByPlan: [{ planId: 'pro', subscriptions: 3 }],
        }),
      };
    }
    if (path.includes('/suspend') || path.includes('/reactivate') || path.includes('/trial') || path.includes('/plan')) {
      return { ok: true, status: 200, json: async () => ({ business: business() }) };
    }
    return { ok: true, status: 200, json: async () => answer };
  }));
});

afterEach(() => restoreHttp());

describe('PlatformSection', () => {
  it('asks for the platform key when there is none', () => {
    render(<PlatformSection />);
    expect(screen.getByLabelText('Clave de plataforma')).toBeInTheDocument();
  });

  it('lists the businesses and the metrics with the key', async () => {
    sessionStorage.setItem('platformKey', 'k');
    render(<PlatformSection />);
    expect(await screen.findByText('Barbería Sur')).toBeInTheDocument();
    expect(screen.getByText('/n/sur')).toBeInTheDocument();
    expect(screen.getByTestId('platform-metrics')).toHaveTextContent('42');
    expect(JSON.stringify(calls[0])).toContain('k');
  });

  it('deletes a business only when the slug is confirmed', async () => {
    sessionStorage.setItem('platformKey', 'k');
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('sur');
    render(<PlatformSection />);
    const button = await screen.findByTestId('platform-delete-sur');
    await userEvent.setup().click(button);

    expect(calls).toContainEqual(['DELETE', '/api/platform/tenants/b1', 'k', { confirm: 'sur' }]);
    prompt.mockRestore();
  });

  it('does not delete anything when the confirmation is cancelled', async () => {
    sessionStorage.setItem('platformKey', 'k');
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<PlatformSection />);
    await userEvent.setup().click(await screen.findByTestId('platform-delete-sur'));

    expect(calls.filter((call) => call[0] === 'DELETE')).toHaveLength(0);
    prompt.mockRestore();
  });

  it('does not offer the deletion of the business that answers by default', async () => {
    sessionStorage.setItem('platformKey', 'k');
    businesses = [business({ isDefault: true })];
    render(<PlatformSection />);
    await screen.findByText('Barbería Sur');
    expect(screen.queryByTestId('platform-delete-sur')).not.toBeInTheDocument();
  });

  it('suspends a business', async () => {
    sessionStorage.setItem('platformKey', 'k');
    const actor = userEvent.setup();
    render(<PlatformSection />);
    await actor.click(await screen.findByRole('button', { name: 'Suspender' }));
    await waitFor(() => expect(calls).toContainEqual(['POST', '/api/platform/tenants/b1/suspend', 'k', undefined]));
  });
});
