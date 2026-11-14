import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingProvider, bookingReducer, initialBookingState, useBooking } from './bookingState.jsx';

const SERVICE = { id: 'servicio-basico', name: 'Servicio Básico', price: 1200, duration: 60, professionals: ['alex-garcia'] };
const OTHER_SERVICE = { id: 'servicio-premium', name: 'Servicio Premium', price: 2500, duration: 90, professionals: ['alex-garcia', 'maria-lopez'] };
const PROFESSIONAL = { id: 'alex-garcia', name: 'Alex García' };

const setup = () => renderHook(() => useBooking(), { wrapper: BookingProvider });

describe('bookingReducer', () => {
  it('starts like the legacy bookingState', () => {
    expect(initialBookingState).toEqual({
      currentStep: 1,
      selectedServices: [],
      selectedDate: null,
      selectedTime: null,
      selectedProfessional: null,
      isSubmitting: false,
    });
  });

  it('ignores unknown actions', () => {
    expect(bookingReducer(initialBookingState, { type: 'nope' })).toBe(initialBookingState);
  });
});

describe('useBooking', () => {
  it('exposes the initial state and an invalid selection', () => {
    const { result } = setup();

    expect(result.current.state).toEqual(initialBookingState);
    expect(result.current.isValid()).toBe(false);
  });

  it('sets every field through its action', () => {
    const { result } = setup();

    act(() => {
      result.current.toggleService(SERVICE);
      result.current.setDate('2030-03-04');
      result.current.setTime('11:00');
      result.current.setProfessional(PROFESSIONAL);
      result.current.setStep(2);
      result.current.setSubmitting(true);
    });

    expect(result.current.state).toEqual({
      currentStep: 2,
      selectedServices: [SERVICE],
      selectedDate: '2030-03-04',
      selectedTime: '11:00',
      selectedProfessional: PROFESSIONAL,
      isSubmitting: true,
    });
  });

  it('isValid needs at least one service, date, time and professional', () => {
    const { result } = setup();

    act(() => {
      result.current.toggleService(SERVICE);
      result.current.setDate('2030-03-04');
      result.current.setTime('11:00');
    });
    expect(result.current.isValid()).toBe(false);

    act(() => result.current.setProfessional(PROFESSIONAL));
    expect(result.current.isValid()).toBe(true);

    act(() => result.current.setTime(null));
    expect(result.current.isValid()).toBe(false);
  });

  it('reset brings back the initial state', () => {
    const { result } = setup();
    act(() => {
      result.current.toggleService(SERVICE);
      result.current.setStep(3);
      result.current.setSubmitting(true);
    });

    act(() => result.current.reset());

    expect(result.current.state).toEqual(initialBookingState);
  });

  it('toggles services in and out of the selection by id', () => {
    const { result } = setup();

    act(() => result.current.toggleService(SERVICE));
    act(() => result.current.toggleService(OTHER_SERVICE));
    expect(result.current.state.selectedServices).toEqual([SERVICE, OTHER_SERVICE]);

    act(() => result.current.toggleService({ ...SERVICE }));
    expect(result.current.state.selectedServices).toEqual([OTHER_SERVICE]);

    act(() => result.current.toggleService(OTHER_SERVICE));
    expect(result.current.state.selectedServices).toEqual([]);
    expect(result.current.isValid()).toBe(false);
  });

  it('drops a professional that does not offer every selected service', () => {
    const { result } = setup();
    act(() => {
      result.current.toggleService(OTHER_SERVICE);
      result.current.setProfessional({ id: 'maria-lopez', name: 'María López' });
    });
    expect(result.current.state.selectedProfessional).toEqual({ id: 'maria-lopez', name: 'María López' });

    // SERVICE is offered by Alex only: María no longer offers the whole selection.
    act(() => result.current.toggleService(SERVICE));
    expect(result.current.state.selectedProfessional).toBeNull();
  });

  it('keeps a professional that still offers every selected service', () => {
    const { result } = setup();
    act(() => {
      result.current.toggleService(OTHER_SERVICE);
      result.current.setProfessional(PROFESSIONAL);
    });

    act(() => result.current.toggleService(SERVICE));
    expect(result.current.state.selectedProfessional).toEqual(PROFESSIONAL);
  });

  it('clears the selected time whenever the selection changes (the duration changed)', () => {
    const { result } = setup();
    act(() => {
      result.current.toggleService(SERVICE);
      result.current.setTime('11:00');
    });

    act(() => result.current.toggleService(OTHER_SERVICE));
    expect(result.current.state.selectedTime).toBeNull();

    act(() => result.current.setTime('12:00'));
    act(() => result.current.toggleService(OTHER_SERVICE));
    expect(result.current.state.selectedTime).toBeNull();
  });

  it('throws a helpful error outside the provider', () => {
    expect(() => renderHook(() => useBooking())).toThrow('useBooking must be used inside <BookingProvider>');
  });
});
