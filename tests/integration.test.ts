import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { PDFDocument } from 'pdf-lib';
import { certificatePdf, ticketPdf, type CertificateSnapshot } from '../shared/pdf';
import type { EventSettings, Participant, PublicEvent, Speaker, Ticket } from '../shared/types';
import { handleApi } from '../functions/_lib/api';
import { hashPassword, type Env } from '../functions/_lib/security';

// Every operation uses real D1 SQL (Miniflare/workerd), with d1Persist disabled.
// No Wrangler profile, .dev.vars, local development DB or remote DB is read.
const ORIGIN = 'https://nexo.test';
const EVENT = 'slz-2026';
const PASSWORD = 'Senha apenas ficticia para testes 123!';
const EDITORIAL_BIO = 'Pessoa Fictícia é profissional de uma instituição de ensino usada exclusivamente neste ensaio. Sua trajetória fictícia reúne atividades de formação, pesquisa e diálogo sobre direitos fundamentais e reintegração social. Participa desta simulação para verificar a apresentação de informações institucionais aprovadas, sem representar uma pessoa real ou qualquer credencial profissional verdadeira.';
const EDITORIAL_TALK = 'A participação fictícia aborda os desafios da reintegração social e o papel das instituições na ampliação de oportunidades. O encontro de teste propõe uma reflexão sobre estigma, acesso a direitos e vínculos comunitários, relacionando diferentes perspectivas profissionais para avaliar exclusivamente o funcionamento editorial da plataforma.';
type Session = { cookie: string; csrf: string };
type Registration = { token: string; code: string; id: string };
let mf: Miniflare;
let db: D1Database;
let env: Env;
let passwordHash: string;
let sequence = 0;

async function request(path: string, method = 'GET', payload?: unknown, session?: Session, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    Origin: ORIGIN,
    'CF-Connecting-IP': `192.0.2.${++sequence % 250 + 1}`,
    ...extra,
  };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  return handleApi(new Request(`${ORIGIN}/api${path}`, {
    method, headers, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  }), env);
}

function registrationBody(overrides: Record<string, unknown> = {}) {
  return { eventId: EVENT, name: 'Pessoa Fictícia de Teste', email: `pessoa-${randomUUID()}@example.invalid`,
    institution: 'Instituição Fictícia', course: 'Curso de Teste', consent: true, website: '', idempotencyKey: randomUUID(), ...overrides };
}

async function register(overrides: Record<string, unknown> = {}) {
  const response = await request('/register', 'POST', registrationBody(overrides));
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json() as Promise<Registration>;
}

async function login(role: 'admin' | 'checkin' = 'admin') {
  const response = await request('/admin/login', 'POST', { email: `${role}@example.invalid`, password: PASSWORD });
  expect(response.status, await response.clone().text()).toBe(200);
  const data = await response.json() as { csrf: string };
  const cookie = response.headers.get('Set-Cookie')?.split(';')[0];
  expect(cookie).toMatch(/^nexo_session=/);
  return { cookie: cookie!, csrf: data.csrf };
}

async function createTestEvent(admin: Session, overrides: Record<string, unknown> = {}) {
  const response = await request('/admin/events', 'POST', {
    slug: 'qa-teste-inscricoes', title: 'NEXO — ensaio de inscrição sem validade oficial', event_date: '2099-01-01',
    is_test: 1, registration_open: 1, capacity: 120, ...overrides,
  }, admin);
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json() as { event: EventSettings }).event;
}

async function attend(registration: Registration, admin: Session) {
  const response = await request('/admin/check-in', 'POST', { eventId: EVENT, token: registration.token, confirmIdentity: true }, admin);
  expect(response.status, await response.clone().text()).toBe(200);
}

async function enableCertificate(registration: Registration, admin: Session) {
  await attend(registration, admin);
  await db.prepare('UPDATE registrations SET certificate_eligible=1 WHERE id=?').bind(registration.id).run();
  await db.prepare("UPDATE events SET certificates_released=1,certificate_rules_approved=1,date_confirmed=1,venue_confirmed=1,event_date='2000-11-11',certificate_available_at='2000-12-01T03:00:00.000Z',signatories='Coordenação fictícia de testes' WHERE id=?").bind(EVENT).run();
}

describe.sequential('plataforma integrada com D1 isolado', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true, script: 'export default { fetch() { return new Response("test"); } };',
      compatibilityDate: '2026-08-01', d1Databases: { DB: randomUUID() }, d1Persist: false,
    });
    db = await mf.getD1Database('DB') as unknown as D1Database;
    env = { DB: db, TOKEN_SECRET: 'segredo-exclusivo-do-teste-isolado-sem-validade-externa' };
    const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const filename of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) {
      // Wrangler's SQL parser preserves trigger BEGIN/END blocks and strings.
      const statements = unstable_splitSqlQuery(await readFile(`${migrationDirectory}/${filename}`, 'utf8'));
      await db.batch(statements.map(statement => db.prepare(statement)));
    }
    passwordHash = await hashPassword(PASSWORD);
  }, 60_000);

  beforeEach(async () => {
    const reset = ['idempotency_keys', 'certificate_history', 'certificates', 'checkins', 'tickets', 'registrations', 'participants', 'sessions', 'audit_logs', 'admin_users', 'rate_limits']
      .map(table => db.prepare(`DELETE FROM ${table}`));
    reset.push(db.prepare('DELETE FROM events WHERE is_test=1'));
    reset.push(db.prepare("DELETE FROM schedule_items WHERE id LIKE 'qa-%'"), db.prepare("DELETE FROM speakers WHERE id LIKE 'qa-%'"));
    reset.push(db.prepare("UPDATE events SET venue_photo_url='',venue_photo_authorized=0,venue_photo_alt='',venue_photo_credit='',venue_photo_source_url='' WHERE id=?").bind(EVENT));
    reset.push(db.prepare("UPDATE events SET active_count=0,capacity=120,registration_open=1,registration_starts=NULL,registration_ends=NULL,certificates_released=0,certificate_rules_approved=0,date_confirmed=0,venue_confirmed=0,event_date='2026-11-11',certificate_available_at='2026-12-01T03:00:00.000Z',signatories='' WHERE id=?").bind(EVENT));
    for (const role of ['admin', 'checkin']) reset.push(db.prepare('INSERT INTO admin_users(id,email,name,password_hash,role) VALUES (?,?,?,?,?)')
      .bind(role, `${role}@example.invalid`, `Operador fictício ${role}`, passwordHash, role));
    await db.batch(reset);
    sequence = 0;
  }, 30_000);

  afterAll(async () => { if (mf) await mf.dispose(); });

  it('aplica as migrations e não publica convidados pendentes ou dados pessoais', async () => {
    const response = await request('/event?slug=labirinto-da-liberdade');
    expect(response.status).toBe(200);
    const data = await response.json() as { event: { capacity: number }; speakers: unknown[]; remaining: number };
    expect(data.event.capacity).toBe(120);
    expect(data.remaining).toBe(120);
    expect(data.speakers).toHaveLength(0);
    expect(JSON.stringify(data)).not.toContain('password_hash');
    expect(JSON.stringify(data)).not.toContain('@example.invalid');
  });

  it('exige confirmação e aprovação editorial sem divulgar rascunhos, fotografias ou temas pendentes', async () => {
    const admin = await login();
    const created = await request(`/admin/speakers?eventId=${EVENT}`, 'POST', {
      name: 'Pessoa Fictícia Editorial', role: 'Profissional fictícia', bio: EDITORIAL_BIO, institution: 'Instituição fictícia',
      area: 'Direitos e reintegração', photo_url: '/images/convidados/foto-ficticia.webp', photo_credit: 'Crédito ainda não autorizado',
      talk_title: 'Proposta reservada para aprovação', talk_summary: EDITORIAL_TALK, invitation_status: 'pending',
    }, admin);
    expect(created.status, await created.clone().text()).toBe(201);
    const { speaker } = await created.json() as { speaker: Speaker };
    // Use an identifiable fixture ID for deterministic cleanup between tests.
    await db.prepare('UPDATE speakers SET id=? WHERE id=?').bind('qa-editorial', speaker.id).run();
    const endpoint = '/admin/speakers/qa-editorial';
    expect((await request(endpoint, 'PUT', { published: 1 }, admin)).status).toBe(400);
    expect((await request(endpoint, 'PUT', { invitation_status: 'confirmed', published: 1 }, admin)).status).toBe(400);
    expect((await request(endpoint, 'PUT', { invitation_status: 'confirmed', published: 1, credentials_verified: 1, bio_approved: 1, bio: 'Resumo curto insuficiente.' }, admin)).status).toBe(400);
    expect((await request(endpoint, 'PUT', { invitation_status: 'confirmed', published: 1, credentials_verified: 1, bio_approved: 1 }, admin)).status).toBe(200);
    const response = await request('/event');
    const visible = await response.json() as PublicEvent;
    expect(visible.speakers).toHaveLength(1);
    expect(visible.speakers[0]).toMatchObject({ id: 'qa-editorial', institution: 'Instituição fictícia', bio: EDITORIAL_BIO, photo_url: '', photo_credit: '', talk_title: '', talk_summary: '' });
    expect(JSON.stringify(visible)).not.toContain('Proposta reservada');
    expect(JSON.stringify(visible)).not.toContain('foto-ficticia.webp');
    const drafts = await request(`/admin/speakers?eventId=${EVENT}`, 'GET', undefined, admin);
    expect((await drafts.json() as { speakers: Speaker[] }).speakers.find(value => value.id === 'qa-editorial'))
      .toMatchObject({ talk_title: 'Proposta reservada para aprovação', photo_url: '/images/convidados/foto-ficticia.webp' });
  });

  it('salva biografia, tema e fotografia pelo painel e revoga aprovações após alterações parciais', async () => {
    const admin = await login();
    await db.prepare('INSERT INTO speakers(id,event_id,name,role,bio,invitation_status) VALUES (?,?,?,?,?,?)')
      .bind('qa-roundtrip', EVENT, 'Pessoa Fictícia do Painel', 'Profissão fictícia', EDITORIAL_BIO, 'confirmed').run();
    const endpoint = '/admin/speakers/qa-roundtrip';
    expect((await request(endpoint, 'PUT', { talk_approved: 1, talk_title: 'Título fictício', talk_summary: 'Texto insuficiente.' }, admin)).status).toBe(400);
    const update = await request(endpoint, 'PUT', {
      credentials_verified: 1, bio_approved: 1, published: 1, photo_authorized: 1,
      photo_url: '/images/convidados/retrato-ficticio.avif', photo_credit: 'Autorização fictícia do ensaio',
      talk_title: 'Reintegração e oportunidades', talk_summary: EDITORIAL_TALK, talk_approved: 1,
      social_url: 'https://example.invalid/perfil', participation_time: '19:30', display_order: 2,
    }, admin);
    expect(update.status, await update.clone().text()).toBe(200);
    expect(await update.json()).toMatchObject({ speaker: { talk_approved: 1, participation_time: '19:30' } });
    const visible = await (await request('/event')).json() as PublicEvent;
    expect(visible.speakers[0]).toMatchObject({ bio: EDITORIAL_BIO, talk_title: 'Reintegração e oportunidades', talk_summary: EDITORIAL_TALK, photo_url: '/images/convidados/retrato-ficticio.avif', participation_time: '19:30' });

    expect((await request(endpoint, 'PUT', { talk_title: 'Nova proposta reservada' }, admin)).status).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).speakers[0]).toMatchObject({ talk_approved: 0, talk_title: '', talk_summary: '' });
    const updatedBio = EDITORIAL_BIO.replace('atividades de formação', 'iniciativas de formação');
    expect((await request(endpoint, 'PUT', { bio: updatedBio }, admin)).status).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).speakers).toHaveLength(0);
    const drafts = await (await request(`/admin/speakers?eventId=${EVENT}`, 'GET', undefined, admin)).json() as { speakers: Speaker[] };
    expect(drafts.speakers.find(value => value.id === 'qa-roundtrip')).toMatchObject({ bio: updatedBio, bio_approved: 0, published: 0 });
    expect((await request(endpoint, 'PUT', { published: 1 }, admin)).status).toBe(400);
    expect((await request(endpoint, 'PUT', { bio_approved: 1, published: 1 }, admin)).status).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).speakers[0].bio).toBe(updatedBio);
    expect((await request(endpoint, 'PUT', { published: 0 }, admin)).status).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).speakers).toHaveLength(0);
  });

  it('oculta vínculos da programação a convidados não publicados e aprovados', async () => {
    const admin = await login();
    await db.batch([
      db.prepare('INSERT INTO speakers(id,event_id,name,role,bio,invitation_status,credentials_verified,bio_approved,published) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind('qa-schedule-speaker', EVENT, 'Pessoa Fictícia da Programação', 'Profissão fictícia', EDITORIAL_BIO, 'confirmed', 1, 1, 1),
      db.prepare('INSERT INTO schedule_items(id,event_id,title,speaker_id,published) VALUES (?,?,?,?,1)')
        .bind('qa-schedule', EVENT, 'Participação fictícia', 'qa-schedule-speaker'),
    ]);
    const publicSchedule = async () => (await (await request('/event')).json() as PublicEvent).schedule.find(value => value.id === 'qa-schedule');
    expect(await publicSchedule()).toMatchObject({ speaker_id: 'qa-schedule-speaker' });
    expect((await request('/admin/speakers/qa-schedule-speaker', 'PUT', { credentials_verified: 0 }, admin)).status).toBe(200);
    expect(await publicSchedule()).toMatchObject({ speaker_id: null });
    const checkin = await login('checkin');
    expect((await request('/admin/speakers/qa-schedule-speaker', 'PUT', { credentials_verified: 1 }, checkin)).status).toBe(403);
  });

  it('gerencia a fotografia do local e protege também os dados de imagem no ingresso', async () => {
    const registration = await register();
    await db.prepare('UPDATE events SET registration_open=0 WHERE id=?').bind(EVENT).run();
    const admin = await login();
    const endpoint = `/admin/event?eventId=${EVENT}`;
    expect((await request(endpoint, 'PUT', { venue_photo_authorized: 1 }, admin)).status).toBe(400);
    const saved = await request(endpoint, 'PUT', {
      venue_description: 'Descrição institucional editada pelo painel.', venue_photo_url: '/images/local/auditorio-ficticio.webp',
      venue_photo_alt: 'Auditório fictício usado exclusivamente no ensaio.', venue_photo_credit: 'Crédito autorizado fictício',
      venue_photo_source_url: 'https://example.invalid/autorizacao', venue_photo_authorized: 1,
    }, admin);
    expect(saved.status, await saved.clone().text()).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).event).toMatchObject({ venue_description: 'Descrição institucional editada pelo painel.', venue_photo_url: '/images/local/auditorio-ficticio.webp', auditorium: '' });
    expect((await (await request('/ticket', 'POST', { token: registration.token })).json() as Ticket).event.venue_photo_credit).toBe('Crédito autorizado fictício');
    expect((await request(endpoint, 'PUT', { venue_photo_authorized: 0 }, admin)).status).toBe(200);
    const redacted = { venue_photo_url: '', venue_photo_alt: '', venue_photo_credit: '', venue_photo_source_url: '' };
    expect((await (await request('/event')).json() as PublicEvent).event).toMatchObject(redacted);
    expect((await (await request('/ticket', 'POST', { token: registration.token })).json() as Ticket).event).toMatchObject(redacted);
    expect((await request(endpoint, 'PUT', { venue_photo_authorized: 1 }, admin)).status).toBe(200);
    expect((await request(endpoint, 'PUT', { venue_photo_url: '/images/local/outro-ficticio.webp' }, admin)).status).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).event).toMatchObject(redacted);

    // The real Maps-generated URL is stored as opaque data; this test never
    // contacts Google or renders/downloads the panorama.
    const embed = 'https://www.google.com/maps/embed?pb=!4v1792083239671!6m8!1m7!1sMj9YDbgGbRwesZXMiawFmA!2m2!1d-2.500292460392764!2d-44.28677009291693!3f1.6742678223436656!4f0!5f0.7820865974627469';
    const visual = {
      venue_photo_url: embed, venue_photo_authorized: 1,
      venue_photo_alt: 'Fachada da UNDB — Campus Renascença, vista do Google Street View.',
      venue_photo_credit: 'Google Street View · maio de 2024', venue_photo_source_url: 'https://www.google.com/maps/',
    };
    const embedSaved = await request(endpoint, 'PUT', visual, admin);
    expect(embedSaved.status, await embedSaved.clone().text()).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).event).toMatchObject({ ...visual, registration_open: 0, certificates_released: 0 });
    const updatedTicket = await (await request('/ticket', 'POST', { token: registration.token })).json() as Ticket;
    expect(updatedTicket).toMatchObject({ id: registration.id, code: registration.code, event: visual });
    expect((await request(endpoint, 'PUT', { venue_photo_authorized: 0 }, admin)).status).toBe(200);
    expect((await (await request('/event')).json() as PublicEvent).event).toMatchObject(redacted);
    expect((await (await request('/ticket', 'POST', { token: registration.token })).json() as Ticket).event).toMatchObject(redacted);
  }, 15_000);

  it('registra, normaliza o e-mail e mantém um ingresso individual persistido', async () => {
    const registration = await register({ email: '  Pessoa@EXAMPLE.INVALID  ' });
    expect(registration.token).toMatch(/^[a-f0-9]{64}$/);
    const row = await db.prepare('SELECT email,status FROM registrations WHERE id=?').bind(registration.id).first();
    expect(row).toMatchObject({ email: 'pessoa@example.invalid', status: 'active' });
    const ticket = await db.prepare('SELECT token_hash FROM tickets WHERE registration_id=?').bind(registration.id).first<{ token_hash: string }>();
    expect(ticket?.token_hash).not.toBe(registration.token);
    const response = await request('/ticket', 'POST', { token: registration.token });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: registration.id, code: registration.code });
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(EVENT).first('active_count')).toBe(1);
  });

  it('recusa e-mail duplicado sem alterar a inscrição existente', async () => {
    await register({ email: 'pessoa@example.invalid' });
    const duplicate = await request('/register', 'POST', registrationBody({ email: 'PESSOA@example.invalid' }));
    expect(duplicate.status).toBe(409);
    expect(await db.prepare('SELECT count(*) AS total FROM registrations').first('total')).toBe(1);
  });

  it('aceita campos opcionais vazios e todos os perfis permitidos, registrando ciência da privacidade', async () => {
    for (const profile of ['', 'student', 'teacher', 'professional', 'other']) {
      const registration = await register({ profile, institution: '', course: '' });
      const persisted = await db.prepare('SELECT profile,consent_at,consent_text FROM registrations WHERE id=?').bind(registration.id)
        .first<{ profile: string; consent_at: string; consent_text: string }>();
      expect(persisted?.profile).toBe(profile);
      expect(persisted?.consent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(persisted?.consent_text).toContain('dados');
      expect(await db.prepare('SELECT institution,course FROM participants WHERE id=(SELECT participant_id FROM registrations WHERE id=?)')
        .bind(registration.id).first()).toEqual({ institution: '', course: '' });
    }
    const invalid = await request('/register', 'POST', registrationBody({ profile: 'valor-inventado' }));
    expect(invalid.status).toBe(400);
    const admin = await login();
    const { participants } = await (await request(`/admin/participants?eventId=${EVENT}`, 'GET', undefined, admin)).json() as { participants: Participant[] };
    expect(participants.map(p => p.profile).sort()).toEqual(['', 'student', 'teacher', 'professional', 'other'].sort());
    expect(participants.every(p => p.is_test === 0)).toBe(true);
  }, 20_000);

  it('preserva repetição de solicitações anteriores sem perfil e inclui perfil preenchido na idempotência', async () => {
    const previousPayload = registrationBody();
    const first = await request('/register', 'POST', previousPayload);
    expect(first.status).toBe(201);
    const replay = await request('/register', 'POST', { ...previousPayload, profile: '' });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect((await request('/register', 'POST', { ...previousPayload, profile: 'student' })).status).toBe(409);
    const profilePayload = registrationBody({ profile: 'teacher' });
    const double = await Promise.all([request('/register', 'POST', profilePayload), request('/register', 'POST', profilePayload)]);
    expect(double.every(r => [200, 201].includes(r.status))).toBe(true);
    expect(await double[0].json()).toEqual(await double[1].json());
    expect(await db.prepare('SELECT COUNT(*) total FROM registrations').first('total')).toBe(2);
  }, 15_000);

  it('mantém teste separado da página oficial, das vagas, da duplicidade e dos filtros administrativos', async () => {
    const admin = await login(), test = await createTestEvent(admin);
    const publicOfficial = await (await request('/event')).json() as PublicEvent;
    expect(publicOfficial.event).toMatchObject({ id: EVENT, is_test: 0 });
    const sameEmail = 'mesma-pessoa@example.invalid';
    const officialRegistration = await register({ email: sameEmail });
    const trial = await register({ eventId: test.id, email: sameEmail, profile: 'student' });
    expect(officialRegistration.token).not.toBe(trial.token);
    expect((await request('/register', 'POST', registrationBody({ eventId: test.id, email: sameEmail }))).status).toBe(409);
    const publicTrial = await (await request(`/event?slug=${test.slug}`)).json() as PublicEvent;
    expect(publicTrial.event).toMatchObject({ id: test.id, is_test: 1, date_confirmed: 0, venue_confirmed: 0, certificates_released: 0 });
    expect(publicTrial.remaining).toBe(119);
    expect((await (await request('/event')).json() as PublicEvent).remaining).toBe(119);
    const list = await (await request(`/admin/participants?eventId=${test.id}&kind=test&q=mesma-pessoa`, 'GET', undefined, admin)).json() as { participants: Participant[] };
    expect(list.participants).toHaveLength(1);
    expect(list.participants[0]).toMatchObject({ id: trial.id, profile: 'student', is_test: 1 });
    expect((await (await request(`/admin/participants?eventId=${test.id}&kind=official`, 'GET', undefined, admin)).json() as { participants: Participant[] }).participants).toHaveLength(0);
    const csv = await (await request(`/admin/export?eventId=${test.id}&kind=test`, 'GET', undefined, admin)).text();
    expect(csv).toContain('Perfil'); expect(csv).toContain('Teste'); expect(csv).toContain(trial.code); expect(csv).not.toContain(officialRegistration.code);
    expect([400, 409]).toContain((await request(`/admin/event?eventId=${test.id}`, 'PUT', { is_test: 0 }, admin)).status);
    expect([400, 409]).toContain((await request(`/admin/event?eventId=${EVENT}`, 'PUT', { is_test: 1 }, admin)).status);
    expect((await request(`/admin/event?eventId=${test.id}`, 'PUT', { is_test: 1, title: test.title }, admin)).status).toBe(200);
  }, 25_000);

  it('garante capacidade concorrente do teste sem ocupar vagas oficiais e impede QR no evento errado', async () => {
    const admin = await login(), test = await createTestEvent(admin, { capacity: 1 });
    const responses = await Promise.all(Array.from({ length: 5 }, () => request('/register', 'POST', registrationBody({ eventId: test.id }))));
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    expect(responses.filter(r => r.status === 409)).toHaveLength(4);
    const trial = await responses.find(r => r.status === 201)!.json() as Registration;
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(EVENT).first('active_count')).toBe(0);
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(test.id).first('active_count')).toBe(1);
    expect((await request('/admin/check-in', 'POST', { eventId: EVENT, token: trial.token, confirmIdentity: true }, admin)).status).toBe(404);
    expect((await request('/admin/check-in', 'POST', { eventId: test.id, token: trial.token, confirmIdentity: true }, admin)).status).toBe(200);
    const response = await request('/ticket', 'POST', { token: trial.token });
    const ticket = await response.json() as Ticket;
    expect(ticket.event.is_test).toBe(1);
    const pdf = await PDFDocument.load(await ticketPdf(ticket, ORIGIN));
    expect(pdf.getPageCount()).toBe(1);
    expect((await request(`/admin/participants/${trial.id}`, 'PATCH', { status: 'cancelled' }, admin)).status).toBe(200);
    expect((await request('/ticket', 'POST', { token: trial.token })).status).toBe(404);
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(test.id).first('active_count')).toBe(0);
  }, 25_000);

  it('exige administrador, CSRF e confirmação explícita para limpeza e recusa o evento oficial', async () => {
    const admin = await login(), operator = await login('checkin'), test = await createTestEvent(admin);
    const cleanup = { eventId: test.id, confirmation: 'ANONIMIZAR TESTES' };
    expect((await request('/admin/test-data/cleanup', 'POST', cleanup)).status).toBe(401);
    expect((await request('/admin/test-data/cleanup', 'POST', cleanup, operator)).status).toBe(403);
    expect((await request('/admin/test-data/cleanup', 'POST', cleanup, { ...admin, csrf: 'invalido' })).status).toBe(403);
    expect((await request('/admin/test-data/cleanup', 'POST', { ...cleanup, confirmation: 'sim' }, admin)).status).toBe(400);
    expect([400, 409]).toContain((await request('/admin/test-data/cleanup', 'POST', { ...cleanup, eventId: EVENT }, admin)).status);
    expect(await db.prepare('SELECT registration_open FROM events WHERE id=?').bind(test.id).first('registration_open')).toBe(1);
  }, 15_000);

  it('encerra e anonimiza exclusivamente testes, preservando ingresso, certificado e auditoria oficiais', async () => {
    const admin = await login(), test = await createTestEvent(admin);
    const official = await register({ name: 'Pessoa Oficial Preservada' });
    await enableCertificate(official, admin);
    expect((await request('/admin/certificates', 'POST', { registrationIds: [official.id], action: 'issue' }, admin)).status).toBe(200);
    const beforeOfficial = await db.prepare('SELECT * FROM registrations WHERE id=?').bind(official.id).first();
    const beforeCertificate = await db.prepare('SELECT * FROM certificates WHERE registration_id=?').bind(official.id).first();
    const first = await register({ eventId: test.id, name: 'Pessoa Teste a Anonimizar', profile: 'professional' });
    const second = await register({ eventId: test.id, name: 'Outra Pessoa de Ensaio' });
    expect((await request('/admin/check-in', 'POST', { eventId: test.id, token: first.token, confirmIdentity: true }, admin)).status).toBe(200);
    expect((await request(`/admin/participants/${second.id}`, 'PATCH', { status: 'cancelled' }, admin)).status).toBe(200);
    const cleaned = await request('/admin/test-data/cleanup', 'POST', { eventId: test.id, confirmation: 'ANONIMIZAR TESTES' }, admin);
    expect(cleaned.status, await cleaned.clone().text()).toBe(200);
    expect(await cleaned.json()).toMatchObject({ anonymized: 2, registrationClosed: true });
    expect(await db.prepare('SELECT active_count,registration_open FROM events WHERE id=?').bind(test.id).first()).toEqual({ active_count: 0, registration_open: 0 });
    expect((await request('/register', 'POST', registrationBody({ eventId: test.id }))).status).toBe(409);
    expect((await request('/ticket', 'POST', { token: first.token })).status).toBe(404);
    const privateTestRecords = await db.prepare('SELECT p.name,p.email,p.institution,p.course,p.anonymized_at,r.profile,r.status FROM participants p JOIN registrations r ON r.participant_id=p.id WHERE r.event_id=?').bind(test.id).all();
    expect(privateTestRecords.results).toHaveLength(2);
    expect(privateTestRecords.results.every(p => p.anonymized_at && p.name === 'Participante de teste anonimizado' && p.profile === '' && p.status === 'cancelled')).toBe(true);
    expect(JSON.stringify(privateTestRecords.results)).not.toContain('@example.invalid');
    expect(await db.prepare('SELECT * FROM registrations WHERE id=?').bind(official.id).first()).toEqual(beforeOfficial);
    expect(await db.prepare('SELECT * FROM certificates WHERE registration_id=?').bind(official.id).first()).toEqual(beforeCertificate);
    expect((await request('/ticket', 'POST', { token: official.token })).status).toBe(200);
    expect(await db.prepare('SELECT COUNT(*) total FROM admin_users').first('total')).toBe(2);
    expect(await db.prepare('SELECT COUNT(*) total FROM audit_logs WHERE target_id=?').bind(test.id).first('total')).toBeGreaterThan(1);
    const again = await request('/admin/test-data/cleanup', 'POST', { eventId: test.id, confirmation: 'ANONIMIZAR TESTES' }, admin);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ anonymized: 0 });
  }, 30_000);

  it('limpeza concorrente impede novas inscrições após o encerramento, sem deixar dados pessoais ativos', async () => {
    const admin = await login(), test = await createTestEvent(admin);
    await register({ eventId: test.id });
    const [cleaned, registration] = await Promise.all([
      request('/admin/test-data/cleanup', 'POST', { eventId: test.id, confirmation: 'ANONIMIZAR TESTES' }, admin),
      request('/register', 'POST', registrationBody({ eventId: test.id })),
    ]);
    expect(cleaned.status, await cleaned.clone().text()).toBe(200);
    expect([201, 409]).toContain(registration.status);
    expect(await db.prepare('SELECT active_count,registration_open FROM events WHERE id=?').bind(test.id).first()).toEqual({ active_count: 0, registration_open: 0 });
    expect(await db.prepare('SELECT COUNT(*) total FROM participants p JOIN registrations r ON r.participant_id=p.id WHERE r.event_id=? AND p.anonymized_at IS NULL').bind(test.id).first('total')).toBe(0);
  }, 15_000);

  it('recusa limpeza de teste quando uma identidade também pertence a outro evento', async () => {
    const admin = await login(), test = await createTestEvent(admin);
    const official = await register(), trial = await register({ eventId: test.id });
    const officialParticipant = await db.prepare('SELECT participant_id FROM registrations WHERE id=?').bind(official.id).first('participant_id');
    await db.prepare('UPDATE registrations SET participant_id=? WHERE id=?').bind(officialParticipant, trial.id).run();
    const original = await db.prepare('SELECT * FROM participants WHERE id=?').bind(officialParticipant).first();
    const response = await request('/admin/test-data/cleanup', 'POST', { eventId: test.id, confirmation: 'ANONIMIZAR TESTES' }, admin);
    expect(response.status).toBe(409);
    expect(await db.prepare('SELECT * FROM participants WHERE id=?').bind(officialParticipant).first()).toEqual(original);
    expect(await db.prepare('SELECT registration_open,active_count FROM events WHERE id=?').bind(test.id).first()).toEqual({ registration_open: 1, active_count: 1 });
    expect((await request('/ticket', 'POST', { token: official.token })).status).toBe(200);
  }, 15_000);

  it('protege o tipo do evento e bloqueia certificados de teste mesmo por alterações administrativas ou SQL direto', async () => {
    const admin = await login(), test = await createTestEvent(admin), trial = await register();
    // The official registration above is a control and must remain usable.
    expect((await request('/ticket', 'POST', { token: trial.token })).status).toBe(200);
    const testRegistration = await register({ eventId: test.id });
    expect((await request('/admin/certificates', 'POST', { registrationIds: [testRegistration.id], action: 'issue' }, admin)).status).toBe(409);
    expect((await request('/certificate', 'POST', { token: testRegistration.token })).status).toBe(409);
    expect([400, 409]).toContain((await request(`/admin/event?eventId=${test.id}`, 'PUT', { certificates_released: 1, certificate_rules_approved: 1, date_confirmed: 1, venue_confirmed: 1, signatories: 'Signatário fictício' }, admin)).status);
    await expect(db.prepare('UPDATE events SET is_test=1 WHERE id=?').bind(EVENT).run()).rejects.toThrow();
    await expect(db.prepare('UPDATE events SET certificates_released=1 WHERE id=?').bind(test.id).run()).rejects.toThrow();
    await expect(db.prepare("INSERT INTO certificates(id,registration_id,code,status,issued_by,snapshot) VALUES ('qa-test-cert',?,'QA-SEM-VALIDADE','issued','admin','{}')").bind(testRegistration.id).run()).rejects.toThrow();
  }, 15_000);

  it.each([
    { name: '' }, { email: 'sem-arroba' }, { consent: false }, { name: 'a'.repeat(300) }, { website: 'spam' },
  ])('recusa dados inválidos/spam sem gravar participante: %j', async invalid => {
    const response = await request('/register', 'POST', registrationBody(invalid));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await db.prepare('SELECT count(*) AS total FROM registrations').first('total')).toBe(0);
    expect(await db.prepare('SELECT count(*) AS total FROM participants').first('total')).toBe(0);
  });

  it('duplo clique simultâneo repete a mesma resposta e não cria segunda vaga', async () => {
    const payload = registrationBody();
    const responses = await Promise.all([request('/register', 'POST', payload), request('/register', 'POST', payload)]);
    expect(responses.every(response => [200, 201].includes(response.status))).toBe(true);
    const [first, second] = await Promise.all(responses.map(response => response.json()));
    expect(first).toEqual(second);
    expect(await db.prepare('SELECT count(*) AS total FROM registrations').first('total')).toBe(1);
    expect(await db.prepare('SELECT count(*) AS total FROM tickets').first('total')).toBe(1);
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(EVENT).first('active_count')).toBe(1);
  });

  it('não reutiliza a chave idempotente com conteúdo diferente', async () => {
    const payload = registrationBody();
    expect((await request('/register', 'POST', payload)).status).toBe(201);
    const response = await request('/register', 'POST', { ...payload, name: 'Outra Pessoa de Teste' });
    expect(response.status).toBe(409);
    expect(await db.prepare('SELECT count(*) AS total FROM registrations').first('total')).toBe(1);
  });

  it('garante a última vaga atomicamente em dez solicitações simultâneas', async () => {
    await db.prepare('UPDATE events SET capacity=2 WHERE id=?').bind(EVENT).run();
    await register();
    const responses = await Promise.all(Array.from({ length: 10 }, () => request('/register', 'POST', registrationBody())));
    expect(responses.filter(response => response.status === 201)).toHaveLength(1);
    expect(responses.filter(response => response.status === 409)).toHaveLength(9);
    expect(await db.prepare("SELECT count(*) AS total FROM registrations WHERE status='active'").first('total')).toBe(2);
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(EVENT).first('active_count')).toBe(2);
    expect(await db.prepare('SELECT count(*) AS total FROM participants').first('total')).toBe(2);
  }, 30_000);

  it('recusa evento lotado, fechado e fora da janela', async () => {
    await db.prepare('UPDATE events SET capacity=1 WHERE id=?').bind(EVENT).run();
    await register();
    expect((await request('/register', 'POST', registrationBody())).status).toBe(409);
    await db.prepare('UPDATE events SET capacity=120,registration_open=0 WHERE id=?').bind(EVENT).run();
    expect((await request('/register', 'POST', registrationBody())).status).toBe(409);
    await db.prepare("UPDATE events SET registration_open=1,registration_starts='2099-01-01T00:00:00.000Z' WHERE id=?").bind(EVENT).run();
    expect((await request('/register', 'POST', registrationBody())).status).toBe(409);
  });

  it('impede reduzir a capacidade abaixo das inscrições existentes', async () => {
    await register();
    await register();
    const admin = await login();
    const response = await request(`/admin/event?eventId=${EVENT}`, 'PUT', { capacity: 1 }, admin);
    expect(response.status).toBe(409);
    expect(await db.prepare('SELECT capacity FROM events WHERE id=?').bind(EVENT).first('capacity')).toBe(120);
  });

  it('cancela, libera a vaga e invalida o ingresso', async () => {
    const registration = await register();
    const admin = await login();
    const response = await request(`/admin/participants/${registration.id}`, 'PATCH', { status: 'cancelled' }, admin);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(EVENT).first('active_count')).toBe(0);
    expect((await request('/ticket', 'POST', { token: registration.token })).status).toBeGreaterThanOrEqual(400);
    const checkin = await request('/admin/check-in', 'POST', { token: registration.token, eventId: EVENT, confirmIdentity: true }, admin);
    expect(checkin.status).toBeGreaterThanOrEqual(400);
  });

  it('gera ingressos PDF reais e credenciais únicas entre participantes', async () => {
    const first = await register();
    const second = await register();
    expect(first.token).not.toBe(second.token);
    expect(first.code).not.toBe(second.code);
    const response = await request('/ticket', 'POST', { token: first.token });
    expect(response.status).toBe(200);
    const document = await PDFDocument.load(await ticketPdf(await response.json() as Ticket, ORIGIN));
    expect(document.getPageCount()).toBe(1);
  });

  it('exige login para credenciamento e recusa ingresso inexistente', async () => {
    const registration = await register();
    expect((await request('/admin/check-in', 'POST', { token: registration.token, eventId: EVENT, confirmIdentity: true })).status).toBe(401);
    const admin = await login();
    expect((await request('/admin/check-in', 'POST', { token: 'f'.repeat(64), eventId: EVENT, confirmIdentity: true }, admin)).status).toBe(404);
    expect(await db.prepare('SELECT count(*) AS total FROM checkins').first('total')).toBe(0);
  });

  it('exige confirmação de identidade e bloqueia QR já utilizado', async () => {
    const registration = await register();
    const admin = await login('checkin');
    expect((await request('/admin/check-in', 'POST', { token: registration.token, eventId: EVENT, confirmIdentity: false }, admin)).status).toBe(400);
    await attend(registration, admin);
    const repeated = await request('/admin/check-in', 'POST', { token: registration.token, eventId: EVENT, confirmIdentity: true }, admin);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ alreadyCheckedIn: true });
    expect(await db.prepare('SELECT count(*) AS total FROM checkins').first('total')).toBe(1);
  });

  it('protege painel, permissões de operador e CSRF', async () => {
    expect((await request(`/admin/participants?eventId=${EVENT}`)).status).toBe(401);
    const checkin = await login('checkin');
    expect((await request(`/admin/event?eventId=${EVENT}`, 'PUT', { title: 'Alteração indevida' }, checkin)).status).toBe(403);
    const admin = await login();
    expect((await request('/admin/check-in', 'POST', { code: 'inventado', eventId: EVENT, confirmIdentity: true }, { ...admin, csrf: 'errado' })).status).toBe(403);
    expect((await request('/admin/check-in', 'POST', {}, admin, { Origin: 'https://atacante.invalid' })).status).toBe(403);
  });

  it('encerra a sessão e bloqueia a sessão de usuário desativado', async () => {
    const admin = await login();
    expect((await request('/admin/session', 'GET', undefined, admin)).status).toBe(200);
    expect((await request('/admin/logout', 'POST', {}, admin)).status).toBe(200);
    expect((await request('/admin/session', 'GET', undefined, admin)).status).toBe(401);
    const other = await login();
    await db.prepare("UPDATE admin_users SET enabled=0 WHERE id='admin'").run();
    expect((await request('/admin/session', 'GET', undefined, other)).status).toBe(401);
  });

  it('não emite certificado para participante sem presença', async () => {
    const registration = await register();
    const admin = await login();
    await db.prepare("UPDATE events SET certificates_released=1,certificate_rules_approved=1,date_confirmed=1,venue_confirmed=1,event_date='2000-11-11',certificate_available_at='2000-12-01T03:00:00.000Z',signatories='Coordenação fictícia' WHERE id=?").bind(EVENT).run();
    await db.prepare('UPDATE registrations SET certificate_eligible=1 WHERE id=?').bind(registration.id).run();
    expect((await request('/certificate', 'POST', { token: registration.token })).status).toBeGreaterThanOrEqual(400);
    expect((await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin)).status).toBeGreaterThanOrEqual(400);
    expect(await db.prepare('SELECT count(*) AS total FROM certificates').first('total')).toBe(0);
  });

  it('mantém bloqueio de certificado até a data e aprovação', async () => {
    const registration = await register();
    const admin = await login();
    await enableCertificate(registration, admin);
    await db.prepare("UPDATE events SET certificate_available_at='2099-12-01T03:00:00.000Z' WHERE id=?").bind(EVENT).run();
    expect((await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin)).status).toBeGreaterThanOrEqual(400);
    await db.prepare("UPDATE events SET certificate_available_at='2000-12-01T03:00:00.000Z',certificate_rules_approved=0 WHERE id=?").bind(EVENT).run();
    expect((await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin)).status).toBeGreaterThanOrEqual(400);
  });

  it('emite A4 horizontal, valida dados mínimos e mantém snapshot oficial', async () => {
    const registration = await register();
    const admin = await login();
    await enableCertificate(registration, admin);
    const issue = await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin);
    expect(issue.status, await issue.clone().text()).toBe(200);
    const certificate = await db.prepare('SELECT code FROM certificates WHERE registration_id=?').bind(registration.id).first<{ code: string }>();
    expect(certificate?.code).toBeTruthy();
    const response = await request('/certificate', 'POST', { token: registration.token });
    expect(response.status, await response.clone().text()).toBe(200);
    const official = await response.json() as { snapshot: CertificateSnapshot; code: string; issued_at: string };
    const pdf = await PDFDocument.load(await certificatePdf(official.snapshot, official.code, official.issued_at, ORIGIN));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(841.89, 0);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(595.28, 0);
    const verify = await request(`/validate/${certificate!.code}`);
    expect(verify.status).toBe(200);
    const data = await verify.json();
    expect(JSON.stringify(data)).toContain('Pessoa Fictícia');
    expect(JSON.stringify(data)).not.toContain('@example.invalid');
    expect(JSON.stringify(data)).not.toContain(registration.token);
    await db.prepare("UPDATE participants SET name='Nome editado depois da emissão'").run();
    const snapshot = await request(`/validate/${certificate!.code}`);
    expect(JSON.stringify(await snapshot.json())).toContain('Pessoa Fictícia');
  });

  it('recusa código de autenticidade inexistente', async () => {
    expect((await request(`/validate/${'f'.repeat(64)}`)).status).toBe(404);
  });

  it('revoga certificado e nega download mantendo a situação pública', async () => {
    const registration = await register();
    const admin = await login();
    await enableCertificate(registration, admin);
    expect((await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin)).status).toBe(200);
    expect((await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'revoke' }, admin)).status).toBe(200);
    const certificate = await db.prepare('SELECT code FROM certificates WHERE registration_id=?').bind(registration.id).first<{ code: string }>();
    expect((await request('/certificate', 'POST', { token: registration.token })).status).toBeGreaterThanOrEqual(400);
    const verify = await request(`/validate/${certificate!.code}`);
    expect(verify.status).toBe(200);
    expect(JSON.stringify(await verify.json())).toContain('revoked');
  }, 30_000);

  it('preserva certificado emitido ao atualizar metadata com o mesmo nome no formulário completo', async () => {
    const registration = await register({ email: 'metadata@example.invalid' });
    const admin = await login();
    await enableCertificate(registration, admin);
    expect((await request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin)).status).toBe(200);
    const original = await db.prepare('SELECT code,status,snapshot,issued_at FROM certificates WHERE registration_id=?')
      .bind(registration.id).first<{ code: string; status: string; snapshot: string; issued_at: string }>();

    // The editor submits every field, including the participant's unchanged name.
    const update = await request(`/admin/participants/${registration.id}`, 'PATCH', {
      name: 'Pessoa Fictícia de Teste', email: 'metadata@example.invalid',
      institution: 'Instituição atualizada', course: 'Curso atualizado',
      status: 'active', checkedIn: true, certificateEligible: true,
    }, admin);
    expect(update.status, await update.clone().text()).toBe(200);
    expect(await update.json()).toMatchObject({ participant: {
      institution: 'Instituição atualizada', course: 'Curso atualizado', certificate_status: 'issued',
    } });
    const current = await db.prepare('SELECT code,status,snapshot,issued_at FROM certificates WHERE registration_id=?')
      .bind(registration.id).first();
    expect(current).toEqual(original);
    expect(await db.prepare('SELECT count(*) AS total FROM certificate_history').first('total')).toBe(0);
    const verify = await request(`/validate/${original!.code}`);
    expect(verify.status).toBe(200);
    expect(await verify.json()).toMatchObject({ code: original!.code, status: 'issued', name: 'Pessoa Fictícia de Teste' });
    const download = await request('/certificate', 'POST', { token: registration.token });
    expect(download.status).toBe(200);
    expect(await download.json()).toMatchObject({ code: original!.code, issued_at: original!.issued_at });
  }, 30_000);

  it('mantém o código anterior revogado após corrigir e reemitir um certificado', async () => {
    const registration = await register();
    const admin = await login();
    await enableCertificate(registration, admin);
    const issue = () => request('/admin/certificates', 'POST', { registrationIds: [registration.id], action: 'issue' }, admin);
    expect((await issue()).status).toBe(200);
    const original = await db.prepare('SELECT code FROM certificates WHERE registration_id=?').bind(registration.id).first<{ code: string }>();
    expect((await request(`/admin/participants/${registration.id}`, 'PATCH', { name: 'Pessoa com Nome Corrigido' }, admin)).status).toBe(200);
    expect((await issue()).status).toBe(200);
    const current = await db.prepare('SELECT code FROM certificates WHERE registration_id=?').bind(registration.id).first<{ code: string }>();
    expect(current!.code).not.toBe(original!.code);
    const oldPublic = await request(`/validate/${original!.code}`);
    expect(oldPublic.status).toBe(200);
    expect(await oldPublic.json()).toMatchObject({ status: 'revoked', name: 'Pessoa Fictícia de Teste' });
    const newPublic = await request(`/validate/${current!.code}`);
    expect(newPublic.status).toBe(200);
    expect(await newPublic.json()).toMatchObject({ status: 'issued', name: 'Pessoa com Nome Corrigido' });
    expect((await request(`/admin/participants/${registration.id}`, 'DELETE', {}, admin)).status).toBe(200);
    const anonymous = await request(`/validate/${original!.code}`);
    expect(await anonymous.json()).toMatchObject({ status: 'revoked', name: 'Dados anonimizados' });
  }, 30_000);

  it('emite o lote completo de 120 elegíveis com snapshots individuais', async () => {
    const admin = await login();
    await db.prepare("UPDATE events SET certificates_released=1,certificate_rules_approved=1,date_confirmed=1,venue_confirmed=1,event_date='2000-11-11',certificate_available_at='2000-12-01T03:00:00.000Z',signatories='Coordenação fictícia' WHERE id=?").bind(EVENT).run();
    const ids: string[] = [];
    const fixture: D1PreparedStatement[] = [];
    for (let i = 0; i < 120; i++) {
      const id = randomUUID(); ids.push(id);
      fixture.push(db.prepare('INSERT INTO participants(id,name,email) VALUES (?,?,?)').bind(id, `Pessoa Fictícia Lote ${i}`, `lote-${i}@example.invalid`));
      fixture.push(db.prepare('INSERT INTO registrations(id,event_id,participant_id,email,code,certificate_eligible,consent_at,consent_text) VALUES (?,?,?,?,?,1,?,?)').bind(id, EVENT, id, `lote-${i}@example.invalid`, `LOTE-${i}`, new Date().toISOString(), 'Aceite fictício'));
      fixture.push(db.prepare('INSERT INTO checkins(registration_id,actor_id) VALUES (?,?)').bind(id, 'admin'));
    }
    await db.batch(fixture);
    let preparedQueries = 0;
    const countedDb = new Proxy(db, {
      get(target, property) {
        if (property === 'prepare') return (query: string) => { preparedQueries++; return target.prepare(query); };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const issued = await handleApi(new Request(`${ORIGIN}/api/admin/certificates`, {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf },
      body: JSON.stringify({ registrationIds: ids, action: 'issue' }),
    }), { ...env, DB: countedDb });
    expect(issued.status, await issued.clone().text()).toBe(200);
    expect(await issued.json()).toMatchObject({ processed: 120 });
    expect(preparedQueries).toBeLessThanOrEqual(50);
    expect(await db.prepare("SELECT count(*) AS total FROM certificates WHERE status='issued'").first('total')).toBe(120);
    expect(await db.prepare('SELECT count(DISTINCT code) AS total FROM certificates').first('total')).toBe(120);
    expect(await db.prepare("SELECT count(DISTINCT json_extract(snapshot,'$.name')) AS total FROM certificates").first('total')).toBe(120);
  }, 30_000);

  it('recupera somente após conferência, revoga o token anterior e audita', async () => {
    const registration = await register();
    const admin = await login();
    expect((await request(`/admin/participants/${registration.id}/recover`, 'POST', { identityVerified: false, reason: 'Justificativa fictícia de ensaio' }, admin)).status).toBe(400);
    const response = await request(`/admin/participants/${registration.id}/recover`, 'POST', { identityVerified: true, reason: 'Identidade conferida presencialmente no ensaio' }, admin);
    expect(response.status).toBe(200);
    const recovered = await response.json() as { token: string };
    expect(recovered.token).not.toBe(registration.token);
    expect((await request('/ticket', 'POST', { token: registration.token })).status).toBeGreaterThanOrEqual(400);
    expect((await request('/ticket', 'POST', { token: recovered.token })).status).toBe(200);
    expect(await db.prepare('SELECT count(*) AS total FROM audit_logs').first('total')).toBeGreaterThan(0);
  });

  it('exporta CSV protegido contra fórmulas e anonimiza a pedido', async () => {
    const registration = await register({ institution: '=HYPERLINK("https://example.invalid")' });
    const admin = await login();
    const exportResponse = await request(`/admin/export?eventId=${EVENT}`, 'GET', undefined, admin);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('Content-Type')).toContain('text/csv');
    expect(await exportResponse.text()).toContain("'=HYPERLINK");
    expect((await request(`/admin/participants/${registration.id}`, 'DELETE', {}, admin)).status).toBe(200);
    const participant = await db.prepare('SELECT name,email,institution,anonymized_at FROM participants').first<{ name: string; email: string; institution: string; anonymized_at: string }>();
    expect(participant?.name).toBe('Participante anonimizado');
    expect(participant?.email).not.toContain('@example.invalid');
    expect(participant?.institution).toBe('');
    expect(participant?.anonymized_at).toBeTruthy();
    expect((await request('/ticket', 'POST', { token: registration.token })).status).toBe(404);
    expect(await db.prepare('SELECT active_count FROM events WHERE id=?').bind(EVENT).first('active_count')).toBe(0);
  });

  it('limita abuso de inscrições na mesma origem de rede', async () => {
    // Keep the entire scenario in the same minute even on slower CI machines.
    const time = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-15T15:00:00.000Z'));
    try {
      const responses = [];
      for (let i = 0; i < 31; i++) {
        responses.push(await request('/register', 'POST', registrationBody(), undefined, { 'CF-Connecting-IP': '192.0.2.99' }));
      }
      expect(responses.slice(0, 30).every(response => response.status === 201)).toBe(true);
      expect(responses[30].status).toBe(429);
      expect(responses[30].headers.get('Retry-After')).toBeTruthy();
      expect(await db.prepare('SELECT count(*) AS total FROM registrations').first('total')).toBe(30);
    } finally { time.mockRestore(); }
  }, 30_000);

  it('retorna falha de banco sem fingir inscrição ou expor diagnóstico interno', async () => {
    const broken: Env = { ...env, DB: { prepare() { throw new Error('internal database detail password secret'); } } as unknown as D1Database };
    const response = await handleApi(new Request(`${ORIGIN}/api/event?slug=labirinto-da-liberdade`), broken);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain('internal database detail');
    expect(JSON.parse(text)).toHaveProperty('error');
    const failedRegistration = await handleApi(new Request(`${ORIGIN}/api/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(registrationBody()),
    }), broken);
    expect(failedRegistration.status).toBe(503);
    expect(await db.prepare('SELECT count(*) AS total FROM registrations').first('total')).toBe(0);
  });
});
