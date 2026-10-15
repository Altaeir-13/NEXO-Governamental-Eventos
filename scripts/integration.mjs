import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Same integration suite as npm test, exposed separately for CI and operators.
// Runs only disposable Miniflare D1; never reads .dev.vars or remote credentials.
const runner = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [runner, 'run', 'tests/integration.test.ts', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  env: { ...process.env, NO_COLOR: '1' },
});
if (result.error) {
  console.error('Não foi possível executar os testes. Execute npm ci e tente novamente.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
