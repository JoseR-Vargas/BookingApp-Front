import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useBookingPolling } from './useBookingPolling.js';

const getRecentBookingIds = vi.fn();

vi.mock('../services/adminService.js', () => ({
  getRecentBookingIds: (...args) => getRecentBookingIds(...args),
}));

const Harness = ({ onNew, intervalMs, known = [] }) => {
  const { markKnown } = useBookingPolling(onNew, intervalMs);
  useEffect(() => {
    markKnown(known);
  }, [known, markKnown]);
  return null;
};

beforeEach(() => {
  vi.useFakeTimers();
  getRecentBookingIds.mockReset();
  getRecentBookingIds.mockResolvedValue(['b', 'a']);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBookingPolling', () => {
  it('announces the ids that arrived and never repeats them', async () => {
    const onNew = vi.fn();
    render(<Harness onNew={onNew} intervalMs={1000} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith(['b', 'a']);

    await vi.advanceTimersByTimeAsync(2000);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('does not announce the bookings the panel already knew', async () => {
    const onNew = vi.fn();
    render(<Harness onNew={onNew} intervalMs={1000} known={['a']} />);

    await vi.advanceTimersByTimeAsync(1000);

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith(['b']);
  });

  it('does not poll while the tab is hidden', async () => {
    const onNew = vi.fn();
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(<Harness onNew={onNew} intervalMs={1000} />);

    await vi.advanceTimersByTimeAsync(3000);
    expect(getRecentBookingIds).not.toHaveBeenCalled();

    hidden.mockReturnValue('visible');
    await vi.advanceTimersByTimeAsync(1000);
    expect(getRecentBookingIds).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });

  it('keeps working when the request fails', async () => {
    getRecentBookingIds.mockRejectedValue(new Error('network down'));
    const onNew = vi.fn();
    render(<Harness onNew={onNew} intervalMs={1000} />);

    await vi.advanceTimersByTimeAsync(3000);
    expect(onNew).not.toHaveBeenCalled();
  });
});
