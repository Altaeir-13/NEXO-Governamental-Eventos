#!/usr/bin/env node
// Optional browser QA harness. All records live in disposable Miniflare D1.
// It never reads .dev.vars, Wrangler profiles, .wrangler data or Cloudflare APIs.
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const temporary = resolve(root, '.tmp');
const port = Number(process.env.NEXO_QA_PORT || 8790);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta QA inválida.');
await stat(resolve(dist, 'index.html')).catch(() => { throw new Error('Execute npm run build antes do ensaio de navegador.'); });
await mkdir(temporary, { recursive: true });
const bundle = resolve(temporary, 'qa-api.mjs');
await build({ entryPoints: [resolve(root, 'functions/_lib/api.ts')], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: bundle, external: ['node:*'], logLevel: 'warning' });
const { handleApi } = await import(pathToFileURL(bundle).href);
// Bundle the hashing implementation from the application, never a parallel password rule.
const securityBundle = resolve(temporary, 'qa-security.mjs');
await build({ entryPoints: [resolve(root, 'functions/_lib/security.ts')], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: securityBundle, external: ['node:*'], logLevel: 'warning' });
const { hashPassword } = await import(pathToFileURL(securityBundle).href);
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("Ensaio técnico isolado"); } };', compatibilityDate: '2026-08-01', d1Databases: { DB: randomUUID() }, d1Persist: false });
const db = await mf.getD1Database('DB');
const env = { DB: db, TOKEN_SECRET: randomBytes(32).toString('hex') };
for (const filename of (await readdir(resolve(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
  const migration = await readFile(resolve(root, 'migrations', filename), 'utf8');
  for (const statement of unstable_splitSqlQuery(migration)) await db.prepare(statement).run();
}
await db.prepare(`UPDATE events SET slug='ensaio-tecnico-nexo',title='Ensaio técnico NEXO — dados fictícios',
 description='Ambiente temporário de ensaio técnico. Todos os participantes, instituições e dados inseridos nesta versão são fictícios e serão descartados ao encerrar o servidor.',
 city='São Luís — ensaio fictício',event_date='2000-11-11',date_confirmed=1,venue_confirmed=1,
 venue='Instituição fictícia de ensaio',auditorium='Auditório fictício',address='Endereço fictício de testes, São Luís — MA',
 registration_open=1,registration_starts=NULL,registration_ends=NULL,capacity=120,
 certificate_available_at='2000-12-01T03:00:00.000Z',certificate_rules_approved=1,certificates_released=1,
 signatories='Coordenação fictícia — certificado exclusivamente de ensaio',contact_email='organizacao@example.invalid',
 contact_url='',instagram_url='',venue_photo_url='',venue_photo_authorized=0`).run();
const email = 'admin-ensaio@example.invalid';
const password = `Ensaio-Ficticio-${randomBytes(8).toString('hex')}!`;
await db.prepare('INSERT INTO admin_users(id,email,name,password_hash,role) VALUES (?,?,?,?,?)')
  .bind(randomUUID(), email, 'Equipe fictícia de ensaio', await hashPassword(password), 'admin').run();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
let sequence = 0;
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      headers.set('CF-Connecting-IP', `192.0.2.${(++sequence % 250) + 1}`);
      const chunks = []; let length = 0;
      for await (const chunk of incoming) { length += chunk.length; if (length > 65536) { outgoing.writeHead(413); outgoing.end('Solicitação muito grande.'); return; } chunks.push(chunk); }
      const request = new Request(url, { method: incoming.method, headers, ...(!['GET', 'HEAD'].includes(incoming.method || 'GET') ? { body: Buffer.concat(chunks) } : {}) });
      const response = await handleApi(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(incoming.method || 'GET')) { outgoing.writeHead(405); outgoing.end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    let target = resolve(dist, `.${pathname}`);
    if (target !== dist && !target.startsWith(dist + sep)) { outgoing.writeHead(403); outgoing.end(); return; }
    let exists = await stat(target).catch(() => null);
    if (exists?.isDirectory()) target = resolve(target, 'index.html');
    exists = await stat(target).catch(() => null);
    if (!exists?.isFile()) {
      if (extname(pathname)) { outgoing.writeHead(404); outgoing.end('Arquivo não encontrado.'); return; }
      target = resolve(dist, 'index.html');
    }
    const data = await readFile(target);
    outgoing.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    outgoing.end(incoming.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error('NEXO_QA_REQUEST_ERROR', error instanceof Error ? error.name : 'unknown');
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    outgoing.end('Falha no servidor isolado de ensaio.');
  }
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  await mf.dispose();
  console.log('Ensaio encerrado. O banco efêmero foi descartado.');
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
server.on('error', async error => { console.error(error.message); await mf.dispose(); process.exitCode = 1; });
await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
console.log(`\nENSAIO TÉCNICO — TODOS OS DADOS SÃO FICTÍCIOS E DESCARTÁVEIS\nURL: http://127.0.0.1:${port}\nAdmin: http://127.0.0.1:${port}/admin\nE-mail de teste: ${email}\nSenha de teste (somente memória): ${password}\nNão utilize dados reais. Ctrl+C encerra e descarta o banco.\n`);
