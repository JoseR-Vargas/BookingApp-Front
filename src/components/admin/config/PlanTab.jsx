// "Plan" tab (spec 23): the current plan, its renewal and the comparison of plans. Hiring sends the owner to
// the payment page of the gateway; the backend confirms the payment by webhook and enforces every limit.

import { useCallback, useEffect, useState } from 'react';
import { PLANS, STATUS_LABELS, planName } from '../../../billing/plans.js';
import {
  cancelSubscription,
  getSessionState,
  resumeSubscription,
  startCheckout,
} from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import Spinner from '../../ui/Spinner.jsx';
import Card from '../Card.jsx';

const yesNo = (value) => (value ? 'Sí' : 'No');
const date = (iso) => new Date(iso).toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PlanTab() {
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = no subscription
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setPlan((await getSessionState()).plan);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (key, action, success) => {
    setBusy(key);
    try {
      const result = await action();
      if (result && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center text-text-secondary">
        <p>{error}</p>
        <Button size="sm" onClick={load}>Reintentar</Button>
      </div>
    );
  }
  if (plan === undefined) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
        <Spinner />
        <span>Cargando plan...</span>
      </div>
    );
  }

  const current = plan ? plan.planId : null;
  const renewing = plan && !plan.cancelAtPeriodEnd;

  return (
    <div>
      <Card title="Tu plan">
        {plan ? (
          <div data-testid="plan-current" className="text-sm leading-loose">
            <p><strong>{planName(plan.planId)}</strong> · {STATUS_LABELS[plan.status] || plan.status}</p>
            {plan.status === 'past_due' && (
              <p role="alert" className="text-error">Tu último pago no se pudo cobrar. Tu negocio sigue funcionando; regulariza el pago para no perder el plan.</p>
            )}
            {plan.currentPeriodEnd && (
              <p>
                {plan.cancelAtPeriodEnd ? 'Termina el ' : 'Se renueva el '}
                {date(plan.currentPeriodEnd)}
              </p>
            )}
            {plan.usage && (
              <p className="text-text-secondary">
                Uso: {plan.usage.professionals} de {plan.limits.professionals} profesionales,{' '}
                {plan.usage.locations} de {plan.limits.locations} locales,{' '}
                {plan.usage.bookingsThisMonth} de {plan.limits.bookingsPerMonth} reservas este mes.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {renewing && plan.status !== 'canceled' && (
                <Button variant="secondary" size="sm" disabled={busy !== ''} onClick={() => run('cancel', cancelSubscription, 'La suscripción terminará al final del período')}>
                  Cancelar al final del período
                </Button>
              )}
              {plan.cancelAtPeriodEnd && (
                <Button size="sm" disabled={busy !== ''} onClick={() => run('resume', resumeSubscription, 'Suscripción reanudada')}>
                  Reanudar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Todavía no contrataste un plan. Elige uno para ampliar los límites de tu negocio.</p>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="plan-grid">
        {PLANS.filter((item) => item.id !== 'gratis' || current === null).map((item) => (
          <Card key={item.id} title={item.name}>
            <ul className="mb-4 text-sm leading-loose">
              <li>{item.limits.professionals} profesionales</li>
              <li>{item.limits.locations} {item.limits.locations === 1 ? 'local' : 'locales'}</li>
              <li>{item.limits.bookingsPerMonth} reservas al mes</li>
              <li>Página pública: {yesNo(item.limits.publicPage)}</li>
              <li>Recordatorios: {yesNo(item.limits.reminders)}</li>
            </ul>
            {item.id === current ? (
              <p className="text-sm text-accent">Tu plan actual</p>
            ) : (
              item.id !== 'gratis' && (
                <Button size="sm" disabled={busy !== ''} data-testid={`plan-choose-${item.id}`} onClick={() => run(`checkout-${item.id}`, () => startCheckout(item.id), '')}>
                  Contratar {item.name}
                </Button>
              )
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
