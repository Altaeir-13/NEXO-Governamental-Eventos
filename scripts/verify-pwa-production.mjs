// Read-only post-deployment smoke test. Does not authenticate or write attendance.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = 'https://nexo-governamental-eventos.pages.dev';
const checks = [];
async function get(path, status = 200, options) {
  const response = await fetch(`${base}${path}`, { cache: 'no-store', ...options });
  assert.equal(response.status, status, `${path}: HTTP ${response.status}`);
  checks.push(`${options?.method || 'GET'} ${path}: ${status}`);
  return response;
}
const home = await get('/');
const html = await home.text();
assert.match(html, /rel="manifest"/); assert.match(html, /apple-touch-icon/);
assert.match(home.headers.get('Permissions-Policy') || '', /camera=\(self\)/);
await get('/admin');
const manifest = await (await get('/manifest.webmanifest')).json();
assert.equal(manifest.name, 'NEXO Governamental — Eventos');
assert.equal(manifest.short_name, 'NEXO Eventos');
assert.equal(manifest.display, 'standalone');
for (const [path, dimension] of [['/icons/icon-192.png', 192], ['/icons/icon-512.png', 512], ['/icons/icon-maskable-512.png', 512], ['/icons/apple-touch-icon.png', 180]]) {
  const png = Buffer.from(await (await get(path)).arrayBuffer());
  assert.equal(png.readUInt32BE(16), dimension); assert.equal(png.readUInt32BE(20), dimension);
}
const worker = await get('/sw.js');
assert.match(worker.headers.get('Cache-Control') || '', /no-store|no-cache/);
const script = await worker.text();
// Git/Windows may use CRLF locally and LF on Linux CI. The generated cache ID
// hashes those public source bytes; compare implementation and exact asset list.
const normalizeWorker = value => value.replace(/\r\n/g, '\n').replace(/nexo-public-[a-f0-9]{20}/, 'nexo-public-VERSION');
assert.equal(normalizeWorker(script), normalizeWorker(await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8')), 'Worker e allowlist remotos correspondem ao build validado');
for (const path of [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+\.(?:js|css))"/g)].map(match => match[1])) await get(path);
const session = await get('/api/admin/session', 401);
assert.match(session.headers.get('Cache-Control') || '', /no-store/);
for (const path of ['/api/admin/check-in/lookup', '/api/admin/check-in']) await get(path, 401, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'slz-2026', code: 'QA-INEXISTENTE', confirmIdentity: true }) });
const event = (await (await get('/api/event?slug=labirinto-da-liberdade')).json()).event;
assert.equal(event.registration_open, 0, 'Inscrições oficiais continuam fechadas');
assert.equal(event.certificates_released, 0, 'Certificados continuam bloqueados');
assert.equal(event.certificate_rules_approved, 0);
assert.equal(event.certificate_hours, 5, 'Carga horária preservada');
console.log(JSON.stringify({ ok: true, site: base, checks, officialRegistrationClosed: true, certificatesBlocked: true, certificateHours: 5 }, null, 2));
