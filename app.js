/* CNRFormat Mobile v1.0 — offline-first single-page deck builder. */
(async function(){
 'use strict';
 const L=window.CNRLogic;
 const $=id=>document.getElementById(id);
 const state={rules:null,idx:null,cards:new Map(),byId:new Map(),all:[],annotations:new Map(),deck:L.newDeck(),library:[],view:'discover',query:'',type:'all',status:'all',sort:'name',page:0,pageSize:54,lastVersion:'',syncing:false,activeCard:null};
 const sanitize=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const storage=(k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}};
 function persist(){try{localStorage.setItem('cnr-current-v1',JSON.stringify(state.deck));}catch(e){toast('Could not save deck locally — storage may be full');}}
 function saveLibrary(){try{localStorage.setItem('cnr-library-v1',JSON.stringify(state.library));}catch(e){toast('Could not save library — storage may be full');}}
 let timer;
 function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,3800);}
 const number=n=>new Intl.NumberFormat('en-US').format(n||0);
 function getCard(key){return state.cards.get(key)||null;}
 function details(key){const card=getCard(key);if(card)return card;if(key.startsWith('unknown:'))return {key,name:`Unknown ID ${key.slice(8)}`,id:Number(key.slice(8)),type:'Unknown',desc:'This passcode has not yet been resolved. Sync the full card database.'};return {key,name:key,type:'Unknown',desc:'Card not in this catalog.'};}
 function enrichSeed(seed){return (seed.cards||[]).map(c=>({key:L.nameKey(c.name),id:null,name:c.name,type:c.card_type||'',desc:'',archetype:'',categories:c.categories||[],reviewed:c.categories_reviewed===true,tcg_date:null,released:c.tcg_released===true,source:'Phase 1 reviewed seed'}));}
 function indexCards(list){state.cards=new Map(list.map(c=>[c.key,c]));state.all=Array.from(state.cards.values()).sort((a,b)=>a.name.localeCompare(b.name));state.byId=new Map();for(const c of state.all)if(Number.isInteger(c.id)&&c.id>0)state.byId.set(c.id,c);repairImportedUnknowns();}
 function repairImportedUnknowns(){const decks=[state.deck,...state.library];let touched=false;
 for(const d of decks)for(const z of ['main','extra','side'])for(const item of d.sections[z]){
  if(!item.key.startsWith('unknown:'))continue;
  const known=state.byId.get(Number(item.key.slice(8)));if(known){item.key=known.key;touched=true;}
 }
 for(const d of decks)for(const z of ['main','extra','side']){
  const merged=new Map();for(const i of d.sections[z])merged.set(i.key,(merged.get(i.key)||0)+i.qty);
  d.sections[z]=[...merged].map(([key,qty])=>({key,qty}));
 }
 if(touched){persist();saveLibrary();}
 }
 function view(name){state.view=name;for(const el of document.querySelectorAll('.view'))el.classList.toggle('active',el.id==='view-'+name);
 for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('active',b.dataset.view===name);if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 if(name==='builder')renderBuilder();if(name==='library')renderLibrary();if(name==='discover')renderCatalog();if(name==='rules')renderSyncDetails();window.scrollTo({top:0,behavior:'instant'});
 }
 function verdictClass(v){return v==='LEGAL'?'status-good':v==='BANNED'||v==='ILLEGAL'?'status-bad':'status-review';}
 function showStats(){const audit=L.auditDeck(state.deck,state.cards,state.idx);$('stat-cards').textContent=number(state.all.length);
 $('stat-source').textContent=state.all.length<100?'Starter preview · sync needed':'Locally cached cards';
 $('stat-total').innerHTML=`${audit.totals.main} <small>/ 40 min</small>`;
 $('stat-deck').textContent=`${audit.totals.extra} extra · ${audit.totals.side} side`;
 const el=$('stat-legality');el.className=verdictClass(audit.status);el.textContent=audit.status;
 }
 function cardFace(c){const kind=String(c.type||'').toLowerCase();const t=kind.includes('spell')?'spell':kind.includes('trap')?'trap':L.cardZone(c)==='extra'?'extra':'';
 const monogram=c.name?.split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join('').toUpperCase()||'?';
 return `<div class="card-face ${t}" aria-hidden="true"><div class="face-title">${sanitize(c.name||'CARD')}</div><div class="face-art"><b>${sanitize(monogram)}</b></div><div class="face-desc"></div></div>`;}
 function renderCatalog(){const q=state.query.trim().toLowerCase();const filtered=state.all.filter(c=>{
  if(q&&!`${c.name} ${c.archetype||''} ${c.desc||''} ${c.type||''}`.toLowerCase().includes(q))return false;
  const t=String(c.type||'').toLowerCase();if(state.type==='monster'&&!t.includes('monster'))return false;if(state.type==='spell'&&!t.includes('spell'))return false;if(state.type==='trap'&&!t.includes('trap'))return false;
  return state.status==='all'||L.checkCard(c,state.idx).status===state.status;
 });
 if(state.sort==='archetype')filtered.sort((a,b)=>(a.archetype||'ZZZ').localeCompare(b.archetype||'ZZZ')||a.name.localeCompare(b.name));
 const shown=filtered.slice(0,(state.page+1)*state.pageSize);
 $('results-caption').textContent=`Showing ${number(shown.length)} of ${number(filtered.length)} cards`;
 $('catalog-notice').textContent=state.all.length<100?'17-card seed · full sync in Settings':'Local searchable snapshot';
 $('card-results').innerHTML=shown.length?shown.map(c=>{
  const status=L.checkCard(c,state.idx);const z=L.cardZone(c);
  return `<article class="card-item" data-open="${sanitize(c.key)}" tabindex="0" role="button" aria-label="View ${sanitize(c.name)} details">${cardFace(c)}<div class="card-info"><div class="card-name">${sanitize(c.name)}</div><div class="card-type">${sanitize(c.archetype||c.type||'Unclassified')}</div><div class="card-meta"><span class="tag ${status.status}">${status.status==='REVIEW'?'REVIEW':status.status==='BANNED'?'BANNED':'LEGAL'}</span><span class="tag">${z==='extra'?'EXTRA':z==='main'?'MAIN':'UNKNOWN'}</span></div></div><div class="card-actions"><button class="mini-btn" data-add="${sanitize(c.key)}" aria-label="Add ${sanitize(c.name)}" title="Add to deck">+</button><button class="mini-btn" data-more="${sanitize(c.key)}" aria-label="Details for ${sanitize(c.name)}">⌕</button></div></article>`;
 }).join(''):`<div class="empty-state"><strong>No cards found</strong>${state.all.length<100?'Sync the full database in Settings to search all cards.':'Try another card name, effect or filter.'}</div>`;
 $('show-more').hidden=shown.length>=filtered.length;
 }
 function addCard(key,zone){const c=getCard(key);if(!c){toast('Card not found');return;}const z=zone||L.cardZone(c);
 if(z!=='main'&&z!=='extra'){toast('Card type cannot be placed in the deck');return;}
 L.editQty(state.deck,z,key,1);persist();showStats();if(state.view==='builder')renderBuilder();toast(`${c.name} added to ${z} deck`);
 }
 function showCard(key){const c=details(key),v=L.checkCard(getCard(key),state.idx);const z=L.cardZone(c);
 $('modal-body').innerHTML=`<div class="modal-detail">${cardFace(c)}<div><h2 class="modal-name" id="modal-title">${sanitize(c.name)}</h2><div class="card-meta"><span class="tag ${v.status}">${v.status}</span><span class="tag">MAX ${v.limit===null?'?':v.limit}</span></div><p>${sanitize(c.type||'Unknown type')}${c.archetype?'<br>Archetype: '+sanitize(c.archetype):''}${c.attribute?' · '+sanitize(c.attribute):''}</p>${c.atk!==null&&c.atk!==undefined?`<p>ATK ${sanitize(c.atk)} ${c.def!==null&&c.def!==undefined?' / DEF '+sanitize(c.def):''}</p>`:''}</div></div>
 <div class="kicker">CARD EFFECT</div><div class="effect-box">${sanitize(c.desc||'Full card text unavailable in the seed preview. Sync the card database to populate effects.')}</div><div class="kicker" style="margin-top:16px">CNR VERDICT</div><div class="effect-box">${v.reasons.map(s=>'• '+sanitize(s)).join('\n')}\n\nRelease: ${sanitize(c.tcg_date||'Unknown')} · Classification: ${c.reviewed?'Reviewed':'Review needed'}</div><div class="modal-actions">${z==='main'||z==='extra'?`<button class="btn btn-primary" data-add="${sanitize(key)}">+ Add to ${z==='main'?'Main':'Extra'} Deck</button>`:''}<button class="btn btn-outline" data-modal-close="1">Close</button></div>`;
 state.activeCard=key;$('card-modal').hidden=false;document.body.style.overflow='hidden';$('modal-close').focus();
 }
 function closeModal(){$('card-modal').hidden=true;document.body.style.overflow='';state.activeCard=null;}
 function renderBuilder(){const a=L.auditDeck(state.deck,state.cards,state.idx);
 $('deck-name').value=state.deck.name;
 const pane=$('audit-panel');pane.className='audit-panel '+a.status.toLowerCase();
 const headline=a.status==='LEGAL'?'✓ Validated for this ruleset':a.status==='ILLEGAL'?'✕ Deck is not CNR legal':'⚠ Review required before claiming legality';
 let issues=[...a.errors.slice(0,8),...a.reviews.slice(0,7)];if(a.errors.length+a.reviews.length>issues.length)issues.push('…and more issues');
 pane.innerHTML=`<h3>${headline}</h3><p>${a.totals.main} main · ${a.totals.extra} extra · ${a.totals.side} side. ${a.errors.length} errors, ${a.reviews.length} review items.</p>${issues.length?`<ul>${issues.map(s=>`<li>${sanitize(s)}</li>`).join('')}</ul>`:'<p>All structural, restriction, release and classification checks passed for these records.</p>'}`;
 for(const z of ['main','extra','side']){
  const list=state.deck.sections[z];$('zone-'+z).innerHTML=list.length?list.map(item=>{
   const c=details(item.key),v=L.checkCard(getCard(item.key),state.idx);
   return `<div class="zone-card"><span class="qty-pill">×${item.qty}</span><span class="zone-title">${sanitize(c.name)}</span><span class="zone-state ${verdictClass(v.status)}">${v.status}</span><div class="qty-ctrls"><button data-minus="${sanitize(item.key)}" data-zone="${z}" title="Remove one" aria-label="Remove one ${sanitize(c.name)}">−</button><button data-plus="${sanitize(item.key)}" data-zone="${z}" title="Add one" aria-label="Add one ${sanitize(c.name)}">+</button></div></div>`;
  }).join(''):'<div class="zone-empty">No cards yet — add cards from the database.</div>';
 }
 $('main-count').textContent=`${a.totals.main} / 40–60`;$('extra-count').textContent=`${a.totals.extra} / 20`;$('side-count').textContent=`${a.totals.side} / 0`;$('side-wrap').hidden=a.totals.side===0;
 }
 function renderLibrary(){const area=$('saved-decks');if(!state.library.length){area.innerHTML='<div class="empty-state"><strong>No saved deck versions</strong>Build a deck, select “Save version”, and it will appear here.</div>';return;}
 area.innerHTML=state.library.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(d=>{
 const a=L.auditDeck(d,state.cards,state.idx);
 return `<article class="saved-card"><div class="saved-date">${sanitize(new Date(d.updatedAt).toLocaleDateString())}</div><h3>${sanitize(d.name)}</h3><p>${a.totals.main} main · ${a.totals.extra} extra · ${a.totals.side} side</p><div class="card-meta"><span class="tag ${a.status==='ILLEGAL'?'BANNED':a.status}">${a.status}</span></div><div class="action-wrap"><button class="btn btn-primary small" data-load="${sanitize(d.id)}">Open deck</button><button class="btn btn-outline small" data-delete="${sanitize(d.id)}">Delete</button></div></article>`;
 }).join('');}
 function renderSyncDetails(){const meta=storage('cnr-sync-meta-v1',{});$('sync-details').textContent=meta.updatedAt?`${number(state.all.length)} cached cards. Last sync: ${new Date(meta.updatedAt).toLocaleString()}. Source: ${meta.source||'YGOPRODeck v7'}. This does not automatically update CNR restrictions.`:'Starter preview only. Select Sync database to download the full card feed. The feed and card artwork are separate.';$('rule-version').textContent=`Ruleset ${state.rules.ruleset_id} · card eligibility through ${state.rules.card_pool.include_released_through}`;}
 async function hydrateCatalog(){const saved=await CNRStore.getAll();indexCards(saved);showStats();renderCatalog();renderSyncDetails();}
 function makeAnnotations(seed){for(const c of seed.cards||[])state.annotations.set(L.nameKey(c.name),c);}
 async function boot(){try{
  const [rResp,sResp]=await Promise.all([fetch('./cnr_rules.json'),fetch('./catalog_seed.json')]);if(!rResp.ok||!sResp.ok)throw Error('Cannot load bundled rules');
  state.rules=await rResp.json();const seed=await sResp.json();state.idx=L.createIndex(state.rules);makeAnnotations(seed);
  state.deck=L.normalizeDeck(storage('cnr-current-v1',L.newDeck()));state.library=(storage('cnr-library-v1',[])||[]).slice(0,250).map(L.normalizeDeck);
  await CNRStore.open();if(await CNRStore.count()===0)await CNRStore.putMany(enrichSeed(seed));await hydrateCatalog();
  initEvents();$('online-text').textContent=navigator.onLine?'Online · offline-ready':'Offline mode';registerSW();
 }catch(e){console.error(e);$('results-caption').textContent='Failed to load app';$('card-results').innerHTML=`<div class="empty-state"><strong>App needs a web server</strong>Open this via GitHub Pages or localhost, not a direct file:// link. ${sanitize(e.message)}</div>`;}}
 function initEvents(){document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
 let typing; $('card-search').addEventListener('input',e=>{clearTimeout(typing);typing=setTimeout(()=>{state.query=e.target.value;state.page=0;renderCatalog();},180);});
 for(const [id,prop] of [['filter-type','type'],['filter-status','status'],['filter-sort','sort']])$(id).addEventListener('change',e=>{state[prop]=e.target.value;state.page=0;renderCatalog();});
 $('show-more').addEventListener('click',()=>{state.page++;renderCatalog();});
 $('card-results').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.add){e.stopPropagation();addCard(b.dataset.add);return;}if(b?.dataset.more){e.stopPropagation();showCard(b.dataset.more);return;}const box=e.target.closest('[data-open]');if(box)showCard(box.dataset.open);});
 $('card-results').addEventListener('keydown',e=>{if(e.target.matches('[data-open]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();showCard(e.target.dataset.open);}});
 $('modal-body').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.add){addCard(b.dataset.add);closeModal();}else if(b.dataset.modalClose)closeModal();});
 $('modal-close').addEventListener('click',closeModal);$('card-modal').addEventListener('click',e=>{if(e.target.id==='card-modal')closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('card-modal').hidden)closeModal();});
 $('builder-find').addEventListener('click',()=>view('discover'));$('deck-name').addEventListener('input',e=>{state.deck.name=e.target.value.slice(0,120);persist();});
 $('new-deck').addEventListener('click',()=>{if(!confirm('Start a new draft? Your current draft will be replaced. Use Save version first if you want to keep it.'))return;state.deck=L.newDeck();persist();showStats();renderBuilder();});
 $('save-deck').addEventListener('click',()=>{const d=L.cloneDeck(state.deck);d.id=String(Date.now())+'-'+Math.random().toString(36).slice(2,8);d.updatedAt=new Date().toISOString();state.library.push(d);saveLibrary();toast('Saved a new deck version');});
 for(const zone of ['main','extra','side'])$('zone-'+zone).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const key=b.dataset.plus||b.dataset.minus;L.editQty(state.deck,zone,key,b.dataset.plus?1:-1);persist();showStats();renderBuilder();});
 $('saved-decks').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.load){const d=state.library.find(x=>x.id===b.dataset.load);if(!d)return;state.deck=L.cloneDeck(d);state.deck.id='draft';persist();showStats();view('builder');toast('Saved deck loaded as editable draft');}else if(b.dataset.delete){if(!confirm('Delete this saved version?'))return;state.library=state.library.filter(x=>x.id!==b.dataset.delete);saveLibrary();renderLibrary();}});
 $('import-paste').addEventListener('click',()=>importText($('import-text').value));$('ydk-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{await importText(await f.text());}finally{e.target.value='';}});
 $('copy-ydke').addEventListener('click',async()=>{try{const str=L.toYDKE(state.deck,state.cards);if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(str);else{$('import-text').value=str;$('import-text').select();document.execCommand('copy');}toast('YDKE copied');}catch(e){toast(e.message);}});
 $('download-ydk').addEventListener('click',()=>{try{download(`${safeFilename(state.deck.name)}.ydk`,L.toYDK(state.deck,state.cards),'text/plain');toast('YDK downloaded');}catch(e){toast(e.message);}});
 $('backup-export').addEventListener('click',()=>download('cnrformat-deck-backup.json',JSON.stringify({format:'CNRFormat-Mobile-Backup-v1',saved:state.library,current:state.deck,exportedAt:new Date().toISOString()},null,2),'application/json'));
 $('backup-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>5e6)throw Error('Backup too large');const obj=JSON.parse(await f.text());if(obj.format!=='CNRFormat-Mobile-Backup-v1'||!Array.isArray(obj.saved))throw Error('Unsupported backup');if(!confirm('Replace saved decks and current draft with this backup?'))return;state.library=obj.saved.slice(0,250).map(L.normalizeDeck);state.deck=L.normalizeDeck(obj.current||L.newDeck());saveLibrary();persist();showStats();renderLibrary();toast('Backup restored');}catch(err){toast(err.message);}finally{e.target.value='';}});
 $('sync-full').addEventListener('click',()=>syncOnline());$('sync-shortcut').addEventListener('click',()=>{view('rules');syncOnline();});$('file-import-json').addEventListener('click',()=>$('api-file').click());$('api-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>100e6)throw Error('JSON file too large');await importApi(JSON.parse(await f.text()),null,'Imported JSON snapshot');}catch(err){toast('Import failed: '+err.message);}finally{e.target.value='';}});
 $('clear-data').addEventListener('click',async()=>{if(!confirm('Clear the full card database on this phone? Saved decks will remain, but cards may show as unknown until synced again.'))return;await CNRStore.clear();const resp=await fetch('./catalog_seed.json');const seed=await resp.json();await CNRStore.putMany(enrichSeed(seed));localStorage.removeItem('cnr-sync-meta-v1');await hydrateCatalog();toast('Database reset to starter cards');});
 window.addEventListener('online',()=>{$('online-text').textContent='Online · offline-ready';});window.addEventListener('offline',()=>{$('online-text').textContent='Offline mode';});
 }
 function safeFilename(s){return String(s).replace(/[^a-z0-9_-]+/gi,'_').slice(0,55)||'cnr_deck';}
 function download(name,body,type){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
 async function importText(value){try{if(!value.trim())throw Error('Paste a YDK list or YDKE link first');const ids=L.parseDeckText(value);if(!confirm('Replace the current draft with the imported deck?'))return;state.deck=L.deckFromIds(ids,state.byId,'Imported CNR Deck');persist();showStats();view('builder');toast('Deck imported — check the legality report');}catch(e){toast('Import failed: '+e.message);}}
 function setSync(text,fraction){$('sync-track').hidden=false;$('sync-details').textContent=text;$('sync-fill').style.width=`${Math.max(0,Math.min(100,Math.round((fraction||0)*100)))}%`;}
 async function importApi(payload,setCatalog,source){const list=Array.isArray(payload)?payload:payload?.data;
  if(!Array.isArray(list)||list.length<10)throw Error('Expected an API response containing at least 10 cards');
  const dates=new Map((Array.isArray(setCatalog)?setCatalog:[]).filter(x=>x?.set_name&&/^\d{4}-\d\d-\d\d/.test(x.tcg_date||'')).map(x=>[x.set_name,x.tcg_date.slice(0,10)]));
  setSync(`Processing ${number(list.length)} cards…`,.2);
  const cards=list.map(raw=>L.apiToCard(raw,state.annotations,dates,state.rules.card_pool.include_released_through)).filter(Boolean);
  if(cards.length!==list.length)throw Error('API returned malformed card records; import canceled');
  if(cards.length<1000 && source==='YGOPRODeck v7 live sync')throw Error('Unexpectedly small API response; import canceled');
  setSync(`Storing ${number(cards.length)} cards in offline database…`,.3);
  await CNRStore.putMany(cards,(done,total)=>setSync(`Saving cards ${number(done)} / ${number(total)}…`,.3+.65*done/total));
  localStorage.setItem('cnr-sync-meta-v1',JSON.stringify({source,updatedAt:new Date().toISOString(),count:cards.length}));
  await hydrateCatalog();renderBuilder();setSync(`✓ Synced ${number(cards.length)} cards. Classification review remains necessary.`,1);toast(`Cached ${number(cards.length)} cards for offline use`);
 }
 async function syncOnline(){if(state.syncing)return;if(!navigator.onLine){toast('Connect to the internet to sync');return;}
 state.syncing=true;$('sync-full').disabled=true;
 try{setSync('Checking YGOPRODeck card feed…',.03);
  let payload=null,sets=null,source='YGOPRODeck v7 live sync';
  try{
    const resp=await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php',{cache:'no-store'});
    if(!resp.ok)throw Error(`Card feed returned HTTP ${resp.status}`);
    setSync('Downloading full card information…',.1);payload=await resp.json();
    try{setSync('Checking TCG release dates…',.18);const r=await fetch('https://db.ygoprodeck.com/api/v7/cardsets.php',{cache:'no-store'});if(r.ok)sets=await r.json();}catch(e){console.warn('Set metadata unavailable',e);}
  }catch(externalError){
    console.warn('Direct API unavailable, trying published same-origin snapshot:',externalError);
    setSync('Direct API unavailable — trying site-hosted card snapshot…',.1);
    const resp=await fetch('./card_snapshot.json',{cache:'no-store'});
    if(!resp.ok)throw Error('Neither the live API nor the site-hosted snapshot is available');
    const snapshot=await resp.json();payload=snapshot;sets=snapshot.sets||null;source='GitHub Pages weekly card snapshot';
  }
  await importApi(payload,sets,source);
 }catch(e){console.error('Sync error',e);setSync(`Sync failed: ${e.message}. Existing card data was preserved. If your network blocks requests, import a downloaded cardinfo.php JSON file.`,0);toast('Sync failed; see details');}
 finally{state.syncing=false;$('sync-full').disabled=false;}
 }
 function registerSW(){if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline worker unavailable',e));}
 let deferredPrompt;
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('install-btn').hidden=false;});
 $('install-btn').addEventListener('click',async()=>{if(!deferredPrompt){toast('Use Chrome menu → Add to Home screen');return;}deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('install-btn').hidden=true;});
 await boot();
})();
