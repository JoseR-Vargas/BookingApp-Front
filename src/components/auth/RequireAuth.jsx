import { Navigate } from 'react-router-dom';
import { authService } from '../../services/authService.js';
import { useTenantPath } from '../../tenancy/tenant-context.jsx';

/**
 * Route guard for the admin panel. The legacy page redirected to login.html when the
 * `isAdmin` session flag was missing; here the visitor is sent to /login instead.
 * `replace` keeps the guarded URL out of the history, so Back does not bounce the user around.
 */
export default function RequireAuth({ children }) {
  const tenantLink = useTenantPath();
  if (!authService.isAuthenticated()) {
    return <Navigate to={tenantLink('/login')} replace />;
  }
  return children;
}
