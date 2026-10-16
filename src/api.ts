export class ApiError extends Error { constructor(message: string, public status = 500) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
 const controller = new AbortController();
 const abort = () => controller.abort();
 if (options.signal?.aborted) abort();
 options.signal?.addEventListener('abort', abort, { once: true });
 const timeout = setTimeout(abort, 20000);
 try {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, signal: controller.signal, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => { if (response.ok) throw new ApiError('Resposta incompleta do servidor. Consulte o estado antes de repetir a operação.', 503); return {}; }) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(String(data.error || 'Não foi possível concluir. Verifique a conexão e tente novamente.'), response.status);
  return data as T;
 } catch (error) {
  if (controller.signal.aborted) throw new ApiError('A conexão demorou demais ou foi interrompida. Consulte o estado no servidor antes de repetir a operação.', 503);
  throw error;
 } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
export async function downloadPdf(path: string, body: unknown, filename: string) {
 const pdf = await import('../shared/pdf').catch(() => { throw new Error('Uma atualização está disponível ou a conexão falhou. Recarregue esta página e tente baixar novamente.'); });
 let bytes: Uint8Array;
 if(path.startsWith('/ticket')) {
  const ticket = await api<import('../shared/types').Ticket>('/ticket', {method:'POST',body:JSON.stringify(body)});
  bytes = await pdf.ticketPdf(ticket, location.origin);
 } else {
  const certificate = await api<{snapshot:import('../shared/pdf').CertificateSnapshot;code:string;issued_at:string}>('/certificate', {method:'POST',body:JSON.stringify(body)});
  bytes = await pdf.certificatePdf(certificate.snapshot, certificate.code, certificate.issued_at, location.origin);
 }
 const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart],{type:'application/pdf'})); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
