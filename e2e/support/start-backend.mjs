// Starts the NestJS backend for the E2E run (used by the Playwright `webServer`).
//
// - Compiles the backend into e2e/.build (gitignored) instead of its own `dist/`, so a backend already
//   running from `dist/` is never disturbed and nothing is written inside the backend repo.
// - Runs from a working directory WITHOUT a `.env`: the real backend `.env` is never read.
// - Passes the throwaway-database environment from env.js; blank values for every external service.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKEND_ENV, MONGO_URI } from './env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildRoot = path.resolve(here, '../.build');
const outDir = path.join(buildRoot, 'back');
const backendRoot = path.resolve(here, '../../../BookingApp_Back');

if (MONGO_URI !== 'mongodb://localhost:27018/booking_e2e') {
  throw new Error(`Refusing to start: unexpected MONGO_URI ${MONGO_URI}`);
}

mkdirSync(buildRoot, { recursive: true });
// The frontend package is "type": "module"; the compiled backend is CommonJS.
writeFileSync(path.join(buildRoot, 'package.json'), '{ "type": "commonjs" }\n');
// Node resolves the compiled backend's dependencies by walking up from its own location.
const modulesLink = path.join(buildRoot, 'node_modules');
if (!existsSync(modulesLink)) symlinkSync(path.join(backendRoot, 'node_modules'), modulesLink, 'dir');

const build = spawnSync(
  path.join(backendRoot, 'node_modules/.bin/tsc'),
  ['-p', 'tsconfig.build.json', '--outDir', outDir, '--incremental', 'false'],
  { cwd: backendRoot, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(
  process.execPath,
  ['--require', path.join(here, 'block-external-net.cjs'), path.join(outDir, 'main.js')],
  // cwd = buildRoot: ConfigModule looks for `.env` in the cwd, and there is none there.
  { cwd: buildRoot, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...BACKEND_ENV } },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
