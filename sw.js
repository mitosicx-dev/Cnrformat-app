/* First-party assets only. Never cache or mass-hotlink external images/API. */
const CACHE='cnrformat-shell-v1.0.1-phone';
const ASSETS=['./','./index.html','./styles.css','./logic.js','./db.js','./app.js','./manifest.webmanifest','./cnr_rules.json','./catalog_seed.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('cnrformat-shell-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(resp=>{if(resp.ok&&['basic','default'].includes(resp.type)){const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return resp;})));
});
