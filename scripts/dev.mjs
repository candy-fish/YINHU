import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../hosting/', import.meta.url)));
process.argv = [process.execPath, fileURLToPath(new URL('../hosting/scripts/run-framework.mjs', import.meta.url)), 'dev', ...process.argv.slice(2)];
await import('../hosting/scripts/run-framework.mjs');
