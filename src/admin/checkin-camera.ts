import type { BrowserQRCodeReader } from '@zxing/browser';

type CameraDependencies = {
  getMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  loadReader(): Promise<Pick<BrowserQRCodeReader, 'decodeFromStream'>>;
};

/** Owns the stream even while the permission dialog or decoder is still pending. */
export class CheckinCamera {
  private revision = 0;
  private stream: MediaStream | null = null;
  private controls: { stop(): void } | null = null;
  private video: HTMLVideoElement | null = null;

  stop() {
    this.revision++;
    this.controls?.stop();
    this.controls = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
  }

  async start(video: HTMLVideoElement, deviceId: string, onRead: (text: string) => void, dependencies: CameraDependencies = {
    getMedia: (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints),
    loadReader: async () => { const { BrowserQRCodeReader } = await import('@zxing/browser'); return new BrowserQRCodeReader(); },
  }): Promise<boolean> {
    this.stop();
    const revision = this.revision;
    try {
      const reader = await dependencies.loadReader();
      if (revision !== this.revision) return false;
      const stream = await dependencies.getMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } } });
      if (revision !== this.revision) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream;
      this.video = video;
      const controls = await reader.decodeFromStream(stream, video, (result, _error, controls) => {
        if (!result || revision !== this.revision) return;
        // Lock synchronously before asynchronous validation. Never log decoded text.
        this.stop();
        controls.stop();
        onRead(result.getText());
      });
      if (revision !== this.revision) { controls.stop(); return false; }
      this.controls = controls;
      return true;
    } catch (error) {
      if (revision !== this.revision) return false;
      this.stop();
      throw error;
    }
  }
}

export function parseCheckinQr(value: string, origin: string): string {
  const raw = value.trim();
  if (/^[a-f0-9]{64}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const token = url.hash.slice(1).replace(/^token=/, '');
    if (url.origin === origin && url.pathname === '/ingresso' && !url.search && !url.username && !url.password && /^[a-f0-9]{64}$/.test(token)) return token;
  } catch { /* Tokens and ticket fragments only; never navigate scanned addresses. */ }
  throw new Error('Este QR Code não é um ingresso válido desta plataforma. Confira o comprovante ou use a busca manual.');
}

/** A malformed private link must never fall through to a search URL/access log. */
export function isPrivateCheckinInput(value: string): boolean {
  return /[a-f0-9]{64}|#|\/ingresso|token=|https?:\/\//i.test(value);
}

export function cameraError(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Acesso à câmera negado. Permita a câmera nas configurações deste site no navegador e tente novamente, ou use a busca manual.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Nenhuma câmera foi encontrada neste dispositivo. Use a busca manual.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'A câmera está ocupada ou indisponível. Feche outros aplicativos que usam a câmera e tente novamente.';
  if (name === 'OverconstrainedError') return 'A câmera selecionada não está disponível. Escolha outra câmera ou a opção automática.';
  return 'Não foi possível iniciar a câmera. Confira a permissão, use HTTPS e tente novamente. A busca manual continua disponível.';
}
