// ===== LAYOUT DE UN NEGOCIO (/n/:slug) =====
// Gives the pages below it their business and, before showing them, checks that the business
// exists: an unknown or suspended slug gets a clear notice and a link to the front page, never a
// blank screen.

import { useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { apiClient } from '../core/apiClient.js';
import { parseTenantPath } from './tenant-resolver.js';
import { TenantProvider } from './tenant-context.jsx';

const UNAVAILABLE = {
  404: 'No encontramos este negocio. Revisa el enlace.',
  403: 'Este negocio no está disponible en este momento.',
};

export default function TenantLayout() {
  const { slug: raw } = useParams();
  const slug = parseTenantPath(`/n/${raw}`);
  const [problem, setProblem] = useState(slug ? null : UNAVAILABLE[404]);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    setProblem(null);
    apiClient.get('/api/branding').catch((error) => {
      if (!cancelled && error && UNAVAILABLE[error.status]) setProblem(UNAVAILABLE[error.status]);
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (problem) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-bold">{problem}</h1>
        <Link to="/" className="text-accent">Ir a la portada</Link>
      </main>
    );
  }
  return (
    <TenantProvider slug={slug}>
      <Outlet />
    </TenantProvider>
  );
}
