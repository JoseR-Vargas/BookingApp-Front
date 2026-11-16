import { expect } from '@playwright/test';
import { ADMIN_KEY } from '../../support/env.js';
import { AdminConfigPage } from './AdminConfigPage.js';

/** The admin "Reservas" list: filter a booking by client name, cancel it, watch live updates. */
export class AdminBookingsPage {
  constructor(page) {
    this.page = page;
    this.dialog = page.getByRole('alertdialog', { name: 'Cancelar reserva' });
    this.bell = page.getByRole('button', { name: 'Nuevas reservas' });
  }

  /** Logs in through the login form (user is free text, the password is the admin key) and opens "Reservas". */
  static async loginAndOpen(page) {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill(ADMIN_KEY);
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const bookings = new AdminBookingsPage(page);
    await bookings.openBookings();
    return bookings;
  }

  /**
   * Opens /admin in a new tab of the context with an authenticated session, on "Reservas". `socketReady`
   * resolves once socket.io finished its handshake (a long-poll GET with a session id answered 200), so a
   * test can emit a server event without racing the connection.
   */
  static async openAuthenticated(context) {
    const admin = await AdminConfigPage.open(context);
    const bookings = new AdminBookingsPage(admin.page);
    bookings.socketReady = admin.page.waitForResponse((response) => {
      const url = response.url();
      return url.includes('/socket.io/') && url.includes('sid=') && response.request().method() === 'GET'
        && response.status() === 200;
    });
    await bookings.openBookings();
    return bookings;
  }

  async openBookings() {
    await this.page.getByRole('link', { name: 'Reservas' }).click();
    await expect(this.page.getByRole('table', { name: 'Reservas' })).toBeVisible();
  }

  /** The table row of a client, found through the search box (the list is paginated). */
  async row(clientName) {
    await this.page.locator('#bookings-search').fill(clientName);
    return this.page.getByRole('row').filter({ hasText: clientName });
  }

  async askToCancel(row) {
    await row.getByRole('button', { name: 'Cancelar reserva' }).click();
    // The dialog root has no box of its own (its panel is fixed-positioned), so check its heading.
    await expect(this.dialog.getByRole('heading', { name: 'Cancelar reserva' })).toBeVisible();
  }

  async keepBooking() {
    await this.dialog.getByRole('button', { name: 'Volver' }).click();
    await expect(this.dialog).toHaveCount(0);
  }

  async confirmCancellation() {
    await this.dialog.getByRole('button', { name: 'Sí, cancelar' }).click();
  }

  toast(text) {
    return this.page.getByRole('alert').filter({ hasText: text }).first();
  }
}
