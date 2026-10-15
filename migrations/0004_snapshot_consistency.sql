-- A stale issuance request must not sign a name or event model superseded by
-- a concurrent correction. Revocations remain possible without these checks.
CREATE TRIGGER certificate_snapshot_insert BEFORE INSERT ON certificates WHEN NEW.status='issued'
BEGIN
 SELECT RAISE(ABORT,'CERTIFICATE_NOT_ELIGIBLE') WHERE NOT EXISTS (
  SELECT 1 FROM registrations r JOIN participants p ON p.id=r.participant_id JOIN events e ON e.id=r.event_id
  WHERE r.id=NEW.registration_id
    AND json_extract(NEW.snapshot,'$.name')=p.name
    AND json_extract(NEW.snapshot,'$.event_title')=e.title
    AND json_extract(NEW.snapshot,'$.event_date')=e.event_date
    AND json_extract(NEW.snapshot,'$.city')=e.city
    AND json_extract(NEW.snapshot,'$.hours')=e.certificate_hours
    AND json_extract(NEW.snapshot,'$.text')=e.certificate_text
    AND json_extract(NEW.snapshot,'$.signatories')=e.signatories
 );
END;
CREATE TRIGGER certificate_snapshot_update BEFORE UPDATE OF status ON certificates WHEN NEW.status='issued'
BEGIN
 SELECT RAISE(ABORT,'CERTIFICATE_NOT_ELIGIBLE') WHERE NOT EXISTS (
  SELECT 1 FROM registrations r JOIN participants p ON p.id=r.participant_id JOIN events e ON e.id=r.event_id
  WHERE r.id=NEW.registration_id
    AND json_extract(NEW.snapshot,'$.name')=p.name
    AND json_extract(NEW.snapshot,'$.event_title')=e.title
    AND json_extract(NEW.snapshot,'$.event_date')=e.event_date
    AND json_extract(NEW.snapshot,'$.city')=e.city
    AND json_extract(NEW.snapshot,'$.hours')=e.certificate_hours
    AND json_extract(NEW.snapshot,'$.text')=e.certificate_text
    AND json_extract(NEW.snapshot,'$.signatories')=e.signatories
 );
END;
CREATE TRIGGER registration_anonymized_reactivate BEFORE UPDATE OF status ON registrations WHEN NEW.status='active'
BEGIN
 SELECT RAISE(ABORT,'PARTICIPANT_ANONYMIZED') WHERE EXISTS (SELECT 1 FROM participants p WHERE p.id=NEW.participant_id AND p.anonymized_at IS NOT NULL);
END;
