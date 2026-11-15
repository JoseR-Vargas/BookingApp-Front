import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({ saveSchedule: vi.fn() }));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { saveSchedule } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import ScheduleTab from './ScheduleTab.jsx';

let onChanged;

function setup() {
  onChanged = vi.fn();
  render(<ScheduleTab schedule={SCHEDULE} onChanged={onChanged} />);
  return userEvent.setup();
}

const weeklyWith = (overrides) => ({ ...SCHEDULE.weekly, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ScheduleTab form', () => {
  it('renders the 7 days with the current hours; Sunday is closed and its selects are disabled', () => {
    setup();

    expect(screen.getByTestId('schedule-open-1')).toHaveValue('09:00');
    expect(screen.getByTestId('schedule-close-1')).toHaveValue('20:00');
    expect(screen.getByTestId('schedule-close-6')).toHaveValue('18:00');
    expect(screen.getByTestId('schedule-closed-0')).toBeChecked();
    expect(screen.getByTestId('schedule-open-0')).toBeDisabled();
    expect(screen.getByTestId('schedule-closed-1')).not.toBeChecked();
    for (let day = 0; day <= 6; day += 1) {
      expect(screen.getByTestId(`schedule-open-${day}`)).toBeInTheDocument();
    }
  });

  it('offers 30-minute steps from 00:00 to 23:30 and has accessible labels bound to the controls', () => {
    setup();

    const options = within(screen.getByTestId('schedule-open-1')).getAllByRole('option').map((option) => option.value);
    expect(options).toHaveLength(48);
    expect(options[0]).toBe('00:00');
    expect(options[1]).toBe('00:30');
    expect(options[47]).toBe('23:30');
    expect(screen.getByLabelText('Apertura Lunes')).toBe(screen.getByTestId('schedule-open-1'));
    expect(screen.getByLabelText('Cierre Lunes')).toBe(screen.getByTestId('schedule-close-1'));
    expect(screen.getByLabelText('Cerrado Lunes')).toBe(screen.getByTestId('schedule-closed-1'));
  });
});

describe('ScheduleTab save', () => {
  it('sends the 7 days (closed or open/close) and toasts success without a warning', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.selectOptions(screen.getByTestId('schedule-close-6'), '16:30');
    await user.click(screen.getByTestId('schedule-closed-5'));
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule).toHaveBeenCalledWith({
      0: { closed: true },
      1: { closed: false, open: '09:00', close: '20:00' },
      2: { closed: false, open: '09:00', close: '20:00' },
      3: { closed: false, open: '09:00', close: '20:00' },
      4: { closed: false, open: '09:00', close: '20:00' },
      5: { closed: true },
      6: { closed: false, open: '09:00', close: '16:30' },
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByTestId('schedule-warning')).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('reopens a closed day with usable hours', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.click(screen.getByTestId('schedule-closed-0'));
    expect(screen.getByTestId('schedule-open-0')).toBeEnabled();
    await user.click(screen.getByTestId('schedule-save'));

    const weekly = saveSchedule.mock.calls[0][0];
    expect(weekly[0].closed).toBe(false);
    expect(weekly[0].open < weekly[0].close).toBe(true);
  });

  it('warns with the number of affected future bookings (and does not toast success)', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 3 });

    await user.click(screen.getByTestId('schedule-save'));

    const warning = await screen.findByTestId('schedule-warning');
    expect(warning).toHaveTextContent('3 reservas futuras quedan fuera del nuevo horario. No se modificaron.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('uses the singular for one affected booking', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 1 });

    await user.click(screen.getByTestId('schedule-save'));

    expect(await screen.findByTestId('schedule-warning')).toHaveTextContent(
      '1 reserva futura queda fuera del nuevo horario. No se modificó.',
    );
  });

  it('blocks open >= close on the client without calling the backend', async () => {
    const user = setup();

    await user.selectOptions(screen.getByTestId('schedule-open-1'), '20:00');
    await user.click(screen.getByTestId('schedule-save'));

    expect(screen.getByTestId('schedule-error')).toHaveTextContent('Lunes: la apertura debe ser anterior al cierre');
    expect(saveSchedule).not.toHaveBeenCalled();
  });

  it('shows the backend 400 message', async () => {
    const user = setup();
    saveSchedule.mockRejectedValue(new Error('day 1: open must be earlier than close'));

    await user.click(screen.getByTestId('schedule-save'));

    expect(await screen.findByTestId('schedule-error')).toHaveTextContent('day 1: open must be earlier than close');
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByTestId('schedule-save')).toBeEnabled();
  });

  it('disables the save button with a spinner label while saving', async () => {
    const user = setup();
    saveSchedule.mockImplementation(() => new Promise(() => {}));

    await user.click(screen.getByTestId('schedule-save'));

    expect(screen.getByTestId('schedule-save')).toBeDisabled();
    expect(screen.getByTestId('schedule-save')).toHaveTextContent('Guardando...');
  });

  it('clears a previous warning when the user edits again', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 2 });
    await user.click(screen.getByTestId('schedule-save'));
    await screen.findByTestId('schedule-warning');

    await user.click(screen.getByTestId('schedule-closed-2'));

    expect(screen.queryByTestId('schedule-warning')).not.toBeInTheDocument();
  });
});

describe('ScheduleTab reflects a saved schedule', () => {
  it('re-syncs the form when the parent hands over a new schedule', () => {
    const { rerender } = render(<ScheduleTab schedule={SCHEDULE} onChanged={() => {}} />);
    const next = { ...SCHEDULE, weekly: weeklyWith({ 1: { closed: true } }) };

    rerender(<ScheduleTab schedule={next} onChanged={() => {}} />);

    expect(screen.getByTestId('schedule-closed-1')).toBeChecked();
  });
});
