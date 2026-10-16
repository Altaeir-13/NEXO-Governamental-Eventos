import { useEffect, useRef, useState } from 'react';
import './pwa.css';

interface InstallPrompt extends Event {
 prompt(): Promise<void>;
 userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Installation is optional; authentication and check-in always use the existing API. */
export function PwaControls() {
 const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
 const [installed, setInstalled] = useState(false);
 const [waiting, setWaiting] = useState(false);
 const [message, setMessage] = useState('');
 const [checking, setChecking] = useState(false);
 const registration = useRef<ServiceWorkerRegistration | null>(null);

 useEffect(() => {
  const media = window.matchMedia('(display-mode: standalone)');
  const updateInstalled = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  updateInstalled();
  media.addEventListener('change', updateInstalled);
  const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
  const appInstalled = () => { setInstalled(true); setPrompt(null); setMessage('Aplicativo instalado. Abra o ícone NEXO Eventos na tela inicial.'); };
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', appInstalled);
  return () => { media.removeEventListener('change', updateInstalled); window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', appInstalled); };
 }, []);

 useEffect(() => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  let alive = true;
  let removeUpdateListener: (() => void) | undefined;
  let stopObserving: (() => void) | undefined;
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
   if (!alive) return;
   registration.current = value;
   const updateState = () => { if (alive) setWaiting(Boolean(value.waiting || (value.installing?.state === 'installed' && navigator.serviceWorker.controller))); };
   const observe = () => {
    stopObserving?.();
    const worker = value.installing;
    if (!worker) { updateState(); return; }
    worker.addEventListener('statechange', updateState);
    stopObserving = () => worker.removeEventListener('statechange', updateState);
   };
   value.addEventListener('updatefound', observe);
   removeUpdateListener = () => value.removeEventListener('updatefound', observe);
   updateState(); observe();
  }).catch(() => { if (alive) setMessage('A instalação não pôde ser preparada agora. Continue pelo navegador e tente novamente com conexão.'); });
  return () => { alive = false; removeUpdateListener?.(); stopObserving?.(); };
 }, []);

 async function install() {
  if (!prompt) return;
  try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
  catch { setMessage('Use o menu do navegador para adicionar o aplicativo à tela inicial.'); }
 }
 async function checkUpdate() {
  if (!registration.current) { setMessage('Abra o site com conexão segura para preparar o aplicativo e verificar atualizações.'); return; }
  setChecking(true); setMessage('');
  try { await registration.current.update(); setMessage('Verificação solicitada. Se uma nova versão estiver pronta, avisaremos aqui.'); }
  catch { setMessage('Não foi possível verificar atualizações. Confira a conexão e tente novamente.'); }
  finally { setChecking(false); }
 }

 return <aside className="pwa-tools" aria-label="Aplicativo NEXO Eventos">
  {waiting && <div className="pwa-update" role="status"><strong>Atualização pronta para a próxima abertura.</strong><p>Conclua o credenciamento ou formulário em andamento. Depois, feche todas as abas e janelas do NEXO, inclusive o aplicativo instalado, e abra novamente. A página não será recarregada automaticamente.</p></div>}
  <details><summary>{installed ? 'Aplicativo instalado · ajuda e atualização' : 'Instalar NEXO Eventos no celular'}</summary><div className="pwa-help">
   <p>Tenha um atalho na tela inicial e abra o NEXO como aplicativo. Você também pode continuar usando o navegador.</p>
   {prompt && !installed && <button type="button" onClick={install}>Instalar aplicativo</button>}
   <ol><li><strong>Android:</strong> abra este site no Chrome. Toque em “Instalar aplicativo” quando disponível ou no menu ⋮ → “Adicionar à tela inicial” → “Instalar”. O texto pode variar conforme o navegador.</li><li><strong>iPhone:</strong> abra este site no Safari. Toque em Compartilhar → “Adicionar à Tela de Início”. Se aparecer “Abrir como App da Web”, mantenha ativado e toque em “Adicionar”.</li></ol>
   <p>O acesso administrativo mantém as permissões da sua conta. Para consultar ingressos e confirmar presenças, mantenha a conexão à internet. O aplicativo não registra credenciamento offline.</p>
   <button type="button" className="pwa-secondary" disabled={checking} onClick={checkUpdate}>{checking ? 'Verificando…' : 'Verificar atualização'}</button>
   <p className="pwa-update-note">Atualizações entram em vigor depois que todas as abas e janelas anteriores forem fechadas. Ao reabrir, entre novamente se a sessão tiver expirado.</p>
  </div></details>
  <p className="pwa-status" role="status" aria-live="polite">{message}</p>
 </aside>;
}
