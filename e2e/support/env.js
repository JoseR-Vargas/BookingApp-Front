// Single source of truth for the E2E stack. Everything here is deliberately hard-coded: the suite must
// never be pointed at a real database or a real mail/WhatsApp account through the environment.

// Throwaway MongoDB (Docker container `booking-e2e-mongo`). Never the real MONGO_URI.
export const MONGO_URI = 'mongodb://localhost:27018/booking_e2e';
export const ADMIN_KEY = 'e2e-test-admin-key';

// Ports differ from the dev defaults (3000 / 5173) so the suite never attaches to a developer's servers.
export const BACKEND_PORT = 3100;
export const FRONT_PORT = 5174;
export const BACKEND_ORIGIN = `http://localhost:${BACKEND_PORT}`;
export const FRONT_URL = `http://localhost:${FRONT_PORT}`;

// The frontend hard-codes this backend URL when it is served from localhost (src/config/appConfig.js).
// The `context` fixture redirects it to BACKEND_ORIGIN.
export const APP_BACKEND_URL = 'http://localhost:3000';

// Every variable that could reach an external service is blank. The backend also starts from a working
// directory without a `.env`, and with outbound connections to non-loopback hosts blocked.
export const BACKEND_ENV = {
  MONGO_URI,
  ADMIN_API_KEY: ADMIN_KEY,
  PORT: String(BACKEND_PORT),
  NODE_ENV: 'development',
  // The sign-up e2e creates several businesses from one IP: the per-hour limit must not get in its way.
  SIGNUP_RATE_LIMIT_MAX: '1000',
  // The fake payment gateway (spec 23): the e2e signs its own webhooks with this secret.
  PAYMENT_GATEWAY: 'fake',
  PAYMENT_WEBHOOK_SECRET: 'e2e-payment-secret',
  // The reminders (spec 24): the simulator sender and a round every three seconds.
  REMINDERS_SENDER: 'fake',
  REMINDERS_INTERVAL_MINUTES: '0.05',
  // The key of the owner of the system (spec 25): the e2e signs its own platform calls with it.
  PLATFORM_API_KEY: 'e2e-platform-key',
  BUSINESS_TIMEZONE: 'UTC',
  // Booking cancellation: the link in emails points at the E2E front; no admin WhatsApp notice is sent.
  PUBLIC_APP_URL: FRONT_URL,
  WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME: '',
  GMAIL_USER: '',
  GMAIL_APP_PASSWORD: '',
  MAIL_FROM: '',
  WHATSAPP_ACCESS_TOKEN: '',
  WHATSAPP_PHONE_NUMBER_ID: '',
  WHATSAPP_APP_SECRET: '',
  WHATSAPP_VERIFY_TOKEN: '',
  WHATSAPP_API_VERSION: '',
  ADMIN_WHATSAPP_NUMBER: '',
  WHATSAPP_ADMIN_TEMPLATE_NAME: '',
  WHATSAPP_ADMIN_TEMPLATE_LANG: '',
};

// Fake client data: RFC 2606 `.invalid` addresses can never be delivered.
export const FAKE_EMAIL_DOMAIN = 'example.invalid';
