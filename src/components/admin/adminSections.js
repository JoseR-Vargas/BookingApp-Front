// Sections of the admin panel (state-driven, no sub-routes). Titles are the legacy `titles` map.

export const NAV_ITEMS = [
  { section: 'dashboard', label: 'Dashboard', icon: 'fas fa-tachometer-alt' },
  { section: 'bookings', label: 'Reservas', icon: 'fas fa-calendar-check' },
  { section: 'reports', label: 'Reportes', icon: 'fas fa-chart-bar' },
  { section: 'config', label: 'Configuración', icon: 'fas fa-cog' },
];

/** What each role may reach (spec 20). The backend is the authority: this only hides what would answer 403. */
export const canConfigure = (role) => role === 'owner';
export const canWriteBookings = (role) => role === 'owner' || role === 'staff';

/** The sections a role sees: only the owner has the configuration. */
export const navItemsFor = (role) => NAV_ITEMS.filter((item) => item.section !== 'config' || canConfigure(role));

export const SECTION_TITLES = {
  dashboard: 'Dashboard',
  bookings: 'Gestión de Reservas',
  reports: 'Reportes y Estadísticas',
  config: 'Configuración del Negocio',
};
