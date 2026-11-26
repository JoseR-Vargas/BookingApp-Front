import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Availability from './pages/Availability.jsx';
import CancelBooking from './pages/CancelBooking.jsx';
import Login from './pages/Login.jsx';
import RequireAuth from './components/auth/RequireAuth.jsx';
import TenantLayout from './tenancy/TenantLayout.jsx';

// The panel (charts + socket client) is only needed by the admin: keep it out of the public bundle.
const Admin = lazy(() => import('./pages/Admin.jsx'));

export default function App() {
  return (
    <Routes>
      {/* The default business keeps the plain routes; every other one lives under /n/<slug>. */}
      <Route path="/" element={<Home />} />
      <Route path="/disponibilidad" element={<Availability />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cancelar/:token" element={<CancelBooking />} />
      <Route
        path="/admin"
        element={(
          <RequireAuth>
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          </RequireAuth>
        )}
      />

      <Route path="/n/:slug" element={<TenantLayout />}>
        <Route index element={<Home />} />
        <Route path="disponibilidad" element={<Availability />} />
        <Route path="login" element={<Login />} />
        <Route path="cancelar/:token" element={<CancelBooking />} />
        <Route
          path="admin"
          element={(
            <RequireAuth>
              <Suspense fallback={null}>
                <Admin />
              </Suspense>
            </RequireAuth>
          )}
        />
      </Route>

      {/* Legacy static URLs keep working (bookmarks, links shared before the migration). */}
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="/login.html" element={<Navigate to="/login" replace />} />
      <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
