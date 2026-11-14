import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/bookingService.js', () => ({ getAvailability: vi.fn() }));
vi.mock('../ui/toast.js', () => ({ toast: { warning: vi.fn() } }));

import { getAvailability } from '../services/bookingService.js';
import { toast } from '../ui/toast.js';
import { useAvailableTimes } from './useAvailableTimes.js';

const MONDAY = '2030-03-04';
const SUNDAY = '2030-03-10';

const availability = (alexSlots) => ({
  closed: false,
  professionals: [
    { id: 'alex-garcia', name: 'Alex García', slots: alexSlots },
    { id: 'maria-lopez', name: 'María López', slots: ['09:00'] },
  ],
});

const busyValues = (times) => times.slots.filter((slot) => slot.booked).map((slot) => slot.value);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAvailableTimes', () => {
  it('asks for a date first and does not hit the backend without a professional', () => {
    const { result, rerender } = renderHook(({ date }) => useAvailableTimes(date, null, ['servicio-basico']), {
      initialProps: { date: null },
    });
    expect(result.current).toEqual({ placeholder: 'Selecciona una fecha primero', slots: [], settled: true });

    rerender({ date: MONDAY });
    expect(result.current.placeholder).toBe('Selecciona una hora');
    expect(busyValues(result.current)).toEqual([]);
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('flags as booked every grid time that is not a free start time of the chosen professional', async () => {
    getAvailability.mockResolvedValue(availability(['09:00', '10:00', '14:00']));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, 'alex-garcia', ['servicio-basico', 'servicio-premium']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(getAvailability).toHaveBeenCalledWith(MONDAY, ['servicio-basico', 'servicio-premium'], { timeout: 10000 });
    expect(result.current.slots.filter((slot) => !slot.booked).map((slot) => slot.value)).toEqual(['09:00', '10:00', '14:00']);
    expect(result.current.placeholder).toBe('Selecciona una hora (3 disponibles)');
  });

  it('shows the day as full when the professional is not part of the response', async () => {
    getAvailability.mockResolvedValue(availability(['09:00']));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, 'unknown-professional', ['servicio-basico']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.placeholder).toBe('No hay horarios disponibles');
  });

  it('keeps the closed label on a closed day', async () => {
    getAvailability.mockResolvedValue({ closed: true, professionals: [{ id: 'alex-garcia', slots: [] }] });
    const { result } = renderHook(() => useAvailableTimes(SUNDAY, 'alex-garcia', ['servicio-basico']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current).toMatchObject({ placeholder: 'Domingo cerrado', slots: [] });
  });

  it('asks again when the selected services change, and only then', async () => {
    getAvailability.mockResolvedValue(availability(['09:00']));
    const { result, rerender } = renderHook(({ ids }) => useAvailableTimes(MONDAY, 'alex-garcia', ids), {
      initialProps: { ids: ['servicio-basico'] },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(getAvailability).toHaveBeenCalledTimes(1);

    rerender({ ids: ['servicio-basico'] });
    expect(getAvailability).toHaveBeenCalledTimes(1);

    rerender({ ids: ['servicio-basico', 'servicio-premium'] });
    await waitFor(() => expect(getAvailability).toHaveBeenCalledTimes(2));
    expect(getAvailability).toHaveBeenLastCalledWith(MONDAY, ['servicio-basico', 'servicio-premium'], { timeout: 10000 });
    await waitFor(() => expect(result.current.settled).toBe(true));
  });

  it('warns and shows every time as free when the lookup fails with a non-retryable error', async () => {
    getAvailability.mockRejectedValue(new Error('HTTP error! status: 500'));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, 'alex-garcia', ['servicio-basico']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(busyValues(result.current)).toEqual([]);
    expect(result.current.placeholder).toBe('Selecciona una hora (11 disponibles)');
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });
});
