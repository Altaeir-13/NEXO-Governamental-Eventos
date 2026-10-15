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
const editorialQa = process.env.NEXO_QA_EDITORIAL === '1';
// Synthetic 8×8 navy/teal checkerboard, exclusively a technical image fixture.
// It is never written to public/ or dist/ and does not depict a person or venue.
const editorialPattern = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAI0lEQVR4nGOQlA+UlA9sfnWj+dUNZDYDTglMIQgbtwQd7AAAADVZwXkGfusAAAAASUVORK5CYII=', 'base64');
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
if (editorialQa) {
  await db.prepare(`UPDATE events SET registration_open=0,certificates_released=0,certificate_rules_approved=0,
   venue_confirmed=0,latitude=0,longitude=0,venue_photo_url='/images/qa-editorial.png',venue_photo_authorized=1,
   venue_photo_alt='Padrão geométrico sintético para ensaio de imagem; não representa uma instituição real',
   venue_photo_credit='Imagem sintética exclusiva do ensaio técnico',venue_photo_source_url='',
   venue_description='Este local é inteiramente fictício e existe somente para verificar a apresentação editorial em ambiente isolado. A imagem é um padrão geométrico sintético, sem representar um auditório ou uma instituição real. Nenhum conteúdo deste ensaio será publicado em produção.'`).run();
  // The database above is disposable and independent of all production data.
  await db.prepare('DELETE FROM speakers').run();
  const fixtures = [
    {
      id: 'qa-aurora', name: 'Aurora — convidada fictícia', role: 'Jurista fictícia de ensaio', area: 'Justiça e direitos — cenário fictício', institution: 'Instituto Fictício Aurora', time: '18:30', published: 1,
      photo: '/images/qa-editorial.png',
      bio: 'Aurora é uma personagem fictícia criada exclusivamente para este ensaio da interface. Seu perfil simulado representa uma profissional da área jurídica interessada em direitos fundamentais e reintegração social. A trajetória descrita não corresponde a uma pessoa real, formação reconhecida ou vínculo profissional existente. O texto permite avaliar a legibilidade da biografia e o equilíbrio visual do primeiro card.',
      title: 'Direitos e reintegração — participação fictícia',
      summary: 'Nesta participação inteiramente fictícia, o cenário de teste propõe uma conversa sobre acesso a direitos, serviços públicos e oportunidades após o cárcere. O resumo serve para verificar a hierarquia visual entre trajetória e tema, o espaçamento entre parágrafos e a leitura em telas pequenas. Não representa uma palestra aprovada por profissional real nem integra a programação de produção.'
    },
    {
      id: 'qa-bento', name: 'Bento — convidado fictício', role: 'Psicólogo fictício de ensaio', area: 'Psicologia social — cenário fictício', institution: 'Centro Fictício Bento', time: '19:00', published: 1,
      photo: '',
      bio: 'Bento é um personagem fictício utilizado para conferir a apresentação de convidados sem fotografia. O perfil simulado aborda a psicologia social e os vínculos comunitários como assuntos de teste. Nenhuma credencial, experiência ou instituição mencionada se refere a uma pessoa existente. Sua descrição foi preparada para exercitar a leitura de um segundo texto editorial com extensão adequada ao formulário administrativo.',
      title: 'Saúde mental e vínculos — participação fictícia',
      summary: 'O segundo cenário simulado explora o acolhimento psicossocial, as relações familiares e a reconstrução de perspectivas após períodos de privação de liberdade. Seu objetivo técnico é testar um card com iniciais, comparar alturas entre conteúdos diferentes e verificar a exibição do horário. Este material permanece restrito ao banco efêmero de ensaio e não atribui um tema a qualquer convidado real.'
    },
    {
      id: 'qa-cecilia', name: 'Cecília — convidada fictícia', role: 'Pesquisadora fictícia de ensaio', area: 'Políticas públicas — cenário fictício', institution: 'Laboratório Fictício Cecília', time: '19:30', published: 1,
      photo: '/images/missing.png',
      bio: 'Cecília é uma personagem fictícia destinada à avaliação de falhas no carregamento de imagens. O cadastro de demonstração apresenta uma pesquisadora simulada de políticas públicas e inclusão social. Não há pessoa, currículo ou vínculo institucional real associado a este nome de teste. A biografia permite observar o comportamento do terceiro card quando uma fotografia autorizada está temporariamente indisponível no servidor local.',
      title: 'Oportunidades e políticas públicas — participação fictícia',
      summary: 'A terceira participação fictícia utiliza como contexto os obstáculos de acesso ao trabalho, o estigma social e as políticas de inclusão. O conteúdo foi escrito para verificar a recuperação visual após um arquivo de imagem inexistente, preservando a leitura do nome, da biografia e do tema. Nenhum argumento deste resumo corresponde a compromisso assumido por palestrante real ou informação publicada no evento.'
    },
    {
      id: 'qa-oculto', name: 'CADASTRO FICTÍCIO OCULTO', role: 'Profissional fictício não publicado', area: 'Controle de publicação fictício', institution: 'Instituição Fictícia Oculta', time: null, published: 0,
      photo: '',
      bio: 'Este cadastro fictício permanece despublicado para verificar que o site oculta corretamente registros administrativos. Sua confirmação e suas aprovações simuladas permitem isolar o efeito do campo de publicação. Nenhum dado corresponde a pessoa real ou compromisso do evento. A descrição só pode aparecer no painel do ambiente local, sem integrar os cards apresentados aos visitantes durante o ensaio técnico.',
      title: 'Tema fictício que deve permanecer oculto',
      summary: 'Este resumo foi criado apenas para o registro fictício despublicado. Ele permite conferir que nem o nome nem o tema de uma participação oculta aparecem na resposta pública da plataforma. O texto possui extensão editorial adequada e aprovações simuladas, mas o controle de publicação continua desabilitado. Todo o cadastro será descartado quando o servidor temporário de ensaio for encerrado.'
    }
  ];
  for (const fixture of fixtures) {
    await db.prepare(`INSERT INTO speakers(id,event_id,name,role,area,institution,bio,photo_url,social_url,
     invitation_status,published,display_order,credentials_verified,bio_approved,talk_title,talk_summary,
     talk_approved,photo_authorized,photo_credit,participation_time) VALUES (?,?,?,?,?,?,?,?,?,'confirmed',?,?,1,1,?,?,1,?,?,?)`)
      .bind(fixture.id, 'slz-2026', fixture.name, fixture.role, fixture.area, fixture.institution, fixture.bio, fixture.photo, '',
        fixture.published, fixtures.indexOf(fixture), fixture.title, fixture.summary, fixture.photo ? 1 : 0,
        fixture.photo ? 'Imagem sintética de ensaio; não é um retrato' : '', fixture.time).run();
  }
}
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
    if (editorialQa && url.pathname === '/images/qa-editorial.png') {
      outgoing.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': editorialPattern.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      outgoing.end(incoming.method === 'HEAD' ? undefined : editorialPattern);
      return;
    }
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
if (editorialQa) console.log('Modo editorial: três convidados fictícios publicados, um oculto; padrão sintético carregável, iniciais e imagem ausente. Inscrições e certificados fechados.');
