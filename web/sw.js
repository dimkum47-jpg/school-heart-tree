// Cache only static application shell. NEVER cache API/auth/student data.
const CACHE = 'heart-tree-static-v1';
const FILES = ['./','./index.html','./style.css','./app.js','./config.js','./manifest.webmanifest','./assets/heart-tree.webp','./assets/icon192.png','./assets/icon512.png'];
self.addEventListener('install', e=>e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate', e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.includes('/api/'))return;
  e.respondWith(fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return res;}).catch(()=>caches.match(e.request)));
});
