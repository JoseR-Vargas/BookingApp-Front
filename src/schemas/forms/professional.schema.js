// ===== PROFESSIONAL FORM =====
// Values are the trimmed form fields. `requireLocations` is true only for a business with several
// locations, where the professional must work at one of them at least.

import { z } from 'zod';

export function professionalSchema({ requireLocations }) {
  const fields = {
    name: z.string().trim().min(1, 'El nombre es obligatorio'),
    specialty: z.string(),
    experience: z.string(),
  };
  if (requireLocations) {
    fields.locations = z.array(z.string()).min(1, 'Elige al menos un local');
  }
  return z.object(fields);
}
