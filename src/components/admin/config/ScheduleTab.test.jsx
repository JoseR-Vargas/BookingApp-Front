import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE, SERVICES } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({ saveSchedule: vi.fn(), saveLocationSchedule: vi.fn() }));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { saveLocationSchedule, saveSchedule } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import ScheduleTab from './ScheduleTab.jsx';

let onChanged;

function setup(props = {}) {
  onChanged = vi.fn();
  render(<ScheduleTab schedule={SCHEDULE} services={SERVICES} onChanged={onChanged} {...props} />);
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
    }, 30);
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


describe('ScheduleTab start interval', () => {
  const interval = () => screen.getByTestId('schedule-interval');
  const preview = () => screen.getByTestId('schedule-interval-preview');

  it('has a labeled "Intervalo entre turnos" selector from 30 minutes to 8 hours in 30-minute steps', () => {
    setup();

    expect(screen.getByLabelText('Intervalo entre turnos')).toBe(interval());
    const options = within(interval()).getAllByRole('option');
    expect(options).toHaveLength(16);
    expect(options.map((option) => option.value)).toEqual(Array.from({ length: 16 }, (_, index) => String((index + 1) * 30)));
    expect(options.slice(0, 4).map((option) => option.textContent)).toEqual(['30 min', '1 h', '1 h 30 min', '2 h']);
    expect(options[15].textContent).toBe('8 h');
  });

  it('defaults to 30 minutes for a schedule without the field, and shows the saved value otherwise', () => {
    const first = render(<ScheduleTab schedule={SCHEDULE} services={SERVICES} onChanged={() => {}} />);
    expect(interval()).toHaveValue('30');
    first.unmount();

    render(<ScheduleTab schedule={{ ...SCHEDULE, startIntervalMinutes: 180 }} services={SERVICES} onChanged={() => {}} />);
    expect(interval()).toHaveValue('180');
  });

  it('hints the duration of the longest service', () => {
    setup();

    expect(screen.getByText('Tu servicio más largo dura 90 min.')).toBeInTheDocument();
  });

  it('shows no hint when there are no services', () => {
    setup({ services: [] });

    expect(screen.queryByText(/Tu servicio más largo/)).not.toBeInTheDocument();
  });

  it('previews the start times of the first open day and follows the chosen interval', async () => {
    const user = setup();

    expect(preview()).toHaveTextContent('Lunes');
    expect(preview()).toHaveTextContent('09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30');

    await user.selectOptions(interval(), '180');

    expect(preview()).toHaveTextContent('09:00, 12:00, 15:00, 18:00');
    expect(preview()).not.toHaveTextContent('09:30');
  });

  it('follows the opening hour edited in the same form', async () => {
    const user = setup();

    await user.selectOptions(screen.getByTestId('schedule-open-1'), '10:30');
    await user.selectOptions(interval(), '60');

    expect(preview()).toHaveTextContent('10:30, 11:30, 12:30');
  });

  it('says so when every day is closed', async () => {
    const closed = { ...SCHEDULE, weekly: Object.fromEntries(Object.keys(SCHEDULE.weekly).map((day) => [day, { closed: true }])) };
    setup({ schedule: closed });

    expect(preview()).toHaveTextContent('No hay días abiertos');
  });

  it('saves the chosen interval together with the hours', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.selectOptions(interval(), '180');
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule).toHaveBeenCalledWith(expect.objectContaining({ 1: { closed: false, open: '09:00', close: '20:00' } }), 180);
  });

  it('re-syncs the selector when the parent hands over a new schedule', () => {
    const { rerender } = render(<ScheduleTab schedule={SCHEDULE} services={SERVICES} onChanged={() => {}} />);

    rerender(<ScheduleTab schedule={{ ...SCHEDULE, startIntervalMinutes: 120 }} services={SERVICES} onChanged={() => {}} />);

    expect(interval()).toHaveValue('120');
  });
});

describe('ScheduleTab starts per day', () => {
  const custom = (id) => screen.getByTestId(`schedule-custom-${id}`);
  const chip = (id, time) => screen.getByTestId(`schedule-start-${id}-${time}`);
  const withMonday = (starts) => ({
    ...SCHEDULE,
    weekly: { ...SCHEDULE.weekly, 1: { closed: false, open: '09:00', close: '20:00', starts } },
  });

  it('shows no chips until a day is customized, and none for a closed day', () => {
    setup();

    expect(custom(1)).not.toBeChecked();
    expect(screen.queryByTestId('schedule-start-1-09:00')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-custom-0')).not.toBeInTheDocument();
  });

  it('customizing starts from the times the interval offers, one chip per 30 minutes of the day', async () => {
    const user = setup();

    await user.selectOptions(screen.getByTestId('schedule-interval'), '180');
    await user.click(custom(1));

    expect(chip(1, '09:00')).toBeChecked();
    expect(chip(1, '12:00')).toBeChecked();
    expect(chip(1, '09:30')).not.toBeChecked();
    expect(chip(1, '19:30')).not.toBeChecked();
    expect(screen.queryByTestId('schedule-start-1-20:00')).not.toBeInTheDocument();
  });

  it('loads the saved list of a day', () => {
    setup({ schedule: withMonday(['09:00', '14:00']) });

    expect(custom(1)).toBeChecked();
    expect(chip(1, '14:00')).toBeChecked();
    expect(chip(1, '09:30')).not.toBeChecked();
    expect(custom(2)).not.toBeChecked();
  });

  it('saves the marked starts of that day only, sorted; other days send none', async () => {
    const user = setup();
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.selectOptions(screen.getByTestId('schedule-interval'), '180');
    await user.click(custom(1));
    await user.click(chip(1, '16:00'));
    await user.click(chip(1, '12:00'));
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    const [weekly] = saveSchedule.mock.calls[0];
    expect(weekly[1].starts).toEqual(['09:00', '15:00', '16:00', '18:00']);
    expect(weekly[2]).toEqual({ closed: false, open: '09:00', close: '20:00' });
  });

  it('"Usar el intervalo general" (unchecking) sends the day without a list', async () => {
    const user = setup({ schedule: withMonday(['10:00']) });
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.click(custom(1));
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule.mock.calls[0][0][1]).toEqual({ closed: false, open: '09:00', close: '20:00' });
  });

  it('blocks saving a customized day with no starts marked', async () => {
    const user = setup({ schedule: withMonday(['10:00']) });

    await user.click(chip(1, '10:00'));
    await user.click(screen.getByTestId('schedule-save'));

    expect(saveSchedule).not.toHaveBeenCalled();
    expect(screen.getByTestId('schedule-error')).toHaveTextContent('Lunes: marca al menos una hora o usa el intervalo general');
  });

  it('drops the starts left outside when the hours of the day change', async () => {
    const user = setup({ schedule: withMonday(['09:00', '12:00', '18:00']) });
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.selectOptions(screen.getByTestId('schedule-close-1'), '15:00');
    expect(screen.queryByTestId('schedule-start-1-18:00')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule.mock.calls[0][0][1].starts).toEqual(['09:00', '12:00']);
  });

  it('copies the starts of a day to the other open days, keeping only what fits their hours', async () => {
    const user = setup({ schedule: withMonday(['09:00', '12:00', '19:00']) });
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    await user.click(screen.getByTestId('schedule-copy-1'));
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    const [weekly] = saveSchedule.mock.calls[0];
    expect(weekly[2].starts).toEqual(['09:00', '12:00', '19:00']);
    expect(weekly[4].starts).toEqual(['09:00', '12:00', '19:00']);
    expect(weekly[6].starts).toEqual(['09:00', '12:00']); // Saturday closes at 17:30
    expect(weekly[0]).toEqual({ closed: true });
  });

  it('previews the first open day with its own list', () => {
    setup({ schedule: withMonday(['09:00', '12:00', '16:00']) });

    expect(screen.getByTestId('schedule-interval-preview')).toHaveTextContent('09:00, 12:00, 16:00');
    expect(screen.getByTestId('schedule-interval-preview')).not.toHaveTextContent('09:30');
  });
});

describe('ScheduleTab with several locations (SPEC 08)', () => {
  const centro = {
    ...SCHEDULE,
    startIntervalMinutes: 60,
    weekly: { ...SCHEDULE.weekly, 1: { closed: false, open: '10:00', close: '14:00' } },
  };
  const LOCATIONS = [
    { id: 'principal', name: 'Principal', address: 'Calle 1', active: true, schedule: SCHEDULE },
    { id: 'centro', name: 'Centro', address: '', active: true, schedule: centro },
    { id: 'viejo', name: 'Viejo', address: '', active: false, schedule: SCHEDULE },
  ];

  it('has no selector with a single location, and saves through the default schedule route', async () => {
    const user = setup({ locations: [LOCATIONS[0]] });
    saveSchedule.mockResolvedValue({ schedule: SCHEDULE, affectedBookings: 0 });

    expect(screen.queryByLabelText('Local')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveLocationSchedule).not.toHaveBeenCalled();
  });

  it('offers the active locations and shows the hours of the chosen one', async () => {
    const user = setup({ locations: LOCATIONS });

    const selector = screen.getByLabelText('Local');
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual(['Principal — Calle 1', 'Centro']);
    expect(screen.getByTestId('schedule-open-1')).toHaveValue('09:00');

    await user.selectOptions(selector, 'centro');

    expect(screen.getByTestId('schedule-open-1')).toHaveValue('10:00');
    expect(screen.getByTestId('schedule-close-1')).toHaveValue('14:00');
    expect(screen.getByTestId('schedule-interval')).toHaveValue('60');
  });

  it('saves the schedule of the chosen location only', async () => {
    const user = setup({ locations: LOCATIONS });
    saveLocationSchedule.mockResolvedValue({ schedule: centro, affectedBookings: 0 });

    await user.selectOptions(screen.getByLabelText('Local'), 'centro');
    await user.selectOptions(screen.getByTestId('schedule-close-1'), '15:00');
    await user.click(screen.getByTestId('schedule-save'));

    await waitFor(() => expect(saveLocationSchedule).toHaveBeenCalledTimes(1));
    const [id, weekly, interval] = saveLocationSchedule.mock.calls[0];
    expect(id).toBe('centro');
    expect(weekly[1]).toEqual({ closed: false, open: '10:00', close: '15:00' });
    expect(interval).toBe(60);
    expect(saveSchedule).not.toHaveBeenCalled();
  });

  it('keeps the chosen location after the parent reloads the catalog', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ScheduleTab schedule={SCHEDULE} locations={LOCATIONS} services={SERVICES} onChanged={() => {}} />);
    await user.selectOptions(screen.getByLabelText('Local'), 'centro');

    // A refresh hands over fresh objects for the same data.
    rerender(<ScheduleTab schedule={SCHEDULE} locations={LOCATIONS.map((location) => ({ ...location }))} services={SERVICES} onChanged={() => {}} />);

    expect(screen.getByLabelText('Local')).toHaveValue('centro');
    expect(screen.getByTestId('schedule-open-1')).toHaveValue('10:00');
  });
});
