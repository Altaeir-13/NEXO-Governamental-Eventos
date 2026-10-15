import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Clock3, Info, LoaderCircle, MapPin, ShieldCheck, Ticket as TicketIcon } from 'lucide-react';
import { z } from 'zod';
import type { Ticket } from '../shared/types';

export const participantProfiles = [{value:'student',label:'Estudante'},{value:'teacher',label:'Professor(a)'},{value:'professional',label:'Profissional'},{value:'other',label:'Outro'}] as const;
export interface RegistrationInput { name:string; email:string; profile:string; institution:string; course:string; consent:boolean; website:string }
type Errors = Partial<Record<keyof RegistrationInput,string>>;
export function validateRegistrationInput(input:RegistrationInput):Errors {
 const errors:Errors={};
 if(input.name.length<5||input.name.split(/\s+/).length<2)errors.name='Informe seu nome completo, com nome e sobrenome.';
 else if(input.name.length>150)errors.name='Use até 150 caracteres para o nome completo.';
 if(!z.string().email().max(254).safeParse(input.email).success)errors.email='Informe um endereço de e-mail válido.';
 if(input.profile&&!participantProfiles.some(p=>p.value===input.profile))errors.profile='Selecione um dos perfis disponíveis ou deixe o campo vazio.';
 if(input.institution.length>200)errors.institution='Use até 200 caracteres para a instituição.';
 if(input.course.length>200)errors.course='Use até 200 caracteres para o curso ou área de atuação.';
 if(!input.consent)errors.consent='Confirme que leu o aviso de privacidade para continuar.';
 return errors;
}
export function TestNotice({ticket=false}:{ticket?:boolean}) {
 return <aside className="test-notice" aria-label="Ambiente de inscrições de teste"><Info size={22} aria-hidden="true"/><div><strong>{ticket?'Ingresso de teste · sem validade oficial':'Inscrições de teste'}</strong><p>{ticket?'Este ingresso serve apenas para testar o QR Code e o credenciamento. Não é válido para o evento oficial e não dá direito a certificado.':'Este cadastro é uma demonstração com dados persistidos no sistema. Não representa inscrição oficial, não reserva vaga no encontro e não dá direito a certificado.'}</p></div></aside>;
}
export function RegistrationForm({isTest,busy,failure,onSubmit,eventSlug}:{isTest:boolean;busy:boolean;failure:string;onSubmit:(input:RegistrationInput)=>void;eventSlug?:string}) {
 const [errors,setErrors]=useState<Errors>({});
 const privacyHref=`/privacidade${eventSlug?`?evento=${encodeURIComponent(eventSlug)}`:''}`;
 const fieldError=(field:keyof RegistrationInput)=>errors[field]?<small className="field-error" id={`registration-${field}-error`}>{errors[field]}</small>:null;
 function submit(event:React.FormEvent<HTMLFormElement>) {
  event.preventDefault();if(busy)return;
  const form=event.currentTarget,fd=new FormData(form);
  const input:RegistrationInput={name:String(fd.get('name')||'').trim(),email:String(fd.get('email')||'').trim().toLowerCase(),profile:String(fd.get('profile')||''),institution:String(fd.get('institution')||'').trim(),course:String(fd.get('course')||'').trim(),consent:fd.get('consent')==='on',website:String(fd.get('website')||'')};
  const nextErrors=validateRegistrationInput(input);setErrors(nextErrors);
  const first=Object.keys(nextErrors)[0];
  if(first){requestAnimationFrame(()=>{(form.elements.namedItem(first) as HTMLElement|null)?.focus();});return;}
  onSubmit(input);
 }
 return <form className="registration-form registration-panel" onSubmit={submit} noValidate aria-busy={busy}>
  <p className="form-guidance">Os campos com <span aria-hidden="true">*</span> são obrigatórios. Os demais são opcionais.</p>
  <fieldset disabled={busy}>
   <label htmlFor="registration-name">Nome completo <span aria-hidden="true">*</span></label><input id="registration-name" name="name" autoComplete="name" minLength={5} maxLength={150} required placeholder="Seu nome e sobrenome" aria-invalid={Boolean(errors.name)} aria-describedby={`registration-name-hint${errors.name?' registration-name-error':''}`}/><small className="field-hint" id="registration-name-hint">Use o nome que deverá constar no certificado do evento oficial.</small>{fieldError('name')}
   <label htmlFor="registration-email">E-mail <span aria-hidden="true">*</span></label><input id="registration-email" type="email" name="email" autoComplete="email" maxLength={254} required placeholder="voce@exemplo.com" aria-invalid={Boolean(errors.email)} aria-describedby={`registration-email-hint${errors.email?' registration-email-error':''}`}/><small className="field-hint" id="registration-email-hint">Usado para identificar sua inscrição. Salve o ingresso ao concluir.</small>{fieldError('email')}
   <label htmlFor="registration-profile">Perfil do participante <span className="optional">opcional</span></label><select id="registration-profile" name="profile" defaultValue="" aria-invalid={Boolean(errors.profile)} aria-describedby={errors.profile?'registration-profile-error':undefined}><option value="">Prefiro não informar</option>{participantProfiles.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select>{fieldError('profile')}
   <label htmlFor="registration-institution">Instituição de ensino ou trabalho <span className="optional">opcional</span></label><input id="registration-institution" name="institution" autoComplete="organization" maxLength={200} placeholder="Sua instituição" aria-invalid={Boolean(errors.institution)} aria-describedby={errors.institution?'registration-institution-error':undefined}/>{fieldError('institution')}
   <label htmlFor="registration-course">Curso ou área de atuação <span className="optional">opcional</span></label><input id="registration-course" name="course" maxLength={200} placeholder="Seu curso ou área de atuação" aria-invalid={Boolean(errors.course)} aria-describedby={errors.course?'registration-course-error':undefined}/>{fieldError('course')}
   <div className="honeypot" aria-hidden="true"><label>Seu site<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
   <label className="checkbox-label" htmlFor="registration-consent"><input id="registration-consent" type="checkbox" name="consent" required aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent?'registration-consent-error':undefined}/><span>Li o <Link to={privacyHref} target="_blank" rel="noreferrer">aviso de privacidade</Link> e tomei conhecimento das informações sobre o tratamento dos meus dados. <span aria-hidden="true">*</span></span></label>{fieldError('consent')}
  </fieldset>
  {Object.keys(errors).length>0&&<p className="validation-summary" role="alert">Revise os campos indicados para continuar.</p>}
  {failure&&<div className="message error" role="alert"><Info size={20} aria-hidden="true"/><div>{failure}</div></div>}
  <button className="button form-submit" type="submit" disabled={busy}>{busy?<><LoaderCircle className="spin" size={20} aria-hidden="true"/> Enviando inscrição…</>:<>{isTest?'Confirmar inscrição de teste':'Confirmar inscrição'} <ArrowUpRight size={19} aria-hidden="true"/></>}</button>
  <p className="submission-status" role="status" aria-live="polite">{busy?'Estamos confirmando sua inscrição. Aguarde e mantenha esta página aberta.':''}</p>
  <p className="form-security"><ShieldCheck size={16} aria-hidden="true"/> Coletamos apenas os dados necessários à sua participação.</p>
 </form>;
}
const dateLabel=(value:string)=>new Date(`${value.slice(0,10)}T12:00:00-03:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
export function TicketCard({ticket,qr}:{ticket:Ticket;qr:string}) {
 const isTest=Boolean(ticket.event.is_test);
 return <div className={`ticket-card${isTest?' ticket-card-test':''}`}><div className="ticket-head"><TicketIcon aria-hidden="true"/><span>{isTest?'INGRESSO DE TESTE · SEM VALIDADE OFICIAL':'INGRESSO INDIVIDUAL · GRATUITO'}</span><strong>NEXO</strong></div><h2>{ticket.event.title}</h2><p className="ticket-name">{ticket.name}</p><div className="ticket-meta">
  {ticket.event.date_confirmed===1&&<span><CalendarDays size={17} aria-hidden="true"/>{dateLabel(ticket.event.event_date)}</span>}
  {ticket.event.venue_confirmed===1&&<span><MapPin size={17} aria-hidden="true"/>{ticket.event.venue}{ticket.event.auditorium?` — ${ticket.event.auditorium}`:''}</span>}
  {!isTest&&ticket.event.venue_confirmed===1&&ticket.event.checkin_time&&<span><Clock3 size={17} aria-hidden="true"/> Credenciamento: {ticket.event.checkin_time}</span>}
  {isTest&&<span>Simulação online · sem comparecimento presencial</span>}
  {!isTest&&(!ticket.event.date_confirmed||!ticket.event.venue_confirmed)&&<span>Consulte o site para a confirmação de data e local antes de se deslocar.</span>}
 </div><div className="ticket-stub">{qr&&<img src={qr} alt={isTest?'QR Code individual para testar o credenciamento':'QR Code individual para credenciamento'} width="220" height="220"/>}<strong>{ticket.code}</strong><span>{ticket.status==='cancelled'?'INSCRIÇÃO CANCELADA':ticket.checked_in_at?'PRESENÇA REGISTRADA':isTest?'INSCRIÇÃO DE TESTE CONFIRMADA':'INSCRIÇÃO CONFIRMADA'}</span></div></div>;
}
export function RegistrationSuccess({isTest,cancelled}:{isTest:boolean;cancelled:boolean}) {
 if(cancelled)return <p className="page-lead">Esta inscrição foi cancelada. O ingresso não permite credenciamento.</p>;
 return <p className="registration-success" role="status"><Check size={22} aria-hidden="true"/>{isTest?'Sua inscrição de teste foi concluída.':'Sua inscrição foi confirmada.'} Salve seu ingresso abaixo.</p>;
}
