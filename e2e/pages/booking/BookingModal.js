import { expect } from '@playwright/test';

const READY_TEXT = /^(Selecciona una hora \(|No hay horarios|Cerrado)/;

/** The public booking flow: home page "Reservar Cita" button -> 3-step modal -> confirmation. */
export class BookingModal {
  constructor(page) {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: 'Reservar tu Cita' });
    this.timeField = this.dialog.locator('select[aria-label="Hora de la cita"]');
  }

  async open() {
    await this.page.goto('/');
    await this.page.getByRole('button', { name: 'Reservar Cita', exact: true }).first().click();
    // The dialog root has no box of its own (its panel is fixed-positioned), so check its heading.
    await expect(this.dialog.getByRole('heading', { name: 'Reservar tu Cita' })).toBeVisible();
  }

  serviceCard(serviceId) {
    return this.dialog.getByTestId(`service-card-${serviceId}`);
  }

  professionalCard(professionalId) {
    return this.dialog.getByTestId(`professional-card-${professionalId}`);
  }

  async next() {
    await this.dialog.getByRole('button', { name: /Siguiente/ }).click();
  }

  async chooseService(serviceId) {
    await this.serviceCard(serviceId).click();
    await this.next();
  }

  // The date field is a read-only calendar input; its documented test hook is a native `change` event.
  async setDate(isoDate) {
    await this.dialog.locator('input[aria-label="Fecha de la cita"]').evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, isoDate);
  }

  /** Free start times offered for the chosen date, service and professional ('HH:MM'). */
  async slots() {
    await expect(this.timeField.locator('option').first()).toHaveText(READY_TEXT);
    return (await this.timeField.locator('option').allTextContents()).filter((text) => /^\d\d:\d\d$/.test(text));
  }

  async pickTime(time) {
    await this.dialog.getByRole('button', { name: 'Hora de la cita' }).click();
    await this.dialog.getByRole('option', { name: time, exact: true }).click();
  }

  async fillClient({ name, email, phone }) {
    await this.dialog.locator('input[name="name"]').fill(name);
    await this.dialog.locator('input[name="email"]').fill(email);
    await this.dialog.locator('input[name="phone"]').fill(phone);
    await this.dialog.locator('input[name="terms"]').check();
  }

  /** Submits step 3 and dismisses the confirmation dialog. */
  async confirm() {
    await this.dialog.getByRole('button', { name: 'Confirmar Reserva' }).click();
    const confirmation = this.page.getByRole('dialog', { name: '¡Reserva Confirmada!' });
    await expect(confirmation.getByRole('heading', { name: '¡Reserva Confirmada!' })).toBeVisible();
    await confirmation.getByRole('button', { name: /Entendido/ }).click();
    await expect(confirmation).toHaveCount(0);
  }
}
