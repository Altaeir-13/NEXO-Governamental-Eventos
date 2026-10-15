import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpeakersSection, VenueSection } from '../src/EventEditorial';
import type { EventSettings, Speaker } from '../shared/types';

const speaker: Speaker = { id: 'ficticio', event_id: 'ensaio', name: 'Pessoa Fictícia', role: 'Profissional de ensaio', area: 'Área fictícia', institution: 'Instituição fictícia', bio: 'Biografia de ensaio aprovada.', invitation_status: 'confirmed', published: 1, credentials_verified: 1, bio_approved: 1, photo_url: '/images/pessoa.webp', photo_authorized: 0, photo_credit: 'Crédito privado', talk_title: 'Rascunho privado', talk_summary: 'Resumo privado', talk_approved: 0, social_url: '', display_order: 0, participation_time: null };
const venue = { venue: 'Instituição fictícia', address: 'Avenida de Ensaio, 443, São Luís — MA', city: 'São Luís — MA', auditorium: 'Auditório ainda não confirmado', venue_confirmed: 0, checkin_time: '18:00', venue_description: 'Diálogos e conhecimento.', venue_photo_url: '/images/local.webp', venue_photo_authorized: 0, venue_photo_alt: 'Foto fictícia para testes', venue_photo_credit: 'Crédito privado', venue_photo_source_url: '', latitude: 0, longitude: 0 } as EventSettings;

describe('apresentação editorial pública', () => {
  it('usa iniciais e não revela foto nem tema sem autorização', () => {
    const html = renderToStaticMarkup(<SpeakersSection speakers={[speaker]} />);
    expect(html).toContain('Pessoa Fictícia');
    expect(html).toContain('PF');
    expect(html).toContain('Tema em definição');
    expect(html).not.toContain('/images/pessoa.webp');
    expect(html).not.toContain('Rascunho privado');
    expect(html).not.toContain('Resumo privado');
    expect(html).not.toContain('Crédito privado');
  });
  it.each([{ published: 0 }, { invitation_status: 'pending' }, { credentials_verified: 0 }, { bio_approved: 0 }])('oculta pessoa com requisito editorial pendente %j', flags => {
    const html = renderToStaticMarkup(<SpeakersSection speakers={[{ ...speaker, ...flags }]} />);
    expect(html).not.toContain('Pessoa Fictícia');
    expect(html).toContain('Convidados em breve');
  });
  it('apresenta foto, tema, vínculo e horário aprovados com espaço de imagem reservado', () => {
    const html = renderToStaticMarkup(<SpeakersSection speakers={[{ ...speaker, photo_authorized: 1, talk_approved: 1, participation_time: '19:30' }]} />);
    expect(html).toContain('src="/images/pessoa.webp"');
    expect(html).toContain('alt="Retrato de Pessoa Fictícia"');
    expect(html).toContain('width="960" height="720"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('Rascunho privado');
    expect(html).toContain('Instituição fictícia');
    expect(html).toContain('19h30');
  });
  it('oculta o auditório específico, a imagem e o mapa sem confirmação', () => {
    const html = renderToStaticMarkup(<VenueSection event={venue} />);
    expect(html).not.toContain(venue.auditorium);
    expect(html).not.toContain('/images/local.webp');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('LOCAL PREVISTO');
    for (const endpoint of ['https://www.google.com/maps/dir/?api=1', 'https://www.google.com/maps/search/?api=1', 'https://waze.com/ul?q=']) expect(html).toContain(endpoint);
    expect(html).toContain(encodeURIComponent(venue.address));
    expect(html).not.toMatch(/[?&](?:amp;)?ll=/);
  });
  it('apresenta imagem e auditório autorizados sem criar coordenadas', () => {
    const html = renderToStaticMarkup(<VenueSection event={{ ...venue, venue_confirmed: 1, venue_photo_authorized: 1 }} />);
    expect(html).toContain(venue.auditorium);
    expect(html).toContain('src="/images/local.webp"');
    expect(html).toContain('Foto fictícia para testes');
    expect(html).not.toContain('<iframe');
  });
  it('incorpora a vista do Google somente quando autorizada, mantendo título e fonte', () => {
    const visual = { ...venue, venue_photo_url: 'https://www.google.com/maps/embed?pb=!4v123!6m8!1m7!1sensaio', venue_photo_source_url: 'https://www.google.com/maps/', venue_photo_credit: 'Panorama de ensaio · Google Street View' };
    const hidden = renderToStaticMarkup(<VenueSection event={visual} />);
    expect(hidden).not.toContain('<iframe');
    const html = renderToStaticMarkup(<VenueSection event={{ ...visual, venue_photo_authorized: 1 }} />);
    expect(html).toContain('<iframe title="Foto fictícia para testes"');
    expect(html).toContain('src="https://www.google.com/maps/embed?pb=');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('Panorama de ensaio · Google Street View');
    expect(html).toContain('Ver fachada no Google Maps');
    expect(html).not.toContain(venue.auditorium);
  });
});
