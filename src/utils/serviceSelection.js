// ===== SELECCIÓN DE SERVICIOS =====
// Pure rules for a booking made of several services performed back-to-back by ONE professional.
// A service is `{ id, price, duration, professionals: string[] }` (as served by GET /api/catalog).

const sumBy = (services, key) => services.reduce((total, service) => total + service[key], 0);

export const getTotalPrice = (services) => sumBy(services, 'price');

export const getTotalDuration = (services) => sumBy(services, 'duration');

export const getServiceIds = (services) => services.map((service) => service.id);

/** Adds the service when it is not selected yet, removes it (matched by id) otherwise. */
export function toggleService(services, service) {
  return services.some((selected) => selected.id === service.id)
    ? services.filter((selected) => selected.id !== service.id)
    : [...services, service];
}

/** Ids of the professionals that offer EVERY service (none for an empty selection). */
export function getCommonProfessionalIds(services) {
  if (services.length === 0) return [];
  const [first, ...rest] = services;
  return first.professionals.filter((id) => rest.every((service) => service.professionals.includes(id)));
}

export function offersAllServices(professionalId, services) {
  return services.every((service) => service.professionals.includes(professionalId));
}

/** A service can join the selection only if some professional would still offer all of them. */
export function canAddService(services, candidate) {
  return getCommonProfessionalIds([...services, candidate]).length > 0;
}
