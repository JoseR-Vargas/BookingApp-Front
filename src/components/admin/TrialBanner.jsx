// Notice of the free trial (spec 21) at the top of the panel: days left and bookings made, or the blocked
// state with what to do. It renders nothing for a business without a trial.

export default function TrialBanner({ trial }) {
  if (!trial) return null;

  if (trial.blocked) {
    return (
      <div role="alert" data-testid="trial-banner" className="mb-6 rounded-lg border border-error bg-error/10 p-4 text-sm">
        <strong>Tu prueba gratuita terminó.</strong>{' '}
        Tu negocio no acepta reservas nuevas, pero puedes seguir viendo tus reservas y tu configuración.
        Activa tu negocio para volver a recibir reservas.
      </div>
    );
  }

  const days = trial.daysLeft === 1 ? '1 día' : `${trial.daysLeft} días`;
  return (
    <div role="status" data-testid="trial-banner" className="mb-6 rounded-lg border border-border bg-accent-muted p-4 text-sm">
      <strong>Prueba gratuita:</strong>{' '}
      te quedan {days} y {trial.bookingsMade} de {trial.bookingQuota} reservas.
    </div>
  );
}
