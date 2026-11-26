// ===== CONFIGURACIÓN CENTRALIZADA =====
// Business data (professionals, services, opening hours) lives in the backend: see GET /api/catalog.
export const APP_CONFIG = {
    BACKEND_URL: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

        if (isLocalhost) {
            return 'http://localhost:3000';
        }
        // Producción: el mismo sitio. vercel.json reenvía /api y /socket.io al backend, así el
        // navegador ve un solo sitio y la cookie de sesión del admin viaja (spec 20).
        return window.location.origin;
    })(),

    TOAST_DURATION: 3000,
    ITEMS_PER_PAGE: 10,
};
