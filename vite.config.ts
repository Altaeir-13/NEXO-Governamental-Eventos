import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Only these public files and Vite's immutable build assets may enter Cache Storage.
// HTML, API responses, uploaded media, private links and query strings are excluded.
const publicPwaFiles = ['/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png'];
function publicAssetsWorker(): Plugin {
 return {
  name: 'nexo-public-assets-worker', apply: 'build',
  generateBundle(_options, bundle) {
   const assets = Object.keys(bundle).filter(name => /^assets\/[A-Za-z0-9_/-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp|avif)$/.test(name)).map(name => `/${name}`).sort();
   const hash = createHash('sha256');
   const template = readFileSync(new URL('./src/pwa/service-worker.js', import.meta.url), 'utf8');
   hash.update(template);
   for (const path of publicPwaFiles) hash.update(path).update(readFileSync(new URL(`./public${path}`, import.meta.url)));
   hash.update(JSON.stringify(assets));
   this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 20)).replace('__PUBLIC_ASSETS__', JSON.stringify([...publicPwaFiles, ...assets])) });
  },
 };
}
export default defineConfig({ plugins: [react(), publicAssetsWorker()], server: { proxy: { '/api': 'http://127.0.0.1:8788' } }, build: { chunkSizeWarningLimit: 700 } });
