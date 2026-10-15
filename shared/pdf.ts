import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode/lib/core/qrcode.js';
import type { Ticket } from './types';
import { nunitoFontBase64 } from './font';

export interface CertificateSnapshot { name:string; event_title:string; event_date:string; city:string; hours:number; text:string; signatories:string }
const navy=rgb(25/255,31/255,81/255),ice=rgb(240/255,248/255,248/255),turquoise=rgb(131/255,234/255,216/255),white=rgb(1,1,1);
const date=(value:string)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(value.length===10?`${value}T12:00:00-03:00`:value));
// Keep text supported by Nunito without allowing control characters to corrupt a PDF.
const clean=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').normalize('NFC');
function lines(text:string,font:PDFFont,size:number,width:number) {
 const output:string[]=[]; let line='';
 for(const word of clean(text).split(/\s+/)) {
  const next=line?`${line} ${word}`:word;
  if(font.widthOfTextAtSize(next,size)<=width) {line=next; continue;}
  if(line) output.push(line); line='';
  // Even a single unbroken long name / URL is wrapped, never clipped.
  for(const char of word) {if(font.widthOfTextAtSize(line+char,size)>width) {output.push(line);line='';} line+=char;}
 }
 if(line) output.push(line); return output;
}
function paragraph(page:PDFPage,text:string,font:PDFFont,size:number,x:number,y:number,width:number,leading=size*1.4,maxLines=100) {
 const wrapped=lines(text,font,size,width);
 for(const line of wrapped.slice(0,maxLines)) {page.drawText(line,{x,y,size,font,color:navy});y-=leading;}
 return y;
}
function center(page:PDFPage,text:string,font:PDFFont,size:number,y:number,width:number) {const wrapped=lines(text,font,size,width-120); for(const line of wrapped) {page.drawText(line,{x:(width-font.widthOfTextAtSize(line,size))/2,y,size,font,color:navy});y-=size*1.3;} return y;}
function mark(page:PDFPage,font:PDFFont,x:number,y:number,inverse=false) {page.drawText('NEXO',{x,y,size:27,font,color:inverse?white:navy});page.drawText('GOVERNAMENTAL',{x,y:y-14,size:8,font,color:inverse?white:navy});}
function qr(page:PDFPage,text:string,x:number,y:number,size:number) {
 const matrix=QRCode.create(text,{errorCorrectionLevel:'M'}).modules,cell=size/(matrix.size+8);
 page.drawRectangle({x,y,width:size,height:size,color:white});
 for(let row=0;row<matrix.size;row++) for(let col=0;col<matrix.size;col++) if(matrix.get(row,col)) page.drawRectangle({x:x+(col+4)*cell,y:y+(matrix.size-row+3)*cell,width:cell+0.03,height:cell+0.03,color:navy});
}
async function document() {
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(Uint8Array.from(atob(nunitoFontBase64),c=>c.charCodeAt(0)),{subset:true});
 pdf.setCreator('NEXO Governamental — Plataforma de Eventos');pdf.setProducer('NEXO Governamental / pdf-lib');
 return {pdf,font};
}
export async function ticketPdf(ticket:Ticket,origin:string) {
 const {pdf,font}=await document(),page=pdf.addPage([595.28,841.89]),w=page.getWidth();
 page.drawRectangle({x:0,y:0,width:w,height:842,color:ice});
 page.drawRectangle({x:0,y:702,width:w,height:140,color:navy});mark(page,font,42,785,true);
 page.drawText('INGRESSO GRATUITO',{x:42,y:735,size:15,font,color:white});
 let y=paragraph(page,ticket.event.title,font,21,42,663,w-84,28);
 y=paragraph(page,ticket.name,font,25,42,y-25,w-84,32);
 y=paragraph(page,`${date(ticket.event.event_date)}${ticket.event.date_confirmed?'':' — data prevista, a confirmar'}`,font,12,42,y-21,w-84);
 y=paragraph(page,`${ticket.event.venue}${ticket.event.venue_confirmed&&ticket.event.auditorium?` — ${ticket.event.auditorium}`:''}${ticket.event.venue_confirmed?'':' — local previsto, a confirmar'}`,font,12,42,y-12,w-84);
 y=paragraph(page,ticket.event.address,font,11,42,y-8,w-84);
 // Compact layout leaves a full quiet zone around the individual QR.
 const qrY=Math.min(y-194,245);qr(page,ticket.token,(w-170)/2,qrY,170);
 page.drawText(ticket.code,{x:(w-font.widthOfTextAtSize(ticket.code,11))/2,y:qrY-18,size:11,font,color:navy});
 paragraph(page,'Apresente este QR Code e um documento com nome no credenciamento. A equipe confirmará sua identidade. O ingresso é pessoal; guarde este arquivo e o link de recuperação em local seguro.',font,10,42,qrY-48,w-84,14);
 paragraph(page,`${origin}/ingresso#${ticket.token}`,font,7,42,75,w-84,10);
 page.drawText('NEXO Governamental — Núcleo Maranhão e Piauí',{x:42,y:30,size:9,font,color:navy});
 pdf.setTitle(`Ingresso ${ticket.code}`);return pdf.save();
}
export async function certificatePdf(data:CertificateSnapshot,code:string,issuedAt:string,origin:string,preview=false) {
 const {pdf,font}=await document(),page=pdf.addPage([841.89,595.28]),w=page.getWidth();
 page.drawRectangle({x:0,y:0,width:w,height:595.28,color:ice});
 page.drawRectangle({x:18,y:18,width:w-36,height:559.28,borderColor:navy,borderWidth:2});
 page.drawRectangle({x:18,y:18,width:13,height:559.28,color:navy});
 page.drawCircle({x:w-20,y:595,size:130,color:turquoise,opacity:0.35});
 mark(page,font,55,532);page.drawText('NÚCLEO MARANHÃO E PIAUÍ',{x:55,y:489,size:9,font,color:navy});
 const nameLines=lines(data.name,font,24,w-140).length;
 center(page,'CERTIFICADO DE PARTICIPAÇÃO',font,27,435,w);
 center(page,data.name,font,nameLines>2?19:24,387,w);
 const text=data.text.replaceAll('{nome}',data.name).replaceAll('{evento}',data.event_title).replaceAll('{cidade}',data.city).replaceAll('{data}',date(data.event_date)).replaceAll('{horas}',String(data.hours));
 let bodySize=13;while(bodySize>7 && lines(text,font,bodySize,w-130).length*bodySize*1.45>145) bodySize-=0.5;
 if(lines(text,font,bodySize,w-130).length*bodySize*1.45>145) throw new Error('O texto do certificado é longo demais para uma página. Reduza o modelo e confira a prévia.');
 paragraph(page,text,font,bodySize,65,320,w-130,bodySize*1.45);
 paragraph(page,data.signatories||'Signatários pendentes de aprovação institucional',font,11,65,137,w-285,15,3);
 page.drawLine({start:{x:65,y:151},end:{x:500,y:151},thickness:0.6,color:navy});
 const verification=`${origin}/validar/${code}`;qr(page,verification,w-172,62,105);
 paragraph(page,preview?'PRÉVIA SEM VALIDADE':`Emitido em ${date(issuedAt)} · ${data.hours} horas`,font,9,65,83,w-260,12);
 paragraph(page,preview?'Revise texto, carga horária, regras e signatários antes da liberação.':`Código: ${code}`,font,7,65,60,w-260,10);
 paragraph(page,preview?'':verification,font,7,65,43,w-260,10);
 if(preview) page.drawText('PRÉVIA — SEM VALIDADE',{x:490,y:532,size:17,font,color:navy,opacity:0.6});
 pdf.setTitle(preview?'Prévia de certificado — sem validade':`Certificado de ${data.name}`);return pdf.save();
}
