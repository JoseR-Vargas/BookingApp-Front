# Feature: dashboard-config-admin

Source of truth: `specs/01-dashboard-config-admin.md` (Aprobado). Branch `feat/dashboard-config-admin` in BookingApp_Front and BookingApp_Back.

## Objective
Admin "Configuración" section: manage professionals, services (name, description, price, duration) and per-day opening hours, persisted in Mongo and consumed by the public site. 30-min grid unchanged.

## Constraints
- User makes commit and push. Agent only leaves changes STAGED in both repos (explicit `git add -- <files>`, never `-A`). No work-unit commits (user override of the ODD default).
- Do not stage `.atl/`, `odd/`, `specs/`, BE `docs/jira-whatsapp-bot.md`.
- Never touch the real `MONGO_URI`. E2E uses throwaway Docker Mongo + DB `booking_e2e`, fake data only.
- Test-first default: BE runner `npx jest`, FE runner `npm test` (vitest). 

## Tasks
- [x] T0 Branches created in both repos (stashes of unrelated WIP kept intact; `specs/` restored from stash@{0}).
- [x] T1 BE steps 2-6: schemas+seed, async CatalogService, HH:mm schedule, AdminKeyGuard, admin endpoints. Route: delegated writer (many non-trivial files).
- [x] T2 FE steps 7-12: CatalogProvider, appConfig cleanup, login vs backend, Configuración (Profesionales/Servicios/Horarios). Route: delegated writer.
- [x] T3 E2E step 13: Playwright (add @playwright/test devDependency), run against local back + Docker Mongo booking_e2e. Route: delegated writer.
- [x] T4 Step 14: stage both repos, verify acceptance criteria, report.

## Progress / Evidence
- T1 BE: jest 566/566 (baseline 397), tsc build config OK. RED/GREEN per unit by delegated writer. NOTE: BE changes were committed as 119b48d (author Jose Vargas, 00:26) by someone other than the agent; working tree clean, nothing staged in BE.
- T2 FE: vitest 544/544 (baseline 440), vite build OK. Parent fix: closed-day placeholder 'Domingo cerrado' -> 'Cerrado este dia' in useAvailableTimes (+3 tests).
- T3 E2E: playwright 12/12 x3 runs, 0 retries. Throwaway Docker Mongo :27018/booking_e2e (removed). Back run from e2e/.build, no .env, blank mail/WhatsApp vars, non-loopback sockets blocked. Ports 3100/5174 used because 3000/5173 held by user's own processes.
- T4: FE staged explicit paths (54 files); specs/, odd/ left unstaged.

## Delivery
Two repos, separate PRs. No commits by the agent.
