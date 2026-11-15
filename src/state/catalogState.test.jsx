import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../test/catalogFixture.js';
import { getFallbackSchedule, setFallbackSchedule } from '../utils/schedule.js';

vi.mock('../services/catalogService.js', () => ({ getCatalog: vi.fn() }));

import { getCatalog } from '../services/catalogService.js';
import { CatalogProvider, useCatalog } from './catalogState.jsx';

const wrapper = ({ children }) => <CatalogProvider>{children}</CatalogProvider>;

beforeEach(() => {
  getCatalog.mockReset();
});

describe('CatalogProvider / useCatalog', () => {
  it('starts loading and exposes the catalog once it is ready', async () => {
    getCatalog.mockResolvedValue(CATALOG);

    const { result } = renderHook(() => useCatalog(), { wrapper });
    expect(result.current.status).toBe('loading');
    expect(result.current.professionals).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.professionals).toEqual(CATALOG.professionals);
    expect(result.current.services).toEqual(CATALOG.services);
    expect(result.current.schedule).toEqual(CATALOG.schedule);
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });

  it('hands the catalog schedule to the failure-only fallback grid', async () => {
    const schedule = { weekly: { ...CATALOG.schedule.weekly, 1: { closed: false, open: '10:00', close: '11:00' } }, slotIntervalMinutes: 30 };
    getCatalog.mockResolvedValue({ ...CATALOG, schedule });

    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // 2030-01-07 is a Monday.
    expect(getFallbackSchedule('2030-01-07')).toEqual({ closed: false, times: ['10:00', '10:30'] });
    setFallbackSchedule(null);
  });

  it('moves to the error status when the request fails', async () => {
    getCatalog.mockRejectedValue(new Error('HTTP error! status: 500'));

    const { result } = renderHook(() => useCatalog(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.services).toEqual([]);
  });

  it('reload retries after a failure and recovers', async () => {
    getCatalog.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(CATALOG);

    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => { result.current.reload(); });
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.services).toEqual(CATALOG.services);
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it('ignores the answer of a superseded request', async () => {
    let resolveFirst;
    getCatalog
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(CATALOG);

    const { result } = renderHook(() => useCatalog(), { wrapper });
    act(() => { result.current.reload(); });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { resolveFirst({ professionals: [], services: [], schedule: null }); });

    expect(result.current.services).toEqual(CATALOG.services);
  });

  it('does not update state after unmount', async () => {
    let resolveCatalog;
    getCatalog.mockImplementation(() => new Promise((resolve) => { resolveCatalog = resolve; }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<CatalogProvider><p>child</p></CatalogProvider>);
    expect(screen.getByText('child')).toBeInTheDocument();
    unmount();
    await act(async () => { resolveCatalog(CATALOG); });

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('useCatalog throws outside a provider', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCatalog())).toThrow('useCatalog must be used inside <CatalogProvider>');
    errors.mockRestore();
  });
});
