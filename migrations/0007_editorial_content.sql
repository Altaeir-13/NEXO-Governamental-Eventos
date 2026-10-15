-- Additive editorial metadata. Existing registrations, approvals, venue data,
-- participant records and certificate settings are not modified. Approval bits
-- start at zero: historical invitations must be reviewed before publication.
ALTER TABLE events ADD COLUMN venue_description TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN venue_photo_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN venue_photo_credit TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN venue_photo_source_url TEXT NOT NULL DEFAULT '';

ALTER TABLE speakers ADD COLUMN institution TEXT NOT NULL DEFAULT '';
ALTER TABLE speakers ADD COLUMN credentials_verified INTEGER NOT NULL DEFAULT 0 CHECK(credentials_verified IN (0,1));
ALTER TABLE speakers ADD COLUMN bio_approved INTEGER NOT NULL DEFAULT 0 CHECK(bio_approved IN (0,1));
ALTER TABLE speakers ADD COLUMN talk_title TEXT NOT NULL DEFAULT '';
ALTER TABLE speakers ADD COLUMN talk_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE speakers ADD COLUMN talk_approved INTEGER NOT NULL DEFAULT 0 CHECK(talk_approved IN (0,1));
ALTER TABLE speakers ADD COLUMN photo_authorized INTEGER NOT NULL DEFAULT 0 CHECK(photo_authorized IN (0,1));
ALTER TABLE speakers ADD COLUMN photo_credit TEXT NOT NULL DEFAULT '';
ALTER TABLE speakers ADD COLUMN participation_time TEXT;

-- Gate newly published records even when an operator uses SQL directly.
-- Existing rows remain stored and are filtered by the public API until reviewed.
CREATE TRIGGER speaker_publication_insert BEFORE INSERT ON speakers WHEN NEW.published=1
BEGIN
 SELECT RAISE(ABORT,'SPEAKER_NOT_APPROVED') WHERE NEW.invitation_status!='confirmed' OR NEW.credentials_verified!=1 OR NEW.bio_approved!=1 OR trim(NEW.name)='' OR trim(NEW.role)='' OR trim(NEW.bio)='';
END;
CREATE TRIGGER speaker_publication_update BEFORE UPDATE ON speakers WHEN NEW.published=1
BEGIN
 SELECT RAISE(ABORT,'SPEAKER_NOT_APPROVED') WHERE NEW.invitation_status!='confirmed' OR NEW.credentials_verified!=1 OR NEW.bio_approved!=1 OR trim(NEW.name)='' OR trim(NEW.role)='' OR trim(NEW.bio)='';
END;

UPDATE events SET venue_description='Em um ambiente dedicado à formação acadêmica e à troca de conhecimentos, reuniremos estudantes, professores e profissionais para discutir os desafios da ressocialização, os impactos do estigma social e as possibilidades de reintegração de pessoas egressas do sistema prisional.

Será uma oportunidade de aprendizado, reflexão e compartilhamento de experiências entre diferentes áreas do conhecimento.'
WHERE id='slz-2026' AND venue_description='';
