export interface Env { DB: D1Database; TOKEN_SECRET: string }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes)).map(b => b.toString(16).padStart(2,'0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export async function sha(value: string) { return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))); }
export async function keyed(env: Env, value: string) {
 if (!env.TOKEN_SECRET || env.TOKEN_SECRET.length < 32) throw new ApiError(503,'Configuração de segurança incompleta. Contate a organização.');
 const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TOKEN_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));
}
export function equal(a: string,b: string) { let diff=a.length^b.length; for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return diff===0; }
export async function hashPassword(password: string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))) {
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=Uint8Array.from(salt.match(/.{2}/g) || [], x=>parseInt(x,16));
 const hash=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes,iterations:100000,hash:'SHA-256'},material,256));
 return `pbkdf2$100000$${salt}$${hash}`;
}
export async function verifyPassword(password:string,stored:string) {
 if(!/^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored)) return false;
 return equal(await hashPassword(password,stored.split('$')[2]),stored);
}
export function originCheck(request:Request) {
 const origin=request.headers.get('Origin');
 if((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403,'Origem da solicitação não autorizada.');
}
export async function body(request:Request):Promise<Record<string,unknown>> {
 if(!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415,'Envie os dados em JSON.');
 if(Number(request.headers.get('Content-Length')||0)>65536) throw new ApiError(413,'Solicitação muito grande.');
 const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',length=0;
 if(reader) { for(;;) { const chunk=await reader.read();if(chunk.done) break;length+=chunk.value.byteLength;if(length>65536) {await reader.cancel();throw new ApiError(413,'Solicitação muito grande.');}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode(); }
 try { const parsed=JSON.parse(raw); if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
 catch { throw new ApiError(400,'Dados JSON inválidos.'); }
}
export async function rateLimit(env:Env,request:Request,scope:string,max:number,seconds:number,account='') {
 const time=Math.floor(Date.now()/1000), window=Math.floor(time/seconds);
 const address=request.headers.get('CF-Connecting-IP') || 'local';
 const bucket=await keyed(env,`rate:${scope}:${address}:${account}:${window}`);
 const result=await env.DB.batch([
  env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(time),
  env.DB.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,(window+1)*seconds)
 ]);
 const count=Number((result[1].results[0] as {count:number})?.count || 0);
 if(count>max) throw new ApiError(429,'Muitas solicitações. Aguarde alguns minutos e tente novamente.');
}
export interface Auth { user:{id:string;email:string;name:string;role:string}; csrf:string; tokenHash:string }
export async function authenticate(request:Request,env:Env,adminOnly=false):Promise<Auth> {
 const token=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('nexo_session='))?.slice(13) || '';
 if(!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401,'Entre para continuar.');
 const tokenHash=await sha(token);
 const row=await env.DB.prepare('SELECT u.id,u.email,u.name,u.role,s.csrf FROM sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ? AND u.enabled=1').bind(tokenHash,now()).first<{id:string;email:string;name:string;role:string;csrf:string}>();
 if(!row) throw new ApiError(401,'Sessão expirada. Entre novamente.');
 if(adminOnly && row.role!=='admin') throw new ApiError(403,'Esta ação exige um administrador.');
 if(!['GET','HEAD','OPTIONS'].includes(request.method) && !equal(request.headers.get('X-CSRF-Token')||'',row.csrf)) throw new ApiError(403,'Proteção de sessão inválida. Atualize a página.');
 return {user:{id:row.id,email:row.email,name:row.name,role:row.role},csrf:row.csrf,tokenHash};
}
export function sessionCookie(request:Request,token:string,clear=false) {
 const host=new URL(request.url).hostname, secure=host==='localhost'||host==='127.0.0.1'||host==='[::1]'?'':'; Secure';
 return `nexo_session=${clear?'':token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:28800}${secure}`;
}
