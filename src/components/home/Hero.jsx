import Container from '../layout/Container.jsx';
import Button from '../ui/Button.jsx';
import Ornament from '../ui/Ornament.jsx';
import { useBranding } from '../../state/brandingState.jsx';

// Faint dot grid (accent color at 6% opacity) laid over the hero gradient. Built from the brand
// variables so it follows the admin's colors (an SVG data URI cannot read CSS variables).
const DOT_PATTERN =
  'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 6%, transparent) 0.8px, transparent 1px) 0 0 / 20px 20px';

export default function Hero({ onReserve }) {
  // The admin's business name replaces the default tagline (SPEC 03); without one it stays.
  const { businessName } = useBranding();

  return (
    <section
      id="inicio"
      aria-labelledby="hero-heading"
      className="relative scroll-mt-16 flex min-h-screen-dvh items-center overflow-hidden bg-bg-primary bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-bg-primary)_96%,transparent)_0%,color-mix(in_srgb,var(--color-bg-tertiary)_92%,transparent)_100%)] lte-lg:pt-20 lte-md:pt-[100px] lte-md:pb-[60px] lte-sm:pt-20 lte-sm:pb-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: DOT_PATTERN }}
      />

      <Container className="relative z-1">
        <div className="flex min-h-screen-dvh items-center">
          <div className="w-full text-center">
            <p className="mb-4 text-xs leading-loose font-semibold tracking-widest text-accent uppercase">
              Reservas Online
            </p>
            <h1
              id="hero-heading"
              className="mb-6 font-display text-[length:clamp(3rem,8vw,6rem)] leading-[1.05] font-bold tracking-tight text-text-primary uppercase [overflow-wrap:anywhere] lte-md:text-[length:clamp(2.2rem,10vw,3.5rem)] lte-sm:text-[length:clamp(2rem,12vw,2.8rem)]"
            >
              {businessName ? (
                businessName
              ) : (
                <>
                  Tu tiempo,{' '}
                  <br />
                  nuestra{' '}
                  <br />
                  <span className="text-accent">prioridad</span>
                </>
              )}
            </h1>

            <Ornament size="hero" />

            <p className="mx-auto mb-8 max-w-[480px] text-md leading-loose text-text-secondary lte-sm:text-sm">
              Reserva tu cita de forma rápida y sencilla.
              <br />
              Profesionales certificados y atención personalizada.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <Button onClick={onReserve}>Reservar Cita</Button>
              <Button variant="outline" href="#servicios">
                Conocer Más
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
