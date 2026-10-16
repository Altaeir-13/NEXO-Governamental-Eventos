import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PwaControls } from '../src/pwa/PwaControls';

const origin = 'https://nexo.test';
const allowlist = ['/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/assets/app-test.js', '/assets/style-test.css'];
const worker = readFileSync(new URL('../src/pwa/service-worker.js', import.meta.url), 'utf8').replace('__CACHE_VERSION__', 'test').replace('__PUBLIC_ASSETS__', JSON.stringify(allowlist));
type WorkerRequest = { url: string; method: string; mode: string };

function harness() {
 const listeners = new Map<string, (event: unknown) => void>();
 const stores = new Map<string, Map<string, Response>>();
 const key = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
 const put = vi.fn();
 const caches = {
  open: vi.fn(async (name: string) => {
   if (!stores.has(name)) stores.set(name, new Map());
   const store = stores.get(name)!;
   return { put: async (request: string | Request, response: Response) => { put(key(request)); store.set(key(request), response.clone()); }, match: async (request: string | Request) => store.get(key(request))?.clone() };
  }),
  keys: vi.fn(async () => [...stores.keys()]),
  delete: vi.fn(async (name: string) => stores.delete(name)),
 };
 const fetch = vi.fn(async (request: Request | WorkerRequest) => {
  const path = new URL(request.url).pathname;
  const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.webmanifest') ? 'application/manifest+json' : path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'image/png';
  return new Response(path === '/offline.html' ? '<h1>Sem conexão</h1>' : 'public static file', { headers: { 'Content-Type': type } });
 });
 const skipWaiting = vi.fn(); const claim = vi.fn();
 runInNewContext(worker, { self: { location: { origin }, addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener), skipWaiting, clients: { claim } }, caches, fetch, Request, Response, URL });
 async function lifecycle(name: 'install' | 'activate') {
  let pending: Promise<unknown> | undefined;
  listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
 }
 function request(path: string, options: Partial<WorkerRequest> = {}) {
  let response: Promise<Response> | undefined;
  const value = new Request(new URL(path, origin), { method: options.method || 'GET' });
  // Node cannot construct mode=navigate; real browser FetchEvents provide it.
  Object.defineProperty(value, 'mode', { value: options.mode || 'cors' });
  listeners.get('fetch')!({ request: value, respondWith: (promise: Promise<Response>) => { response = promise; } });
  return response;
 }
 return { lifecycle, request, fetch, put, caches, stores, skipWaiting, claim };
}

describe('PWA: instalação e identidade pública', () => {
 it('usa identidade, escopo público e ícones PNG nos tamanhos de Android e iOS', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  expect(manifest).toMatchObject({ id: '/', name: 'NEXO Governamental — Eventos', short_name: 'NEXO Eventos', display: 'standalone', start_url: '/', scope: '/', theme_color: '#191F51' });
  for (const [path, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
   const png = readFileSync(new URL(`../public/icons/${path}`, import.meta.url));
   expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
   expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  expect(html).toContain('rel="manifest"'); expect(html).toContain('rel="apple-touch-icon"');
 });
 it('oferece instruções acessíveis para as duas plataformas e explicita a conexão necessária', () => {
  const html = renderToStaticMarkup(<PwaControls />);
  for (const text of ['<summary>', 'Android:', 'Chrome', 'iPhone:', 'Safari', 'Compartilhar', 'Adicionar à Tela de Início', 'não registra credenciamento offline', 'Verificar atualização', 'todas as abas e janelas']) expect(html).toContain(text);
  expect(html).toContain('aria-live="polite"');
 });
});

describe('PWA: cache restrito, privacidade e falhas de conexão', () => {
 it('prepara exclusivamente a allowlist, sem cookies, e reutiliza estáticos sem consulta adicional', async () => {
  const sw = harness(); await sw.lifecycle('install');
  expect(sw.put).toHaveBeenCalledTimes(allowlist.length);
  expect([...sw.stores.get('nexo-public-test')!.keys()]).toEqual(allowlist.map(path => `${origin}${path}`));
  for (const [request] of sw.fetch.mock.calls) expect(request).toMatchObject({ credentials: 'omit', cache: 'reload', redirect: 'error' });
  sw.fetch.mockClear();
  const response = await sw.request('/assets/app-test.js');
  expect(response?.status).toBe(200); expect(sw.fetch).not.toHaveBeenCalled();
 });
 it.each([
  '/api/event', '/api/admin/check-in', '/api/admin/session', '/api/ticket?token=secret', '/api/certificate/secret.pdf',
  '/admin', '/ingresso', '/certificados', '/assets/not-in-this-build.js', '/assets/app-test.js?token=secret', '/icons/icon-192.png?v=secret',
  'https://external.test/assets/app-test.js',
 ])('não intercepta nem persiste dados fora da allowlist: %s', async path => {
  const sw = harness();
  expect(sw.request(path)).toBeUndefined(); expect(sw.fetch).not.toHaveBeenCalled(); expect(sw.caches.open).not.toHaveBeenCalled(); expect(sw.put).not.toHaveBeenCalled();
 });
 it('não intercepta POST mesmo que o caminho pareça estático', () => {
  const sw = harness(); expect(sw.request('/assets/app-test.js', { method: 'POST' })).toBeUndefined(); expect(sw.put).not.toHaveBeenCalled();
 });
 it('não guarda HTML privado durante a navegação', async () => {
  const sw = harness();
  sw.fetch.mockResolvedValueOnce(new Response('private HTML with personal data', { headers: { 'Cache-Control': 'private, no-store' } }));
  const response = await sw.request('/ingresso?token=secret', { mode: 'navigate' });
  expect(await response?.text()).toBe('private HTML with personal data'); expect(sw.put).not.toHaveBeenCalled(); expect(sw.caches.open).not.toHaveBeenCalled();
 });
 it('na reabertura sem internet responde 503 com aviso genérico e nenhum sucesso de credenciamento', async () => {
  const sw = harness(); await sw.lifecycle('install'); sw.put.mockClear();
  sw.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const response = await sw.request('/admin?token=secret', { mode: 'navigate' });
  expect(response?.status).toBe(503); expect(response?.headers.get('Cache-Control')).toBe('no-store');
  expect(await response?.text()).toBe('<h1>Sem conexão</h1>'); expect(sw.put).not.toHaveBeenCalled();
 });
 it.each(['private', 'no-store'])('recusa resposta de instalação marcada como %s e remove cache incompleto', async policy => {
  const sw = harness(); sw.fetch.mockImplementation(async () => new Response('private', { headers: { 'Content-Type': 'text/html', 'Cache-Control': policy } }));
  await expect(sw.lifecycle('install')).rejects.toThrow('Public resource unavailable'); expect(sw.stores.has('nexo-public-test')).toBe(false);
 });
 it('recusa HTML retornado por engano para um asset JavaScript', async () => {
  const sw = harness(); sw.fetch.mockImplementation(async () => new Response('SPA fallback', { headers: { 'Content-Type': 'text/html' } }));
  await expect(sw.lifecycle('install')).rejects.toThrow('Public resource unavailable'); expect(sw.stores.has('nexo-public-test')).toBe(false);
 });
 it('só grava na instalação, sem adicionar ao cache respostas de execução', async () => {
  const sw = harness();
  const response = await sw.request('/assets/app-test.js');
  expect(response?.status).toBe(200); expect(sw.put).not.toHaveBeenCalled();
  expect(sw.fetch.mock.calls[0][0]).toMatchObject({ credentials: 'omit', redirect: 'error' });
 });
 it('não toma controle de abas ativas e limpa apenas versões NEXO após a ativação normal', async () => {
  const sw = harness();
  await sw.caches.open('nexo-public-old'); await sw.caches.open('other-app-cache');
  await sw.lifecycle('install'); await sw.lifecycle('activate');
  expect(sw.skipWaiting).not.toHaveBeenCalled(); expect(sw.claim).not.toHaveBeenCalled();
  expect(await sw.caches.keys()).toEqual(['other-app-cache', 'nexo-public-test']);
 });
});
