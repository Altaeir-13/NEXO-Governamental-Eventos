import { z } from 'zod';
import type { EventSettings, Participant, Ticket } from '../../shared/types';
import { ApiError, authenticate, body, equal, id, keyed, now, originCheck, randomToken, rateLimit, sessionCookie, sha, verifyPassword, type Auth, type Env } from './security';
import { email, eventSchema, parse, participantSchema, registerSchema, scheduleSchema, speakerSchema } from './validation';
import type { CertificateSnapshot } from '../../shared/pdf';

const json=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
const sql=(env:Env,query:string,...args:unknown[])=>env.DB.prepare(query).bind(...args);
async function one<T>(env:Env,query:string,...args:unknown[]) { return sql(env,query,...args).first<T>(); }
async function rows<T>(env:Env,query:string,...args:unknown[]) { return (await sql(env,query,...args).all<T>()).results; }
function required<T>(value:T|null|undefined,message='Registro não encontrado.'):T { if(value===null || value===undefined) throw new ApiError(404,message); return value; }
const eventColumns=Object.keys(eventSchema.shape);
async function getEvent(env:Env,eventId:string):Promise<EventSettings & {active_count:number}> { return required(await one(env,'SELECT * FROM events WHERE id=?',eventId)); }
function publicEvent(event:EventSettings & {active_count?:number}) { const {active_count:_,...safe}=event; if(!safe.venue_confirmed) safe.auditorium=''; if(!safe.venue_photo_authorized) safe.venue_photo_url=''; return safe; }
const participantSelect='SELECT r.id,r.participant_id,p.name,p.email,p.institution,p.course,r.code,r.status,r.created_at,c.checked_in_at,r.certificate_eligible,x.code certificate_code,x.status certificate_status FROM registrations r JOIN participants p ON p.id=r.participant_id LEFT JOIN checkins c ON c.registration_id=r.id LEFT JOIN certificates x ON x.registration_id=r.id';
async function getParticipant(env:Env,registrationId:string) { return required(await one<Participant>(env,`${participantSelect} WHERE r.id=?`,registrationId)); }
const audit=(env:Env,actor:Auth,action:string,target:string,details:Record<string,unknown>={})=>sql(env,'INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES (?,?,?,?,?)',id(),actor.user.id,action,target,JSON.stringify(details));
function isAdmin(auth:Auth) { if(auth.user.role!=='admin') throw new ApiError(403,'Esta ação exige um administrador.'); }
function eventIdFrom(url:URL) { return required(url.searchParams.get('eventId'),'Informe o evento.'); }
async function ticket(env:Env,token:string):Promise<Ticket> {
 if(!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(404,'Ingresso não encontrado ou revogado.');
 const registration=await one<{id:string;event_id:string}> (env,'SELECT r.id,r.event_id FROM tickets t JOIN registrations r ON r.id=t.registration_id WHERE t.token_hash=? AND t.revoked_at IS NULL',await sha(token));
 if(!registration) throw new ApiError(404,'Ingresso não encontrado ou revogado.');
 const p=await getParticipant(env,registration.id),event=await getEvent(env,registration.event_id);
 return {id:p.id,code:p.code,token,name:p.name,status:p.status,checked_in_at:p.checked_in_at,event:publicEvent(event),certificate:p.certificate_code?{code:p.certificate_code,status:p.certificate_status||'revoked'}:null};
}
function certificateReady(event:EventSettings) {
 if(!event.certificates_released || !event.certificate_rules_approved || !event.date_confirmed || !event.venue_confirmed || !event.signatories.trim()) throw new ApiError(409,'A coordenação ainda precisa aprovar os dados, as regras e os signatários do certificado.');
 if(Date.now()<Date.parse(event.certificate_available_at) || Date.now()<Date.parse(`${event.event_date}T23:59:59-03:00`)) throw new ApiError(409,'Os certificados ainda não estão disponíveis.');
}
function snapshot(event:EventSettings,name:string):CertificateSnapshot { return {name,event_title:event.title,event_date:event.event_date,city:event.city,hours:event.certificate_hours,text:event.certificate_text,signatories:event.signatories}; }

async function register(request:Request,env:Env) {
 await rateLimit(env,request,'register-hour',240,3600);
 await rateLimit(env,request,'register-minute',30,60);
 const data=parse(registerSchema,await body(request));
 if(data.website) throw new ApiError(400,'Não foi possível concluir a inscrição.');
 const event=await getEvent(env,data.eventId);
 const canonical={eventId:data.eventId,name:data.name,email:data.email,institution:data.institution,course:data.course,consent:true};
 const bodyHash=await sha(JSON.stringify(canonical)), keyHash=await sha(`${data.eventId}:${data.idempotencyKey}`);
 const token=await keyed(env,`ticket:${data.eventId}:${data.idempotencyKey}`),tokenHash=await sha(token);
 async function replay() {
  const previous=await one<{body_hash:string;registration_id:string;token_hash:string;code:string;revoked_at:string|null}>(env,'SELECT k.body_hash,k.registration_id,t.token_hash,r.code,t.revoked_at FROM idempotency_keys k JOIN registrations r ON r.id=k.registration_id JOIN tickets t ON t.registration_id=r.id WHERE k.key_hash=?',keyHash);
  if(!previous) return null;
  if(!equal(previous.body_hash,bodyHash)) throw new ApiError(409,'Esta solicitação já foi utilizada com outros dados. Recarregue o formulário.');
  if(previous.revoked_at || !equal(previous.token_hash,tokenHash)) throw new ApiError(409,'O ingresso foi atualizado. Solicite recuperação à organização.');
  return json({id:previous.registration_id,code:previous.code,token});
 }
 const previous=await replay(); if(previous) return previous;
 if(!event.registration_open || (event.registration_starts && Date.now()<Date.parse(event.registration_starts)) || (event.registration_ends && Date.now()>Date.parse(event.registration_ends))) throw new ApiError(409,'As inscrições não estão abertas neste momento.');
 const participantId=id(),registrationId=id(),code=`NEXO-${randomToken().slice(0,16).toUpperCase()}`;
 try {
  // D1 batch is a single transaction: capacity, participant, ticket and retry key commit together.
  await env.DB.batch([
   sql(env,'INSERT INTO participants(id,name,email,institution,course) VALUES (?,?,?,?,?)',participantId,data.name,data.email,data.institution,data.course),
   sql(env,'INSERT INTO registrations(id,event_id,participant_id,email,code,consent_at,consent_text) VALUES (?,?,?,?,?,?,?)',registrationId,data.eventId,participantId,data.email,code,now(),event.privacy_text),
   sql(env,'INSERT INTO tickets(registration_id,token_hash) VALUES (?,?)',registrationId,tokenHash),
   sql(env,'INSERT INTO idempotency_keys(key_hash,event_id,body_hash,registration_id) VALUES (?,?,?,?)',keyHash,data.eventId,bodyHash,registrationId)
  ]);
 } catch(error) {
  const retry=await replay(); if(retry) return retry;
  if(String(error).includes('EVENT_FULL') || String(error).includes('active_count')) throw new ApiError(409,'As vagas deste evento estão esgotadas.');
  if(String(error).includes('UNIQUE')) throw new ApiError(409,'Não foi possível concluir a inscrição com estes dados. Se você já se inscreveu, use o link salvo ou solicite recuperação à organização.');
  throw error;
 }
 return json({id:registrationId,code,token},201);
}

async function login(request:Request,env:Env) {
 const data=parse(z.object({email,password:z.string().min(1).max(256)}),await body(request));
 await rateLimit(env,request,'login-ip',15,900);
 // Account key is independent of IP to resist distributed guessing; no raw email is logged.
 const accountKey=await keyed(env,`account:${data.email}`),window=Math.floor(Date.now()/900000);
 const account=await sql(env,'INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',`account:${accountKey}:${window}`,(window+1)*900).first<{count:number}>();
 if((account?.count||0)>20) throw new ApiError(429,'Muitas tentativas de acesso. Aguarde 15 minutos.');
 const user=await one<{id:string;email:string;name:string;role:string;password_hash:string}>(env,'SELECT id,email,name,role,password_hash FROM admin_users WHERE email=? AND enabled=1',data.email);
 const dummy='pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
 const valid=await verifyPassword(data.password,user?.password_hash||dummy);
 if(!user || !valid) throw new ApiError(401,'E-mail ou senha inválidos.');
 const token=randomToken(),csrf=randomToken(),{password_hash:_,...safe}=user;
 await env.DB.batch([sql(env,'DELETE FROM sessions WHERE expires_at<?',now()),sql(env,'INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)',await sha(token),user.id,csrf,new Date(Date.now()+8*3600000).toISOString()),sql(env,'INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES (?,?,?,?)',id(),user.id,'login',user.id)]);
 return json({user:safe,csrf},200,{'Set-Cookie':sessionCookie(request,token)});
}

async function saveEvent(request:Request,env:Env,auth:Auth,url:URL,create=false) {
 isAdmin(auth);
 const values=parse(create?eventSchema.partial().required({title:true,slug:true,event_date:true}):eventSchema.partial(),await body(request));
 if(create) {values.latitude??=0;values.longitude??=0;}
 const existing=create?null:await getEvent(env,eventIdFrom(url));
 const merged={...existing,...values};
 if(merged.registration_starts && merged.registration_ends && Date.parse(merged.registration_starts)>=Date.parse(merged.registration_ends)) throw new ApiError(400,'O encerramento deve ocorrer após a abertura das inscrições.');
 if(merged.certificate_available_at && Date.parse(merged.certificate_available_at)<Date.parse('2026-12-01T03:00:00.000Z')) throw new ApiError(400,'Os certificados devem ser disponibilizados a partir de dezembro de 2026.');
 if(merged.certificates_released && (!merged.certificate_rules_approved || !merged.date_confirmed || !merged.venue_confirmed || !merged.signatories?.trim())) throw new ApiError(400,'Confirme data, local, regras e signatários antes de liberar certificados.');
 if(merged.capacity!==undefined && merged.capacity<Number(existing?.active_count||0)) throw new ApiError(409,'A capacidade não pode ser menor que o total de inscrições ativas.');
 if(merged.registration_open && (!merged.date_confirmed || !merged.venue_confirmed || !merged.contact_email?.trim())) throw new ApiError(400,'Confirme data e local e informe o contato institucional antes de abrir as inscrições.');
 const eventId=existing?.id||id(),keys=eventColumns.filter(k=>k in values),data=values as Record<string,unknown>;
 const mutation=create?sql(env,`INSERT INTO events(id,${keys.join(',')}) VALUES (?,${keys.map(()=>'?').join(',')})`,eventId,...keys.map(k=>data[k])):sql(env,`UPDATE events SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...keys.map(k=>data[k]),eventId);
 if(!keys.length) throw new ApiError(400,'Nenhuma alteração informada.');
 await env.DB.batch([mutation,audit(env,auth,create?'event.create':'event.update',eventId,{fields:keys})]);
 return json({event:await getEvent(env,eventId)},create?201:200);
}

async function mutateContent(request:Request,env:Env,auth:Auth,url:URL,kind:'speakers'|'schedule',targetId?:string) {
 isAdmin(auth);
 const table=kind==='speakers'?'speakers':'schedule_items',schema=kind==='speakers'?speakerSchema:scheduleSchema;
 const current=targetId?required(await one<Record<string,unknown>>(env,`SELECT * FROM ${table} WHERE id=?`,targetId)):null;
 if(request.method==='DELETE') { await env.DB.batch([sql(env,`DELETE FROM ${table} WHERE id=?`,targetId),audit(env,auth,`${kind}.delete`,targetId!)]); return json({ok:true}); }
 const data=parse(schema.partial(),await body(request)) as Record<string,unknown>;
 const eventId=String(current?.event_id||data.event_id||eventIdFrom(url));
 await getEvent(env,eventId);
 if(data.event_id && data.event_id!==eventId) throw new ApiError(400,'Não é possível mover este registro para outro evento.');
 const merged:Record<string,unknown>={...current,...data,event_id:eventId};
 if(!String(merged[kind==='speakers'?'name':'title']||'').trim()) throw new ApiError(400,'Informe o título ou nome.');
 if(kind==='speakers' && merged.published && merged.invitation_status!=='confirmed') throw new ApiError(400,'Somente convidados confirmados podem ser publicados.');
 if(kind==='schedule' && merged.speaker_id) {
  const speaker=await one(env,'SELECT id FROM speakers WHERE id=? AND event_id=?',merged.speaker_id,eventId);
  if(!speaker) throw new ApiError(400,'O palestrante deve pertencer ao mesmo evento.');
 }
 if(kind==='schedule' && merged.start_time && merged.end_time && String(merged.start_time)>String(merged.end_time)) throw new ApiError(400,'O horário final deve ocorrer após o início.');
 const contentId=targetId||id(),keys=Object.keys(data).filter(k=>k!=='event_id'),allKeys=current?keys:['event_id',...keys];
 if(!allKeys.length) throw new ApiError(400,'Nenhuma alteração informada.');
 const values=allKeys.map(k=>k==='event_id'?eventId:data[k]);
 const mutation=current?sql(env,`UPDATE ${table} SET ${allKeys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...values,contentId):sql(env,`INSERT INTO ${table}(id,${allKeys.join(',')}) VALUES (?,${allKeys.map(()=>'?').join(',')})`,contentId,...values);
 await env.DB.batch([mutation,audit(env,auth,`${kind}.${current?'update':'create'}`,contentId)]);
 const record=await one(env,`SELECT * FROM ${table} WHERE id=?`,contentId);
 return json(kind==='speakers'?{speaker:record}:{item:record},current?200:201);
}

async function patchParticipant(request:Request,env:Env,auth:Auth,registrationId:string) {
 const current=await getParticipant(env,registrationId),data=parse(participantSchema,await body(request));
 if(Object.keys(data).some(k=>k!=='checkedIn')) isAdmin(auth);
 if(data.checkedIn===false) isAdmin(auth);
 if(data.checkedIn && (data.status||current.status)!=='active') throw new ApiError(409,'Não é possível credenciar uma inscrição cancelada.');
 if(data.certificateEligible && (data.status||current.status)!=='active') throw new ApiError(409,'Inscrição cancelada não é elegível.');
 const changes:D1PreparedStatement[]=[];
 const pkeys=['name','email','institution','course'].filter(k=>k in data);
 if(pkeys.length) changes.push(sql(env,`UPDATE participants SET ${pkeys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...pkeys.map(k=>data[k as keyof typeof data]),current.participant_id));
 if(data.email) changes.push(sql(env,'UPDATE registrations SET email=? WHERE id=?',data.email,registrationId));
 if(data.status) changes.push(sql(env,'UPDATE registrations SET status=? WHERE id=?',data.status,registrationId));
 if(data.checkedIn===true) changes.push(sql(env,'INSERT INTO checkins(registration_id,actor_id) VALUES (?,?) ON CONFLICT(registration_id) DO NOTHING',registrationId,auth.user.id));
 if(data.checkedIn===false) changes.push(sql(env,'DELETE FROM checkins WHERE registration_id=?',registrationId));
 if(data.certificateEligible!==undefined) changes.push(sql(env,'UPDATE registrations SET certificate_eligible=? WHERE id=?',data.certificateEligible?1:0,registrationId));
 // Name/presence/eligibility corrections revoke an old snapshot; reissue needs explicit approval.
 if((data.name!==undefined && data.name!==current.name) || data.checkedIn===false || data.certificateEligible===false || data.status==='cancelled') changes.push(sql(env,"UPDATE certificates SET status='revoked',revoked_at=? WHERE registration_id=?",now(),registrationId));
 if(!changes.length) throw new ApiError(400,'Nenhuma alteração informada.');
 changes.push(audit(env,auth,'participant.update',registrationId,{fields:Object.keys(data)}));
 await env.DB.batch(changes);
 return json({participant:await getParticipant(env,registrationId)});
}

async function anonymize(env:Env,auth:Auth,registrationId:string) {
 isAdmin(auth); const p=await getParticipant(env,registrationId),anonymous=`anon-${id()}@invalid.local`;
 await env.DB.batch([
  sql(env,"UPDATE registrations SET status='cancelled',email=?,certificate_eligible=0,consent_text='Anonimizado a pedido do titular' WHERE id=?",anonymous,registrationId),
  sql(env,"UPDATE participants SET name='Participante anonimizado',email=?,institution='',course='',anonymized_at=? WHERE id=?",anonymous,now(),p.participant_id),
  sql(env,'DELETE FROM checkins WHERE registration_id=?',registrationId),
  sql(env,"UPDATE certificates SET snapshot='{}',status='revoked',revoked_at=? WHERE registration_id=?",now(),registrationId),
  sql(env,"UPDATE certificate_history SET snapshot='{}' WHERE registration_id=?",registrationId),
  sql(env,'DELETE FROM idempotency_keys WHERE registration_id=?',registrationId),audit(env,auth,'participant.anonymize',registrationId)
 ]); return json({ok:true});
}

async function recover(request:Request,env:Env,auth:Auth,registrationId:string) {
 isAdmin(auth); const data=parse(z.object({identityVerified:z.literal(true),reason:z.string().trim().min(10).max(500)}),await body(request));
 const p=await getParticipant(env,registrationId); if(p.status!=='active') throw new ApiError(409,'Inscrição cancelada. Reative-a antes de recuperar o ingresso.');
 const token=randomToken();
 await env.DB.batch([sql(env,'UPDATE tickets SET token_hash=?,revoked_at=NULL WHERE registration_id=?',await sha(token),registrationId),sql(env,'DELETE FROM idempotency_keys WHERE registration_id=?',registrationId),audit(env,auth,'ticket.recover',registrationId,{identityVerified:true,reason:data.reason})]);
 return json({token,code:p.code});
}

async function checkIn(request:Request,env:Env,auth:Auth) {
 const data=parse(z.object({eventId:z.string(),token:z.string().optional(),code:z.string().max(60).optional(),confirmIdentity:z.literal(true)}).refine(d=>!!d.token!==!!d.code,'Informe um token ou código.'),await body(request));
 await rateLimit(env,request,'checkin',200,60);
 const registration=data.token?await one<{id:string;status:string}>(env,'SELECT r.id,r.status FROM registrations r JOIN tickets t ON t.registration_id=r.id WHERE t.token_hash=? AND t.revoked_at IS NULL AND r.event_id=?',await sha(data.token),data.eventId):await one<{id:string;status:string}>(env,'SELECT id,status FROM registrations WHERE code=? AND event_id=?',data.code?.trim().toUpperCase(),data.eventId);
 if(!registration) throw new ApiError(404,'Ingresso inexistente ou revogado.');
 if(registration.status!=='active') throw new ApiError(409,'Ingresso cancelado.');
 const result=await env.DB.batch([sql(env,'INSERT INTO checkins(registration_id,actor_id) VALUES (?,?) ON CONFLICT(registration_id) DO NOTHING',registration.id,auth.user.id),audit(env,auth,'checkin.confirm',registration.id)]);
 return json({participant:await getParticipant(env,registration.id),alreadyCheckedIn:result[0].meta.changes===0});
}

async function issueCertificates(request:Request,env:Env,auth:Auth) {
 isAdmin(auth); const data=parse(z.object({registrationIds:z.array(z.string()).min(1).max(120),action:z.enum(['issue','revoke'])}),await body(request));
 const unique=[...new Set(data.registrationIds)],statements:D1PreparedStatement[]=[];
 // Read and write in chunks below D1's 100-bound-parameter limit and the
 // Free plan's 50-query-per-invocation budget, including a full 120-person batch.
 type Candidate=Participant & {event_id:string};
 const candidates:Candidate[]=[];
 for(let offset=0;offset<unique.length;offset+=80) {
  const chunk=unique.slice(offset,offset+80);
  candidates.push(...await rows<Candidate>(env,`${participantSelect.replace('SELECT r.id,','SELECT r.event_id,r.id,')} WHERE r.id IN (${chunk.map(()=>'?').join(',')})`,...chunk));
 }
 if(candidates.length!==unique.length) throw new ApiError(404,'Uma das inscrições selecionadas não foi encontrada.');
 const inserts:unknown[][]=[],events=new Map<string,EventSettings>();
 if(new Set(candidates.map(p=>p.event_id)).size>12) throw new ApiError(400,'Selecione inscrições de no máximo 12 eventos por operação.');
 for(const p of candidates) {
  if(data.action==='revoke') continue;
  let event=events.get(p.event_id);
  if(!event) {event=await getEvent(env,p.event_id);events.set(p.event_id,event);}
  certificateReady(event);
  if(p.status!=='active' || !p.checked_in_at || !p.certificate_eligible) throw new ApiError(409,'Todos os selecionados precisam de inscrição ativa, presença e aprovação individual.');
  if(p.certificate_status==='issued') continue;
  inserts.push([id(),p.id,randomToken(),auth.user.id,JSON.stringify(snapshot(event,p.name))]);
 }
 if(data.action==='revoke') for(let offset=0;offset<unique.length;offset+=80) {
  const chunk=unique.slice(offset,offset+80);
  statements.push(sql(env,`UPDATE certificates SET status='revoked',revoked_at=? WHERE registration_id IN (${chunk.map(()=>'?').join(',')})`,now(),...chunk));
 }
 for(let offset=0;offset<inserts.length;offset+=18) {
  const chunk=inserts.slice(offset,offset+18);
  statements.push(sql(env,`INSERT INTO certificates(id,registration_id,code,status,issued_by,snapshot) VALUES ${chunk.map(()=>"(?,?,?,'issued',?,?)").join(',')} ON CONFLICT(registration_id) DO UPDATE SET id=excluded.id,code=excluded.code,status='issued',issued_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),issued_by=excluded.issued_by,revoked_at=NULL,snapshot=excluded.snapshot`,...chunk.flat()));
 }
 statements.push(audit(env,auth,`certificate.${data.action}`,unique.join(','),{count:unique.length}));
 await env.DB.batch(statements); return json({processed:unique.length});
}

async function routes(request:Request,env:Env):Promise<Response> {
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method;
 if(!['GET','HEAD','OPTIONS'].includes(method)) originCheck(request);
 if(path==='/api/event' && method==='GET') {
  const slug=url.searchParams.get('slug');
  const event=required(await one<EventSettings & {active_count:number}>(env,slug?'SELECT * FROM events WHERE slug=?':'SELECT * FROM events ORDER BY event_date DESC LIMIT 1',...(slug?[slug]:[])));
 const [speakers,schedule]=await Promise.all([rows(env,"SELECT * FROM speakers WHERE event_id=? AND published=1 AND invitation_status='confirmed' ORDER BY display_order,id",event.id),rows(env,"SELECT s.id,s.event_id,s.title,s.description,s.start_time,s.end_time,s.time_label,CASE WHEN p.published=1 AND p.invitation_status='confirmed' THEN s.speaker_id ELSE NULL END speaker_id,s.display_order,s.published,s.special FROM schedule_items s LEFT JOIN speakers p ON p.id=s.speaker_id WHERE s.event_id=? AND s.published=1 ORDER BY s.display_order,s.id",event.id)]);
  return json({event:publicEvent(event),speakers,schedule,remaining:Math.max(0,event.capacity-event.active_count)});
 }
 if(path==='/api/register' && method==='POST') return register(request,env);
 if((path==='/api/ticket' || path==='/api/certificate') && method==='POST') {
  await rateLimit(env,request,'ticket',500,3600);
  const data=parse(z.object({token:z.string().length(64)}),await body(request)),t=await ticket(env,data.token);
  if(path==='/api/ticket') return json(t);
  if(t.status!=='active') throw new ApiError(409,'Inscrição cancelada.');
  const cert=await one<{code:string;status:string;issued_at:string;snapshot:string}>(env,'SELECT code,status,issued_at,snapshot FROM certificates WHERE registration_id=?',t.id);
  const event=await getEvent(env,t.event.id); certificateReady(event);
  const p=await getParticipant(env,t.id);
  if(!cert || cert.status!=='issued' || !p.checked_in_at || !p.certificate_eligible) throw new ApiError(403,'Certificado indisponível. É necessária presença e aprovação da organização.');
  return json({snapshot:JSON.parse(cert.snapshot) as CertificateSnapshot,code:cert.code,issued_at:cert.issued_at});
 }
 const validate=path.match(/^\/api\/validate\/([a-f0-9]{64})$/);
 if(validate && method==='GET') {
  await rateLimit(env,request,'validate',500,3600);
  const cert=required(await one<{code:string;status:string;issued_at:string;snapshot:string}>(env,'SELECT code,status,issued_at,snapshot FROM certificates WHERE code=? UNION ALL SELECT code,status,issued_at,snapshot FROM certificate_history WHERE code=? LIMIT 1',validate[1],validate[1]),'Certificado não encontrado.');
  const data=JSON.parse(cert.snapshot) as Partial<CertificateSnapshot>;
  return json({code:cert.code,name:data.name||'Dados anonimizados',event:data.event_title||'',hours:data.hours||0,issued_at:cert.issued_at,status:cert.status});
 }
 if(path==='/api/admin/login' && method==='POST') return login(request,env);
 if(!path.startsWith('/api/admin/')) throw new ApiError(404,'Rota não encontrada.');
 const auth=await authenticate(request,env);
 if(path==='/api/admin/session' && method==='GET') return json({user:auth.user,csrf:auth.csrf});
 if(path==='/api/admin/logout' && method==='POST') { await sql(env,'DELETE FROM sessions WHERE token_hash=?',auth.tokenHash).run(); return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'',true)}); }
 if(path==='/api/admin/check-in' && method==='POST') return checkIn(request,env,auth);
 if(path==='/api/admin/events' && method==='GET') return json({events:await rows(env,'SELECT * FROM events ORDER BY event_date DESC')});
 if(path==='/api/admin/events' && method==='POST') return saveEvent(request,env,auth,url,true);
 if(path==='/api/admin/event' && method==='GET') return json({event:await getEvent(env,eventIdFrom(url))});
 if(path==='/api/admin/event' && method==='PUT') return saveEvent(request,env,auth,url);
 if(path==='/api/admin/dashboard' && method==='GET') {
  const event=await getEvent(env,eventIdFrom(url));
  const counts=await one<{total:number;active:number;cancelled:number;checkedIn:number;eligible:number;certificates:number}>(env,"SELECT COUNT(*) total,COALESCE(SUM(r.status='active'),0) active,COALESCE(SUM(r.status='cancelled'),0) cancelled,COALESCE(SUM(r.status='active' AND c.registration_id IS NOT NULL),0) checkedIn,COALESCE(SUM(r.status='active' AND r.certificate_eligible=1 AND c.registration_id IS NOT NULL),0) eligible,COALESCE(SUM(x.status='issued'),0) certificates FROM registrations r LEFT JOIN checkins c ON c.registration_id=r.id LEFT JOIN certificates x ON x.registration_id=r.id WHERE r.event_id=?",event.id);
  return json({...counts,remaining:event.capacity-event.active_count,absent:(counts?.active||0)-(counts?.checkedIn||0),certificatesIssued:counts?.certificates||0,occupancy:Math.round(event.active_count/event.capacity*100)});
 }
 if(path==='/api/admin/participants' && method==='GET') {
  const q=(url.searchParams.get('q')||'').slice(0,150),eventId=eventIdFrom(url);
  return json({participants:await rows(env,`${participantSelect} WHERE r.event_id=? AND (p.name LIKE ? OR p.email LIKE ? OR r.code LIKE ?) ORDER BY r.created_at DESC LIMIT 2000`,eventId,`%${q}%`,`%${q}%`,`%${q}%`)});
 }
 const participantMatch=path.match(/^\/api\/admin\/participants\/([^/]+)(\/recover)?$/);
 if(participantMatch) {
  if(participantMatch[2] && method==='POST') return recover(request,env,auth,participantMatch[1]);
  if(!participantMatch[2] && method==='PATCH') return patchParticipant(request,env,auth,participantMatch[1]);
  if(!participantMatch[2] && method==='DELETE') return anonymize(env,auth,participantMatch[1]);
 }
 const contentMatch=path.match(/^\/api\/admin\/(speakers|schedule)(?:\/([^/]+))?$/);
 if(contentMatch) {
  const kind=contentMatch[1] as 'speakers'|'schedule',table=kind==='speakers'?'speakers':'schedule_items';
  if(method==='GET' && !contentMatch[2]) { const result=await rows(env,`SELECT * FROM ${table} WHERE event_id=? ORDER BY display_order,id`,eventIdFrom(url)); return json(kind==='speakers'?{speakers:result}:{schedule:result}); }
  if((method==='POST' && !contentMatch[2]) || ((method==='PUT'||method==='DELETE') && contentMatch[2])) return mutateContent(request,env,auth,url,kind,contentMatch[2]);
 }
 if(path==='/api/admin/export' && method==='GET') {
  isAdmin(auth); const participants=await rows<Participant>(env,`${participantSelect} WHERE r.event_id=? ORDER BY p.name COLLATE NOCASE`,eventIdFrom(url));
  const escape=(value:unknown)=>{let s=String(value??''); if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s=`'${s}`; return `"${s.replace(/"/g,'""')}"`;};
  const csv=[['Código','Nome','E-mail','Instituição','Curso','Situação','Inscrição','Credenciamento','Certificado aprovado'],...participants.map(p=>[p.code,p.name,p.email,p.institution,p.course,p.status,p.created_at,p.checked_in_at,p.certificate_eligible?'Sim':'Não'])].map(line=>line.map(escape).join(';')).join('\r\n');
  await audit(env,auth,'participants.export',eventIdFrom(url),{count:participants.length}).run();
  return new Response(`\uFEFF${csv}`,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="participantes-nexo.csv"','Cache-Control':'no-store'}});
 }
 if(path==='/api/admin/certificates' && method==='POST') return issueCertificates(request,env,auth);
 if(path==='/api/admin/certificates' && method==='GET') { isAdmin(auth); const list=await rows<{id:string;registration_id:string;code:string;status:string;issued_at:string;snapshot:string}>(env,'SELECT x.id,x.registration_id,x.code,x.status,x.issued_at,x.snapshot FROM certificates x JOIN registrations r ON r.id=x.registration_id WHERE r.event_id=? UNION ALL SELECT x.id,x.registration_id,x.code,x.status,x.issued_at,x.snapshot FROM certificate_history x JOIN registrations r ON r.id=x.registration_id WHERE r.event_id=? ORDER BY issued_at DESC',eventIdFrom(url),eventIdFrom(url)); return json({certificates:list.map(({snapshot:raw,...c})=>{const s=JSON.parse(raw) as Partial<CertificateSnapshot>; return {...c,name:s.name||'Dados anonimizados',event_title:s.event_title||'',hours:s.hours||0};})}); }
 if(path==='/api/admin/certificate-preview' && method==='POST') { isAdmin(auth); const data=parse(z.object({eventId:z.string(),name:z.string().max(150).optional()}),await body(request)),event=await getEvent(env,data.eventId); return json({snapshot:snapshot(event,data.name||'Participante de exemplo'),code:'PREVIA-SEM-VALIDADE',issued_at:now(),preview:true}); }
 if(path==='/api/admin/audit' && method==='GET') { isAdmin(auth); return json({audit:await rows(env,'SELECT id,actor_id,action,target_id,details,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200')}); }
 throw new ApiError(404,'Rota não encontrada.');
}

export async function handleApi(request:Request,env:Env):Promise<Response> {
 try { return await routes(request,env); }
 catch(error) {
  if(error instanceof ApiError) return json({error:error.message},error.status,error.status===429?{'Retry-After':'900'}:{});
  const message=String(error);
  if(message.includes('EVENT_FULL') || message.includes('active_count')) return json({error:'As vagas estão esgotadas ou a capacidade informada é insuficiente.'},409);
  if(message.includes('UNIQUE')) return json({error:'Já existe um registro com estes dados.'},409);
  if(message.includes('CERTIFICATE_NOT_ELIGIBLE')) return json({error:'A presença ou a autorização foi alterada durante a emissão. Revise os participantes.'},409);
  if(message.includes('PARTICIPANT_ANONYMIZED')) return json({error:'Uma inscrição anonimizada não pode ser reativada.'},409);
  if(message.includes('CHECK constraint') || message.includes('FOREIGN KEY')) return json({error:'A alteração viola uma regra de integridade. Revise os dados.'},400);
  // Do not log request bodies, IP addresses, passwords, session cookies or ticket tokens.
  console.error('NEXO_API_FAILURE',new URL(request.url).pathname.replace(/[a-f0-9]{32,}/g,'[token]'),error instanceof Error?error.name:'unknown');
  return json({error:'Serviço temporariamente indisponível. Seus dados já salvos foram preservados. Tente novamente.'},503);
 }
}
