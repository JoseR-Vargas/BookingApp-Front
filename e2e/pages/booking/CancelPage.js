import { expect } from '@playwright/test';

/** The public cancel page a client reaches from the confirmation link: /cancelar/<token>. */
export class CancelPage {
  constructor(page) {
    this.page = page;
    this.cancelButton = page.getByRole('button', { name: 'Cancelar reserva', exact: true });
    this.dialog = page.getByRole('alertdialog', { name: 'Cancelar reserva' });
  }

  async open(token) {
    await this.page.goto(`/cancelar/${token}`);
    await expect(this.page.getByRole('heading', { name: 'Tu reserva', level: 1 })).toBeVisible();
  }

  title(text) {
    return this.page.getByRole('heading', { name: text, level: 2 });
  }

  /** Value of a summary row ("Servicios:", "Profesional:", "Fecha:", "Hora:"). */
  row(label) {
    return this.page.getByText(label, { exact: true }).locator('..');
  }

  async askToCancel() {
    await this.cancelButton.click();
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
}
