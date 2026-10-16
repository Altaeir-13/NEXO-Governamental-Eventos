import { z } from 'zod';
import type { EventSettings, Participant, RecentCheckin, Speaker, Ticket } from '../../shared/types';
import { ApiError, authenticate, body, equal, id, keyed, now, originCheck, randomToken, rateLimit, sessionCookie, sha, verifyPassword, type Auth, type Env } from './security';
import { email, eventSchema, httpsUrlSchema, imageUrlSchema, parse, participantSchema, registerSchema, scheduleSchema, speakerSchema, venueVisualUrlSchema, wordCount } from './validation';
import type { CertificateSnapshot } from '../../shared/pdf';

const json=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
const sql=(env:Env,query:string,...args:unknown[])=>env.DB.prepare(query).bind(...args);
async function one<T>(env:Env,query:string,...args:unknown[]) { return sql(env,query,...args).first<T>(); }
async function rows<T>(env:Env,query:string,...args:unknown[]) { return (await sql(env,query,...args).all<T>()).results; }
function required<T>(value:T|null|undefined,message='Registro não encontrado.'):T { if(value===null || value===undefined) throw new ApiError(404,message); return value; }
const eventColumns=Object.keys(eventSchema.shape);
async function getEvent(env:Env,eventId:string):Promise<EventSettings & {active_count:number}> { return required(await one(env,'SELECT * FROM events WHERE id=?',eventId)); }
function publicEvent(event:EventSettings & {active_count?:number}) {
 const {active_count:_,...safe}=event;
 if(!safe.venue_confirmed) safe.auditorium='';
 if(!safe.venue_photo_authorized || !safe.venue_photo_url || !venueVisualUrlSchema.safeParse(safe.venue_photo_url).success) {
  safe.venue_photo_url='';safe.venue_photo_alt='';safe.venue_photo_credit='';safe.venue_photo_source_url='';
 } else if(!httpsUrlSchema.safeParse(safe.venue_photo_source_url).success) safe.venue_photo_source_url='';
 return safe;
}
function publicSpeaker(speaker:Speaker):Speaker {
 const safe={...speaker};
 if(!safe.talk_approved) {safe.talk_title='';safe.talk_summary='';}
 if(!safe.photo_authorized || !safe.photo_url || !imageUrlSchema.safeParse(safe.photo_url).success) {safe.photo_url='';safe.photo_credit='';}
 if(!httpsUrlSchema.safeParse(safe.social_url).success) safe.social_url='';
 return safe;
}
const participantSelect='SELECT r.id,r.participant_id,p.name,p.email,r.profile,p.institution,p.course,e.is_test,r.code,r.status,r.created_at,c.checked_in_at,u.name checked_in_by,r.certificate_eligible,x.code certificate_code,x.status certificate_status FROM registrations r JOIN participants p ON p.id=r.participant_id JOIN events e ON e.id=r.event_id LEFT JOIN checkins c ON c.registration_id=r.id LEFT JOIN admin_users u ON u.id=c.actor_id LEFT JOIN certificates x ON x.registration_id=r.id';
async function getParticipant(env:Env,registrationId:string) { return required(await one<Participant>(env,`${participantSelect} WHERE r.id=?`,registrationId)); }
const audit=(env:Env,actor:Auth,action:string,target:string,details:Record<string,unknown>={})=>sql(env,'INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES (?,?,?,?,?)',id(),actor.user.id,action,target,JSON.stringify(details));
function isAdmin(auth:Auth) { if(auth.user.role!=='admin') throw new ApiError(403,'Esta ação exige um administrador.'); }
function isCheckinOperator(auth:Auth) { if(!['admin','checkin'].includes(auth.user.role)) throw new ApiError(403,'Esta ação exige acesso autorizado ao credenciamento.'); }
function eventIdFrom(url:URL) { return required(url.searchParams.get('eventId'),'Informe o evento.'); }
function registrationKindFilter(url:URL) {
 const kind=parse(z.enum(['all','test','official']),url.searchParams.get('kind')||'all');
 return kind==='all'?'':` AND e.is_test=${kind==='test'?1:0}`;
}
async function ticket(env:Env,token:string):Promise<Ticket> {
 if(!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(404,'Ingresso não encontrado ou revogado.');
 const registration=await one<{id:string;event_id:string}> (env,'SELECT r.id,r.event_id FROM tickets t JOIN registrations r ON r.id=t.registration_id WHERE t.token_hash=? AND t.revoked_at IS NULL',await sha(token));
 if(!registration) throw new ApiError(404,'Ingresso não encontrado ou revogado.');
 const p=await getParticipant(env,registration.id),event=await getEvent(env,registration.event_id);
 return {id:p.id,code:p.code,token,name:p.name,status:p.status,checked_in_at:p.checked_in_at,event:publicEvent(event),certificate:p.certificate_code?{code:p.certificate_code,status:p.certificate_status||'revoked'}:null};
}
function certificateReady(event:EventSettings) {
 if(event.is_test) throw new ApiError(409,'Inscrições de teste não emitem certificados válidos.');
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
 // Empty optional profile preserves the canonical hash of pre-existing retries.
 const canonical={eventId:data.eventId,name:data.name,email:data.email,institution:data.institution,course:data.course,consent:true,...(data.profile?{profile:data.profile}:{})};
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
   sql(env,'INSERT INTO registrations(id,event_id,participant_id,email,code,consent_at,consent_text,profile) VALUES (?,?,?,?,?,?,?,?)',registrationId,data.eventId,participantId,data.email,code,now(),`Ciência do aviso de privacidade${event.is_test?' — inscrição de teste sem validade oficial':''}:\n${event.privacy_text}`,data.profile),
   sql(env,'INSERT INTO tickets(registration_id,token_hash) VALUES (?,?)',registrationId,tokenHash),
   sql(env,'INSERT INTO idempotency_keys(key_hash,event_id,body_hash,registration_id) VALUES (?,?,?,?)',keyHash,data.eventId,bodyHash,registrationId)
  ]);
 } catch(error) {
  const retry=await replay(); if(retry) return retry;
  if(String(error).includes('EVENT_FULL') || String(error).includes('active_count')) throw new ApiError(409,'As vagas deste evento estão esgotadas.');
  if(String(error).includes('TEST_REGISTRATION_CLOSED')) throw new ApiError(409,'As inscrições de teste foram encerradas.');
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
 if(existing && values.is_test!==undefined && values.is_test!==existing.is_test) throw new ApiError(409,'O tipo teste ou oficial é definido na criação e não pode ser alterado.');
 // A changed image needs its own authorization; partial API edits cannot inherit
 // the approval attached to an earlier file.
 if(existing && values.venue_photo_url!==undefined && values.venue_photo_url!==existing.venue_photo_url && values.venue_photo_authorized!==1) values.venue_photo_authorized=0;
 if(existing && (['venue','auditorium','address'] as const).some(field=>values[field]!==undefined && values[field]!==existing[field]) && values.venue_confirmed!==1) values.venue_confirmed=0;
 const merged={...existing,...values};
 if(merged.is_test && (merged.certificates_released || merged.certificate_rules_approved)) throw new ApiError(400,'Eventos de teste devem manter emissão e regras de certificados bloqueadas.');
 if(merged.venue_photo_authorized && (!merged.venue_photo_url?.trim() || !merged.venue_photo_alt?.trim())) throw new ApiError(400,'Informe o caminho da fotografia autorizada e seu texto alternativo.');
 if(merged.registration_starts && merged.registration_ends && Date.parse(merged.registration_starts)>=Date.parse(merged.registration_ends)) throw new ApiError(400,'O encerramento deve ocorrer após a abertura das inscrições.');
 if(merged.certificate_available_at && Date.parse(merged.certificate_available_at)<Date.parse('2026-12-01T03:00:00.000Z')) throw new ApiError(400,'Os certificados devem ser disponibilizados a partir de dezembro de 2026.');
 if(merged.certificates_released && (!merged.certificate_rules_approved || !merged.date_confirmed || !merged.venue_confirmed || !merged.signatories?.trim())) throw new ApiError(400,'Confirme data, local, regras e signatários antes de liberar certificados.');
 if(merged.capacity!==undefined && merged.capacity<Number(existing?.active_count||0)) throw new ApiError(409,'A capacidade não pode ser menor que o total de inscrições ativas.');
 if(merged.registration_open && !merged.is_test && (!merged.date_confirmed || !merged.venue_confirmed || !merged.contact_email?.trim())) throw new ApiError(400,'Confirme data e local e informe o contato institucional antes de abrir as inscrições.');
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
 if(kind==='speakers' && current) {
  const changed=(fields:string[])=>fields.some(field=>field in data && data[field]!==current[field]);
  if(changed(['name','role','area','institution']) && data.credentials_verified!==1) data.credentials_verified=0;
  if(changed(['bio']) && data.bio_approved!==1) data.bio_approved=0;
  if(changed(['talk_title','talk_summary']) && data.talk_approved!==1) data.talk_approved=0;
  if(changed(['photo_url']) && data.photo_authorized!==1) data.photo_authorized=0;
  if(data.published===undefined && (data.credentials_verified===0 || data.bio_approved===0 || (data.invitation_status!==undefined && data.invitation_status!=='confirmed'))) data.published=0;
 }
 const merged:Record<string,unknown>={...current,...data,event_id:eventId};
 if(!String(merged[kind==='speakers'?'name':'title']||'').trim()) throw new ApiError(400,'Informe o título ou nome.');
 if(kind==='speakers') {
  if(merged.photo_authorized && !String(merged.photo_url||'').trim()) throw new ApiError(400,'Informe o caminho da fotografia antes de autorizar sua exibição.');
  if(merged.published && (merged.invitation_status!=='confirmed' || merged.credentials_verified!==1 || merged.bio_approved!==1)) throw new ApiError(400,'Para publicar, confirme a participação, verifique nome e qualificação e aprove a mini biografia.');
  if(merged.published && !String(merged.role||'').trim()) throw new ApiError(400,'Informe o cargo ou profissão antes de publicar.');
  if(merged.published || merged.bio_approved) {
   const count=wordCount(String(merged.bio||''));
   if(count<40 || count>80) throw new ApiError(400,'A mini biografia aprovada deve conter entre 40 e 80 palavras.');
  }
  if(merged.talk_approved) {
   if(!String(merged.talk_title||'').trim()) throw new ApiError(400,'Informe o título da participação antes de aprovar o tema.');
   const count=wordCount(String(merged.talk_summary||''));
   if(count<40 || count>90) throw new ApiError(400,'O resumo aprovado da participação deve conter entre 40 e 90 palavras.');
  }
 }
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
 if(data.certificateEligible && current.is_test) throw new ApiError(400,'Inscrições de teste não são elegíveis para certificados válidos.');
 const changes:D1PreparedStatement[]=[];
 const pkeys=['name','email','institution','course'].filter(k=>k in data);
 if(pkeys.length) changes.push(sql(env,`UPDATE participants SET ${pkeys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...pkeys.map(k=>data[k as keyof typeof data]),current.participant_id));
 if(data.email) changes.push(sql(env,'UPDATE registrations SET email=? WHERE id=?',data.email,registrationId));
 if(data.profile!==undefined) changes.push(sql(env,'UPDATE registrations SET profile=? WHERE id=?',data.profile,registrationId));
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
  sql(env,"UPDATE registrations SET status='cancelled',email=?,profile='',certificate_eligible=0,consent_text='Anonimizado a pedido do titular' WHERE id=?",anonymous,registrationId),
  sql(env,"UPDATE participants SET name='Participante anonimizado',email=?,institution='',course='',anonymized_at=? WHERE id=?",anonymous,now(),p.participant_id),
  sql(env,'DELETE FROM checkins WHERE registration_id=?',registrationId),
  sql(env,"UPDATE certificates SET snapshot='{}',status='revoked',revoked_at=? WHERE registration_id=?",now(),registrationId),
  sql(env,"UPDATE certificate_history SET snapshot='{}' WHERE registration_id=?",registrationId),
  sql(env,'DELETE FROM idempotency_keys WHERE registration_id=?',registrationId),audit(env,auth,'participant.anonymize',registrationId)
 ]); return json({ok:true});
}

async function cleanupTestData(request:Request,env:Env,auth:Auth) {
 isAdmin(auth);
 const data=parse(z.object({eventId:z.string().min(1).max(100),confirmation:z.literal('ANONIMIZAR TESTES')}).strict(),await body(request));
 const event=await getEvent(env,data.eventId);
 if(!event.is_test) throw new ApiError(409,'Esta ação é exclusiva para eventos de teste. Nenhum registro oficial foi alterado.');
 // Refuse shared identities rather than alter participant data used by another
 // event. This predicate is repeated inside the transaction, not just preflight.
 const unsafe=`EXISTS (SELECT 1 FROM registrations r JOIN registrations other ON other.participant_id=r.participant_id AND other.event_id!=r.event_id WHERE r.event_id=?) OR EXISTS (SELECT 1 FROM certificates x JOIN registrations r ON r.id=x.registration_id WHERE r.event_id=? AND x.status='issued')`;
 if(await one(env,`SELECT 1 unsafe WHERE ${unsafe}`,event.id,event.id)) throw new ApiError(409,'A limpeza foi interrompida: há participante compartilhado com outro evento ou certificado emitido. Revise os registros.');
 const stamp=now();
 try {
  const result=await env.DB.batch([
   // An invalid bit aborts the whole D1 batch if the preflight became stale.
   // Closing first serializes cleanup against test-registration insert gates.
   sql(env,`UPDATE events SET registration_open=CASE WHEN is_test=1 AND NOT (${unsafe}) THEN 0 ELSE 2 END WHERE id=?`,event.id,event.id,event.id),
   sql(env,"INSERT INTO audit_logs(id,actor_id,action,target_id,details) SELECT ?,?,'test-data.cleanup',?,json_object('anonymized',COUNT(*),'registrationClosed',json('true')) FROM participants p WHERE p.anonymized_at IS NULL AND p.id IN (SELECT participant_id FROM registrations WHERE event_id=?)",id(),auth.user.id,event.id,event.id),
   sql(env,"UPDATE registrations SET status='cancelled',email='anon-test-'||participant_id||'@invalid.local',profile='',certificate_eligible=0,consent_text='Dados de teste anonimizados pela administração' WHERE event_id=?",event.id),
   sql(env,"UPDATE participants SET name='Participante de teste anonimizado',email='anon-test-'||id||'@invalid.local',institution='',course='',anonymized_at=? WHERE anonymized_at IS NULL AND id IN (SELECT participant_id FROM registrations WHERE event_id=?)",stamp,event.id),
   sql(env,'UPDATE tickets SET revoked_at=? WHERE registration_id IN (SELECT id FROM registrations WHERE event_id=?)',stamp,event.id),
   sql(env,'DELETE FROM checkins WHERE registration_id IN (SELECT id FROM registrations WHERE event_id=?)',event.id),
   sql(env,'DELETE FROM idempotency_keys WHERE event_id=?',event.id),
   sql(env,"UPDATE certificates SET snapshot='{}',status='revoked',revoked_at=? WHERE registration_id IN (SELECT id FROM registrations WHERE event_id=?)",stamp,event.id),
   sql(env,"UPDATE certificate_history SET snapshot='{}' WHERE registration_id IN (SELECT id FROM registrations WHERE event_id=?)",event.id)
  ]);
  return json({anonymized:result[3].meta.changes,registrationClosed:true});
 } catch(error) {
  if(String(error).includes('CHECK constraint')) throw new ApiError(409,'A limpeza foi interrompida por uma alteração concorrente. Revise os registros e tente novamente.');
  throw error;
 }
}

async function recover(request:Request,env:Env,auth:Auth,registrationId:string) {
 isAdmin(auth); const data=parse(z.object({identityVerified:z.literal(true),reason:z.string().trim().min(10).max(500)}),await body(request));
 const p=await getParticipant(env,registrationId); if(p.status!=='active') throw new ApiError(409,'Inscrição cancelada. Reative-a antes de recuperar o ingresso.');
 const token=randomToken();
 await env.DB.batch([sql(env,'UPDATE tickets SET token_hash=?,revoked_at=NULL WHERE registration_id=?',await sha(token),registrationId),sql(env,'DELETE FROM idempotency_keys WHERE registration_id=?',registrationId),audit(env,auth,'ticket.recover',registrationId,{identityVerified:true,reason:data.reason})]);
 return json({token,code:p.code});
}

const checkinCredentialSchema=z.object({
 eventId:z.string().trim().min(1).max(100),
 token:z.string().regex(/^[a-f0-9]{64}$/,'QR Code inválido.').optional(),
 code:z.string().trim().min(1).max(60).transform(value=>value.toUpperCase()).optional()
});
type CheckinCredential=z.infer<typeof checkinCredentialSchema>;
const oneCredential=(data:CheckinCredential)=>!!data.token!==!!data.code;
async function checkinFilter(data:CheckinCredential) {
 // Bind tokens only as hashes. Neither credentials nor ticket responses enter URLs or logs.
 return data.token
  ? {query:'r.event_id=? AND t.token_hash=?',args:[data.eventId,await sha(data.token)]}
  : {query:'r.event_id=? AND r.code=?',args:[data.eventId,data.code!]};
}
const checkinTicketJoin=' JOIN tickets t ON t.registration_id=r.id';
const visibleCheckinTicket="(t.revoked_at IS NULL OR r.status='cancelled')";

async function lookupCheckin(request:Request,env:Env,auth:Auth) {
 isCheckinOperator(auth);
 const data=parse(checkinCredentialSchema.strict().refine(oneCredential,'Informe um token ou código.'),await body(request));
 await rateLimit(env,request,'checkin-lookup',300,60,auth.user.id);
 const filter=await checkinFilter(data);
 const participant=await one<Participant>(env,`${participantSelect}${checkinTicketJoin} WHERE ${filter.query} AND ${visibleCheckinTicket}`, ...filter.args);
 if(!participant) throw new ApiError(404,'Ingresso inexistente ou revogado.');
 // This authenticated preview never records attendance, returns the private token,
 // or uses the participant-facing ticket endpoint.
 return json({participant});
}

async function checkIn(request:Request,env:Env,auth:Auth) {
 isCheckinOperator(auth);
 const data=parse(checkinCredentialSchema.extend({confirmIdentity:z.literal(true)}).strict().refine(oneCredential,'Informe um token ou código.'),await body(request));
 await rateLimit(env,request,'checkin',200,60,auth.user.id);
 const filter=await checkinFilter(data);
 const eligible=`${filter.query} AND r.status='active' AND t.revoked_at IS NULL`;
 // D1 serializes the whole batch. Validate the credential at INSERT time so
 // cancellation/recovery cannot race a stale preflight read. The existing PK
 // makes retries and simultaneous operators preserve the first actor/time.
 const result=await env.DB.batch([
  sql(env,`INSERT INTO checkins(registration_id,actor_id) SELECT r.id,? FROM registrations r${checkinTicketJoin} WHERE ${eligible} ON CONFLICT(registration_id) DO NOTHING`,auth.user.id,...filter.args),
  sql(env,`INSERT INTO audit_logs(id,actor_id,action,target_id) SELECT ?,?,'checkin.confirm',r.id FROM registrations r${checkinTicketJoin} WHERE ${eligible} AND changes()=1`,id(),auth.user.id,...filter.args),
  sql(env,`${participantSelect}${checkinTicketJoin} WHERE ${filter.query} AND ${visibleCheckinTicket}`,...filter.args)
 ]);
 const participant=result[2].results[0] as unknown as Participant|undefined;
 if(!participant) throw new ApiError(404,'Ingresso inexistente ou revogado.');
 if(participant.status!=='active') throw new ApiError(409,'Ingresso cancelado.');
 if(!participant.checked_in_at) throw new ApiError(409,'A presença não foi confirmada. Consulte novamente o ingresso.');
 return json({participant,alreadyCheckedIn:result[0].meta.changes===0});
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
  const event=required(await one<EventSettings & {active_count:number}>(env,slug?'SELECT * FROM events WHERE slug=?':'SELECT * FROM events WHERE is_test=0 ORDER BY event_date DESC LIMIT 1',...(slug?[slug]:[])));
 const [speakers,schedule]=await Promise.all([rows<Speaker>(env,"SELECT * FROM speakers WHERE event_id=? AND published=1 AND invitation_status='confirmed' AND credentials_verified=1 AND bio_approved=1 ORDER BY display_order,id",event.id),rows(env,"SELECT s.id,s.event_id,s.title,s.description,s.start_time,s.end_time,s.time_label,CASE WHEN p.published=1 AND p.invitation_status='confirmed' AND p.credentials_verified=1 AND p.bio_approved=1 THEN s.speaker_id ELSE NULL END speaker_id,s.display_order,s.published,s.special FROM schedule_items s LEFT JOIN speakers p ON p.id=s.speaker_id WHERE s.event_id=? AND s.published=1 ORDER BY s.display_order,s.id",event.id)]);
  return json({event:publicEvent(event),speakers:speakers.map(publicSpeaker),schedule,remaining:Math.max(0,event.capacity-event.active_count)});
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
 if(path==='/api/admin/check-in/lookup' && method==='POST') return lookupCheckin(request,env,auth);
 if(path==='/api/admin/check-in' && method==='POST') return checkIn(request,env,auth);
 if(path==='/api/admin/test-data/cleanup' && method==='POST') return cleanupTestData(request,env,auth);
 if(path==='/api/admin/events' && method==='GET') return json({events:await rows(env,'SELECT * FROM events ORDER BY event_date DESC')});
 if(path==='/api/admin/events' && method==='POST') return saveEvent(request,env,auth,url,true);
 if(path==='/api/admin/event' && method==='GET') return json({event:await getEvent(env,eventIdFrom(url))});
 if(path==='/api/admin/event' && method==='PUT') return saveEvent(request,env,auth,url);
 if(path==='/api/admin/dashboard' && method==='GET') {
  isCheckinOperator(auth);
  const event=await getEvent(env,eventIdFrom(url));
  const [counts,recent]=await env.DB.batch([
   sql(env,"SELECT COUNT(*) total,COALESCE(SUM(r.status='active'),0) active,COALESCE(SUM(r.status='cancelled'),0) cancelled,COALESCE(SUM(r.status='active' AND c.registration_id IS NOT NULL),0) checkedIn,COALESCE(SUM(r.status='active' AND r.certificate_eligible=1 AND c.registration_id IS NOT NULL),0) eligible,COALESCE(SUM(x.status='issued'),0) certificates FROM registrations r LEFT JOIN checkins c ON c.registration_id=r.id LEFT JOIN certificates x ON x.registration_id=r.id WHERE r.event_id=?",event.id),
   sql(env,"SELECT r.id,p.name,r.code,c.checked_in_at,u.name checked_in_by FROM checkins c JOIN registrations r ON r.id=c.registration_id JOIN participants p ON p.id=r.participant_id JOIN admin_users u ON u.id=c.actor_id WHERE r.event_id=? AND r.status='active' ORDER BY c.checked_in_at DESC,r.id LIMIT 10",event.id)
  ]);
  const metrics=counts.results[0] as unknown as {total:number;active:number;cancelled:number;checkedIn:number;eligible:number;certificates:number};
  return json({...metrics,remaining:event.capacity-event.active_count,absent:metrics.active-metrics.checkedIn,certificatesIssued:metrics.certificates,occupancy:Math.round(event.active_count/event.capacity*100),attendancePercentage:metrics.active?Math.round(metrics.checkedIn/metrics.active*100):0,recentCheckins:recent.results as unknown as RecentCheckin[],updatedAt:now()});
 }
 if(path==='/api/admin/participants' && method==='GET') {
  const q=(url.searchParams.get('q')||'').slice(0,150),eventId=eventIdFrom(url);
  return json({participants:await rows(env,`${participantSelect} WHERE r.event_id=?${registrationKindFilter(url)} AND (p.name LIKE ? OR p.email LIKE ? OR r.code LIKE ?) ORDER BY r.created_at DESC LIMIT 2000`,eventId,`%${q}%`,`%${q}%`,`%${q}%`)});
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
  isAdmin(auth); const q=(url.searchParams.get('q')||'').slice(0,150);
  const participants=await rows<Participant>(env,`${participantSelect} WHERE r.event_id=?${registrationKindFilter(url)} AND (p.name LIKE ? OR p.email LIKE ? OR r.code LIKE ?) ORDER BY p.name COLLATE NOCASE`,eventIdFrom(url),`%${q}%`,`%${q}%`,`%${q}%`);
  const escape=(value:unknown)=>{let s=String(value??''); if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s=`'${s}`; return `"${s.replace(/"/g,'""')}"`;};
  const profiles:Record<string,string>={student:'Estudante',teacher:'Professor(a)',professional:'Profissional',other:'Outro'};
  const csv=[['Código','Nome','E-mail','Perfil','Instituição','Curso ou área','Situação','Inscrição','Credenciamento','Certificado aprovado','Tipo de registro'],...participants.map(p=>[p.code,p.name,p.email,profiles[p.profile]||'',p.institution,p.course,p.status,p.created_at,p.checked_in_at,p.certificate_eligible?'Sim':'Não',p.is_test?'Teste':'Oficial'])].map(line=>line.map(escape).join(';')).join('\r\n');
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
  if(message.includes('TEST_REGISTRATION_CLOSED')) return json({error:'As inscrições de teste foram encerradas.'},409);
  if(message.includes('EVENT_KIND_IMMUTABLE')) return json({error:'O tipo teste ou oficial não pode ser alterado após a criação.'},409);
  if(message.includes('TEST_CERTIFICATE_FORBIDDEN')) return json({error:'Eventos de teste não podem emitir certificados válidos.'},409);
  if(message.includes('UNIQUE')) return json({error:'Já existe um registro com estes dados.'},409);
  if(message.includes('CERTIFICATE_NOT_ELIGIBLE')) return json({error:'A presença ou a autorização foi alterada durante a emissão. Revise os participantes.'},409);
  if(message.includes('PARTICIPANT_ANONYMIZED')) return json({error:'Uma inscrição anonimizada não pode ser reativada.'},409);
  if(message.includes('SPEAKER_NOT_APPROVED')) return json({error:'A publicação do convidado exige participação confirmada, qualificação verificada e biografia aprovada.'},400);
  if(message.includes('CHECK constraint') || message.includes('FOREIGN KEY')) return json({error:'A alteração viola uma regra de integridade. Revise os dados.'},400);
  // Do not log request bodies, IP addresses, passwords, session cookies or ticket tokens.
  console.error('NEXO_API_FAILURE',new URL(request.url).pathname.replace(/[a-f0-9]{32,}/g,'[token]'),error instanceof Error?error.name:'unknown');
  return json({error:'Serviço temporariamente indisponível. Seus dados já salvos foram preservados. Tente novamente.'},503);
 }
}
