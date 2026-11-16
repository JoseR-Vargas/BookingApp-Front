import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('../services/adminService.js', () => ({
  getBookings: vi.fn(),
  getStatistics: vi.fn(),
  deleteBooking: vi.fn(),
  cancelBooking: vi.fn(),
}));

import { cancelBooking, getBookings, getStatistics } from '../services/adminService.js';
import { toast } from '../ui/toast.js';
import { useAdminData } from './useAdminData.js';

const make = (id, over = {}) => ({
  _id: id,
  client: { name: `Cliente ${id}`, email: 'c@example.com' },
  services: [{ id: 's1', name: 'Servicio Básico', price: 1000, duration: 60 }],
  totalPrice: 1000,
  totalDuration: 60,
  professional: { name: 'Alex García' },
  date: '2030-03-10',
  time: '10:00',
  status: 'confirmed',
  createdAt: `2030-01-0${id}T10:00:00.000Z`,
  ...over,
});

const BOOKINGS = [
  make('1'),
  make('2', { professional: { name: 'María López' }, services: [{ id: 's2', name: 'Premium', price: 2500, duration: 60 }], totalPrice: 2500 }),
  make('3', { date: '2030-03-11', professional: { name: 'María López' } }),
];

async function loaded() {
  getBookings.mockResolvedValue(BOOKINGS);
  const hook = renderHook(() => useAdminData());
  await act(async () => { await hook.result.current.loadBookings(); });
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAdminData professional filter', () => {
  it('exposes the distinct professional names of ALL bookings, whatever the other filters say', async () => {
    const { result } = await loaded();
    expect(result.current.professionals).toEqual(['Alex García', 'María López']);

    await act(async () => { await result.current.applyFilter('2030-03-11'); });

    expect(result.current.visibleBookings).toHaveLength(1);
    expect(result.current.professionals).toEqual(['Alex García', 'María López']);
  });

  it('shows everything and no professional selected at first', async () => {
    const { result } = await loaded();
    expect(result.current.professional).toBe('');
    expect(result.current.visibleBookings).toHaveLength(3);
  });

  it('filters the visible bookings and the filtered revenue by professional', async () => {
    const { result } = await loaded();

    act(() => result.current.setProfessional('María López'));

    expect(result.current.visibleBookings.map((b) => b._id)).toEqual(['2', '3']);
    expect(result.current.filteredRevenue).toBe(2500 + 1000);
  });

  it('combines with the date filter', async () => {
    const { result } = await loaded();
    await act(async () => { await result.current.applyFilter('2030-03-10'); });

    act(() => result.current.setProfessional('María López'));

    expect(result.current.visibleBookings.map((b) => b._id)).toEqual(['2']);
  });

  it('counts the date refetch toast with the professional filter applied', async () => {
    const { result } = await loaded();
    act(() => result.current.setProfessional('María López'));

    await act(async () => { await result.current.applyFilter('2030-03-10'); });

    expect(toast.info).toHaveBeenCalledWith('Mostrando 1 reserva');
  });

  it('"Actualizar" (clearFilters) resets both the date and the professional', async () => {
    const { result } = await loaded();
    await act(async () => { await result.current.applyFilter('2030-03-10'); });
    act(() => result.current.setProfessional('María López'));

    await act(async () => { await result.current.clearFilters(); });

    await waitFor(() => expect(result.current.visibleBookings).toHaveLength(3));
    expect(result.current.filterDate).toBe('');
    expect(result.current.professional).toBe('');
  });
});

describe('useAdminData cancelBooking', () => {
  it('cancels by _id, reloads the dashboard and the list, and toasts the decoded name', async () => {
    const { result } = await loaded();
    cancelBooking.mockResolvedValue({});
    getStatistics.mockResolvedValue({ totalBookings: 2, totalRevenue: 0, todayBookings: 0 });
    const target = make('2', { client: { name: 'Ana &amp; Co', email: 'a@b.co' } });
    getBookings.mockClear();

    await act(async () => { await result.current.cancelBooking(target); });

    expect(cancelBooking).toHaveBeenCalledWith('2');
    expect(toast.info).toHaveBeenCalledWith('Cancelando reserva...');
    expect(getStatistics).toHaveBeenCalled();
    expect(getBookings.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(toast.success).toHaveBeenCalledWith('Reserva de Ana & Co cancelada');
  });

  it('toasts the error and does not claim success when the backend refuses', async () => {
    const { result } = await loaded();
    cancelBooking.mockRejectedValue(new Error('Backend roto'));

    await act(async () => { await result.current.cancelBooking(make('2')); });

    expect(toast.error).toHaveBeenCalledWith('Error cancelando reserva: Backend roto');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
