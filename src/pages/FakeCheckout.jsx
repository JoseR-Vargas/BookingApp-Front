// Simulated payment page (spec 23, development only). The fake gateway sends the owner here: it shows the
// plan and a button that pays. With a real gateway the customer pays on the provider's page instead.

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { planName } from '../billing/plans.js';

export default function FakeCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = params.get('plan') || '';
  const tenant = params.get('tenant') || '';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const pay = async () => {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/subscription/fake-checkout`, {
        method: 'POST',
        // The business of the payment travels in the header, so the guard finds the owner's account.
        headers: { 'Content-Type': 'application/json', 'X-Tenant': tenant },
        credentials: 'include',
        body: JSON.stringify({ plan, tenant }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'No pudimos procesar el pago.');
      }
      navigate(`/n/${tenant}/admin`);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen-dvh items-center justify-center bg-bg-primary px-3">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-secondary p-8 text-center">
        <h1 className="mb-2 font-display text-2xl font-bold">Pago simulado</h1>
        <p className="mb-6 leading-loose text-text-secondary">
          Estás en la pasarela de prueba. Al confirmar, el plan <strong>{planName(plan)}</strong> queda activo
          en el negocio <strong>{tenant}</strong> sin cobrar nada.
        </p>
        {error && <p role="alert" className="mb-4 text-sm text-error">{error}</p>}
        <Button onClick={pay} disabled={pending} className="w-full">
          {pending ? <Spinner /> : 'Confirmar el pago'}
        </Button>
      </div>
    </main>
  );
}
