/* IndexedDB storage — transactional card snapshot, independent of localStorage deck drafts. */
const CNRStore=(()=>{
 const DB='cnrformat-mobile-v1',VER=1,STORE='cards';let handle=null;
 function open(){if(handle)return Promise.resolve(handle);return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,VER);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const st=db.createObjectStore(STORE,{keyPath:'key'});st.createIndex('id','id',{unique:false});}};
  req.onsuccess=()=>{handle=req.result;handle.onversionchange=()=>{handle.close();handle=null;};resolve(handle);};req.onerror=()=>reject(req.error);
 });}
 async function count(){const db=await open();return new Promise((ok,bad)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).count();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
 async function getAll(){const db=await open();return new Promise((ok,bad)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
 async function putMany(cards,onProgress){
  const db=await open();let done=0;const chunkSize=350;
  for(let i=0;i<cards.length;i+=chunkSize){const chunk=cards.slice(i,i+chunkSize);await new Promise((ok,bad)=>{
   const tx=db.transaction(STORE,'readwrite'),st=tx.objectStore(STORE);
   for(const c of chunk)st.put(c);
   tx.oncomplete=ok;tx.onerror=()=>bad(tx.error);tx.onabort=()=>bad(tx.error||Error('Database transaction aborted'));
  });done+=chunk.length;if(onProgress)onProgress(done,cards.length);await new Promise(r=>setTimeout(r,0));
  }
 }
 async function clear(){const db=await open();return new Promise((ok,bad)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=ok;tx.onerror=()=>bad(tx.error);});}
 return {open,count,getAll,putMany,clear};
})();
