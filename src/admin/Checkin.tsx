import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, QrCode, RefreshCw, Search, ShieldCheck, Video, WifiOff, X } from 'lucide-react';
import type { EventSettings, Participant } from '../../shared/types';
import { ApiError } from '../api';
import { cameraError, CheckinCamera, isPrivateCheckinInput, parseCheckinQr } from './checkin-camera';

type Requester = <T>(path: string, options?: RequestInit) => Promise<T>;
type Credential = { token?: string; code?: string };
type Identity = Pick<Participant, 'name' | 'code' | 'status' | 'checked_in_at'> & Partial<Pick<Participant, 'institution' | 'course' | 'checked_in_by'>>;
type Reception = { total: number; active: number; cancelled: number; checkedIn: number; absent: number; attendancePercentage: number; updatedAt: string; recentCheckins: { id: string; name: string; code: string; checked_in_at: string; checked_in_by: string | null }[] };
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : 'Horário não informado';
const errorText = (error: unknown) => error instanceof ApiError ? error.message : error instanceof TypeError ? 'Falha de conexão. Confira a internet e tente novamente.' : error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

function Message({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`adm-notice ${error ? 'adm-notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

export function CheckinConfirmation({ request, eventId, participant, credential, onClose, onDone }: {
  request: Requester; eventId: string; participant: Identity; credential: Credential;
  onClose(): void; onDone(message: string): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [identity, setIdentity] = useState(participant);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const sending = useRef(false);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed || sending.current || uncertain || identity.status !== 'active' || identity.checked_in_at) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const result = await request<{ participant: Participant; alreadyCheckedIn: boolean }>('/admin/check-in', json({ ...credential, eventId, confirmIdentity: true }));
      onDone(`${result.alreadyCheckedIn ? 'Ingresso já utilizado. Presença já registrada' : 'Presença confirmada'}: ${result.participant.name} · ${date(result.participant.checked_in_at)} · Operador: ${result.participant.checked_in_by || 'Registrado na auditoria'}.`);
    } catch (error) {
      setUncertain(true); setConfirmed(false);
      setError(`Confirmação não concluída nesta tela. ${errorText(error)} Consulte novamente antes de repetir: o servidor pode ter recebido a operação.`);
    } finally { sending.current = false; setBusy(false); }
  };
  const recheck = async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const result = await request<{ participant: Participant }>('/admin/check-in/lookup', json({ ...credential, eventId }));
      setIdentity(result.participant); setUncertain(false); setConfirmed(false);
    } catch (error) { setError(`Não foi possível consultar o estado no servidor. ${errorText(error)}`); }
    finally { sending.current = false; setBusy(false); }
  };
  const available = identity.status === 'active' && !identity.checked_in_at;
  return <dialog ref={dialog} className="adm-dialog adm-checkin-dialog" aria-label="Confirmar identidade" onCancel={e => { e.preventDefault(); if (!sending.current) onClose(); }}>
    <div className="adm-dialog-head"><h2>Conferir ingresso</h2><button className="adm-icon" type="button" aria-label="Fechar conferência" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <form onSubmit={submit}>
      <div className="adm-identity"><span className="adm-avatar">{identity.name.slice(0, 1)}</span><h3>{identity.name}</h3><code>{identity.code}</code>{identity.institution && <p>{identity.institution}{identity.course ? ` · ${identity.course}` : ''}</p>}</div>
      {identity.status !== 'active' ? <Message error>Ingresso cancelado. A presença não pode ser registrada.</Message> : identity.checked_in_at ? <Message>Ingresso já utilizado. Presença registrada em {date(identity.checked_in_at)}. Operador: {identity.checked_in_by || 'Registrado na auditoria'}.</Message> : <><Message>Ingresso válido. Ainda não possui presença registrada.</Message><label className="adm-checkbox"><input type="checkbox" required disabled={busy || uncertain} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Conferi o nome e confirmei a identidade da pessoa presente.</span></label></>}
      {error && <Message error>{error}</Message>}
      {uncertain && <button type="button" className="adm-button adm-secondary" disabled={busy} onClick={recheck}><RefreshCw size={18} />Consultar novamente</button>}
      <div className="adm-form-footer"><button type="button" className="adm-button adm-secondary" disabled={busy} onClick={onClose}>{available ? 'Cancelar' : 'Próximo participante'}</button>{available && <button className="adm-button" disabled={!confirmed || busy || uncertain}>{busy ? <LoaderCircle className="adm-spin" size={18} /> : <CheckCircle2 size={18} />}{busy ? 'Registrando…' : 'Confirmar presença'}</button>}</div>
    </form>
  </dialog>;
}

export default function Checkin({ request, event }: { request: Requester; event: EventSettings }) {
  const camera = useRef(new CheckinCamera());
  const video = useRef<HTMLVideoElement>(null);
  const mounted = useRef(true);
  const operating = useRef(false);
  const starting = useRef(false);
  const resume = useRef(false);
  const confirming = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLatest = useRef<() => Promise<void>>(async () => {});
  const cancelRestart = useCallback(() => { if (restartTimer.current) clearTimeout(restartTimer.current); restartTimer.current = null; }, []);
  const [scanning, setScanning] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Participant[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<{ identity: Identity; credential: Credential } | null>(null);
  const [retry, setRetry] = useState<Credential | null>(null);
  const [restart, setRestart] = useState(0);
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const stop = useCallback(() => { camera.current.stop(); setScanning(false); }, []);
  useEffect(() => {
    mounted.current = true;
    const suspend = () => { if (document.visibilityState === 'hidden') { resume.current = false; stop(); } };
    const connection = () => { setOnline(navigator.onLine); if (!navigator.onLine) { resume.current = false; stop(); } };
    const leave = () => { resume.current = false; stop(); };
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('pagehide', leave);
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    return () => { mounted.current = false; resume.current = false; cancelRestart(); camera.current.stop(); document.removeEventListener('visibilitychange', suspend); window.removeEventListener('pagehide', leave); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  }, [stop, cancelRestart]);

  const inspect = async (credential: Credential) => {
    cancelRestart();
    if (operating.current || confirming.current) return;
    operating.current = true; stop(); setBusy(true); setNotice({ text: 'QR Code lido. Consultando o ingresso no servidor…' }); setRetry(null); setResults(null);
    try {
      const result = await request<{ participant: Participant }>('/admin/check-in/lookup', json({ eventId: event.id, ...credential }));
      if (mounted.current) { confirming.current = true; setConfirmation({ identity: result.participant, credential }); setNotice(null); }
    } catch (error) {
      if (mounted.current) { setNotice({ text: `Nenhuma presença foi confirmada. ${errorText(error)}`, error: true }); if (!(error instanceof ApiError) || error.status >= 500) setRetry(credential); }
    } finally { operating.current = false; if (mounted.current) setBusy(false); }
  };
  const startCamera = async () => {
    cancelRestart();
    if (starting.current || operating.current || confirming.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setNotice({ text: 'A câmera requer HTTPS e um navegador com acesso à câmera. Use a busca manual neste dispositivo.', error: true }); return; }
    if (!navigator.onLine || document.visibilityState === 'hidden') return;
    starting.current = true; setCameraBusy(true); setNotice(null); setRetry(null); setScanning(true);
    try {
      await camera.current.start(video.current!, deviceId, value => {
        if (!mounted.current) return;
        setScanning(false); resume.current = true;
        try { const token = parseCheckinQr(value, location.origin); void inspect({ token }); }
        catch (error) { setNotice({ text: errorText(error), error: true }); }
      });
      if (mounted.current) {
        const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (mounted.current) setDevices(list.filter(device => device.kind === 'videoinput'));
      }
    } catch (error) { if (mounted.current) { stop(); setNotice({ text: cameraError(error), error: true }); } }
    finally { starting.current = false; if (mounted.current) setCameraBusy(false); }
  };
  startLatest.current = startCamera;
  // A successful operation prepares the next read without losing the success message immediately.
  useEffect(() => {
    if (!restart) return;
    restartTimer.current = setTimeout(() => { restartTimer.current = null; if (mounted.current && resume.current && !confirming.current && document.visibilityState === 'visible' && navigator.onLine) void startLatest.current(); }, 1600);
    return cancelRestart;
  }, [restart]);
  const closeConfirmation = () => { confirming.current = false; setConfirmation(null); if (resume.current) setRestart(value => value + 1); };
  const search = async (e: FormEvent) => {
    e.preventDefault();
    cancelRestart();
    if (operating.current || starting.current || confirming.current) return;
    resume.current = false; stop(); setNotice(null); setRetry(null); setResults(null);
    const value = query.trim();
    if (isPrivateCheckinInput(value)) {
      setQuery('');
      try { await inspect({ token: parseCheckinQr(value, location.origin) }); } catch (error) { setNotice({ text: errorText(error), error: true }); }
      return;
    }
    operating.current = true; setBusy(true);
    try {
      const result = await request<{ participants: Participant[] }>(`/admin/participants?eventId=${encodeURIComponent(event.id)}&q=${encodeURIComponent(value)}`);
      if (mounted.current) setResults(result.participants);
    } catch (error) { if (mounted.current) setNotice({ text: errorText(error), error: true }); }
    finally { operating.current = false; if (mounted.current) setBusy(false); }
  };
  return <>
    {!online && <Message error><WifiOff size={20} />Sem internet. O credenciamento depende de consulta ao servidor. Não há sincronização automática offline.</Message>}
    {notice && <Message error={notice.error}>{notice.text}</Message>}
    {retry && <button className="adm-button adm-secondary adm-retry-lookup" disabled={busy || !online} onClick={() => void inspect(retry)}><RefreshCw size={18} />Repetir consulta segura</button>}
    <section className="adm-panel adm-checkin-panel">
      <div className="adm-section-title"><div><span className="adm-eyebrow">RECEPÇÃO DOS PARTICIPANTES</span><h2>Leia, confira e dê<br />as boas-vindas.</h2><p>Confira o nome com o participante antes de confirmar sua entrada.</p></div><span className="adm-pill adm-pill-solid"><ShieldCheck size={14} />Acesso autorizado</span></div>
      <div className={`adm-camera ${scanning ? 'is-scanning' : ''}`}><video ref={video} muted playsInline autoPlay aria-label="Leitor de QR Code pela câmera" hidden={!scanning} />{!scanning && <div className="adm-camera-placeholder"><QrCode size={60} strokeWidth={1.2} /><strong>{busy ? 'Verificando ingresso…' : 'Leitura de ingresso'}</strong><p>Posicione o QR Code dentro do enquadramento.</p></div>}{scanning && <div className="adm-scan-frame" aria-hidden="true" />}</div>
      <div className="adm-camera-actions">{scanning ? <button className="adm-button adm-secondary" onClick={() => { resume.current = false; stop(); }}>Parar câmera</button> : <button className="adm-button" disabled={cameraBusy || busy || !!confirmation || !online} onClick={() => void startCamera()}>{cameraBusy ? <LoaderCircle className="adm-spin" size={19} /> : <Video size={19} />}{cameraBusy ? 'Aguardando câmera…' : 'Iniciar leitura'}</button>}<small role="status">{scanning ? 'Câmera ativa. A leitura não registra presença automaticamente.' : busy ? 'Aguarde a consulta. Nenhuma presença foi confirmada.' : 'A câmera traseira será priorizada.'}</small></div>
      {devices.length > 1 && <label className="adm-field adm-camera-select"><span>Câmera</span><select value={deviceId} disabled={cameraBusy || busy || !!confirmation} onChange={e => { resume.current = false; stop(); setDeviceId(e.target.value); }}><option value="">Automática · preferir traseira</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}</select><small>Após selecionar, toque em Iniciar leitura.</small></label>}
      <div className="adm-divider"><span>ou busque manualmente</span></div>
      <form className="adm-manual-search" onSubmit={search}><label className="adm-field"><span>Nome, código de inscrição ou link privado</span><input required minLength={2} maxLength={500} autoComplete="off" autoCapitalize="off" spellCheck={false} value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome ou código do ingresso" /></label><button className="adm-button adm-secondary" disabled={busy || cameraBusy || !online}>{busy ? <LoaderCircle className="adm-spin" size={18} /> : <Search size={18} />}Buscar inscrição</button></form>
      {results && !results.length && <p role="status">Nenhuma inscrição encontrada. Confira a grafia ou o código.</p>}
      {!!results?.length && <div className="adm-checkin-results">{results.map(item => <button key={item.id} disabled={busy} onClick={() => void inspect({ code: item.code })}><span className="adm-avatar">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.code} · {item.institution || 'Vínculo não informado'}</small><small>{item.status !== 'active' ? 'Inscrição cancelada' : item.checked_in_at ? `Presença registrada · ${date(item.checked_in_at)}` : 'Aguardando credenciamento'}</small></span><ArrowRight size={20} /></button>)}</div>}
      <p className="adm-reception-help">O registro de entrada comprova a chegada. A elegibilidade para certificado depende da conferência e aprovação da organização.</p>
    </section>
    <ReceptionDashboard request={request} eventId={event.id} version={version} />
    {confirmation && <CheckinConfirmation key={confirmation.identity.code} request={request} eventId={event.id} participant={confirmation.identity} credential={confirmation.credential} onClose={closeConfirmation} onDone={text => { confirming.current = false; setConfirmation(null); setRetry(null); setResults(null); setQuery(''); setNotice({ text }); setVersion(value => value + 1); if (resume.current) setRestart(value => value + 1); }} />}
  </>;
}

export function ReceptionDashboard({ request, eventId, version }: { request: Requester; eventId: string; version: number }) {
  const [data, setData] = useState<Reception | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true, pending = false, last = 0;
    const refresh = async (force = false) => {
      if (pending || document.visibilityState !== 'visible' || !navigator.onLine || (!force && Date.now() - last < 60000)) return;
      pending = true; last = Date.now(); setLoading(true);
      try {
        const [snapshot, list] = await Promise.all([request<Reception>(`/admin/dashboard?eventId=${encodeURIComponent(eventId)}`), request<{ participants: Participant[] }>(`/admin/participants?eventId=${encodeURIComponent(eventId)}`)]);
        if (alive) { setData(snapshot); setParticipants(list.participants); setError(''); }
      } catch (error) { if (alive) setError(`Não foi possível atualizar. Os dados exibidos podem estar desatualizados. ${errorText(error)}`); }
      finally { pending = false; if (alive) setLoading(false); }
    };
    reload.current = () => { void refresh(true); };
    void refresh(true);
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    const foreground = () => { void refresh(); };
    document.addEventListener('visibilitychange', foreground); window.addEventListener('online', foreground);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', foreground); };
  }, [request, eventId, version]);
  const filtered = participants.filter(item => filter === 'all' || (filter === 'present' ? !!item.checked_in_at && item.status === 'active' : !item.checked_in_at && item.status === 'active'));
  const effectivePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 25)));
  return <section className="adm-panel adm-reception-dashboard" aria-label="Acompanhamento do credenciamento">
    <div className="adm-section-title"><div><h2>Recepção em números</h2><p>Atualização a cada 60 segundos, com a tela aberta e conectada.</p></div><button type="button" className="adm-button adm-secondary" disabled={loading} onClick={() => reload.current()}><RefreshCw size={18} className={loading ? 'adm-spin' : ''} />Atualizar agora</button></div>
    {error && <Message error>{error}</Message>}
    {!data && loading && <p role="status">Consultando o servidor…</p>}
    {data && <><div className="adm-reception-metrics"><div><strong>{data.total}</strong><span>Total de inscritos</span><small>{data.active} ativos · {data.cancelled} cancelados</small></div><div><strong>{data.checkedIn}</strong><span>Credenciados</span></div><div><strong>{data.absent}</strong><span>Aguardando entrada</span></div><div><strong>{data.attendancePercentage}%</strong><span>Comparecimento</span><small>Sobre inscrições ativas</small></div></div><p className="adm-reception-updated">Última consulta: {date(data.updatedAt)}</p><h3>Credenciamentos recentes</h3>{!data.recentCheckins.length ? <p>Ainda não há presenças registradas.</p> : <ol className="adm-reception-recent">{data.recentCheckins.map(item => <li key={item.id}><strong>{item.name}</strong><span>{item.code} · {date(item.checked_in_at)}</span><small>Operador: {item.checked_in_by || 'Registrado na auditoria'}</small></li>)}</ol>}</>}
    <div className="adm-reception-list-heading"><h3>Participantes e presença</h3><label className="adm-field"><span>Filtrar presença</span><select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">Todos</option><option value="present">Credenciados</option><option value="absent">Aguardando entrada</option></select></label></div>
    <p>{filtered.length} inscrição(ões) na lista{participants.length === 2000 ? ' · Limite de 2.000 registros; use a busca por nome ou código para localizar outros.' : ''}.</p>
    <ul className="adm-reception-participants">{filtered.slice((effectivePage - 1) * 25, effectivePage * 25).map(item => <li key={item.id}><div><strong>{item.name}</strong><code>{item.code}</code></div><div><span className={`adm-pill ${item.status === 'active' && item.checked_in_at ? 'adm-pill-solid' : ''}`}>{item.status !== 'active' ? 'Cancelada' : item.checked_in_at ? 'Credenciado' : 'Aguardando entrada'}</span>{item.checked_in_at && <small>{date(item.checked_in_at)} · {item.checked_in_by || 'Operador registrado'}</small>}</div></li>)}</ul>
    {filtered.length > 25 && <div className="adm-reception-pagination"><button className="adm-button adm-secondary" disabled={effectivePage === 1} onClick={() => setPage(effectivePage - 1)}>Anterior</button><span>Página {effectivePage} de {Math.max(1, Math.ceil(filtered.length / 25))}</span><button className="adm-button adm-secondary" disabled={effectivePage * 25 >= filtered.length} onClick={() => setPage(effectivePage + 1)}>Próxima</button></div>}
  </section>;
}
