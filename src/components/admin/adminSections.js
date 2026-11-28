// Sections of the admin panel (state-driven, no sub-routes). Titles are the legacy `titles` map.

export const NAV_ITEMS = [
  { section: 'dashboard', label: 'Dashboard', icon: 'fas fa-tachometer-alt' },
  { section: 'bookings', label: 'Reservas', icon: 'fas fa-calendar-check' },
  { section: 'reports', label: 'Reportes', icon: 'fas fa-chart-bar' },
  { section: 'config', label: 'Configuración', icon: 'fas fa-cog' },
  { section: 'platform', label: 'Negocios', icon: 'fas fa-building' },
];

/** What each role may reach (spec 20). The backend is the authority: this only hides what would answer 403. */
export const canConfigure = (role) => role === 'owner';
export const canWriteBookings = (role) => role === 'owner' || role === 'staff';

/** The sections a role sees: only the owner has the configuration. */
export const navItemsFor = (role) =>
  NAV_ITEMS.filter((item) => {
    if (item.section === 'config') return canConfigure(role);
    // The businesses of the whole system are for the owner of the system.
    if (item.section === 'platform') return canConfigure(role);
    return true;
  });

/**
 * The section of the panel named in the URL (`/admin/negocios`). The panel was state-driven; now
 * the address works too, so a section can be shared or bookmarked. The name of the label is
 * accepted as well as the key of the section.
 */
const SECTION_ALIASES = { negocios: 'platform' };

export const sectionFromPath = (param) => {
  const name = String(param ?? '').trim().toLowerCase();
  if (!name) return 'dashboard';
  const key = SECTION_ALIASES[name] ?? name;
  return NAV_ITEMS.some((item) => item.section === key) ? key : 'dashboard';
};

export const SECTION_TITLES = {
  platform: 'Negocios de la plataforma',
  dashboard: 'Dashboard',
  bookings: 'Gestión de Reservas',
  reports: 'Reportes y Estadísticas',
  config: 'Configuración del Negocio',
};
