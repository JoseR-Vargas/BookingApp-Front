// ===== CONTRACT ERROR =====
// Thrown when a backend answer does not have the shape the front relies on. The UI handles it like
// any other load failure (error state with "Reintentar"): it is a plain Error with a Spanish message.

export const CONTRACT_ERROR_MESSAGE = 'La respuesta del servidor no tiene el formato esperado.';

export class ContractError extends Error {
  constructor(message = CONTRACT_ERROR_MESSAGE, options) {
    super(message, options);
    this.name = 'ContractError';
  }
}
