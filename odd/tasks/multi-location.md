# Feature: multi-location (SPEC 08, stage 1)

Objective: several locations (locales) in one panel; per-location schedule; professionals that rotate between locations; bookings store the location.
Branch: feat/multi-location (both repos, from feat/schedule-start-interval). Delivery strategy: ask-on-risk. Runner: back `npm test` (jest), front `npx vitest run`, e2e `npx playwright test --project=chromium`.
Full narrative and contract: `specs/08-multi-location.md` (Spanish). Read it and this file until `## Log`.

## Specs

- S1 Local entity `locations`: id(slug), name, address, active, weekly, slotIntervalMinutes 30, startIntervalMinutes, createdAt. Local "Principal" (`id: "principal"`, name "Principal", address "") is created idempotently at startup from business_settings (or seed); the default location is the oldest active one.
- S2 Professional `locationIds` (absent = [default]); booking `location: {id, name}` (absent = default). No rewriting of existing documents.
- S3 `GET /api/catalog`: `locations` (active only, each with `schedule`) + `locations: string[]` per professional; top-level `schedule` = default location's. `GET /api/admin/catalog`: all locations with `active`.
- S4 `GET /api/availability` accepts `locationId` (default = default location; unknown/inactive -> 404 `Location "<id>" not found`); only professionals assigned there; that location's schedule; response adds `location: {id,name}`; occupancy stays per professional across locations.
- S5 `POST /api/bookings` accepts `location: {id}`; absent + one active location -> default; absent + several -> 400 `Error de validación: debes elegir un local`; professional must work there (`Error de validación: <nombre> no trabaja en <local>`); time must be offered by that location's schedule (existing error); stores `location`. `POST /api/bookings/availability` accepts optional `locationId`. `PATCH` validates against the stored location and cannot change it.
- S6 Admin `POST /api/admin/locations {name,address}` (201), `PUT /api/admin/locations/:id {name,address,active}`, `PUT /api/admin/locations/:id/schedule {weekly,startIntervalMinutes?}` -> `{schedule, affectedBookings}` (affected counts only that location's bookings; same validations/messages as `PUT /api/admin/schedule`). `PUT /api/admin/schedule` keeps its contract and acts on the default location. Cannot deactivate the last active location: 400 `Debe quedar al menos un local activo.` Validation 400s: `El nombre del local es obligatorio (máximo 80 caracteres).`, `La dirección del local no puede superar los 200 caracteres.`
- S7 Professional create/update accept `locations: string[]` (existing active ids, no duplicates, at least one; default [default location]); error `El profesional debe trabajar en al menos un local activo.`
- S8 `GET /api/public-availability?serviceId[&locationId]` adds `locations: [{id,name}]` and `locationId`; settings stay global.
- S9 Admin panel: "Locales" tab (create, edit, deactivate), "Horarios" tab with a location selector (when more than one location), locations in the professional form.
- S10 Public booking modal: with more than one active location a "Local" selector in step 2 filters professionals and availability and sends `location: {id}`; with one location nothing changes. `/disponibilidad`: location selector when more than one.
- S11 Out of scope (stage 2): WhatsApp bot (keeps using the default location, documented), email with address, reports by location, services per location, per-day professional calendars, moving bookings between locations.
- S12 Everything new is optional with the default location as fallback: existing tests must keep passing unchanged while there is one location.

## Tasks

- [x] T1 (S1,S2,S3) Back: locations schema/collection, startup migration, catalog read (`locations`, per-professional `locations`), `getSchedule(locationId)` — route: delegated (writer, backend unit)
- [x] T2 (S4,S5) Back: availability and bookings by location, occupancy across locations — route: delegated (same writer)
- [x] T3 (S6,S7) Back: admin locations CRUD, per-location schedule + affected bookings, professional `locations` — route: delegated (same writer)
- [x] T4 (S8) Back: public availability by location; docs — route: delegated (same writer)
- [x] T5 (S9) Front: adminService, Locales tab, Horarios selector, professional form locations — route: inline
- [x] T6 (S10) Front: booking modal location + `/disponibilidad` selector — route: inline
- [x] T7 (S1-S10) E2E, docs, visual check, final verification — route: inline

## Log

- L1 (user, 2026-11-23): "¿De qué manera pudiésemos resolver si, por ejemplo, hay un negocio que tiene dos locales?"
- L2 (user, 2026-11-23): "Dale, implementemos la opción B y un profesional pudiese rotar entre los dos."
- 2026-11-23: T5 and T6 done inline (vitest 844/844, vite build OK). New front files: utils/locations.js, LocationsTab.jsx; ScheduleTab/ProfessionalsTab/ConfigSection/ScheduleStep/BookingModal/ConfirmationModal/Availability page extended; state `selectedLocation`. E2E spec e2e/specs/multi-location written, waiting for the backend writer (T1-T4).
- 2026-11-23: backend writer finished T1-T4 (jest 1018/1020, the 2 failures are the pre-existing main.spec ones; tsc and eslint clean). I fixed its one out-of-surface spec (whatsapp.module.spec overrides LocationRecord). E2E multi-location 6/6 and full suite 57/57; vitest 844/844; vite build OK; visual check done. Known limitation: with several active locations the WhatsApp bot's bookings fail with 'debes elegir un local' (stage 2).
- Route declaration: T1-T4 delegated to one backend writer (parallelism: backend and front are independent units with disjoint repos, each several hundred lines; also the context backstop). T5-T7 inline.
