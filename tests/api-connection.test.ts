import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('conexão de operações autenticadas', () => {
  it('não transforma resposta incompleta em confirmação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(api('/admin/check-in', { method: 'POST', body: '{}' })).rejects.toThrow('Resposta incompleta');
  });
  it('interrompe espera de rede e orienta consultar antes de repetir, sem replay automático', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    vi.stubGlobal('fetch', fetcher);
    const pending = api('/admin/check-in', { method: 'POST', body: '{}' });
    const assertion = expect(pending).rejects.toThrow('Consulte o estado no servidor');
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', method: 'POST' });
  });
});
