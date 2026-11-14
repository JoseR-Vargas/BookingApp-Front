import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('asks for a professional first and does not hit the backend while none is selected', () => {
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: null },
    });

    expect(result.current).toEqual({ placeholder: 'Selecciona un profesional primero', slots: [], settled: true });
    expect(getAvailability).not.toHaveBeenCalled();

    // Still nothing for an empty-string id: only a real professional starts the request.
    rerender({ professionalId: '' });
    expect(result.current).toEqual({ placeholder: 'Selecciona un profesional primero', slots: [], settled: true });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('starts the request once a professional is selected and returns only their free times', async () => {
    getAvailability.mockResolvedValue(availability(['09:30', '14:00'], ['09:00', '10:30']));
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: null },
    });
    expect(getAvailability).not.toHaveBeenCalled();

    rerender({ professionalId: 'alex-garcia' });
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(getAvailability).toHaveBeenCalledTimes(1);
    expect(result.current.slots).toEqual(['09:30', '14:00']);
    expect(result.current.placeholder).toBe('Selecciona una hora (2 disponibles)');
  });

  it('switches professional on the same response, without asking the backend again', async () => {
    getAvailability.mockResolvedValue(availability(['09:30', '14:00'], ['09:00', '10:30']));
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: 'alex-garcia' },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current).toMatchObject({ settled: true, slots: ['09:30', '14:00'] });

    rerender({ professionalId: 'maria-lopez' });
    expect(result.current).toMatchObject({ settled: true, slots: ['09:00', '10:30'] });
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });

  it('returns to the prompt when the professional is removed, and answers again once one is back', async () => {
    getAvailability.mockResolvedValue(availability(['09:30', '14:00']));
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: 'alex-garcia' },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));

    rerender({ professionalId: null });
    expect(result.current).toEqual({ placeholder: 'Selecciona un profesional primero', slots: [], settled: true });

    rerender({ professionalId: 'alex-garcia' });
    await waitFor(() => expect(result.current.slots).toEqual(['09:30', '14:00']));
  });

  it('ignores a response that arrives after the professional was removed', async () => {
    let resolve;
    getAvailability.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(MONDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: 'alex-garcia' },
    });
    expect(result.current.settled).toBe(false);

    rerender({ professionalId: null });
    await act(async () => {
      resolve(availability(['09:00']));
    });

    expect(result.current).toEqual({ placeholder: 'Selecciona un profesional primero', slots: [], settled: true });
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

  it('reports no times when the professional is free at no time of the day', async () => {
    getAvailability.mockResolvedValue(availability([], []));
    const { result } = renderHook(() => useAvailableTimes(MONDAY, 'alex-garcia', ['servicio-basico']));

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current).toMatchObject({ placeholder: 'No hay horarios disponibles', slots: [] });
  });

  it('shows the closed label on a closed day once a professional is selected', async () => {
    getAvailability.mockResolvedValue({ closed: true, professionals: [{ id: 'alex-garcia', slots: [] }] });
    const { result, rerender } = renderHook(({ professionalId }) => useAvailableTimes(SUNDAY, professionalId, ['servicio-basico']), {
      initialProps: { professionalId: null },
    });
    expect(result.current).toEqual({ placeholder: 'Selecciona un profesional primero', slots: [], settled: true });

    rerender({ professionalId: 'alex-garcia' });
    await waitFor(() => expect(result.current.settled).toBe(true));
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
    it('warns and falls back to a local 30-minute grid, the same for every professional', async () => {
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

      rerender({ professionalId: 'maria-lopez' });
      expect(result.current.slots).toEqual(slots);
    });

    it('closes the fallback grid at 18:00 on Saturday and keeps Sunday closed', async () => {
      getAvailability.mockRejectedValue(new Error('HTTP error! status: 500'));
      const { result, rerender } = renderHook(({ date }) => useAvailableTimes(date, 'alex-garcia', ['servicio-basico']), {
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
