import { describe, expect, it } from 'vitest';
import { body, hashPassword, keyed, originCheck, randomToken, sessionCookie, sha, verifyPassword } from '../functions/_lib/security';

describe('controles de segurança sem persistência', () => {
  it('usa salt individual e valida senha sem aceitar hash malformado', async () => {
    const first = await hashPassword('senha fictícia para testes 123!');
    const second = await hashPassword('senha fictícia para testes 123!');
    expect(first).not.toBe(second);
    expect(first).not.toContain('senha fictícia');
    expect(await verifyPassword('senha fictícia para testes 123!', first)).toBe(true);
    expect(await verifyPassword('incorreta', first)).toBe(false);
    expect(await verifyPassword('qualquer', 'pbkdf2$1$invalid$hash')).toBe(false);
  });

  it('produz credenciais imprevisíveis de 256 bits e hashes consistentes', async () => {
    const tokens = Array.from({ length: 100 }, randomToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.every(token => /^[a-f0-9]{64}$/.test(token))).toBe(true);
    expect(await sha('fictício')).toBe(await sha('fictício'));
    expect(await sha('fictício')).not.toBe(await sha('outro'));
  });

  it('recusa origem cruzada e segredo ausente', async () => {
    expect(() => originCheck(new Request('https://nexo.test/api/register', {
      headers: { Origin: 'https://outro.test' },
    }))).toThrow();
    expect(() => originCheck(new Request('https://nexo.test/api/register', {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    }))).toThrow();
    await expect(keyed({ TOKEN_SECRET: '', DB: {} as D1Database }, 'test')).rejects.toMatchObject({ status: 503 });
  });

  it('rejeita tipos e tamanhos de corpo inadequados antes da regra de negócio', async () => {
    const request = (value: string, type = 'application/json') => new Request('https://nexo.test/api/register', {
      method: 'POST', headers: { 'Content-Type': type }, body: value,
    });
    await expect(body(request('[]'))).rejects.toMatchObject({ status: 400 });
    await expect(body(request('{'))).rejects.toMatchObject({ status: 400 });
    await expect(body(request('{}', 'text/plain'))).rejects.toMatchObject({ status: 415 });
    await expect(body(request(JSON.stringify({ text: 'a'.repeat(70_000) })))).rejects.toMatchObject({ status: 413 });
  });

  it('protege o cookie em produção e encerra-o no logout', () => {
    const cookie = sessionCookie(new Request('https://evento.pages.dev/admin'), randomToken());
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('; Secure');
    const cleared = sessionCookie(new Request('https://evento.pages.dev/admin'), '', true);
    expect(cleared).toContain('nexo_session=;');
    expect(cleared).toContain('Max-Age=0');
  });
});
