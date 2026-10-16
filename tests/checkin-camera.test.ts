import { describe, expect, it, vi } from 'vitest';
import type { BrowserQRCodeReader } from '@zxing/browser';
import { cameraError, CheckinCamera, isPrivateCheckinInput, parseCheckinQr } from '../src/admin/checkin-camera';

const origin = 'https://nexo.example';
const token = 'a'.repeat(64);
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function setup() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const video = { srcObject: stream } as HTMLVideoElement;
  const controls = { stop: vi.fn() };
  let decode!: Parameters<BrowserQRCodeReader['decodeFromStream']>[2];
  const reader = { decodeFromStream: vi.fn(async (_stream, _video, callback) => { decode = callback; return controls; }) } as Pick<BrowserQRCodeReader, 'decodeFromStream'>;
  const deps = { getMedia: vi.fn(async () => stream), loadReader: vi.fn(async () => reader) };
  return { track, stream, video, controls, reader, deps, read: (text: string) => decode({ getText: () => text } as never, undefined, controls) };
}

describe('credenciais de QR existentes', () => {
  it('impede links privados malformados e tokens de caírem em URLs de busca manual', () => {
    for (const value of [token, `/ingresso#${token}`, `nexo.example/ingresso#${token}`, `token=${token}`, `prefixo${token}sufixo`, token.toUpperCase()]) expect(isPrivateCheckinInput(value)).toBe(true);
    expect(isPrivateCheckinInput('Pessoa Fictícia')).toBe(false);
    expect(isPrivateCheckinInput('NEXO-ABC123')).toBe(false);
  });
  it('aceita token e fragmento privado sem navegar nem transmitir o token em URL', () => {
    expect(parseCheckinQr(token, origin)).toBe(token);
    expect(parseCheckinQr(`${origin}/ingresso#${token}`, origin)).toBe(token);
    expect(parseCheckinQr(`${origin}/ingresso#token=${token}`, origin)).toBe(token);
  });
  it.each([`https://outro.example/ingresso#${token}`, `${origin}/admin#${token}`, `${origin}/ingresso?token=${token}`, 'QR inválido', 'ABC-123456'])('recusa QR que não é ingresso individual: %s', value => {
    expect(() => parseCheckinQr(value, origin)).toThrow('não é um ingresso válido');
  });
});

describe('ciclo de vida da câmera', () => {
  it('prefere traseira, trava leituras repetidas e libera as tracks antes da consulta', async () => {
    const fixture = setup(), camera = new CheckinCamera();
    const onRead = vi.fn(() => expect(fixture.track.stop).toHaveBeenCalled());
    expect(await camera.start(fixture.video, '', onRead, fixture.deps)).toBe(true);
    expect(fixture.deps.getMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    fixture.read(token); fixture.read(token);
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith(token);
    expect(fixture.video.srcObject).toBeNull();
  });
  it('seleciona o dispositivo solicitado e encerra a câmera ao sair', async () => {
    const fixture = setup(), camera = new CheckinCamera();
    await camera.start(fixture.video, 'camera-2', vi.fn(), fixture.deps);
    expect(fixture.deps.getMedia).toHaveBeenCalledWith({ audio: false, video: { deviceId: { exact: 'camera-2' } } });
    camera.stop();
    expect(fixture.controls.stop).toHaveBeenCalled(); expect(fixture.track.stop).toHaveBeenCalled();
  });
  it('libera stream concedida depois de sair enquanto a permissão estava pendente', async () => {
    const fixture = setup(), camera = new CheckinCamera(), permission = deferred<MediaStream>();
    fixture.deps.getMedia = vi.fn(() => permission.promise);
    const running = camera.start(fixture.video, '', vi.fn(), fixture.deps);
    await Promise.resolve(); camera.stop(); permission.resolve(fixture.stream);
    expect(await running).toBe(false); expect(fixture.track.stop).toHaveBeenCalled(); expect(fixture.reader.decodeFromStream).not.toHaveBeenCalled();
  });
  it('libera controles que só ficam disponíveis depois da desmontagem', async () => {
    const fixture = setup(), camera = new CheckinCamera(), decoder = deferred<{ stop(): void }>();
    fixture.reader.decodeFromStream = vi.fn(() => decoder.promise);
    const running = camera.start(fixture.video, '', vi.fn(), fixture.deps);
    await Promise.resolve(); await Promise.resolve(); camera.stop(); decoder.resolve(fixture.controls);
    expect(await running).toBe(false); expect(fixture.track.stop).toHaveBeenCalled(); expect(fixture.controls.stop).toHaveBeenCalled();
  });
  it('limpa stream se o decoder falha e permite reiniciar', async () => {
    const fixture = setup(), camera = new CheckinCamera();
    vi.mocked(fixture.reader.decodeFromStream).mockRejectedValueOnce(new Error('Falha decoder'));
    await expect(camera.start(fixture.video, '', vi.fn(), fixture.deps)).rejects.toThrow('Falha decoder');
    expect(fixture.track.stop).toHaveBeenCalled();
    expect(await camera.start(fixture.video, '', vi.fn(), fixture.deps)).toBe(true);
    camera.stop();
  });
  it.each([['NotAllowedError', 'negado'], ['NotFoundError', 'Nenhuma câmera'], ['NotReadableError', 'ocupada'], ['OverconstrainedError', 'outra câmera']])('orienta falha %s sem depender de câmera física', (name, message) => {
    const error = new Error('Detalhe do sistema'); error.name = name;
    expect(cameraError(error)).toContain(message);
  });
});
