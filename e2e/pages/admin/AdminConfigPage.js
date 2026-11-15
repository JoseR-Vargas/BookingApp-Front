import { expect } from '@playwright/test';
import { ADMIN_KEY } from '../../support/env.js';

/** The admin panel: "Configuración" (professionals / services / schedule) and the bookings list. */
export class AdminConfigPage {
  constructor(page) {
    this.page = page;
  }

  /** Opens /admin in a new tab with an authenticated session (the login UI is covered by its own test). */
  static async open(context) {
    const page = await context.newPage();
    await page.addInitScript((key) => {
      sessionStorage.setItem('isAdmin', 'true');
      sessionStorage.setItem('adminUser', 'e2e');
      sessionStorage.setItem('adminKey', key);
    }, ADMIN_KEY);
    await page.goto('/admin');
    return new AdminConfigPage(page);
  }

  async openTab(tab) {
    await this.page.getByRole('link', { name: 'Configuración' }).click();
    await this.page.getByTestId(`config-tab-${tab}`).click();
  }

  async openBookings() {
    await this.page.getByRole('link', { name: 'Reservas' }).click();
  }

  row(kind, text) {
    return this.page.getByTestId(new RegExp(`^${kind}-row-`)).filter({ hasText: text });
  }

  async createProfessional({ name, specialty, experience }) {
    await this.page.getByRole('button', { name: 'Nuevo profesional' }).click();
    await this.page.getByTestId('professional-name-input').fill(name);
    await this.page.getByTestId('professional-specialty-input').fill(specialty);
    await this.page.getByTestId('professional-experience-input').fill(experience);
    await this.page.getByTestId('professional-save').click();
    await expect(this.row('professional', name)).toBeVisible();
  }

  async createService({ name, description, price, duration, professionalIds }) {
    await this.page.getByRole('button', { name: 'Nuevo servicio' }).click();
    await this.page.getByTestId('service-name-input').fill(name);
    await this.page.getByTestId('service-description-input').fill(description);
    await this.page.getByTestId('service-price-input').fill(String(price));
    await this.page.getByTestId('service-duration-input').fill(String(duration));
    for (const id of professionalIds) await this.page.getByTestId(`service-professional-${id}`).check();
    await this.page.getByTestId('service-save').click();
    await expect(this.row('service', name)).toBeVisible();
  }

  async saveSchedule() {
    await this.page.getByTestId('schedule-save').click();
  }
}
