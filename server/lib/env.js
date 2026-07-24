import dotenv from 'dotenv';

// Always loads server/.env regardless of the process's cwd, since npm scripts run from the repo root.
dotenv.config({ path: new URL('../.env', import.meta.url) });
