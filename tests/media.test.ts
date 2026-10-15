import { describe, expect, it } from 'vitest';
import { getGoogleMapsEmbedUrl } from '../shared/media';

const embed = 'https://www.google.com/maps/embed?pb=!4v123!6m8!1m7!1sPANORAMA-ID!2m2!1d-2.4!2d-44.2!3f90!4f0';

describe('origem restrita das incorporações do Google Maps', () => {
  it('preserva a URL de uma vista oficial, sem interpretar o conteúdo de pb', () => {
    expect(getGoogleMapsEmbedUrl(embed)).toBe(embed);
    expect(getGoogleMapsEmbedUrl('https://www.google.com/maps/embed?pb=!1m18!2sUNDB%20Renascen%C3%A7a')).not.toBeNull();
  });

  it.each([
    '', '/images/undb.webp', 'javascript:alert(1)', '//www.google.com/maps/embed?pb=!x',
    'http://www.google.com/maps/embed?pb=!x', 'https://evil.example/maps/embed?pb=!x',
    'https://www.google.com.evil.example/maps/embed?pb=!x', 'https://google.com/maps/embed?pb=!x',
    'https://www.google.com@evil.example/maps/embed?pb=!x', 'https://user:password@www.google.com/maps/embed?pb=!x',
    'https://www.google.com:443/maps/embed?pb=!x', 'https://www.google.com:8443/maps/embed?pb=!x',
    'https://www.google.com/maps/embed/v1/streetview?key=secret', 'https://www.google.com/maps/embed/?pb=!x',
    'https://www.google.com/maps/embed?pb=', 'https://www.google.com/maps/embed?pb=!',
    'https://www.google.com/maps/embed?pb=invalid', 'https://www.google.com/maps/embed?pb=!x&pb=!y',
    'https://www.google.com/maps/embed?pb=!x&other=value', 'https://www.google.com/maps/embed?%70b=!x',
    'https://www.google.com/maps/embed?pb=!x#', 'https://www.google.com/maps/embed?pb=!x#fragment',
    'https://www.google.com/maps/embed?pb=!x\n', 'https://www.google.com/maps/embed?pb=!x%0a',
    'https://www.google.com/maps/embed?pb=!x%5c', 'https://www.google.com/maps/embed?pb=!x%INVALID',
    'https://www.google.com\\maps/embed?pb=!x', '<iframe src="https://www.google.com/maps/embed?pb=!x"></iframe>',
    `https://www.google.com/maps/embed?pb=!${'a'.repeat(1500)}`,
  ])('não promove uma URL não autorizada a iframe: %s', value => {
    expect(getGoogleMapsEmbedUrl(value)).toBeNull();
  });
});
