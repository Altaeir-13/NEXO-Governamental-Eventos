PRAGMA foreign_keys = ON;

CREATE TABLE events (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL, date_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(date_confirmed IN (0,1)),
 checkin_time TEXT NOT NULL DEFAULT '', start_time TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', auditorium TEXT NOT NULL DEFAULT '',
 venue_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(venue_confirmed IN (0,1)), address TEXT NOT NULL DEFAULT '',
 latitude REAL NOT NULL DEFAULT 0, longitude REAL NOT NULL DEFAULT 0,
 capacity INTEGER NOT NULL DEFAULT 120 CHECK(capacity BETWEEN 1 AND 100000), active_count INTEGER NOT NULL DEFAULT 0 CHECK(active_count >= 0 AND active_count <= capacity),
 registration_open INTEGER NOT NULL DEFAULT 0 CHECK(registration_open IN (0,1)), registration_starts TEXT, registration_ends TEXT,
 certificate_hours REAL NOT NULL DEFAULT 5 CHECK(certificate_hours > 0 AND certificate_hours <= 1000),
 certificates_released INTEGER NOT NULL DEFAULT 0 CHECK(certificates_released IN (0,1)),
 certificate_available_at TEXT NOT NULL DEFAULT '2026-12-01T03:00:00.000Z', certificate_rules_approved INTEGER NOT NULL DEFAULT 0 CHECK(certificate_rules_approved IN (0,1)),
 certificate_text TEXT NOT NULL DEFAULT 'Certificamos que {nome} participou do evento "{evento}", promovido pelo NEXO Governamental — Núcleo Maranhão e Piauí, realizado em {cidade}, em {data}, com carga horária certificada de {horas} horas.',
 signatories TEXT NOT NULL DEFAULT '', contact_email TEXT NOT NULL DEFAULT '', contact_url TEXT NOT NULL DEFAULT '', instagram_url TEXT NOT NULL DEFAULT '',
 venue_photo_url TEXT NOT NULL DEFAULT '', venue_photo_authorized INTEGER NOT NULL DEFAULT 0 CHECK(venue_photo_authorized IN (0,1)),
 privacy_text TEXT NOT NULL DEFAULT 'Os dados informados são tratados pelo NEXO Governamental para organizar inscrições, credenciamento e certificados. Somente a equipe autorizada tem acesso à lista de participantes. O certificado poderá ser verificado publicamente por código exclusivo. Para exercer seus direitos, utilize o contato institucional divulgado nesta página.',
 retention_days INTEGER NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 30 AND 3650), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE speakers (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', photo_url TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '', social_url TEXT NOT NULL DEFAULT '',
 invitation_status TEXT NOT NULL DEFAULT 'pending' CHECK(invitation_status IN ('pending','invited','confirmed','declined')),
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), display_order INTEGER NOT NULL DEFAULT 0,
 CHECK(published = 0 OR invitation_status = 'confirmed')
);
CREATE TABLE schedule_items (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 start_time TEXT, end_time TEXT, time_label TEXT NOT NULL DEFAULT 'A definir', speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL,
 display_order INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), special INTEGER NOT NULL DEFAULT 0 CHECK(special IN (0,1))
);
CREATE TABLE participants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '', course TEXT NOT NULL DEFAULT '', anonymized_at TEXT
);
CREATE TABLE registrations (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), participant_id TEXT NOT NULL REFERENCES participants(id),
 email TEXT NOT NULL, code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 certificate_eligible INTEGER NOT NULL DEFAULT 0 CHECK(certificate_eligible IN (0,1)),
 consent_at TEXT NOT NULL, consent_text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(event_id,email), UNIQUE(event_id,participant_id)
);
CREATE TABLE tickets (
 registration_id TEXT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE checkins (
 registration_id TEXT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE, checked_in_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 actor_id TEXT NOT NULL REFERENCES admin_users(id)
);
CREATE TABLE certificates (
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL UNIQUE REFERENCES registrations(id), code TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('issued','revoked')), issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 issued_by TEXT NOT NULL REFERENCES admin_users(id), revoked_at TEXT, snapshot TEXT NOT NULL
);
CREATE TABLE admin_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','checkin')), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES admin_users(id), action TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE idempotency_keys (
 key_hash TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), body_hash TEXT NOT NULL,
 registration_id TEXT NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX registrations_event_status ON registrations(event_id,status);
CREATE INDEX participants_name ON participants(name COLLATE NOCASE);
CREATE INDEX speakers_event_order ON speakers(event_id,display_order);
CREATE INDEX schedule_event_order ON schedule_items(event_id,display_order);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
CREATE INDEX audit_created ON audit_logs(created_at);

-- D1 transactions are serialized. The counter constraint and triggers protect all
-- inserts and reactivations, including simultaneous requests and direct SQL.
-- Keep only the trigger's closing END: remote D1 SQL splitting must not confuse
-- CASE ... END with the end of a trigger. SELECT RAISE ... WHERE is equivalent.
CREATE TRIGGER registration_capacity_insert BEFORE INSERT ON registrations WHEN NEW.status='active'
BEGIN
 SELECT RAISE(ABORT,'EVENT_FULL') WHERE (SELECT active_count >= capacity FROM events WHERE id=NEW.event_id);
END;
CREATE TRIGGER registration_count_insert AFTER INSERT ON registrations WHEN NEW.status='active'
BEGIN UPDATE events SET active_count=active_count+1 WHERE id=NEW.event_id; END;
CREATE TRIGGER registration_capacity_reactivate BEFORE UPDATE OF status ON registrations WHEN OLD.status='cancelled' AND NEW.status='active'
BEGIN
 SELECT RAISE(ABORT,'EVENT_FULL') WHERE (SELECT active_count >= capacity FROM events WHERE id=NEW.event_id);
END;
CREATE TRIGGER registration_count_status AFTER UPDATE OF status ON registrations WHEN OLD.status != NEW.status
BEGIN UPDATE events SET active_count=active_count+(NEW.status='active')-(OLD.status='active') WHERE id=NEW.event_id; END;
CREATE TRIGGER registration_count_delete AFTER DELETE ON registrations WHEN OLD.status='active'
BEGIN UPDATE events SET active_count=active_count-1 WHERE id=OLD.event_id; END;
CREATE TRIGGER registration_event_immutable BEFORE UPDATE OF event_id ON registrations
BEGIN SELECT RAISE(ABORT,'EVENT_IMMUTABLE'); END;
CREATE TRIGGER checkin_active BEFORE INSERT ON checkins
BEGIN SELECT RAISE(ABORT,'REGISTRATION_CANCELLED') WHERE (SELECT status FROM registrations WHERE id=NEW.registration_id) != 'active'; END;
CREATE TRIGGER registration_cancel AFTER UPDATE OF status ON registrations WHEN NEW.status='cancelled'
BEGIN
 UPDATE tickets SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE registration_id=NEW.id;
 UPDATE certificates SET status='revoked',revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE registration_id=NEW.id;
END;
