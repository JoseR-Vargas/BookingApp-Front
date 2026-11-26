// Public sign-up page (/empezar, spec 21): one form creates the business and its first owner, and the
// visitor lands in the setup wizard already signed in.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../components/ui/BrandMark.jsx';
import Button from '../components/ui/Button.jsx';
import { CONTROL_CLASSES, LABEL_CLASSES } from '../components/ui/controls.js';
import Spinner from '../components/ui/Spinner.jsx';
import { signUpBusiness } from '../services/signupService.js';
import { slugify } from '../tenancy/tenant-slug.js';

function Field({ id, label, hint, ...inputProps }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className={LABEL_CLASSES}>{label}</label>
      <input id={id} name={id} className={CONTROL_CLASSES} {...inputProps} />
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: '', adminName: '', email: '', password: '', slug: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const change = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      // The address follows the name until the visitor edits it.
      if (key === 'businessName' && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const created = await signUpBusiness({
        businessName: form.businessName.trim(),
        adminName: form.adminName.trim(),
        email: form.email.trim(),
        password: form.password,
        slug: form.slug.trim(),
      });
      navigate(`/n/${created.slug}/asistente`);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen-dvh items-center justify-center bg-bg-primary px-3 py-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-secondary p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-2xl font-bold"><BrandMark logoClassName="h-[1.2em] w-[1.2em]" /></h1>
          <p className="leading-loose text-text-secondary">Crea tu negocio y empieza a recibir reservas.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <Field id="businessName" label="Nombre del negocio" value={form.businessName} onChange={change('businessName')} autoComplete="organization" />
          <Field
            id="slug"
            label="Dirección de tu negocio"
            value={form.slug}
            onChange={(event) => { setSlugTouched(true); change('slug')(event); }}
            hint={form.slug ? `Tus clientes entrarán por /n/${form.slug}` : 'Letras minúsculas, números y guiones.'}
          />
          <Field id="adminName" label="Tu nombre" value={form.adminName} onChange={change('adminName')} autoComplete="name" />
          <Field id="email" label="Correo" type="email" value={form.email} onChange={change('email')} autoComplete="email" />
          <Field id="password" label="Contraseña (mínimo 10 caracteres)" type="password" value={form.password} onChange={change('password')} autoComplete="new-password" />

          {error && <p role="alert" data-testid="signup-error" className="mb-4 text-sm text-error">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Spinner /> : 'Crear mi negocio'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          ¿Ya tienes un negocio? Entra por la dirección de tu negocio, o <Link to="/" className="text-accent">vuelve a la portada</Link>.
        </p>
      </div>
    </main>
  );
}
