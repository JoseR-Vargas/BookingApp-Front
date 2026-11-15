// Catalog data shared by tests. Shape of the public GET /api/catalog response, with the values the
// backend seeds on an empty database (the former hardcoded APP_CONFIG business data).

export const PROFESSIONALS = [
  {
    id: 'alex-garcia',
    name: 'Alex García',
    specialty: 'Especialista',
    experience: '8 años',
    rating: 4.9,
    avatar: 'fas fa-user-tie',
    available: true,
  },
  {
    id: 'maria-lopez',
    name: 'María López',
    specialty: 'Consultora',
    experience: '6 años',
    rating: 4.8,
    avatar: 'fas fa-user',
    available: true,
  },
];

const BOTH = ['alex-garcia', 'maria-lopez'];

export const SERVICES = [
  {
    id: 'consulta-inicial',
    name: 'Consulta Inicial',
    description: 'Sesión introductoria para evaluar tus necesidades',
    price: 500,
    duration: 30,
    professionals: BOTH,
    icon: 'fas fa-clipboard-list',
  },
  {
    id: 'servicio-basico',
    name: 'Servicio Básico',
    description: 'Atención estándar completa con seguimiento profesional',
    price: 1200,
    duration: 60,
    professionals: BOTH,
    icon: 'fas fa-star',
  },
  {
    id: 'servicio-premium',
    name: 'Servicio Premium',
    description: 'Experiencia premium con atención prioritaria y resultados garantizados',
    price: 2500,
    duration: 90,
    professionals: BOTH,
    icon: 'fas fa-gem',
  },
  {
    id: 'sesion-expres',
    name: 'Sesión Exprés',
    description: 'Atención rápida y efectiva para ajustarse a tu agenda',
    price: 700,
    duration: 20,
    professionals: BOTH,
    icon: 'fas fa-bolt',
  },
];

const WEEKDAY = { closed: false, open: '09:00', close: '20:00' };

// Keys follow Date.getDay(): 0 = Sunday.
export const SCHEDULE = {
  weekly: {
    0: { closed: true },
    1: WEEKDAY,
    2: WEEKDAY,
    3: WEEKDAY,
    4: WEEKDAY,
    5: WEEKDAY,
    6: { closed: false, open: '09:00', close: '18:00' },
  },
  slotIntervalMinutes: 30,
};

export const CATALOG = { professionals: PROFESSIONALS, services: SERVICES, schedule: SCHEDULE };

// Admin flavour of the catalog: every item carries `active` (inactive ones are included).
export const ADMIN_CATALOG = {
  professionals: PROFESSIONALS.map((professional) => ({ ...professional, active: true })),
  services: SERVICES.map((service) => ({ ...service, active: true })),
  schedule: SCHEDULE,
};
