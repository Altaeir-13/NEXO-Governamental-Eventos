import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { RegistrationForm, RegistrationSuccess, TestNotice, TicketCard, validateRegistrationInput, type RegistrationInput } from '../src/RegistrationContent';
import { ticketPdf } from '../shared/pdf';
import type { EventSettings, Ticket } from '../shared/types';

const input:RegistrationInput={name:'Pessoa Fictícia',email:'pessoa@example.invalid',profile:'',institution:'',course:'',consent:true,website:''};
const ticket:Ticket={id:'registro-ficticio',code:'NEXO-TESTE-1234',token:'token_ficticio_de_teste_123456789012345678901234',name:'Pessoa Fictícia de Demonstração',status:'active',checked_in_at:null,certificate:null,event:{title:'Demonstração NEXO — inscrições de teste',is_test:1,date_confirmed:0,event_date:'DATA NÃO CONFIRMADA',venue_confirmed:0,venue:'LOCAL NÃO CONFIRMADO',auditorium:'AUDITÓRIO NÃO CONFIRMADO',address:'ENDEREÇO NÃO CONFIRMADO',checkin_time:'18:00'} as EventSettings};
const render=(element:React.ReactNode)=>renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

describe('inscrição pública simplificada',()=>{
 it('aceita dados necessários e todos os campos opcionais vazios',()=>{expect(validateRegistrationInput(input)).toEqual({});});
 it.each(['student','teacher','professional','other'])('aceita o perfil opcional %s',profile=>{expect(validateRegistrationInput({...input,profile})).toEqual({});});
 it('rejeita nome incompleto, e-mail inválido e ausência de ciência com mensagens claras',()=>{
  expect(validateRegistrationInput({...input,name:'',email:'invalido',consent:false})).toEqual({name:expect.stringContaining('nome completo'),email:expect.stringContaining('e-mail válido'),consent:expect.stringContaining('aviso de privacidade')});
  expect(validateRegistrationInput({...input,name:'Fulano'}).name).toContain('sobrenome');
 });
 it('rejeita perfil inexistente e opcionais excessivos',()=>{expect(validateRegistrationInput({...input,profile:'desconhecido',institution:'a'.repeat(201),course:'a'.repeat(201)})).toEqual({profile:expect.any(String),institution:expect.any(String),course:expect.any(String)});});
 it('oferece rótulos acessíveis e os quatro perfis, sem coletar CPF ou telefone',()=>{
  const html=render(<RegistrationForm isTest busy={false} failure="" onSubmit={()=>{}}/>);
  for(const name of ['Nome completo','E-mail','Perfil do participante','Estudante','Professor(a)','Profissional','Outro','Instituição de ensino ou trabalho','Curso ou área de atuação'])expect(html).toContain(name);
  expect(html).toContain('for="registration-name"');expect(html).toContain('aria-describedby="registration-name-hint"');
  expect(html).toContain('name="profile"');expect(html).toMatch(/<input[^>]+id="registration-consent"[^>]+required=""[^>]+name="consent"/);
  expect(html).toContain('tomei conhecimento');expect(html).not.toContain('Li e aceito');
  expect(html).not.toContain('name="cpf"');expect(html).not.toContain('name="phone"');
  expect(html).toContain('Confirmar inscrição de teste');
 });
 it('bloqueia campos durante o envio e anuncia o andamento sem duplicar o pedido',()=>{
  const html=render(<RegistrationForm isTest busy failure="" onSubmit={()=>{}}/>);
  expect(html).toContain('aria-busy="true"');expect(html).toContain('<fieldset disabled=""');expect(html).toContain('aria-live="polite"');expect(html).toContain('Enviando inscrição');
 });
 it('abre o aviso de privacidade do evento informado, preservando a consulta oficial por padrão',()=>{
  expect(render(<RegistrationForm isTest eventSlug="teste-inscricoes" busy={false} failure="" onSubmit={()=>{}}/>)).toContain('href="/privacidade?evento=teste-inscricoes"');
  expect(render(<RegistrationForm isTest={false} busy={false} failure="" onSubmit={()=>{}}/>)).toContain('href="/privacidade"');
 });
 it('mantém a confirmação de teste inequívoca e não promete participação oficial',()=>{
  const html=render(<><TestNotice ticket/><RegistrationSuccess isTest cancelled={false}/><TicketCard ticket={ticket} qr="data:image/png;base64,ficticio"/></>);
  expect(html).toContain('sem validade oficial');expect(html).toContain('não dá direito a certificado');expect(html).toContain('INSCRIÇÃO DE TESTE CONFIRMADA');
  expect(html).toContain(ticket.name);expect(html).toContain(ticket.code);expect(html).toContain('width="220" height="220"');
  expect(html).not.toContain('DATA NÃO CONFIRMADA');expect(html).not.toContain('LOCAL NÃO CONFIRMADO');expect(html).not.toContain('Credenciamento:');
 });
 it('exibe apenas data e local confirmados no ingresso oficial e respeita cancelamento',()=>{
  const official={...ticket,status:'cancelled',event:{...ticket.event,is_test:0,date_confirmed:1,event_date:'2026-11-11',venue_confirmed:1,venue:'Instituição fictícia',auditorium:'Auditório fictício'}};
  const html=render(<><RegistrationSuccess isTest={false} cancelled/><TicketCard ticket={official} qr=""/></>);
  expect(html).toContain('11 de novembro de 2026');expect(html).toContain('Instituição fictícia');expect(html).toContain('Auditório fictício');expect(html).toContain('INSCRIÇÃO CANCELADA');expect(html).not.toContain('inscrição foi confirmada');
 });
});
describe('ingresso PDF de teste',()=>{
 it('gera um PDF A4 com QR vetorial e identificação explícita de demonstração, sem depender de data/local provisórios',async()=>{
  const bytes=await ticketPdf(ticket,'https://example.invalid');const pdf=await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28,1);expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89,1);
  expect(pdf.getTitle()).toBe(`Ingresso de teste ${ticket.code}`);expect(pdf.getSubject()).toContain('sem validade para o evento oficial');expect(bytes.byteLength).toBeGreaterThan(10000);
 });
 it('preserva a identificação do ingresso oficial',async()=>{
  const pdf=await PDFDocument.load(await ticketPdf({...ticket,event:{...ticket.event,is_test:0}},'https://example.invalid'));
  expect(pdf.getTitle()).toBe(`Ingresso ${ticket.code}`);expect(pdf.getSubject()).toContain('Ingresso individual gratuito');expect(pdf.getPageCount()).toBe(1);
 });
});
