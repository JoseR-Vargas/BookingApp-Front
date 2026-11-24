// ===== BOOKING CLIENT FORM =====
// The client step of the booking flow. The inputs keep their native attributes (they drive the
// :invalid styling); this schema decides whether the step may continue and mirrors those rules:
// name, email and phone are required (an empty value, not a blank one), the email must be a valid
// address by the HTML standard, and the optional id and notes may be empty.

import { z } from 'zod';

export const CLIENT_FORM_MESSAGE = 'Por favor completa todos los campos requeridos';

export const clientSchema = z.object({
  name: z.string().min(1, CLIENT_FORM_MESSAGE),
  id: z.string(),
  // Browsers strip surrounding whitespace from an email input before validating it.
  email: z.string().trim().min(1, CLIENT_FORM_MESSAGE).regex(z.regexes.html5Email, CLIENT_FORM_MESSAGE),
  phone: z.string().min(1, CLIENT_FORM_MESSAGE),
  notes: z.string(),
});
