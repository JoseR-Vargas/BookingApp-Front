// ===== CONFIGURACIÓN CENTRALIZADA =====
// Business data (professionals, services, opening hours) lives in the backend: see GET /api/catalog.
export const APP_CONFIG = {
    BACKEND_URL: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

        if (isLocalhost) {
            return 'http://localhost:3000';
        }
        // Producción: cualquier dominio que no sea localhost usa el backend de Vercel
        return 'https://booking-app-back.vercel.app';
    })(),

    TOAST_DURATION: 3000,
    ITEMS_PER_PAGE: 10,
};
