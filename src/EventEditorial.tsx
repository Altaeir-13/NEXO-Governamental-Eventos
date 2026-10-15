import { useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Clock3, MapPin, Navigation, Users } from 'lucide-react';
import type { EventSettings, Speaker } from '../shared/types';
import { getGoogleMapsEmbedUrl } from '../shared/media';
import './editorial.css';

function EditorialImage({ src, alt, children, className, onFailure }: { src: string; alt: string; children: React.ReactNode; className: string; onFailure?: () => void }) {
  const [failed, setFailed] = useState(false);
  return <div className={className}>{src && !failed
    ? <img src={src} alt={alt} width={960} height={720} loading="lazy" decoding="async" onError={() => { setFailed(true); onFailure?.(); }} />
    : children}</div>;
}

function SpeakerCard({ speaker: s }: { speaker: Speaker }) {
  const [failedPhoto, setFailedPhoto] = useState('');
  const initials = s.name.trim().split(/\s+/).filter(n => /\p{L}/u.test(n) && !['da', 'de', 'do', 'das', 'dos'].includes(n.toLowerCase())).slice(0, 2).map(n => n.match(/\p{L}/u)?.[0]).join('');
  const photo = s.photo_authorized && s.photo_url !== failedPhoto ? s.photo_url : '';
  return <article className="editorial-speaker" aria-labelledby={`speaker-${s.id}`}>
    <EditorialImage key={photo} className="editorial-portrait" src={photo} alt={`Retrato de ${s.name}`} onFailure={() => setFailedPhoto(s.photo_url)}>
      <div className="editorial-initials" aria-label={`Retrato de ${s.name} ainda não disponível`} role="img"><span aria-hidden="true">{initials}</span></div>
    </EditorialImage>
    <div className="editorial-speaker-body">
      <span className="editorial-confirmed"><Check size={14} aria-hidden="true" /> Participação confirmada</span>
      {s.area && <span className="editorial-area">{s.area}</span>}
      <h3 id={`speaker-${s.id}`}>{s.name}</h3>
      <p className="editorial-role">{s.role}</p>
      {s.institution && <p className="editorial-institution">{s.institution}</p>}
      <p className="editorial-bio">{s.bio}</p>
      <div className="editorial-talk">
        <span className="editorial-caption"><BookOpen size={15} aria-hidden="true" /> NESTA CONVERSA</span>
        {s.talk_approved && s.talk_title && s.talk_summary
          ? <><h4>{s.talk_title}</h4><p>{s.talk_summary}</p></>
          : <p className="editorial-pending">Tema em definição. Os detalhes serão divulgados pela organização.</p>}
      </div>
      {(s.participation_time || s.social_url || (photo && s.photo_credit)) && <div className="editorial-speaker-footer">
        {s.participation_time && <span className="editorial-time"><Clock3 size={16} aria-hidden="true" /> Participação às {s.participation_time.replace(':', 'h')}</span>}
        {s.social_url && <a className="text-link" href={s.social_url} target="_blank" rel="noreferrer" aria-label={`Perfil profissional de ${s.name} (abre em nova aba)`}>Perfil profissional <ArrowUpRight size={16} aria-hidden="true" /></a>}
        {photo && s.photo_credit && <small>Foto: {s.photo_credit}</small>}
      </div>}
    </div>
  </article>;
}

export function SpeakersSection({ speakers }: { speakers: Speaker[] }) {
  const approved = speakers.filter(s => s.invitation_status === 'confirmed' && s.published && s.credentials_verified && s.bio_approved);
  return <section id="convidados" className="speakers-band" aria-labelledby="speakers-title"><div className="section container">
    <div className="section-label"><span>04 / QUEM FAZ A CONVERSA</span><Users size={19} aria-hidden="true" /></div>
    <h2 id="speakers-title">Vozes que ampliam<br />o debate</h2>
    <p className="section-intro editorial-intro">Conheça os profissionais que compartilharão experiências e reflexões sobre justiça, psicologia, ressocialização e os desafios da reintegração social.</p>
    {approved.length ? <div className="editorial-speakers">{approved.map(s => <SpeakerCard key={s.id} speaker={s} />)}</div>
      : <div className="editorial-awaiting"><Users size={32} aria-hidden="true" /><div><span className="editorial-caption">DIFERENTES OLHARES, UM ENCONTRO</span><h3>Convidados em breve</h3><p>Estamos preparando as participações deste encontro. Os nomes, as trajetórias e os temas serão apresentados após a confirmação e a aprovação de cada convidado.</p></div><span className="outline-label">EM CONFIRMAÇÃO</span></div>}
  </div></section>;
}

export function VenueSection({ event: e }: { event: EventSettings }) {
  const [failedPhoto, setFailedPhoto] = useState('');
  const address = encodeURIComponent(`${e.venue}, ${e.address}`);
  const photo = e.venue_photo_authorized && e.venue_photo_url !== failedPhoto ? e.venue_photo_url : '';
  const streetView = getGoogleMapsEmbedUrl(photo);
  const hasCoordinates = Number.isFinite(e.latitude) && Number.isFinite(e.longitude) && (e.latitude !== 0 || e.longitude !== 0);
  return <section id="local" className="section container" aria-labelledby="venue-title">
    <div className="section-label"><span>05 / NOSSO PONTO DE ENCONTRO</span><MapPin size={19} aria-hidden="true" /></div>
    <h2 id="venue-title">Ponto de Encontro</h2>
    <p className="section-lead editorial-venue-lead">Um espaço para diálogos que transformam perspectivas.</p>
    <div className="editorial-venue">
      <figure className="editorial-venue-figure">
        {streetView ? <div className="editorial-venue-image editorial-street-view"><iframe title={e.venue_photo_alt || `Vista da fachada de ${e.venue} no Google Street View`} src={streetView} width={960} height={720} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div> : <EditorialImage key={photo} className="editorial-venue-image" src={photo} alt={e.venue_photo_alt || `Espaço de encontro em ${e.venue}`} onFailure={() => setFailedPhoto(e.venue_photo_url)}>
          <div className="editorial-venue-placeholder"><MapPin size={44} strokeWidth={1.2} aria-hidden="true" /><span className="editorial-caption">CONHECIMENTO QUE CONECTA</span><p>Um lugar para<br />novas perspectivas.</p><span>{e.city}</span><span className="editorial-placeholder-lines" aria-hidden="true" /></div>
        </EditorialImage>}
        <figcaption>{photo && e.venue_photo_credit ? <>{streetView ? '' : 'Foto: '}{e.venue_photo_credit}</> : <>Encontro presencial · {e.city}</>}{photo && e.venue_photo_source_url && <a href={e.venue_photo_source_url} target="_blank" rel="noreferrer">{streetView ? 'Ver fachada no Google Maps' : 'Fonte da fotografia'} <ArrowUpRight size={13} aria-hidden="true" /></a>}</figcaption>
      </figure>
      <div className="editorial-venue-info">
        <span className="outline-label">{e.venue_confirmed ? 'LOCAL CONFIRMADO' : 'LOCAL PREVISTO'}</span>
        <h3>{e.venue}</h3>
        <p className="editorial-venue-intro">{e.venue_confirmed ? 'Nosso encontro será realizado' : 'Nosso encontro está previsto para acontecer'} em um espaço dedicado à formação acadêmica e à troca de conhecimentos.</p>
        <dl className="editorial-venue-facts">
          <div><dt><MapPin size={17} aria-hidden="true" /> Endereço</dt><dd>{e.address}</dd></div>
          <div><dt><Users size={17} aria-hidden="true" /> Espaço{e.venue_confirmed ? '' : ' previsto'}</dt><dd>{e.venue_confirmed && e.auditorium ? e.auditorium : 'Auditório da instituição · a confirmar'}</dd></div>
          <div><dt><Clock3 size={17} aria-hidden="true" /> Credenciamento previsto</dt><dd>{e.checkin_time?.replace(':', 'h') || 'A definir'}</dd></div>
          <div><dt><Check size={17} aria-hidden="true" /> Entrada</dt><dd>Gratuita, mediante inscrição</dd></div>
        </dl>
        {!e.venue_confirmed && <p className="editorial-venue-note">O espaço está sujeito à confirmação pela organização. Consulte esta página antes de se deslocar.</p>}
      </div>
    </div>
    {e.venue_description && <div className="editorial-venue-description">{e.venue_description.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>}
    <nav className="map-buttons editorial-map-buttons" aria-label="Navegação até o local do evento">
      <a className="button" href={`https://www.google.com/maps/dir/?api=1&destination=${address}`} target="_blank" rel="noreferrer"><Navigation size={18} aria-hidden="true" /> Como chegar <ArrowUpRight size={17} aria-hidden="true" /></a>
      <a className="button button-outline" href={`https://www.google.com/maps/search/?api=1&query=${address}`} target="_blank" rel="noreferrer">Abrir no Google Maps <ArrowUpRight size={17} aria-hidden="true" /></a>
      <a className="button button-outline" href={`https://waze.com/ul?q=${address}&navigate=yes`} target="_blank" rel="noreferrer">Abrir no Waze <ArrowUpRight size={17} aria-hidden="true" /></a>
    </nav>
    {hasCoordinates && <div className="map-frame"><iframe title="Mapa do endereço do evento, OpenStreetMap" loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${e.longitude - 0.009}%2C${e.latitude - 0.006}%2C${e.longitude + 0.009}%2C${e.latitude + 0.006}&layer=mapnik&marker=${e.latitude}%2C${e.longitude}`} /><a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© colaboradores do OpenStreetMap</a></div>}
  </section>;
}
