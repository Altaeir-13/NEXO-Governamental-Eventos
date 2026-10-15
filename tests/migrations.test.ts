import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

// Exercise the distributable SQL on a new, disposable D1. Never use a local
// Wrangler database, credentials, .dev.vars or any remote Cloudflare resource.
describe.sequential('migrations distribuídas para D1', () => {
  let mf: Miniflare;
  let db: D1Database;
  const expectedTriggers: string[] = [];

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true, script: 'export default { fetch() { return new Response("migration test"); } };',
      compatibilityDate: '2026-08-01', d1Databases: { DB: randomUUID() }, d1Persist: false,
    });
    db = await mf.getD1Database('DB') as unknown as D1Database;
    const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const filename of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const statements = unstable_splitSqlQuery(await readFile(`${directory}/${filename}`, 'utf8'));
      for (const statement of statements) {
        const trigger = statement.match(/\bCREATE\s+TRIGGER\s+(\w+)/i)?.[1];
        if (!trigger) continue;
        expectedTriggers.push(trigger);
        // Remote SQL submission rejected CASE ... END inside trigger bodies
        // although Wrangler's local splitter kept those statements together.
        // One closing END avoids that ambiguity without bypassing migrations.
        const tokens = statement.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '')
          .replace(/'(?:''|[^'])*'/g, "''");
        expect(tokens.match(/\bEND\b/gi), `${filename}: ${trigger}`).toHaveLength(1);
        expect(tokens.trim()).toMatch(/;\s*END\s*;?$/i);
      }
      await db.batch(statements.map(statement => db.prepare(statement)));
    }
  }, 60_000);

  afterAll(async () => { if (mf) await mf.dispose(); });

  it('instala todos os gatilhos com o parser Wrangler e mantém produção fechada', async () => {
    const triggers = await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all<{ name: string }>();
    expect(triggers.results.map(row => row.name)).toEqual(expectedTriggers.sort());
    expect(expectedTriggers).toHaveLength(16);
    expect(await db.prepare('SELECT registration_open,certificates_released,certificate_rules_approved,date_confirmed,venue_confirmed FROM events WHERE id=?')
      .bind('slz-2026').first()).toEqual({ registration_open: 0, certificates_released: 0, certificate_rules_approved: 0, date_confirmed: 0, venue_confirmed: 0 });
  });

  it('mantém os convites existentes sem aprovações presumidas e protege publicação por SQL direto', async () => {
    const speakers = await db.prepare('SELECT invitation_status,published,credentials_verified,bio_approved,talk_approved,photo_authorized,participation_time FROM speakers').all();
    expect(speakers.results).toHaveLength(3);
    for (const speaker of speakers.results) expect(speaker).toEqual({ invitation_status: 'pending', published: 0, credentials_verified: 0, bio_approved: 0, talk_approved: 0, photo_authorized: 0, participation_time: null });
    await expect(db.prepare("UPDATE speakers SET invitation_status='confirmed',published=1 WHERE id='mauro-rocha'").run()).rejects.toThrow('SPEAKER_NOT_APPROVED');
    expect(await db.prepare("SELECT venue_description FROM events WHERE id='slz-2026'").first('venue_description')).toContain('Em um ambiente dedicado');
  });

  it('preserva capacidade, cancelamento e impedimentos mesmo com SQL direto', async () => {
    await db.batch([
      db.prepare("INSERT INTO admin_users(id,email,name,password_hash,role) VALUES ('operator','operator@example.invalid','Operador fictício','hash não utilizável','admin')"),
      db.prepare("INSERT INTO participants(id,name,email) VALUES ('p1','Pessoa fictícia 1','p1@example.invalid'),('p2','Pessoa fictícia 2','p2@example.invalid')"),
      db.prepare("UPDATE events SET capacity=1 WHERE id='slz-2026'"),
    ]);
    const registration = (index: number) => db.prepare('INSERT INTO registrations(id,event_id,participant_id,email,code,consent_at,consent_text) VALUES (?,?,?,?,?,?,?)')
      .bind(`r${index}`, 'slz-2026', `p${index}`, `p${index}@example.invalid`, `FICTICIO-${index}`, '2000-01-01T00:00:00.000Z', 'Aceite exclusivamente fictício');
    const count = () => db.prepare("SELECT active_count FROM events WHERE id='slz-2026'").first('active_count');

    await registration(1).run();
    await expect(registration(2).run()).rejects.toThrow('EVENT_FULL');
    expect(await count()).toBe(1);
    await db.prepare("UPDATE registrations SET status='cancelled' WHERE id='r1'").run();
    expect(await count()).toBe(0);
    await registration(2).run();
    await expect(db.prepare("UPDATE registrations SET status='active' WHERE id='r1'").run()).rejects.toThrow('EVENT_FULL');
    expect(await count()).toBe(1);
    await expect(db.prepare("INSERT INTO checkins(registration_id,actor_id) VALUES ('r1','operator')").run()).rejects.toThrow('REGISTRATION_CANCELLED');
    await expect(db.prepare("INSERT INTO certificates(id,registration_id,code,status,issued_by,snapshot) VALUES ('c1','r2','FICTICIO-CERT','issued','operator','{}')").run()).rejects.toThrow('CERTIFICATE_NOT_ELIGIBLE');

    await db.prepare("UPDATE registrations SET status='cancelled' WHERE id='r2'").run();
    await db.prepare("UPDATE participants SET anonymized_at='2000-01-01T00:00:00.000Z' WHERE id='p1'").run();
    await expect(db.prepare("UPDATE registrations SET status='active' WHERE id='r1'").run()).rejects.toThrow('PARTICIPANT_ANONYMIZED');
    expect(await count()).toBe(0);
  }, 30_000);
});
