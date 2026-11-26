// Admin panel (guarded by RequireAuth in App.jsx). Port of legacy admin.html + admin-app.js.
// Sections are state-driven (no sub-routes), like the legacy show/hide of `.content-section`.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import BookingsSection from '../components/admin/BookingsSection.jsx';
import DashboardSection from '../components/admin/DashboardSection.jsx';
import ConfigSection from '../components/admin/config/ConfigSection.jsx';
import ReportsSection from '../components/admin/ReportsSection.jsx';
import Sidebar from '../components/admin/Sidebar.jsx';
import Topbar from '../components/admin/Topbar.jsx';
import { SECTION_TITLES } from '../components/admin/adminSections.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { useAdminData } from '../hooks/useAdminData.js';
import { useBookingNotifications } from '../hooks/useBookingNotifications.js';
import { authService } from '../services/authService.js';
import StorageNotice from '../components/admin/StorageNotice.jsx';
import PlatformSection from '../components/admin/PlatformSection.jsx';
import TrialBanner from '../components/admin/TrialBanner.jsx';
import { getSessionState } from '../services/adminService.js';
import { canConfigure, canWriteBookings } from '../components/admin/adminSections.js';
import { toast } from '../ui/toast.js';
import { useTenantPath } from '../tenancy/tenant-context.jsx';
import { formatBookingDate } from '../utils/format.js';
import { decodeEntities } from '../utils/sanitize.js';

// Legacy toggleSidebar: below this width the sidebar is an off-canvas drawer.
const MOBILE_MAX_WIDTH = 768;

export default function Admin() {
  const navigate = useNavigate();
  const tenantLink = useTenantPath();
  const role = authService.getRole();
  const canWrite = canWriteBookings(role);
  const [trial, setTrial] = useState(null);
  const [storage, setStorage] = useState(null);
  useEffect(() => {
    // The notice is a courtesy: if the state cannot be read the panel works without it.
    getSessionState().then((state) => {
      setTrial(state.trial);
      setStorage(state.storage);
    }).catch(() => {});
  }, []);
  const data = useAdminData();
  const { loadDashboard, loadBookings } = data;

  const [section, setSection] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // In-app confirmations. The delete target is kept after the dialog closes so the text does not
  // blank out during the fade-out; only `deleteOpen` decides visibility.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const notifications = useBookingNotifications(
    async () => {
      toast.success('Nueva reserva recibida!');
      await loadDashboard();
      if (section === 'bookings') await loadBookings();
    },
    // A client cancelled from their link: refresh what is on screen, no badge and no sound.
    async () => {
      toast.info('Un cliente canceló una reserva');
      await loadDashboard();
      if (section === 'bookings') await loadBookings();
    },
  );

  // Legacy init(): dashboard first, then the bookings list (the charts read the same data).
  useEffect(() => {
    (async () => {
      await loadDashboard();
      await loadBookings();
    })();
  }, [loadDashboard, loadBookings]);

  // At <= 768px the sidebar is an overlay drawer: the hamburger only opens/closes it. Toggling
  // `collapsed` there used to alternate the drawer between 70px and 260px and left a 70px gutter in
  // the content, so collapse is a desktop-only state.
  const toggleSidebar = () => {
    if (window.innerWidth <= MOBILE_MAX_WIDTH) setDrawerOpen((value) => !value);
    else setCollapsed((value) => !value);
  };

  // On mobile the sidebar is a modal drawer: picking a section must dismiss it, otherwise its
  // backdrop keeps blocking the page. Desktop sidebar state is left alone.
  const handleNavigate = (key) => {
    setSection(key);
    if (window.innerWidth <= MOBILE_MAX_WIDTH) setDrawerOpen(false);
  };

  const handleBellClick = () => {
    notifications.clearCount();
    setSection('bookings');
    loadBookings();
  };

  const handleLogout = () => {
    setLogoutOpen(false);
    authService.logout();
    navigate(tenantLink('/login'));
  };

  const requestDelete = (booking) => {
    setDeleteTarget(booking);
    setDeleteOpen(true);
  };

  // `deleteBooking` reports its own failures with a toast and never throws; the dialog closes either way.
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await data.deleteBooking(deleteTarget);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const requestCancel = (booking) => {
    setCancelTarget(booking);
    setCancelOpen(true);
  };

  // Like `confirmDelete`: `cancelBooking` reports its own failures with a toast and never throws.
  const confirmCancel = async () => {
    setCancelling(true);
    try {
      await data.cancelBooking(cancelTarget);
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const cancelName = decodeEntities(cancelTarget && cancelTarget.client && cancelTarget.client.name);
  const deleteName = decodeEntities(deleteTarget && deleteTarget.client && deleteTarget.client.name);

  return (
    <>
      <AdminLayout
        collapsed={collapsed}
        sidebar={(
          <Sidebar
            collapsed={collapsed}
            show={drawerOpen}
            section={section}
            onNavigate={handleNavigate}
            onShowChange={setDrawerOpen}
          />
        )}
        topbar={(
          <Topbar
            title={SECTION_TITLES[section] || SECTION_TITLES.dashboard}
            userName={authService.getUser() || 'Admin'}
            needsSoundActivation={notifications.needsSoundActivation}
            notificationCount={notifications.count}
            onToggleSidebar={toggleSidebar}
            onEnableSound={notifications.activateSound}
            onBellClick={handleBellClick}
            onLogout={() => setLogoutOpen(true)}
          />
        )}
      >
        <TrialBanner trial={trial} />
        <StorageNotice storage={storage} />
        {section === 'dashboard' && (
          <DashboardSection stats={data.stats} recentBookings={data.recentBookings} />
        )}
        {section === 'bookings' && (
          <BookingsSection
            bookings={data.visibleBookings}
            filterDate={data.filterDate}
            professionals={data.professionals}
            professional={data.professional}
            onProfessionalChange={data.setProfessional}
            totalRevenue={data.filteredRevenue}
            onFilterChange={data.applyFilter}
            onClearFilters={data.clearFilters}
            onDelete={canWrite ? requestDelete : undefined}
            onCancel={canWrite ? requestCancel : undefined}
          />
        )}
        {section === 'reports' && <ReportsSection bookings={data.bookings} />}
        {section === 'config' && canConfigure(role) && <ConfigSection />}
        {section === 'platform' && canConfigure(role) && <PlatformSection />}
      </AdminLayout>
      <ConfirmDialog
        open={logoutOpen}
        title="Cerrar sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
        confirmLabel="Cerrar sesión"
        cancelLabel="Cancelar"
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />
      <ConfirmDialog
        open={cancelOpen}
        variant="danger"
        busy={cancelling}
        title="Cancelar reserva"
        message={(
          <>
            <p>
              ¿Cancelar la reserva de {cancelName}
              {cancelTarget ? ` del ${formatBookingDate(cancelTarget.date)} a las ${cancelTarget.time}` : ''}?
            </p>
            <p className="mt-2">El horario quedará libre. La reserva se conserva en el historial.</p>
          </>
        )}
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        onConfirm={confirmCancel}
        onCancel={() => setCancelOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        variant="danger"
        busy={deleting}
        title="Eliminar reserva"
        message={(
          <>
            <p>¿Estás seguro de que quieres eliminar la reserva de {deleteName}?</p>
            <p className="mt-2">Esta acción no se puede deshacer.</p>
          </>
        )}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
