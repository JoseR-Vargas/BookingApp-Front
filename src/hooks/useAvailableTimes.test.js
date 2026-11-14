import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/bookingService.js', () => ({ getAvailability: vi.fn() }));
vi.mock('../ui/toast.js', () => ({ toast: { warning: vi.fn() } }));

import { getAvailability } from '../services/bookingService.js';
import { toast } from '../ui/toast.js';
import { useAvailableTimes } from './useAvailableTimes.js';

const MONDAY = '2030-03-04';
const SATURDAY = '2030-03-09';
const SUNDAY = '2030-03-10';

const availability = (alexSlots, mariaSlots = ['09:00']) => ({
  closed: false,
  professionals: [
    { id: 'alex-garcia', name: 'Alex García', slots: alexSlots },
    { id: 'maria-lopez', name: 'María López', slots: mariaSlots },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAvailableTimes', () => {
  it('asks for a date first and does not hit the backend without a date or services', () => {
    const { result, rerender } = renderHook(({ date, ids }) => useAvailableTimes(date, null, ids), {
      initialProps: { date: null, ids: ['servicio-basico'] },
    });
    expect(result.current).toEqual({ placeholder: 'Selecciona una fecha primero', slots: [], settled: true });

    rerender({ date: MONDAY, ids: [] });
    expect(result.current).toEqual({ placeholder: 'Selecciona una hora', slots: [], settled: true });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("returns only the chosen professional's free start times, 30-minute ones included", async () => {
    getAvailability.mockResolvedValue(availability(['09:00', '09:30', '14:00']));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, 'alex-garcia', ['servicio-basico', 'servicio-premium']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(getAvailability).toHaveBeenCalledWith(MONDAY, ['servicio-basico', 'servicio-premium'], { timeout: 10000 });
    expect(result.current.slots).toEqual(['09:00', '09:30', '14:00']);
    expect(result.current.placeholder).toBe('Selecciona una hora (3 disponibles)');
  });

  it('fetches without a professional and shows the sorted union of every professional', async () => {
    getAvailability.mockResolvedValue(availability(['09:30', '14:00'], ['09:00', '09:30', '10:30']));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, null, ['servicio-basico']));

    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(getAvailability).toHaveBeenCalledTimes(1);
    expect(result.current.slots).toEqual(['09:00', '09:30', '10:30', '14:00']);
    expect(result.current.placeholder).toBe('Selecciona una hora (4 disponibles)');
  });

  it('filters by professional on the same response, without asking the backend again', async () => {
    getAvailability.mockResolvedValue(availability(['09:30', '14:00'], ['09:00', '10:30']));
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: null },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.slots).toEqual(['09:00', '09:30', '10:30', '14:00']);

    rerender({ professionalId: 'alex-garcia' });
    expect(result.current).toMatchObject({ settled: true, slots: ['09:30', '14:00'] });

    rerender({ professionalId: 'maria-lopez' });
    expect(result.current).toMatchObject({ settled: true, slots: ['09:00', '10:30'] });

    rerender({ professionalId: null });
    expect(result.current.slots).toEqual(['09:00', '09:30', '10:30', '14:00']);
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });

  it('reports no times when the professional is not part of the response or has none free', async () => {
    getAvailability.mockResolvedValue(availability(['09:00'], []));
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: 'unknown-professional' },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current).toMatchObject({ placeholder: 'No hay horarios disponibles', slots: [] });

    rerender({ professionalId: 'maria-lopez' });
    expect(result.current).toMatchObject({ placeholder: 'No hay horarios disponibles', slots: [] });
  });

  it('reports no times when nobody is free the whole day', async () => {
    getAvailability.mockResolvedValue(availability([], []));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, null, ['servicio-basico']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current).toMatchObject({ placeholder: 'No hay horarios disponibles', slots: [] });
  });

  it('keeps the closed label on a closed day, with or without a professional', async () => {
    getAvailability.mockResolvedValue({ closed: true, professionals: [{ id: 'alex-garcia', slots: [] }] });
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(SUNDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: null },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current).toMatchObject({ placeholder: 'Domingo cerrado', slots: [] });

    rerender({ professionalId: 'alex-garcia' });
    expect(result.current).toMatchObject({ placeholder: 'Domingo cerrado', slots: [] });
  });

  it('asks again when the date or the selected services change, and only then', async () => {
    getAvailability.mockResolvedValue(availability(['09:00']));
    const { result, rerender } = renderHook(({ date, ids }) => useAvailableTimes(date, 'alex-garcia', ids), {
      initialProps: { date: MONDAY, ids: ['servicio-basico'] },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(getAvailability).toHaveBeenCalledTimes(1);

    rerender({ date: MONDAY, ids: ['servicio-basico'] });
    expect(getAvailability).toHaveBeenCalledTimes(1);

    rerender({ date: MONDAY, ids: ['servicio-basico', 'servicio-premium'] });
    await waitFor(() => expect(getAvailability).toHaveBeenCalledTimes(2));
    expect(getAvailability).toHaveBeenLastCalledWith(MONDAY, ['servicio-basico', 'servicio-premium'], { timeout: 10000 });
    await waitFor(() => expect(result.current.settled).toBe(true));

    rerender({ date: SATURDAY, ids: ['servicio-basico', 'servicio-premium'] });
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(getAvailability).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.settled).toBe(true));
  });

  describe('when the lookup fails', () => {
    it('warns and falls back to a local 30-minute grid, whatever the professional', async () => {
      getAvailability.mockRejectedValue(new Error('HTTP error! status: 500'));
      const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
        initialProps: { professionalId: 'alex-garcia' },
      });

      await waitFor(() => expect(result.current.settled).toBe(true));

      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(getAvailability).toHaveBeenCalledTimes(1);
      const { slots } = result.current;
      expect(slots).toHaveLength(22);
      expect(slots.slice(0, 3)).toEqual(['09:00', '09:30', '10:00']);
      expect(slots.slice(-2)).toEqual(['19:00', '19:30']);
      expect(result.current.placeholder).toBe('Selecciona una hora (22 disponibles)');

      rerender({ professionalId: null });
      expect(result.current.slots).toEqual(slots);
    });

    it('closes the fallback grid at 18:00 on Saturday and keeps Sunday closed', async () => {
      getAvailability.mockRejectedValue(new Error('HTTP error! status: 500'));
      const { result, rerender } = renderHook(({ date }) => useAvailableTimes(date, null, ['servicio-basico']), {
        initialProps: { date: SATURDAY },
      });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.slots).toHaveLength(18);
      expect(result.current.slots.slice(-2)).toEqual(['17:00', '17:30']);

      rerender({ date: SUNDAY });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current).toMatchObject({ placeholder: 'Domingo cerrado', slots: [] });
    });
  });
});
