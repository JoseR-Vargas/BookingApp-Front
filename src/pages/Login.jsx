// Admin login page. Port of legacy login.html (markup + inline script).

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import { CONTROL_CLASSES, LABEL_CLASSES } from '../components/ui/controls.js';
import Spinner from '../components/ui/Spinner.jsx';
import { authService } from '../services/authService.js';
import { toast } from '../ui/toast.js';

const REDIRECT_DELAY_MS = 1000;

function Field({ id, label, spacing, ...inputProps }) {
  return (
    <div className={spacing}>
      <label htmlFor={id} className={LABEL_CLASSES}>{label}</label>
      <input id={id} name={id} required className={CONTROL_CLASSES} {...inputProps} />
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const redirectTimer = useRef(null);
  const [pending, setPending] = useState(false);

  // A redirect scheduled by a successful login must not fire after the page is gone.
  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;

    setPending(true);
    try {
      await authService.login(username, password);
      toast.success('Inicio de sesión exitoso');
      // The button stays disabled on success: the redirect follows (legacy behavior).
      redirectTimer.current = setTimeout(() => navigate('/admin'), REDIRECT_DELAY_MS);
    } catch (error) {
      toast.error(error.message);
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen-dvh items-center justify-center bg-linear-[135deg,var(--color-bg-primary)_0%,var(--color-bg-tertiary)_100%] px-3">
      {/* Legacy grid: the row is as wide as the container and its single column is 100% / 50% / 33%. */}
      <div className="-mx-3 flex w-full flex-wrap justify-center">
        <div className="w-full px-3 md:w-1/2 lg:w-1/3">
          <div className="rounded-lg border border-border bg-bg-secondary shadow-lg">
            <div className="p-12 lte-sm:p-8">
              <div className="mb-6 text-center">
                <h1 className="mb-2 font-display text-[calc(1.325rem+0.9vw)] font-bold [overflow-wrap:anywhere] xl:text-[2rem]">
                  BookingApp
                </h1>
                <p className="mb-4 leading-loose text-text-secondary">Panel de Administración</p>
              </div>

              <form onSubmit={handleSubmit}>
                <Field
                  id="username"
                  spacing="mb-4"
                  label="Usuario"
                 
                  type="text"
                  placeholder="Ingresa tu usuario"
                  autoComplete="username"
                />
                <Field
                  id="password"
                  spacing="mb-6"
                  label="Contraseña"
                 
                  type="password"
                  placeholder="Ingresa tu contraseña"
                  autoComplete="current-password"
                />

                <Button
                  type="submit"
                  size="sm"
                  disabled={pending}
                  className="w-full py-2! font-bold!"
                >
                  {pending ? (
                    <>
                      <Spinner className="-my-0.5" barClassName="bg-primary-foreground" />
                      Iniciando sesión...
                    </>
                  ) : (
                    <>
                      Iniciar Sesión
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/"
                  className="text-text-secondary no-underline transition-colors duration-150 ease-[ease] hover:text-accent touch:inline-flex touch:min-h-11 touch:items-center"
                >
                  Volver al inicio
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
