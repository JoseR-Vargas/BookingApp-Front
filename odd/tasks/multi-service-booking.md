# Feature: multi-service-booking

Repos: `BookingApp_Front` (this file) and `BookingApp_Back` (`/Users/josevargas/Documents/Apps-en-desarrollo/BookingApp_Back`)
Branch (both repos): `feat/multi-service-booking`
Engram mirror: `odd/multi-service-booking/tasks` (project `bookingapp_front`)
Delivery strategy: `ask-on-risk` (default). Push/PR/merge are user decisions.

## Objective
One booking can contain several services (e.g. Consulta Inicial + Servicio Básico + Servicio Premium), all performed
by ONE professional back-to-back in a single block. Price and duration accumulate; the dashboard shows the lines.

## Authorized scope
User authorized changes in BOTH repos. Existing bookings do NOT need to be preserved (test data): no legacy/compat code.
Clean code + single responsibility are mandatory (small focused modules/functions, no duplicated logic).

## Assumptions (user may revise)
- The same service cannot be added twice; no bundle discount; max = all catalog services.
- Booked duration = SUM of durations, occupying consecutive slots (existing `slotsRequired`).
- Only professionals that offer ALL selected services can be chosen.

## Contract (single source of truth for both repos)
- `POST /api/bookings` body: `{ client, services: [{ id }], professional: {id,name}, date, time, notes, status }`.
  Only `services[].id` is trusted; name/price/duration come from the catalog. Duplicated ids -> 400. Unknown id -> 400.
  Professional must offer every service -> 400. Window (sum of durations) must fit and be free -> 400/409 as today.
- Stored/returned booking: `{ _id, client, services: [{id,name,price,duration}], totalPrice, totalDuration, professional,
  date, time, slots, notes, status, createdAt }`. The old singular `service` field is REMOVED everywhere.
- `GET /api/availability?date=YYYY-MM-DD&serviceIds=a,b,c` -> `{ date, closed, services:[{id,name,duration}],
  totalDuration, professionals:[{id,name,slots:[free start times]}] }`; professionals = those offering all services.
- `POST /api/bookings/availability` body `{ date, time, professionalId, serviceIds }` -> `{ available }` (whole window free).
- `GET /api/bookings/statistics`: revenue sums `totalPrice`.

## Tasks
Backend (`BookingApp_Back`, jest: `npm test`):
- [x] B1 Catalog + domain: resolve N services from ids (validate unknown/duplicates, common professionals, totals). Tests first.
- [x] B2 Bookings: DTO + schema (`services`, `totalPrice`, `totalDuration`), create(), checkAvailability(), getStatistics(), occupied slots.
- [x] B3 Availability: `serviceIds` query + total duration window; controller validation.
- [x] B4 Consumers: WhatsApp bot flow, admin-notify params, email template (list of services + total).

Frontend (`BookingApp_Front`, vitest: `npm test`):
- [x] F0 Compact service/professional cards on mobile (commit cfed300).
- [x] F1 State + step 1: `selectedServices[]` toggle selection, no auto-advance, sticky summary bar (count, total, minutes) + "Continuar".
- [x] F2 Step 2/3: professionals = intersection; `useAvailableTimes` driven by `/api/availability` (total duration); recap + confirmation list services and totals; payload `services:[{id}]`.
- [x] F3 Admin dashboard: shared helper for booking services/total; tables show all services; chart counts per service line; revenue uses `totalPrice`.

## Acceptance criteria
- Selecting 3 services shows total $4,200 / 180 min and blocks 3 consecutive hourly slots for the chosen professional.
- A time whose window does not fit (closing/lunch/occupied) is shown as unavailable in the UI and refused by the backend.
- Dashboard bookings table, recent list, chart and revenue reflect all lines of a booking.
- All backend (`npm test`) and frontend (`npm test`, `npm run build`) suites green.

## Route declaration
- Backend B1-B4: delegated direct (one writer, >=2 non-trivial files, needs prior reading). Frontend F1-F3: delegated direct (one writer per group).

## Progress / evidence
- F0 front `cfed300`. Back: B1 `0bc38b8`, B2 `35870dd`, B3 `9426f56`, B4 `4c7ed08`, cleanup `88a68a7` + `c6c31e9` (npm test 371 pass, build ok).
- Front: F1 `10aadcc`, F2 `94f476b`, F3 `5e72b45` (npm test 442 pass, vite build ok). Parent spot check re-ran both suites.
- Native review assess: `unassessable` (untracked .atl/ and this doc) -> treated as high / review due; consent pending with the user.
- Not verified: real-browser mobile layout of summary bar, recap, admin stacked cells; no manual end-to-end against a live backend.
- Route per task: all delegated direct (1 writer per group).
- Next step: user decides review consent, then visual mobile check, then push/PR (user decision).
