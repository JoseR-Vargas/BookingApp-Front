// Public SaaS site (spec 25): what the product offers, the plans and how to start. The sign-up form
// of the spec 21 is reused: a business created here gets its owner and its session.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/ui/BrandMark.jsx';
import Button from '../components/ui/Button.jsx';
import { PLANS } from '../billing/plans.js';

const PRICES = { gratis: 'Gratis', pro: '19 USD/mes', negocio: '49 USD/mes' };

const FEATURES = [
  'Reservas online con confirmación por correo',
  'Página pública de disponibilidad',
  'Profesionales, servicios, locales y horarios propios',
  'Recordatorios antes de la cita',
  'Un negocio por cuenta, con su propia clave y sus datos',
];

export default function SaasSite() {
  const [email, setEmail] = useState('');

  return (
    <main className="min-h-screen-dvh bg-bg-primary">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6">
        <BrandMark textClassName="font-display text-lg font-bold" logoClassName="h-8 w-8" />
        <nav className="flex items-center gap-4">
          <Link to="/" className="text-sm text-text-secondary no-underline hover:text-accent">Ver un negocio</Link>
          <Link to="/empezar" className="text-sm text-accent no-underline hover:underline">Empezar</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 text-center">
        <h1 className="mb-4 font-display text-3xl font-bold">Reservas online para tu negocio</h1>
        <p className="mx-auto mb-8 max-w-2xl leading-loose text-text-secondary">
          Creá tu negocio, poné tus servicios y horarios, y empezá a recibir reservas en minutos.
          Cada negocio tiene sus datos, sus usuarios y su plan.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/empezar">Crear mi negocio</Button>
          <Button variant="secondary" href="/n/principal">Ver una demo</Button>
        </div>
      </section>

      <section aria-label="Planes" className="mx-auto max-w-4xl px-4 py-8">
        <h2 className="mb-6 text-center text-2xl font-bold">Planes</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-border bg-bg-secondary p-6 text-left">
              <h3 className="mb-1 text-lg font-bold">{plan.name}</h3>
              <p className="mb-4 text-sm text-text-secondary">{PRICES[plan.id] || ''}</p>
              <ul className="mb-6 text-sm leading-loose">
                <li>{plan.limits.professionals} profesionales</li>
                <li>{plan.limits.locations} {plan.limits.locations === 1 ? 'local' : 'locales'}</li>
                <li>{plan.limits.bookingsPerMonth} reservas al mes</li>
                <li>Página pública: {plan.limits.publicPage ? 'sí' : 'no'}</li>
                <li>Recordatorios: {plan.limits.reminders ? 'sí' : 'no'}</li>
              </ul>
              <Button href="/empezar" variant={plan.id === 'pro' ? 'primary' : 'secondary'} size="sm" className="w-full">
                Empezar gratis
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Qué incluye" className="mx-auto max-w-4xl px-4 py-8">
        <h2 className="mb-6 text-center text-2xl font-bold">Qué incluye</h2>
        <ul className="mx-auto max-w-2xl leading-loose">
          {FEATURES.map((feature) => <li key={feature}>• {feature}</li>)}
        </ul>
      </section>

      <section aria-label="Contacto" className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h2 className="mb-2 text-2xl font-bold">¿Dudas?</h2>
        <p className="mb-4 text-text-secondary">Escribinos y te respondemos.</p>
        <form
          className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setEmail('');
          }}
        >
          <label className="sr-only" htmlFor="contact-email">Tu correo</label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            placeholder="tu@correo.com"
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-full border border-border bg-bg-secondary px-4 py-3 text-sm"
          />
          <Button type="submit">Contactar</Button>
        </form>
      </section>
    </main>
  );
}
