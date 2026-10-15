import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { PDFDocument } from 'pdf-lib';
import { certificatePdf, ticketPdf, type CertificateSnapshot } from '../shared/pdf';
import type { Ticket } from '../shared/types';
import { handleApi } from '../functions/_lib/api';
import { hashPassword, type Env } from '../functions/_lib/security';

// Every operation uses real D1 SQL (Miniflare/workerd), with d1Persist disabled.
// No Wrangler profile, .dev.vars, local development DB or remote DB is read.
const ORIGIN = 'https://nexo.test';
const EVENT = 'slz-2026';
const PASSWORD = 'Senha apenas ficticia para testes 123!';
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
