// Notice of the data quota of the business (spec 22): it appears from 70 % and says what happens at 100 %.
// It renders nothing for a business without a quota or with plenty of room.

const MB = 1024 * 1024;
const megabytes = (bytes) => (bytes / MB).toFixed(1).replace('.0', '');

export default function StorageNotice({ storage }) {
  if (!storage || storage.level === 'ok') return null;

  const used = `${megabytes(storage.usedBytes)} de ${megabytes(storage.quotaBytes)} MB`;

  if (storage.level === 'blocked') {
    return (
      <div role="alert" data-testid="storage-notice" className="mb-6 rounded-lg border border-error bg-error/10 p-4 text-sm">
        <strong>Llegaste al límite de almacenamiento ({used}).</strong>{' '}
        Tu negocio no acepta reservas nuevas hasta liberar espacio (por ejemplo, con fotos más livianas) o ampliar tu plan.
      </div>
    );
  }

  return (
    <div role="status" data-testid="storage-notice" className="mb-6 rounded-lg border border-border bg-accent-muted p-4 text-sm">
      <strong>Tu almacenamiento está al {storage.percent} %</strong> ({used}).{' '}
      Al llegar al 100 % el negocio dejará de aceptar reservas nuevas. Las fotos y el logo son lo que más pesa.
    </div>
  );
}
