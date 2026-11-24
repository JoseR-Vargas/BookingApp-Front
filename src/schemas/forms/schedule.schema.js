// ===== WEEKLY SCHEDULE FORM =====
// Input: the days in display order, each { name, closed, open, close, starts } with 'HH:mm' strings
// (they compare correctly as text). A closed day is never checked. Bad ranges are reported before
// empty start lists, and each in day order, so the first message is the one the form always showed.

import { z } from 'zod';

const day = z.object({
  name: z.string(),
  closed: z.boolean(),
  open: z.string(),
  close: z.string(),
  // null = the day follows the general interval; a list = its own start times.
  starts: z.array(z.string()).nullable(),
});

export const scheduleFormSchema = z.array(day).superRefine((days, context) => {
  for (const { name, closed, open, close } of days) {
    if (!closed && open >= close) {
      context.addIssue({ code: 'custom', message: `${name}: la apertura debe ser anterior al cierre` });
    }
  }
  for (const { name, closed, starts } of days) {
    if (!closed && starts && starts.length === 0) {
      context.addIssue({ code: 'custom', message: `${name}: marca al menos una hora o usa el intervalo general` });
    }
  }
});
