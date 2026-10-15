import { z } from 'zod';
import { ApiError } from './security';

const text=(max=500)=>z.string().trim().max(max).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/,'Caracteres de controle não são permitidos.');
const bit=z.union([z.literal(0),z.literal(1)]);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v,'Data inválida.');
const datetime=z.string().datetime({offset:true});
const url=z.union([z.literal(''),z.string().url().max(1500).refine(v=>new URL(v).protocol==='https:','Use HTTPS.')]);
export const email=z.string().trim().toLowerCase().max(254).email('Informe um e-mail válido.');
export const eventSchema=z.object({
 slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120),title:text(300).min(5),description:text(10000),city:text(150),event_date:date,date_confirmed:bit,
 checkin_time:time,start_time:time,venue:text(300),auditorium:text(300),venue_confirmed:bit,address:text(500),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),
 capacity:z.number().int().min(1).max(100000),registration_open:bit,registration_starts:datetime.nullable(),registration_ends:datetime.nullable(),
 certificate_hours:z.number().positive().max(1000),certificates_released:bit,certificate_available_at:datetime,certificate_rules_approved:bit,certificate_text:text(6000).min(20),signatories:text(1000),
 contact_email:z.union([z.literal(''),email]),contact_url:url,instagram_url:url,venue_photo_url:url,venue_photo_authorized:bit,privacy_text:text(10000).min(50),retention_days:z.number().int().min(30).max(3650)
});
export const registerSchema=z.object({eventId:text(100).min(1),name:text(150).min(5).refine(v=>v.split(/\s+/).length>=2,'Informe seu nome completo.'),email,institution:text(200).optional().default(''),course:text(200).optional().default(''),consent:z.literal(true),website:z.string().max(300).optional().default(''),idempotencyKey:z.string().regex(/^[a-zA-Z0-9_-]{20,128}$/)});
export const speakerSchema=z.object({event_id:text(100).min(1),name:text(150).min(2),role:text(500),bio:text(4000),photo_url:url,area:text(200),social_url:url,invitation_status:z.enum(['pending','invited','confirmed','declined']),published:bit,display_order:z.number().int().min(0).max(1000)});
export const scheduleSchema=z.object({event_id:text(100).min(1),title:text(300).min(2),description:text(4000),start_time:time.nullable(),end_time:time.nullable(),time_label:text(100),speaker_id:text(100).nullable(),display_order:z.number().int().min(0).max(1000),published:bit,special:bit});
export const participantSchema=z.object({name:text(150).min(5),email,institution:text(200),course:text(200),status:z.enum(['active','cancelled']),checkedIn:z.boolean(),certificateEligible:z.boolean()}).partial().strict();
export function parse<T extends z.ZodTypeAny>(schema:T,value:unknown):z.infer<T> { const result=schema.safeParse(value); if(!result.success) throw new ApiError(400,result.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).slice(0,3).join(' ')); return result.data; }
