// ===== ESTADO CENTRALIZADO DEL FLUJO DE RESERVA =====
// React replacement for the legacy `bookingState` singleton (js/state/booking-state.js).
// Legacy interface get/set/reset/isValid maps to: `state` + `setX` actions + `reset` + `isValid`.
// `eventListenersRegistered` is gone: React owns event wiring, so there is nothing to register.

import { createContext, useContext, useMemo, useReducer } from 'react';
import { offersAllServices, toggleService } from '../utils/serviceSelection.js';

export const initialBookingState = {
  currentStep: 1,
  selectedServices: [],
  selectedDate: null,
  selectedTime: null,
  selectedProfessional: null,
  selectedLocation: null,
  isSubmitting: false,
};

export function bookingReducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };
    case 'TOGGLE_SERVICE': {
      const selectedServices = toggleService(state.selectedServices, action.service);
      // A professional must offer EVERY selected service, and the booked time depended on the old duration.
      const stillOffered = state.selectedProfessional
        && offersAllServices(state.selectedProfessional.id, selectedServices);
      return {
        ...state,
        selectedServices,
        selectedTime: null,
        selectedProfessional: stillOffered ? state.selectedProfessional : null,
      };
    }
    case 'SET_DATE':
      return { ...state, selectedDate: action.date };
    case 'SET_TIME':
      return { ...state, selectedTime: action.time };
    case 'SET_PROFESSIONAL':
      return { ...state, selectedProfessional: action.professional };
    case 'SET_LOCATION': {
      // A professional works at some locations only (a catalog without that data keeps them), and the
      // booked time belonged to the other location's hours.
      const { selectedProfessional } = state;
      const works = selectedProfessional
        && (!Array.isArray(selectedProfessional.locations) || selectedProfessional.locations.includes(action.location.id));
      return { ...state, selectedLocation: action.location, selectedTime: null, selectedProfessional: works ? selectedProfessional : null };
    }
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'RESET':
      return initialBookingState;
    default:
      return state;
  }
}

const BookingContext = createContext(null);

export function BookingProvider({ children }) {
  const [state, dispatch] = useReducer(bookingReducer, initialBookingState);

  // `dispatch` is stable, so the action creators are too: safe to use in effect dependency lists.
  const actions = useMemo(() => ({
    setStep: (step) => dispatch({ type: 'SET_STEP', step }),
    toggleService: (service) => dispatch({ type: 'TOGGLE_SERVICE', service }),
    setDate: (date) => dispatch({ type: 'SET_DATE', date }),
    setTime: (time) => dispatch({ type: 'SET_TIME', time }),
    setProfessional: (professional) => dispatch({ type: 'SET_PROFESSIONAL', professional }),
    setLocation: (location) => dispatch({ type: 'SET_LOCATION', location }),
    setSubmitting: (isSubmitting) => dispatch({ type: 'SET_SUBMITTING', isSubmitting }),
    reset: () => dispatch({ type: 'RESET' }),
  }), []);

  const value = useMemo(() => ({
    state,
    ...actions,
    // Legacy isValid(): the four selections are all present (at least one service).
    isValid: () => !!(
      state.selectedServices.length > 0
      && state.selectedDate
      && state.selectedTime
      && state.selectedProfessional
    ),
  }), [state, actions]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used inside <BookingProvider>');
  }
  return context;
}
