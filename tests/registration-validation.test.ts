import { describe, expect, it } from 'vitest';
import { participantSchema, registerSchema } from '../functions/_lib/validation';

const valid={eventId:'evento-ficticio',name:'Pessoa de Teste',email:'pessoa@example.invalid',consent:true,idempotencyKey:'ensaio-ficticio-1234567890'};

describe('formulário mínimo e perfil opcional',()=>{
 it('normaliza o e-mail e mantém opcionais vazios sem exigir novos dados pessoais',()=>{
  expect(registerSchema.parse({...valid,email:' PESSOA@EXAMPLE.INVALID '})).toMatchObject({name:valid.name,email:valid.email,profile:'',institution:'',course:'',consent:true});
 });
 it.each(['student','teacher','professional','other',''])('aceita perfil %s',profile=>{
  expect(registerSchema.parse({...valid,profile}).profile).toBe(profile);
  expect(participantSchema.parse({profile})).toEqual({profile});
 });
 it.each([{name:''},{name:'Pessoa'},{email:'email-invalido'},{consent:false},{profile:'administrador'}])('rejeita os dados inválidos %j',invalid=>{
  expect(registerSchema.safeParse({...valid,...invalid}).success).toBe(false);
 });
 it('não aceita caracteres de controle nos campos opcionais',()=>{
  expect(registerSchema.safeParse({...valid,course:'Curso\u0000'}).success).toBe(false);
 });
});
