// ===== DATOS DEL PANEL ADMIN =====
// Data + actions of the admin panel (port of the loading/filter/delete logic of legacy admin-app.js).
// There is ONE bookings list (the latest fetch); the "recent" table, the filtered table, the filtered
// revenue and the charts are all derived from it, so every view always shows the same data.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  cancelBooking as cancelBookingRequest,
  deleteBooking as deleteBookingRequest,
  getBookings,
  getStatistics,
} from '../services/adminService.js';
import { toast } from '../ui/toast.js';
import {
  filterByDate,
  filterByProfessional,
  getProfessionalNames,
  getRecentBookings,
  sumConfirmedRevenue,
} from '../utils/adminStats.js';
import { decodeEntities } from '../utils/sanitize.js';

const EMPTY_STATS = { totalBookings: 0, totalRevenue: 0, todayBookings: 0 };

export function useAdminData() {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [bookings, setBookings] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  // Additive filter (not in the legacy panel): '' means every professional.
  const [professional, setProfessionalState] = useState('');
  // `applyFilter` is a stable callback but its toast must count with the CURRENT professional.
  const professionalRef = useRef('');

  const updateStatistics = useCallback(async () => {
    try {
      const data = await getStatistics();
      setStats({
        totalBookings: data.totalBookings || 0,
        totalRevenue: data.totalRevenue || 0,
        todayBookings: data.todayBookings || 0,
      });
    } catch (error) {
      toast.error('Error cargando estadísticas');
    }
  }, []);

  const loadRecentBookings = useCallback(async () => {
    try {
      setBookings(await getBookings());
    } catch (error) {
      toast.error('Error cargando reservas recientes');
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      await updateStatistics();
      await loadRecentBookings();
    } catch (error) {
      toast.error('Error cargando datos del dashboard');
    }
  }, [updateStatistics, loadRecentBookings]);

  const loadBookings = useCallback(async () => {
    try {
      const loaded = await getBookings();
      setBookings(loaded);
      // The list is returned so the caller can mark its ids as known (the poll).
      return loaded;
    } catch (error) {
      toast.error('Error cargando reservas');
      return [];
    }
  }, []);

  // Legacy refetched on every date change and filtered the fresh result.
  const applyFilter = useCallback(async (date) => {
    setFilterDate(date);
    try {
      const all = await getBookings();
      setBookings(all);
      const count = filterByProfessional(filterByDate(all, date), professionalRef.current).length;
      toast.info('Mostrando ' + count + ' reserva' + (count !== 1 ? 's' : ''));
    } catch (error) {
      toast.error('Error aplicando filtros');
    }
  }, []);

  const setProfessional = useCallback((name) => {
    professionalRef.current = name;
    setProfessionalState(name);
  }, []);

  const clearFilters = useCallback(async () => {
    setFilterDate('');
    setProfessional('');
    await loadBookings();
    toast.info('Filtros limpiados');
  }, [loadBookings, setProfessional]);

  // Receives the booking object (never HTML strings): the id comes straight from the data.
  // Performs the deletion directly: the caller owns the confirmation step (see ConfirmDialog).
  const deleteBooking = useCallback(async (booking) => {
    // Stored names are HTML-escaped by the legacy sender; show the readable text.
    const name = decodeEntities(booking.client && booking.client.name);
    try {
      toast.info('Eliminando reserva...');
      await deleteBookingRequest(booking._id);
      await loadDashboard();
      await loadBookings();
      toast.success('Reserva de ' + name + ' eliminada exitosamente');
    } catch (error) {
      toast.error('Error eliminando reserva: ' + error.message);
    }
  }, [loadDashboard, loadBookings]);

  // Frees the slot but keeps the booking in the history. The caller owns the confirmation step.
  const cancelBooking = useCallback(async (booking) => {
    const name = decodeEntities(booking.client && booking.client.name);
    try {
      toast.info('Cancelando reserva...');
      await cancelBookingRequest(booking._id);
      await loadDashboard();
      await loadBookings();
      toast.success('Reserva de ' + name + ' cancelada');
    } catch (error) {
      toast.error('Error cancelando reserva: ' + error.message);
    }
  }, [loadDashboard, loadBookings]);

  const recentBookings = useMemo(() => getRecentBookings(bookings, 5), [bookings]);
  const visibleBookings = useMemo(
    () => filterByProfessional(filterByDate(bookings, filterDate), professional),
    [bookings, filterDate, professional],
  );
  // Options come from every booking, so they stay stable while the other filters change.
  const professionals = useMemo(() => getProfessionalNames(bookings), [bookings]);
  const filteredRevenue = useMemo(() => sumConfirmedRevenue(visibleBookings), [visibleBookings]);

  return {
    stats,
    bookings,
    recentBookings,
    visibleBookings,
    filteredRevenue,
    filterDate,
    professional,
    professionals,
    setProfessional,
    loadDashboard,
    loadBookings,
    applyFilter,
    clearFilters,
    deleteBooking,
    cancelBooking,
  };
}
