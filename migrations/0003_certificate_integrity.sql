-- Enforce eligibility even if an administrator concurrently corrects attendance
-- while a separate request is approving the certificate batch.
CREATE TRIGGER certificate_eligible_insert BEFORE INSERT ON certificates WHEN NEW.status='issued'
BEGIN
 SELECT RAISE(ABORT,'CERTIFICATE_NOT_ELIGIBLE') WHERE NOT EXISTS (
  SELECT 1 FROM registrations r JOIN checkins c ON c.registration_id=r.id JOIN events e ON e.id=r.event_id JOIN participants p ON p.id=r.participant_id
  WHERE r.id=NEW.registration_id AND r.status='active' AND r.certificate_eligible=1 AND p.anonymized_at IS NULL
    AND e.certificates_released=1 AND e.certificate_rules_approved=1 AND e.date_confirmed=1 AND e.venue_confirmed=1 AND length(trim(e.signatories))>0
 );
END;
CREATE TRIGGER certificate_eligible_update BEFORE UPDATE OF status ON certificates WHEN NEW.status='issued'
BEGIN
 SELECT RAISE(ABORT,'CERTIFICATE_NOT_ELIGIBLE') WHERE NOT EXISTS (
  SELECT 1 FROM registrations r JOIN checkins c ON c.registration_id=r.id JOIN events e ON e.id=r.event_id JOIN participants p ON p.id=r.participant_id
  WHERE r.id=NEW.registration_id AND r.status='active' AND r.certificate_eligible=1 AND p.anonymized_at IS NULL
    AND e.certificates_released=1 AND e.certificate_rules_approved=1 AND e.date_confirmed=1 AND e.venue_confirmed=1 AND length(trim(e.signatories))>0
 );
END;
