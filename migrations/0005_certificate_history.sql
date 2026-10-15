-- Keep a revoked authenticity record when a corrected certificate receives a new
-- code. Old PDFs must remain visibly revoked instead of disappearing on reissue.
CREATE TABLE certificate_history (
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id), code TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'revoked' CHECK(status='revoked'), issued_at TEXT NOT NULL,
 issued_by TEXT NOT NULL REFERENCES admin_users(id), revoked_at TEXT NOT NULL, snapshot TEXT NOT NULL
);
CREATE INDEX certificate_history_registration ON certificate_history(registration_id);
CREATE TRIGGER certificate_archive BEFORE UPDATE OF code ON certificates WHEN NEW.code != OLD.code
BEGIN
 INSERT INTO certificate_history(id,registration_id,code,status,issued_at,issued_by,revoked_at,snapshot)
 VALUES (OLD.id,OLD.registration_id,OLD.code,'revoked',OLD.issued_at,OLD.issued_by,COALESCE(OLD.revoked_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),OLD.snapshot);
END;
