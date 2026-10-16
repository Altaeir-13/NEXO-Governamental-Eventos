#!/usr/bin/env node
// Optional end-to-end QA. No real accounts, remote services or persistent D1.
// Build first. Set NEXO_PLAYWRIGHT_MODULE to a Playwright index.mjs when it is
// not installed locally. Screenshots and sanitized results stay in .tmp/.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.tmp/pwa-browser');
const reportFile = process.env.NEXO_QA_REPORT_FILE || 'report.json';
assert(/^[a-z0-9-]+\.json$/i.test(reportFile), 'QA report filename must be a simple JSON filename');
const port = Number(process.env.NEXO_QA_PORT || 8790);
const origin = `http://127.0.0.1:${port}`;
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid local QA port');
const suppliedModule = process.env.NEXO_PLAYWRIGHT_MODULE;
const playwright = await import(suppliedModule ? pathToFileURL(resolve(suppliedModule)).href : 'playwright').catch(async () => {
 const fallback = resolve(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 await access(fallback); return import(pathToFileURL(fallback).href);
});
await mkdir(output, { recursive: true });
const report = { scope: 'Disposable loopback Miniflare D1 only; 390×844 mobile browser emulation, not physical devices.', engines: [], pending: ['Android physical installation and camera permission/device selection', 'iPhone physical Safari/Home Screen installation and camera', 'Actual cellular/Wi-Fi transition and rear-camera focus in venue lighting'] };
let fixture;
let credentials;
const browsers = [];
const bounded = (promise, milliseconds, label) => new Promise((accept, reject) => {
 const timer = setTimeout(() => reject(new Error(`${label} timed out; check browser/runtime protocol compatibility`)), milliseconds);
 promise.then(value => { clearTimeout(timer); accept(value); }, error => { clearTimeout(timer); reject(error); });
});

async function fixtureStart() {
 fixture = spawn(process.execPath, [resolve(root, 'scripts/browser-fixture.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, NEXO_QA_PORT: String(port), NEXO_QA_PWA: '1', NEXO_QA_EDITORIAL: '0', NO_COLOR: '1' } });
 return new Promise((accept, reject) => {
  let text = '';
  const timeout = setTimeout(() => reject(new Error('Isolated QA fixture startup timed out')), 45000);
  fixture.stdout.on('data', chunk => {
   // The synthetic password is consumed only in memory; never forward stdout.
   text += chunk.toString();
   const email = text.match(/E-mail de teste: ([^\r\n]+)/)?.[1];
   const password = text.match(/Senha de teste \(somente memória\): ([^\r\n]+)/)?.[1];
   if (email && password) { clearTimeout(timeout); accept({ email, password }); text = ''; }
  });
  fixture.stderr.on('data', () => {});
  fixture.once('error', () => { clearTimeout(timeout); reject(new Error('Could not start isolated QA fixture')); });
  fixture.once('exit', code => { clearTimeout(timeout); if (!credentials) reject(new Error(`Isolated QA fixture exited (${code})`)); });
 });
}

async function executable(name, browserType) {
 const override = process.env[`NEXO_${name.toUpperCase()}_EXECUTABLE`];
 if (override) return override;
 const standard = browserType.executablePath();
 if (await access(standard).then(() => true, () => false)) return standard;
 assert(process.platform === 'win32' && process.env.LOCALAPPDATA, `Install a compatible ${name} Playwright browser`);
 const cache = resolve(process.env.LOCALAPPDATA, 'ms-playwright');
 const versions = (await readdir(cache)).filter(value => new RegExp(`^${name}-\\d+$`).test(value)).sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)));
 assert(versions.length, `No installed ${name} browser`);
 return resolve(cache, versions[0], ...(name === 'chromium' ? ['chrome-win64', 'chrome.exe'] : ['Playwright.exe']));
}

async function seed(engine, label) {
 const name = `Pessoa Fictícia QA ${engine} ${label}`;
 const response = await fetch(`${origin}/api/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'slz-2026', name, email: `qa-${randomUUID()}@example.invalid`, consent: true, website: '', idempotencyKey: randomUUID(), institution: 'Instituição Fictícia QA', course: 'Ensaio técnico' }) });
 assert.equal(response.status, 201, 'Could not register synthetic participant');
 return { ...await response.json(), name };
}
const waitText = async (locator, text) => { await locator.filter({ hasText: text }).first().waitFor({ state: 'visible' }); };
const noOverflow = async page => { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow at 390px'); };
const dialog = page => page.getByRole('dialog', { name: 'Confirmar identidade' });
const searchInput = page => page.getByRole('textbox', { name: 'Nome, código de inscrição ou link privado' });
async function navigateTab(page, name) {
 const menu = page.locator('.adm-menu-button');
 await menu.waitFor({ state: 'visible' });
 if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
 await page.getByRole('button', { name, exact: true }).click();
}
async function findParticipant(page, participant, byName = false) {
 await searchInput(page).fill(byName ? participant.name : participant.code);
 await page.getByRole('button', { name: 'Buscar inscrição', exact: true }).click();
 await page.locator('.adm-checkin-results button').filter({ hasText: participant.code }).click();
 await dialog(page).waitFor({ state: 'visible' });
 await waitText(dialog(page), participant.name);
}
async function confirm(page) {
 await dialog(page).getByRole('checkbox').check();
 await dialog(page).getByRole('button', { name: 'Confirmar presença', exact: true }).click();
 await dialog(page).waitFor({ state: 'hidden' });
 await waitText(page.locator('.adm-notice'), 'Presença confirmada');
}
async function participantState(page, participant) {
 const response = await page.request.get(`${origin}/api/admin/participants?eventId=slz-2026&q=${encodeURIComponent(participant.code)}`);
 assert.equal(response.status(), 200);
 return (await response.json()).participants.find(value => value.id === participant.id);
}

async function injectCamera(context) {
 await context.addInitScript(() => {
  const state = { mode: 'deny', qr: '', calls: [], streams: [] };
  window.__nexoQaCamera = state;
  const media = navigator.mediaDevices || {};
  Object.defineProperty(media, 'getUserMedia', { configurable: true, value: async constraints => {
   state.calls.push(constraints);
   if (state.mode === 'deny') throw new DOMException('Synthetic permission denial', 'NotAllowedError');
   if (state.mode === 'missing') throw new DOMException('Synthetic missing camera', 'NotFoundError');
   const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
   const drawing = canvas.getContext('2d');
   const image = new Image();
   if (state.qr) { image.src = state.qr; await image.decode(); }
   const draw = () => { drawing.fillStyle = 'white'; drawing.fillRect(0, 0, 640, 640); if (image.complete && image.naturalWidth) drawing.drawImage(image, 70, 70, 500, 500); };
   draw();
   const stream = canvas.captureStream(12);
   const timer = setInterval(draw, 80);
   const track = stream.getTracks()[0];
   const stop = track.stop.bind(track);
   track.stop = () => { clearInterval(timer); stop(); };
   state.streams.push(stream);
   return stream;
  } });
  Object.defineProperty(media, 'enumerateDevices', { configurable: true, value: async () => [{ kind: 'videoinput', deviceId: 'qa-back', groupId: 'qa', label: 'Câmera traseira fictícia' }, { kind: 'videoinput', deviceId: 'qa-front', groupId: 'qa', label: 'Câmera frontal fictícia' }] });
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
 });
}

async function verifyWorker(page, privateValues) {
 const canonical = await page.request.get(`${origin}/offline`, { maxRedirects: 0 });
 assert.equal(canonical.status(), 200);
 const redirected = await page.request.get(`${origin}/offline.html`, { maxRedirects: 0 });
 assert.equal(redirected.status(), 308);
 assert.equal(redirected.headers().location, '/offline');
 await bounded(page.evaluate(async () => { await navigator.serviceWorker.ready; }), 20000, 'Service worker readiness');
 await page.reload();
 await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
 const snapshot = await page.evaluate(async () => {
  const manifest = await fetch('/manifest.webmanifest').then(value => value.json());
  const keys = await caches.keys();
  const entries = [];
  for (const cacheName of keys) {
   const cache = await caches.open(cacheName);
   for (const request of await cache.keys()) {
    const response = await cache.match(request);
    entries.push({ url: request.url, text: await response.text() });
   }
  }
  return { manifest, keys, entries };
 });
 assert.equal(snapshot.manifest.name, 'NEXO Governamental — Eventos');
 assert.equal(snapshot.manifest.display, 'standalone');
 assert.equal(snapshot.manifest.start_url, '/');
 assert(snapshot.keys.some(key => key.startsWith('nexo-public-')), 'No installed PWA static cache');
 assert(snapshot.entries.length > 10, 'Static precache incomplete');
 for (const entry of snapshot.entries) {
  const url = new URL(entry.url);
  assert.equal(url.search, '');
  assert(/^\/assets\/|^\/icons\/|^\/(offline|manifest\.webmanifest|favicon\.svg)$/.test(url.pathname), 'Private/dynamic path entered public cache');
  for (const value of privateValues) assert(!entry.text.includes(value), 'Personal/credential value entered static cache');
 }
 return { cacheCount: snapshot.keys.length, assetCount: snapshot.entries.length };
}

async function runEngine(name) {
 const result = { engine: name, viewport: '390×844', passed: [], screenshots: [], notes: [], status: 'running' };
 const pass = message => { result.passed.push(message); console.log(`PASS ${name}: ${message}`); };
 report.engines.push(result);
 const browserType = playwright[name];
 const browser = await browserType.launch({ executablePath: await executable(name, browserType), headless: true, timeout: 20000 });
 browsers.push(browser);
 result.browserVersion = browser.version();
 const reducedMotion = process.env.NEXO_QA_REDUCED_MOTION === '1';
 if (reducedMotion) result.notes.push('This run used prefers-reduced-motion; physical devices and default-motion touch behavior remain pending.');
 const context = await bounded(browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'allow', reducedMotion: reducedMotion ? 'reduce' : 'no-preference' }), 20000, `${name} context`);
 await injectCamera(context);
 let page = await bounded(context.newPage(), 20000, `${name} page`);
 page.setDefaultTimeout(15000);
 const errors = [];
 result.browserErrors = errors;
 page.on('pageerror', error => errors.push({ name: error.name, at: new Date().toISOString(), route: page.url().replace(/[a-f0-9]{64}/g, '[redacted-token]'), afterScenario: result.passed.at(-1) || 'Initial navigation/login', message: String(error.message).replaceAll(credentials.password, '[redacted]').replace(/[a-f0-9]{64}/g, '[redacted-token]'), stack: String(error.stack || '').replaceAll(credentials.password, '[redacted]').replace(/[a-f0-9]{64}/g, '[redacted-token]').slice(0, 1800) }));
 const first = await seed(name, 'Manual');
 const second = await seed(name, 'Conexao');
 const cancelled = await seed(name, 'Cancelada');
 await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
 await noOverflow(page);
 await page.getByRole('textbox', { name: 'E-mail institucional' }).fill(credentials.email);
 await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(credentials.password);
 await page.getByRole('button', { name: 'Entrar na plataforma' }).click();
 await navigateTab(page, 'Credenciamento');
 await page.getByRole('heading', { name: 'Recepção em números', exact: true }).waitFor();
 await page.locator('.adm-reception-updated').waitFor({ state: 'visible' });
 await page.waitForFunction(() => document.querySelector('.adm-sidebar').getBoundingClientRect().right <= 0);
 await noOverflow(page);
 pass('Synthetic admin login; Credenciamento mobile navigation; no horizontal overflow');
 await page.getByRole('button', { name: 'Iniciar leitura', exact: true }).click();
 await waitText(page.locator('.adm-notice'), 'Acesso à câmera negado');
 await page.evaluate(() => { window.__nexoQaCamera.mode = 'missing'; });
 await page.getByRole('button', { name: 'Iniciar leitura', exact: true }).click();
 await waitText(page.locator('.adm-notice'), 'Nenhuma câmera foi encontrada');
 pass('UI handles synthetic permission denial and missing camera, retaining manual alternative');
 await findParticipant(page, first, true);
 await waitText(dialog(page), 'Ainda não possui presença registrada');
 await noOverflow(page);
 await confirm(page);
 assert((await participantState(page, first)).checked_in_at, 'Manual attendance was not stored');
 pass('Manual name search; identity confirmation; real D1 attendance/operator/time');
 await findParticipant(page, first);
 await waitText(dialog(page), 'Ingresso já utilizado');
 assert.equal(await dialog(page).getByRole('button', { name: 'Confirmar presença', exact: true }).count(), 0);
 await dialog(page).getByRole('button', { name: 'Próximo participante' }).click();
 pass('Code search; duplicate shows previous attendance and cannot confirm again');
 await searchInput(page).fill('https://invalid.example/ingresso#invalid');
 await page.getByRole('button', { name: 'Buscar inscrição', exact: true }).click();
 await waitText(page.locator('.adm-notice'), 'não é um ingresso válido');
 assert.equal(await dialog(page).count(), 0);
 pass('Invalid QR/link rejected without opening confirmation');
 const observedGets = [];
 const recordGet = request => { if (request.method() === 'GET') observedGets.push(request.url()); };
 page.on('request', recordGet);
 await searchInput(page).fill(`/ingresso#${first.token}`);
 await page.getByRole('button', { name: 'Buscar inscrição', exact: true }).click();
 await waitText(page.locator('.adm-notice'), 'não é um ingresso válido');
 page.off('request', recordGet);
 assert(!observedGets.some(url => url.includes(first.token)), 'Malformed private link leaked token into GET query');
 pass('Malformed private ticket input never enters a GET/search URL');
 const session = await page.request.get(`${origin}/api/admin/session`).then(value => value.json());
 const cancellation = await page.request.patch(`${origin}/api/admin/participants/${cancelled.id}`, { headers: { Origin: origin, 'X-CSRF-Token': session.csrf }, data: { status: 'cancelled' } });
 assert.equal(cancellation.status(), 200);
 await findParticipant(page, cancelled);
 await waitText(dialog(page), 'Ingresso cancelado');
 assert.equal(await dialog(page).getByRole('button', { name: 'Confirmar presença', exact: true }).count(), 0);
 await dialog(page).getByRole('button', { name: 'Próximo participante' }).click();
 pass('Cancelled ticket cannot confirm attendance');
 await findParticipant(page, second);
 await dialog(page).getByRole('checkbox').check();
 await context.setOffline(true);
 await dialog(page).getByRole('button', { name: 'Confirmar presença', exact: true }).click();
 await waitText(dialog(page), 'Confirmação não concluída nesta tela');
 assert.equal(await page.locator('.adm-notice').filter({ hasText: 'Presença confirmada' }).count(), 0);
 assert(!(await participantState(page, second)).checked_in_at, 'Offline failure unexpectedly wrote attendance');
 await context.setOffline(false);
 await dialog(page).getByRole('button', { name: 'Consultar novamente' }).click();
 await dialog(page).getByRole('checkbox').waitFor({ state: 'visible' });
 await page.waitForFunction(() => !document.querySelector('dialog input[type="checkbox"]')?.disabled);
 await confirm(page);
 pass('Connection failure shows no false success; reconnection/recheck safely permits confirmation');
 await page.reload({ waitUntil: 'networkidle' });
 await navigateTab(page, 'Credenciamento');
 await findParticipant(page, second);
 await waitText(dialog(page), 'Ingresso já utilizado');
 await dialog(page).getByRole('button', { name: 'Próximo participante' }).click();
 pass('Reopening restores authenticated interface and server attendance');

 if (name === 'chromium') {
  const a = await seed(name, 'CameraPrimeira'); const b = await seed(name, 'CameraSegunda'); const c = await seed(name, 'CameraTerceira');
  const qrA = await QRCode.toDataURL(a.token, { width: 500, margin: 4 });
  const qrB = await QRCode.toDataURL(b.token, { width: 500, margin: 4 });
  const qrC = await QRCode.toDataURL(c.token, { width: 500, margin: 4 });
  await page.evaluate(qr => { window.__nexoQaCamera.mode = 'stream'; window.__nexoQaCamera.qr = qr; window.__nexoQaCamera.calls = []; }, qrA);
  await page.getByRole('button', { name: 'Iniciar leitura', exact: true }).click();
  await waitText(dialog(page), a.name);
  assert(await page.evaluate(() => window.__nexoQaCamera.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), 'QR read did not release stream');
  await confirm(page);
  await page.evaluate(qr => { window.__nexoQaCamera.qr = qr; }, qrB);
  await page.getByRole('button', { name: 'Iniciar leitura', exact: true }).click();
  await waitText(dialog(page), b.name);
  await page.evaluate(qr => { window.__nexoQaCamera.qr = qr; }, qrC);
  await page.waitForTimeout(1900);
  assert.equal(await page.evaluate(() => window.__nexoQaCamera.calls.length), 2, 'Stale restart timer opened camera behind confirmation');
  await waitText(dialog(page), b.name);
  await confirm(page);
  await waitText(dialog(page), c.name);
  assert.equal(await page.evaluate(() => window.__nexoQaCamera.calls.length), 3);
  await page.evaluate(() => { window.__nexoQaCamera.qr = ''; });
  await dialog(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.locator('video[aria-label="Leitor de QR Code pela câmera"]').waitFor({ state: 'visible' });
  await page.locator('.adm-camera-select select').selectOption('qa-front');
  await page.getByRole('button', { name: 'Iniciar leitura', exact: true }).click();
  await page.waitForFunction(() => window.__nexoQaCamera.calls.at(-1)?.video?.deviceId?.exact === 'qa-front');
  await navigateTab(page, 'Participantes');
  assert(await page.evaluate(() => window.__nexoQaCamera.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), 'Navigation did not release stream');
  pass('Actual ZXing decodes QR from synthetic canvas MediaStream; stops tracks; safe manual/automatic resumption; stale-timer regression; camera selection; cleanup on leave');
  const cache = await verifyWorker(page, [credentials.password, session.csrf, first.token, second.token, first.name, credentials.email]);
  pass(`Manifest and real SW installation/control; ${cache.assetCount} public cached resources, no private paths/values`);
  await navigateTab(page, 'Credenciamento');
  await searchInput(page).fill('Formulário preservado no ensaio');
  const release = await page.request.post(`${origin}/__qa/pwa-release`); assert.equal(release.status(), 200);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  await waitText(page.locator('.pwa-update'), 'Atualização pronta');
  assert.equal(await searchInput(page).inputValue(), 'Formulário preservado no ensaio');
  pass('New SW waits without reloading or losing entered form');
  await page.close();
  await new Promise(accept => setTimeout(accept, 500));
  page = await context.newPage();
  await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
  await page.waitForFunction(async () => { const registration = await navigator.serviceWorker.getRegistration(); return !!registration?.active && !registration.waiting; });
  assert.equal(await page.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('nexo-public-')).length), 1);
  assert(await page.evaluate(async () => (await caches.keys()).some(key => key.endsWith('-qa1'))));
  pass('Closing all app pages activates update and removes previous public cache');
  await context.setOffline(true);
  const response = await page.goto(`${origin}/admin`);
  assert.equal(response.status(), 503);
  await page.getByRole('heading', { name: 'Precisamos de uma conexão.' }).waitFor();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Tentar abrir o aplicativo' }).click();
  await page.locator('body').filter({ hasText: 'Ensaio técnico NEXO' }).waitFor();
  pass('Offline reopening gives generic 503 without personal data; reconnect recovers browser app');
 } else result.notes.push('WebKit engine emulation covers UI only; physical iPhone install/camera remains pending.');
 await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
 await navigateTab(page, 'Credenciamento');
 await page.getByRole('heading', { name: 'Recepção em números', exact: true }).waitFor();
 await page.locator('.adm-reception-updated').waitFor({ state: 'visible' });
 await page.waitForFunction(() => document.querySelector('.adm-sidebar').getBoundingClientRect().right <= 0);
 await noOverflow(page);
 const screenshot = resolve(output, `${name}-credenciamento-390.png`);
 await page.screenshot({ path: screenshot, fullPage: true });
 result.screenshots.push(screenshot);
 assert.equal(errors.length, 0, 'Browser emitted uncaught page error');
 result.status = 'passed';
 console.log(`PASS ${name}: ${result.passed.length} browser scenarios (${result.browserVersion})`);
 await context.close(); await browser.close();
}

try {
 credentials = await fixtureStart();
 for (const engine of (process.env.NEXO_QA_ENGINES || 'chromium,webkit').split(',').filter(value => ['chromium', 'webkit'].includes(value))) {
  try { await runEngine(engine); }
  catch (error) {
   const result = report.engines.at(-1);
   result.status = 'failed';
   // Error messages from selectors may contain synthetic names; never passwords/tokens.
   result.error = String(error?.message || error).replaceAll(credentials.password, '[redacted]').replace(/[a-f0-9]{64}/g, '[redacted-token]');
   const failedPage = browsers.at(-1)?.contexts().at(-1)?.pages().at(-1);
   if (failedPage && !failedPage.isClosed()) {
    const screenshot = resolve(output, `${engine}-failed.png`);
    await failedPage.screenshot({ path: screenshot, fullPage: true, timeout: 5000 }).then(() => result.screenshots.push(screenshot)).catch(() => {});
    result.screenText = (await failedPage.locator('body').innerText({ timeout: 3000 }).catch(() => '')).replaceAll(credentials.password, '[redacted]').replace(/[a-f0-9]{64}/g, '[redacted-token]').slice(0, 4000);
   }
   console.error(`FAIL ${engine}: ${result.error.split('\n')[0]}`);
   process.exitCode = 1;
  }
 }
} catch (error) { report.startupError = String(error?.message || error); console.error('FAIL isolated browser QA startup'); process.exitCode = 1; }
finally {
 for (const browser of browsers) await bounded(browser.close(), 5000, 'Browser cleanup').catch(() => {});
 if (fixture && fixture.exitCode === null) fixture.kill('SIGTERM');
 await writeFile(resolve(output, reportFile), JSON.stringify(report, null, 2));
 console.log(`Sanitized QA report: ${resolve(output, reportFile)}`);
}
