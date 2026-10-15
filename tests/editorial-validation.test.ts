import { describe, expect, it } from 'vitest';
import { httpsUrlSchema, imageUrlSchema, wordCount } from '../functions/_lib/validation';

describe('endereços editoriais e contagem de palavras', () => {
  it.each(['/images/undb.webp', '/images/convidados/pessoa-1.avif', 'https://example.org/retrato.jpg', ''])('aceita uma imagem local segura ou HTTPS: %s', value => {
    expect(imageUrlSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)', 'data:image/png;base64,AAAA', '//example.org/photo.jpg', 'http://example.org/photo.jpg',
    'https://user:password@example.org/photo.jpg', 'https://example.org\\photo.jpg', 'https://example.org/\nphoto.jpg',
    'https://example.org/%0aphoto.jpg', '/images/../private.jpg', '/images/%2e%2e/private.jpg', '/images/a.webp?x=1',
    '/images/photo.svg', '/images/a/../../private.jpg', '/images//elsewhere.jpg', '/images/a\\b.jpg',
  ])('recusa caminhos inseguros de imagem: %s', value => {
    expect(imageUrlSchema.safeParse(value).success).toBe(false);
  });

  it('protege links de origem e profissionais e conta parágrafos sem inflar espaços', () => {
    expect(httpsUrlSchema.safeParse('https://example.org/perfil?tema=justica').success).toBe(true);
    expect(httpsUrlSchema.safeParse('https://user@example.org/perfil').success).toBe(false);
    expect(httpsUrlSchema.safeParse('https://example.org/%5cperfil').success).toBe(false);
    expect(wordCount('  Uma mini\nbiografia\n\ncom    espaços.  ')).toBe(5);
    expect(wordCount('')).toBe(0);
  });
});
