import type { Env } from './_lib/security';

interface SearchEvent { slug:string; title:string; description:string; city:string; event_date:string; date_confirmed:number; venue_confirmed:number }
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const plain=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();

/** Only publicly reachable event pages enter the renderer. Credentials, ticket
 * fragments, participant data, and administrative pages never enter metadata. */
export const onRequest:PagesFunction<Env>=async context=>{
 const url=new URL(context.request.url),path=url.pathname.replace(/\/$/,'')||'/';
 const match=path.match(/^\/evento\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
 if(path!=='/' && path!=='/sitemap.xml' && !match) return context.next();
 if(!['GET','HEAD'].includes(context.request.method)) return context.next();
 try {
  if(path==='/sitemap.xml') {
   const events=await context.env.DB.prepare('SELECT slug FROM events ORDER BY event_date DESC LIMIT 1000').all<{slug:string}>();
   const pages=[`${url.origin}/`,...events.results.filter(e=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug)).map(e=>`${url.origin}/evento/${e.slug}`)];
   const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(page=>`<url><loc>${escape(page)}</loc></url>`).join('')}</urlset>`;
   return new Response(context.request.method==='HEAD'?null:xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }
  const query=match?'SELECT slug,title,description,city,event_date,date_confirmed,venue_confirmed FROM events WHERE slug=?':'SELECT slug,title,description,city,event_date,date_confirmed,venue_confirmed FROM events ORDER BY event_date DESC LIMIT 1';
  const statement=context.env.DB.prepare(query),event=await (match?statement.bind(match[1]):statement).first<SearchEvent>();
  const response=await context.next();
  if(!event) return new Response(response.body,{status:404,headers:{...Object.fromEntries(response.headers),'X-Robots-Tag':'noindex','Cache-Control':'no-store'}});
  if(!response.headers.get('Content-Type')?.includes('text/html')) return response;
  const title=`${plain(event.title)} · NEXO Governamental`,provisional=event.date_confirmed?'': ' Data prevista, sujeita à confirmação.';
  const description=`${plain(event.description).slice(0,240)} ${plain(event.city)}.${provisional}`.trim();
  const canonical=`${url.origin}${match?`/evento/${event.slug}`:'/'}`,image=`${url.origin}/compartilhar.png`;
  const updated=new HTMLRewriter()
   .on('title',{element(element){element.setInnerContent(title);}})
   .on('meta[name="description"]',{element(element){element.setAttribute('content',description);}})
   .on('meta[property="og:title"]',{element(element){element.setAttribute('content',title);}})
   .on('meta[property="og:description"]',{element(element){element.setAttribute('content',description);}})
   .on('meta[property="og:image"]',{element(element){element.setAttribute('content',image);}})
   .on('head',{element(element){element.append(`<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(image)}">`,{html:true});}})
   .transform(response);
  updated.headers.set('Cache-Control','public, max-age=60');
  updated.headers.set('Vary','Accept-Encoding');
  return updated;
 } catch {
  // Crawlers should retry instead of caching incomplete or stale event metadata.
  return new Response('O evento está temporariamente indisponível. Tente novamente em instantes.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Retry-After':'60'}});
 }
};
