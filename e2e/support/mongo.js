import { execFileSync } from 'node:child_process';
import { MONGO_URI } from './env.js';

// Direct read access to the throwaway Mongo (Docker container `booking-e2e-mongo`), for facts the API
// deliberately hides (e.g. the stored token hash). Container and database are hard-coded: the helper can
// never reach any other server, and it refuses to run if env.js drifts from the throwaway URI.
const CONTAINER = 'booking-e2e-mongo';
const DATABASE = 'booking_e2e';

function assertThrowawayUri() {
  if (MONGO_URI !== `mongodb://localhost:27018/${DATABASE}`) {
    throw new Error(`Refusing to query Mongo: unexpected MONGO_URI ${MONGO_URI}`);
  }
}

/** Runs a mongosh script against `booking_e2e` and returns what it printed. */
export function mongosh(script) {
  assertThrowawayUri();
  return execFileSync('docker', ['exec', CONTAINER, 'mongosh', '--quiet', DATABASE, '--eval', script], {
    encoding: 'utf8',
  }).trim();
}

/** Database names of the throwaway server: proof of which server the suite talks to. */
export function throwawayDatabaseNames() {
  assertThrowawayUri();
  const output = execFileSync(
    'docker',
    ['exec', CONTAINER, 'mongosh', '--quiet', '--eval', 'print(JSON.stringify(db.getMongo().getDBNames()))'],
    { encoding: 'utf8' },
  );
  return JSON.parse(output.trim());
}
