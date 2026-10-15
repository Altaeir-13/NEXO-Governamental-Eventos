#!/usr/bin/env node
import { randomBytes, pbkdf2Sync, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
if(args.includes('--help')) {
 console.log('npm run admin:create -- --local|--remote [--email EMAIL] [--name NOME] [--role admin|checkin]\nA senha é solicitada sem eco e nunca é aceita por argumento. Migrations devem estar aplicadas.');
 process.exit(0);
}
if(Number(args.includes('--local'))+Number(args.includes('--remote'))!==1) throw new Error('Escolha explicitamente --local ou --remote.');
if(!process.stdin.isTTY) throw new Error('Execute em um terminal interativo para digitar a senha sem eco.');
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted) process.stdout.write(chunk,encoding);callback();}});
const input=createInterface({input:process.stdin,output,terminal:true});
let directory;
try {
 const email=(value('--email')||await input.question('E-mail administrativo: ')).trim().toLowerCase();
 const name=(value('--name')||await input.question('Nome: ')).trim();
 const role=value('--role')||'admin';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) throw new Error('E-mail inválido.');
 if(name.length<2||name.length>150||!['admin','checkin'].includes(role)) throw new Error('Nome ou papel inválido.');
 process.stdout.write('Senha (mínimo 14 caracteres): ');muted=true;
 const password=await input.question('');muted=false;process.stdout.write('\n');
 if(password.length<14||password.length>256) throw new Error('Use entre 14 e 256 caracteres. Prefira uma frase longa e exclusiva.');
 process.stdout.write('Repita a senha: ');muted=true;
 const confirmation=await input.question('');muted=false;process.stdout.write('\n');
 if(password!==confirmation) throw new Error('As senhas não coincidem.');
 input.close();
 const salt=randomBytes(16).toString('hex'),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
 const stored=`pbkdf2$100000$${salt}$${hash}`,quote=v=>`'${String(v).replaceAll("'","''")}'`;
 // This temporary file contains only a salted hash. No plaintext password goes to disk, argv or logs.
 directory=await mkdtemp(join(tmpdir(),'nexo-admin-'));
 const file=join(directory,'admin.sql');
 await writeFile(file,`INSERT INTO admin_users(id,email,name,password_hash,role) VALUES (${[randomUUID(),email,name,stored,role].map(quote).join(',')});\n`,{mode:0o600});
 const executable=resolve('node_modules/wrangler/bin/wrangler.js');
 const child=spawn(process.execPath,[executable,'d1','execute','nexo-eventos',args.includes('--remote')?'--remote':'--local','--file',file,'--yes'],{stdio:'inherit',windowsHide:true});
 const status=await new Promise((accept,reject)=>{child.on('error',reject);child.on('exit',code=>accept(code));});
 if(status!==0) throw new Error('A criação não foi concluída. Confira login Cloudflare, binding e migrations.');
 console.log('Usuário criado. Entre em /admin; nenhuma senha padrão é fornecida.');
} finally {
 muted=false;input.close();
 if(directory) {await rm(join(directory,'admin.sql'),{force:true});await rmdir(directory);}
}
