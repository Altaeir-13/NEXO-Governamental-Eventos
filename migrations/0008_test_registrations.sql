-- Test events share the existing D1 infrastructure but never official capacity
-- or certificates. Historical events and registration payloads remain official.
ALTER TABLE events ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1));
ALTER TABLE registrations ADD COLUMN profile TEXT NOT NULL DEFAULT '' CHECK(profile IN ('','student','teacher','professional','other'));
CREATE INDEX events_kind_date ON events(is_test,event_date);

CREATE TRIGGER event_test_kind_immutable BEFORE UPDATE OF is_test ON events WHEN NEW.is_test!=OLD.is_test
BEGIN SELECT RAISE(ABORT,'EVENT_KIND_IMMUTABLE'); END;

CREATE TRIGGER test_event_certificates_insert BEFORE INSERT ON events WHEN NEW.is_test=1
BEGIN
 SELECT RAISE(ABORT,'TEST_CERTIFICATE_FORBIDDEN') WHERE NEW.certificates_released=1 OR NEW.certificate_rules_approved=1;
END;
CREATE TRIGGER test_event_certificates_update BEFORE UPDATE ON events WHEN NEW.is_test=1
BEGIN
 SELECT RAISE(ABORT,'TEST_CERTIFICATE_FORBIDDEN') WHERE NEW.certificates_released=1 OR NEW.certificate_rules_approved=1;
END;

-- The HTTP check alone cannot stop a request already in flight when cleanup
-- closes a test event. D1 serializes the transaction and this final gate.
CREATE TRIGGER test_registration_open_insert BEFORE INSERT ON registrations WHEN NEW.status='active'
BEGIN
 SELECT RAISE(ABORT,'TEST_REGISTRATION_CLOSED') WHERE EXISTS (
  SELECT 1 FROM events e WHERE e.id=NEW.event_id AND e.is_test=1
   AND (e.registration_open!=1 OR (e.registration_starts IS NOT NULL AND julianday(e.registration_starts)>julianday('now')) OR (e.registration_ends IS NOT NULL AND julianday(e.registration_ends)<julianday('now')))
 );
END;
CREATE TRIGGER test_registration_open_reactivate BEFORE UPDATE OF status ON registrations WHEN OLD.status='cancelled' AND NEW.status='active'
BEGIN
 SELECT RAISE(ABORT,'TEST_REGISTRATION_CLOSED') WHERE EXISTS (
  SELECT 1 FROM events e WHERE e.id=NEW.event_id AND e.is_test=1
   AND (e.registration_open!=1 OR (e.registration_starts IS NOT NULL AND julianday(e.registration_starts)>julianday('now')) OR (e.registration_ends IS NOT NULL AND julianday(e.registration_ends)<julianday('now')))
 );
END;

CREATE TRIGGER test_certificate_insert BEFORE INSERT ON certificates WHEN NEW.status='issued'
BEGIN
 SELECT RAISE(ABORT,'TEST_CERTIFICATE_FORBIDDEN') WHERE EXISTS (SELECT 1 FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.id=NEW.registration_id AND e.is_test=1);
END;
CREATE TRIGGER test_certificate_update BEFORE UPDATE OF status,registration_id ON certificates WHEN NEW.status='issued'
BEGIN
 SELECT RAISE(ABORT,'TEST_CERTIFICATE_FORBIDDEN') WHERE EXISTS (SELECT 1 FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.id=NEW.registration_id AND e.is_test=1);
END;
