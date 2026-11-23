// ===== SERVICE FORM =====
// Required-ness only: the numeric limits (price >= 0, duration 5-480, lengths) belong to the backend,
// whose message is shown as is, so the two never disagree. price and duration are the raw input text.

import { z } from 'zod';

export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  price: z.string().min(1, 'Ingresa el precio'),
  duration: z.string().min(1, 'Ingresa la duración'),
  professionals: z.array(z.string()).min(1, 'Selecciona al menos un profesional'),
});
