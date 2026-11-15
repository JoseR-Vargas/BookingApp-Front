import { test as base, expect } from '@playwright/test';
import { APP_BACKEND_URL, BACKEND_ORIGIN } from '../support/env.js';

// The app talks to http://localhost:3000 when served from localhost. The E2E backend listens elsewhere
// (so a developer's own backend on :3000 is never touched): redirect every such request at the network
// layer, for all pages of the context.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(`${APP_BACKEND_URL}/**`, (route) => route.continue({
      url: route.request().url().replace(APP_BACKEND_URL, BACKEND_ORIGIN),
    }));
    await use(context);
  },
});

export { expect };
