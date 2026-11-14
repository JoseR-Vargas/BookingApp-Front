import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog.jsx';

function setup(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Eliminar reserva"
      message="¿Seguro?"
      confirmLabel="Eliminar"
      cancelLabel="Cancelar"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is an alert dialog labelled by its title and described by its message', () => {
    setup();

    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar reserva' });
    expect(dialog).toHaveAccessibleDescription('¿Seguro?');
  });

  it('accepts a node as the message', () => {
    setup({ message: <><p>Primera línea</p><p>Segunda línea</p></> });

    expect(screen.getByText('Primera línea')).toBeInTheDocument();
    expect(screen.getByText('Segunda línea')).toBeInTheDocument();
  });

  it('renders real type="button" buttons with the given labels', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveAttribute('type', 'button');
  });

  it('puts the initial focus on Cancel (the safe choice)', async () => {
    setup();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  });

  it('calls onCancel (and never onConfirm) when Cancel is clicked', async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm (and never onCancel) when Confirm is clicked', async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel on Escape', async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when the backdrop is clicked, but not when the panel is', async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByText('¿Seguro?'));
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('traps Tab focus between its two buttons', async () => {
    setup();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Eliminar' });
    await waitFor(() => expect(cancel).toHaveFocus());

    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
  });

  it('uses the error color for the danger variant and the primary one otherwise', () => {
    const { unmount } = render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Sí" variant="danger" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Sí' }).className).toContain('bg-error');
    unmount();

    render(<ConfirmDialog open title="T" message="M" confirmLabel="Sí" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sí' }).className).toContain('bg-primary');
  });

  it('falls back to generic labels', () => {
    render(<ConfirmDialog open title="T" message="M" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  describe('busy', () => {
    it('disables both buttons so the action cannot be submitted twice', async () => {
      const { onConfirm, onCancel } = setup({ busy: true });
      const confirm = screen.getByRole('button', { name: 'Eliminar' });

      expect(confirm).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      await userEvent.click(confirm);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('ignores Escape and backdrop clicks while busy', async () => {
      const { onCancel } = setup({ busy: true });

      await userEvent.keyboard('{Escape}');
      await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'));

      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
