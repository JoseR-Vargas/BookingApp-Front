import { test as base, expect } from '@playwright/test';
import { APP_BACKEND_URL, BACKEND_ORIGIN, FRONT_PORT } from '../support/env.js';

// The app talks to http://localhost:3000 when served from localhost. The E2E backend listens elsewhere
// (so a developer's own backend on :3000 is never touched): redirect every such request at the network
// layer, for all pages of the context.
//
// socket.io also tries a WebSocket upgrade to that same hard-coded URL, and a WebSocket cannot be
// redirected by `route`. So every WebSocket except the Vite dev server's own HMR socket is closed: socket.io
// then stays on HTTP long-polling, which the redirect above carries to the E2E backend.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(`${APP_BACKEND_URL}/**`, (route) => route.continue({
      url: route.request().url().replace(APP_BACKEND_URL, BACKEND_ORIGIN),
    }));
    await context.routeWebSocket((url) => url.port !== String(FRONT_PORT), (ws) => ws.close());
    await use(context);
  },
});

export { expect };
