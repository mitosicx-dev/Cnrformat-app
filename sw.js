/* CNRFormat 1.2: network-first same-origin shell with offline fallback. */
const CACHE='cnrformat-shell-v1.2.0-phase4';
const ASSETS=['./','./index.html','./styles.css','./logic.js','./lab.js','./competition-core.js','./competition-ui.js','./db.js','./app.js','./manifest.webmanifest','./cnr_rules.json','./catalog_seed.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cnrformat-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(fetch(req).then(resp=>{if(resp.ok&&resp.type==='basic'){const copy=resp.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{}));}return resp;}).catch(async()=>{const saved=await caches.match(req);if(saved)return saved;if(req.mode==='navigate')return (await caches.match('./index.html'))||Response.error();return Response.error();}));
});
