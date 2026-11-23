// ===== API RESPONSE GUARD =====
// parseResponse(schema, data) returns the data when it matches the schema, else throws a ContractError.
// Response schemas are loose (extra fields kept): the backend may add fields without breaking the front.

import { ContractError } from './contract-error.js';

export function parseResponse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  if (import.meta.env?.DEV) {
    console.warn('[contract] unexpected API response:', result.error.message);
  }
  throw new ContractError(undefined, { cause: result.error });
}
