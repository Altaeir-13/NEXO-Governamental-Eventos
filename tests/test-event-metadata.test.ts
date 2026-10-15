import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('metadados públicos com evento de teste posterior ao oficial',()=>{
 let mf:Miniflare;
 beforeAll(async()=>{
  const bundle=await build({stdin:{contents:`import {onRequest} from './functions/_middleware.ts';export default {fetch(request,env){return onRequest({request,env,next:async()=>new Response('<html><head><title>NEXO</title><meta name="robots" content="index, follow"><meta name="description"><meta property="og:title"><meta property="og:description"><meta property="og:image"></head><body>Aplicação</body></html>',{headers:{'Content-Type':'text/html'}})});}};`,resolveDir:process.cwd(),loader:'js'},bundle:true,format:'esm',platform:'browser',write:false});
  mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-01',d1Databases:{DB:'metadata-isolada'},d1Persist:false});
  const db=await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE events(slug TEXT,title TEXT,description TEXT,city TEXT,event_date TEXT,date_confirmed INTEGER,venue_confirmed INTEGER,is_test INTEGER)').run();
  await db.prepare("INSERT INTO events VALUES ('oficial','Encontro oficial','Descrição oficial','São Luís','2026-11-11',0,0,0),('teste-inscricoes','Demonstração de teste','Sem validade oficial','Online','2099-01-01',0,0,1)").run();
 },30_000);
 afterAll(async()=>{if(mf)await mf.dispose();});
 it('mantém título e compartilhamento da homepage no evento oficial',async()=>{
  const response=await mf.dispatchFetch('https://nexo.test/'),html=await response.text();
  expect(response.status).toBe(200);expect(html).toContain('Encontro oficial · NEXO Governamental');expect(html).not.toContain('Demonstração de teste');
 });
 it('exclui demonstrações do sitemap',async()=>{
  const response=await mf.dispatchFetch('https://nexo.test/sitemap.xml'),xml=await response.text();
  expect(xml).toContain('/evento/oficial');expect(xml).not.toContain('teste-inscricoes');expect(response.headers.get('Content-Type')).toContain('application/xml');
 });
 it('identifica o slug de teste e impede indexação sem depender do JavaScript do visitante',async()=>{
  const response=await mf.dispatchFetch('https://nexo.test/evento/teste-inscricoes'),html=await response.text();
  expect(response.status).toBe(200);expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(html).toContain('Demonstração de teste');expect(html).toContain('content="noindex, nofollow"');
 });
});
